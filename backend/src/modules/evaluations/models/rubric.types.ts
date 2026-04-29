import { Phase } from '../../phase-tagger/models/phase.types';

export type SignalPolarity = 'good' | 'bad';
export type WeightTier = 'high' | 'medium' | 'low';

export interface RubricSignal {
  id: string;
  polarity: SignalPolarity;
  weight: WeightTier;
  description: string;
  judgeNotes: string;
  evidenceHint?: string;
  critical?: boolean;
  capAtScore?: number;
}

export interface RubricRequiredSection {
  id: string;
  name: string;
  mustContain: string[];
}

export interface RubricPassBar {
  description: string;
  requiredArtifact: string;
  temporalCheck: string;
  requiredSections: RubricRequiredSection[];
}

export interface RubricTimeBounds {
  targetMinMinutes: number;
  targetMaxMinutes: number;
  flagUnderMinutes: number;
  flagOverMinutes: number;
  note?: string;
}

export interface RubricScoring {
  scaleMin: number;
  scaleMax: number;
  defaultScore: number | null;
  computation: string;
  anchors: Record<number, string>;
  calibrationNote?: string;
}

export interface RubricAiUsage {
  description: string;
  goodModes: string[];
  badModes: string[];
  additionalNote?: string;
}

export interface Rubric {
  schemaVersion: number;
  rubricVersion: string;
  phase: Phase;
  phaseName: string;
  goal: string;
  timeBounds: RubricTimeBounds;
  weightValues: Record<WeightTier, number>;
  passBar: RubricPassBar;
  signals: RubricSignal[];
  aiUsageForThisPhase?: RubricAiUsage;
  artifactsToInspect: string[];
  judgeCalibration: string[];
  scoring: RubricScoring;
  outputSchema: Record<string, unknown>;
}
