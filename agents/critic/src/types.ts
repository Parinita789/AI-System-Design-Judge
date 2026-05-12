// Shared types for the critic agent.
//
// Three layers:
//   - Mapper output shapes (we read JSON from agents/codebase-map/)
//   - LLM result shapes (what the forced tool_use returns)
//   - Run context / orchestration shapes

// ---------- Severity + priority vocabulary ----------

export const SEVERITY_VALUES = ['critical', 'high', 'medium', 'low', 'nit'] as const;
export type Severity = (typeof SEVERITY_VALUES)[number];

export const PRIORITY_VALUES = ['P0', 'P1', 'P2'] as const;
export type Priority = (typeof PRIORITY_VALUES)[number];

export const ISSUE_STATUS_VALUES = [
  'new',
  'still-open',
  'fixed',
  'wontfix',
  'snoozed',
] as const;
export type IssueStatus = (typeof ISSUE_STATUS_VALUES)[number];

// ---------- Mapper output (read from agents/codebase-map/*.json) ----------

export interface MapperModuleSummary {
  id: string;
  path: string;
  fileCount: number;
  testFileCount: number;
  exports: string[];
  internalDepsOut: string[];
  internalDepsIn: string[];
  externalDeps: string[];
  responsibility?: string;
  unverifiedCitation?: boolean;
  synthesisError?: string | null;
  testsFor?: string[];
}

export interface MapperPackageMap {
  package: string;
  root: string;
  generatedAt: string;
  model?: string;
  modules: MapperModuleSummary[];
}

// ---------- LLM result shapes (forced tool_use outputs) ----------

export interface FileIssue {
  severity: Severity;
  axis: string;
  fingerprint: string;
  lines: number[];
  issue: string;
  suggestion?: string;
}

export interface FileConcern {
  severity: Severity;
  title: string;
  detail: string;
}

export interface FileRecommendation {
  priority: Priority;
  action: string;
}

export interface FileReview {
  file: string;
  summary: string;
  strengths: string[];
  concerns: FileConcern[];
  issues: FileIssue[];
  recommendations: FileRecommendation[];
}

export interface ModuleIssue extends FileIssue {
  file: string;
}

export interface CrossFilePattern {
  severity: Severity;
  title: string;
  detail: string;
  affectedFiles: string[];
}

export interface ModuleReview {
  module: string;
  summary: string;
  strengths: string[];
  concerns: FileConcern[];
  issues: ModuleIssue[];
  crossFilePatterns: CrossFilePattern[];
  recommendations: FileRecommendation[];
}

export interface SynthesisCrossCuttingPattern {
  severity: Severity;
  title: string;
  detail: string;
  affectedModules: string[];
}

export interface SynthesisHighPriorityItem {
  severity: Severity;
  module: string;
  file?: string;
  lines?: number[];
  issue: string;
}

export type SynthesisGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface Synthesis {
  grade: SynthesisGrade;
  narrative: string;
  topRisks: string[];
  topStrengths: string[];
  crossCuttingPatterns: SynthesisCrossCuttingPattern[];
  highPriorityItems: SynthesisHighPriorityItem[];
}

// ---------- issues.json — cross-run tracker ----------

export interface IndexedIssue {
  id: string;
  module: string;
  file: string;
  axis: string;
  fingerprint: string;
  lastIssueText: string;
  lastSeverity: Severity;
  status: IssueStatus;
  firstSeen: string;
  lastSeen: string;
  fixedInRun: string | null;
  manualNote: string | null;
}

export interface RunRecord {
  id: string;
  startedAt: string;
  finishedAt: string;
  model: string;
  persona: string;
  rubricSha1: string;
  issuesFlagged: number;
  newCount: number;
  fixedCount: number;
}

export interface IssuesIndex {
  version: 1;
  runs: RunRecord[];
  issues: IndexedIssue[];
}

// ---------- Orchestration ----------

export interface ResolvedModule {
  // Where in codebase-map this came from: 'backend' | 'frontend' | 'cli'
  pkg: string;
  summary: MapperModuleSummary;
  // Absolute file paths inside the module to review.
  filePaths: string[];
}

export interface RunContext {
  repoRoot: string;
  outputDir: string;
  personaName: string;
  personaText: string;
  rubricText: string;
  rubricSha1: string;
  model: string;
  runId: string;
  startedAt: string;
  track: boolean;
}

export interface PhaseStats {
  attempted: number;
  succeeded: number;
  failed: number;
  unverifiedRefsCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
}

// ---------- Per-module / per-file persisted results ----------

export interface PersistedFileReview {
  pkg: string;
  module: string;
  file: string;
  review: FileReview;
  unverifiedRefs: boolean;
  synthesisError: string | null;
}

export interface PersistedModuleReview {
  pkg: string;
  module: string;
  review: ModuleReview;
  unverifiedRefs: boolean;
  synthesisError: string | null;
  fileReviews: PersistedFileReview[];
  generatedAt: string;
}

export interface PersistedSynthesis {
  synthesis: Synthesis;
  generatedAt: string;
  unverifiedRefs: boolean;
  synthesisError: string | null;
}
