import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

let counter = 0;

/** Sign up a fresh user via the public route. Returns the JWT + identity. */
export async function signupUser(
  app: INestApplication,
  overrides: { email?: string; password?: string } = {},
): Promise<TestUser> {
  counter += 1;
  const email = overrides.email ?? `e2e-${Date.now()}-${counter}@test.local`;
  const password = overrides.password ?? 'integration-test-password-1234';

  const res = await request(app.getHttpServer())
    .post('/api/auth/signup')
    .send({ email, password })
    .expect(201);

  return { id: res.body.user.id, email: res.body.user.email, token: res.body.token };
}

export function authHeader(user: TestUser): Record<string, string> {
  return { Authorization: `Bearer ${user.token}` };
}
