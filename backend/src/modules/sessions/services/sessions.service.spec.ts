import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionStatus } from '@prisma/client';

const UID = 'uid-1';

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

  // OwnershipService is mocked at the service level since the real
  // implementation does Prisma lookups. assertOwnsSession resolves
  // by default (= owned); tests override per case for not-found / 403.
  const ownership = {
    assertOwnsSession: jest.fn().mockResolvedValue(undefined),
    assertOwnsQuestion: jest.fn().mockResolvedValue(undefined),
    assertOwnsEvaluation: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ownership.assertOwnsSession.mockResolvedValue(undefined);
    ownership.assertOwnsQuestion.mockResolvedValue(undefined);
    ownership.assertOwnsEvaluation.mockResolvedValue(undefined);
    service = new SessionsService(
      repo as never,
      evaluations as never,
      config as never,
      tasks as never,
      ownership as never,
    );
  });

  describe('get', () => {
    it('returns the session for its owner', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1', userId: UID });
      const out = await service.get('sid-1', UID);
      expect(out.id).toBe('sid-1');
      expect(ownership.assertOwnsSession).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the session is missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.get('missing', UID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when the session belongs to another user', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1', userId: 'uid-other' });
      await expect(service.get('sid-1', UID)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getWithQuestion', () => {
    it('returns the session+question for its owner', async () => {
      repo.findByIdWithQuestion.mockResolvedValue({
        id: 'sid-1',
        userId: UID,
        question: { id: 'qid-1', prompt: 'X' },
      });
      const result = await service.getWithQuestion('sid-1', UID);
      expect(result).toEqual({
        id: 'sid-1',
        userId: UID,
        question: { id: 'qid-1', prompt: 'X' },
      });
      expect(ownership.assertOwnsSession).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the session is missing', async () => {
      repo.findByIdWithQuestion.mockResolvedValue(null);
      await expect(service.getWithQuestion('missing', UID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the session belongs to another user', async () => {
      repo.findByIdWithQuestion.mockResolvedValue({
        id: 'sid-1',
        userId: 'uid-other',
        question: { id: 'qid-1', prompt: 'X' },
      });
      await expect(service.getWithQuestion('sid-1', UID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('list', () => {
    it('delegates to repo.findAll scoped to userId', async () => {
      repo.findAll.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      expect(await service.list(UID)).toEqual([{ id: 'a' }, { id: 'b' }]);
      expect(repo.findAll).toHaveBeenCalledWith(UID, undefined);
    });

    it('passes pagination through alongside userId', async () => {
      repo.findAll.mockResolvedValue([]);
      await service.list(UID, { take: 10, skip: 20 });
      expect(repo.findAll).toHaveBeenCalledWith(UID, { take: 10, skip: 20 });
    });
  });

  describe('deleteSession', () => {
    it('propagates NotFoundException from the ownership check', async () => {
      ownership.assertOwnsSession.mockRejectedValue(new NotFoundException('missing'));
      await expect(service.deleteSession('missing', UID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.deleteById).not.toHaveBeenCalled();
    });

    it('propagates ForbiddenException from the ownership check', async () => {
      ownership.assertOwnsSession.mockRejectedValue(new ForbiddenException('not yours'));
      await expect(service.deleteSession('sid-1', UID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.deleteById).not.toHaveBeenCalled();
    });

    it('deletes the session row when ownership passes', async () => {
      repo.deleteById.mockResolvedValue({ id: 'sid-1' });
      const out = await service.deleteSession('sid-1', UID);
      expect(out).toEqual({ ok: true });
      expect(ownership.assertOwnsSession).toHaveBeenCalledWith('sid-1', UID);
      expect(repo.deleteById).toHaveBeenCalledWith('sid-1');
    });

    it('returns immediately even if disk cleanup is slow (fire-and-forget)', async () => {
      repo.deleteById.mockResolvedValue({ id: 'sid-1' });
      const start = Date.now();
      await service.deleteSession('sid-1', UID);
      expect(Date.now() - start).toBeLessThan(50);
    });
  });

  describe('end', () => {
    it('defaults to completed and runs the evaluator inline', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1', userId: UID });
      repo.markEnded.mockResolvedValue({ id: 'sid-1', status: SessionStatus.completed });
      evaluations.runForSession.mockResolvedValue([{ id: 'eval-1', score: 3.5 }]);

      const result = await service.end('sid-1', UID, {});

      expect(ownership.assertOwnsSession).not.toHaveBeenCalled();
      expect(repo.markEnded).toHaveBeenCalledWith('sid-1', SessionStatus.completed);
      expect(evaluations.runForSession).toHaveBeenCalledWith('sid-1');
      expect(result).toEqual({
        session: { id: 'sid-1', status: SessionStatus.completed },
        evaluations: [{ id: 'eval-1', score: 3.5 }],
        evalError: null,
      });
    });

    it('skips the evaluator when status is abandoned', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1', userId: UID });
      repo.markEnded.mockResolvedValue({ id: 'sid-1', status: SessionStatus.abandoned });

      const result = await service.end('sid-1', UID, { status: 'abandoned' });

      expect(evaluations.runForSession).not.toHaveBeenCalled();
      expect(result).toEqual({
        session: { id: 'sid-1', status: SessionStatus.abandoned },
        evaluations: [],
        evalError: null,
      });
    });

    it('still completes the session when evaluation throws — error surfaces in evalError', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1', userId: UID });
      repo.markEnded.mockResolvedValue({ id: 'sid-1', status: SessionStatus.completed });
      evaluations.runForSession.mockRejectedValue(new Error('LLM unreachable'));

      const result = await service.end('sid-1', UID, {});

      expect(result.evalError).toBe('LLM unreachable');
      expect(result.evaluations).toEqual([]);
    });

    it('throws NotFoundException when the session is missing', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.end('missing', UID, {})).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.markEnded).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the session belongs to another user', async () => {
      repo.findById.mockResolvedValue({ id: 'sid-1', userId: 'uid-other' });
      await expect(service.end('sid-1', UID, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.markEnded).not.toHaveBeenCalled();
    });
  });
});
