import { ChatMessage, LlmCallOptions, LlmResponse } from '../types/llm.types';

export interface LlmProvider {
  readonly name: string;
  // True when the provider returns structured tool_use blocks honoring
  // opts.tools/opts.toolChoice. Callers use this to decide whether to
  // build the tool-call prompt + tool schema or fall back to JSON-in-prose.
  readonly supportsToolUse: boolean;
  call(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse>;
}
