export interface JsonlEntry {
  timestamp: string;
  type: string;
  prompt?: string;
  response?: string;
  toolCalls?: unknown[];
  modelUsed?: string;
  tokensIn?: number;
  tokensOut?: number;
  raw: unknown;
}

export interface FinalArtifacts {
  planMd: string | null;
  codeFiles: Record<string, string>;
  gitLog: string | null;
  aiPromptsLog: string | null;
  reflection: string | null;
}
