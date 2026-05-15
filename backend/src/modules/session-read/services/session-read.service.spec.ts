import { NotFoundException } from '@nestjs/common';
import { SessionReadService } from './session-read.service';

describe('SessionReadService', () => {
  let service: SessionReadService;
  const prisma = {
    session: { findUnique: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionReadService(prisma as never);
  });

  describe('getWithQuestion', () => {
    it('returns the session+question and strips buildTokenHash', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'sid-1',
        buildTokenHash: 'secret-hash',
        question: { id: 'qid-1', prompt: 'X' },
      });
      const result = await service.getWithQuestion('sid-1');
      expect(result).toEqual({ id: 'sid-1', question: { id: 'qid-1', prompt: 'X' } });
      expect((result as Record<string, unknown>).buildTokenHash).toBeUndefined();
    });

    it('throws NotFoundException when the session is missing', async () => {
      prisma.session.findUnique.mockResolvedValue(null);
      await expect(service.getWithQuestion('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('includes the question relation in the prisma query', async () => {
      prisma.session.findUnique.mockResolvedValue({ id: 'sid-1', question: {} });
      await service.getWithQuestion('sid-1');
      expect(prisma.session.findUnique).toHaveBeenCalledWith({
        where: { id: 'sid-1' },
        include: { question: true },
      });
    });
  });
});
