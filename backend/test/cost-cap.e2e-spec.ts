import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { createTestApp } from './helpers/app';
import { truncateAll, prismaOf } from './helpers/db';
import { signupUser, authHeader, type TestUser } from './helpers/users';

async function seedSpend(
  app: INestApplication,
  userId: string,
  amountUsd: number,
  occurredAt: Date = new Date(),
): Promise<void> {
  await prismaOf(app).llmSpend.create({
    data: {
      userId,
      occurredAt,
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      tokensIn: 100,
      tokensOut: 50,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      estimatedCostUsd: new Prisma.Decimal(amountUsd),
      route: 'test-seed',
    },
  });
}

async function createSession(
  app: INestApplication,
  user: TestUser,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/questions')
    .set(authHeader(user))
    .send({
      prompt:
        'Design a system that accepts incoming events from a webhook and dispatches them to subscribers. Include retries.',
      seniority: 'mid',
    })
    .expect(201);
  // POST /api/questions creates BOTH the question + the first session
  // atomically. The inline session is what hint/eval routes scope to.
  return res.body.session.id;
}

describe('Cost cap (e2e)', () => {
  let app: INestApplication;
  let llmCall: jest.Mock;

  beforeAll(async () => {
    const built = await createTestApp({ llmProviderName: 'anthropic' });
    app = built.app;
    llmCall = built.llmCall;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
    llmCall.mockClear();
  });

  it('blocks an LLM-bound POST when today\'s spend >= cap (403 COST_CAP_EXCEEDED)', async () => {
    const user = await signupUser(app);
    const sessionId = await createSession(app, user);
    await seedSpend(app, user.id, 5.5); // $5.50 against $5 cap

    const res = await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/hints`)
      .set(authHeader(user))
      .send({ message: 'a question that would normally call the LLM' })
      .expect(403);

    expect(res.body.code).toBe('COST_CAP_EXCEEDED');
    expect(res.body.spentTodayUsd).toBeCloseTo(5.5, 6);
    expect(res.body.capUsd).toBe(5);
    expect(res.body.resetAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    // Critically: the fake provider was NOT called — the cap pre-check fired
    // before LlmService.call dispatched.
    expect(llmCall).not.toHaveBeenCalled();
  });

  it('permits the request when spend is under the cap', async () => {
    const user = await signupUser(app);
    const sessionId = await createSession(app, user);
    await seedSpend(app, user.id, 4.5); // $4.50 of $5

    await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/hints`)
      .set(authHeader(user))
      .send({ message: 'still within budget' })
      .expect(201);

    expect(llmCall).toHaveBeenCalledTimes(1);
  });

  it('records a new spend row after a successful LLM call (record() post-hook)', async () => {
    const user = await signupUser(app);
    const sessionId = await createSession(app, user);

    await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/hints`)
      .set(authHeader(user))
      .send({ message: 'first hint' })
      .expect(201);

    const rows = await prismaOf(app).llmSpend.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].route).toBe('hints.send');
    expect(rows[0].provider).toBe('anthropic');
    expect(rows[0].model).toBe('claude-opus-4-7');
    expect(rows[0].tokensIn).toBe(100);
    expect(rows[0].tokensOut).toBe(50);
    // anthropic pricing: 100/1M * $5 + 50/1M * $25 = $0.000500 + $0.001250 = $0.00175
    expect(Number(rows[0].estimatedCostUsd)).toBeCloseTo(0.00175, 6);
  });

  it('is per-user — user B is not affected by user A spending the cap', async () => {
    const userA = await signupUser(app);
    const userB = await signupUser(app);
    const sessionB = await createSession(app, userB);
    await seedSpend(app, userA.id, 6.0); // A is way over

    // B should still be able to call — B's own bucket is empty.
    await request(app.getHttpServer())
      .post(`/api/sessions/${sessionB}/hints`)
      .set(authHeader(userB))
      .send({ message: 'B is fine' })
      .expect(201);
  });

  it('does not count yesterday\'s spend toward today\'s cap', async () => {
    const user = await signupUser(app);
    const sessionId = await createSession(app, user);
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await seedSpend(app, user.id, 10.0, yesterday); // Way over, but yesterday

    await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/hints`)
      .set(authHeader(user))
      .send({ message: 'today should be fresh' })
      .expect(201);
  });
});
