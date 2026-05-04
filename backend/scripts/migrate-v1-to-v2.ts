/* eslint-disable no-console */
//
// One-shot migration: upgrade v1.0 questions to v2.0 with classified mode.
//
// v1.0 questions store rubric_version='v1.0', mode=NULL, and require the LLM
// to self-classify Mode A vs Mode B at evaluation time. Smaller models
// (Haiku) fail this classification step, producing inconsistent verdicts
// across re-evaluations.
//
// v2.0 fixes this: classifyMode() runs deterministically at question
// creation time and the rubric variant is locked in. This script backfills
// existing v1.0 questions to the same v2.0 shape so re-evaluations pick
// up the right rubric variant going forward.
//
// Usage:
//   npm run migrate:v1-to-v2                # dry run (default; prints plan)
//   npm run migrate:v1-to-v2 -- --apply     # commit the changes
//   npm run migrate:v1-to-v2 -- --question=<uuid>  # limit to one question
//
// Idempotent: running on already-v2.0 questions is a no-op.
// Existing PhaseEvaluation rows are NOT touched — their historical
// verdicts stand. Only future re-evaluations pick up the new rubric.

import { NestFactory } from '@nestjs/core';
import { Mode as PrismaMode, Seniority as PrismaSeniority } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { classifyMode } from '../src/modules/evaluations/helpers/mode-classifier';

interface CliArgs {
  apply: boolean;
  questionId?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { apply: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--question=')) out.questionId = arg.slice('--question='.length);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(2);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`Usage: ts-node scripts/migrate-v1-to-v2.ts [--apply] [--question=<uuid>]

Backfills v1.0 questions to v2.0 with classifyMode() and a default
seniority of 'senior' on each session that lacks one.

  --apply     Commit the changes. Without this flag the script is a dry run.
  --question  Limit the migration to a single question id.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const prisma = app.get(PrismaService);

    const questions = await prisma.question.findMany({
      where: {
        rubricVersion: 'v1.0',
        ...(args.questionId ? { id: args.questionId } : {}),
      },
      include: {
        sessions: { select: { id: true, seniority: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (questions.length === 0) {
      console.log(
        args.questionId
          ? `No v1.0 question found with id=${args.questionId}.`
          : 'No v1.0 questions to migrate. Already on v2.0+.',
      );
      return;
    }

    console.log(
      `${args.apply ? '[applying]' : '[dry-run]'} Found ${questions.length} v1.0 question(s):\n`,
    );

    let migratedQuestions = 0;
    let backfilledSessions = 0;

    for (const q of questions) {
      const newMode: PrismaMode = classifyMode(q.prompt) as PrismaMode;
      const sessionsToBackfill = q.sessions.filter((s) => s.seniority === null);

      const truncated = q.prompt.length > 70 ? q.prompt.slice(0, 67) + '...' : q.prompt;
      console.log(`  ${q.id}`);
      console.log(`    prompt: "${truncated}"`);
      console.log(`    rubric_version: 'v1.0' → 'v2.0'`);
      console.log(`    mode: NULL → '${newMode}'`);
      console.log(
        `    sessions: ${q.sessions.length} total, ${sessionsToBackfill.length} ` +
          `seniority NULL → 'senior'`,
      );
      console.log('');

      if (args.apply) {
        await prisma.$transaction([
          prisma.question.update({
            where: { id: q.id },
            data: { rubricVersion: 'v2.0', mode: newMode },
          }),
          ...sessionsToBackfill.map((s) =>
            prisma.session.update({
              where: { id: s.id },
              data: { seniority: 'senior' as PrismaSeniority },
            }),
          ),
        ]);
        migratedQuestions++;
        backfilledSessions += sessionsToBackfill.length;
      }
    }

    if (args.apply) {
      console.log(
        `✓ Migrated ${migratedQuestions} question(s); ` +
          `backfilled seniority on ${backfilledSessions} session(s).`,
      );
    } else {
      console.log('Dry run — nothing committed. Pass --apply to write the changes.');
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('migrate-v1-to-v2 crashed:', err);
  process.exit(1);
});
