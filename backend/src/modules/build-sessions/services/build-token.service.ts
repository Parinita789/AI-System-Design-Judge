import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';

const TOKEN_TTL_MS = 60 * 60 * 1000;
const SECRET_BYTES = 32;
const BCRYPT_ROUNDS = 10;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MintedToken {
  token: string;
  sessionId: string;
  expiresInMinutes: number;
  buildStartedAt: Date;
}

export interface VerifiedToken {
  sessionId: string;
}

@Injectable()
export class BuildTokenService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BuildTokenService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Best-effort periodic cleanup. The verify path already short-circuits
    // expired/finished tokens before bcrypt.compare, so this isn't a
    // correctness fix — it's hygiene. Leftover hashes on long-finished
    // sessions are sensitive material that no longer needs to live in
    // the row, and clearing them lets future "active build sessions"
    // queries trust `buildTokenHash IS NOT NULL`.
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpired().catch((err) =>
        this.logger.warn(`Token cleanup failed: ${(err as Error).message}`),
      );
    }, CLEANUP_INTERVAL_MS);
    // Don't keep the event loop alive solely for the cleanup timer.
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // NULL out buildTokenHash on sessions where the token is no longer
  // useful — either the build phase has ended, or the TTL has elapsed
  // since buildStartedAt. Returns the count for logging/metrics.
  async cleanupExpired(): Promise<number> {
    const ttlCutoff = new Date(Date.now() - TOKEN_TTL_MS);
    const { count } = await this.prisma.session.updateMany({
      where: {
        buildTokenHash: { not: null },
        OR: [
          { buildEndedAt: { not: null } },
          { buildStartedAt: { lt: ttlCutoff } },
        ],
      },
      data: { buildTokenHash: null },
    });
    if (count > 0) {
      this.logger.log(`Cleared ${count} expired/finished build token hash(es).`);
    }
    return count;
  }

  async mintForSession(sessionId: string): Promise<MintedToken> {
    const secret = randomBytes(SECRET_BYTES).toString('hex');
    const hash = await bcrypt.hash(secret, BCRYPT_ROUNDS);
    const buildStartedAt = new Date();
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        buildTokenHash: hash,
        buildStartedAt,
        buildEndedAt: null,
      },
    });
    this.logger.log(`Minted build token for session ${sessionId}`);
    return {
      token: `${sessionId}.${secret}`,
      sessionId,
      expiresInMinutes: TOKEN_TTL_MS / 60_000,
      buildStartedAt,
    };
  }

  async verify(rawToken: string | undefined): Promise<VerifiedToken | null> {
    if (!rawToken) return null;
    const idx = rawToken.indexOf('.');
    if (idx <= 0 || idx === rawToken.length - 1) return null;
    const sessionId = rawToken.slice(0, idx);
    const secret = rawToken.slice(idx + 1);
    if (!UUID_RE.test(sessionId)) return null;

    // Push every gate (existence, status, finished, TTL, hash-present)
    // into the WHERE clause so the DB returns at most a single column —
    // the bcrypt hash to compare against. Narrower payload, single
    // round-trip, and the unhappy paths all collapse to the same
    // "no row" branch (less side-channel between "missing" / "expired" /
    // "abandoned" / "wrong secret" for an attacker probing tokens).
    const ttlCutoff = new Date(Date.now() - TOKEN_TTL_MS);
    const row = await this.prisma.session.findFirst({
      where: {
        id: sessionId,
        status: { not: 'abandoned' },
        buildEndedAt: null,
        buildTokenHash: { not: null },
        OR: [
          { buildStartedAt: null },
          { buildStartedAt: { gte: ttlCutoff } },
        ],
      },
      select: { buildTokenHash: true },
    });
    if (!row?.buildTokenHash) return null;
    const ok = await bcrypt.compare(secret, row.buildTokenHash);
    if (!ok) return null;
    return { sessionId };
  }
}
