// Shape of a fixture on disk: a directory with plan.md (the input artifact)
// and fixture.yaml (metadata + expectations).

export type SignalMode = 'hit' | 'partial' | 'miss' | 'credited' | 'skipped';

export interface FixtureExpectation {
  expectedScore: { min: number; max: number };
  // Each key is a SignalMode; the value is a list of rubric signal IDs the
  // judge is expected to put in that mode for this fixture.
  expectedSignals: Partial<Record<SignalMode, string[]>>;
  warnOnly?: boolean;
}

export interface FixtureHint {
  occurredAt: string; // ISO date; loader converts to Date
  elapsedMinutes: number;
  prompt: string;
  response: string;
}

export interface Fixture extends FixtureExpectation {
  name: string;
  description: string;
  question: string;
  rubricVersion: string;
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
