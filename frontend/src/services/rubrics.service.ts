import { api } from './api';
import { Rubric } from '@/types/rubric';

export const rubricsService = {
  get(version: string, phase: string) {
    return api.get<Rubric>(`/rubrics/${version}/${phase}`).then((r) => r.data);
  },
};
