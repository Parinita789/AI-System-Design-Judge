import { SetMetadata } from '@nestjs/common';

// Marker key the AuthGuard reads via Reflector. Lives next to the
// decorator so guard code and decorator code can't drift.
export const IS_PUBLIC_KEY = 'auth:is-public';

// Marks a route as exempt from AuthGuard. Use on /auth/signup +
// /auth/login (and any future health/readiness route). When AuthGuard
// is registered globally via APP_GUARD, every route without
// @Public() requires a valid JWT.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
