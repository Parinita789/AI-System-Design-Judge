import { api } from './api';
import { Session, SessionSummary } from '@/types/session';

export const sessionsService = {
  start(data: { prompt: string; projectPath: string }) {
    return api.post<Session>('/sessions', data).then((r) => r.data);
  },
  end(id: string) {
    return api.post<{ evaluationId: string }>(`/sessions/${id}/end`).then((r) => r.data);
  },
  get(id: string) {
    return api.get<Session>(`/sessions/${id}`).then((r) => r.data);
  },
  list() {
    return api.get<SessionSummary[]>('/sessions').then((r) => r.data);
  },
};
