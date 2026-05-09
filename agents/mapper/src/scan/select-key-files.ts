import * as fs from 'node:fs';
import { DiscoveredModule, ModuleFile } from '../types';

// Per-module key-file selection. The LLM sees only the top-K files,
// so the choice matters. Priority:
//   (1) NestJS *.module.ts file (declares the boundary explicitly)
//   (2) Files exporting a class whose name starts with the module
//       id capitalized (e.g. EvaluationsService for "evaluations")
//   (3) Largest non-test file by bytes
// Ties broken by repo path. Tests excluded entirely.
//
// Snippet length capped to keep each prompt under 4k input tokens
// even with 5 files × ~60 lines.

const MAX_KEY_FILES = 5;
const MAX_SNIPPET_LINES = 60;

export interface KeyFileSnippet {
  repoPath: string;
  snippet: string;
}

export function selectKeyFiles(module: DiscoveredModule): KeyFileSnippet[] {
  const candidates = module.files.filter((f) => !f.isTest);
  if (candidates.length === 0) return [];

  const moduleNameRoots = expandModuleNameRoots(module.id);
  const ranked = candidates
    .map((f) => ({ file: f, score: scoreFile(f, moduleNameRoots) }))
    .sort((a, b) => b.score - a.score || a.file.repoPath.localeCompare(b.file.repoPath))
    .slice(0, MAX_KEY_FILES)
    .map((x) => x.file);

  return ranked.map((f) => ({
    repoPath: f.repoPath,
    snippet: readSnippet(f),
  }));
}

function scoreFile(file: ModuleFile, moduleNameRoots: string[]): number {
  let score = 0;
  const basename = file.repoPath.split('/').pop() ?? '';

  // (1) NestJS module file declaration — strongest signal.
  if (basename.endsWith('.module.ts')) score += 100;

  // (2) Filename mentions the module id (e.g. evaluations.service.ts
  // for module "evaluations"). This is a coarser proxy for "exports
  // a class named after the module" and works without parsing.
  if (moduleNameRoots.some((r) => basename.toLowerCase().includes(r))) {
    score += 30;
  }

  // (2b) "service" / "agent" / "orchestrator" / "controller" names
  // are usually the module's primary surface. Cheap but useful.
  if (/(service|agent|orchestrator|controller|handler|manager)\.tsx?$/.test(basename)) {
    score += 15;
  }

  // (3) Larger files first (within score tier). Use byte size as
  // proxy for "load-bearing" — a 50-line types file is less
  // informative than a 500-line orchestrator.
  let size = 0;
  try {
    size = fs.statSync(file.absPath).size;
  } catch {
    size = 0;
  }
  // Normalise to a small additive contribution so "big helper"
  // doesn't outrank "module declaration".
  score += Math.min(size / 100, 20);

  return score;
}

function expandModuleNameRoots(id: string): string[] {
  // "build-sessions" → ["build-sessions", "build_sessions",
  //                      "buildsessions", "buildSessions"]
  // We compare against lowercased basename so all roots are
  // lowercased here.
  const lower = id.toLowerCase();
  const noDash = lower.replace(/-/g, '');
  const noUnderscore = lower.replace(/_/g, '');
  const camelLower = lower
    .split(/[-_]/)
    .map((p, i) => (i === 0 ? p : p))
    .join('')
    .toLowerCase();

  // Drop ids that start with `_` (synthetic modules like _root)
  // or contain a slash (like "features/dashboard"). For slashed
  // ids, use only the last segment.
  const meaningful = id.startsWith('_') ? '' : id.includes('/') ? id.split('/').pop()! : id;
  if (!meaningful) return [];

  return Array.from(
    new Set([lower, noDash, noUnderscore, camelLower, meaningful.toLowerCase()]),
  ).filter((r) => r.length >= 3); // drop very short roots that match too much
}

function readSnippet(file: ModuleFile): string {
  let content: string;
  try {
    content = fs.readFileSync(file.absPath, 'utf8');
  } catch {
    return '<unreadable>';
  }
  const lines = content.split('\n');
  if (lines.length <= MAX_SNIPPET_LINES) return content;
  return lines.slice(0, MAX_SNIPPET_LINES).join('\n') + '\n// ...';
}
