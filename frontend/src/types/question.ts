import { Session } from './session';
import { PhaseEvaluation } from './evaluation';

export type Mode = 'build' | 'design';
export type Seniority = 'junior' | 'mid' | 'senior' | 'staff';
export const SENIORITIES: readonly Seniority[] = ['junior', 'mid', 'senior', 'staff'];

export interface Question {
  id: string;
  prompt: string;
  rubricVersion: string;
  mode?: Mode | null;
  createdAt: string;
}

export interface QuestionWithSessions extends Question {
  sessions: Array<Session & { phaseEvaluations: PhaseEvaluation[] }>;
}
