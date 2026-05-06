import { SignalResult } from '../../evaluations/types/evaluation.types';
import { RubricSignal } from '../../evaluations/types/rubric.types';

export interface SignalMentorArtifact {
  annotations: Record<string, string>;
}

export interface GapSignalContext {
  signal: RubricSignal;
  result: SignalResult;
}

export interface SignalMentorInput {
  question: string;
  planMd: string | null;
  gaps: GapSignalContext[];
  feedbackText: string;
  score: number;
  seniority: string | null;
  model?: string;
  sessionId: string;
  evaluationId: string;
}

export interface SignalMentorResult {
  artifact: SignalMentorArtifact;
  renderedPrompt: string;
  audit: {
    modelUsed: string;
    tokensIn: number;
    tokensOut: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    latencyMs: number;
  };
}
