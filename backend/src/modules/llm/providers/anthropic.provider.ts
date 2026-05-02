import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicClientService } from '../services/anthropic-client.service';
import { ChatMessage, LlmCallOptions, LlmResponse, SystemBlock } from '../types/llm.types';
import { LLM_ENV } from '../constants';
import { LlmProvider } from './llm-provider.interface';

function requireEnv(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) throw new Error(`${key} is not set in environment`);
  return value;
}

@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly client: AnthropicClientService,
    private readonly config: ConfigService,
  ) {}

  async call(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse> {
    const model = opts.model ?? requireEnv(this.config, LLM_ENV.LLM_MODEL);
    const maxTokens =
      opts.maxTokens ?? parseInt(requireEnv(this.config, LLM_ENV.LLM_MAX_TOKENS), 10);

    const systemParam = this.buildSystem(opts.system);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(systemParam !== undefined ? { system: systemParam } : {}),
    };

    const result = await this.client.createMessage(params);

    const text = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const usage = result.usage as Anthropic.Usage & {
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };

    return {
      text,
      modelUsed: result.model,
      tokensIn: usage.input_tokens,
      tokensOut: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    };
  }

  // For arrays, mark only the LAST cacheable block with cache_control —
  // that breakpoint caches everything (tools + earlier blocks) before it.
  private buildSystem(
    system: LlmCallOptions['system'],
  ): string | Anthropic.TextBlockParam[] | undefined {
    if (system === undefined) return undefined;
    if (typeof system === 'string') return system;

    let lastCacheableIdx = -1;
    system.forEach((b, i) => {
      if (b.cacheable) lastCacheableIdx = i;
    });

    return system.map<Anthropic.TextBlockParam>((b: SystemBlock, i) => ({
      type: 'text',
      text: b.text,
      ...(i === lastCacheableIdx ? { cache_control: { type: 'ephemeral' } } : {}),
    }));
  }
}
