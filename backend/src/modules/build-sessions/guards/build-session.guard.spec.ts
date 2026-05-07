import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { BuildSessionGuard } from './build-session.guard';

function ctxWith(headers: Record<string, string | undefined>): {
  ctx: ExecutionContext;
  req: { headers: Record<string, string | undefined>; buildSessionId?: string };
} {
  const req = { headers } as { headers: Record<string, string | undefined>; buildSessionId?: string };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe('BuildSessionGuard', () => {
  it('throws 401 when Authorization header is missing', async () => {
    const tokens = { verify: jest.fn() };
    const guard = new BuildSessionGuard(tokens as never);
    const { ctx } = ctxWith({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it('throws 401 when the header is not Bearer-shaped', async () => {
    const tokens = { verify: jest.fn() };
    const guard = new BuildSessionGuard(tokens as never);
    const { ctx } = ctxWith({ authorization: 'Basic abcd' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.verify).not.toHaveBeenCalled();
  });

  it('throws 403 when verify rejects the token', async () => {
    const tokens = { verify: jest.fn().mockResolvedValue(null) };
    const guard = new BuildSessionGuard(tokens as never);
    const { ctx } = ctxWith({ authorization: 'Bearer sid.bad' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokens.verify).toHaveBeenCalledWith('sid.bad');
  });

  it('attaches buildSessionId on success', async () => {
    const tokens = { verify: jest.fn().mockResolvedValue({ sessionId: 'sid-7' }) };
    const guard = new BuildSessionGuard(tokens as never);
    const { ctx, req } = ctxWith({ authorization: 'Bearer sid-7.secret' });
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(req.buildSessionId).toBe('sid-7');
  });

  it('is case-insensitive on the Bearer prefix and trims whitespace', async () => {
    const tokens = { verify: jest.fn().mockResolvedValue({ sessionId: 'sid' }) };
    const guard = new BuildSessionGuard(tokens as never);
    const { ctx } = ctxWith({ authorization: '  bearer    sid.secret  ' });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(tokens.verify).toHaveBeenCalledWith('sid.secret');
  });
});
