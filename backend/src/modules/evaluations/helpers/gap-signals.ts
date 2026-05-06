import { Rubric } from '../types/rubric.types';
import { SignalResult } from '../types/evaluation.types';

export function gapSignalIds(
  rubric: Rubric,
  signalResults: Record<string, SignalResult>,
): string[] {
  const ids: string[] = [];
  for (const s of rubric.signals) {
    const r = signalResults[s.id];
    if (!r) continue;
    if (s.polarity === 'good' && (r.result === 'miss' || r.result === 'partial')) {
      ids.push(s.id);
    } else if (s.polarity === 'bad' && (r.result === 'hit' || r.result === 'partial')) {
      ids.push(s.id);
    }
  }
  return ids;
}
