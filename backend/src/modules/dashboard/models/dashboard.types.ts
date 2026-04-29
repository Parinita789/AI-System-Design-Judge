import { Phase } from '../../phase-tagger/models/phase.types';

export interface TrendPoint {
  sessionId: string;
  endedAt: Date;
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
