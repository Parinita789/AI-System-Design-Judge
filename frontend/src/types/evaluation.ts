export type Phase = 'plan' | 'build' | 'validate' | 'wrap';

export interface SignalResult {
  result: 'hit' | 'miss' | 'partial' | 'cannot_evaluate';
  evidence: string;
}

// Matches the Prisma `PhaseEvaluation` row returned by the backend.
export interface PhaseEvaluation {
  id: string;
  sessionId: string;
  phase: Phase;
  score: number;
  signalResults: Record<string, SignalResult>;
  feedbackText: string;
  topActionableItems: string[];
  evaluatedAt: string;
}
