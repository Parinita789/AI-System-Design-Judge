import { ChatMessage, LlmCallOptions, LlmResponse } from '../models/llm.types';

// Strategy contract every concrete LLM provider must satisfy. The factory
// returns one of these; callers (LlmService) program against this interface
// only, so adding a new provider doesn't touch dispatch code.
export interface LlmProvider {
  readonly name: string;
  call(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse>;
}
