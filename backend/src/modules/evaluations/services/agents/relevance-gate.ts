import { SignalResult } from '../../models/evaluation.types';

// Deterministic backstops for the relevance-gating instructions in the
// system prompt. Small LLMs (and sometimes large ones) ignore prose
// rules and score signals anyway — usually as MISS, which unfairly
// drags the total down. These helpers post-process the parsed LLM
// output and force specific judgments to `cannot_evaluate` based on
// what the question text says.
//
// Two gates today:
//   1. AI-domain gate — skip AI/LLM/agentic signals when the question
//      doesn't invoke AI (URL shortener, rate limiter, log pipeline).
//   2. Mode-B build-execution gate — skip "no build sequence" and "no
//      validation plan" bad signals when the question is at production
//      scale and clearly cannot be built in a 2-hour session.

const AI_DOMAIN_SIGNAL_IDS: readonly string[] = [
  'ai_strategy_explicit',
  'ai_strategy_absent',
];

// Keyword whitelist. Errs toward more matches (false positive = LLM
// scoring runs as before; false negative = unfair gate) so be generous
// when adding terms.
const AI_DOMAIN_KEYWORDS: readonly string[] = [
  'ai',
  'a.i.',
  'llm',
  'agent',
  'agentic',
  'gpt',
  'claude',
  'gemini',
  'rag',
  'mcp',
  'nlp',
  'language model',
  'foundation model',
  'machine learning',
  'ml',
  'genai',
  'gen-ai',
  'gen ai',
  'chatbot',
  'assistant',
  'embedding',
  'vector db',
  'vector database',
  'transformer',
  'neural net',
  'copilot',
];

export interface RelevanceGateResult {
  results: Record<string, SignalResult>;
  gated: string[];
}

export function applyAIRelevanceGate(
  questionPrompt: string,
  signalResults: Record<string, SignalResult>,
): RelevanceGateResult {
  if (questionInvokesAI(questionPrompt)) {
    return { results: signalResults, gated: [] };
  }

  const out: Record<string, SignalResult> = { ...signalResults };
  const gated: string[] = [];
  for (const id of AI_DOMAIN_SIGNAL_IDS) {
    const cur = out[id];
    if (!cur) continue;
    // Already skipped by the LLM (the prompt rule did its job for this one).
    if (cur.result === 'cannot_evaluate') continue;
    out[id] = {
      result: 'cannot_evaluate',
      evidence:
        `Auto-skipped by relevance gate: question does not invoke AI/LLM/agentic systems. ` +
        `(LLM originally returned "${cur.result}" — evidence: "${truncate(cur.evidence, 120)}")`,
    };
    gated.push(id);
  }
  return { results: out, gated };
}

function questionInvokesAI(questionPrompt: string): boolean {
  const lc = questionPrompt.toLowerCase();
  return AI_DOMAIN_KEYWORDS.some((kw) => containsWord(lc, kw));
}

// Word-boundary match — avoids matching "ai" inside "maintain", "ml" inside
// "html", etc. Multi-word keywords match across whitespace naturally.
function containsWord(haystack: string, needle: string): boolean {
  // Escape regex metacharacters in keywords (e.g., "a.i." has dots).
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// ─── Mode-B gate ────────────────────────────────────────────────────
// "Mode B" questions stipulate production-scale targets (10K+ req/s,
// 100M+ users, distributed systems) that obviously cannot be built and
// load-tested in a 2-hour design session. The rubric still wants a
// written ordering and a sketched validation plan, but we observe the
// LLM repeatedly firing the *bad* counterparts (`no_build_sequence`,
// `no_validation_plan`) on plans that DO articulate the concept,
// because the model is comparing against production-grade execution.
// Skipping these bad signals in Mode B is the right asymmetric tradeoff:
// candidates can still earn credit on the good counterparts
// (`build_sequence_planned`, `validation_plan_concrete`) when the plan
// has them, but they aren't penalized when it doesn't.

const BUILD_EXECUTION_BAD_SIGNAL_IDS: readonly string[] = [
  'no_build_sequence',
  'no_validation_plan',
];

// Patterns that signal "this is a production-scale problem". Conservative
// — match only when the question explicitly stipulates throughput or
// distributed concerns. Ambiguous mid-size questions stay in Mode A.
const MODE_B_PATTERNS: readonly RegExp[] = [
  // Numeric throughput in K/M/B (e.g. "10K req/s", "100M users", "50K events/sec")
  /\b\d+\s*[kmb]\b\s*(req|request|requests|qps|rps|tps|user|users|event|events|message|messages|connection|connections|eps|operations|ops)/i,
  // Spelled-out millions/billions: "100 million users", "1 billion requests"
  /\b\d+\s*(million|billion)\b/i,
  // Distributed-system-only language that implies scale beyond 2h
  /\b(distributed system|multi[- ]region|globally distributed|horizontal(ly)? scal|shard(ing|ed)?|geo[- ]?replicat)/i,
];

export function applyModeBBuildExecutionGate(
  questionPrompt: string,
  signalResults: Record<string, SignalResult>,
): RelevanceGateResult {
  if (!isModeBQuestion(questionPrompt)) {
    return { results: signalResults, gated: [] };
  }

  const out: Record<string, SignalResult> = { ...signalResults };
  const gated: string[] = [];
  for (const id of BUILD_EXECUTION_BAD_SIGNAL_IDS) {
    const cur = out[id];
    if (!cur) continue;
    if (cur.result === 'cannot_evaluate') continue;
    // Only override when the LLM was about to penalize. MISS on a bad
    // signal means "didn't fire" — already the desired outcome, leave
    // it alone so the report reflects the LLM's actual judgment.
    if (cur.result === 'miss') continue;
    out[id] = {
      result: 'cannot_evaluate',
      evidence:
        `Auto-skipped by Mode-B gate: question is at production scale and ` +
        `cannot be built/validated in a 2-hour design session, so the bad ` +
        `signal is not applied. (LLM originally returned "${cur.result}" — ` +
        `evidence: "${truncate(cur.evidence, 120)}")`,
    };
    gated.push(id);
  }
  return { results: out, gated };
}

function isModeBQuestion(prompt: string): boolean {
  return MODE_B_PATTERNS.some((re) => re.test(prompt));
}
