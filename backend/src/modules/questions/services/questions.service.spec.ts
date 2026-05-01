import { NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';

describe('QuestionsService', () => {
  let service: QuestionsService;

  const questionsRepo = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
  };
  const sessionsRepo = {
    create: jest.fn(),
  };
  const snapshots = {
    latest: jest.fn(),
    capture: jest.fn(),
  };
  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((k: string) => env[k]) };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(env)) delete env[k];
    service = new QuestionsService(
      questionsRepo as never,
      sessionsRepo as never,
      snapshots as never,
      config as never,
    );
  });

  describe('create', () => {
    it('creates a Question + first Session in one shot, using configured rubric version', async () => {
      env.RUBRIC_VERSION = 'v1.0';
      questionsRepo.create.mockResolvedValue({ id: 'qid-1', prompt: 'X', rubricVersion: 'v1.0' });
      sessionsRepo.create.mockResolvedValue({ id: 'sid-1', questionId: 'qid-1' });

      const result = await service.create({ prompt: 'X' });

      // v1.0 questions don't carry a mode (mode = null routes through
      // the legacy single-file rubric path).
      expect(questionsRepo.create).toHaveBeenCalledWith({
        prompt: 'X',
        rubricVersion: 'v1.0',
        mode: null,
      });
      expect(sessionsRepo.create).toHaveBeenCalledWith({
        questionId: 'qid-1',
        seniority: null,
      });
      expect(result.question.id).toBe('qid-1');
      expect(result.session.id).toBe('sid-1');
    });

    it('falls back to v1.0 when RUBRIC_VERSION env is missing', async () => {
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({ prompt: 'X' });
      expect(questionsRepo.create.mock.calls[0][0].rubricVersion).toBe('v1.0');
      expect(questionsRepo.create.mock.calls[0][0].mode).toBeNull();
    });

    it('auto-detects mode for v2.0+ questions when client did not pass one', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({ prompt: 'Design a chat for 100M users.' });
      expect(questionsRepo.create.mock.calls[0][0].mode).toBe('design');
    });

    it('auto-detects build mode for prompts without production-scale signals', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({ prompt: 'Design a simple URL shortener.' });
      expect(questionsRepo.create.mock.calls[0][0].mode).toBe('build');
    });

    it('honors the client-supplied mode override on v2.0', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      // Question text would auto-detect as design; user picks build.
      await service.create({
        prompt: 'Design a chat for 100M users.',
        mode: 'build',
      });
      expect(questionsRepo.create.mock.calls[0][0].mode).toBe('build');
    });

    it('defaults seniority to "senior" on v2.0+ when client did not pass one', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({ prompt: 'Design a simple URL shortener.' });
      expect(sessionsRepo.create.mock.calls[0][0].seniority).toBe('senior');
    });

    it('honors the client-supplied seniority on v2.0', async () => {
      env.RUBRIC_VERSION = 'v2.0';
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({
        prompt: 'Design a simple URL shortener.',
        seniority: 'junior',
      });
      expect(sessionsRepo.create.mock.calls[0][0].seniority).toBe('junior');
    });
  });

  describe('list', () => {
    it('delegates to repo.findAll', async () => {
      questionsRepo.findAll.mockResolvedValue([{ id: 'a' }]);
      expect(await service.list()).toEqual([{ id: 'a' }]);
    });
  });

  describe('get', () => {
    it('returns the question when it exists', async () => {
      questionsRepo.findById.mockResolvedValue({ id: 'qid-1', sessions: [] });
      expect((await service.get('qid-1')).id).toBe('qid-1');
    });

    it('throws NotFoundException when missing', async () => {
      questionsRepo.findById.mockResolvedValue(null);
      await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('startAttempt', () => {
    const question = {
      id: 'qid-1',
      prompt: 'X',
      sessions: [
        { id: 'sid-old-a', startedAt: new Date('2026-04-01T00:00:00Z'), seniority: null },
        { id: 'sid-old-b', startedAt: new Date('2026-04-30T00:00:00Z'), seniority: null },
      ],
    };

    it('creates a new Session and inherits the most-recent plan.md across all prior sessions', async () => {
      questionsRepo.findById.mockResolvedValue(question);
      // sid-old-a has older snapshot, sid-old-b has newer — newer wins
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

      const result = await service.startAttempt('qid-1');

      expect(sessionsRepo.create).toHaveBeenCalledWith({
        questionId: 'qid-1',
        seniority: null,
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

      await service.startAttempt('qid-1');

      expect(snapshots.capture).not.toHaveBeenCalled();
    });

    it('throws NotFound when the question does not exist', async () => {
      questionsRepo.findById.mockResolvedValue(null);
      await expect(service.startAttempt('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(sessionsRepo.create).not.toHaveBeenCalled();
    });

    it('inherits seniority from the most recent prior session by default', async () => {
      questionsRepo.findById.mockResolvedValue({
        id: 'qid-1',
        prompt: 'X',
        sessions: [
          { id: 'old-1', startedAt: new Date('2026-04-01T00:00:00Z'), seniority: 'junior' },
          { id: 'old-2', startedAt: new Date('2026-04-30T00:00:00Z'), seniority: 'staff' },
        ],
      });
      snapshots.latest.mockResolvedValue(null);
      sessionsRepo.create.mockResolvedValue({ id: 'sid-new' });

      await service.startAttempt('qid-1');

      expect(sessionsRepo.create).toHaveBeenCalledWith({
        questionId: 'qid-1',
        // most recent (sid-old-2 by startedAt) was 'staff' — inherit it.
        seniority: 'staff',
      });
    });

    it('honors an explicit seniority override on retry', async () => {
      questionsRepo.findById.mockResolvedValue({
        id: 'qid-1',
        prompt: 'X',
        sessions: [
          { id: 'old', startedAt: new Date('2026-04-30T00:00:00Z'), seniority: 'staff' },
        ],
      });
      snapshots.latest.mockResolvedValue(null);
      sessionsRepo.create.mockResolvedValue({ id: 'sid-new' });

      await service.startAttempt('qid-1', 'junior');

      expect(sessionsRepo.create).toHaveBeenCalledWith({
        questionId: 'qid-1',
        seniority: 'junior',
      });
    });
  });
});
