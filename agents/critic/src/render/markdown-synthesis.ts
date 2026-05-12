import { IndexedIssue, PersistedSynthesis, RunRecord, Severity } from '../types';

export interface RenderSynthesisMdInput {
  result: PersistedSynthesis;
  persona: string;
  model: string;
  modulesReviewed: number;
  filesReviewed: number;
  // Cross-run progress data: newest run + the run before it.
  latestRun: RunRecord | null;
  priorRun: RunRecord | null;
  // Issues that just transitioned to 'fixed' in the latest run.
  fixedThisRun: IndexedIssue[];
  newThisRun: IndexedIssue[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  nit: 4,
};

export function renderSynthesisMarkdown(input: RenderSynthesisMdInput): string {
  const { result, persona, model } = input;
  const synth = result.synthesis;

  const sections: string[] = [];
  sections.push(`# Codebase health — ${persona}`);
  sections.push(
    `_Generated ${result.generatedAt}_ · model: \`${model}\` · ${input.modulesReviewed} modules · ${input.filesReviewed} files`,
  );
  if (result.synthesisError) sections.push(`> ⚠ Synthesis error: ${result.synthesisError}`);
  if (result.unverifiedRefs)
    sections.push(`> ⚠ Some references were not verifiable against the module set.`);

  sections.push(`## Grade: **${synth.grade}**`);
  sections.push(synth.narrative || '_(no narrative)_');

  if (input.priorRun) {
    sections.push(renderProgress(input));
  }

  sections.push(renderListSection('Top risks', synth.topRisks));
  sections.push(renderListSection('Top strengths', synth.topStrengths));
  sections.push(renderCrossCutting(synth.crossCuttingPatterns));
  sections.push(renderHighPriority(synth.highPriorityItems));

  return sections.filter(Boolean).join('\n\n') + '\n';
}

function renderProgress(input: RenderSynthesisMdInput): string {
  const latest = input.latestRun!;
  const prior = input.priorRun!;
  const lines: string[] = [];
  lines.push(`## Progress since last run (${prior.id})`);
  lines.push('');
  lines.push(`- **Issues flagged:** ${latest.issuesFlagged} (prior run: ${prior.issuesFlagged})`);
  lines.push(`- **New this run:** ${latest.newCount}`);
  lines.push(`- **Fixed this run:** ${latest.fixedCount}`);
  if (input.fixedThisRun.length) {
    const samples = input.fixedThisRun
      .slice(0, 5)
      .map((i) => `\`${i.file}\` · ${i.fingerprint}`);
    lines.push('');
    lines.push('Top fixed:');
    for (const s of samples) lines.push(`- ${s}`);
  }
  if (input.newThisRun.length) {
    const samples = input.newThisRun
      .slice()
      .sort((a, b) => SEVERITY_RANK[a.lastSeverity] - SEVERITY_RANK[b.lastSeverity])
      .slice(0, 5)
      .map((i) => `[${i.lastSeverity}] \`${i.file}\` · ${i.fingerprint}`);
    lines.push('');
    lines.push('Top new:');
    for (const s of samples) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

function renderListSection(heading: string, xs: string[]): string {
  if (!xs.length) return `## ${heading}\n\n_(none)_`;
  return [`## ${heading}`, '', ...xs.map((x) => `- ${x}`)].join('\n');
}

function renderCrossCutting(
  xs: PersistedSynthesis['synthesis']['crossCuttingPatterns'],
): string {
  if (!xs.length) return '## Cross-cutting patterns\n\n_(none)_';
  const sorted = [...xs].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const rows = sorted.map(
    (p) =>
      `| ${p.severity} | ${esc(p.title)} | ${p.affectedModules.join(', ')} | ${esc(p.detail)} |`,
  );
  return [
    '## Cross-cutting patterns',
    '',
    '| Severity | Title | Affected modules | Detail |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function renderHighPriority(
  xs: PersistedSynthesis['synthesis']['highPriorityItems'],
): string {
  if (!xs.length) return '## High-priority items\n\n_(none)_';
  const sorted = [...xs].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const rows = sorted.map((i) => {
    const loc = i.file ? `\`${i.file}\`${i.lines && i.lines.length ? ` L${i.lines.join(',')}` : ''}` : '_(module-level)_';
    return `| ${i.severity} | ${i.module} | ${loc} | ${esc(i.issue)} |`;
  });
  return [
    '## High-priority items',
    '',
    '| Severity | Module | File:lines | Issue |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
