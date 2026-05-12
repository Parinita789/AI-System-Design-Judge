#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { run } from './run';
import { ProviderChoice } from './llm/create-client';
import { CODEBASE_PACKAGES, CodebasePackage } from './load/load-maps';
import { runDiffCmd } from './track/diff-cmd';
import { runStatusCmd } from './track/status-cmd';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_OUTPUT = './agents/critic-out';
const VALID_PROVIDERS: ProviderChoice[] = ['auto', 'anthropic', 'claude-cli'];
const VALID_PACKAGES = [...CODEBASE_PACKAGES, 'all'] as const;

function resolveRepoRoot(input?: string): string {
  if (input) return path.resolve(input);
  return findRoot(process.cwd());
}

function findRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (
      fs.existsSync(path.join(dir, 'backend')) &&
      fs.existsSync(path.join(dir, 'agents'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('codebase-critic')
    .description(
      'LLM-driven code review agent. Three tiers (file -> module -> global) with stable issue ids tracked across runs.',
    );

  program
    .command('review', { isDefault: true })
    .description('Run the full three-phase review (file -> module -> synthesis).')
    .option('-l, --lens <name>', 'persona name (resolves to agents/critic/personas/<name>.md)', 'staff-engineer')
    .option('-p, --package <name>', 'backend | frontend | cli | all', 'all')
    .option('-m, --module <id>', 'subset: <pkg>:<moduleId> or bare <moduleId>')
    .option('-o, --output <dir>', 'output directory (relative to repo root)', DEFAULT_OUTPUT)
    .option('--rubric <path>', 'override the rubric path (default agents/critic/rubric.md)')
    .option('--model <name>', `LLM model id (default ${DEFAULT_MODEL}, or $LLM_MODEL)`)
    .option('--provider <name>', 'auto | anthropic | claude-cli', 'auto')
    .option('--max-files <N>', 'debug: cap total file reviews', (v) => parseInt(v, 10))
    .option('--skip-synthesis', 'skip phase 3 (no synthesis.md)', false)
    .option('--no-track', "do not update issues.json this run")
    .option('--repo-root <dir>', 'override repo root detection')
    .option('--dry-run', 'log plan + counts, do not call LLM', false)
    .action(async (rawOpts: Record<string, unknown>) => {
      const repoRoot = resolveRepoRoot(rawOpts.repoRoot as string | undefined);
      const pkg = String(rawOpts.package);
      if (!(VALID_PACKAGES as readonly string[]).includes(pkg)) {
        die(`--package must be one of ${VALID_PACKAGES.join('|')}, got "${pkg}"`);
      }
      const provider = String(rawOpts.provider) as ProviderChoice;
      if (!VALID_PROVIDERS.includes(provider)) {
        die(`--provider must be one of ${VALID_PROVIDERS.join('|')}, got "${provider}"`);
      }
      const outputDir = path.resolve(repoRoot, String(rawOpts.output));
      fs.mkdirSync(outputDir, { recursive: true });
      const model =
        (rawOpts.model as string | undefined) ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;

      const trackOpt = rawOpts.track;
      const track = trackOpt === false ? false : true;

      try {
        await run({
          repoRoot,
          outputDir,
          lens: String(rawOpts.lens),
          rubricOverride: rawOpts.rubric as string | undefined,
          pkg: pkg as CodebasePackage | 'all',
          moduleFilter: rawOpts.module as string | undefined,
          model,
          provider,
          maxFiles: rawOpts.maxFiles as number | undefined,
          skipSynthesis: Boolean(rawOpts.skipSynthesis),
          track,
          dryRun: Boolean(rawOpts.dryRun),
        });
      } catch (err) {
        die((err as Error).message);
      }
    });

  program
    .command('diff')
    .description('Print the delta of issues since a prior run. No LLM calls.')
    .option('-o, --output <dir>', 'output directory', DEFAULT_OUTPUT)
    .option('--since <runId>', 'baseline run id (default: prior to latest)')
    .option('--repo-root <dir>', 'override repo root detection')
    .action((rawOpts: Record<string, unknown>) => {
      const repoRoot = resolveRepoRoot(rawOpts.repoRoot as string | undefined);
      const outputDir = path.resolve(repoRoot, String(rawOpts.output));
      const code = runDiffCmd({
        outputDir,
        since: rawOpts.since as string | undefined,
      });
      process.exit(code);
    });

  program
    .command('status <issueId>')
    .description("Print one issue's history. Accepts an id prefix.")
    .option('-o, --output <dir>', 'output directory', DEFAULT_OUTPUT)
    .option('--repo-root <dir>', 'override repo root detection')
    .action((issueId: string, rawOpts: Record<string, unknown>) => {
      const repoRoot = resolveRepoRoot(rawOpts.repoRoot as string | undefined);
      const outputDir = path.resolve(repoRoot, String(rawOpts.output));
      const code = runStatusCmd({ outputDir, issueId });
      process.exit(code);
    });

  await program.parseAsync(process.argv);
}

function die(msg: string): never {
  console.error(`codebase-critic: ${msg}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
