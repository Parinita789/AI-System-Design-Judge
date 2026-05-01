import { api } from './api';
import { EvaluationAudit, PhaseEvaluation } from '@/types/evaluation';

export const evaluationsService = {
  // `model` is an optional override (e.g., 'claude-haiku-4-5'). Absent
  // means the backend uses its env default (LLM_MODEL).
  runForSession(sessionId: string, model?: string) {
    return api
      .post<PhaseEvaluation[]>(`/sessions/${sessionId}/evaluate`, model ? { model } : {})
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
