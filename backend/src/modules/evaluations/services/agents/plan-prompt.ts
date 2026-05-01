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

  // Build a pairing reference table from the YAML metadata. Each pair
  // appears once (good → bad) and the rule against double-counting is
  // stated next to it. The loader already validated symmetry.
  const pairs = goodSignals
    .filter((s) => s.pairedWith)
    .map((s) => `  - ${s.id} (good) ↔ ${s.pairedWith} (bad)`);
  const pairingBlock = pairs.length
    ? `## Pairing reference (do not double-count)
The following good↔bad signal pairs measure the same concept from
opposite sides. If the bad signal fires (HIT or PARTIAL), set its
paired good signal to MISS *only for reporting* — do NOT subtract its
weight separately. Count the deduction once, on whichever side
reflects the design's actual state.

${pairs.join('\n')}`
    : '';

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

## How to read this rubric (IMPORTANT — read before judging)

This is a 2-hour session. Before scoring any signal, classify the question
into one of two modes — your judgment depth depends on which:

### Mode A — "buildable" (small, concrete problem, no large-scale NFRs)
The question asks for something the candidate could realistically design
AND build a working version of in ~2 hours. Signals: no stated production
scale, or scale ≤ ~100 RPS / ~1 GB; small surface area (one or two
endpoints, one data store, no distributed concerns).
Examples: "design a counter API", "build a simple URL shortener", "design
a single-node rate limiter".
Expectations in this mode:
- \`build_sequence_planned\` and \`validation_plan_concrete\` should be
  CONCRETE: a real ordered task list and a real, runnable test approach.
- \`failure_modes_articulated\` should include modes the candidate could
  actually exercise (e.g., specific endpoint failures, simple chaos).
- A short-but-complete plan can score HIT across most signals.

### Mode B — "design-only" (large-scale, distributed, infeasible to build in 2h)
The question stipulates production-grade NFRs (e.g., "10K req/s", "200M
URLs", "50K events/sec", "100M users") OR a multi-component distributed
system. The candidate cannot build this in 2 hours; they are producing a
\`plan.md\` describing what they would design.
Examples: "URL shortener for 10K req/s and 200M URLs", "log pipeline at
50K eps", "distributed chat at 100M users".
Expectations in this mode:
- Score articulation and reasoning quality, NOT execution evidence.
- Every signal description starts with "Plan articulates ..." — interpret
  literally. Look for the concept being articulated in the plan, not for
  evidence that the concept has been implemented, deployed, or
  load-tested.
- Question NFRs describe the TARGET system the candidate is designing
  for. Do NOT use them as a bar for validation evidence. Demo-scale
  validation (a small load test, smoke test, sample data run, sketched
  test plan) is fully sufficient evidence for
  \`validation_plan_concrete\`. No production load test is required.
- A "build sequence" is a written ordering of work — it does NOT
  require shell commands, git commits, or actual code. 4–6 ordered steps
  are plenty.
- A "failure mode" is named and triaged in the plan — it does NOT
  require implemented retries, circuit breakers, or chaos tests.
- A data model is "committed" when entities, key fields, and
  relationships are stated — full DDL or migrations are NOT required.
- When the plan describes an approach at the right level of abstraction
  for a design-only exercise, that is HIT. Do NOT mark MISS just because
  the candidate skipped production-grade implementation detail.

### How to use these modes
1. State your mode classification (A or B) at the top of the
   \`feedback\` field, with a one-line reason. Example:
   "Mode B (design-only): question stipulates 10K req/s and 200M URLs."
2. Apply the corresponding expectations to every signal below. Mode A
   plans get judged more strictly on concrete buildable evidence; Mode B
   plans get judged on articulation and reasoning depth.
3. If the question is genuinely ambiguous between A and B, default to
   Mode B and note the ambiguity in feedback — being lenient on
   articulation rarely hurts a real candidate.

### Feedback prose must align with the mode (IMPORTANT)
The \`feedback\` and \`top_actions\` fields MUST be self-consistent with
your mode classification. They are read by the candidate after the
breakdown and they should not contradict it. Specifically:

- In **Mode B**, do NOT criticize the plan for "no build sequence",
  "no validation plan", "missing load tests", "no benchmarks", or
  similar — those expectations don't apply to a 2-hour design exercise
  on a production-scale problem. If the plan articulates the concept
  even briefly, that's enough; if it doesn't, treat it as out-of-scope
  rather than a gap.
- In **Mode B**, do NOT criticize the plan for "no AI strategy" /
  "missing AI usage section" UNLESS the question itself invokes AI,
  LLMs, or agentic systems. For non-AI questions (URL shortener, log
  pipeline, rate limiter, etc.), AI signals are not applicable —
  silently omit them from feedback.
- In **Mode A**, the above critiques ARE fair game when the plan
  genuinely lacks them, since the candidate could realistically build
  and test the system in 2 hours.
- \`top_actions\` should only include actions that are achievable and
  worthwhile within the same 2-hour design session. "Run a 10K req/s
  load test" is NOT a valid action; "sketch how you'd validate at demo
  scale" is. "Implement retry logic" is NOT valid; "name two failure
  modes you'd handle vs punt" is.

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

${pairingBlock}

## Scoring computation
${rubric.scoring.computation}
Scale: ${rubric.scoring.scaleMin}–${rubric.scoring.scaleMax}. Anchors:
${anchorsBlock}${rubric.scoring.calibrationNote ? `\nNote: ${rubric.scoring.calibrationNote}` : ''}

## Calibration notes
${calibrationBlock}

${aiUsageBlock}

## Relevance gating (IMPORTANT — read before judging)
Some signals only apply to questions in a specific domain. If a signal is
domain-specific and the SESSION QUESTION does not invoke that domain, mark
the signal "cannot_evaluate" with evidence "not applicable to this question
(<one-sentence reason>)". Do NOT score it as "miss" — a missed signal
implies the candidate had the chance to address it and didn't, which
unfairly penalizes designs for an unrelated topic.

Use this rule for AI / LLM / agentic signals when the question is a
non-AI design problem (e.g., URL shortener, rate limiter, chat app
without an LLM, log pipeline). Examples of signals to skip in that
case: any signal whose description references AI, LLMs, agents,
prompts, model selection, or RAG. The same rule applies to other
domain-specific signals (e.g., real-time/streaming concerns on a
batch-only problem) — if the question never opens the door to that
concern, skip rather than miss.

When in doubt, prefer "miss" over "cannot_evaluate" — only skip when
the question genuinely has no surface area for the signal.

Aggregate scoring: skipped ("cannot_evaluate") signals are excluded
from both earned and max totals so they do not change the score.

## OUTPUT FORMAT (strict)
Return ONLY a single valid JSON object. No prose. No markdown fences. No explanations outside the JSON.
Every signal listed above (both good and bad) must appear as a key in the "signals" object with one of: "hit", "miss", "partial", "cannot_evaluate".
"evidence" should quote or paraphrase the specific text from plan.md or activity logs that justifies your judgment (≤500 chars). For "cannot_evaluate", evidence must explain why the signal is not applicable to this question.

\`feedback\` (≤3000 chars) is a SYNTHESIS — open with the mode classification (e.g., "Mode B (design-only): question stipulates 10K req/s and 200M URLs."), then explain the score in 2–4 themes (what the plan got right, what it missed, what the candidate should learn). Do NOT enumerate per-signal pass/fail in feedback — that's what \`signals[*].evidence\` is for.

\`top_actions\` (≤5 items, each ≤200 chars) must be achievable in the same 2-hour design session. "Run a 10K req/s load test" is NOT valid; "sketch how you'd validate at demo scale" is.

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

  // Hint usage — temporal + content evidence for ai_authored_plan,
  // ai_strategy_explicit, etc. The full chat history matters for the
  // judgment (e.g., whether the candidate had the bot do their thinking),
  // so we send every exchange in full rather than sampling.
  if (input.hints.length === 0) {
    sections.push(`## AI hint usage\nNo hint chat used during this session.`);
  } else {
    const lines = [`${input.hints.length} hint exchange(s) during the session.`];
    for (const h of input.hints) {
      lines.push(
        `- [${h.elapsedMinutes}m elapsed] User: ${JSON.stringify(h.prompt)}\n  Bot: ${JSON.stringify(h.response)}`,
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
