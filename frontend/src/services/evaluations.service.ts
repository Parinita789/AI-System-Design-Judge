import { api } from './api';
import { EvaluationResult, EvaluationStatus } from '@/types/evaluation';

export const evaluationsService = {
  status(id: string) {
    return api.get<EvaluationStatus>(`/evaluations/${id}/status`).then((r) => r.data);
  },
  get(id: string) {
    return api.get<EvaluationResult>(`/evaluations/${id}`).then((r) => r.data);
  },
};
