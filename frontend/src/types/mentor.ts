// Mentor artifact: a Markdown document. The backend doesn't validate
// its structure; the prompt asks for six `##` sections but the LLM has
// freedom over wording. The frontend renders content as Markdown.

export interface MentorArtifact {
  content: string;
}

export interface MentorAudit {
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number | null;
}

export interface MentorArtifactRow {
  id: string;
  phaseEvaluationId: string;
  artifact: MentorArtifact;
  audit: MentorAudit;
  createdAt: string;
  updatedAt: string;
}
