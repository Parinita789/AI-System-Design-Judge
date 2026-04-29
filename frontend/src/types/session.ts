export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface Session {
  id: string;
  prompt: string;
  rubricVersion: string;
  projectPath: string;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  overallScore: number | null;
  overallFeedback: string | null;
}

export interface SessionSummary {
  id: string;
  prompt: string;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  overallScore: number | null;
}
