import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';

const UID = 'uid-1';

describe('QuestionsService', () => {
  let service: QuestionsService;

  const questionsRepo = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    deleteByIdCascading: jest.fn(),
  };
  const sessionsRepo = {
    create: jest.fn(),
  };
  const sessionsService = {
    cleanupArtifacts: jest.fn().mockResolvedValue(undefined),
  };
  const snapshots = {
    latest: jest.fn(),
    capture: jest.fn(),
  };
  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((k: string) => env[k]) };

  const tasks = {
    track: jest.fn((p: Promise<unknown>) => p.catch(() => undefined)),
  };

  // OwnershipService is mocked at the service-level since its real
  // implementation does Prisma lookups. assertOwnsQuestion resolves
  // by default (= owned); tests override per case for not-found / 403.
  const ownership = {
    assertOwnsSession: jest.fn().mockResolvedValue(undefined),
    assertOwnsQuestion: jest.fn().mockResolvedValue(undefined),
    assertOwnsEvaluation: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(env)) delete env[k];
    ownership.assertOwnsSession.mockResolvedValue(undefined);
    ownership.assertOwnsQuestion.mockResolvedValue(undefined);
    ownership.assertOwnsEvaluation.mockResolvedValue(undefined);
    service = new QuestionsService(
      questionsRepo as never,
      sessionsRepo as never,
      sessionsService as never,
      snapshots as never,
      config as never,
      tasks as never,
      ownership as never,
    );
  });

  describe('create', () => {
    it('creates a Question + first Session in one shot, threading userId through', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'qid-1', prompt: 'X', rubricVersion: 'v2.0' });
      sessionsRepo.create.mockResolvedValue({ id: 'sid-1', questionId: 'qid-1' });

      const result = await service.create({ prompt: 'A short prompt.' }, UID);

      expect(questionsRepo.create).toHaveBeenCalledWith({
        prompt: 'A short prompt.',
        rubricVersion: 'v2.0',
        kind: 'traditional_design',
        userId: UID,
      });
      expect(sessionsRepo.create).toHaveBeenCalledWith({
        questionId: 'qid-1',
        seniority: 'senior',
        userId: UID,
      });
      expect(result.question.id).toBe('qid-1');
      expect(result.session.id).toBe('sid-1');
    });

    it('auto-detects agentic_design for prompts mentioning AI/LLM/agent vocab', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({ prompt: 'Design a chat app with an LLM-based moderation layer.' }, UID);
      expect(questionsRepo.create.mock.calls[0][0].kind).toBe('agentic_design');
    });

    it('auto-detects traditional_design for non-agentic prompts', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({ prompt: 'Design a URL shortener for 10K req/s.' }, UID);
      expect(questionsRepo.create.mock.calls[0][0].kind).toBe('traditional_design');
    });

    it('honors the client-supplied kind override', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create(
        { prompt: 'Design a URL shortener for 10K req/s.', kind: 'agentic_build' },
        UID,
      );
      expect(questionsRepo.create.mock.calls[0][0].kind).toBe('agentic_build');
    });

    it('defaults seniority to "senior" on v2.0+ when client did not pass one', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({ prompt: 'Design a simple URL shortener.' }, UID);
      expect(sessionsRepo.create.mock.calls[0][0].seniority).toBe('senior');
    });

    it('honors the client-supplied seniority on v2.0', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({ prompt: 'Design a simple URL shortener.', seniority: 'junior' }, UID);
      expect(sessionsRepo.create.mock.calls[0][0].seniority).toBe('junior');
    });
  });

  describe('list', () => {
    it('delegates to repo.findAll scoped to userId', async () => {
      questionsRepo.findAll.mockResolvedValue([{ id: 'a' }]);
      expect(await service.list(UID)).toEqual([{ id: 'a' }]);
      expect(questionsRepo.findAll).toHaveBeenCalledWith(UID, undefined);
    });
  });

  describe('get', () => {
    it('returns the question for its owner', async () => {
      questionsRepo.findById.mockResolvedValue({ id: 'qid-1', userId: UID, sessions: [] });
      expect((await service.get('qid-1', UID)).id).toBe('qid-1');
      expect(ownership.assertOwnsQuestion).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the question is missing', async () => {
      questionsRepo.findById.mockResolvedValue(null);
      await expect(service.get('missing', UID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when the question belongs to another user', async () => {
      questionsRepo.findById.mockResolvedValue({ id: 'qid-1', userId: 'uid-other', sessions: [] });
      await expect(service.get('qid-1', UID)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('startAttempt', () => {
    const question = {
      id: 'qid-1',
      userId: UID,
      prompt: 'X',
      sessions: [
        { id: 'sid-old-a', startedAt: new Date('2026-04-01T00:00:00Z'), seniority: null },
        { id: 'sid-old-b', startedAt: new Date('2026-04-30T00:00:00Z'), seniority: null },
      ],
    };

    it('creates a new Session and inherits the most-recent plan.md across all prior sessions', async () => {
      questionsRepo.findById.mockResolvedValue(question);
      snapshots.latest
        .mockResolvedValueOnce({
          takenAt: new Date('2026-04-01T00:00:00Z'),
          artifacts: { planMd: 'old plan' },
        })
        .mockResolvedValueOnce({
          takenAt: new Date('2026-04-30T00:00:00Z'),
          artifacts: { planMd: 'newer plan' },
        });
      sessionsRepo.create.mockResolvedValue({ id: 'sid-new' });

      const result = await service.startAttempt('qid-1', UID);

      expect(sessionsRepo.create).toHaveBeenCalledWith({
        questionId: 'qid-1',
        seniority: null,
        userId: UID,
      });
      expect(snapshots.capture).toHaveBeenCalledWith('sid-new', {
        elapsedMinutes: 0,
        artifacts: { planMd: 'newer plan' },
      });
      expect(result).toEqual({ id: 'sid-new' });
    });

    it('skips initial snapshot when no prior session has plan content', async () => {
      questionsRepo.findById.mockResolvedValue(question);
      snapshots.latest.mockResolvedValue(null);
      sessionsRepo.create.mockResolvedValue({ id: 'sid-new' });
      await service.startAttempt('qid-1', UID);
      expect(snapshots.capture).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException when the question is missing', async () => {
      questionsRepo.findById.mockResolvedValue(null);
      await expect(service.startAttempt('missing', UID)).rejects.toBeInstanceOf(NotFoundException);
      expect(sessionsRepo.create).not.toHaveBeenCalled();
    });

    it('inherits seniority from the most recent prior session by default', async () => {
      questionsRepo.findById.mockResolvedValue({
        id: 'qid-1',
        userId: UID,
        prompt: 'X',
        sessions: [
          { id: 'old-1', startedAt: new Date('2026-04-01T00:00:00Z'), seniority: 'junior' },
          { id: 'old-2', startedAt: new Date('2026-04-30T00:00:00Z'), seniority: 'staff' },
        ],
      });
      snapshots.latest.mockResolvedValue(null);
      sessionsRepo.create.mockResolvedValue({ id: 'sid-new' });

      await service.startAttempt('qid-1', UID);

      expect(sessionsRepo.create).toHaveBeenCalledWith({
        questionId: 'qid-1',
        seniority: 'staff',
        userId: UID,
      });
    });

    it('honors an explicit seniority override on retry', async () => {
      questionsRepo.findById.mockResolvedValue({
        id: 'qid-1',
        userId: UID,
        prompt: 'X',
        sessions: [
          { id: 'old', startedAt: new Date('2026-04-30T00:00:00Z'), seniority: 'staff' },
        ],
      });
      snapshots.latest.mockResolvedValue(null);
      sessionsRepo.create.mockResolvedValue({ id: 'sid-new' });

      await service.startAttempt('qid-1', UID, 'junior');

      expect(sessionsRepo.create).toHaveBeenCalledWith({
        questionId: 'qid-1',
        seniority: 'junior',
        userId: UID,
      });
    });
  });

  describe('deleteQuestion', () => {
    it('propagates NotFoundException from the ownership check', async () => {
      ownership.assertOwnsQuestion.mockRejectedValue(new NotFoundException('missing'));
      await expect(service.deleteQuestion('missing', UID)).rejects.toBeInstanceOf(NotFoundException);
      expect(questionsRepo.deleteByIdCascading).not.toHaveBeenCalled();
    });

    it('cascades through every session and schedules disk cleanup per session', async () => {
      questionsRepo.deleteByIdCascading.mockResolvedValue(['sid-a', 'sid-b', 'sid-c']);

      const out = await service.deleteQuestion('qid-1', UID);

      expect(ownership.assertOwnsQuestion).toHaveBeenCalledWith('qid-1', UID);
      expect(out).toEqual({ ok: true, deletedSessions: 3 });
      expect(questionsRepo.deleteByIdCascading).toHaveBeenCalledWith('qid-1');
      expect(sessionsService.cleanupArtifacts).toHaveBeenCalledTimes(3);
      expect(sessionsService.cleanupArtifacts).toHaveBeenCalledWith('sid-a');
      expect(sessionsService.cleanupArtifacts).toHaveBeenCalledWith('sid-b');
      expect(sessionsService.cleanupArtifacts).toHaveBeenCalledWith('sid-c');
    });

    it('handles a question with zero sessions cleanly', async () => {
      questionsRepo.deleteByIdCascading.mockResolvedValue([]);
      const out = await service.deleteQuestion('qid-1', UID);
      expect(out).toEqual({ ok: true, deletedSessions: 0 });
      expect(sessionsService.cleanupArtifacts).not.toHaveBeenCalled();
    });
  });
});
