import { estimateCostUsd, nextUtcMidnight, todayUtcMidnight } from './pricing';

describe('estimateCostUsd', () => {
  it('returns 0 for claude_cli regardless of model + tokens', () => {
    expect(
      estimateCostUsd('claude_cli', 'claude-opus-4-7', {
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheCreationTokens: 1_000_000,
      }),
    ).toBe(0);
  });

  it('returns 0 for ollama regardless of model + tokens', () => {
    expect(
      estimateCostUsd('ollama', 'llama3.1', {
        tokensIn: 5_000_000,
        tokensOut: 5_000_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toBe(0);
  });

  it('computes Opus 4.7 cost — 1M input + 1M output = $5 + $25 = $30', () => {
    expect(
      estimateCostUsd('anthropic', 'claude-opus-4-7', {
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toBeCloseTo(30, 6);
  });

  it('computes Haiku 4.5 cost — 1M input + 1M output = $1 + $5 = $6', () => {
    expect(
      estimateCostUsd('anthropic', 'claude-haiku-4-5', {
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toBeCloseTo(6, 6);
  });

  it('includes cache read + cache creation in the total', () => {
    // 100K input × $5/1M = $0.50
    // 100K output × $25/1M = $2.50
    // 100K cache read × $0.50/1M = $0.05
    // 100K cache create × $6.25/1M = $0.625
    // Total: $3.675
    expect(
      estimateCostUsd('anthropic', 'claude-opus-4-7', {
        tokensIn: 100_000,
        tokensOut: 100_000,
        cacheReadTokens: 100_000,
        cacheCreationTokens: 100_000,
      }),
    ).toBeCloseTo(3.675, 6);
  });

  it('normalizes date-stamped model IDs (claude-opus-4-7-20251010 → claude-opus-4-7)', () => {
    expect(
      estimateCostUsd('anthropic', 'claude-opus-4-7-20251010', {
        tokensIn: 1_000_000,
        tokensOut: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toBeCloseTo(5, 6);
  });

  it('throws for unknown Anthropic model with a fix-it pointer', () => {
    expect(() =>
      estimateCostUsd('anthropic', 'claude-future-99', {
        tokensIn: 100,
        tokensOut: 100,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toThrow(/add a row to ANTHROPIC_PRICING/);
  });

  it('throws for unknown provider', () => {
    expect(() =>
      estimateCostUsd('openai' as never, 'gpt-4', {
        tokensIn: 100,
        tokensOut: 100,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      }),
    ).toThrow(/Unknown LLM provider/);
  });
});

describe('todayUtcMidnight / nextUtcMidnight', () => {
  it('todayUtcMidnight returns the same day at 00:00:00.000 UTC', () => {
    const ref = new Date('2026-05-20T14:37:42.123Z');
    expect(todayUtcMidnight(ref).toISOString()).toBe('2026-05-20T00:00:00.000Z');
  });

  it('nextUtcMidnight returns the next day at 00:00:00.000 UTC', () => {
    const ref = new Date('2026-05-20T14:37:42.123Z');
    expect(nextUtcMidnight(ref).toISOString()).toBe('2026-05-21T00:00:00.000Z');
  });

  it('handles month boundary correctly', () => {
    const ref = new Date('2026-05-31T23:00:00.000Z');
    expect(nextUtcMidnight(ref).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});
