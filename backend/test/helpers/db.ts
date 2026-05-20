import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/database/prisma.service';

// Truncate every table except _prisma_migrations between tests so each
// spec starts on a clean slate. Order doesn't matter because we use
// CASCADE; foreign keys get cleared along with the parents.
const TABLES = [
  'llm_spend',
  'evaluation_audits',
  'signal_mentor_artifacts',
  'mentor_artifacts',
  'phase_evaluations',
  'build_ai_interactions',
  'build_events',
  'ai_interactions',
  'snapshots',
  'final_artifacts',
  'sessions',
  'questions',
  'users',
];

export async function truncateAll(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`,
  );
}

export function prismaOf(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}
