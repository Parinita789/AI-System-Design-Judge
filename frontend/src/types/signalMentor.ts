export interface SignalMentorArtifact {
  annotations: Record<string, string>;
}

export interface SignalMentorAudit {
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number | null;
}

export interface SignalMentorArtifactRow {
  id: string;
  phaseEvaluationId: string;
  artifact: SignalMentorArtifact;
  audit: SignalMentorAudit;
  createdAt: string;
  updatedAt: string;
}
