import { ChatRole } from '../constants';

export interface OllamaChatMessage {
  role: ChatRole;
  content: string;
}

export interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  prompt_eval_count?: number;
  eval_count?: number;
  done: boolean;
}
