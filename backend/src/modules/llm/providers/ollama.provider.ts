import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OllamaClientService } from '../services/ollama-client.service';
import { OllamaChatMessage } from '../types/ollama.types';
import { ChatMessage, LlmCallOptions, LlmResponse } from '../types/llm.types';
import { ChatRole, LLM_ENV } from '../constants';
import { LlmProvider } from './llm-provider.interface';

function requireEnv(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) throw new Error(`${key} is not set in environment`);
  return value;
}

@Injectable()
export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';
  private readonly logger = new Logger(OllamaProvider.name);

  constructor(
    private readonly client: OllamaClientService,
    private readonly config: ConfigService,
  ) {}

  async call(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse> {
    const model = opts.model ?? requireEnv(this.config, LLM_ENV.OLLAMA_MODEL);

    const ollamaMessages: OllamaChatMessage[] = [];
    const systemText = flattenSystem(opts.system);
    if (systemText) {
      ollamaMessages.push({ role: ChatRole.System, content: systemText });
    }
    for (const m of messages) {
      ollamaMessages.push({ role: m.role, content: m.content });
    }

    const ollamaOptions: Record<string, unknown> = {};
    if (opts.maxTokens !== undefined) ollamaOptions.num_predict = opts.maxTokens;
    if (opts.temperature !== undefined) ollamaOptions.temperature = opts.temperature;

    const result = await this.client.chat({
      model,
      messages: ollamaMessages,
      options: Object.keys(ollamaOptions).length > 0 ? ollamaOptions : undefined,
    });

    if (!result.message?.content) {
      this.logger.warn(`Ollama returned empty content for model ${model}`);
    }

    return {
      text: result.message?.content ?? '',
      modelUsed: result.model ?? model,
      tokensIn: result.prompt_eval_count ?? 0,
      tokensOut: result.eval_count ?? 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
  }
}

// Shared with ClaudeCliProvider — both providers flatten structured system
// blocks into a single string since neither supports prompt caching.
export function flattenSystem(system: LlmCallOptions['system']): string | undefined {
  if (!system) return undefined;
  if (typeof system === 'string') return system;
  return system.map((b) => b.text).join('\n\n');
}
