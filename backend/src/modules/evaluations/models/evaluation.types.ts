import { Phase } from '../../phase-tagger/models/phase.types';

export interface SignalResult {
  result: 'hit' | 'miss' | 'partial' | 'cannot_evaluate';
  evidence: string;
}

export interface PhaseEvaluationResult {
  phase: Phase;
  score: number;
  signalResults: Record<string, SignalResult>;
  feedbackText: string;
  topActionableItems: string[];
  audit: EvaluationAuditPayload;
}

// Captured per LLM call. Persisted in evaluation_audits 1:1 with the
// resulting PhaseEvaluation row. The orchestrator joins these together
// after the evaluation row has an id.
export interface EvaluationAuditPayload {
  prompt: string;
  rawResponse: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface SynthesisResult {
  overallScore: number;
  overallFeedback: string;
  recurringWeaknesses: string[];
}
