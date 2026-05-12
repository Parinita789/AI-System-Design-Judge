import {
  FileIssue,
  ModuleIssue,
  SEVERITY_VALUES,
  PRIORITY_VALUES,
  Synthesis,
} from '../types';

// Catch hallucinations the JSON schema can't: line numbers that
// don't exist in the source we sent, file paths the LLM invented,
// axis names not in the rubric, severities not in the enum.

export const RUBRIC_AXES = [
  'correctness',
  'error-handling',
  'boundary-safety',
  'observability',
  'testability',
  'api-shape',
  'naming-readability',
] as const;
const AXIS_SET = new Set<string>(RUBRIC_AXES);
const SEVERITY_SET = new Set<string>(SEVERITY_VALUES);
const PRIORITY_SET = new Set<string>(PRIORITY_VALUES);

export interface ValidationFault {
  kind:
    | 'unknown-file'
    | 'line-out-of-range'
    | 'unknown-axis'
    | 'unknown-severity'
    | 'unknown-priority'
    | 'unknown-module'
    | 'pattern-too-narrow';
  detail: string;
}

export interface SourceMapEntry {
  repoPath: string;
  lineCount: number;
}

// Normalize the file path the LLM emits so it lines up with the
// repoPaths we sent. The LLM may return any of:
//   "backend/src/foo.ts"      <- canonical (what we send)
//   "./backend/src/foo.ts"    <- leading dot-slash
//   "/absolute/.../foo.ts"    <- absolute (rare but seen)
//   "foo.ts"                  <- basename only
// We try the canonical form first; if it doesn't match, fall back
// to basename matching against the known files.
export function resolveFileRef(
  rawFile: string,
  fileMap: Map<string, SourceMapEntry>,
): SourceMapEntry | undefined {
  const direct = fileMap.get(rawFile);
  if (direct) return direct;

  const stripped = rawFile.replace(/^\.\//, '').replace(/^\/+/, '');
  const strippedHit = fileMap.get(stripped);
  if (strippedHit) return strippedHit;

  // Match any key whose suffix matches (handles absolute -> relative
  // and basename-only emissions). Only succeed if exactly one key
  // matches; ambiguity returns undefined so the LLM gets a retry.
  const matches: SourceMapEntry[] = [];
  for (const [key, entry] of fileMap) {
    if (key.endsWith('/' + rawFile) || key.endsWith('/' + stripped) || key.endsWith(rawFile)) {
      matches.push(entry);
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

// ---------- Phase 1 ----------

export function validateFileIssues(
  expectedFile: string,
  source: SourceMapEntry,
  issues: FileIssue[],
  recommendations?: { priority: string }[],
): ValidationFault[] {
  const faults: ValidationFault[] = [];
  for (const issue of issues) {
    if (!SEVERITY_SET.has(issue.severity)) {
      faults.push({
        kind: 'unknown-severity',
        detail: `severity "${issue.severity}" is not in ${[...SEVERITY_SET].join('|')}`,
      });
    }
    if (!AXIS_SET.has(issue.axis)) {
      faults.push({
        kind: 'unknown-axis',
        detail: `axis "${issue.axis}" is not in ${[...AXIS_SET].join('|')}`,
      });
    }
    for (const line of issue.lines) {
      if (line < 1 || line > source.lineCount) {
        faults.push({
          kind: 'line-out-of-range',
          detail: `line ${line} is outside ${expectedFile} (1..${source.lineCount})`,
        });
      }
    }
  }
  for (const rec of recommendations ?? []) {
    if (!PRIORITY_SET.has(rec.priority)) {
      faults.push({
        kind: 'unknown-priority',
        detail: `priority "${rec.priority}" is not in ${[...PRIORITY_SET].join('|')}`,
      });
    }
  }
  return faults;
}

// ---------- Phase 2 ----------

export function validateModuleIssues(
  fileMap: Map<string, SourceMapEntry>,
  issues: ModuleIssue[],
  recommendations?: { priority: string }[],
): ValidationFault[] {
  const faults: ValidationFault[] = [];
  for (const issue of issues) {
    if (!SEVERITY_SET.has(issue.severity)) {
      faults.push({
        kind: 'unknown-severity',
        detail: `severity "${issue.severity}" is not in ${[...SEVERITY_SET].join('|')}`,
      });
    }
    if (!AXIS_SET.has(issue.axis)) {
      faults.push({
        kind: 'unknown-axis',
        detail: `axis "${issue.axis}" is not in ${[...AXIS_SET].join('|')}`,
      });
    }
    const entry = resolveFileRef(issue.file, fileMap);
    if (!entry) {
      faults.push({
        kind: 'unknown-file',
        detail: `file "${issue.file}" is not one of the module files supplied (${[...fileMap.keys()].slice(0, 3).join(', ')}${fileMap.size > 3 ? '...' : ''})`,
      });
      continue;
    }
    for (const line of issue.lines) {
      if (line < 1 || line > entry.lineCount) {
        faults.push({
          kind: 'line-out-of-range',
          detail: `line ${line} is outside ${issue.file} (1..${entry.lineCount})`,
        });
      }
    }
  }
  for (const rec of recommendations ?? []) {
    if (!PRIORITY_SET.has(rec.priority)) {
      faults.push({
        kind: 'unknown-priority',
        detail: `priority "${rec.priority}" is not in ${[...PRIORITY_SET].join('|')}`,
      });
    }
  }
  return faults;
}

// ---------- Phase 3 ----------

export function validateSynthesis(
  knownModules: Set<string>,
  synth: Synthesis,
): ValidationFault[] {
  const faults: ValidationFault[] = [];
  for (const pattern of synth.crossCuttingPatterns) {
    if (!SEVERITY_SET.has(pattern.severity)) {
      faults.push({
        kind: 'unknown-severity',
        detail: `pattern severity "${pattern.severity}" is invalid`,
      });
    }
    if (pattern.affectedModules.length < 2) {
      faults.push({
        kind: 'pattern-too-narrow',
        detail: `pattern "${pattern.title}" only affects ${pattern.affectedModules.length} module — not cross-cutting`,
      });
    }
    for (const mod of pattern.affectedModules) {
      if (!knownModules.has(mod)) {
        faults.push({
          kind: 'unknown-module',
          detail: `pattern "${pattern.title}" references unknown module "${mod}"`,
        });
      }
    }
  }
  for (const item of synth.highPriorityItems) {
    if (!SEVERITY_SET.has(item.severity)) {
      faults.push({
        kind: 'unknown-severity',
        detail: `highPriority severity "${item.severity}" is invalid`,
      });
    }
    if (!knownModules.has(item.module)) {
      faults.push({
        kind: 'unknown-module',
        detail: `highPriority item references unknown module "${item.module}"`,
      });
    }
  }
  return faults;
}

export function formatFaultsForRetry(faults: ValidationFault[]): string {
  if (faults.length === 0) return '';
  return [
    'Your previous response had reference errors. Please re-emit the tool call with these fixed:',
    ...faults.map((f) => `- [${f.kind}] ${f.detail}`),
  ].join('\n');
}
