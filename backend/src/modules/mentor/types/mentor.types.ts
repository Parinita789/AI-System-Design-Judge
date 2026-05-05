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
  // Optional per-call model override; otherwise follows env LLM_MODEL.
  model?: string;
  // Used by MentorService for disk persistence — the agent doesn't
  // touch them, just gets passed through for the prompt audit trail.
  sessionId: string;
  evaluationId: string;
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
