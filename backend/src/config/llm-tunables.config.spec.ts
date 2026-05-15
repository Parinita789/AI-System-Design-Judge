import {
  AGENTS_CONFIG,
  contextWindowFor,
  inputTokenWarnThresholdFor,
  planMdCapFor,
} from './llm-tunables.config';

describe('contextWindowFor', () => {
  it('returns the table value for known base IDs', () => {
    expect(contextWindowFor('claude-opus-4-7')).toBe(1_000_000);
    expect(contextWindowFor('claude-opus-4-6')).toBe(1_000_000);
    expect(contextWindowFor('claude-sonnet-4-6')).toBe(1_000_000);
    expect(contextWindowFor('claude-haiku-4-5')).toBe(200_000);
  });

  it('normalizes date-stamped IDs to the base entry', () => {
    expect(contextWindowFor('claude-opus-4-7-20251010')).toBe(1_000_000);
    expect(contextWindowFor('claude-haiku-4-5-20260101')).toBe(200_000);
  });

  it('throws with a fix-it pointer for unknown models', () => {
    expect(() => contextWindowFor('claude-future-99')).toThrow(
      /add it to MODEL_CONTEXT_WINDOWS/,
    );
    expect(() => contextWindowFor('llama3.1')).toThrow(/Unknown model/);
  });
});

describe('inputTokenWarnThresholdFor', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('derives 75% of context when no env override', () => {
    expect(inputTokenWarnThresholdFor('claude-opus-4-7')).toBe(750_000);
    expect(inputTokenWarnThresholdFor('claude-haiku-4-5')).toBe(150_000);
  });

  it('honors env override when set', () => {
    process.env.TEST_WARN_KEY = '99999';
    expect(inputTokenWarnThresholdFor('claude-opus-4-7', 'TEST_WARN_KEY')).toBe(99_999);
  });

  it('falls back to derivation when env value is invalid', () => {
    process.env.TEST_WARN_KEY = 'not-a-number';
    expect(inputTokenWarnThresholdFor('claude-opus-4-7', 'TEST_WARN_KEY')).toBe(750_000);
  });

  it('falls back to derivation when env value is empty', () => {
    process.env.TEST_WARN_KEY = '';
    expect(inputTokenWarnThresholdFor('claude-opus-4-7', 'TEST_WARN_KEY')).toBe(750_000);
  });

  it('throws on unknown model with no env override', () => {
    expect(() => inputTokenWarnThresholdFor('unknown-model')).toThrow(/Unknown model/);
  });

  it('throws on unknown model even with env key passed but unset', () => {
    delete process.env.UNSET_KEY;
    expect(() => inputTokenWarnThresholdFor('unknown-model', 'UNSET_KEY')).toThrow(
      /Unknown model/,
    );
  });

  it('env override bypasses the model lookup entirely', () => {
    process.env.TEST_WARN_KEY = '42';
    expect(inputTokenWarnThresholdFor('unknown-model', 'TEST_WARN_KEY')).toBe(42);
  });
});

describe('planMdCapFor', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('derives 5% of context when no env override', () => {
    expect(planMdCapFor('claude-opus-4-7')).toBe(50_000);
    expect(planMdCapFor('claude-haiku-4-5')).toBe(10_000);
  });

  it('honors env override', () => {
    process.env.TEST_CAP_KEY = '20000';
    expect(planMdCapFor('claude-opus-4-7', 'TEST_CAP_KEY')).toBe(20_000);
  });

  it('falls back to derivation on invalid env', () => {
    process.env.TEST_CAP_KEY = '-5';
    expect(planMdCapFor('claude-opus-4-7', 'TEST_CAP_KEY')).toBe(50_000);
  });
});

describe('AGENTS_CONFIG defaults', () => {
  it('has a maxTokens for each LLM-calling agent', () => {
    expect(AGENTS_CONFIG.planAgent.maxTokens).toBeGreaterThan(0);
    expect(AGENTS_CONFIG.buildAgent.maxTokens).toBeGreaterThan(0);
    expect(AGENTS_CONFIG.mentorAgent.maxTokens).toBeGreaterThan(0);
    expect(AGENTS_CONFIG.signalMentorAgent.maxTokens).toBeGreaterThan(0);
    expect(AGENTS_CONFIG.hints.maxTokens).toBeGreaterThan(0);
  });

  it('has a defaultModel for each LLM-calling agent', () => {
    expect(AGENTS_CONFIG.planAgent.defaultModel).toBeTruthy();
    expect(AGENTS_CONFIG.buildAgent.defaultModel).toBeTruthy();
    expect(AGENTS_CONFIG.mentorAgent.defaultModel).toBeTruthy();
    expect(AGENTS_CONFIG.signalMentorAgent.defaultModel).toBeTruthy();
  });

  it('does not expose stale inputTokenWarnThreshold or truncation fields (moved to helpers)', () => {
    const cfg = AGENTS_CONFIG as unknown as Record<string, unknown>;
    expect((cfg.planAgent as Record<string, unknown>).inputTokenWarnThreshold).toBeUndefined();
    expect((cfg.truncation as Record<string, unknown> | undefined)).toBeUndefined();
  });
});
