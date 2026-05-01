import { SessionsRepository } from './sessions.repository';
import { SessionStatus } from '@prisma/client';

describe('SessionsRepository', () => {
  let repo: SessionsRepository;
  const session = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new SessionsRepository({ session } as never);
  });

  describe('create', () => {
    it('inserts a session row keyed by questionId', async () => {
      session.create.mockResolvedValue({ id: 'sid-1' });
      const result = await repo.create({ questionId: 'qid-1' });

      expect(session.create).toHaveBeenCalledWith({
        data: { questionId: 'qid-1', seniority: null },
      });
      expect(result).toEqual({ id: 'sid-1' });
    });
  });

  describe('findById', () => {
    it('queries by unique id', async () => {
      session.findUnique.mockResolvedValue({ id: 'sid-1' });
      await repo.findById('sid-1');

      expect(session.findUnique).toHaveBeenCalledWith({ where: { id: 'sid-1' } });
    });

    it('returns null when not found', async () => {
      session.findUnique.mockResolvedValue(null);
      expect(await repo.findById('missing')).toBeNull();
    });
  });

  describe('findByIdWithQuestion', () => {
    it('includes the parent question', async () => {
      session.findUnique.mockResolvedValue({ id: 'sid-1', question: { prompt: 'X' } });
      await repo.findByIdWithQuestion('sid-1');

      expect(session.findUnique).toHaveBeenCalledWith({
        where: { id: 'sid-1' },
        include: { question: true },
      });
    });
  });

  describe('findAll', () => {
    it('orders by startedAt desc', async () => {
      session.findMany.mockResolvedValue([]);
      await repo.findAll();

      expect(session.findMany).toHaveBeenCalledWith({ orderBy: { startedAt: 'desc' } });
    });
  });

  describe('markEnded', () => {
    it('updates status and stamps endedAt', async () => {
      session.update.mockResolvedValue({ id: 'sid-1' });
      const before = Date.now();
      await repo.markEnded('sid-1', SessionStatus.completed);
      const after = Date.now();

      expect(session.update).toHaveBeenCalledTimes(1);
      const call = session.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'sid-1' });
      expect(call.data.status).toBe(SessionStatus.completed);
      expect(call.data.endedAt).toBeInstanceOf(Date);
      expect(call.data.endedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(call.data.endedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('passes the abandoned status through', async () => {
      session.update.mockResolvedValue({ id: 'sid-1' });
      await repo.markEnded('sid-1', SessionStatus.abandoned);
      expect(session.update.mock.calls[0][0].data.status).toBe(SessionStatus.abandoned);
    });
  });
});
