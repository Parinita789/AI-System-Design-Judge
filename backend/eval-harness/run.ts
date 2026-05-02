/* eslint-disable no-console */
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PlanAgent } from '../src/modules/evaluations/agents/plan.agent';
import { RubricLoaderService } from '../src/modules/evaluations/services/rubric-loader.service';
import { PhaseEvalInput } from '../src/modules/evaluations/types/evaluation.types';
import { LLM_ENV } from '../src/modules/llm/constants';
import { loadFixtures, validateAgainstRubric } from './fixture-loader';
import { compareResult } from './comparator';
import { printConsoleReport, writeJsonReport } from './reporter';
import { Fixture, SuiteReport } from './types';

interface CliArgs {
  filter?: string;
  out?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--filter=')) out.filter = arg.slice('--filter='.length);
    else if (arg.startsWith('--out=')) out.out = arg.slice('--out='.length);
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
  console.log(`Usage: ts-node eval-harness/run.ts [--filter=<substring>] [--out=<path.json>]

Runs the plan-phase eval harness against the configured LLM provider.
Provider selection follows backend/.env (LLM_PROVIDER, OLLAMA_BASE_URL, ...).

  --filter   Only run fixtures whose directory name contains this substring.
  --out      Write a JSON report to this path (in addition to console output).

Exit code: 0 if every (non-warnOnly) fixture passed, 1 otherwise.`);
}

function buildInput(fx: Fixture): PhaseEvalInput {
  const now = new Date();
  const planSize = fx.planMd?.length ?? 0;
  return {
    session: {
      id: `harness-${fx.name}`,
      prompt: fx.question,
      startedAt: now,
      endedAt: now,
    },
    planMd: fx.planMd,
    snapshots: [{ takenAt: now, elapsedMinutes: 30, planMdSize: planSize }],
    hints:
      fx.hints?.map((h) => ({
        occurredAt: new Date(h.occurredAt),
        elapsedMinutes: h.elapsedMinutes,
        prompt: h.prompt,
        response: h.response,
      })) ?? [],
    rubricVersion: fx.rubricVersion,
    mode: fx.mode,
    seniority: fx.seniority ?? 'senior',
  };
}

function resolveProviderName(config: ConfigService): string {
  if (config.get<string>(LLM_ENV.LLM_PROVIDER) === 'claude_cli') return 'claude_cli';
  if (config.get<string>(LLM_ENV.OLLAMA_BASE_URL)) return 'ollama';
  return 'anthropic';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const fixturesDir = path.join(__dirname, 'fixtures');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  try {
    const planAgent = app.get(PlanAgent);
    const rubricLoader = app.get(RubricLoaderService);
    const config = app.get(ConfigService);

    const fixtures = loadFixtures(fixturesDir, args.filter);

    // Validate expected-signal ids against each fixture's resolved rubric
    // before any LLM call so typos fail fast.
    const rubricCache = new Map<string, ReadonlySet<string>>();
    for (const fx of fixtures) {
      const seniority = fx.seniority ?? 'senior';
      const cacheKey = `${fx.rubricVersion}/${fx.mode ?? 'default'}/${seniority}`;
      let ids = rubricCache.get(cacheKey);
      if (!ids) {
        const rubric = await rubricLoader.load(
          fx.rubricVersion,
          'plan',
          fx.mode,
          seniority,
        );
        ids = new Set(rubric.signals.map((s) => s.id));
        rubricCache.set(cacheKey, ids);
      }
      validateAgainstRubric(fx, ids);
    }

    console.log(
      `Running ${fixtures.length} fixture(s) on provider=${resolveProviderName(config)}…\n`,
    );

    const t0 = Date.now();
    const results = [];
    let modelUsed = '';
    for (const fx of fixtures) {
      const input = buildInput(fx);
      const start = Date.now();
      const out = await planAgent.evaluate(input);
      const elapsed = Date.now() - start;
      modelUsed = out.audit.modelUsed;
      results.push(compareResult(fx, out, elapsed, out.audit.modelUsed));
    }

    const report: SuiteReport = {
      results,
      totalElapsedMs: Date.now() - t0,
      provider: resolveProviderName(config),
      model: modelUsed,
      rubricVersion: fixtures[0].rubricVersion,
    };

    printConsoleReport(report);
    if (args.out) writeJsonReport(report, args.out);

    const failed = results.filter((r) => !r.pass).length;
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('eval-harness crashed:', err);
  process.exit(1);
});
