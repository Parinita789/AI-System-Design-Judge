import { PhaseEvaluationResult, SignalResult } from '../src/modules/evaluations/models/evaluation.types';
import { Fixture, FixtureResult, SignalMismatch, SignalMode } from './types';

function modeAccepts(mode: SignalMode, actual: SignalResult['result']): boolean {
  switch (mode) {
    case 'hit':
      return actual === 'hit';
    case 'partial':
      return actual === 'partial';
    case 'miss':
      return actual === 'miss';
    case 'credited':
      return actual === 'hit' || actual === 'partial';
    case 'skipped':
      return actual === 'cannot_evaluate';
  }
}

export function compareResult(
  fx: Fixture,
  out: PhaseEvaluationResult,
  elapsedMs: number,
  modelUsed: string,
): FixtureResult {
  const scoreOk =
    out.score >= fx.expectedScore.min && out.score <= fx.expectedScore.max;

  const mismatches: SignalMismatch[] = [];
  let signalsExpected = 0;

  for (const [modeKey, ids] of Object.entries(fx.expectedSignals)) {
    const mode = modeKey as SignalMode;
    for (const id of ids ?? []) {
      signalsExpected++;
      const sig = out.signalResults[id];
      if (!sig) {
        mismatches.push({
          signalId: id,
          expectedMode: mode,
          actualResult: 'not_returned',
          actualEvidence: '',
        });
        continue;
      }
      if (!modeAccepts(mode, sig.result)) {
        mismatches.push({
          signalId: id,
          expectedMode: mode,
          actualResult: sig.result,
          actualEvidence: sig.evidence,
        });
      }
    }
  }

  const signalsMet = signalsExpected - mismatches.length;
  const signalsOk = mismatches.length === 0;
  // warnOnly fixtures still report their mismatches but don't fail the suite.
  const pass = fx.warnOnly === true ? true : scoreOk && signalsOk;

  return {
    name: fx.name,
    description: fx.description,
    pass,
    scoreOk,
    signalsOk,
    actualScore: out.score,
    expectedScore: fx.expectedScore,
    signalsExpected,
    signalsMet,
    mismatches,
    warnOnly: fx.warnOnly === true,
    elapsedMs,
    modelUsed,
  };
}
