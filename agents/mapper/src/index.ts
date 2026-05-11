#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'node:path';
import { runMapper } from './run';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('codebase-mapper')
    .description(
      'Walk this monorepo, list every module, and emit a per-package markdown map ' +
        'with structural facts plus an LLM-inferred responsibility paragraph.',
    )
    .option(
      '--package <name>',
      'which package to map: backend | frontend | cli | all',
      'all',
    )
    .option(
      '--output <dir>',
      'output directory (relative to repo root)',
      './agents/codebase-map',
    )
    .option('--with-llm', 'run the LLM responsibility-synthesis phase (default)', true)
    .option('--no-with-llm', 'skip the LLM phase; emit structural-only map')
    .option('--json', 'also emit a per-package JSON sidecar', false)
    .option('--model <name>', 'model id (anthropic id or claude-cli model name)', undefined)
    .option(
      '--provider <name>',
      'LLM provider: auto | anthropic | claude-cli (default: auto)',
      'auto',
    )
    .option('--list-modules', 'print discovered module list to stdout and exit', false)
    .option('--repo-root <dir>', 'override repo root (default: cwd)', undefined)
    .parse(process.argv);

  const opts = program.opts<{
    package: string;
    output: string;
    withLlm: boolean;
    json: boolean;
    model?: string;
    provider: string;
    listModules: boolean;
    repoRoot?: string;
  }>();

  const validPackages = ['all', 'backend', 'frontend', 'cli'] as const;
  type ValidPackage = (typeof validPackages)[number];
  if (!validPackages.includes(opts.package as ValidPackage)) {
    console.error(
      `--package must be one of: ${validPackages.join(', ')} (got "${opts.package}")`,
    );
    process.exit(2);
  }

  const validProviders = ['auto', 'anthropic', 'claude-cli'] as const;
  type ValidProvider = (typeof validProviders)[number];
  if (!validProviders.includes(opts.provider as ValidProvider)) {
    console.error(
      `--provider must be one of: ${validProviders.join(', ')} (got "${opts.provider}")`,
    );
    process.exit(2);
  }

  const repoRoot = opts.repoRoot ? path.resolve(opts.repoRoot) : process.cwd();
  const outputDir = path.resolve(repoRoot, opts.output);
  const model = opts.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;

  try {
    const result = await runMapper({
      repoRoot,
      outputDir,
      packages: opts.package as ValidPackage,
      withLlm: opts.withLlm,
      withJson: opts.json,
      model,
      provider: opts.provider as ValidProvider,
      listModulesOnly: opts.listModules,
    });
    if (!opts.listModules) {
      // eslint-disable-next-line no-console
      console.log(`Wrote ${result.outputFiles.length} file(s) to ${outputDir}.`);
      for (const f of result.outputFiles) {
        // eslint-disable-next-line no-console
        console.log(`  ${path.relative(repoRoot, f)}`);
      }
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
