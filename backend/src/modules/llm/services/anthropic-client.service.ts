import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LLM_ENV } from '../constants';

@Injectable()
export class AnthropicClientService {
  private client?: Anthropic;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = this.config.get<string>(LLM_ENV.ANTHROPIC_API_KEY);
      if (!apiKey) {
        throw new Error(`${LLM_ENV.ANTHROPIC_API_KEY} is not set in environment`);
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  createMessage(params: Anthropic.MessageCreateParamsNonStreaming) {
    return this.getClient().messages.create(params);
  }
}
