import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest, AuthenticatedUser } from '../types/auth.types';

// Pull req.user into a handler parameter. AuthGuard must have run
// first (either via global APP_GUARD or @UseGuards) — if it hasn't,
// this returns undefined and the handler will misbehave. There's no
// type-safe way to assert the guard ran; rely on the convention that
// every non-@Public route is guarded.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
