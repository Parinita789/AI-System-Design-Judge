import { Phase } from './evaluation';

export interface TrendPoint {
  sessionId: string;
  endedAt: string;
  overallScore: number;
}

export interface HeatmapCell {
  signalId: string;
  phase: Phase;
  hitRate: number;
  totalEvaluations: number;
}

export interface WeaknessSummary {
  signalId: string;
  phase: Phase;
  missCount: number;
  exampleEvidence: string[];
}
