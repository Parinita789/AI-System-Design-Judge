import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicClientService } from './anthropic-client.service';
import { OllamaClientService, OllamaChatMessage } from './ollama-client.service';
import { ClaudeCliClientService } from './claude-cli-client.service';
import { ChatMessage, LlmCallOptions, LlmResponse, SystemBlock } from '../models/llm.types';
import { ChatRole, LLM_ENV } from '../constants';

function requireEnv(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) throw new Error(`${key} is not set in environment`);
  return value;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly anthropic: AnthropicClientService,
    private readonly ollama: OllamaClientService,
    private readonly claudeCli: ClaudeCliClientService,
    private readonly config: ConfigService,
  ) {}

  async call(messages: ChatMessage[], opts: LlmCallOptions = {}): Promise<LlmResponse> {
    // Explicit provider override wins over the URL-presence heuristic.
    if (this.config.get<string>(LLM_ENV.LLM_PROVIDER) === 'claude_cli') {
      return this.callClaudeCli(messages, opts);
    }
    if (this.config.get<string>(LLM_ENV.OLLAMA_BASE_URL)) {
      return this.callOllama(messages, opts);
    }
    return this.callAnthropic(messages, opts);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Anthropic path

  private async callAnthropic(
    messages: ChatMessage[],
    opts: LlmCallOptions,
  ): Promise<LlmResponse> {
    const model = opts.model ?? requireEnv(this.config, LLM_ENV.LLM_MODEL);
    const maxTokens =
      opts.maxTokens ?? parseInt(requireEnv(this.config, LLM_ENV.LLM_MAX_TOKENS), 10);

    const systemParam = this.buildAnthropicSystem(opts.system);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(systemParam !== undefined ? { system: systemParam } : {}),
    };

    const result = await this.anthropic.createMessage(params);

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
  private buildAnthropicSystem(
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

  // ────────────────────────────────────────────────────────────────────────
  // Ollama path (dev/local)

  private async callOllama(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse> {
    const model = opts.model ?? requireEnv(this.config, LLM_ENV.OLLAMA_MODEL);

    const ollamaMessages: OllamaChatMessage[] = [];
    const systemText = this.flattenSystemForOllama(opts.system);
    if (systemText) {
      ollamaMessages.push({ role: ChatRole.System, content: systemText });
    }
    for (const m of messages) {
      ollamaMessages.push({ role: m.role, content: m.content });
    }

    const result = await this.ollama.chat({
      model,
      messages: ollamaMessages,
      options: opts.maxTokens ? { num_predict: opts.maxTokens } : undefined,
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

  private flattenSystemForOllama(system: LlmCallOptions['system']): string | undefined {
    if (!system) return undefined;
    if (typeof system === 'string') return system;
    return system.map((b) => b.text).join('\n\n');
  }

  // ────────────────────────────────────────────────────────────────────────
  // Claude CLI path (`claude -p`) — dev/testing only. Uses the user's
  // logged-in Claude Code account; no API key required. The CLI is a single
  // prompt-in / text-out interface, so we flatten system + messages into one
  // prompt string and lose role separation.

  private async callClaudeCli(
    messages: ChatMessage[],
    opts: LlmCallOptions,
  ): Promise<LlmResponse> {
    const systemText = this.flattenSystemForOllama(opts.system) ?? '';
    const conversation = messages
      .map((m) => `${m.role === ChatRole.User ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    const prompt = systemText
      ? `${systemText}\n\n---\n\n${conversation}`
      : conversation;

    const result = await this.claudeCli.run(prompt);
    if (!result.text) {
      this.logger.warn('claude CLI returned empty stdout');
    }
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
