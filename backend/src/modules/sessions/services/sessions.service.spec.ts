import { NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionStatus } from '@prisma/client';

describe('SessionsService', () => {
  let service: SessionsService;

  const repo = {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdWithQuestion: jest.fn(),
    findAll: jest.fn(),
    markEnded: jest.fn(),
    deleteById: jest.fn(),
  };

  const evaluations = {
    runForSession: jest.fn(),
  };

  const config = {
    get: jest.fn(),
  };

  const tasks = {
    track: jest.fn((p: Promise<unknown>) => p.catch(() => undefined)),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionsService(
      repo as never,
      evaluations as never,
      config as never,
      tasks as never,
    );
  });

  describe('get', () => {
    it('returns the session when it exists', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1' });
      expect(await service.get('sid-1')).toEqual({ id: 'sid-1' });
    });

    it('throws NotFoundException when missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getWithQuestion', () => {
    it('returns the session+question when it exists', async () => {
      repo.findByIdWithQuestion.mockResolvedValue({
        id: 'sid-1',
        question: { id: 'qid-1', prompt: 'X' },
      });
      const result = await service.getWithQuestion('sid-1');
      expect(result).toEqual({ id: 'sid-1', question: { id: 'qid-1', prompt: 'X' } });
    });

    it('throws NotFoundException when missing', async () => {
      repo.findByIdWithQuestion.mockResolvedValue(null);
      await expect(service.getWithQuestion('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('delegates to repo.findAll', async () => {
      repo.findAll.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      expect(await service.list()).toEqual([{ id: 'a' }, { id: 'b' }]);
    });
  });

  describe('deleteSession', () => {
    it('throws NotFoundException when the session is missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.deleteSession('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.deleteById).not.toHaveBeenCalled();
    });

    it('deletes the session row when found', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1' });
      repo.deleteById.mockResolvedValue({ id: 'sid-1' });
      const out = await service.deleteSession('sid-1');
      expect(out).toEqual({ ok: true });
      expect(repo.deleteById).toHaveBeenCalledWith('sid-1');
    });

    it('returns immediately even if disk cleanup is slow (fire-and-forget)', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1' });
      repo.deleteById.mockResolvedValue({ id: 'sid-1' });
      const start = Date.now();
      await service.deleteSession('sid-1');
      expect(Date.now() - start).toBeLessThan(50);
    });
  });

  describe('end', () => {
    it('defaults to completed and runs the evaluator inline', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1' });
      repo.markEnded.mockResolvedValue({ id: 'sid-1', status: SessionStatus.completed });
      evaluations.runForSession.mockResolvedValue([{ id: 'eval-1', score: 3.5 }]);

      const result = await service.end('sid-1', {});

      expect(repo.markEnded).toHaveBeenCalledWith('sid-1', SessionStatus.completed);
      expect(evaluations.runForSession).toHaveBeenCalledWith('sid-1');
      expect(result).toEqual({
        session: { id: 'sid-1', status: SessionStatus.completed },
        evaluations: [{ id: 'eval-1', score: 3.5 }],
        evalError: null,
      });
    });

    it('skips the evaluator when status is abandoned', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1' });
      repo.markEnded.mockResolvedValue({ id: 'sid-1', status: SessionStatus.abandoned });

      const result = await service.end('sid-1', { status: 'abandoned' });

      expect(evaluations.runForSession).not.toHaveBeenCalled();
      expect(result).toEqual({
        session: { id: 'sid-1', status: SessionStatus.abandoned },
        evaluations: [],
        evalError: null,
      });
    });

    it('still completes the session when evaluation throws — error surfaces in evalError', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1' });
      repo.markEnded.mockResolvedValue({ id: 'sid-1', status: SessionStatus.completed });
      evaluations.runForSession.mockRejectedValue(new Error('LLM unreachable'));

      const result = await service.end('sid-1', {});

      expect(result.evalError).toBe('LLM unreachable');
      expect(result.evaluations).toEqual([]);
    });

    it('throws NotFound when the session does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.end('missing', {})).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.markEnded).not.toHaveBeenCalled();
    });
  });
});
