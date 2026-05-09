import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MAX_TOKENS = 200;
const DEFAULT_CONCURRENCY = 3;

export interface MapperLlmCallParams {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens?: number;
}

export interface MapperLlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// Tiny semaphore. Caps concurrent in-flight requests so we don't
// stress Anthropic's per-key rate limits during a full run
// (~54 modules). FIFO; resolved waiters get released in order.
export class Semaphore {
  private inFlight = 0;
  private readonly waiters: (() => void)[] = [];
  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.inFlight < this.limit) {
      this.inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.inFlight += 1;
  }

  release(): void {
    this.inFlight -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

export interface AnthropicClientOptions {
  apiKey?: string;
  concurrency?: number;
  // Test seam: lets the synthesize spec inject a mock without
  // needing to mock the SDK module itself.
  client?: Anthropic;
}

export class MapperAnthropicClient {
  private readonly anthropic: Anthropic;
  private readonly sem: Semaphore;

  constructor(opts: AnthropicClientOptions = {}) {
    if (opts.client) {
      this.anthropic = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY is not set. Provide it via env or pass --no-with-llm.',
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
