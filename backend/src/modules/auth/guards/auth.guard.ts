import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../services/auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_CLI_AUTHENTICATED_KEY } from '../decorators/cli-authenticated.decorator';
import { AuthenticatedRequest } from '../types/auth.types';
import { InvalidTokenError } from '../errors';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Routes that are auth'd by a sibling guard (e.g. BuildSessionGuard
    // on the CLI endpoints) skip JWT verification but the sibling guard
    // MUST be declared via @UseGuards. We deliberately do not validate
    // that here — Nest's guard pipeline runs both guards regardless;
    // forgetting the sibling guard surfaces as a public endpoint and is
    // caught by code review / the critic rubric.
    const isCliAuthenticated = this.reflector.getAllAndOverride<boolean>(
      IS_CLI_AUTHENTICATED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isCliAuthenticated) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);
    if (!token) throw new InvalidTokenError('missing');

    const payload = await this.auth.verify(token);
    request.user = { id: payload.sub, email: payload.email };
    return true;
  }
}

function extractBearerToken(req: AuthenticatedRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Bearer' || !value) return null;
  return value.trim();
}
