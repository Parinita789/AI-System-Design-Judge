import { api } from './api';
import { Question, QuestionWithSessions } from '@/types/question';
import { Session } from '@/types/session';

export const questionsService = {
  // Create a new Question + its first Session in one call.
  create(data: { prompt: string }) {
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
  startAttempt(id: string) {
    return api.post<Session>(`/questions/${id}/attempts`).then((r) => r.data);
  },
};
