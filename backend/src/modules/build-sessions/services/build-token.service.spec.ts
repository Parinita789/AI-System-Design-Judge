import * as bcrypt from 'bcryptjs';
import { BuildTokenService } from './build-token.service';

describe('BuildTokenService', () => {
  function makePrisma() {
    return {
      session: {
        update: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
  }

  describe('mintForSession', () => {
    it('writes a bcrypt hash + buildStartedAt and returns the plaintext token', async () => {
      const prisma = makePrisma();
      prisma.session.update.mockResolvedValue({});
      const svc = new BuildTokenService(prisma as never);

      const out = await svc.mintForSession('sid-1');

      expect(out.sessionId).toBe('sid-1');
      expect(out.expiresInMinutes).toBe(60);
      expect(out.buildStartedAt).toBeInstanceOf(Date);
      const [sid, secret] = out.token.split('.');
      expect(sid).toBe('sid-1');
      expect(secret).toMatch(/^[0-9a-f]{64}$/);

      const call = prisma.session.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'sid-1' });
      expect(call.data.buildEndedAt).toBeNull();
      expect(call.data.buildStartedAt).toBeInstanceOf(Date);
      expect(call.data.buildTokenHash).toMatch(/^\$2[ab]\$/);
      expect(await bcrypt.compare(secret, call.data.buildTokenHash)).toBe(true);
      expect(await bcrypt.compare(out.token, call.data.buildTokenHash)).toBe(false);
    });
  });

  describe('verify', () => {
    const SID = '11111111-2222-3333-4444-555555555555';

    function withRow(row: { buildTokenHash: string } | null) {
      const prisma = makePrisma();
      prisma.session.findFirst.mockResolvedValue(row);
      return { prisma, svc: new BuildTokenService(prisma as never) };
    }

    it('rejects undefined / empty / bare strings', async () => {
      const { svc } = withRow(null);
      expect(await svc.verify(undefined)).toBeNull();
      expect(await svc.verify('')).toBeNull();
      expect(await svc.verify('no-dot')).toBeNull();
      expect(await svc.verify('.no-id')).toBeNull();
      expect(await svc.verify('no-secret.')).toBeNull();
    });

    it('rejects when the id half is not a UUID (no DB call)', async () => {
      const { svc, prisma } = withRow(null);
      expect(await svc.verify('junk.notreal')).toBeNull();
      expect(prisma.session.findFirst).not.toHaveBeenCalled();
    });

    it('returns null when the DB query gates the row out (covers missing, expired, finished, abandoned, no-hash)', async () => {
      const { svc } = withRow(null);
      expect(await svc.verify(`${SID}.deadbeef`)).toBeNull();
    });

    it('pushes the status / buildEndedAt / TTL / hash-present gates into the SQL WHERE clause', async () => {
      const hash = await bcrypt.hash('right-secret', 4);
      const { svc, prisma } = withRow({ buildTokenHash: hash });
      await svc.verify(`${SID}.right-secret`);
      const arg = prisma.session.findFirst.mock.calls[0][0];
      expect(arg.where.id).toBe(SID);
      expect(arg.where.status).toEqual({ not: 'abandoned' });
      expect(arg.where.buildEndedAt).toBeNull();
      expect(arg.where.buildTokenHash).toEqual({ not: null });
      expect(arg.where.OR).toEqual([
        { buildStartedAt: null },
        { buildStartedAt: { gte: expect.any(Date) } },
      ]);
      expect(arg.select).toEqual({ buildTokenHash: true });
    });

    it('rejects when the secret half does not match the stored hash', async () => {
      const hash = await bcrypt.hash('right-secret', 4);
      const { svc } = withRow({ buildTokenHash: hash });
      expect(await svc.verify(`${SID}.wrong`)).toBeNull();
    });

    it('returns the sessionId on a fresh, matching token', async () => {
      const hash = await bcrypt.hash('right-secret', 4);
      const { svc } = withRow({ buildTokenHash: hash });
      expect(await svc.verify(`${SID}.right-secret`)).toEqual({ sessionId: SID });
    });
  });

  describe('cleanupExpired', () => {
    it('clears buildTokenHash on finished or TTL-elapsed sessions and returns the count', async () => {
      const prisma = makePrisma();
      prisma.session.updateMany.mockResolvedValue({ count: 3 });
      const svc = new BuildTokenService(prisma as never);

      const cleared = await svc.cleanupExpired();

      expect(cleared).toBe(3);
      const arg = prisma.session.updateMany.mock.calls[0][0];
      expect(arg.data).toEqual({ buildTokenHash: null });
      expect(arg.where.buildTokenHash).toEqual({ not: null });
      expect(arg.where.OR).toEqual([
        { buildEndedAt: { not: null } },
        { buildStartedAt: { lt: expect.any(Date) } },
      ]);
      const cutoff: Date = arg.where.OR[1].buildStartedAt.lt;
      expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(60 * 60_000 - 100);
    });

    it('returns 0 when there are no candidates', async () => {
      const prisma = makePrisma();
      prisma.session.updateMany.mockResolvedValue({ count: 0 });
      const svc = new BuildTokenService(prisma as never);
      expect(await svc.cleanupExpired()).toBe(0);
    });
  });
});
