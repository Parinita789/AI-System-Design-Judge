export type Phase = 'plan' | 'build' | 'validate' | 'wrap';

export interface SignalResult {
  result: 'hit' | 'miss' | 'partial' | 'cannot_evaluate';
  evidence: string;
}

export interface PhaseEvaluation {
  id: string;
  sessionId: string;
  phase: Phase;
  score: number;
  signalResults: Record<string, SignalResult>;
  feedbackText: string;
  topActionableItems: string[];
  gapTopics: GapTopic[];
  evaluatedAt: string;
  modelUsed?: string | null;
}

export interface GapTopic {
  name: string;
  coverage: 'missed' | 'lightly_touched';
  whyExpected: string;
}

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
  latencyMs?: number | null;
  createdAt: string;
}
