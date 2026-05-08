import { Session } from './session';
import { PhaseEvaluation } from './evaluation';

export type QuestionKind = 'traditional_design' | 'agentic_design' | 'agentic_build';
export const QUESTION_KINDS: readonly QuestionKind[] = [
  'traditional_design',
  'agentic_design',
  'agentic_build',
];
export const QUESTION_KIND_LABELS: Record<QuestionKind, string> = {
  traditional_design: 'Traditional design',
  agentic_design: 'Agentic design',
  agentic_build: 'Agentic build',
};
export type Seniority = 'junior' | 'mid' | 'senior' | 'staff';
export const SENIORITIES: readonly Seniority[] = ['junior', 'mid', 'senior', 'staff'];

export interface Question {
  id: string;
  prompt: string;
  rubricVersion: string;
  kind: QuestionKind;
  createdAt: string;
}

export interface QuestionWithSessions extends Question {
  sessions: Array<Session & { phaseEvaluations: PhaseEvaluation[] }>;
}
