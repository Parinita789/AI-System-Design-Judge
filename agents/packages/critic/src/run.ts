import * as fs from 'node:fs';
import * as path from 'node:path';
import { CriticLlmClient } from './llm/llm-client';
import { createLlmClient, ProviderChoice } from './llm/create-client';
import { reviewOneFile } from './llm/review-file';
import { reviewOneModule } from './llm/review-module';
import { synthesizeGlobal } from './llm/synthesize-global';
import { SourceMapEntry } from './llm/validate-refs';
import {
  CODEBASE_PACKAGES,
  CodebasePackage,
  loadMaps,
} from './load/load-maps';
import { loadPersona } from './load/load-persona';
import { loadRubric } from './load/load-rubric';
import { loadArchitectureSources } from './load/load-architecture';
import { loadModuleGraphs } from './load/load-graphs';
import { loadCondensedApiFlow } from './load/load-api-flow';
import { enumerateModuleFiles } from './load/enumerate-files';
import { readSourceFile } from './load/read-source';
import { reconcileIssues } from './track/reconcile';
import { loadIssuesIndex } from './track/load-issues';
import { saveIssuesIndex } from './track/save-issues';
import { renderModuleMarkdown } from './render/markdown-module';
import { renderSynthesisMarkdown } from './render/markdown-synthesis';
import { renderIndexMarkdown } from './render/index-md';
import { writeJsonSidecar, safeFilename } from './render/json-sidecar';
import {
  IndexedIssue,
  MapperModuleSummary,
  MapperPackageMap,
  PersistedFileReview,
  PersistedModuleReview,
  PersistedSynthesis,
  ResolvedModule,
} from './types';

export interface RunOptions {
  repoRoot: string;
  outputDir: string;
  lens: string;
  rubricOverride?: string;
  pkg: CodebasePackage | 'all';
  moduleFilter?: string;
  model: string;
  provider: ProviderChoice;
  maxFiles?: number;
  skipSynthesis: boolean;
  track: boolean;
  dryRun: boolean;
  // Test seam.
  clientFactory?: () => { client: CriticLlmClient; chosenProvider: string };
}

