import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { signupUser, authHeader } from './helpers/users';

describe('Auth boundaries (e2e)', () => {
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

  describe('signup + login flow', () => {
    it('signup returns a JWT + SafeUser (no passwordHash leak)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({ email: 'first@test.local', password: 'goodpassword1234' })
        .expect(201);

      expect(res.body.token).toMatch(/^eyJ/); // JWT header is base64-encoded "{
      expect(res.body.user.email).toBe('first@test.local');
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('login with the signup password returns the same user id', async () => {
      const signup = await signupUser(app, { email: 'lf@test.local' });
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'lf@test.local', password: 'integration-test-password-1234' })
        .expect(200);
      expect(res.body.user.id).toBe(signup.id);
    });

    it('login with the wrong password returns 401', async () => {
      await signupUser(app, { email: 'lf2@test.local' });
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'lf2@test.local', password: 'wrong-password-here' })
        .expect(401);
    });

    it('login for a non-existent user returns 401 (not 404 — avoids enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: 'whatever1234567' })
        .expect(401);
    });

    it('signup rejects duplicate emails with 409', async () => {
      await signupUser(app, { email: 'dup@test.local' });
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({ email: 'dup@test.local', password: 'integration-test-password-1234' })
        .expect(409);
    });
  });

  describe('AuthGuard: protected routes', () => {
    it('GET /api/auth/me without a token returns 401', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('GET /api/auth/me with a valid JWT returns the SafeUser', async () => {
      const user = await signupUser(app);
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set(authHeader(user))
        .expect(200);
      expect(res.body.id).toBe(user.id);
      expect(res.body.email).toBe(user.email);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('GET /api/auth/me with a tampered JWT returns 401', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set({ Authorization: 'Bearer not-a-real-jwt' })
        .expect(401);
    });

    it('GET /api/sessions without a token returns 401', async () => {
      await request(app.getHttpServer()).get('/api/sessions').expect(401);
    });
  });
});
