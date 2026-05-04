import { Injectable, Logger } from '@nestjs/common';
import { BasePhaseAgent } from './base-phase.agent';
import { PhaseEvalInput } from '../types/evaluation.types';
import { Phase } from '../../phase-tagger/types/phase.types';
import { PhaseEvaluationResult } from '../types/evaluation.types';
import { ChatRole } from '../../llm/constants';
import { LlmService } from '../../llm/services/llm.service';
import { RubricLoaderService } from '../services/rubric-loader.service';
import { buildPlanPrompt } from '../prompts/plan-prompt';
import { buildPlanEvalTool, SUBMIT_EVAL_TOOL_NAME } from '../prompts/plan-tool-schema';
import { parseEvalOutput, ParsedEvalOutput } from '../validators/parse-eval-output';
import { validateEvalToolArgs } from '../validators/validate-eval-tool-args';
import { validateEvidence } from '../validators/evidence-validator';
import { computeScore } from '../services/score-computer';

const PLAN_AGENT_MAX_TOKENS = 4096;

@Injectable()
export class PlanAgent extends BasePhaseAgent {
  protected readonly phase: Phase = 'plan';
  private readonly logger = new Logger(PlanAgent.name);

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
    const tool = buildPlanEvalTool(rubric);
    const { systemBlocks, userMessage, preprocessing } = buildPlanPrompt(rubric, input, {
      useTools: true,
    });

    this.logger.log(
      `Evaluating session ${input.session.id} (planMd=${input.planMd?.length ?? 0} chars, ` +
        `${input.snapshots.length} snapshots, ${input.hints.length} hints)`,
    );
    if (preprocessing.removedParagraphs > 0) {
      this.logger.log(
        `Stripped ${preprocessing.removedParagraphs} duplicate paragraph(s) ` +
          `from plan.md before LLM call (saved ${preprocessing.removedChars} chars)`,
      );
    }

    const llm = await this.llm.call(
      [{ role: ChatRole.User, content: userMessage }],
      {
        system: systemBlocks,
        maxTokens: PLAN_AGENT_MAX_TOKENS,
        // Deterministic verdicts: same plan + same rubric → same signals.
        temperature: 0,
        tools: [tool],
        toolChoice: { type: 'tool', name: SUBMIT_EVAL_TOOL_NAME },
        ...(input.model ? { model: input.model } : {}),
      },
    );

    this.logger.log(
      `LLM responded (model=${llm.modelUsed}, in=${llm.tokensIn}, out=${llm.tokensOut}, ` +
        `cacheWrite=${llm.cacheCreationTokens}, cacheRead=${llm.cacheReadTokens}, ` +
        `toolUse=${llm.toolUse ? llm.toolUse.name : 'none'})`,
    );

    const expectedSignalIds = new Set(rubric.signals.map((s) => s.id));
    let parsed: ParsedEvalOutput;
    let auditResponse: string;
    if (llm.toolUse && llm.toolUse.name === SUBMIT_EVAL_TOOL_NAME) {
      parsed = validateEvalToolArgs(llm.toolUse.input, expectedSignalIds);
      auditResponse = JSON.stringify(llm.toolUse.input, null, 2);
    } else {
      parsed = parseEvalOutput(llm.text);
      auditResponse = llm.text;
    }

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

    const renderedPrompt =
      systemBlocks.map((b) => b.text).join('\n\n') +
      '\n\n---\n\n' +
      userMessage +
      `\n\n[tool: ${tool.name}]\n${JSON.stringify(tool.inputSchema, null, 2)}`;

    return {
      phase: this.phase,
      score: computed.score,
      signalResults: workingSignals,
      feedbackText: parsed.feedback,
      topActionableItems: parsed.topActions,
      audit: {
        prompt: renderedPrompt,
        rawResponse: auditResponse,
        modelUsed: llm.modelUsed,
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
        cacheReadTokens: llm.cacheReadTokens,
        cacheCreationTokens: llm.cacheCreationTokens,
      },
    };
  }
}
