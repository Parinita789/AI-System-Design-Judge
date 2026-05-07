import { ConflictException, NotFoundException } from '@nestjs/common';
import { BuildSessionsService } from './build-sessions.service';

const SID = '11111111-2222-3333-4444-555555555555';

function makePrisma() {
  return {
    session: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('BuildSessionsService.startBuildPhase', () => {
  it('throws NotFoundException when the session does not exist', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue(null);
    const tokens = { mintForSession: jest.fn() };
    const events = { insertBatch: jest.fn() };
    const svc = new BuildSessionsService(prisma as never, tokens as never, events as never);
    await expect(svc.startBuildPhase(SID)).rejects.toBeInstanceOf(NotFoundException);
    expect(tokens.mintForSession).not.toHaveBeenCalled();
  });

  it('throws ConflictException on an abandoned session', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      id: SID,
      status: 'abandoned',
      buildEndedAt: null,
    });
    const tokens = { mintForSession: jest.fn() };
    const events = { insertBatch: jest.fn() };
    const svc = new BuildSessionsService(prisma as never, tokens as never, events as never);
    await expect(svc.startBuildPhase(SID)).rejects.toBeInstanceOf(ConflictException);
    expect(tokens.mintForSession).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the build phase already finished', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      id: SID,
      status: 'completed',
      buildEndedAt: new Date(),
    });
    const tokens = { mintForSession: jest.fn() };
    const events = { insertBatch: jest.fn() };
    const svc = new BuildSessionsService(prisma as never, tokens as never, events as never);
    await expect(svc.startBuildPhase(SID)).rejects.toBeInstanceOf(ConflictException);
    expect(tokens.mintForSession).not.toHaveBeenCalled();
  });

  it('mints a token on a session with no prior build', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      id: SID,
      status: 'completed',
      buildEndedAt: null,
    });
    const minted = { token: `${SID}.secret`, sessionId: SID, expiresInMinutes: 60 };
    const tokens = { mintForSession: jest.fn().mockResolvedValue(minted) };
    const events = { insertBatch: jest.fn() };
    const svc = new BuildSessionsService(prisma as never, tokens as never, events as never);
    await expect(svc.startBuildPhase(SID)).resolves.toBe(minted);
    expect(tokens.mintForSession).toHaveBeenCalledWith(SID);
  });
});

describe('BuildSessionsService.finishBuildPhase', () => {
  it('throws NotFoundException when the session does not exist', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue(null);
    const svc = new BuildSessionsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    await expect(svc.finishBuildPhase(SID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('sets buildEndedAt and returns the count on first call', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      buildEndedAt: null,
      buildEventCount: 7,
    });
    prisma.session.update.mockResolvedValue({ buildEventCount: 7 });
    const svc = new BuildSessionsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const out = await svc.finishBuildPhase(SID);
    expect(out).toEqual({ ok: true, eventCount: 7 });
    expect(prisma.session.update).toHaveBeenCalledTimes(1);
    const call = prisma.session.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: SID });
    expect(call.data.buildEndedAt).toBeInstanceOf(Date);
  });

  it('does NOT mutate buildEndedAt on a second call', async () => {
    const prisma = makePrisma();
    prisma.session.findUnique.mockResolvedValue({
      buildEndedAt: new Date('2026-05-07T00:00:00Z'),
      buildEventCount: 7,
    });
    const svc = new BuildSessionsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const out = await svc.finishBuildPhase(SID);
    expect(out).toEqual({ ok: true, eventCount: 7 });
    expect(prisma.session.update).not.toHaveBeenCalled();
  });
});

describe('BuildSessionsService.insertEvents', () => {
  it('delegates to BuildEventsRepository.insertBatch', async () => {
    const prisma = makePrisma();
    const events = { insertBatch: jest.fn().mockResolvedValue(3) };
    const svc = new BuildSessionsService(prisma as never, {} as never, events as never);
    const batch = [
      { filePath: 'a.ts', action: 'created' as const, occurredAt: '2026-05-07T00:00:00.000Z' },
    ];
    const out = await svc.insertEvents(SID, batch);
    expect(out).toBe(3);
    expect(events.insertBatch).toHaveBeenCalledWith(SID, batch);
  });
});
