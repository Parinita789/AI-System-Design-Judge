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

      expect(questionsRepo.create).toHaveBeenCalledWith({ prompt: 'X', rubricVersion: 'v1.0' });
      expect(sessionsRepo.create).toHaveBeenCalledWith({ questionId: 'qid-1' });
      expect(result.question.id).toBe('qid-1');
      expect(result.session.id).toBe('sid-1');
    });

    it('falls back to v1.0 when RUBRIC_VERSION env is missing', async () => {
      questionsRepo.create.mockResolvedValue({ id: 'q' });
      sessionsRepo.create.mockResolvedValue({ id: 's' });
      await service.create({ prompt: 'X' });
      expect(questionsRepo.create.mock.calls[0][0].rubricVersion).toBe('v1.0');
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
        { id: 'sid-old-a' },
        { id: 'sid-old-b' },
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

      expect(sessionsRepo.create).toHaveBeenCalledWith({ questionId: 'qid-1' });
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
  });
});
