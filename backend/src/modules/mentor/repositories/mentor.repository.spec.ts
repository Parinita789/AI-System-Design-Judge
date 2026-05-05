import { MentorRepository } from './mentor.repository';
import { MentorResult } from '../types/mentor.types';

describe('MentorRepository', () => {
  let repo: MentorRepository;
  const mentorArtifact = {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new MentorRepository({ mentorArtifact } as never);
  });

  const sample: MentorResult = {
    artifact: { content: '## Section 1\n\nGood call splitting read/write.' },
    renderedPrompt: '<full system + user prompt>',
    audit: {
      modelUsed: 'claude-opus-4-7',
      tokensIn: 100,
      tokensOut: 200,
      cacheReadTokens: 5000,
      cacheCreationTokens: 1500,
      latencyMs: 8200,
    },
  };

  it('upserts content + audit fields', async () => {
    mentorArtifact.upsert.mockResolvedValue({ id: 'mid' });
    await repo.upsertByEvaluationId('eid-1', sample);
    expect(mentorArtifact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phaseEvaluationId: 'eid-1' },
        create: expect.objectContaining({
          phaseEvaluationId: 'eid-1',
          content: sample.artifact.content,
          modelUsed: 'claude-opus-4-7',
          latencyMs: 8200,
        }),
      }),
    );
  });

  it('toApiShape exposes content + audit, drops the rendered prompt', () => {
    const row = {
      id: 'mid-1',
      phaseEvaluationId: 'eid-1',
      content: '## Section 1\n\nbody',
      modelUsed: 'claude-haiku-4-5',
      tokensIn: 1,
      tokensOut: 2,
      cacheReadTokens: 3,
      cacheCreationTokens: 4,
      latencyMs: 999,
      createdAt: new Date('2026-05-04T00:00:00Z'),
      updatedAt: new Date('2026-05-04T00:00:01Z'),
    };
    const out = MentorRepository.toApiShape(row as never);
    expect(out!.artifact.content).toContain('## Section 1');
    expect(out!.audit.modelUsed).toBe('claude-haiku-4-5');
    // renderedPrompt is intentionally not on the API shape; it lives on disk.
    expect((out as Record<string, unknown>).renderedPrompt).toBeUndefined();
  });

  it('toApiShape returns null when the row does not exist', () => {
    expect(MentorRepository.toApiShape(null as never)).toBeNull();
  });
});
