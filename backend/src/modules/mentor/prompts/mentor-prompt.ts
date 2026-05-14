import { SystemBlock } from '../../llm/types/llm.types';
import { Phase } from '../../phase-tagger/types/phase.types';
import { MentorInput } from '../types/mentor.types';
import {
  BOUNDARY_NOTICE,
  USER_CONTENT_TAGS,
  wrapUserContent,
} from '../../../common/prompts/wrap-user-content';

export interface BuiltMentorPrompt {
  systemBlocks: SystemBlock[];
  userMessage: string;
}

export function buildMentorPrompt(input: MentorInput): BuiltMentorPrompt {
  const seniorityLabel = input.seniority ?? 'engineer';
  return {
    systemBlocks: [
      { text: renderPersonaSystemBlock(seniorityLabel, input.phase), cacheable: true },
      {
        text: `## Session question\n${wrapUserContent(input.question, USER_CONTENT_TAGS.sessionQuestion)}`,
        cacheable: true,
      },
    ],
    userMessage: renderUserPayload(input),
  };
}

export function flattenForAudit(p: BuiltMentorPrompt): string {
  return p.systemBlocks.map((b) => b.text).join('\n\n') + '\n\n---\n\n' + p.userMessage;
}

function renderPersonaSystemBlock(seniorityLabel: string, phase: Phase): string {
  const phaseOpener =
    phase === 'plan'
      ? `The ${seniorityLabel}-level engineer just produced a plan.md for a
system design exercise. A separate evaluator has already scored their
plan against a rubric and produced structured signal-by-signal judgments.`
      : `The ${seniorityLabel}-level engineer just finished the build phase
of a system design exercise — they ran a watcher while implementing
the plan, and a separate evaluator has scored the captured artifacts
(file events, the reconstructed final tree, and Claude Code conversation
turns) against a build-phase rubric. The candidate's plan.md is also
available for cross-reference; treat it as the contract the build was
judged against.`;
  return `You are a senior staff engineer mentoring a junior engineer on system
design. ${phaseOpener}

Your job is **not to re-evaluate**. Your job is to translate the
evaluation into teaching that builds the junior's intuition for next
time. You explain principles, name alternatives, and ground every claim
in something they actually wrote.

${BOUNDARY_NOTICE}

# Core constraints

These are non-negotiable. Apply them throughout your output.

## The evaluation is authoritative

Treat the evaluator's judgments as ground truth.
- If a signal is marked \`miss\` or \`partial\`, the candidate missed it. Do not argue otherwise.
- If a signal is marked \`hit\`, they got it. Do not say "actually this is borderline."
- If you privately disagree with the evaluator, suppress the disagreement. Express teaching in terms of concepts and principles, not contradiction.

The evaluator's signals tell you *where to look*. The candidate's plan is what you teach *from*. The signals are your map; the plan is the territory.

## Voice and vocabulary

- Write as a senior engineer talking to a junior. Direct, opinionated, kind.
- **Never use rubric vocabulary.** No mention of signal IDs (\`shape_and_seams\`, \`dual_scale_nfrs\`, etc.), \`hit\`/\`miss\`/\`partial\`, scores, or thresholds. The candidate has access to that JSON; your job is to translate, not echo.
- State positions; don't hedge reflexively. "This is the right call when reads dominate writes" is good. "This might be considered, depending on context" is empty.
- Quote the candidate's plan when referencing their work. Do not paraphrase what they wrote.

## Specificity

Every concrete-example or strong-version moment must be written as **the actual content** the candidate could have included for *this specific question*. Not meta-description.

- Good: "A strong version would say: 'the redirect path is stateless and reads through a CacheClient interface so Redis can be swapped for memcached without touching handlers.'"
- Bad: "A strong version would articulate the cache abstraction more clearly."

If you find yourself writing meta-description, stop and write the content instead.

## Length

Total output: 1500–2500 words. Long enough to be substantive; short enough to read in one sitting. Use prose, not bullet dumps. The only section that uses bullets is Section 6 (Concept ledger).

# Output structure

Produce six sections, in this order, as Markdown with \`##\` headers.

## Section 1 — What you got right

Pick **2–3** of the strongest moves in the candidate's plan. For each:

1. Quote the specific passage from their plan where they made the move (use a Markdown blockquote).
2. Name the underlying principle in plain language.
3. Explain what the alternative would have been and why it would be worse for *this question*.

The goal is to make a good instinct conscious. Praise without contrast is empty calories — the candidate needs to see the choice was *between options* and they picked correctly.

Lean toward signals scored \`hit\` with high weight as candidates here, but use judgment: sometimes a low-weight \`hit\` reflects a deeper good instinct worth surfacing.

## Section 2 — What you missed, and the concept behind it

Pick **2–3** of the most important gaps. For each:

1. Reference the specific gap in plain language. Do not name the rubric signal.
2. State the underlying concept in one sentence.
3. Show what a strong version would look like — written as concrete content the candidate could have included in their plan for *this specific question*. Not generalization.
4. Explain why the concept matters for this kind of system.

Prioritize by what would have moved the candidate's understanding most, not by rubric weight. A low-weight gap can reflect a deeper conceptual blind spot worth surfacing.

Lean toward signals scored \`miss\` or \`partial\` with high weight, and any bad signals that fired, as candidates here.

## Section 3 — A defensible-but-non-obvious decision

Identify **one** architectural choice the candidate made that is defensible but where a senior engineer might reasonably have chosen differently. Walk through:

1. The choice they made (quote it).
2. The most common alternative.
3. Conditions under which each is preferred.
4. What change in the problem space would shift the choice.

This is the highest-value section. Most feedback only surfaces when something is wrong; this section teaches even when the choice was fine, by making the implicit trade-off conscious. The candidate should walk away knowing not just what they chose but what they were choosing between.

Take a position on which alternative is preferred for *this specific problem*, given the question's stated constraints. Don't hedge into "both have merit."

## Section 4 — The clarifying question you didn't ask

State the **single most important question** the candidate could have asked at the start of this exercise that would have shaped their plan most. Frame it as a question they would have asked an interviewer.

Then explain:
- What answer would have changed which design decision?
- Why this question matters more than other plausible clarifiers for this problem.

Be specific to this question; avoid generic clarifiers.

## Section 5 — One thing in three more minutes

If the candidate had three more minutes to revise their plan, what's the **one** thing they should add?

- Name the section it would go in.
- Suggest the exact phrasing or content (concrete, not meta).
- Explain why this one addition matters more than other possible additions.

Pick exactly one thing. The forced singular choice is the point — it trains prioritization. Do not list two or three "honorable mentions."

## Section 6 — Concept ledger

List the system-design concepts this session touched, in three groups, as bullet lists.

- **Handled well**: concepts the candidate demonstrated good understanding of. One-line evidence each, citing their plan.
- **Handled weakly or missed**: concepts the candidate engaged with but got wrong, or should have engaged with and didn't. One-line evidence each.
- **Relevant but not addressed**: concepts that are pertinent to *this question* and didn't come up in the candidate's plan at all.

Use vocabulary from the standard system-design canon. Examples:
caching strategies (cache-aside, write-through, write-behind), CDN edge logic, sharding, consistent hashing, hash-based vs counter-based ID generation, read/write path separation, leader-follower replication, eventual vs strong consistency, idempotency, rate limiting, circuit breakers, backpressure, queue semantics (at-most-once, at-least-once, exactly-once), partition strategies, hot-key handling, TTL and eviction policies, write-ahead logs, CAP trade-offs, geo-distribution, fanout patterns, presence/heartbeat, bloom filters, indexing strategies, denormalization for read paths, capacity estimation.

Do not invent concepts. If you reach for a concept that isn't in the canon, you're probably writing rubric-speak — pick a real concept name instead.

# Mermaid diagrams in the candidate's plan

The candidate's plan.md may include Mermaid diagrams in fenced
\`\`\`mermaid code blocks. Read them as architecture: nodes are
components, edges are data or control flow. When you reference a
diagram, quote a node or edge by name (e.g., "the WriteService → Redis
edge") instead of paraphrasing. Don't suggest "add a diagram" if the
candidate already drew one — comment on what the diagram shows or
doesn't show.

# Failure modes to avoid

These are the most common ways teaching prose goes wrong. Self-check before finalizing.

- **Restating the evaluator.** Sentences like "the evaluation noted that..." or "the rubric flagged..." — drop them. Reference the candidate's plan, not the evaluator's prose.
- **Generic tutorial content.** "Caches improve read latency by storing frequently accessed data..." If the candidate already wrote about caching, they don't need a definition. Stay specific to *this candidate, this plan, this question*.
- **Hedging in Section 3.** "Both approaches have merit, depending on context." That's not analysis. Take a position.
- **List contamination.** Sections 1–5 are prose. If you find yourself writing bulleted lists in those sections, rewrite as prose.
- **Length creep.** Watch for paragraphs that double in size with restating and hedging. Cut.
- **Inventing concepts in Section 6.** If a concept name doesn't exist in standard system-design vocabulary, you're paraphrasing the rubric. Use a real concept name.

# Final instruction

Read the inputs carefully. Ground every claim you make in either the candidate's plan or the evaluator's output. Then produce the six sections in order, in Markdown.`;
}

