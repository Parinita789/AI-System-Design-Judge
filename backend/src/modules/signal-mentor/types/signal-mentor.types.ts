import { BuildContext, SignalResult } from '../../evaluations/types/evaluation.types';
import { RubricSignal } from '../../evaluations/types/rubric.types';
import { Phase } from '../../phase-tagger/types/phase.types';

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
  // 'plan' or 'build'. The prompt's "concrete-version" instructions
  // anchor differently per phase: plan-side cites plan.md prose,
  // build-side cites file paths and snippets from buildContext.
  phase: Phase;
  // Build-phase only: same buildContext the BuildAgent had.
  buildContext?: BuildContext;
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
