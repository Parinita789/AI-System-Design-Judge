import { execSync } from 'node:child_process';

// Runs ONCE before any test file. Ensures the test database schema is
// in sync with prisma/schema.prisma. `db push` is the right tool here:
// migration history has accumulated drift over the project's lifetime
// and we want the test DB to reflect the current schema, not replay
// every historic migration.

export default async function globalSetup(): Promise<void> {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://parinita@localhost:5432/ai_judge_test?schema=public';

  console.log('\n[e2e] syncing test DB schema via prisma db push…');
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  console.log('[e2e] schema in sync.\n');
}
