import { Injectable, Logger } from '@nestjs/common';
import { ClaudeCliClientService } from '../services/claude-cli-client.service';
import { ChatMessage, LlmCallOptions, LlmResponse } from '../models/llm.types';
import { ChatRole } from '../constants';
import { LlmProvider } from './llm-provider.interface';
import { flattenSystem } from './ollama.provider';

// Dev/testing only. Uses the user's logged-in Claude Code account; no API
// key required. The CLI is single-prompt-in / text-out, so we flatten
// system + messages into one prompt string and lose role separation.
@Injectable()
export class ClaudeCliProvider implements LlmProvider {
  readonly name = 'claude_cli';
  private readonly logger = new Logger(ClaudeCliProvider.name);

  constructor(private readonly client: ClaudeCliClientService) {}

  async call(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse> {
    const systemText = flattenSystem(opts.system) ?? '';
    const conversation = messages
      .map((m) => `${m.role === ChatRole.User ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    const prompt = systemText ? `${systemText}\n\n---\n\n${conversation}` : conversation;

    // Forward the per-call model override (if any) so the CLI picker on
    // the frontend reaches the binary as `--model <id>`. Without an
    // override, the CLI uses whatever model is configured in the user's
    // Claude Code setup.
    const result = await this.client.run(prompt, opts.model);
    if (!result.text) this.logger.warn('claude CLI returned empty stdout');

    return {
      text: result.text,
      modelUsed: result.model,
      tokensIn: 0, // CLI doesn't expose token counts
      tokensOut: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
  }
}
