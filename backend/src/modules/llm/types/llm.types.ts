import { ChatRole } from '../constants';

export interface ChatMessage {
  role: ChatRole.User | ChatRole.Assistant;
  content: string;
}

export interface SystemBlock {
  text: string;
  cacheable?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string };

export interface LlmCallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string | SystemBlock[];
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
}

export interface ToolUsePayload {
  name: string;
  input: unknown;
}

export interface LlmResponse {
  text: string;
  toolUse?: ToolUsePayload;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}
