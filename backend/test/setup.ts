// Runs before each test file's modules are imported. Sets process.env
// overrides BEFORE NestJS / Prisma read them, so the test suite always
// targets the test DB regardless of what backend/.env says.
//
// Important: dotenv (loaded by ConfigModule.forRoot) does NOT overwrite
// existing process.env values, so setting these here wins over .env.

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://parinita@localhost:5432/ai_judge_test?schema=public';

// Stable secret so JWTs are deterministic across the suite. Must be
// long enough to satisfy AuthService's HS256 minimum (32 bytes).
process.env.JWT_SECRET =
  process.env.JWT_SECRET ??
  '0000000000000000000000000000000000000000000000000000000000000000';

// Force the LLM dispatch path to ollama at module load. The factory
// resolves once at boot, so this just ensures the module compiles —
// individual tests override LlmProviderFactory.get with a stub
// when they exercise an LLM-bound route (see helpers/app.ts).
process.env.LLM_PROVIDER = 'ollama';
delete process.env.ANTHROPIC_API_KEY;

// Cap default is $5/user/day. Tests that exercise the cap path seed
// the ledger directly via Prisma so they don't depend on real spend.
process.env.LLM_DAILY_CAP_USD = '5.00';

// Bypass the global rate limiter — see UserOrIpThrottlerGuard for the
// double-condition (NODE_ENV + SKIP_THROTTLE) that keeps this from
// ever firing in prod. Throttle behavior itself is unit-tested in
// user-or-ip-throttler.guard.spec.ts.
process.env.SKIP_THROTTLE = '1';