export async function run(opts: RunOptions): Promise<{ moduleCount: number; fileCount: number }> {
  const persona = loadPersona(opts.repoRoot, opts.lens);
  const rubric = loadRubric(opts.repoRoot, opts.rubricOverride);
  const maps = loadMaps(opts.repoRoot);

  const resolved = resolveModules(maps.byPackage, opts.pkg, opts.moduleFilter);
  // Exclusion paths come from EVERY module in each package, not just
  // the resolved subset, so `--module=_root` still excludes its
  // siblings rather than swallowing them.
  const allModulesByPkg = collectAllModulePaths(maps.byPackage);
  const moduleSources = enumerateAll(resolved, opts.repoRoot, opts.maxFiles, allModulesByPkg);

  const totalFiles = moduleSources.reduce((s, m) => s + m.filePaths.length, 0);

  log(
    `critic: persona=${opts.lens} model=${opts.model} provider=${opts.provider} ` +
      `modules=${resolved.length} files=${totalFiles}` +
      (opts.dryRun ? ' [dry-run]' : ''),
  );

  if (opts.dryRun) {
    return { moduleCount: resolved.length, fileCount: totalFiles };
  }

  const { client, chosenProvider } = (opts.clientFactory ?? defaultClientFactory(opts.provider))();
  log(`critic: chosen provider = ${chosenProvider}`);

  const runId = new Date().toISOString();
  const startedAt = runId;

  // ------------ Phase 1: per-file ------------
  const moduleReviews: PersistedModuleReview[] = [];
  for (const resolvedMod of moduleSources) {
    if (resolvedMod.filePaths.length === 0) {
      log(`  ${resolvedMod.pkg}/${resolvedMod.summary.id}: no files; skipping`);
      continue;
    }
    log(
      `  ${resolvedMod.pkg}/${resolvedMod.summary.id}: reviewing ${resolvedMod.filePaths.length} file(s)`,
    );
    const fileReviewPromises = resolvedMod.filePaths.map(async (absPath) => {
      const source = readSourceFile(opts.repoRoot, absPath);
      const review = await reviewOneFile({
        client,
        model: opts.model,
        personaText: persona.text,
        rubricText: rubric.text,
        pkg: resolvedMod.pkg,
        module: resolvedMod.summary,
        source,
      });
      // sourceMap for phase-2 validation: line counts post-truncation.
      return { review, sourceMapEntry: { repoPath: source.repoPath, lineCount: source.truncatedAfter } };
    });

    const settled = await Promise.all(fileReviewPromises);
    const fileReviews: PersistedFileReview[] = settled.map((s) => s.review);
    const sourceMap = new Map<string, SourceMapEntry>();
    for (const s of settled) sourceMap.set(s.sourceMapEntry.repoPath, s.sourceMapEntry);

    // Persist per-file JSON.
    const fileRawDir = path.join(opts.outputDir, 'raw', 'file');
    for (const fr of fileReviews) {
      const slug = `${safeFilename(resolvedMod.pkg)}__${safeFilename(resolvedMod.summary.id)}__${safeFilename(fr.file)}.json`;
      writeJsonSidecar(path.join(fileRawDir, slug), fr);
    }

    // ------------ Phase 2: module rollup ------------
    const moduleReview = await reviewOneModule({
      client,
      model: opts.model,
      personaText: persona.text,
      rubricText: rubric.text,
      pkg: resolvedMod.pkg,
      module: resolvedMod.summary,
      fileReviews,
      sourceMap,
    });
    moduleReviews.push(moduleReview);

    const moduleRawPath = path.join(
      opts.outputDir,
      'raw',
      'module',
      `${safeFilename(resolvedMod.pkg)}__${safeFilename(resolvedMod.summary.id)}.json`,
    );
    writeJsonSidecar(moduleRawPath, moduleReview);
  }

  // ------------ Reconcile issues.json ------------
  // Always load the prior index (read-only) so the markdown's Status
  // column shows accurate new/still-open/fixed badges. Only the WRITE
  // back to disk is gated on --track; --no-track is for "let me see
  // status without recording this run as ground truth."
  const priorIndex = loadIssuesIndex(opts.outputDir);
  const finishedAt = new Date().toISOString();
  const reconciled = reconcileIssues({
    prior: priorIndex,
    moduleReviews,
    runId,
    startedAt,
    finishedAt,
    model: opts.model,
    persona: opts.lens,
    rubricSha1: rubric.sha1,
  });
  if (opts.track) {
    saveIssuesIndex(opts.outputDir, reconciled.next);
  }

  // ------------ Phase 3: synthesis ------------
  let synthesis: PersistedSynthesis | null = null;
  if (!opts.skipSynthesis && moduleReviews.length > 0) {
    log(`critic: synthesizing across ${moduleReviews.length} module reviews`);
    const arch = loadArchitectureSources(opts.repoRoot);
    const graphs = loadModuleGraphs(opts.repoRoot);
    const apiFlow = loadCondensedApiFlow(opts.repoRoot);
    synthesis = await synthesizeGlobal({
      client,
      model: opts.model,
      personaText: persona.text,
      rubricText: rubric.text,
      moduleReviews,
      architectureMd: arch.architectureMd,
      schemaMd: arch.schemaMd,
      graphs,
      apiFlow,
    });
    writeJsonSidecar(path.join(opts.outputDir, 'raw', 'synthesis', 'synthesis.json'), synthesis);
  }

  // ------------ Render markdown ------------
  const statusByIssueId = new Map<string, IndexedIssue>();
  for (const issue of reconciled.next.issues) statusByIssueId.set(issue.id, issue);
  const fixedThisRunByModule = new Map<string, IndexedIssue[]>();
  const newThisRun: IndexedIssue[] = [];
  for (const issue of reconciled.next.issues) {
    if (issue.fixedInRun === runId) {
      const list = fixedThisRunByModule.get(issue.module) ?? [];
      list.push(issue);
      fixedThisRunByModule.set(issue.module, list);
    }
    if (issue.firstSeen === runId && issue.status === 'new') {
      newThisRun.push(issue);
    }
  }

  const perModuleDir = path.join(opts.outputDir, 'per-module');
  fs.mkdirSync(perModuleDir, { recursive: true });
  for (const mr of moduleReviews) {
    const md = renderModuleMarkdown({
      result: mr,
      persona: opts.lens,
      model: opts.model,
      statusByIssueId,
      fixedThisRun: fixedThisRunByModule.get(`${mr.pkg}/${mr.module}`) ?? [],
    });
    const filename = `${safeFilename(mr.pkg)}__${safeFilename(mr.module)}.md`;
    fs.writeFileSync(path.join(perModuleDir, filename), md, 'utf8');
  }

  if (synthesis) {
    const latestRun = reconciled.next.runs[reconciled.next.runs.length - 1] ?? null;
    const priorRun = reconciled.next.runs.length >= 2 ? reconciled.next.runs[reconciled.next.runs.length - 2] : null;
    const totalFixed = [...fixedThisRunByModule.values()].flat();
    const md = renderSynthesisMarkdown({
      result: synthesis,
      persona: opts.lens,
      model: opts.model,
      modulesReviewed: moduleReviews.length,
      filesReviewed: totalFiles,
      latestRun,
      priorRun,
      fixedThisRun: totalFixed,
      newThisRun,
    });
    fs.writeFileSync(path.join(opts.outputDir, 'synthesis.md'), md, 'utf8');
  }

  const indexMd = renderIndexMarkdown({
    results: moduleReviews,
    persona: opts.lens,
    model: opts.model,
    generatedAt: finishedAt,
    hasSynthesis: !!synthesis,
  });
  fs.writeFileSync(path.join(opts.outputDir, 'index.md'), indexMd, 'utf8');

  // ------------ End-of-run summary ------------
  const fileStats = collectStats(moduleReviews.flatMap((mr) => mr.fileReviews));
  const moduleStats = collectStats(moduleReviews);
  const synthStat = synthesis
    ? {
        ok: !synthesis.synthesisError && !synthesis.unverifiedRefs,
        unverified: synthesis.unverifiedRefs,
        failed: !!synthesis.synthesisError,
      }
    : null;

  log('');
  log('critic: end-of-run summary');
  log(
    `  files:    ${fileStats.ok}/${fileStats.total} ok · ${fileStats.unverified} unverifiedRefs · ${fileStats.failed} failed`,
  );
  log(
    `  modules:  ${moduleStats.ok}/${moduleStats.total} ok · ${moduleStats.unverified} unverifiedRefs · ${moduleStats.failed} failed`,
  );
  if (synthStat) {
    log(
      `  synth:    ${synthStat.ok ? 'ok' : synthStat.failed ? 'failed' : 'unverifiedRefs'}`,
    );
  }
  log(
    `  issues:   ${reconciled.newIssueIds.length} new · ${reconciled.fixedIssueIds.length} fixed · ${reconciled.stillOpenIssueIds.length} still-open · ${reconciled.carriedForwardWontfixIds.length} wontfix`,
  );

  return { moduleCount: moduleReviews.length, fileCount: totalFiles };
}

