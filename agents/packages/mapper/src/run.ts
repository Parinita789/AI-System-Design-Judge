import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPackages, packageByName } from './scan/discover-packages';
import { discoverModules } from './scan/discover-modules';
import { walkImports } from './scan/walk-imports';
import { buildGraph, FileWithImports, invertEdges } from './scan/build-graph';
import { selectKeyFiles } from './scan/select-key-files';
import { MapperLlmClient } from './llm/llm-client';
import { createLlmClient, ProviderChoice } from './llm/create-client';
import { synthesizeOne } from './llm/synthesize';
import { renderPackageMarkdown } from './render/markdown';
import { renderPackageJson } from './render/json';
import { renderIndex } from './render/index-md';
import { ModuleSummary, PackageDescriptor, PackageMap } from './types';

export interface RunOptions {
  repoRoot: string;
  outputDir: string;
  packages: 'all' | 'backend' | 'frontend' | 'cli';
  withLlm: boolean;
  withJson: boolean;
  model: string;
  provider: ProviderChoice;
  listModulesOnly: boolean;
  // Test seam: lets specs inject a stub LLM client without env or
  // real API.
  llmClient?: MapperLlmClient;
}

export interface RunResult {
  maps: PackageMap[];
  outputFiles: string[];
}

export async function runMapper(opts: RunOptions): Promise<RunResult> {
  const allPackages = discoverPackages(opts.repoRoot);
  if (allPackages.length === 0) {
    throw new Error(`No packages found at ${opts.repoRoot} (looked for backend/, frontend/, cli/).`);
  }

  const targetPackages =
    opts.packages === 'all'
      ? allPackages
      : (() => {
          const found = packageByName(allPackages, opts.packages);
          if (!found) throw new Error(`Package "${opts.packages}" not found at ${opts.repoRoot}.`);
          return [found];
        })();

  if (opts.listModulesOnly) {
    for (const pkg of targetPackages) {
      const mods = discoverModules(pkg, opts.repoRoot);
      // eslint-disable-next-line no-console
      console.log(`# ${pkg.name}`);
      for (const m of mods) {
        // eslint-disable-next-line no-console
        console.log(`  ${m.id}  (${m.files.length} files, ${m.path})`);
      }
    }
    return { maps: [], outputFiles: [] };
  }

  // Build the structural map for every target package up front. The
  // LLM phase runs after, so a structural error short-circuits before
  // any API calls.
  const generatedAt = new Date().toISOString();
  const structuralMaps = targetPackages.map((pkg) =>
    buildPackageMap(pkg, opts.repoRoot, generatedAt, opts.withLlm ? opts.model : undefined),
  );

  const finalMaps: PackageMap[] = [];
  if (opts.withLlm) {
    const client =
      opts.llmClient ??
      createLlmClient({ provider: opts.provider }).client;
    for (const pre of structuralMaps) {
      const enriched = await enrichWithLlm(pre.map, pre.modules, client, opts.model);
      finalMaps.push(enriched);
    }
  } else {
    for (const pre of structuralMaps) finalMaps.push(pre.map);
  }

  // Write outputs.
  fs.mkdirSync(opts.outputDir, { recursive: true });
  const outputFiles: string[] = [];
  for (const map of finalMaps) {
    const mdPath = path.join(opts.outputDir, `${map.package}.md`);
    fs.writeFileSync(mdPath, renderPackageMarkdown(map));
    outputFiles.push(mdPath);
    if (opts.withJson) {
      const jsonPath = path.join(opts.outputDir, `${map.package}.json`);
      fs.writeFileSync(jsonPath, renderPackageJson(map));
      outputFiles.push(jsonPath);
    }
  }
  const indexPath = path.join(opts.outputDir, 'index.md');
  fs.writeFileSync(indexPath, renderIndex(finalMaps, generatedAt, opts.withLlm ? opts.model : undefined));
  outputFiles.push(indexPath);

  return { maps: finalMaps, outputFiles };
}

