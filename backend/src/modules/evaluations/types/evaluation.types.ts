import { Phase } from '../../phase-tagger/types/phase.types';
import { Mode, Seniority } from './rubric.types';

export interface PhaseEvalInput {
  session: {
    id: string;
    prompt: string;
    startedAt: Date;
    endedAt: Date | null;
  };
  planMd: string | null;
  snapshots: Array<{
    takenAt: Date;
    elapsedMinutes: number;
    planMdSize: number;
  }>;
  hints: Array<{
    occurredAt: Date;
    elapsedMinutes: number;
    prompt: string;
    response: string;
  }>;
  rubricVersion: string;
  mode?: Mode | null;
  seniority?: Seniority | null;
  model?: string;
}

export interface SignalResult {
  result: 'hit' | 'miss' | 'partial' | 'cannot_evaluate';
  evidence: string;
  reasoning?: string;
}

export interface PhaseEvaluationResult {
  phase: Phase;
  score: number;
  signalResults: Record<string, SignalResult>;
  feedbackText: string;
  topActionableItems: string[];
  audit: EvaluationAuditPayload;
}

export interface EvaluationAuditPayload {
  prompt: string;
  rawResponse: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs?: number;
}

export interface SynthesisResult {
  overallScore: number;
  overallFeedback: string;
  recurringWeaknesses: string[];
}
