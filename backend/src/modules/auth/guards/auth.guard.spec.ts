import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { PasswordService } from '../services/password.service';
import { InvalidTokenError } from '../errors';

const TEST_SECRET = 'test-secret-only';

function makeContext(opts: {
  authHeader?: string;
  handlerPublic?: boolean;
  classPublic?: boolean;
}): { ctx: ExecutionContext; req: Record<string, unknown> } {
  const req: Record<string, unknown> = {
    headers: opts.authHeader ? { authorization: opts.authHeader } : {},
  };
  const handler = function noop() {};
  const klass = class Anon {};
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => klass,
  } as unknown as ExecutionContext;
  return { ctx, req };
}

function makeGuard(
  opts: { isPublic?: boolean; isCliAuthenticated?: boolean } = {},
) {
  const jwt = new JwtService({ secret: TEST_SECRET, signOptions: { expiresIn: '1h' } });
  const users = { findByEmail: jest.fn(), findById: jest.fn(), create: jest.fn() };
  const auth = new AuthService(users as never, new PasswordService(), jwt);
  const reflector = {
    getAllAndOverride: jest.fn().mockImplementation((key: string) => {
      if (key === 'auth:is-public') return opts.isPublic ?? false;
      if (key === 'auth:cli-authenticated') return opts.isCliAuthenticated ?? false;
      return false;
    }),
  } as unknown as Reflector;
  return { guard: new AuthGuard(auth, reflector), jwt, reflector };
}

describe('AuthGuard', () => {
  it('lets @Public() routes through without a token', async () => {
    const { guard } = makeGuard({ isPublic: true });
    const { ctx, req } = makeContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toBeUndefined();
  });

  it('lets @CliAuthenticated() routes through without a JWT (sibling guard does the check)', async () => {
    const { guard } = makeGuard({ isCliAuthenticated: true });
    const { ctx, req } = makeContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    // Critically, no req.user is attached — the sibling guard (e.g.
    // BuildSessionGuard) is responsible for whatever identity-shape
    // it wants on the request.
    expect(req.user).toBeUndefined();
  });

  it('throws InvalidTokenError("missing") on no Authorization header', async () => {
    const { guard } = makeGuard();
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('throws on malformed Authorization (no Bearer prefix)', async () => {
    const { guard } = makeGuard();
    const { ctx } = makeContext({ authHeader: 'Basic dXNlcjpwYXNz' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('attaches req.user on a valid Bearer token', async () => {
    const { guard, jwt } = makeGuard();
    const token = jwt.sign({ sub: 'uid-1', email: 'alice@example.com' });
    const { ctx, req } = makeContext({ authHeader: `Bearer ${token}` });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'uid-1', email: 'alice@example.com' });
  });

  it('rejects an invalid token', async () => {
    const { guard } = makeGuard();
    const { ctx } = makeContext({ authHeader: 'Bearer not.a.realjwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
