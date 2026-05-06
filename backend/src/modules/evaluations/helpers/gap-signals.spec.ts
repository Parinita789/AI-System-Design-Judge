import { gapSignalIds } from './gap-signals';
import { Rubric, RubricSignal } from '../types/rubric.types';
import { SignalResult } from '../types/evaluation.types';

function sig(id: string, polarity: 'good' | 'bad'): RubricSignal {
  return {
    id,
    polarity,
    weight: 'medium',
    description: '',
    judgeNotes: '',
  };
}

function rubricWith(signals: RubricSignal[]): Rubric {
  return { signals } as Rubric;
}

describe('gapSignalIds', () => {
  it('flags good signals with miss or partial as gaps', () => {
    const rubric = rubricWith([
      sig('g_hit', 'good'),
      sig('g_miss', 'good'),
      sig('g_partial', 'good'),
    ]);
    const results: Record<string, SignalResult> = {
      g_hit: { result: 'hit', evidence: '' },
      g_miss: { result: 'miss', evidence: '' },
      g_partial: { result: 'partial', evidence: '' },
    };
    expect(gapSignalIds(rubric, results)).toEqual(['g_miss', 'g_partial']);
  });

  it('flags bad signals with hit or partial as gaps (they fired)', () => {
    const rubric = rubricWith([
      sig('b_miss', 'bad'),
      sig('b_hit', 'bad'),
      sig('b_partial', 'bad'),
    ]);
    const results: Record<string, SignalResult> = {
      b_miss: { result: 'miss', evidence: '' },
      b_hit: { result: 'hit', evidence: '' },
      b_partial: { result: 'partial', evidence: '' },
    };
    expect(gapSignalIds(rubric, results)).toEqual(['b_hit', 'b_partial']);
  });

  it('excludes cannot_evaluate signals on both polarities', () => {
    const rubric = rubricWith([
      sig('g_skip', 'good'),
      sig('b_skip', 'bad'),
    ]);
    const results: Record<string, SignalResult> = {
      g_skip: { result: 'cannot_evaluate', evidence: '' },
      b_skip: { result: 'cannot_evaluate', evidence: '' },
    };
    expect(gapSignalIds(rubric, results)).toEqual([]);
  });

  it('excludes signals the LLM did not return at all', () => {
    const rubric = rubricWith([sig('g_missing', 'good'), sig('b_missing', 'bad')]);
    expect(gapSignalIds(rubric, {})).toEqual([]);
  });

  it('preserves rubric order across mixed polarities', () => {
    const rubric = rubricWith([
      sig('g_hit', 'good'),
      sig('b_partial', 'bad'),
      sig('g_miss', 'good'),
      sig('b_miss', 'bad'),
    ]);
    const results: Record<string, SignalResult> = {
      g_hit: { result: 'hit', evidence: '' },
      b_partial: { result: 'partial', evidence: '' },
      g_miss: { result: 'miss', evidence: '' },
      b_miss: { result: 'miss', evidence: '' },
    };
    expect(gapSignalIds(rubric, results)).toEqual(['b_partial', 'g_miss']);
  });
});
