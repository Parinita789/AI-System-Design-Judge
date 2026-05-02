import { ChatRole } from '../constants';

export interface ChatMessage {
  role: ChatRole.User | ChatRole.Assistant;
  content: string;
}

export interface SystemBlock {
  text: string;
  cacheable?: boolean;
}

export interface LlmCallOptions {
  model?: string;
  maxTokens?: number;
  system?: string | SystemBlock[];
}

export interface LlmResponse {
  text: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}
