import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnershipService } from './ownership.service';

function makeSvc() {
  const prisma = {
    session: { findUnique: jest.fn() },
    question: { findUnique: jest.fn() },
    phaseEvaluation: { findUnique: jest.fn() },
  };
  const svc = new OwnershipService(prisma as never);
  return { svc, prisma };
}

describe('OwnershipService.assertOwnsSession', () => {
  it('resolves silently when the userId matches', async () => {
    const { svc, prisma } = makeSvc();
    prisma.session.findUnique.mockResolvedValue({ userId: 'uid-1' });
    await expect(svc.assertOwnsSession('sid-1', 'uid-1')).resolves.toBeUndefined();
    expect(prisma.session.findUnique).toHaveBeenCalledWith({
      where: { id: 'sid-1' },
      select: { userId: true },
    });
  });

  it('throws NotFoundException when the session does not exist', async () => {
    const { svc, prisma } = makeSvc();
    prisma.session.findUnique.mockResolvedValue(null);
    await expect(svc.assertOwnsSession('missing', 'uid-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when the session belongs to a different user', async () => {
    const { svc, prisma } = makeSvc();
    prisma.session.findUnique.mockResolvedValue({ userId: 'uid-other' });
    await expect(svc.assertOwnsSession('sid-1', 'uid-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('OwnershipService.assertOwnsQuestion', () => {
  it('resolves silently when the userId matches', async () => {
    const { svc, prisma } = makeSvc();
    prisma.question.findUnique.mockResolvedValue({ userId: 'uid-1' });
    await expect(svc.assertOwnsQuestion('qid-1', 'uid-1')).resolves.toBeUndefined();
  });

  it('throws NotFoundException when the question does not exist', async () => {
    const { svc, prisma } = makeSvc();
    prisma.question.findUnique.mockResolvedValue(null);
    await expect(svc.assertOwnsQuestion('missing', 'uid-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when the question belongs to a different user', async () => {
    const { svc, prisma } = makeSvc();
    prisma.question.findUnique.mockResolvedValue({ userId: 'uid-other' });
    await expect(svc.assertOwnsQuestion('qid-1', 'uid-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('OwnershipService.assertOwnsEvaluation', () => {
  it('resolves silently when the joined session userId matches', async () => {
    const { svc, prisma } = makeSvc();
    prisma.phaseEvaluation.findUnique.mockResolvedValue({ session: { userId: 'uid-1' } });
    await expect(svc.assertOwnsEvaluation('eid-1', 'uid-1')).resolves.toBeUndefined();
    expect(prisma.phaseEvaluation.findUnique).toHaveBeenCalledWith({
      where: { id: 'eid-1' },
      select: { session: { select: { userId: true } } },
    });
  });

  it('throws NotFoundException when the evaluation does not exist', async () => {
    const { svc, prisma } = makeSvc();
    prisma.phaseEvaluation.findUnique.mockResolvedValue(null);
    await expect(svc.assertOwnsEvaluation('missing', 'uid-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("throws ForbiddenException when the evaluation's session belongs to another user", async () => {
    const { svc, prisma } = makeSvc();
    prisma.phaseEvaluation.findUnique.mockResolvedValue({ session: { userId: 'uid-other' } });
    await expect(svc.assertOwnsEvaluation('eid-1', 'uid-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
