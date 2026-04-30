import { Global, Module } from '@nestjs/common';
import { LlmService } from './services/llm.service';
import { AnthropicClientService } from './services/anthropic-client.service';
import { OllamaClientService } from './services/ollama-client.service';
import { ClaudeCliClientService } from './services/claude-cli-client.service';

@Global()
@Module({
  providers: [LlmService, AnthropicClientService, OllamaClientService, ClaudeCliClientService],
  exports: [LlmService],
})
export class LlmModule {}
