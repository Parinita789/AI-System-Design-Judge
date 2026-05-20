import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthenticatedRequest } from '../auth/types/auth.types';

// Default ThrottlerGuard tracks by IP only. We swap to:
//   - req.user.id  if the global AuthGuard already attached a user
//                  (i.e. the request carries a valid JWT)
//   - req.ip       fall-through for @Public() routes (signup, login)
//                  and @CliAuthenticated routes that bypass AuthGuard
//
// Tracking by user means a single bad actor can't drain another
// user's throttle budget just by sharing a NAT'd IP — common on
// corporate networks. IP fallback for anonymous still prevents the
// classic curl-loop attack on the login endpoint.
//
// Guard ordering matters: in AppModule's APP_GUARD chain, AuthGuard
// runs FIRST so req.user is populated before getTracker is called.
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Test-only bypass: e2e specs run dozens of signup/login requests
    // back-to-back from 127.0.0.1, which would otherwise saturate the
    // global short/medium tiers + the AUTH_BRUTE_FORCE_THROTTLE preset
    // and turn the suite red. NestJS's overrideGuard() doesn't replace
    // APP_GUARD-registered guards, and overriding ThrottlerStorage is
    // gnarly — env-aware short-circuit is the cleanest exit. The two
    // conditions in tandem keep this from ever firing in prod by
    // accident.
    if (process.env.NODE_ENV === 'test' && process.env.SKIP_THROTTLE === '1') {
      return true;
    }
    return super.canActivate(context);
  }

  protected async getTracker(req: AuthenticatedRequest): Promise<string> {
    if (req.user?.id) return `user:${req.user.id}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
