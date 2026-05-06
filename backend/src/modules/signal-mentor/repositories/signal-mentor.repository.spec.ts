import { SignalMentorRepository } from './signal-mentor.repository';
import { SignalMentorResult } from '../types/signal-mentor.types';

describe('SignalMentorRepository', () => {
  let repo: SignalMentorRepository;
  const signalMentorArtifact = {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new SignalMentorRepository({ signalMentorArtifact } as never);
  });

  const sample: SignalMentorResult = {
    artifact: {
      annotations: {
        scope_realism:
          'A strong version names what is in vs out by the deadline …',
        no_validation_plan: 'Mention how you would smoke-test demo scale …',
      },
    },
    renderedPrompt: '<full prompt>',
    audit: {
      modelUsed: 'claude-opus-4-7',
      tokensIn: 100,
      tokensOut: 200,
      cacheReadTokens: 5,
      cacheCreationTokens: 6,
      latencyMs: 7777,
    },
  };

  it('upserts annotations + audit fields', async () => {
    signalMentorArtifact.upsert.mockResolvedValue({ id: 'sid' });
    await repo.upsertByEvaluationId('eid-1', sample);
    expect(signalMentorArtifact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phaseEvaluationId: 'eid-1' },
        create: expect.objectContaining({
          phaseEvaluationId: 'eid-1',
          annotations: sample.artifact.annotations,
          modelUsed: 'claude-opus-4-7',
          latencyMs: 7777,
        }),
      }),
    );
  });

  it('toApiShape exposes annotations + audit, drops the rendered prompt', () => {
    const row = {
      id: 'sid-1',
      phaseEvaluationId: 'eid-1',
      annotations: { scope_realism: 'body…' },
      modelUsed: 'claude-haiku-4-5',
      tokensIn: 1,
      tokensOut: 2,
      cacheReadTokens: 3,
      cacheCreationTokens: 4,
      latencyMs: 999,
      createdAt: new Date('2026-05-04T00:00:00Z'),
      updatedAt: new Date('2026-05-04T00:00:01Z'),
    };
    const out = SignalMentorRepository.toApiShape(row as never);
    expect(out!.artifact.annotations).toEqual({ scope_realism: 'body…' });
    expect(out!.audit.modelUsed).toBe('claude-haiku-4-5');
    expect((out as Record<string, unknown>).renderedPrompt).toBeUndefined();
  });

  it('toApiShape returns null for a missing row', () => {
    expect(SignalMentorRepository.toApiShape(null as never)).toBeNull();
  });

  it('toApiShape coerces null annotations to an empty object', () => {
    const row = {
      id: 'sid-1',
      phaseEvaluationId: 'eid-1',
      annotations: null,
      modelUsed: 'noop',
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const out = SignalMentorRepository.toApiShape(row as never);
    expect(out!.artifact.annotations).toEqual({});
  });
});
