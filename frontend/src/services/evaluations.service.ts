import { api } from './api';
import { EvaluationAudit, PhaseEvaluation } from '@/types/evaluation';

export const evaluationsService = {
  runForSession(sessionId: string) {
    return api
      .post<PhaseEvaluation[]>(`/sessions/${sessionId}/evaluate`)
      .then((r) => r.data);
  },
  listForSession(sessionId: string) {
    return api
      .get<PhaseEvaluation[]>(`/sessions/${sessionId}/evaluations`)
      .then((r) => r.data);
  },
  get(id: string) {
    return api.get<PhaseEvaluation>(`/evaluations/${id}`).then((r) => r.data);
  },
  getAudit(id: string) {
    return api.get<EvaluationAudit>(`/evaluations/${id}/audit`).then((r) => r.data);
  },
};
