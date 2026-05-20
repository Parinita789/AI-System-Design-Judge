import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { signupUser, authHeader, type TestUser } from './helpers/users';

async function createSessionAs(app: INestApplication, user: TestUser): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/questions')
    .set(authHeader(user))
    .send({
      prompt:
        'Design a system that accepts incoming events from a webhook and dispatches them to subscribers.',
      seniority: 'mid',
    })
    .expect(201);
  return res.body.session.id;
}

async function questionIdOf(app: INestApplication, user: TestUser, sessionId: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .get(`/api/sessions/${sessionId}`)
    .set(authHeader(user))
    .expect(200);
  return res.body.questionId;
}

describe('Ownership boundaries (e2e)', () => {
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

  it("user B cannot read user A's session (GET /api/sessions/:id returns 403)", async () => {
    const userA = await signupUser(app);
    const userB = await signupUser(app);
    const sessionA = await createSessionAs(app, userA);

    // A reads their own session — allowed.
    await request(app.getHttpServer())
      .get(`/api/sessions/${sessionA}`)
      .set(authHeader(userA))
      .expect(200);

    // B tries to read A's session — forbidden.
    await request(app.getHttpServer())
      .get(`/api/sessions/${sessionA}`)
      .set(authHeader(userB))
      .expect(403);
  });

  it("user B cannot send a hint into user A's session (POST returns 403)", async () => {
    const userA = await signupUser(app);
    const userB = await signupUser(app);
    const sessionA = await createSessionAs(app, userA);

    await request(app.getHttpServer())
      .post(`/api/sessions/${sessionA}/hints`)
      .set(authHeader(userB))
      .send({ message: "trying to use someone else's session" })
      .expect(403);
  });

  it("user B cannot delete user A's question (DELETE returns 403 or 404)", async () => {
    const userA = await signupUser(app);
    const userB = await signupUser(app);

    const q = await request(app.getHttpServer())
      .post('/api/questions')
      .set(authHeader(userA))
      .send({
        prompt: 'Design a small URL shortener with the constraint of being read-heavy.',
        seniority: 'mid',
      })
      .expect(201);
    const questionId = q.body.question.id;

    // 403 (ownership check fires) or 404 (filtered list never returns the row);
    // either is correct as long as it's not 200.
    const res = await request(app.getHttpServer())
      .delete(`/api/questions/${questionId}`)
      .set(authHeader(userB));
    expect([403, 404]).toContain(res.status);

    // Question still exists for A.
    await request(app.getHttpServer())
      .get(`/api/questions/${questionId}`)
      .set(authHeader(userA))
      .expect(200);
  });
});
