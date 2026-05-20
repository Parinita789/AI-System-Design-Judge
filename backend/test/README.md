# End-to-end integration suite

Hits real HTTP routes against an in-process Nest app backed by a real
PostgreSQL test DB. Catches the cross-layer bugs unit tests can't: auth
guards firing in the right order, ownership checks blocking the right
user, cost-cap gating the LLM dispatch before `record()` writes.

## One-time setup

```bash
createdb ai_judge_test
```

That's it. The Jest globalSetup runs `prisma db push` against the test
DB before any tests execute, so schema stays in sync with
`prisma/schema.prisma` automatically.

## Run it

```bash
npm run test:e2e
```

Or via the standard test:e2e script (already wired in `package.json`).

## What's covered

| Suite | What it exercises |
|---|---|
| `auth.e2e-spec.ts` | signup/login flow, 401 on protected routes, tampered JWT, duplicate email 409, /me returns SafeUser |
| `ownership.e2e-spec.ts` | user B cannot read/mutate user A's session, question, or hint |
| `cost-cap.e2e-spec.ts` | cap blocks LLM dispatch (403 COST_CAP_EXCEEDED) when spend >= cap; permits under-cap; records spend after success; per-user isolation; yesterday's spend doesn't count |
| `spend-widget.e2e-spec.ts` | `GET /api/cost-cap/today` auth-required, returns correct shape, reflects ledger sum, isolates per user |

## How the test app differs from prod

The TestingModule overrides one thing: `LlmProviderFactory.get()`
returns a stub `LlmProvider` whose `.call()` is a `jest.fn()`. That
lets us test the **wrap** (`assertWithinCap` pre-call, `record`
post-call) without hitting Anthropic. The real `LlmService` /
`CostCapService` still execute; only the provider boundary is
fake. Tests can override the response per `createTestApp({...})`.

Throttling is bypassed in the test environment via a
double-conditioned check in `UserOrIpThrottlerGuard`
(`NODE_ENV === 'test' && SKIP_THROTTLE === '1'`); the throttler
behavior itself is unit-tested in
`src/modules/throttling/user-or-ip-throttler.guard.spec.ts`. Without
the bypass, ~30 rapid signup/login requests from `127.0.0.1`
saturate the global short/medium tiers + `AUTH_BRUTE_FORCE_THROTTLE`.

`maxWorkers: 1` forces serial execution — multiple suites against the
same test DB would race on truncate/insert otherwise.

## Adding a new spec

1. Create `backend/test/<surface>.e2e-spec.ts`.
2. Use `createTestApp(...)` from `helpers/app.ts` to boot the Nest app.
3. Call `truncateAll(app)` in `beforeEach` for a clean slate.
4. Use `signupUser(app)` from `helpers/users.ts` to get an authed JWT.
5. Seed any DB rows you need directly via `prismaOf(app)`.
