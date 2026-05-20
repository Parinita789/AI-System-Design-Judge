import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { UserOrIpThrottlerGuard } from '../../src/modules/throttling/user-or-ip-throttler.guard';
import { LlmProviderFactory } from '../../src/modules/llm/providers/llm-provider.factory';
import type { LlmProvider } from '../../src/modules/llm/providers/llm-provider.interface';
import type { LlmResponse } from '../../src/modules/llm/types/llm.types';

// Default fake-LLM response. Tests that need a specific payload pass
// `llmResponse` to override; tests that don't exercise LLM-bound
// routes ignore it entirely.
const DEFAULT_LLM_RESPONSE: LlmResponse = {
  text: 'fake response',
  modelUsed: 'claude-opus-4-7',
  tokensIn: 100,
  tokensOut: 50,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

export interface TestAppOptions {
  /** Override the global throttler so rapid test requests don't hit 429. */
  disableThrottling?: boolean;
  /** Replace the LLM provider so tests don't hit Anthropic/Ollama. */
  llmResponse?: Partial<LlmResponse>;
  /** Replace the provider name (matters for cost-cap pricing). */
  llmProviderName?: 'anthropic' | 'claude_cli' | 'ollama';
}

export interface TestApp {
  app: INestApplication;
  llmCall: jest.Mock;
}

export async function createTestApp(opts: TestAppOptions = {}): Promise<TestApp> {
  const llmCall = jest
    .fn()
    .mockResolvedValue({ ...DEFAULT_LLM_RESPONSE, ...(opts.llmResponse ?? {}) });

  const fakeProvider: LlmProvider = {
    name: opts.llmProviderName ?? 'anthropic',
    supportsToolUse: true,
    call: llmCall,
  };

  let builder = Test.createTestingModule({ imports: [AppModule] }).overrideProvider(
    LlmProviderFactory,
  ).useValue({ get: () => fakeProvider });

  if (opts.disableThrottling ?? true) {
    builder = builder
      .overrideGuard(UserOrIpThrottlerGuard)
      .useValue({ canActivate: () => true });
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  return { app, llmCall };
}
