import {
  IndexedIssue,
  IssueStatus,
  ModuleIssue,
  PersistedFileReview,
  PersistedModuleReview,
  Priority,
  Severity,
} from '../types';
import { computeIssueId } from '../track/issue-ids';

export interface RenderModuleMdInput {
  result: PersistedModuleReview;
  persona: string;
  model: string;
  // Map of issueId -> status from issues.json (for the Status column).
  // Empty map -> no status column rendered.
  statusByIssueId: Map<string, IndexedIssue>;
  // ids that just transitioned to 'fixed' this run, with their old
  // entries — used to render the "Fixed since last run" section.
  fixedThisRun: IndexedIssue[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  nit: 4,
};
const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2 };

export function renderModuleMarkdown(input: RenderModuleMdInput): string {
  const { result, persona, model } = input;
  const { review } = result;

  const sections: string[] = [];
  sections.push(`# ${result.pkg}/${result.module} — code review (${persona})`);
  sections.push(
    `_Generated ${result.generatedAt}_ · model: \`${model}\` · ${result.fileReviews.length} files reviewed`,
  );
  if (result.unverifiedRefs) {
    sections.push(
      `> ⚠ The LLM emitted unverified file/line references after one retry. Findings are kept but flagged.`,
    );
  }
  if (result.synthesisError) {
    sections.push(`> ⚠ Synthesis error: ${result.synthesisError}`);
  }

  sections.push(`## Summary\n\n${review.summary || '_(no summary)_'}`);

  sections.push(renderStrengths(review.strengths));
  sections.push(renderConcerns(review.concerns));
  sections.push(renderIssues(result, input.statusByIssueId));
  sections.push(renderRecommendations(review.recommendations));
  sections.push(renderCrossFile(review.crossFilePatterns));
  if (input.fixedThisRun.length) {
    sections.push(renderFixedSinceLastRun(input.fixedThisRun));
  }
  sections.push(renderPerFile(result.fileReviews));

  return sections.filter(Boolean).join('\n\n') + '\n';
}

function renderStrengths(xs: string[]): string {
  if (!xs.length) return '## Strengths\n\n_(none)_';
  return '## Strengths\n\n' + xs.map((s) => `- ${s}`).join('\n');
}

function renderConcerns(xs: PersistedModuleReview['review']['concerns']): string {
  if (!xs.length) return '## Concerns\n\n_(none)_';
  const sorted = [...xs].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const rows = sorted.map((c) => `| ${c.severity} | ${esc(c.title)} | ${esc(c.detail)} |`);
  return [
    '## Concerns',
    '',
    '| Severity | Title | Detail |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function renderIssues(
  result: PersistedModuleReview,
  statusByIssueId: Map<string, IndexedIssue>,
): string {
  if (!result.review.issues.length) return '## Issues\n\n_(none)_';
  const showStatus = statusByIssueId.size > 0;
  const sorted = sortIssuesBySeverity(result.review.issues);
  const header = showStatus
    ? '| Severity | Status | File | Lines | Axis | Issue |\n| --- | --- | --- | --- | --- | --- |'
    : '| Severity | File | Lines | Axis | Issue |\n| --- | --- | --- | --- | --- |';
  const rows = sorted.map((i) => {
    const id = computeIssueId(i.file, i.axis, i.fingerprint);
    const status = statusByIssueId.get(id)?.status ?? 'new';
    const lines = i.lines.join(',');
    const cells = showStatus
      ? `| ${i.severity} | ${renderStatusBadge(status)} | \`${i.file}\` | ${lines} | ${i.axis} | ${esc(i.issue)} |`
      : `| ${i.severity} | \`${i.file}\` | ${lines} | ${i.axis} | ${esc(i.issue)} |`;
    return cells;
  });
  return ['## Issues', '', header, ...rows].join('\n');
}

function renderStatusBadge(status: IssueStatus): string {
  switch (status) {
    case 'new':
      return '🆕 new';
    case 'still-open':
      return 'still-open';
    case 'fixed':
      return '✅ fixed';
    case 'wontfix':
      return '🚫 wontfix';
    case 'snoozed':
      return '💤 snoozed';
  }
}

function renderRecommendations(
  xs: PersistedModuleReview['review']['recommendations'],
): string {
  if (!xs.length) return '## Recommendations\n\n_(none)_';
  const sorted = [...xs].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  return [
    '## Recommendations',
    '',
    ...sorted.map((r, i) => `${i + 1}. **(${r.priority})** ${r.action}`),
  ].join('\n');
}

function renderCrossFile(
  xs: PersistedModuleReview['review']['crossFilePatterns'],
): string {
  if (!xs.length) return '';
  const sorted = [...xs].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const rows = sorted.map(
    (p) =>
      `| ${p.severity} | ${esc(p.title)} | ${p.affectedFiles.map((f) => `\`${f}\``).join(', ')} | ${esc(p.detail)} |`,
  );
  return [
    '## Cross-file patterns',
    '',
    '| Severity | Title | Affected files | Detail |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function renderFixedSinceLastRun(xs: IndexedIssue[]): string {
  const rows = xs.map(
    (i) => `- \`${i.file}\` · ${i.axis} · ${i.fingerprint}  _(first seen ${i.firstSeen})_`,
  );
  return ['## Fixed since last run', '', ...rows].join('\n');
}

function renderPerFile(fileReviews: PersistedFileReview[]): string {
  if (!fileReviews.length) return '';
  const blocks = fileReviews.map((fr) => {
    const bits: string[] = [];
    bits.push(`### \`${fr.file}\``);
    if (fr.synthesisError) bits.push(`_⚠ ${fr.synthesisError}_`);
    if (fr.unverifiedRefs) bits.push(`_⚠ unverified file/line refs_`);
    if (fr.review.summary) bits.push(fr.review.summary);
    if (fr.review.issues.length) {
      bits.push(
        '**Issues:** ' +
          fr.review.issues
            .map((i) => `[${i.severity}/${i.axis}] L${i.lines.join(',')} — ${i.issue}`)
            .join('  ·  '),
      );
    }
    if (fr.review.strengths.length) {
      bits.push('**Strengths:** ' + fr.review.strengths.join(' · '));
    }
    return bits.join('\n\n');
  });
  return [
    '<details><summary>Per-file findings (' + fileReviews.length + ')</summary>',
    '',
    blocks.join('\n\n'),
    '',
    '</details>',
  ].join('\n');
}

function sortIssuesBySeverity(xs: ModuleIssue[]): ModuleIssue[] {
  return [...xs].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
