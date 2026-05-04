// Anthropic per-million-token rates, USD. Cache write is 1.25x the input
// rate; cache read is 0.1x the input rate (Anthropic's ephemeral cache
// pricing). Update here when rates change.
const RATES_PER_M_USD: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7':   { input: 5,  output: 25 },
  'claude-opus-4-6':   { input: 5,  output: 25 },
  'claude-sonnet-4-6': { input: 3,  output: 15 },
  'claude-haiku-4-5':  { input: 1,  output: 5  },
};

export interface CostInputs {
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export function computeCostUsd(audit: CostInputs): number | null {
  const r = RATES_PER_M_USD[audit.modelUsed];
  if (!r) return null;
  // Claude CLI doesn't expose token counts (everything reads as 0). If
  // the provider couldn't track tokens we don't know what was billed —
  // return null so the UI shows "—" instead of a misleading "$0".
  const totalTokens =
    audit.tokensIn + audit.tokensOut + audit.cacheCreationTokens + audit.cacheReadTokens;
  if (totalTokens === 0) return null;
  const usd =
    audit.tokensIn * r.input +
    audit.cacheCreationTokens * r.input * 1.25 +
    audit.cacheReadTokens * r.input * 0.1 +
    audit.tokensOut * r.output;
  return usd / 1_000_000;
}

export function formatCostUsd(cost: number | null): string {
  if (cost === null) return '—';
  if (cost === 0) return '$0';
  if (cost < 0.001) return '<$0.001';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatLatency(latencyMs: number | null | undefined): string {
  if (latencyMs === null || latencyMs === undefined) return '—';
  if (latencyMs < 1000) return `${latencyMs}ms`;
  return `${(latencyMs / 1000).toFixed(1)}s`;
}
