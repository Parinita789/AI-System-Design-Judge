export type Phase = 'plan' | 'build' | 'validate' | 'wrap';

export interface SignalResult {
  result: 'hit' | 'miss' | 'partial' | 'cannot_evaluate';
  evidence: string;
}

export interface PhaseEvaluation {
  phase: Phase;
  score: number;
  signalResults: Record<string, SignalResult>;
  feedbackText: string;
  topActionableItems: string[];
}

export type EvaluationStatus =
  | { state: 'pending' }
  | { state: 'running'; completedPhases: Phase[] }
  | { state: 'complete' }
  | { state: 'failed'; error: string };

export interface EvaluationResult {
  id: string;
  sessionId: string;
  phaseEvaluations: PhaseEvaluation[];
  overallScore: number;
  overallFeedback: string;
}
