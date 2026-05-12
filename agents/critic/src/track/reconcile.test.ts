import { reconcileIssues } from './reconcile';
import { computeIssueId } from './issue-ids';
import { IndexedIssue, IssuesIndex, ModuleReview, PersistedModuleReview } from '../types';

function makeReview(issues: ModuleReview['issues']): PersistedModuleReview {
  return {
    pkg: 'backend',
    module: 'hints',
    review: {
      module: 'hints',
      summary: 'x',
      strengths: [],
      concerns: [],
      crossFilePatterns: [],
      recommendations: [],
      issues,
    },
    unverifiedRefs: false,
    synthesisError: null,
    fileReviews: [],
    generatedAt: '2026-05-12T10:00:00Z',
  };
}

function makeIssue(overrides: Partial<ModuleReview['issues'][0]> = {}): ModuleReview['issues'][0] {
  return {
    severity: 'high',
    axis: 'error-handling',
    fingerprint: 'catch-all swallows error',
    file: 'backend/src/modules/hints/orchestrator.ts',
    lines: [42],
    issue: 'The catch block discards the error.',
    ...overrides,
  };
}

const RUN_NEW = '2026-05-12T10:00:00Z';
const RUN_PRIOR = '2026-05-10T08:00:00Z';

const emptyPrior: IssuesIndex = { version: 1, runs: [], issues: [] };

const reconcileArgs = {
  runId: RUN_NEW,
  startedAt: RUN_NEW,
  finishedAt: RUN_NEW,
  model: 'claude-sonnet-4-6',
  persona: 'staff-engineer',
  rubricSha1: 'abc',
};

describe('reconcileIssues', () => {
  it('marks brand-new issues with status="new"', () => {
    const r = reconcileIssues({
      ...reconcileArgs,
      prior: emptyPrior,
      moduleReviews: [makeReview([makeIssue()])],
    });
    expect(r.newIssueIds).toHaveLength(1);
    expect(r.fixedIssueIds).toHaveLength(0);
    expect(r.next.issues[0].status).toBe('new');
    expect(r.next.issues[0].firstSeen).toBe(RUN_NEW);
  });

  it('marks previously-open issues that are absent now as fixed', () => {
    const issue = makeIssue();
    const id = computeIssueId(issue.file, issue.axis, issue.fingerprint);
    const prior: IssuesIndex = {
      version: 1,
      runs: [],
      issues: [
        {
          id,
          module: 'backend/hints',
          file: issue.file,
          axis: issue.axis,
          fingerprint: issue.fingerprint,
          lastIssueText: issue.issue,
          lastSeverity: 'high',
          status: 'still-open',
          firstSeen: RUN_PRIOR,
          lastSeen: RUN_PRIOR,
          fixedInRun: null,
          manualNote: null,
        },
      ],
    };
    const r = reconcileIssues({
      ...reconcileArgs,
      prior,
      moduleReviews: [makeReview([])],
    });
    expect(r.fixedIssueIds).toEqual([id]);
    expect(r.next.issues[0].status).toBe('fixed');
    expect(r.next.issues[0].fixedInRun).toBe(RUN_NEW);
  });

  it('preserves wontfix status across reruns even if the issue still appears', () => {
    const issue = makeIssue();
    const id = computeIssueId(issue.file, issue.axis, issue.fingerprint);
    const prior: IssuesIndex = {
      version: 1,
      runs: [],
      issues: [
        {
          id,
          module: 'backend/hints',
          file: issue.file,
          axis: issue.axis,
          fingerprint: issue.fingerprint,
          lastIssueText: 'old text',
          lastSeverity: 'high',
          status: 'wontfix',
          firstSeen: RUN_PRIOR,
          lastSeen: RUN_PRIOR,
          fixedInRun: null,
          manualNote: 'legacy code; deferring',
        },
      ],
    };
    const r = reconcileIssues({
      ...reconcileArgs,
      prior,
      moduleReviews: [makeReview([issue])],
    });
    expect(r.newIssueIds).toEqual([]);
    expect(r.carriedForwardWontfixIds).toEqual([id]);
    expect(r.next.issues[0].status).toBe('wontfix');
    expect(r.next.issues[0].manualNote).toBe('legacy code; deferring');
    expect(r.next.issues[0].lastSeen).toBe(RUN_NEW);
  });

  it('preserves wontfix status when the issue is absent (does not flip to fixed)', () => {
    const issue = makeIssue();
    const id = computeIssueId(issue.file, issue.axis, issue.fingerprint);
    const prior: IssuesIndex = {
      version: 1,
      runs: [],
      issues: [
        {
          id,
          module: 'backend/hints',
          file: issue.file,
          axis: issue.axis,
          fingerprint: issue.fingerprint,
          lastIssueText: 'x',
          lastSeverity: 'high',
          status: 'wontfix',
          firstSeen: RUN_PRIOR,
          lastSeen: RUN_PRIOR,
          fixedInRun: null,
          manualNote: null,
        },
      ],
    };
    const r = reconcileIssues({
      ...reconcileArgs,
      prior,
      moduleReviews: [makeReview([])],
    });
    expect(r.fixedIssueIds).toEqual([]);
    expect(r.next.issues[0].status).toBe('wontfix');
  });

  it('updates severity when an existing issue is rephrased with a new severity', () => {
    const issue = makeIssue({ severity: 'critical', issue: 'now worse' });
    const id = computeIssueId(issue.file, issue.axis, issue.fingerprint);
    const prior: IssuesIndex = {
      version: 1,
      runs: [],
      issues: [
        {
          id,
          module: 'backend/hints',
          file: issue.file,
          axis: issue.axis,
          fingerprint: issue.fingerprint,
          lastIssueText: 'mild',
          lastSeverity: 'low',
          status: 'still-open',
          firstSeen: RUN_PRIOR,
          lastSeen: RUN_PRIOR,
          fixedInRun: null,
          manualNote: null,
        },
      ],
    };
    const r = reconcileIssues({
      ...reconcileArgs,
      prior,
      moduleReviews: [makeReview([issue])],
    });
    expect(r.stillOpenIssueIds).toEqual([id]);
    expect(r.next.issues[0].lastSeverity).toBe('critical');
    expect(r.next.issues[0].lastIssueText).toBe('now worse');
  });

  it('appends a run record', () => {
    const r = reconcileIssues({
      ...reconcileArgs,
      prior: emptyPrior,
      moduleReviews: [makeReview([makeIssue()])],
    });
    expect(r.next.runs).toHaveLength(1);
    expect(r.next.runs[0].issuesFlagged).toBe(1);
    expect(r.next.runs[0].newCount).toBe(1);
    expect(r.next.runs[0].fixedCount).toBe(0);
  });

  it('dedupes when two file-issues share an id', () => {
    const r = reconcileIssues({
      ...reconcileArgs,
      prior: emptyPrior,
      moduleReviews: [makeReview([makeIssue(), makeIssue()])],
    });
    expect(r.next.issues).toHaveLength(1);
  });
});

describe('computeIssueId', () => {
  it('produces the same id for the same fingerprint regardless of whitespace', () => {
    const a = computeIssueId('foo.ts', 'correctness', 'catch-all  swallows  error');
    const b = computeIssueId('foo.ts', 'correctness', 'CATCH-ALL swallows error');
    expect(a).toBe(b);
  });

  it('changes when the file changes', () => {
    const a = computeIssueId('foo.ts', 'correctness', 'x');
    const b = computeIssueId('bar.ts', 'correctness', 'x');
    expect(a).not.toBe(b);
  });
});
