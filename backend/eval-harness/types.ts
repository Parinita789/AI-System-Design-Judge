export type SignalMode = 'hit' | 'partial' | 'miss' | 'credited' | 'skipped';
export type RubricMode = 'build' | 'design';
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
  mode?: RubricMode; // required on v2.0+
  seniority?: FixtureSeniority; // defaults to 'senior' in the runner
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
