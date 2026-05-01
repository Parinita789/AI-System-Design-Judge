import { Phase } from '../../phase-tagger/models/phase.types';

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
  // Optional pairing metadata. When set, the LLM is instructed not to
  // double-count: if the bad signal fires, the paired good signal is
  // automatically MISS for reporting and not separately deducted (and
  // vice versa).
  pairedWith?: string;
  // Artifacts that must be present for this signal to fire. If absent,
  // the signal must return cannot_evaluate. Used by `ai_authored_plan`
  // which needs hint history + snapshot timeline to judge responsibly.
  requiresEvidence?: string[];
  // Per-seniority weight overrides. When set, the loader resolves
  // `weight` from this map using the requested seniority and DROPS this
  // field from the returned signal. Downstream code only ever sees a
  // single `weight`. All four levels are required when this is provided.
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
  // Set on v2.0+ rubrics; null/undefined for the legacy v1.0 single-file
  // rubric. The orchestrator passes it through from Question.mode.
  mode?: Mode;
  // Set when a Session.seniority drives the per-signal weight resolution.
  // Rubric YAML files do NOT carry this — it comes from the session and
  // is stamped on the Rubric object after the loader resolves weights.
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
