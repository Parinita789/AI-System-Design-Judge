import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { createTestApp } from './helpers/app';
import { truncateAll, prismaOf } from './helpers/db';
import { signupUser, authHeader } from './helpers/users';

describe('GET /api/cost-cap/today (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  it('requires authentication (401 without a token)', async () => {
    await request(app.getHttpServer()).get('/api/cost-cap/today').expect(401);
  });

  it('returns { spentTodayUsd: 0, capUsd, resetAtUtc } for a fresh user', async () => {
    const user = await signupUser(app);
    const res = await request(app.getHttpServer())
      .get('/api/cost-cap/today')
      .set(authHeader(user))
      .expect(200);

    expect(res.body.spentTodayUsd).toBe(0);
    expect(res.body.capUsd).toBe(5);
    expect(res.body.resetAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    expect(Date.parse(res.body.resetAtUtc)).toBeGreaterThan(Date.now());
  });

  it('reflects the sum of today\'s ledger rows for this user', async () => {
    const user = await signupUser(app);
    const prisma = prismaOf(app);
    for (const amount of [1.0, 0.75, 0.5]) {
      await prisma.llmSpend.create({
        data: {
          userId: user.id,
          provider: 'anthropic',
          model: 'claude-opus-4-7',
          tokensIn: 0,
          tokensOut: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          estimatedCostUsd: new Prisma.Decimal(amount),
          route: 'test-seed',
        },
      });
    }
    const res = await request(app.getHttpServer())
      .get('/api/cost-cap/today')
      .set(authHeader(user))
      .expect(200);
    expect(res.body.spentTodayUsd).toBeCloseTo(2.25, 6);
  });

  it('isolates by user — user A\'s spend does not appear in user B\'s widget', async () => {
    const userA = await signupUser(app);
    const userB = await signupUser(app);
    await prismaOf(app).llmSpend.create({
      data: {
        userId: userA.id,
        provider: 'anthropic',
        model: 'claude-opus-4-7',
        tokensIn: 0,
        tokensOut: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        estimatedCostUsd: new Prisma.Decimal('3.00'),
        route: 'test-seed',
      },
    });

    const resA = await request(app.getHttpServer())
      .get('/api/cost-cap/today')
      .set(authHeader(userA))
      .expect(200);
    const resB = await request(app.getHttpServer())
      .get('/api/cost-cap/today')
      .set(authHeader(userB))
      .expect(200);

    expect(resA.body.spentTodayUsd).toBe(3);
    expect(resB.body.spentTodayUsd).toBe(0);
  });
});