function collectStats(results: Array<{ unverifiedRefs: boolean; synthesisError: string | null }>): {
  total: number;
  ok: number;
  unverified: number;
  failed: number;
} {
  let ok = 0;
  let unverified = 0;
  let failed = 0;
  for (const r of results) {
    if (r.synthesisError) failed++;
    else if (r.unverifiedRefs) unverified++;
    else ok++;
  }
  return { total: results.length, ok, unverified, failed };
}

function resolveModules(
  byPackage: Record<CodebasePackage, MapperPackageMap>,
  pkg: CodebasePackage | 'all',
  moduleFilter: string | undefined,
): ResolvedModule[] {
  const packages: CodebasePackage[] =
    pkg === 'all' ? [...CODEBASE_PACKAGES] : [pkg];
  const out: ResolvedModule[] = [];

  // moduleFilter accepts either bare id ("hints") or pkg:id ("backend:hints").
  let filterPkg: CodebasePackage | undefined;
  let filterId: string | undefined;
  if (moduleFilter) {
    const colon = moduleFilter.indexOf(':');
    if (colon >= 0) {
      filterPkg = moduleFilter.slice(0, colon) as CodebasePackage;
      filterId = moduleFilter.slice(colon + 1);
    } else {
      filterId = moduleFilter;
    }
  }

  for (const p of packages) {
    if (filterPkg && filterPkg !== p) continue;
    for (const mod of byPackage[p].modules) {
      if (filterId && mod.id !== filterId) continue;
      out.push({ pkg: p, summary: mod, filePaths: [] });
    }
  }
  return out;
}

function collectAllModulePaths(
  byPackage: Record<CodebasePackage, MapperPackageMap>,
): Map<string, string[]> {
  // For each package, the (repo-relative) paths of every module —
  // used to build the per-module exclusion list. Must include the
  // full set even when the user is reviewing a subset, otherwise
  // synthetic `_root`-style modules would over-enumerate when run
  // alone.
  const out = new Map<string, string[]>();
  for (const [pkg, map] of Object.entries(byPackage)) {
    out.set(
      pkg,
      map.modules.map((m) => m.path),
    );
  }
  return out;
}

function enumerateAll(
  resolved: ResolvedModule[],
  repoRoot: string,
  maxFilesTotal: number | undefined,
  allPathsByPkg: Map<string, string[]>,
): ResolvedModule[] {
  let budget = maxFilesTotal ?? Infinity;
  return resolved.map((r) => {
    const myAbs = path.resolve(repoRoot, r.summary.path);
    const peers = (allPathsByPkg.get(r.pkg) ?? []).map((p) =>
      path.resolve(repoRoot, p),
    );
    const excludeUnderPaths = peers.filter((p) => p !== myAbs);
    const files = enumerateModuleFiles(repoRoot, r.summary, {
      maxFiles: budget === Infinity ? undefined : budget,
      excludeUnderPaths,
    });
    budget -= files.length;
    return { ...r, filePaths: files };
  });
}

function defaultClientFactory(
  provider: ProviderChoice,
): () => { client: CriticLlmClient; chosenProvider: string } {
  return () => createLlmClient({ provider });
}

function log(s: string): void {
  // eslint-disable-next-line no-console
  console.log(s);
}

export { CodebasePackage } from './load/load-maps';