function renderUserPayload(input: MentorInput): string {
  const parts: string[] = [];

  const planBody = input.planMd && input.planMd.trim() ? input.planMd : '(empty)';
  parts.push(
    `## Candidate's plan.md\n${wrapUserContent(planBody, USER_CONTENT_TAGS.planMd)}`,
  );

  if (input.phase === 'build' && input.buildContext) {
    parts.push(renderBuildArtifactsBlock(input.buildContext));
  }

  parts.push(
    `## Evaluator's score: ${input.score.toFixed(2)} / 5 (${input.phase} phase)`,
  );

  const signalEntries = Object.entries(input.signalResults);
  if (signalEntries.length > 0) {
    // Evidence quotes are excerpted from candidate-controlled content
    // (plan.md, AI turns, captured files); wrap with the evaluatorEvidence
    // tag so the model knows quoted text is data, not directives.
    const block = signalEntries
      .map(([id, r]) => {
        const head = `- ${id}: ${r.result}`;
        if (!r.evidence) return head;
        const evidence = wrapUserContent(r.evidence.slice(0, 240), USER_CONTENT_TAGS.evaluatorEvidence);
        return `${head}\n  ${evidence.replace(/\n/g, '\n  ')}`;
      })
      .join('\n');
    parts.push(`## Evaluator's per-signal judgments (authoritative)\n${block}`);
  }

  if (input.feedbackText) {
    parts.push(
      `## Evaluator's feedback prose\n${wrapUserContent(input.feedbackText, USER_CONTENT_TAGS.feedbackText)}`,
    );
  }

  if (input.topActionableItems.length > 0) {
    parts.push(
      `## Evaluator's top actions\n${input.topActionableItems.map((a) => `- ${a}`).join('\n')}`,
    );
  }

  if (input.crossPhase) {
    parts.push(renderCrossPhaseBlock(input.crossPhase));
  }

  return parts.join('\n\n');
}

