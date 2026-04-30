import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatRole, LLM_ENV, OLLAMA_REQUEST_TIMEOUT_MS } from '../constants';

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

@Injectable()
export class OllamaClientService {
  private readonly logger = new Logger(OllamaClientService.name);

  constructor(private readonly config: ConfigService) {}

  async chat(params: {
    model: string;
    messages: OllamaChatMessage[];
    options?: Record<string, unknown>;
  }): Promise<OllamaChatResponse> {
    const baseUrl = this.config.get<string>(LLM_ENV.OLLAMA_BASE_URL);
    if (!baseUrl) throw new Error(`${LLM_ENV.OLLAMA_BASE_URL} is not set`);

    const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
    this.logger.log(`POST ${url} (model=${params.model}, msgs=${params.messages.length})`);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OLLAMA_REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, stream: false }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama API error ${res.status}: ${errText.slice(0, 500)}`);
      }
      return (await res.json()) as OllamaChatResponse;
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        throw new Error(
          `Ollama request timed out after ${OLLAMA_REQUEST_TIMEOUT_MS}ms (${url})`,
        );
      }
      const msg = (err as Error).message ?? String(err);
      throw new Error(`Ollama request to ${url} failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
