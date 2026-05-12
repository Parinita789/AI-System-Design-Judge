import Anthropic from '@anthropic-ai/sdk';
import {
  CriticLlmCallParams,
  CriticLlmClient,
  CriticLlmResponse,
  Semaphore,
} from './llm-client';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_CONCURRENCY = 3;

export interface AnthropicClientOptions {
  apiKey?: string;
  concurrency?: number;
  // Test seam: lets specs inject a mock without mocking the SDK
  // module itself.
  client?: Anthropic;
}

export class CriticAnthropicClient implements CriticLlmClient {
  private readonly anthropic: Anthropic;
  private readonly sem: Semaphore;

  constructor(opts: AnthropicClientOptions = {}) {
    if (opts.client) {
      this.anthropic = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY is not set. Provide it via env or use --provider=claude-cli.',
        );
      }
      this.anthropic = new Anthropic({ apiKey });
    }
    this.sem = new Semaphore(opts.concurrency ?? DEFAULT_CONCURRENCY);
  }

  async call(params: CriticLlmCallParams): Promise<CriticLlmResponse> {
    await this.sem.acquire();
    try {
      // Cache the system block (persona + rubric) across all calls
      // in a run. Same trick the mapper uses to keep the
      // TextBlockParam excess-property check happy with cache_control.
      const systemBlock: Anthropic.TextBlockParam = {
        type: 'text',
        text: params.systemPrompt,
        ...({ cache_control: { type: 'ephemeral' } } as Record<string, unknown>),
      };

      const baseRequest: Anthropic.MessageCreateParamsNonStreaming = {
        model: params.model,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: [systemBlock],
        messages: [{ role: 'user', content: params.userPrompt }],
      };

      // Forced tool use: tell the SDK to emit exactly this tool. We
      // get back a tool_use block whose `input` is the validated
      // JSON object matching the schema.
      const request: Anthropic.MessageCreateParamsNonStreaming =
        params.tool && params.toolChoice === 'force'
          ? {
              ...baseRequest,
              tools: [
                {
                  name: params.tool.name,
                  description: params.tool.description,
                  input_schema: params.tool
                    .inputSchema as unknown as Anthropic.Tool.InputSchema,
                },
              ],
              tool_choice: { type: 'tool', name: params.tool.name },
            }
          : baseRequest;

      const response = await this.anthropic.messages.create(request);

      const textBlocks = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      const toolUseBlock = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const usage = response.usage as Anthropic.Usage & {
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      };

      const toolInput = toolUseBlock?.input as Record<string, unknown> | undefined;

      return {
        text: toolInput ? JSON.stringify(toolInput) : textBlocks,
        toolInput,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      };
    } finally {
      this.sem.release();
    }
  }
}

export type { CriticLlmCallParams, CriticLlmResponse, CriticLlmClient };
export { Semaphore };
