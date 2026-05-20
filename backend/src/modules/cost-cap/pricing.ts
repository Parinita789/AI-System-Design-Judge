// Per-model pricing for cost-cap enforcement. These are SERVER-SIDE
// ESTIMATES, not the authoritative bill — Anthropic's dashboard is
// the source of truth for real charges. The estimate exists so the
// daily cap can fire before the next LLM call rather than relying on
// async reconciliation.
//
// Numbers are USD per 1M tokens, as of the model's public pricing
// page (see https://docs.claude.com/en/docs/about-claude/models).
// When Anthropic ships a new model: add a row here AND to
// MODEL_CONTEXT_WINDOWS in llm-tunables.config.ts. The unknown-model
// error message points back to this file.

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M: number;
  cacheCreationPer1M: number;
}

const ANTHROPIC_PRICING: Readonly<Record<string, ModelPricing>> = {
  'claude-opus-4-7':   { inputPer1M: 5.0, outputPer1M: 25.0, cacheReadPer1M: 0.5, cacheCreationPer1M: 6.25 },
  'claude-opus-4-6':   { inputPer1M: 5.0, outputPer1M: 25.0, cacheReadPer1M: 0.5, cacheCreationPer1M: 6.25 },
  'claude-sonnet-4-6': { inputPer1M: 3.0, outputPer1M: 15.0, cacheReadPer1M: 0.3, cacheCreationPer1M: 3.75 },
  'claude-haiku-4-5':  { inputPer1M: 1.0, outputPer1M: 5.0,  cacheReadPer1M: 0.1, cacheCreationPer1M: 1.25 },
};

export type LlmProvider = 'anthropic' | 'claude_cli' | 'ollama';

export interface UsageTokens {
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// Trim Anthropic's optional date-suffix from model IDs (e.g.
// 'claude-opus-4-7-20251010') so the pricing table only needs base
// names. Mirrors normalizeModelId in llm-tunables.config.ts; kept
// local to avoid cross-module dep on pricing.
function normalizeModelId(model: string): string {
  return model.replace(/-\d{8}$/, '');
}

export function estimateCostUsd(
  provider: LlmProvider,
  model: string,
  tokens: UsageTokens,
): number {
  // Subscription / local providers don't bill per token.
  if (provider === 'claude_cli' || provider === 'ollama') return 0;

  if (provider === 'anthropic') {
    const pricing = ANTHROPIC_PRICING[normalizeModelId(model)];
    if (!pricing) {
      throw new Error(
        `Unknown Anthropic model "${model}" — add a row to ANTHROPIC_PRICING in ` +
          `backend/src/modules/cost-cap/pricing.ts. See ` +
          `https://docs.claude.com/en/docs/about-claude/models for current rates.`,
      );
    }
    return (
      (tokens.tokensIn * pricing.inputPer1M) / 1_000_000 +
      (tokens.tokensOut * pricing.outputPer1M) / 1_000_000 +
      (tokens.cacheReadTokens * pricing.cacheReadPer1M) / 1_000_000 +
      (tokens.cacheCreationTokens * pricing.cacheCreationPer1M) / 1_000_000
    );
  }

  // Unknown provider — fail loud rather than silently $0.
  throw new Error(`Unknown LLM provider "${provider}" — add to LlmProvider union and pricing rules.`);
}

// Utility for daily-reset accounting. Returns a Date at the most
// recent UTC midnight (i.e. start of today in UTC).
export function todayUtcMidnight(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Returns the next UTC midnight — used in error bodies as the
// "your cap resets at" timestamp.
export function nextUtcMidnight(now: Date = new Date()): Date {
  const d = todayUtcMidnight(now);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
