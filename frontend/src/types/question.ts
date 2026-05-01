import { Session } from './session';
import { PhaseEvaluation } from './evaluation';

export type Mode = 'build' | 'design';
export type Seniority = 'junior' | 'mid' | 'senior' | 'staff';
export const SENIORITIES: readonly Seniority[] = ['junior', 'mid', 'senior', 'staff'];

export interface Question {
  id: string;
  prompt: string;
  rubricVersion: string;
  // v2.0+ rubric variant. Null/undefined on legacy v1.0 questions.
  mode?: Mode | null;
  createdAt: string;
}

// Returned by GET /api/questions and GET /api/questions/:id — sessions[]
// includes their phase evaluations so the UI can compute attempt count + scores.
export interface QuestionWithSessions extends Question {
  sessions: Array<Session & { phaseEvaluations: PhaseEvaluation[] }>;
}
