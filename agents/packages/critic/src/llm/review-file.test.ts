import { reviewOneFile } from './review-file';
import { CriticLlmClient, CriticLlmResponse } from './llm-client';
import { MapperModuleSummary } from '../types';
import { SourceFile } from '../load/read-source';

class StubClient implements CriticLlmClient {
  public calls = 0;
  constructor(private readonly responses: Array<Record<string, unknown> | Error>) {}
  async call(): Promise<CriticLlmResponse> {
    const r = this.responses[this.calls++];
    if (!r) throw new Error('stub ran out of responses');
    if (r instanceof Error) throw r;
    return {
      text: JSON.stringify(r),
      toolInput: r,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
  }
}

const fakeModule: MapperModuleSummary = {
  id: 'hints',
  path: 'backend/src/modules/hints',
  fileCount: 3,
  testFileCount: 0,
  exports: ['HintsService'],
  internalDepsOut: ['llm'],
  internalDepsIn: ['_root'],
  externalDeps: ['@nestjs/common'],
  responsibility: 'Generates Socratic hints during sessions.',
};

function makeSource(lineCount = 100): SourceFile {
  return {
    absPath: '/repo/backend/src/modules/hints/orchestrator.ts',
    repoPath: 'backend/src/modules/hints/orchestrator.ts',
    text: 'x',
    lineCount,
    truncated: false,
    truncatedAfter: lineCount,
    withLineNumbers: 'x',
  };
}

const baseReview = {
  file: 'backend/src/modules/hints/orchestrator.ts',
  summary: 'Orchestrates hint generation.',
  strengths: ['Clear separation of concerns.'],
  concerns: [],
  issues: [],
  recommendations: [],
};

function call(client: CriticLlmClient, source: SourceFile) {
  return reviewOneFile({
    client,
    model: 'claude-sonnet-4-6',
    personaText: 'staff engineer',
    rubricText: 'rubric',
    pkg: 'backend',
    module: fakeModule,
    source,
  });
}

describe('reviewOneFile', () => {
  it('returns the review when the LLM output is valid', async () => {
    const client = new StubClient([
      {
        ...baseReview,
        issues: [
          {
            severity: 'high',
            axis: 'error-handling',
            fingerprint: 'catch-all swallows error',
            lines: [42],
            issue: 'The catch block discards the error.',
          },
        ],
      },
    ]);
    const result = await call(client, makeSource(50));
    expect(result.unverifiedRefs).toBe(false);
    expect(result.synthesisError).toBeNull();
    expect(result.review.issues).toHaveLength(1);
    expect(client.calls).toBe(1);
  });

  it('retries once when refs are invalid, then succeeds', async () => {
    const badResponse = {
      ...baseReview,
      issues: [
        {
          severity: 'high',
          axis: 'correctness',
          fingerprint: 'x',
          lines: [9999],
          issue: 'x',
        },
      ],
    };
    const goodResponse = {
      ...baseReview,
      issues: [
        {
          severity: 'high',
          axis: 'correctness',
          fingerprint: 'x',
          lines: [10],
          issue: 'x',
        },
      ],
    };
    const client = new StubClient([badResponse, goodResponse]);
    const result = await call(client, makeSource(50));
    expect(client.calls).toBe(2);
    expect(result.unverifiedRefs).toBe(false);
    expect(result.review.issues[0].lines).toEqual([10]);
  });

  it('flags unverifiedRefs when both attempts fail validation', async () => {
    const bad = {
      ...baseReview,
      issues: [
        {
          severity: 'high',
          axis: 'correctness',
          fingerprint: 'x',
          lines: [9999],
          issue: 'x',
        },
      ],
    };
    const client = new StubClient([bad, bad]);
    const result = await call(client, makeSource(50));
    expect(client.calls).toBe(2);
    expect(result.unverifiedRefs).toBe(true);
    expect(result.review.issues).toHaveLength(1);
  });

  it('records synthesisError if the LLM throws', async () => {
    const client = new StubClient([new Error('rate limited')]);
    const result = await call(client, makeSource(50));
    expect(result.synthesisError).toMatch(/rate limited/);
    expect(result.review.issues).toEqual([]);
  });
});
