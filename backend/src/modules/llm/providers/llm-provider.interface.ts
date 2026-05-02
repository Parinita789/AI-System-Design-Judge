import { ChatMessage, LlmCallOptions, LlmResponse } from '../types/llm.types';

export interface LlmProvider {
  readonly name: string;
  call(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse>;
}
