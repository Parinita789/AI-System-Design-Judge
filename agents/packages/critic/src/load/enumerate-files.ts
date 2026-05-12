import * as fs from 'node:fs';
import * as path from 'node:path';
import { MapperModuleSummary } from '../types';

// For a module summary (whose `path` is either a directory or a
// single file relative to repoRoot), enumerate the .ts/.tsx source
// files we want to review. Excludes test files and the usual noise
// dirs.
//
// excludeUnderPaths: absolute directory paths whose contents belong
// to other modules and must NOT be picked up here. This is what
// makes the synthetic `_root` module (path: backend/src) behave
// correctly — without it, _root would recursively swallow every
// other backend module's files.
//
// The result is absolute paths in sorted order so reviews are
// reproducible.

const SOURCE_EXT = /\.(?:tsx?|mts|cts)$/;
const TEST_EXT = /\.(?:test|spec)\.(?:tsx?)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '.git',
]);

export interface EnumerateOptions {
  includeTests?: boolean;
  maxFiles?: number;
  excludeUnderPaths?: string[];
}

export function enumerateModuleFiles(
  repoRoot: string,
  module: MapperModuleSummary,
  opts: EnumerateOptions = {},
): string[] {
  const abs = path.join(repoRoot, module.path);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  const collected: string[] = [];

  // Pre-resolve excluded paths to absolutes. Comparison is exact-
  // match on directory path: walk() refuses to recurse into a dir
  // whose absolute path is in this set.
  const excluded = new Set<string>(
    (opts.excludeUnderPaths ?? []).map((p) =>
      path.isAbsolute(p) ? path.normalize(p) : path.normalize(path.join(repoRoot, p)),
    ),
  );

  if (stat.isFile()) {
    if (matchesFile(abs, opts.includeTests)) collected.push(abs);
  } else if (stat.isDirectory()) {
    walk(abs, opts.includeTests, excluded, collected);
  }

  collected.sort();
  return opts.maxFiles ? collected.slice(0, opts.maxFiles) : collected;
}

function walk(
  dir: string,
  includeTests: boolean | undefined,
  excluded: Set<string>,
  out: string[],
): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (excluded.has(path.normalize(full))) continue;
      walk(full, includeTests, excluded, out);
    } else if (entry.isFile()) {
      if (matchesFile(full, includeTests)) out.push(full);
    }
  }
}

function matchesFile(p: string, includeTests: boolean | undefined): boolean {
  if (!SOURCE_EXT.test(p)) return false;
  if (!includeTests && TEST_EXT.test(p)) return false;
  return true;
}
