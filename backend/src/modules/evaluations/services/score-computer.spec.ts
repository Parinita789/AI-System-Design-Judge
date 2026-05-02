import { computeScore } from './score-computer';
import { Rubric, RubricSignal } from '../types/rubric.types';
import { SignalResult } from '../types/evaluation.types';

// Build a minimal rubric for deterministic, weight-controlled tests.
function makeRubric(signals: RubricSignal[]): Rubric {
  return {
    schemaVersion: 1,
    rubricVersion: 'test-1.0',
    phase: 'plan',
    phaseName: 'Plan',
    goal: 'test',
    timeBounds: {
      targetMinMinutes: 0,
      targetMaxMinutes: 0,
      flagUnderMinutes: 0,
      flagOverMinutes: 0,
    },
    weightValues: { high: 3, medium: 2, low: 1 },
    passBar: {
      description: '',
      requiredArtifact: '',
      temporalCheck: '',
      requiredSections: [],
    },
    signals,
    artifactsToInspect: [],
    judgeCalibration: [],
    scoring: {
      scaleMin: 1,
      scaleMax: 5,
      defaultScore: null,
      computation: '',
      anchors: { 1: '', 2: '', 3: '', 4: '', 5: '' },
    },
    outputSchema: {},
  };
}

const sig = (
  id: string,
  polarity: 'good' | 'bad',
  weight: 'high' | 'medium' | 'low',
  extras: Partial<RubricSignal> = {},
): RubricSignal => ({
  id,
  polarity,
  weight,
  description: '',
  judgeNotes: '',
  ...extras,
});

const result = (r: SignalResult['result'], evidence = ''): SignalResult => ({
  result: r,
  evidence,
});

