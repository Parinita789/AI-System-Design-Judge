import { api } from './api';
import { Session, SessionSummary, SessionWithQuestion } from '@/types/session';
import { PhaseEvaluation } from '@/types/evaluation';

export interface EndSessionResult {
  session: Session;
  evaluations: PhaseEvaluation[];
  evalError: string | null;
}

export const sessionsService = {
  // Note: starting a new session goes through `questionsService.create` (new
  // question) or `questionsService.startAttempt(qid)` (additional attempt).
  end(id: string, status: 'completed' | 'abandoned' = 'completed') {
    return api
      .post<EndSessionResult>(`/sessions/${id}/end`, { status })
      .then((r) => r.data);
  },
  get(id: string) {
    return api.get<SessionWithQuestion>(`/sessions/${id}`).then((r) => r.data);
  },
  list() {
    return api.get<SessionSummary[]>('/sessions').then((r) => r.data);
  },
};
