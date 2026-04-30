import { api } from './api';
import { Session, SessionSummary } from '@/types/session';
import { PhaseEvaluation } from '@/types/evaluation';

export interface EndSessionResult {
  session: Session;
  evaluations: PhaseEvaluation[];
  evalError: string | null;
}

export const sessionsService = {
  start(data: { prompt: string }) {
    return api.post<Session>('/sessions', data).then((r) => r.data);
  },
  end(id: string, status: 'completed' | 'abandoned' = 'completed') {
    return api
      .post<EndSessionResult>(`/sessions/${id}/end`, { status })
      .then((r) => r.data);
  },
  get(id: string) {
    return api.get<Session>(`/sessions/${id}`).then((r) => r.data);
  },
  list() {
    return api.get<SessionSummary[]>('/sessions').then((r) => r.data);
  },
};
