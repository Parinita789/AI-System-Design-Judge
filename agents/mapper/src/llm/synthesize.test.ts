import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { synthesizeOne } from './synthesize';
import { MapperAnthropicClient, MapperLlmResponse } from './anthropic-client';
import { DiscoveredModule } from '../types';

function mkModule(): DiscoveredModule {
  // Real on-disk file so selectKeyFiles can read its bytes.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syn-test-'));
  const filePath = path.join(dir, 'orchestrator.service.ts');
  fs.writeFileSync(
    filePath,
    `import { Injectable } from '@nestjs/common';\nexport class OrchestratorService {}\n`,
  );
  return {
    id: 'evaluations',
    path: 'backend/src/modules/evaluations',
    files: [{ absPath: filePath, repoPath: filePath, isTest: false }],
  };
}

function fakeUsage(): MapperLlmResponse {
  return {
    text: '',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

class StubClient {
  public calls: Array<{ userPrompt: string }> = [];
  constructor(private readonly responses: string[]) {}
  call = async (params: { systemPrompt: string; userPrompt: string; model: string }) => {
    this.calls.push({ userPrompt: params.userPrompt });
    const next = this.responses.shift();
    if (next === undefined) throw new Error('StubClient: out of responses');
    return { ...fakeUsage(), text: next };
  };
}

const SUMMARY = {
  id: 'evaluations',
  path: 'backend/src/modules/evaluations',
  fileCount: 1,
  exports: ['OrchestratorService'],
  internalDepsOut: ['llm'],
  externalDeps: ['@nestjs/common'],
};

describe('synthesizeOne', () => {
  it('returns the LLM text on first attempt when citations are valid', async () => {
    const client = new StubClient([
      'Coordinates plan and build evaluation runs, defined in `orchestrator.service.ts`.',
    ]) as unknown as MapperAnthropicClient;
    const result = await synthesizeOne(client, 'm', { module: mkModule(), summary: SUMMARY });
    expect(result.responsibility).toContain('orchestrator.service.ts');
    expect(result.unverifiedCitation).toBeUndefined();
    expect(result.synthesisError).toBeUndefined();
  });

  it('retries once when the first response cites a file not in the Key files list', async () => {
    const stub = new StubClient([
      'Coordinates evaluation through `bogus.service.ts`.',
      'Coordinates evaluation through `orchestrator.service.ts`.',
    ]);
    const result = await synthesizeOne(stub as unknown as MapperAnthropicClient, 'm', {
      module: mkModule(),
      summary: SUMMARY,
    });
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[1].userPrompt).toContain('previous response cited');
    expect(stub.calls[1].userPrompt).toContain('bogus.service.ts');
    expect(result.responsibility).toContain('orchestrator.service.ts');
    expect(result.unverifiedCitation).toBeUndefined();
  });

  it('emits the retry response with unverifiedCitation: true when both attempts hallucinate', async () => {
    const stub = new StubClient([
      'See `bogus.service.ts`.',
      'Still talking about `also-bogus.ts`.',
    ]);
    const result = await synthesizeOne(stub as unknown as MapperAnthropicClient, 'm', {
      module: mkModule(),
      summary: SUMMARY,
    });
    expect(result.unverifiedCitation).toBe(true);
    expect(result.responsibility).toContain('also-bogus.ts');
  });

  it('treats "Insufficient signal." as a non-error, no responsibility', async () => {
    const stub = new StubClient(['Insufficient signal.']);
    const result = await synthesizeOne(stub as unknown as MapperAnthropicClient, 'm', {
      module: mkModule(),
      summary: SUMMARY,
    });
    expect(result.responsibility).toBeUndefined();
    expect(result.synthesisError).toBeUndefined();
  });

  it('records synthesisError when the LLM call throws', async () => {
    const failing = {
      call: jest.fn().mockRejectedValue(new Error('rate limited')),
    } as unknown as MapperAnthropicClient;
    const result = await synthesizeOne(failing, 'm', { module: mkModule(), summary: SUMMARY });
    expect(result.responsibility).toBeUndefined();
    expect(result.synthesisError).toBe('rate limited');
  });
});
