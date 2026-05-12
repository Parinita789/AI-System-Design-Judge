// Shared types + interface so the rest of the LLM layer can talk to
// either CriticAnthropicClient (SDK) or CriticClaudeCliClient (spawns
// `claude -p`) interchangeably.
//
// Differs from agents/packages/mapper/src/llm/llm-client.ts in one place: the
// CallParams carry an optional `tool` spec + `toolChoice`. When set,
// the SDK client forces tool_use and returns the parsed input as
// `toolInput`. The CLI client can't force tools, so it instructs the
// model to emit JSON between <json> fences and parses post-hoc.

export interface CriticToolSpec {
  name: string;
  description: string;
  // Anthropic tool input_schema — JSON Schema object. We don't tighten
  // the type here; tool-schemas.ts is the source of truth for each
  // phase's exact shape.
  inputSchema: Record<string, unknown>;
}

export interface CriticLlmCallParams {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens?: number;
  // When set + toolChoice === 'force', the SDK is told to emit this
  // tool. The CLI fallback inlines the schema in the user prompt and
  // parses JSON from <json> fences.
  tool?: CriticToolSpec;
  toolChoice?: 'force' | 'auto';
}

export interface CriticLlmResponse {
  // For tool-use calls, `text` is JSON.stringify(toolInput). For
  // plain calls, it's the model's text output. Callers that want the
  // structured object should read `toolInput`.
  text: string;
  toolInput?: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface CriticLlmClient {
  call(params: CriticLlmCallParams): Promise<CriticLlmResponse>;
}

// Tiny FIFO semaphore. Same shape as the mapper's; caps concurrent
// in-flight requests so a full run doesn't stress upstream rate
// limits (SDK) or the user's CPU (CLI mode).
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
