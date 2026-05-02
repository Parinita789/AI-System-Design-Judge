import { Injectable } from '@nestjs/common';
import { ChatMessage, LlmCallOptions, LlmResponse } from '../models/llm.types';
import { LlmProviderFactory } from '../providers/llm-provider.factory';

@Injectable()
export class LlmService {
  constructor(private readonly factory: LlmProviderFactory) {}

  call(messages: ChatMessage[], opts: LlmCallOptions = {}): Promise<LlmResponse> {
    return this.factory.get().call(messages, opts);
  }
}
