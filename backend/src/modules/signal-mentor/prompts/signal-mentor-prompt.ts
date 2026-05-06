import { SystemBlock, ToolDefinition } from '../../llm/types/llm.types';
import { SignalMentorInput } from '../types/signal-mentor.types';

export const SUBMIT_ANNOTATIONS_TOOL_NAME = 'submit_signal_annotations';

export interface BuiltSignalMentorPrompt {
  systemBlocks: SystemBlock[];
  userMessage: string;
}

export function buildSignalMentorPrompt(input: SignalMentorInput): BuiltSignalMentorPrompt {
  const seniorityLabel = input.seniority ?? 'engineer';
  return {
    systemBlocks: [
      { text: renderPersonaSystemBlock(seniorityLabel), cacheable: true },
      { text: `## Session question\n${input.question}`, cacheable: true },
    ],
    userMessage: renderUserPayload(input),
  };
}

export function flattenForAudit(p: BuiltSignalMentorPrompt): string {
  return p.systemBlocks.map((b) => b.text).join('\n\n') + '\n\n---\n\n' + p.userMessage;
}

export function buildAnnotationsTool(gapSignalIds: string[]): ToolDefinition {
  const properties: Record<string, unknown> = {};
  for (const id of gapSignalIds) {
    properties[id] = {
      type: 'string',
      maxLength: 800,
      description:
        'Plan-specific coaching, 2–4 sentences, ≤120 words. Concrete content the candidate could have written. No rubric vocabulary, no signal ids, no hit/miss.',
    };
  }
  return {
    name: SUBMIT_ANNOTATIONS_TOOL_NAME,
    description:
      "Submit per-signal coaching annotations for the candidate's plan.md. One entry per gap signal id; the schema enforces this exact set.",
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: gapSignalIds,
      properties,
    },
  };
}

function renderPersonaSystemBlock(seniorityLabel: string): string {
  return `You are a senior staff engineer writing per-signal coaching for a
${seniorityLabel}-level engineer's system-design plan. The evaluator has
already scored their plan against a rubric and produced per-signal
verdicts. Your job is to write SHORT, CONCRETE plan-specific coaching
for each "gap" signal — signals where the candidate fell short:

- **Missed good signals**: good-polarity signals scored \`miss\` or \`partial\`.
- **Fired bad signals**: bad-polarity signals scored \`hit\` or \`partial\`.

For each gap signal you receive, write 2–4 sentences (≤ 120 words):

1. Name the gap in plain language (1 sentence). Reference what's
   actually in their plan, not the rubric.
2. Show concrete content the candidate could have written for THIS
   specific question (1–2 sentences). Not meta-description ("they
   should explain caching"); actual plan-md text they could write
   ("a strong version reads: 'redirect path is read-through Redis,
   keyed by short-id, TTL 24h, on miss fetch from Postgres and
   write-back'").
3. (Optional) Name the concept once (e.g., "cache-aside",
   "consistent hashing", "idempotency") so the candidate has a
   search term.

# Constraints (non-negotiable)

- **Per-signal independence.** Each annotation stands alone — the
  candidate may read only the one for the row they're hovering on.
  Don't refer to "the previous gap" or "as I mentioned above."
- **No rubric vocabulary.** Never write signal IDs, "hit", "miss",
  "partial", weights, or scores. The candidate has the verdict
  already in the UI; you translate it into action.
- **No quoting the evidence text back.** The UI shows the evidence
  quote next to your annotation. Repeating it wastes the candidate's
  attention.
- **Specificity over hedging.** "Add an explicit consistency model:
  read-after-write within a region, eventual cross-region" is good.
  "Consider thinking about consistency" is empty.
- **For fired bad signals**: explain what about the plan triggered
  the negative signal and how to remove the cause. Don't lecture
  about the signal in the abstract.
- **For missed good signals**: explain what content would have
  credited the signal — the actual sentence/paragraph the candidate
  could include.
- **Length**: 2–4 sentences, ≤ 120 words. Less is better. Trim every
  sentence that doesn't add information.

# Output

You must call the \`submit_signal_annotations\` tool with a JSON object
whose keys are exactly the signal IDs listed in the user message and
nothing else. Each value is the coaching string for that signal.

If you can't write a meaningful annotation for a signal because the
candidate's plan provides no surface to reference, still produce the
annotation — describe what content would have credited the signal in
abstract-but-concrete terms, anchored to the question.`;
}

function renderUserPayload(input: SignalMentorInput): string {
  const parts: string[] = [];

  parts.push(`## Candidate's plan.md\n${input.planMd && input.planMd.trim() ? input.planMd : '(empty)'}`);

  parts.push(`## Evaluator's score: ${input.score.toFixed(2)} / 5`);

  if (input.feedbackText) {
    parts.push(`## Evaluator's overall feedback\n${input.feedbackText}`);
  }

  // The set of gap signals — exactly what the LLM must produce
  // annotations for. Each entry includes the signal description, judge
  // notes, the verdict, and the evidence the evaluator quoted.
  const gapBlocks = input.gaps.map((g) => {
    const polarityLabel = g.signal.polarity === 'good' ? 'GOOD signal' : 'BAD signal';
    const verdictLabel = g.result.result.toUpperCase();
    const lines = [
      `### ${g.signal.id} (${polarityLabel}, weight: ${g.signal.weight})`,
      `verdict: ${verdictLabel}`,
      `description: ${g.signal.description.trim()}`,
    ];
    if (g.signal.judgeNotes) {
      lines.push(`judge_notes: ${g.signal.judgeNotes.trim()}`);
    }
    if (g.result.evidence) {
      lines.push(`evaluator's evidence quote: ${JSON.stringify(g.result.evidence)}`);
    }
    return lines.join('\n');
  });

  parts.push(
    `## Gap signals to annotate (${input.gaps.length})\n` +
      `Produce exactly one annotation per id below. The tool schema enforces this set.\n\n` +
      gapBlocks.join('\n\n'),
  );

  return parts.join('\n\n');
}
