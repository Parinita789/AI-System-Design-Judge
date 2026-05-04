import { api } from './api';
import { Rubric } from '@/types/rubric';
import { Mode, Seniority } from '@/types/question';

export const rubricsService = {
  get(version: string, phase: string, mode?: Mode | null, seniority?: Seniority | null) {
    const params: Record<string, string> = {};
    if (mode) params.mode = mode;
    if (seniority) params.seniority = seniority;
    return api
      .get<Rubric>(`/rubrics/${version}/${phase}`, { params })
      .then((r) => r.data);
  },
};
