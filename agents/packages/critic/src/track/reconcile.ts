import {
  IndexedIssue,
  IssuesIndex,
  ModuleReview,
  PersistedModuleReview,
  RunRecord,
  Severity,
} from '../types';
import { computeIssueId } from './issue-ids';

export interface ReconcileInput {
  prior: IssuesIndex;
  moduleReviews: PersistedModuleReview[];
  runId: string;
  startedAt: string;
  finishedAt: string;
  model: string;
  persona: string;
  rubricSha1: string;
}

export interface ReconcileResult {
  next: IssuesIndex;
  newIssueIds: string[];
  fixedIssueIds: string[];
  stillOpenIssueIds: string[];
  carriedForwardWontfixIds: string[];
}

// Heart of run-over-run tracking.
//
// For each issue in the new module reviews, compute its stable id;
// look it up in the prior index:
//
//   prior absent           -> status='new', firstSeen=now
//   prior present, open    -> status='still-open', update lastSeen
//                              + lastIssueText + lastSeverity
//   prior present, wontfix -> keep status='wontfix' verbatim;
//                              this prevents user-suppressed issues
//                              from re-flagging as new every run
//   prior present, snoozed -> same as wontfix
//
// For each prior issue that is OPEN/still-open and NOT in the new
// set, mark status='fixed' + fixedInRun=runId. Issues previously
// 'fixed' stay fixed (they don't get re-flagged just because
// they're absent again).
export function reconcileIssues(input: ReconcileInput): ReconcileResult {
  const priorById = new Map<string, IndexedIssue>();
  for (const issue of input.prior.issues) {
    priorById.set(issue.id, issue);
  }

  const newIds: string[] = [];
  const stillOpenIds: string[] = [];
  const carriedWontfix: string[] = [];
  const seenThisRun = new Set<string>();
  const nextIssues: IndexedIssue[] = [];

  for (const mr of input.moduleReviews) {
    for (const issue of moduleIssuesWithFile(mr.review, `${mr.pkg}/${mr.module}`)) {
      const id = computeIssueId(issue.file, issue.axis, issue.fingerprint);
      if (seenThisRun.has(id)) continue;
      seenThisRun.add(id);

      const prior = priorById.get(id);
      if (!prior) {
        const fresh: IndexedIssue = {
          id,
          module: `${mr.pkg}/${mr.module}`,
          file: issue.file,
          axis: issue.axis,
          fingerprint: issue.fingerprint,
          lastIssueText: issue.issue,
          lastSeverity: issue.severity,
          status: 'new',
          firstSeen: input.runId,
          lastSeen: input.runId,
          fixedInRun: null,
          manualNote: null,
        };
        nextIssues.push(fresh);
        newIds.push(id);
        continue;
      }

      if (prior.status === 'wontfix' || prior.status === 'snoozed') {
        nextIssues.push({
          ...prior,
          lastIssueText: issue.issue,
          lastSeverity: issue.severity,
          lastSeen: input.runId,
        });
        carriedWontfix.push(id);
        continue;
      }

      // Open / still-open / fixed-but-resurfaced -> still-open
      nextIssues.push({
        ...prior,
        module: `${mr.pkg}/${mr.module}`,
        file: issue.file,
        axis: issue.axis,
        fingerprint: issue.fingerprint,
        lastIssueText: issue.issue,
        lastSeverity: issue.severity,
        status: 'still-open',
        lastSeen: input.runId,
        fixedInRun: null,
      });
      stillOpenIds.push(id);
    }
  }

  // Prior issues not seen this run.
  const fixedIds: string[] = [];
  for (const prior of input.prior.issues) {
    if (seenThisRun.has(prior.id)) continue;
    if (prior.status === 'wontfix' || prior.status === 'snoozed') {
      // User-suppressed; carry forward as-is.
      nextIssues.push(prior);
      continue;
    }
    if (prior.status === 'fixed') {
      // Already fixed in a previous run; carry forward.
      nextIssues.push(prior);
      continue;
    }
    // Was open last run, absent now -> fixed.
    nextIssues.push({
      ...prior,
      status: 'fixed',
      fixedInRun: input.runId,
    });
    fixedIds.push(prior.id);
  }

  const runRecord: RunRecord = {
    id: input.runId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    model: input.model,
    persona: input.persona,
    rubricSha1: input.rubricSha1,
    issuesFlagged: seenThisRun.size,
    newCount: newIds.length,
    fixedCount: fixedIds.length,
  };

  return {
    next: {
      version: 1,
      runs: [...input.prior.runs, runRecord],
      issues: sortIssues(nextIssues),
    },
    newIssueIds: newIds,
    fixedIssueIds: fixedIds,
    stillOpenIssueIds: stillOpenIds,
    carriedForwardWontfixIds: carriedWontfix,
  };
}

function moduleIssuesWithFile(
  review: ModuleReview,
  _moduleQualifier: string,
): Array<{ file: string; axis: string; fingerprint: string; issue: string; severity: Severity }> {
  return review.issues.map((i) => ({
    file: i.file,
    axis: i.axis,
    fingerprint: i.fingerprint,
    issue: i.issue,
    severity: i.severity,
  }));
}

function sortIssues(xs: IndexedIssue[]): IndexedIssue[] {
  return [...xs].sort((a, b) => {
    if (a.module !== b.module) return a.module.localeCompare(b.module);
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.axis !== b.axis) return a.axis.localeCompare(b.axis);
    return a.id.localeCompare(b.id);
  });
}
