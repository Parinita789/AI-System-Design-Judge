import { Injectable, Logger } from '@nestjs/common';
import { BasePhaseAgent, PhaseEvalInput } from './base-phase.agent';
import { Phase } from '../../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../../models/evaluation.types';
import { ChatRole } from '../../../llm/constants';
import { LlmService } from '../../../llm/services/llm.service';
import { RubricLoaderService } from '../rubric-loader.service';
import { buildPlanPrompt } from './plan-prompt';
import { parseEvalOutput } from './parse-eval-output';
import { applyAIRelevanceGate, applyModeBBuildExecutionGate } from './relevance-gate';
import { computeScore } from '../score-computer';

const PLAN_AGENT_MAX_TOKENS = 4096;

@Injectable()
export class PlanAgent extends BasePhaseAgent {
  protected readonly phase: Phase = 'plan';
  private readonly logger = new Logger(PlanAgent.name);

  // Explicit constructor so Nest's DI emits param metadata on this class.
  // Without it, the abstract base's constructor signature is invisible to DI
  // and `rubricLoader`/`llm` arrive as undefined at runtime.
  constructor(llm: LlmService, rubricLoader: RubricLoaderService) {
    super(llm, rubricLoader);
  }

  async evaluate(input: PhaseEvalInput): Promise<PhaseEvaluationResult> {
    const rubric = await this.rubricLoader.load(input.rubricVersion, 'plan');
    const { systemBlocks, userMessage } = buildPlanPrompt(rubric, input);

    this.logger.log(
      `Evaluating session ${input.session.id} (planMd=${input.planMd?.length ?? 0} chars, ` +
        `${input.snapshots.length} snapshots, ${input.hints.length} hints)`,
    );

    const llm = await this.llm.call(
      [{ role: ChatRole.User, content: userMessage }],
      { system: systemBlocks, maxTokens: PLAN_AGENT_MAX_TOKENS },
    );

    this.logger.log(
      `LLM responded (model=${llm.modelUsed}, in=${llm.tokensIn}, out=${llm.tokensOut}, ` +
        `cacheWrite=${llm.cacheCreationTokens}, cacheRead=${llm.cacheReadTokens})`,
    );

    const parsed = parseEvalOutput(llm.text);

    // Deterministic relevance backstops. The prompt asks the model to do
    // these checks; these gates guarantee them when the model ignores it.
    //   1. AI gate: skip AI signals on non-AI questions.
    //   2. Mode-B gate: skip build/validation BAD signals on production-
    //      scale questions that obviously can't be built in 2 hours.
    let workingSignals = parsed.signals;
    const aiGate = applyAIRelevanceGate(input.session.prompt, workingSignals);
    workingSignals = aiGate.results;
    if (aiGate.gated.length > 0) {
      this.logger.log(
        `Relevance gate auto-skipped ${aiGate.gated.length} AI signal(s) on ` +
          `non-AI question: ${aiGate.gated.join(', ')}`,
      );
    }
    const modeBGate = applyModeBBuildExecutionGate(input.session.prompt, workingSignals);
    workingSignals = modeBGate.results;
    if (modeBGate.gated.length > 0) {
      this.logger.log(
        `Mode-B gate auto-skipped ${modeBGate.gated.length} build/validation ` +
          `bad signal(s) on production-scale question: ${modeBGate.gated.join(', ')}`,
      );
    }

    // Deterministic score recomputation. The LLM's emitted `score` is
    // unreliable — it pattern-matches against the qualitative anchor
    // scenarios instead of computing the threshold-table ratio, so a
    // plan with strong signals can still get score=1 if the model
    // "feels" it should. Recomputing from post-gate signals using the
    // exact algorithm in scoring.computation eliminates that drift.
    // The LLM's original score is preserved in the audit row's
    // rawResponse for comparison.
    const computed = computeScore(rubric, workingSignals);
    if (Math.abs(computed.score - parsed.score) >= 1) {
      this.logger.warn(
        `LLM score ${parsed.score} disagreed with deterministic score ${computed.score} ` +
          `(ratio=${computed.ratio.toFixed(2)}, good=${computed.goodScore.toFixed(1)}/${computed.maxScore}, ` +
          `bad=${computed.badDeductions.toFixed(1)}, highWeightMissed=[${computed.highWeightGoodMissed.join(',')}]). ` +
          `Using deterministic score.`,
      );
    }

    // Render the prompt to a single string so it persists as the audit
    // record. Separator matches what flatten-style providers produce, so
    // rebuilding from this column alone reproduces the exact LLM input.
    const renderedPrompt =
      systemBlocks.map((b) => b.text).join('\n\n') + '\n\n---\n\n' + userMessage;

    return {
      phase: this.phase,
      score: computed.score,
      signalResults: workingSignals,
      feedbackText: parsed.feedback,
      topActionableItems: parsed.topActions,
      audit: {
        prompt: renderedPrompt,
        rawResponse: llm.text,
        modelUsed: llm.modelUsed,
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
        cacheReadTokens: llm.cacheReadTokens,
        cacheCreationTokens: llm.cacheCreationTokens,
      },
    };
  }
}