describe('computeScore', () => {
  describe('threshold table', () => {
    const rubric = makeRubric([
      sig('g_high', 'good', 'high'),
      sig('g_med', 'good', 'medium'),
      sig('g_low', 'good', 'low'),
    ]);
    // weights: 3 + 2 + 1 = 6. high=3, medium=2, low=1.

    it('all hits → 5', () => {
      const out = computeScore(rubric, {
        g_high: result('hit'),
        g_med: result('hit'),
        g_low: result('hit'),
      });
      expect(out.ratio).toBe(1);
      expect(out.score).toBe(5);
    });

    it('high-weight miss caps at 3 even when ratio is high', () => {
      // Miss high weight (3 of 6) but hit the rest = 3/6 = 0.5
      // but high-weight-missed → cannot get 4 or 5.
      const out = computeScore(rubric, {
        g_high: result('miss'),
        g_med: result('hit'),
        g_low: result('hit'),
      });
      expect(out.ratio).toBe(0.5);
      expect(out.highWeightGoodMissed).toEqual(['g_high']);
      expect(out.score).toBe(3);
    });

    it('ratio just under 0.7 with no high-weight miss → 3, not 4', () => {
      // hit medium (2), partial low (0.5), miss high impossible if we want no high-miss…
      // Construct: high partial (1.5), med hit (2), low hit (1) = 4.5 / 6 = 0.75 → 4
      // To get just under 0.70: partial high (1.5) + miss med (0) + hit low (1) = 2.5/6 = 0.417 → 2
      // Use weight: 0.85 - 0.86. Make: high hit (3), med partial (1), low miss (0) = 4 / 6 = 0.667 → 3
      const out = computeScore(rubric, {
        g_high: result('hit'),
        g_med: result('partial'),
        g_low: result('miss'),
      });
      expect(out.ratio).toBeCloseTo(4 / 6);
      expect(out.score).toBe(3);
    });

    it('ratio in [0.7, 0.85) with no high-weight miss → 4', () => {
      const out = computeScore(rubric, {
        g_high: result('hit'),
        g_med: result('hit'),
        g_low: result('miss'),
      });
      expect(out.ratio).toBeCloseTo(5 / 6);
      expect(out.score).toBe(4);
    });

    it('ratio < 0.30 → 1', () => {
      const out = computeScore(rubric, {
        g_high: result('miss'),
        g_med: result('miss'),
        g_low: result('partial'),
      });
      expect(out.ratio).toBeCloseTo(0.5 / 6);
      expect(out.score).toBe(1);
    });
  });

  describe('cannot_evaluate excluded from numerator and denominator', () => {
    const rubric = makeRubric([
      sig('g_high', 'good', 'high'),
      sig('g_med', 'good', 'medium'),
      sig('g_low', 'good', 'low'),
    ]);

    it('skipped good is removed from max_score', () => {
      // Skip high (3). Remaining = med + low = 3. Hit both → 3/3 = 1 → 5.
      const out = computeScore(rubric, {
        g_high: result('cannot_evaluate'),
        g_med: result('hit'),
        g_low: result('hit'),
      });
      expect(out.maxScore).toBe(3);
      expect(out.goodScore).toBe(3);
      expect(out.score).toBe(5);
    });

    it('skipped good never counts as high-weight missed', () => {
      // Skipping high should not block 5.
      const out = computeScore(rubric, {
        g_high: result('cannot_evaluate'),
        g_med: result('hit'),
        g_low: result('hit'),
      });
      expect(out.highWeightGoodMissed).toEqual([]);
      expect(out.score).toBe(5);
    });
  });

  describe('bad signals', () => {
    const rubric = makeRubric([
      sig('g_high', 'good', 'high'),
      sig('b_med', 'bad', 'medium'),
    ]);

    it('bad HIT subtracts full weight', () => {
      // good_score = 3 (hit high), bad_deductions = 2 (med bad hit)
      // ratio = (3 - 2) / 3 = 0.333 → 2
      const out = computeScore(rubric, {
        g_high: result('hit'),
        b_med: result('hit'),
      });
      expect(out.badDeductions).toBe(2);
      expect(out.score).toBe(2);
    });

    it('bad PARTIAL subtracts half weight (mirrors good partial)', () => {
      const out = computeScore(rubric, {
        g_high: result('hit'),
        b_med: result('partial'),
      });
      expect(out.badDeductions).toBe(1);
      // (3 - 1) / 3 = 0.667 → 3
      expect(out.score).toBe(3);
    });

    it('bad MISS contributes nothing', () => {
      const out = computeScore(rubric, {
        g_high: result('hit'),
        b_med: result('miss'),
      });
      expect(out.badDeductions).toBe(0);
      expect(out.score).toBe(5);
    });

    it('over-deduction is clamped at zero', () => {
      const heavyBad = makeRubric([
        sig('g_low', 'good', 'low'),
        sig('b_high1', 'bad', 'high'),
        sig('b_high2', 'bad', 'high'),
      ]);
      const out = computeScore(heavyBad, {
        g_low: result('hit'),
        b_high1: result('hit'),
        b_high2: result('hit'),
      });
      // good_score = 1, bad_deductions = 6 → ratio = max(0, -5)/1 = 0 → 1
      expect(out.ratio).toBe(0);
      expect(out.score).toBe(1);
    });
  });

  describe('paired signals (math is invariant — pairing is for reporting)', () => {
    const rubric = makeRubric([
      sig('g_seams', 'good', 'high', { pairedWith: 'b_no_seams' }),
      sig('b_no_seams', 'bad', 'medium', { pairedWith: 'g_seams' }),
    ]);

    it('good MISS + bad HIT yields one deduction (the bad weight), not two', () => {
      const out = computeScore(rubric, {
        g_seams: result('miss'),
        b_no_seams: result('hit'),
      });
      // good_score = 0, bad_deductions = 2, max = 3 → ratio = max(0, -2)/3 = 0 → 1
      expect(out.goodScore).toBe(0);
      expect(out.badDeductions).toBe(2);
      expect(out.score).toBe(1);
    });

    it('good HIT + bad MISS scores like the good signal alone', () => {
      const out = computeScore(rubric, {
        g_seams: result('hit'),
        b_no_seams: result('miss'),
      });
      expect(out.goodScore).toBe(3);
      expect(out.badDeductions).toBe(0);
      expect(out.score).toBe(5);
    });
  });

  describe('critical override', () => {
    const rubric = makeRubric([
      sig('g_high', 'good', 'high'),
      sig('g_med', 'good', 'medium'),
      sig('b_critical', 'bad', 'high', { critical: true, capAtScore: 2 }),
    ]);

    it('caps the score at cap_at_score regardless of ratio', () => {
      // hit both goods + critical fires → ratio would be (5-3)/5 = 0.4 → 2
      // cap_at_score is also 2, so effective cap is no-op here.
      // Adjust for clarity: skip g_med, only hit g_high
      const all = makeRubric([
        sig('g_high', 'good', 'high'),
        sig('b_critical', 'bad', 'high', { critical: true, capAtScore: 1 }),
      ]);
      const out = computeScore(all, {
        g_high: result('hit'),
        b_critical: result('hit'),
      });
      expect(out.appliedCap).toBe(1);
      expect(out.score).toBe(1);
    });

    it('ignores critical when the bad signal does not fire', () => {
      const out = computeScore(rubric, {
        g_high: result('hit'),
        g_med: result('hit'),
        b_critical: result('miss'),
      });
      expect(out.appliedCap).toBeNull();
      expect(out.score).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('all good signals skipped → returns scale_min (1) without dividing by zero', () => {
      const rubric = makeRubric([sig('g_high', 'good', 'high')]);
      const out = computeScore(rubric, {
        g_high: result('cannot_evaluate'),
      });
      expect(out.maxScore).toBe(0);
      expect(out.score).toBe(1);
    });

    it('signal absent from results is treated as cannot_evaluate, not miss', () => {
      const rubric = makeRubric([sig('g_high', 'good', 'high'), sig('g_med', 'good', 'medium')]);
      const out = computeScore(rubric, {
        g_high: result('hit'),
        // g_med absent
      });
      // Treated as skipped → max_score = 3, good_score = 3 → ratio 1 → 5
      expect(out.maxScore).toBe(3);
      expect(out.score).toBe(5);
    });
  });
});
