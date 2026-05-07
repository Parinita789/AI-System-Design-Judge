import { BuildEventsRepository } from './build-events.repository';
import { IncomingBuildEvent } from '../types/build-event.types';

describe('BuildEventsRepository', () => {
  function makePrisma() {
    return {
      buildEvent: { createMany: jest.fn(), count: jest.fn() },
      session: { update: jest.fn() },
      $transaction: jest.fn(),
    };
  }

  const events: IncomingBuildEvent[] = [
    { filePath: 'a.ts', action: 'created', content: 'x', occurredAt: '2026-05-07T00:00:00.000Z' },
    { filePath: 'a.ts', action: 'modified', contentDiff: '+y', occurredAt: '2026-05-07T00:00:01.000Z' },
  ];

  it('inserts rows + bumps buildEventCount in one transaction', async () => {
    const prisma = makePrisma();
    const createMany = { count: 2 };
    prisma.buildEvent.createMany.mockReturnValue('CREATE_OP');
    prisma.session.update.mockReturnValue('UPDATE_OP');
    prisma.$transaction.mockResolvedValue([createMany, { id: 'sid' }]);
    const repo = new BuildEventsRepository(prisma as never);

    const accepted = await repo.insertBatch('sid', events);

    expect(accepted).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(['CREATE_OP', 'UPDATE_OP']);
    expect(prisma.buildEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          sessionId: 'sid',
          filePath: 'a.ts',
          action: 'created',
          content: 'x',
          contentDiff: null,
          occurredAt: new Date('2026-05-07T00:00:00.000Z'),
        }),
        expect.objectContaining({
          filePath: 'a.ts',
          action: 'modified',
          content: null,
          contentDiff: '+y',
        }),
      ],
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'sid' },
      data: { buildEventCount: { increment: 2 } },
    });
  });

  it('short-circuits on an empty batch (no DB calls)', async () => {
    const prisma = makePrisma();
    const repo = new BuildEventsRepository(prisma as never);
    const accepted = await repo.insertBatch('sid', []);
    expect(accepted).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
