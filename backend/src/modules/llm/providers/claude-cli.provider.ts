import { Injectable, Logger } from '@nestjs/common';
import { ClaudeCliClientService } from '../services/claude-cli-client.service';
import { ChatMessage, LlmCallOptions, LlmResponse } from '../types/llm.types';
import { ChatRole } from '../constants';
import { LlmProvider } from './llm-provider.interface';
import { flattenSystem } from './ollama.provider';

// Uses the user's logged-in Claude Code account; no API key required.
// The CLI is single-prompt-in / text-out, so system + messages are
// flattened into one prompt string and role separation is lost.
@Injectable()
export class ClaudeCliProvider implements LlmProvider {
  readonly name = 'claude_cli';
  readonly supportsToolUse = false;
  private readonly logger = new Logger(ClaudeCliProvider.name);

  constructor(private readonly client: ClaudeCliClientService) {}

  async call(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse> {
    const systemText = flattenSystem(opts.system) ?? '';
    const conversation = messages
      .map((m) => `${m.role === ChatRole.User ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    const prompt = systemText ? `${systemText}\n\n---\n\n${conversation}` : conversation;

    const result = await this.client.run(prompt, opts.model);
    if (!result.text) this.logger.warn('claude CLI returned empty stdout');

    return {
      text: result.text,
      modelUsed: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      cacheCreationTokens: result.cacheCreationTokens,
      cacheReadTokens: result.cacheReadTokens,
    };
  }
}
