import { api } from './api';
import { EvaluationAudit, PhaseEvaluation } from '@/types/evaluation';

export const evaluationsService = {
  runForSession(sessionId: string, model?: string) {
    return api
      .post<PhaseEvaluation[]>(`/sessions/${encodeURIComponent(sessionId)}/evaluate`, model ? { model } : {})
      .then((r) => r.data);
  },
  listForSession(sessionId: string) {
    return api
      .get<PhaseEvaluation[]>(`/sessions/${encodeURIComponent(sessionId)}/evaluations`)
      .then((r) => r.data);
  },
  get(id: string) {
    return api.get<PhaseEvaluation>(`/evaluations/${encodeURIComponent(id)}`).then((r) => r.data);
  },
  getAudit(id: string) {
    return api.get<EvaluationAudit>(`/evaluations/${encodeURIComponent(id)}/audit`).then((r) => r.data);
  },
};
