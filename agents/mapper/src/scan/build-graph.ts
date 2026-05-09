import * as path from 'node:path';
import * as fs from 'node:fs';
import { DiscoveredModule, FileImports } from '../types';

// Fold per-file imports into per-module dep edges + external npm
// dep counts. The hard part is "which module owns this resolved
// path?" — we build an absPath → moduleId index from the
// DiscoveredModule list, then for each import we (a) resolve the
// import specifier to an absolute path, (b) look it up in the
// index. Misses go to externalDeps (with the import normalized to
// a package name).

const TOP_EXTERNAL_DEPS_PER_MODULE = 5;
const TS_EXT_CANDIDATES = ['.ts', '.tsx', '.mts', '.cts'];

export interface FileWithImports {
  absPath: string;
  imports: string[];
}

export interface ModuleEdges {
  internalDepsOut: string[]; // module ids
  externalDeps: string[]; // top-N npm package names
}

export function buildGraph(
  modules: DiscoveredModule[],
  filesByModule: Map<string, FileWithImports[]>,
): Map<string, ModuleEdges> {
  // Index every source file → its owning module id. A file may
  // technically belong to multiple modules if directories overlap
  // (they shouldn't in this repo), but we record only the first
  // owner found.
  const fileToModule = new Map<string, string>();
  for (const m of modules) {
    for (const f of m.files) {
      // Skip tests for ownership: they shouldn't be the targets of
      // imports from other modules. (Tests can import non-test files
      // freely; this only matters for the inverse direction.)
      if (f.isTest) continue;
      if (!fileToModule.has(f.absPath)) {
        fileToModule.set(f.absPath, m.id);
      }
    }
  }

  const edges = new Map<string, ModuleEdges>();
  for (const m of modules) {
    const internalCounts = new Map<string, number>();
    const externalCounts = new Map<string, number>();

    for (const file of filesByModule.get(m.id) ?? []) {
      // Skip imports inside test files for the dependency graph —
      // tests are mocks-and-fixtures land; their imports tell us
      // nothing about production module dependencies.
      const owner = m.files.find((f) => f.absPath === file.absPath);
      if (owner?.isTest) continue;

      for (const spec of file.imports) {
        if (isRelativeImport(spec)) {
          const targetAbs = resolveRelative(file.absPath, spec);
          if (!targetAbs) continue;
          const targetModule = fileToModule.get(targetAbs);
          if (targetModule && targetModule !== m.id) {
            internalCounts.set(
              targetModule,
              (internalCounts.get(targetModule) ?? 0) + 1,
            );
          }
        } else {
          const pkg = packageNameOf(spec);
          if (pkg) {
            externalCounts.set(pkg, (externalCounts.get(pkg) ?? 0) + 1);
          }
        }
      }
    }

    edges.set(m.id, {
      internalDepsOut: sortByCountDesc(internalCounts),
      externalDeps: sortByCountDesc(externalCounts).slice(0, TOP_EXTERNAL_DEPS_PER_MODULE),
    });
  }

  return edges;
}

// Inverse pass: given the depsOut map, derive depsIn per module.
export function invertEdges(
  edges: Map<string, ModuleEdges>,
): Map<string, string[]> {
  const inbound = new Map<string, string[]>();
  for (const [from, e] of edges) {
    for (const to of e.internalDepsOut) {
      const list = inbound.get(to) ?? [];
      if (!list.includes(from)) list.push(from);
      inbound.set(to, list);
    }
  }
  for (const list of inbound.values()) list.sort();
  return inbound;
}

// -------------------- helpers -------------------- //

function isRelativeImport(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/');
}

function resolveRelative(fromFile: string, spec: string): string | undefined {
  const base = path.resolve(path.dirname(fromFile), spec);
  // Try direct file extensions first.
  for (const ext of TS_EXT_CANDIDATES) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  // Then `<base>/index.ts(x?)`.
  for (const ext of TS_EXT_CANDIDATES) {
    const candidate = path.join(base, 'index' + ext);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  // If the spec literally points at an existing file (rare in
  // TS imports, but possible), accept that.
  if (fs.existsSync(base) && fs.statSync(base).isFile()) {
    return base;
  }
  return undefined;
}

// "@nestjs/common/something" → "@nestjs/common"
// "axios" → "axios"
// "axios/lib/foo" → "axios"
function packageNameOf(spec: string): string | undefined {
  if (!spec) return undefined;
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    if (parts.length < 2) return undefined;
    return `${parts[0]}/${parts[1]}`;
  }
  return spec.split('/')[0];
}

function sortByCountDesc(m: Map<string, number>): string[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);
}
