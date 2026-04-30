import { Question } from './question';

export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface Session {
  id: string;
  questionId: string;
  projectPath: string | null;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  overallScore: number | null;
  overallFeedback: string | null;
}

// GET /api/sessions/:id always includes the parent question.
export interface SessionWithQuestion extends Session {
  question: Question;
}

export interface SessionSummary {
  id: string;
  questionId: string;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  overallScore: number | null;
}
