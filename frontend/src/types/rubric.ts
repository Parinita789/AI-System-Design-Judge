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

export interface RubricScoring {
  scaleMin: number;
  scaleMax: number;
  defaultScore: number | null;
  computation: string;
  anchors: Record<number, string>;
  calibrationNote?: string;
}

export interface Rubric {
  schemaVersion: number;
  rubricVersion: string;
  phase: string;
  phaseName: string;
  goal: string;
  signals: RubricSignal[];
  scoring: RubricScoring;
  passBar: RubricPassBar;
  weightValues: Record<WeightTier, number>;
}
