import { Rubric, RubricSignal } from '../models/rubric.types';
import { SignalResult } from '../models/evaluation.types';

// Deterministic score computation from the post-gate signal results.
// Replaces the LLM-emitted `score` field, which empirically drifts from
// the LLM's own signal judgments (it pattern-matches against the anchor
// scenarios instead of computing the threshold-table ratio).
//
// Algorithm — kept in sync with the prose `scoring.computation` block in
// the rubric YAML so the LLM and the backend score the same way:
//
//   For each good signal:
//     0 on miss / cannot_evaluate, 0.5 on partial, 1.0 on hit
//     contribution = multiplier × weight
//   good_score = sum(contributions for good signals NOT cannot_evaluate)
//   max_score  = sum(weights         for good signals NOT cannot_evaluate)
//
//   For each bad signal:
//     HIT      → full weight deduction
//     PARTIAL  → half weight deduction (mirrors good-signal partial credit)
//     MISS / cannot_evaluate → no deduction
//   bad_deductions = sum(deductions across bad signals)
//
//   ratio = max(0, good_score - bad_deductions) / max_score
//
//   ratio ≥ 0.85 AND no high-weight good missed → 5
//   ratio ≥ 0.70 AND no high-weight good missed → 4
//   ratio ≥ 0.50                                → 3
//   ratio ≥ 0.30                                → 2
//   ratio <  0.30                               → 1
//
//   Critical override: a critical bad signal that fires (HIT or PARTIAL)
//   caps the final score at its cap_at_score regardless of the table.
//
// Pairing handling: the rubric prompt tells the LLM "if a bad signal
// fires, set its paired good to MISS for reporting." Under THIS scoring
// formula the pairing rule is mathematically a no-op — a good MISS
// contributes 0 to good_score (no double deduction), and the bad's
// weight is subtracted once. The pairing instruction exists so the LLM
// produces consistent reporting; the math does not require special
// casing.

export interface ScoreComputationResult {
  score: number;
  ratio: number;
  goodScore: number;
  maxScore: number;
  badDeductions: number;
  highWeightGoodMissed: string[];
  appliedCap: number | null;
}

export function computeScore(
  rubric: Rubric,
  signalResults: Record<string, SignalResult>,
): ScoreComputationResult {
  const w = rubric.weightValues;
  let goodScore = 0;
  let maxScore = 0;
  let badDeductions = 0;
  const highWeightGoodMissed: string[] = [];

  for (const sig of rubric.signals) {
    const r = signalResults[sig.id];
    const kind = r?.result ?? 'cannot_evaluate';
    const weight = w[sig.weight];

    if (sig.polarity === 'good') {
      if (kind === 'cannot_evaluate') continue;
      maxScore += weight;
      if (kind === 'hit') goodScore += weight;
      else if (kind === 'partial') goodScore += weight * 0.5;
      // miss → contributes 0; track high-weight misses for the threshold rule
      else if (kind === 'miss' && sig.weight === 'high') {
        highWeightGoodMissed.push(sig.id);
      }
    } else {
      // bad polarity
      if (kind === 'hit') badDeductions += weight;
      else if (kind === 'partial') badDeductions += weight * 0.5;
    }
  }

  // Edge case: every good signal was skipped. Score is undefined; default
  // to scaleMin so the UI shows something sensible.
  if (maxScore === 0) {
    return {
      score: rubric.scoring.scaleMin,
      ratio: 0,
      goodScore,
      maxScore,
      badDeductions,
      highWeightGoodMissed,
      appliedCap: null,
    };
  }

  const ratio = Math.max(0, goodScore - badDeductions) / maxScore;
  let score = thresholdScore(ratio, highWeightGoodMissed.length === 0);

  // Critical bad signal override: any critical bad that fired caps the
  // score at its cap_at_score. Multiple critical caps → take the lowest.
  let appliedCap: number | null = null;
  for (const sig of rubric.signals) {
    if (sig.polarity !== 'bad' || !sig.critical) continue;
    if (sig.capAtScore === undefined) continue;
    const r = signalResults[sig.id];
    if (!r) continue;
    if (r.result === 'hit' || r.result === 'partial') {
      if (appliedCap === null || sig.capAtScore < appliedCap) {
        appliedCap = sig.capAtScore;
      }
    }
  }
  if (appliedCap !== null && score > appliedCap) {
    score = appliedCap;
  }

  return {
    score,
    ratio,
    goodScore,
    maxScore,
    badDeductions,
    highWeightGoodMissed,
    appliedCap,
  };
}

function thresholdScore(ratio: number, noHighWeightMiss: boolean): number {
  if (ratio >= 0.85 && noHighWeightMiss) return 5;
  if (ratio >= 0.7 && noHighWeightMiss) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.3) return 2;
  return 1;
}

// Useful for spec-bound assertions and for the agent's drift logging.
export function _signalsByPolarity(signals: RubricSignal[]): {
  good: RubricSignal[];
  bad: RubricSignal[];
} {
  return {
    good: signals.filter((s) => s.polarity === 'good'),
    bad: signals.filter((s) => s.polarity === 'bad'),
  };
}
