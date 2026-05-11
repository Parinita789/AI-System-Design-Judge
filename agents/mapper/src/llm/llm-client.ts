// Shared types + interface so the rest of the LLM layer (synthesize,
// run) can talk to either MapperAnthropicClient (SDK) or
// MapperClaudeCliClient (spawns `claude -p`) interchangeably.

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

export interface MapperLlmClient {
  call(params: MapperLlmCallParams): Promise<MapperLlmResponse>;
}

// Tiny FIFO semaphore. Caps concurrent in-flight requests so a full
// run doesn't stress the upstream (Anthropic per-key rate limits in
// SDK mode; the user's local CPU + claude binary in CLI mode).
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
