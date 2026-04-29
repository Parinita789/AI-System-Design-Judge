import { Injectable } from '@nestjs/common';
import { AnthropicClientService } from './anthropic-client.service';
import { LlmCallOptions, LlmResponse } from '../models/llm.types';

@Injectable()
export class LlmService {
  constructor(private readonly client: AnthropicClientService) {}

  call(_prompt: string, _opts?: LlmCallOptions): Promise<LlmResponse> {
    throw new Error('Not implemented');
  }
}
