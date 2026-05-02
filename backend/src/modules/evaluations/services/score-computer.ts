import { Rubric, RubricSignal } from '../types/rubric.types';
import { SignalResult } from '../types/evaluation.types';

// Replaces the LLM-emitted `score` field, which empirically drifts from
// the model's own signal judgments — it pattern-matches against the
// anchor scenarios instead of computing the threshold-table ratio.
// Algorithm is mirrored in prose at rubrics/v*/plan*.yaml > scoring.computation.

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
      else if (kind === 'miss' && sig.weight === 'high') {
        highWeightGoodMissed.push(sig.id);
      }
    } else {
      if (kind === 'hit') badDeductions += weight;
      else if (kind === 'partial') badDeductions += weight * 0.5;
    }
  }

  // All good signals skipped — score is undefined, return scaleMin.
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

  // Critical bad-signal override caps the score regardless of ratio.
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

export function _signalsByPolarity(signals: RubricSignal[]): {
  good: RubricSignal[];
  bad: RubricSignal[];
} {
  return {
    good: signals.filter((s) => s.polarity === 'good'),
    bad: signals.filter((s) => s.polarity === 'bad'),
  };
}
