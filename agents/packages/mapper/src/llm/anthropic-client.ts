import Anthropic from '@anthropic-ai/sdk';
import {
  MapperLlmCallParams,
  MapperLlmClient,
  MapperLlmResponse,
  Semaphore,
} from './llm-client';

const DEFAULT_MAX_TOKENS = 200;
const DEFAULT_CONCURRENCY = 3;

export interface AnthropicClientOptions {
  apiKey?: string;
  concurrency?: number;
  // Test seam: lets specs inject a mock without needing to mock
  // the SDK module itself.
  client?: Anthropic;
}

export class MapperAnthropicClient implements MapperLlmClient {
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

  async call(params: MapperLlmCallParams): Promise<MapperLlmResponse> {
    await this.sem.acquire();
    try {
      // Construct the system block via spread so the SDK's
      // TextBlockParam excess-property check doesn't reject the
      // (valid, documented) cache_control field. Same pattern the
      // backend AnthropicProvider uses.
      const systemBlock: Anthropic.TextBlockParam = {
        type: 'text',
        text: params.systemPrompt,
        ...({ cache_control: { type: 'ephemeral' } } as Record<string, unknown>),
      };
      const response = await this.anthropic.messages.create({
        model: params.model,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: [systemBlock],
        messages: [{ role: 'user', content: params.userPrompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      const usage = response.usage as Anthropic.Usage & {
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      };

      return {
        text,
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

// Re-export the types/interface for callers that imported them
// from here historically.
export type { MapperLlmCallParams, MapperLlmResponse, MapperLlmClient };
export { Semaphore };
