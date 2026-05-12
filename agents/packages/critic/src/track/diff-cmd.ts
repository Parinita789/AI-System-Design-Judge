import { loadIssuesIndex } from './load-issues';
import { IndexedIssue, IssuesIndex, Severity } from '../types';

export interface DiffCmdOptions {
  outputDir: string;
  since?: string;
}

interface IssueWithGen extends IndexedIssue {
  // runs in the IssuesIndex are in append order; we use their index
  // as a generation number to filter "since".
}

// Print the delta (new / fixed / status changes) since a prior
// run. No LLM, no writes. If --since is omitted, compare against
// the run before the latest.
export function runDiffCmd(opts: DiffCmdOptions, log: (s: string) => void = console.log): number {
  const index = loadIssuesIndex(opts.outputDir);
  if (index.runs.length === 0) {
    log('No runs recorded yet. Run `codebase-critic` first.');
    return 1;
  }

  const latest = index.runs[index.runs.length - 1];
  let baselineId: string | undefined = opts.since;
  if (!baselineId) {
    if (index.runs.length < 2) {
      log(`Only one run on record (${latest.id}). Nothing to compare against.`);
      return 1;
    }
    baselineId = index.runs[index.runs.length - 2].id;
  }

  log(`Diff: ${baselineId}  ->  ${latest.id}`);
  log('');

  const newSinceBaseline = index.issues.filter(
    (i) => i.status === 'new' && i.firstSeen === latest.id,
  );
  const fixedSinceBaseline = index.issues.filter(
    (i) => i.status === 'fixed' && i.fixedInRun === latest.id,
  );
  const openWontfix = index.issues.filter((i) => i.status === 'wontfix');

  log(`New (${newSinceBaseline.length}):`);
  for (const issue of sortBySeverity(newSinceBaseline)) {
    log(`  [${issue.lastSeverity.padEnd(8)}] ${issue.module}  ${issue.file}  ${issue.fingerprint}`);
  }

  log('');
  log(`Fixed (${fixedSinceBaseline.length}):`);
  for (const issue of sortBySeverity(fixedSinceBaseline)) {
    log(`  [${issue.lastSeverity.padEnd(8)}] ${issue.module}  ${issue.file}  ${issue.fingerprint}`);
  }

  log('');
  log(`Suppressed (wontfix/snoozed): ${openWontfix.length}`);

  return 0;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  nit: 4,
};

function sortBySeverity(xs: IndexedIssue[]): IndexedIssue[] {
  return [...xs].sort((a, b) => SEVERITY_RANK[a.lastSeverity] - SEVERITY_RANK[b.lastSeverity]);
}

export type { IssuesIndex };