interface PreEnrichmentMap {
  map: PackageMap;
  // Discovered modules paired by id with the summaries; needed for
  // key-file selection during enrichment.
  modules: Map<string, import('./types').DiscoveredModule>;
}

function buildPackageMap(
  pkg: PackageDescriptor,
  repoRoot: string,
  generatedAt: string,
  model?: string,
): PreEnrichmentMap {
  const discovered = discoverModules(pkg, repoRoot);

  // Walk imports for every non-empty file.
  const filesByModule = new Map<string, FileWithImports[]>();
  const exportsByFile = new Map<string, string[]>();
  for (const m of discovered) {
    const list: FileWithImports[] = [];
    for (const f of m.files) {
      try {
        const fi = walkImports(f.absPath);
        list.push({ absPath: f.absPath, imports: fi.imports });
        if (fi.exports.length > 0) exportsByFile.set(f.absPath, fi.exports);
      } catch {
        // Skip unparseable files; they don't contribute edges or
        // exports. Other files in the module continue.
        list.push({ absPath: f.absPath, imports: [] });
      }
    }
    filesByModule.set(m.id, list);
  }

  const edges = buildGraph(discovered, filesByModule);
  const inbound = invertEdges(edges);

  const moduleIndex = new Map<string, import('./types').DiscoveredModule>();
  const summaries: ModuleSummary[] = discovered.map((m) => {
    moduleIndex.set(m.id, m);
    const e = edges.get(m.id) ?? { internalDepsOut: [], externalDeps: [] };
    const exportsForModule: string[] = [];
    for (const f of m.files) {
      if (f.isTest) continue;
      const list = exportsByFile.get(f.absPath);
      if (list) {
        for (const x of list) {
          if (!exportsForModule.includes(x)) exportsForModule.push(x);
        }
      }
    }
    return {
      id: m.id,
      path: m.path,
      fileCount: m.files.filter((f) => !f.isTest).length,
      testFileCount: m.files.filter((f) => f.isTest).length,
      exports: exportsForModule,
      internalDepsOut: e.internalDepsOut,
      internalDepsIn: inbound.get(m.id) ?? [],
      externalDeps: e.externalDeps,
      testsFor: m.files.filter((f) => f.isTest).map((f) => f.repoPath),
    };
  });

  return {
    map: {
      package: pkg.name,
      root: pkg.root,
      generatedAt,
      ...(model !== undefined ? { model } : {}),
      modules: summaries,
    },
    modules: moduleIndex,
  };
}

async function enrichWithLlm(
  map: PackageMap,
  moduleIndex: Map<string, import('./types').DiscoveredModule>,
  client: MapperLlmClient,
  model: string,
): Promise<PackageMap> {
  // Fan out all modules in parallel. The MapperAnthropicClient's
  // internal semaphore (default 3) is what actually caps in-flight
  // requests; without Promise.all the loop awaited each call
  // sequentially and the semaphore never gated anything. Module
  // order is preserved because Promise.all preserves position.
  const enriched = await Promise.all(
    map.modules.map(async (summary): Promise<ModuleSummary> => {
      const mod = moduleIndex.get(summary.id);
      if (!mod) return summary;
      // Skip modules with no non-test files — the prompt's
      // "Insufficient signal" gate would fire anyway, save the
      // round trip.
      if (selectKeyFiles(mod).length === 0) return summary;
      const result = await synthesizeOne(client, model, { module: mod, summary });
      return {
        ...summary,
        ...(result.responsibility !== undefined ? { responsibility: result.responsibility } : {}),
        ...(result.unverifiedCitation ? { unverifiedCitation: true } : {}),
        ...(result.synthesisError !== undefined ? { synthesisError: result.synthesisError } : {}),
      };
    }),
  );
  return { ...map, modules: enriched };
}
