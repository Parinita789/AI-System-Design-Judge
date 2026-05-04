import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicClientService } from '../services/anthropic-client.service';
import {
  ChatMessage,
  LlmCallOptions,
  LlmResponse,
  SystemBlock,
  ToolChoice,
  ToolDefinition,
  ToolUsePayload,
} from '../types/llm.types';
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
  readonly supportsToolUse = true;

  constructor(
    private readonly client: AnthropicClientService,
    private readonly config: ConfigService,
  ) {}

  async call(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse> {
    const model = opts.model ?? requireEnv(this.config, LLM_ENV.LLM_MODEL);
    const maxTokens =
      opts.maxTokens ?? parseInt(requireEnv(this.config, LLM_ENV.LLM_MAX_TOKENS), 10);

    const systemParam = this.buildSystem(opts.system);
    const toolsParam = opts.tools ? toAnthropicTools(opts.tools) : undefined;
    const toolChoiceParam = opts.toolChoice ? toAnthropicToolChoice(opts.toolChoice) : undefined;

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      ...(systemParam !== undefined ? { system: systemParam } : {}),
      ...(toolsParam !== undefined ? { tools: toolsParam } : {}),
      ...(toolChoiceParam !== undefined ? { tool_choice: toolChoiceParam } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    };

    const result = await this.client.createMessage(params);

    const text = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const toolUseBlock = result.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    const toolUse: ToolUsePayload | undefined = toolUseBlock
      ? { name: toolUseBlock.name, input: toolUseBlock.input }
      : undefined;

    const usage = result.usage as Anthropic.Usage & {
      cache_creation_input_tokens?: number | null;
      cache_read_input_tokens?: number | null;
    };

    return {
      text,
      ...(toolUse ? { toolUse } : {}),
      modelUsed: result.model,
      tokensIn: usage.input_tokens,
      tokensOut: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    };
  }

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

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));
}

function toAnthropicToolChoice(choice: ToolChoice): Anthropic.MessageCreateParams['tool_choice'] {
  switch (choice.type) {
    case 'auto':
      return { type: 'auto' };
    case 'any':
      return { type: 'any' };
    case 'tool':
      return { type: 'tool', name: choice.name };
  }
}
