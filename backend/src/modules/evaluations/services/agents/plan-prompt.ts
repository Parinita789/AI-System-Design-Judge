import { Rubric } from '../../models/rubric.types';
import { SystemBlock } from '../../../llm/models/llm.types';
import { PhaseEvalInput } from './base-phase.agent';

export interface BuiltPrompt {
  systemBlocks: SystemBlock[];
  userMessage: string;
}

export function buildPlanPrompt(rubric: Rubric, input: PhaseEvalInput): BuiltPrompt {
  return {
    systemBlocks: [
      // Block 1: rubric — large, frozen across all evaluations → cacheable.
      { text: renderRubricSystemPrompt(rubric), cacheable: true },
      // Block 2: session question — constant per session → cacheable.
      { text: `## Session question\n${input.session.prompt}`, cacheable: true },
    ],
    userMessage: renderUserPayload(input),
  };
}

function renderRubricSystemPrompt(rubric: Rubric): string {
  const goodSignals = rubric.signals.filter((s) => s.polarity === 'good');
  const badSignals = rubric.signals.filter((s) => s.polarity === 'bad');

  const sectionsBlock = rubric.passBar.requiredSections
    .map((s) => `  - ${s.id} ("${s.name}") — must contain: ${s.mustContain.join(', ')}`)
    .join('\n');

  const goodSignalsBlock = goodSignals.map(formatSignal).join('\n\n');
  const badSignalsBlock = badSignals.map(formatSignal).join('\n\n');

  const anchorsBlock = Object.entries(rubric.scoring.anchors)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([score, desc]) => `  ${score}: ${desc}`)
    .join('\n');

  const calibrationBlock = rubric.judgeCalibration.map((c, i) => `${i + 1}. ${c}`).join('\n');

  const aiUsage = rubric.aiUsageForThisPhase;
  const aiUsageBlock = aiUsage
    ? `## AI usage policy for this phase
${aiUsage.description}
Good modes: ${aiUsage.goodModes.join('; ')}
Bad modes: ${aiUsage.badModes.join('; ')}`
    : '';

  return `You are an evaluator for the ${rubric.phaseName} phase of a system-design practice session.

Read the artifacts the user will provide and return a structured JSON evaluation matching the schema at the bottom of this prompt. Be specific and cite evidence from the artifacts. Do not invent content that isn't in the artifacts.

## Phase goal
${rubric.goal}

## Time bounds
Target ${rubric.timeBounds.targetMinMinutes}–${rubric.timeBounds.targetMaxMinutes} minutes. Flag if active work was under ${rubric.timeBounds.flagUnderMinutes} or over ${rubric.timeBounds.flagOverMinutes} minutes.${rubric.timeBounds.note ? `\nNote: ${rubric.timeBounds.note}` : ''}

## Pass bar
Required artifact: ${rubric.passBar.requiredArtifact}
${rubric.passBar.description}
Temporal check: ${rubric.passBar.temporalCheck}
Required sections in the artifact:
${sectionsBlock}

## Weight values (use these when scoring)
high = ${rubric.weightValues.high}, medium = ${rubric.weightValues.medium}, low = ${rubric.weightValues.low}

## GOOD signals (presence is positive)
${goodSignalsBlock}

## BAD signals (presence is negative; signals marked CRITICAL cap the final score)
${badSignalsBlock}

## Scoring computation
${rubric.scoring.computation}
Scale: ${rubric.scoring.scaleMin}–${rubric.scoring.scaleMax}. Anchors:
${anchorsBlock}${rubric.scoring.calibrationNote ? `\nNote: ${rubric.scoring.calibrationNote}` : ''}

## Calibration notes
${calibrationBlock}

${aiUsageBlock}

## OUTPUT FORMAT (strict)
Return ONLY a single valid JSON object. No prose. No markdown fences. No explanations outside the JSON.
Every signal listed above (both good and bad) must appear as a key in the "signals" object with one of: "hit", "miss", "partial", "cannot_evaluate".
"evidence" should quote or paraphrase the specific text from plan.md or activity logs that justifies your judgment (≤500 chars).

The JSON MUST match this schema:
${JSON.stringify(rubric.outputSchema, null, 2)}`;
}

function formatSignal(s: {
  id: string;
  weight: string;
  description: string;
  judgeNotes: string;
  evidenceHint?: string;
  critical?: boolean;
  capAtScore?: number;
}): string {
  const tags = [`weight: ${s.weight}`];
  if (s.critical) tags.push('CRITICAL');
  if (s.capAtScore !== undefined) tags.push(`caps score at ${s.capAtScore}`);
  return `### ${s.id} (${tags.join(', ')})
description: ${s.description}
judge_notes: ${s.judgeNotes}${s.evidenceHint ? `\nevidence_hint: ${s.evidenceHint}` : ''}`;
}

function renderUserPayload(input: PhaseEvalInput): string {
  const sections: string[] = [];

  // plan.md (the primary artifact)
  sections.push(
    `## plan.md (final state)\n${input.planMd && input.planMd.trim().length > 0 ? input.planMd : '(empty)'}`,
  );

  // Snapshot timeline — temporal evidence for iteration_evident, code_before_plan, etc.
  if (input.snapshots.length === 0) {
    sections.push(`## Snapshot timeline\n(no snapshots — plan.md was never saved)`);
  } else {
    const sorted = [...input.snapshots].sort(
      (a, b) => a.takenAt.getTime() - b.takenAt.getTime(),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const sizes = sorted.map((s) => s.planMdSize);
    const grew = sizes[sizes.length - 1] > sizes[0];
    const lines = [
      `${sorted.length} snapshot(s) recorded`,
      `First save: ${first.takenAt.toISOString()} — plan.md was ${first.planMdSize} chars (active elapsed: ${first.elapsedMinutes}m)`,
      `Last save:  ${last.takenAt.toISOString()} — plan.md was ${last.planMdSize} chars (active elapsed: ${last.elapsedMinutes}m)`,
      `Trend: plan.md ${grew ? 'grew' : sizes[sizes.length - 1] === sizes[0] ? 'stable' : 'shrank'} across the session.`,
    ];
    sections.push(`## Snapshot timeline\n${lines.join('\n')}`);
  }

  // Hint usage — temporal + content evidence for ai_authored_plan, ai_strategy_explicit, etc.
  if (input.hints.length === 0) {
    sections.push(`## AI hint usage\nNo hint chat used during this session.`);
  } else {
    const totalIn = input.hints.length;
    const lines = [`${totalIn} hint exchange(s) during the session.`];
    // Up to 3 representative excerpts (first, middle, last).
    const indices =
      totalIn <= 3
        ? input.hints.map((_, i) => i)
        : [0, Math.floor(totalIn / 2), totalIn - 1];
    for (const i of indices) {
      const h = input.hints[i];
      lines.push(
        `- [${h.elapsedMinutes}m elapsed] User: "${truncate(h.prompt, 200)}" | Bot: "${truncate(h.response, 200)}"`,
      );
    }
    sections.push(`## AI hint usage\n${lines.join('\n')}`);
  }

  // Session-level timing (pause-aware via latest snapshot's elapsedMinutes when present).
  const activeMinutes =
    input.snapshots.length > 0
      ? Math.max(...input.snapshots.map((s) => s.elapsedMinutes))
      : 0;
  sections.push(
    `## Active elapsed\n${activeMinutes} minute(s) of active work (pause-aware, excludes paused time).`,
  );

  return sections.join('\n\n');
}

function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars - 1)}…`;
}
