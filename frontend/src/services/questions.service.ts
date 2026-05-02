import { api } from './api';
import { Mode, Question, QuestionWithSessions, Seniority } from '@/types/question';
import { Session } from '@/types/session';

export const questionsService = {
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
  startAttempt(id: string, seniority?: Seniority) {
    const body = seniority ? { seniority } : {};
    return api
      .post<Session>(`/questions/${id}/attempts`, body)
      .then((r) => r.data);
  },
};
