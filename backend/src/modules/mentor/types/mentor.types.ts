import { BuildContext } from '../../evaluations/types/evaluation.types';
import { Phase } from '../../phase-tagger/types/phase.types';

// Mentor artifact: a Markdown document (the LLM's free-form mentor-voice
// reflection on a single PhaseEvaluation). The prompt asks for six
// sections with `##` headers but we don't validate structure — the
// artifact is prose. Frontend renders the Markdown.

export interface MentorArtifact {
  content: string;
}

// What the agent receives.
export interface MentorInput {
  question: string;
  planMd: string | null;
  signalResults: Record<
    string,
    { result: string; evidence: string; reasoning?: string }
  >;
  feedbackText: string;
  topActionableItems: string[];
  score: number;
  // 'junior' | 'mid' | 'senior' | 'staff'; null on legacy v1.0 sessions.
  // Interpolated into the persona block so the mentor calibrates voice.
  seniority: string | null;
  // 'plan' or 'build'. Selects the persona variant in the prompt
  // (plan-flavor sections vs build-flavor sections).
  phase: Phase;
  // Build-phase only: the same buildContext the BuildAgent saw.
  // Lets the mentor anchor concrete versions to actual file paths
  // and AI turns rather than to plan.md text.
  buildContext?: BuildContext;
  // Cross-phase context. When phase='plan' and the candidate has
  // already finished building, crossPhase carries the build score
  // and a summary so the plan-phase mentor can connect plan strengths
  // to how the build went. And vice versa.
  crossPhase?: CrossPhaseSummary;
  // Optional per-call model override; otherwise follows env LLM_MODEL.
  model?: string;
  // Used by MentorService for disk persistence — the agent doesn't
  // touch them, just gets passed through for the prompt audit trail.
  sessionId: string;
  evaluationId: string;
}

// Lightweight shape carried across phases. Not the full eval row;
// just enough for the mentor to reference the other phase by name.
export interface CrossPhaseSummary {
  phase: Phase;
  score: number;
  feedbackText: string;
  topSignalsFired: Array<{
    id: string;
    polarity: 'good' | 'bad';
    result: string;
    evidence: string;
  }>;
}

// What the agent returns.
export interface MentorResult {
  artifact: MentorArtifact;
  // The full rendered prompt (system blocks + user message) the LLM
  // saw. Persisted to disk by the service for offline review.
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
