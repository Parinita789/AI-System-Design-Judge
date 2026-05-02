import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_ENV } from '../constants';
import { LlmProvider } from './llm-provider.interface';
import { AnthropicProvider } from './anthropic.provider';
import { OllamaProvider } from './ollama.provider';
import { ClaudeCliProvider } from './claude-cli.provider';

// Selection priority:
//   1. LLM_PROVIDER=claude_cli  → ClaudeCliProvider
//.  2. ANTHROPIC_API_KEY is set   → AnthropicProvider
//   3. otherwise  → OllamaProvider
@Injectable()
export class LlmProviderFactory {
  constructor(
    private readonly anthropic: AnthropicProvider,
    private readonly ollama: OllamaProvider,
    private readonly claudeCli: ClaudeCliProvider,
    private readonly config: ConfigService,
  ) {}

  get(): LlmProvider {
    const name = this.resolveName();
    switch (name) {
      case 'claude_cli':
        return this.claudeCli;
      case 'ollama':
        return this.ollama;
      case 'anthropic':
        return this.anthropic;
    }
  }

  private resolveName(): 'anthropic' | 'ollama' | 'claude_cli' {
    if (this.config.get<string>(LLM_ENV.LLM_PROVIDER) === 'claude_cli') return 'claude_cli';
    if (this.config.get<string>(LLM_ENV.ANTHROPIC_API_KEY)) return 'anthropic';
    return 'ollama';
  }
}
