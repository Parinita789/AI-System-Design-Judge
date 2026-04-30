import { Injectable, Logger } from '@nestjs/common';
import { BasePhaseAgent, PhaseEvalInput } from './base-phase.agent';
import { Phase } from '../../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../../models/evaluation.types';
import { ChatRole } from '../../../llm/constants';
import { LlmService } from '../../../llm/services/llm.service';
import { RubricLoaderService } from '../rubric-loader.service';
import { buildPlanPrompt } from './plan-prompt';
import { parseEvalOutput } from './parse-eval-output';

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

    return {
      phase: this.phase,
      score: parsed.score,
      signalResults: parsed.signals,
      feedbackText: parsed.feedback,
      topActionableItems: parsed.topActions,
    };
  }
}
