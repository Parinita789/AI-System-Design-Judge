// Shared shapes across scan / llm / render. Kept here so a v2
// critique agent can `import { PackageMap } from '@interview-assistant/mapper'`
// and consume the same JSON sidecar shape that the markdown is
// rendered from.

export type ModuleStrategy = 'nest' | 'frontend' | 'cli-flat';

export interface PackageDescriptor {
  name: string;
  root: string; // absolute path to the package root (e.g. /repo/backend)
  moduleStrategy: ModuleStrategy;
}

export interface ModuleFile {
  // Absolute path on disk.
  absPath: string;
  // Repo-relative path (used for display + LLM input).
  repoPath: string;
  // True for *.test.ts / *.spec.ts. Test files are excluded from
  // the import graph and key-file selection but recorded as
  // `tests-for: <module>` metadata so future critique agents can
  // reason about coverage.
  isTest: boolean;
}

// A single discovered module pre-graph. Imports/exports get filled
// by walk-imports, deps in/out by build-graph.
export interface DiscoveredModule {
  // Stable id used in graph edges and markdown headings.
  // For nest: the dir name (e.g. "evaluations"). For frontend
  // services: the file basename without ".service.ts". For cli:
  // the file basename without ".ts".
  id: string;
  // Repo-relative root of the module — directory for nest /
  // frontend, file path for cli-flat.
  path: string;
  // Files inside this module (all *.ts/*.tsx, including tests).
  files: ModuleFile[];
}

export interface FileImports {
  // Each entry is an import specifier as written, e.g.
  // "../../llm/services/llm.service" or "@nestjs/common" or "./types".
  imports: string[];
  // Top-level named exports (class names, function names,
  // default-export class name if any). Used for the LLM
  // "key exports" prompt field.
  exports: string[];
}

export interface ModuleSummary {
  id: string;
  path: string;
  fileCount: number;
  testFileCount: number;
  exports: string[];
  internalDepsOut: string[]; // module ids in the same package
  internalDepsIn: string[];
  // Top-N npm package names this module imports (deduped to
  // package name, e.g. "@nestjs/common" not "@nestjs/common/...").
  externalDeps: string[];
  // Optional inferred-responsibility paragraph from the LLM phase.
  // Undefined when --no-with-llm.
  responsibility?: string;
  // Set when the LLM citation enforcer caught a hallucinated
  // file path even after one retry. Lets the renderer mark the
  // section visibly.
  unverifiedCitation?: boolean;
  // Set when the LLM call failed irrecoverably.
  synthesisError?: string;
  // For cli-flat: file paths of *.test.ts that target this
  // module by naming convention. Empty for other strategies.
  testsFor: string[];
}

export interface PackageMap {
  package: string;
  root: string;
  generatedAt: string;
  model?: string;
  modules: ModuleSummary[];
}
