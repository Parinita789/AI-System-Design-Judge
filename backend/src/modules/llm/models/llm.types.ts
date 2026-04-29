export interface LlmCallOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LlmResponse {
  text: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
}
