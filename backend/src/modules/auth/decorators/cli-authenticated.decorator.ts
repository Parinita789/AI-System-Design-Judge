import { SetMetadata } from '@nestjs/common';

// Marker key the AuthGuard reads via Reflector. Distinct from
// IS_PUBLIC_KEY so a reader of the code can tell at a glance that
// a route is auth'd via a different mechanism, not literally public.
export const IS_CLI_AUTHENTICATED_KEY = 'auth:cli-authenticated';

// Marks a route as auth'd by a non-JWT mechanism (today: the CLI
// bearer token validated by BuildSessionGuard). The global AuthGuard
// skips JWT verification for these routes — but they MUST still
// declare their own guard via @UseGuards(...). Forgetting that
// turns the route into a real public endpoint.
//
// Compared to @Public():
//   @Public()           → no auth at all (signup, login)
//   @CliAuthenticated() → auth'd by a sibling guard (CLI bearer token,
//                          future webhook signature, etc.)
//
// The two are semantically distinct even though they have the same
// effect on the JWT AuthGuard — the names exist so the intent shows
// up in the code.
export const CliAuthenticated = () => SetMetadata(IS_CLI_AUTHENTICATED_KEY, true);
