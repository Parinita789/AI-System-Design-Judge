import { Phase } from '../../phase-tagger/types/phase.types';

export type SignalPolarity = 'good' | 'bad';
export type WeightTier = 'high' | 'medium' | 'low';
export type Mode = 'build' | 'design';
export type Seniority = 'junior' | 'mid' | 'senior' | 'staff';
export const SENIORITIES: readonly Seniority[] = ['junior', 'mid', 'senior', 'staff'];

export interface RubricSignal {
  id: string;
  polarity: SignalPolarity;
  weight: WeightTier;
  description: string;
  judgeNotes: string;
  evidenceHint?: string;
  critical?: boolean;
  capAtScore?: number;
  pairedWith?: string;
  requiresEvidence?: string[];
  // Resolved by RubricLoaderService.applySeniority — downstream code
  // only sees the resolved `weight`, never this map.
  weightBySeniority?: Record<Seniority, WeightTier>;
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
  mode?: Mode;
  seniority?: Seniority;
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