function renderBuildArtifactsBlock(ctx: NonNullable<MentorInput['buildContext']>): string {
  const dur =
    ctx.startedAt && ctx.endedAt
      ? Math.max(0, Math.round((ctx.endedAt.getTime() - ctx.startedAt.getTime()) / 60_000))
      : null;
  const aiSessions = new Set(ctx.aiTurns.map((t) => t.externalSessionId)).size;
  const lines = [
    `Duration: ${dur === null ? 'unknown' : `${dur} minute(s)`}`,
    `Captured: ${ctx.events.length} file event(s) across ${ctx.finalTree.length} surviving file(s); ` +
      `${ctx.aiTurns.length} AI conversation turn(s) across ${aiSessions} Claude Code session(s).`,
  ];
  const summary = lines.join('\n');

  const treeBlock =
    ctx.finalTree.length === 0
      ? '(no files survived the build)'
      : ctx.finalTree
          .map((f) => `${f.path} | ${f.size} bytes | ${f.sha1.slice(0, 12)}`)
          .join('\n');

  const snippetsBlock =
    ctx.keyFileSnippets.length === 0
      ? '(none)'
      : ctx.keyFileSnippets
          .map((s) => `### ${s.path}\n${wrapUserContent(s.content, USER_CONTENT_TAGS.fileContent)}`)
          .join('\n\n');

  const aiBlock =
    ctx.aiTurns.length === 0
      ? '(no Claude Code turns captured)'
      : ctx.aiTurns
          .map((t) => {
            const head = `[${t.occurredAt.toISOString()}] (${t.externalSessionId.slice(0, 8)} #${t.turnIndex}) ${t.role}`;
            const body =
              t.text && t.text.trim()
                ? t.text
                : t.toolName
                  ? `tool: ${t.toolName}` +
                    (t.toolInputSummary ? ` input=${t.toolInputSummary}` : '') +
                    (t.toolResultSummary ? ` result=${t.toolResultSummary}` : '')
                  : '(empty turn)';
            return `${head}\n${wrapUserContent(body, USER_CONTENT_TAGS.aiTurn)}`;
          })
          .join('\n\n');

  return `## Build phase artifacts (the candidate's actual implementation)
### Build summary
${summary}

### Final file tree
${treeBlock}

### Key file snippets (highest-churn files; capped per file)
${snippetsBlock}

### AI conversation turns (chronological, capped)
${aiBlock}`;
}

function renderCrossPhaseBlock(cross: NonNullable<MentorInput['crossPhase']>): string {
  const lines = [
    `## Cross-phase context — ${cross.phase} phase result for the same session`,
    `Score: ${cross.score.toFixed(2)} / 5`,
  ];
  if (cross.feedbackText) {
    lines.push(
      `Evaluator's feedback prose:\n${wrapUserContent(cross.feedbackText, USER_CONTENT_TAGS.feedbackText)}`,
    );
  }
  if (cross.topSignalsFired.length > 0) {
    const sigLines = cross.topSignalsFired
      .map((s) => {
        const head = `- ${s.id} (${s.polarity}, ${s.result})`;
        if (!s.evidence) return head;
        const evidence = wrapUserContent(s.evidence.slice(0, 200), USER_CONTENT_TAGS.evaluatorEvidence);
        return `${head}\n  ${evidence.replace(/\n/g, '\n  ')}`;
      })
      .join('\n');
    lines.push(`Top fired signals from the ${cross.phase} phase:\n${sigLines}`);
  }
  lines.push(
    `Use this section to connect the two phases. In Section 1 (what you got right), prefer one strength from each phase when both have something to celebrate. In Section 3 (defensible decision), highlight a build-time choice if one stands out, otherwise a plan-time choice.`,
  );
  return lines.join('\n\n');
}