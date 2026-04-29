import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AnthropicClientService {
  constructor(private readonly config: ConfigService) {}

  // Wraps @anthropic-ai/sdk. Initialize the SDK client here and expose
  // a single-call helper so LlmService stays provider-agnostic.
  send(_payload: unknown): Promise<unknown> {
    throw new Error('Not implemented');
  }
}
