import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { BuildTokenService } from '../services/build-token.service';

export interface AuthedRequest extends Request {
  buildSessionId?: string;
}

@Injectable()
export class BuildSessionGuard implements CanActivate {
  constructor(private readonly tokens: BuildTokenService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'];
    if (!header || typeof header !== 'string') {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) {
      throw new UnauthorizedException('Authorization header must be `Bearer <token>`');
    }
    const verified = await this.tokens.verify(match[1]);
    if (!verified) {
      throw new ForbiddenException('Invalid, expired, or finished build token');
    }
    req.buildSessionId = verified.sessionId;
    return true;
  }
}

// Helper for controllers to read the guard's resolution off the
// request without touching `any`.
export function resolvedBuildSessionId(req: AuthedRequest): string {
  if (!req.buildSessionId) {
    throw new Error('BuildSessionGuard did not run before this controller');
  }
  return req.buildSessionId;
}
