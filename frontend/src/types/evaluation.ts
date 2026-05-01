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

// Matches the Prisma `EvaluationAudit` row — 1:1 with a PhaseEvaluation.
// `prompt` is the full rendered system + user payload sent to the LLM;
// `rawResponse` is the LLM text before parseEvalOutput() ran.
export interface EvaluationAudit {
  id: string;
  phaseEvaluationId: string;
  prompt: string;
  rawResponse: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  createdAt: string;
}
