export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface SessionSummary {
  id: string;
  prompt: string;
  startedAt: Date;
  endedAt: Date | null;
  status: SessionStatus;
  overallScore: number | null;
}
