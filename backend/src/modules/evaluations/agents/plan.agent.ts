import { Injectable, Logger } from '@nestjs/common';
import { BasePhaseAgent, PhaseEvalInput } from './base-phase.agent';
import { Phase } from '../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../models/evaluation.types';
import { ChatRole } from '../../llm/constants';
import { LlmService } from '../../llm/services/llm.service';
import { RubricLoaderService } from '../services/rubric-loader.service';
import { buildPlanPrompt } from '../prompts/plan-prompt';
import { parseEvalOutput } from '../validators/parse-eval-output';
import { validateEvidence } from '../validators/evidence-validator';
import { computeScore } from '../services/score-computer';

const PLAN_AGENT_MAX_TOKENS = 4096;

@Injectable()
export class PlanAgent extends BasePhaseAgent {
  protected readonly phase: Phase = 'plan';
  private readonly logger = new Logger(PlanAgent.name);

  // Explicit constructor — without it, Nest's DI doesn't emit param
  // metadata for this subclass and llm/rubricLoader arrive undefined.
  constructor(llm: LlmService, rubricLoader: RubricLoaderService) {
    super(llm, rubricLoader);
  }

  async evaluate(input: PhaseEvalInput): Promise<PhaseEvaluationResult> {
    const rubric = await this.rubricLoader.load(
      input.rubricVersion,
      'plan',
      input.mode ?? undefined,
      input.seniority ?? undefined,
    );
    const { systemBlocks, userMessage } = buildPlanPrompt(rubric, input);

    this.logger.log(
      `Evaluating session ${input.session.id} (planMd=${input.planMd?.length ?? 0} chars, ` +
        `${input.snapshots.length} snapshots, ${input.hints.length} hints)`,
    );

    const llm = await this.llm.call(
      [{ role: ChatRole.User, content: userMessage }],
      {
        system: systemBlocks,
        maxTokens: PLAN_AGENT_MAX_TOKENS,
        ...(input.model ? { model: input.model } : {}),
      },
    );

    this.logger.log(
      `LLM responded (model=${llm.modelUsed}, in=${llm.tokensIn}, out=${llm.tokensOut}, ` +
        `cacheWrite=${llm.cacheCreationTokens}, cacheRead=${llm.cacheReadTokens})`,
    );

    const parsed = parseEvalOutput(llm.text);

    const validated = validateEvidence(parsed.signals, input.planMd, input.hints);
    if (validated.downgraded.length > 0) {
      this.logger.warn(
        `Evidence validator downgraded ${validated.downgraded.length} signal(s) ` +
          `with unverifiable quotes: ${validated.downgraded.join(', ')}`,
      );
    }
    const workingSignals = validated.signals;

    const computed = computeScore(rubric, workingSignals);
    if (Math.abs(computed.score - parsed.score) >= 1) {
      this.logger.warn(
        `LLM score ${parsed.score} disagreed with deterministic score ${computed.score} ` +
          `(ratio=${computed.ratio.toFixed(2)}, good=${computed.goodScore.toFixed(1)}/${computed.maxScore}, ` +
          `bad=${computed.badDeductions.toFixed(1)}, highWeightMissed=[${computed.highWeightGoodMissed.join(',')}]). ` +
          `Using deterministic score.`,
      );
    }

    // Separator matches the flatten-style providers so rebuilding from
    // this column alone reproduces the exact LLM input.
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
