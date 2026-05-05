import { Injectable, Logger } from '@nestjs/common';
import { ChatRole } from '../../llm/constants';
import { LlmService } from '../../llm/services/llm.service';
import { buildMentorPrompt, flattenForAudit } from '../prompts/mentor-prompt';
import { MentorInput, MentorResult } from '../types/mentor.types';

const MENTOR_AGENT_MAX_TOKENS = 4096;

@Injectable()
export class MentorAgent {
  private readonly logger = new Logger(MentorAgent.name);

  constructor(private readonly llm: LlmService) {}

  async generate(input: MentorInput): Promise<MentorResult> {
    const built = buildMentorPrompt(input);
    const renderedPrompt = flattenForAudit(built);

    this.logger.log(
      `Generating mentor artifact for eval ${input.evaluationId} ` +
        `(planMd=${input.planMd?.length ?? 0} chars, ` +
        `signals=${Object.keys(input.signalResults).length})`,
    );

    const llmStart = Date.now();
    const response = await this.llm.call(
      [{ role: ChatRole.User, content: built.userMessage }],
      {
        system: built.systemBlocks,
        maxTokens: MENTOR_AGENT_MAX_TOKENS,
        // Deterministic mentor voice: same plan + same eval should reflect
        // the same way. Lets us A/B prompt edits without sampling variance.
        temperature: 0,
        ...(input.model ? { model: input.model } : {}),
      },
    );
    const latencyMs = Date.now() - llmStart;

    // Token counts go on the audit for both the in-process logger and
    // the persisted DB row. Logged loudly so failures or surprising
    // sizes are visible without tailing audit rows.
    this.logger.log(
      `Mentor artifact ready in ${latencyMs}ms ` +
        `(model=${response.modelUsed}, in=${response.tokensIn}, ` +
        `out=${response.tokensOut}, cacheWrite=${response.cacheCreationTokens}, ` +
        `cacheRead=${response.cacheReadTokens})`,
    );

    return {
      artifact: { content: (response.text ?? '').trim() },
      renderedPrompt,
      audit: {
        modelUsed: response.modelUsed,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        cacheReadTokens: response.cacheReadTokens,
        cacheCreationTokens: response.cacheCreationTokens,
        latencyMs,
      },
    };
  }
}
