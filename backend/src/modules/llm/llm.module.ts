import { Global, Module } from '@nestjs/common';
import { LlmService } from './services/llm.service';
import { AnthropicClientService } from './services/anthropic-client.service';
import { OllamaClientService } from './services/ollama-client.service';
import { ClaudeCliClientService } from './services/claude-cli-client.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { ClaudeCliProvider } from './providers/claude-cli.provider';
import { LlmProviderFactory } from './providers/llm-provider.factory';

@Global()
@Module({
  providers: [
    // Public facade
    LlmService,
    // Factory + concrete strategies
    LlmProviderFactory,
    AnthropicProvider,
    OllamaProvider,
    ClaudeCliProvider,
    // Underlying transport clients (HTTP / SDK / child_process)
    AnthropicClientService,
    OllamaClientService,
    ClaudeCliClientService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
