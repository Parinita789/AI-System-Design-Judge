import { Session } from './session';
import { PhaseEvaluation } from './evaluation';

export interface Question {
  id: string;
  prompt: string;
  rubricVersion: string;
  createdAt: string;
}

// Returned by GET /api/questions and GET /api/questions/:id — sessions[]
// includes their phase evaluations so the UI can compute attempt count + scores.
export interface QuestionWithSessions extends Question {
  sessions: Array<Session & { phaseEvaluations: PhaseEvaluation[] }>;
}
