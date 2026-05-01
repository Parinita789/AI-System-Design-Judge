export type SignalMode = 'hit' | 'partial' | 'miss' | 'credited' | 'skipped';

// Rubric variant. Required on v2.0+ fixtures; ignored on v1.0 fixtures.
export type RubricMode = 'build' | 'design';

// Per-attempt seniority. Optional everywhere — fixtures default to
// `senior` when absent (preserves pre-seniority calibration).
export type FixtureSeniority = 'junior' | 'mid' | 'senior' | 'staff';

export interface FixtureExpectation {
  expectedScore: { min: number; max: number };
  expectedSignals: Partial<Record<SignalMode, string[]>>;
  warnOnly?: boolean;
}

export interface FixtureHint {
  occurredAt: string;
  elapsedMinutes: number;
  prompt: string;
  response: string;
}

export interface Fixture extends FixtureExpectation {
  name: string;
  description: string;
  question: string;
  rubricVersion: string;
  // Required when rubricVersion is v2.0+. Optional on v1.0 fixtures.
  mode?: RubricMode;
  // Optional. When absent, the runner uses 'senior' so existing fixtures
  // stay calibrated as before. v2.0 fixtures can override per-fixture.
  seniority?: FixtureSeniority;
  planMd: string | null;
  hints?: FixtureHint[];
}

export interface SignalMismatch {
  signalId: string;
  expectedMode: SignalMode;
  actualResult: 'hit' | 'partial' | 'miss' | 'cannot_evaluate' | 'not_returned';
  actualEvidence: string;
}

export interface FixtureResult {
  name: string;
  description: string;
  pass: boolean;
  scoreOk: boolean;
  signalsOk: boolean;
  actualScore: number;
  expectedScore: { min: number; max: number };
  signalsExpected: number;
  signalsMet: number;
  mismatches: SignalMismatch[];
  warnOnly: boolean;
  elapsedMs: number;
  modelUsed: string;
}

export interface SuiteReport {
  results: FixtureResult[];
  totalElapsedMs: number;
  provider: string;
  model: string;
  rubricVersion: string;
}
