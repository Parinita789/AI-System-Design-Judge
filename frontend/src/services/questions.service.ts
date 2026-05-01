import { api } from './api';
import { Mode, Question, QuestionWithSessions, Seniority } from '@/types/question';
import { Session } from '@/types/session';

export const questionsService = {
  // Create a new Question + its first Session in one call. `mode` and
  // `seniority` are optional — backend infers/defaults when absent.
  create(data: { prompt: string; mode?: Mode; seniority?: Seniority }) {
    return api
      .post<{ question: Question; session: Session }>('/questions', data)
      .then((r) => r.data);
  },
  list() {
    return api.get<QuestionWithSessions[]>('/questions').then((r) => r.data);
  },
  get(id: string) {
    return api.get<QuestionWithSessions>(`/questions/${id}`).then((r) => r.data);
  },
  // Start a new attempt at this question. New session inherits the most-recent
  // plan.md across all prior sessions of this question (server-side).
  // `seniority` is optional — when absent, the new attempt inherits
  // from the most recent prior session.
  startAttempt(id: string, seniority?: Seniority) {
    const body = seniority ? { seniority } : {};
    return api
      .post<Session>(`/questions/${id}/attempts`, body)
      .then((r) => r.data);
  },
};
