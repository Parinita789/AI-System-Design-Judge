import { Global, Module } from '@nestjs/common';
import { LlmService } from './services/llm.service';
import { AnthropicClientService } from './services/anthropic-client.service';

@Global()
@Module({
  providers: [LlmService, AnthropicClientService],
  exports: [LlmService],
})
export class LlmModule {}
