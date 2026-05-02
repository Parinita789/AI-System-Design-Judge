import { Rubric } from '../types/rubric.types';
import { SystemBlock } from '../../llm/types/llm.types';
import { PhaseEvalInput } from '../types/evaluation.types';

export interface BuiltPrompt {
  systemBlocks: SystemBlock[];
  userMessage: string;
}

export function buildPlanPrompt(rubric: Rubric, input: PhaseEvalInput): BuiltPrompt {
  // Both blocks are cacheable: the rubric is frozen across evaluations
  // and the session question is constant within a session, so prompt
  // caching catches them.
  return {
    systemBlocks: [
      { text: renderRubricSystemPrompt(rubric), cacheable: true },
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

  // v2.0+ has its variant pre-selected; v1.0 needs the LLM to classify.
  const modeOpener = rubric.mode
    ? `## How to read this rubric (the ${rubric.mode} variant has already been chosen)
You are evaluating a system-design plan in the **${rubric.mode}** variant
of the v2.0 plan rubric:
  - **build**  = small/buildable problem; candidate could realistically
                 implement and verify in the same session.
  - **design** = production-scale design exercise; candidate articulates,
                 does not implement.
The signals, weights, and anchors below already reflect ${rubric.mode}-mode
expectations — score against them directly. Do not classify the question
yourself; the routing was done at session creation time. Open the
\`feedback\` field with one line confirming the variant
(e.g. "${rubric.mode}: <one-sentence rationale tied to the question's scope>").`
    : `## How to read this rubric (IMPORTANT — read before judging)

This is a 1-hour session. Before scoring any signal, classify the question
into one of two modes — your judgment depth depends on which:

### Mode A — "buildable" (small, concrete problem, no large-scale NFRs)
The question asks for something the candidate could realistically design
AND build a working version of in ~1 hour.
Expectations: build_sequence_planned and validation_plan_concrete should
be concrete; failure_modes_articulated should name exercisable failures;
a short-but-complete plan can score HIT across most signals.

### Mode B — "design-only" (large-scale, distributed, infeasible to build in 1h)
The question stipulates production-grade NFRs or a distributed system.
Expectations: score articulation and reasoning, NOT execution evidence.
Every signal description starts with "Plan articulates ..." — interpret
literally. Question NFRs describe the TARGET system, not the validation
bar. A 4–6 step build sequence is plenty; full DDL is not required.

### How to use these modes
State your mode classification at the top of \`feedback\`. If genuinely
ambiguous, default to Mode B and note the ambiguity.`;

  const seniorityOpener = rubric.seniority
    ? `## Calibrate to the candidate's seniority: ${rubric.seniority}
You are evaluating a ${rubric.seniority}-level engineer. Apply these
expectations when judging individual signals (HIT / PARTIAL / MISS):
  - junior: clarity of intent + a working approach are enough. Accept
    rough articulation as PARTIAL rather than MISS. Don't penalize a
    light treatment of capacity, bottlenecks, or consistency.
  - mid:    add specificity — named interfaces, concrete validation,
    explicit tradeoffs. Capacity / bottleneck reasoning is a bonus.
  - senior: full bar — capacity, bottlenecks, scale-aware data model.
    The current rubric anchors are calibrated here.
  - staff:  bar is reasoning depth, not just coverage. Tradeoffs must
    be defended; bottlenecks named with concrete mitigations; a plan
    that hits all signals at HIT but lacks senior-level reasoning
    earns PARTIAL on those signals, not HIT.
Open the \`feedback\` field by acknowledging the seniority, e.g.
"${rubric.seniority}-level evaluation: …".`
    : '';

  return `You are an evaluator for the ${rubric.phaseName} phase of a system-design practice session.

Read the artifacts the user will provide and return a structured JSON evaluation matching the schema at the bottom of this prompt. Be specific and cite evidence from the artifacts. Do not invent content that isn't in the artifacts.

${modeOpener}

${seniorityOpener}

### Feedback prose must align with the mode (IMPORTANT)
The \`feedback\` and \`top_actions\` fields MUST be self-consistent with
your mode classification. They are read by the candidate after the
breakdown and they should not contradict it. Specifically:

- In **Mode B**, do NOT criticize the plan for "no build sequence",
  "no validation plan", "missing load tests", "no benchmarks", or
  similar — those expectations don't apply to a 1-hour design exercise
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
  and test the system in 1 hour.
- \`top_actions\` should only include actions that are achievable and
  worthwhile within the same 1-hour design session. "Run a 10K req/s
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

\`top_actions\` (≤5 items, each ≤200 chars) must be achievable in the same 1-hour design session. "Run a 10K req/s load test" is NOT valid; "sketch how you'd validate at demo scale" is.

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

  sections.push(
    `## plan.md (final state)\n${input.planMd && input.planMd.trim().length > 0 ? input.planMd : '(empty)'}`,
  );

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

  // Full chat history is needed to judge ai_authored_plan reliably; no sampling.
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

  const activeMinutes =
    input.snapshots.length > 0
      ? Math.max(...input.snapshots.map((s) => s.elapsedMinutes))
      : 0;
  sections.push(
    `## Active elapsed\n${activeMinutes} minute(s) of active work (pause-aware, excludes paused time).`,
  );

  return sections.join('\n\n');
}
