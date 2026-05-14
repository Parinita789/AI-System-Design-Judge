import { api } from './api';
import { Rubric } from '@/types/rubric';
import { QuestionKind, Seniority } from '@/types/question';

export const rubricsService = {
  get(version: string, phase: string, kind?: QuestionKind | null, seniority?: Seniority | null) {
    const params: Record<string, string> = {};
    if (kind) params.kind = kind;
    if (seniority) params.seniority = seniority;
    return api
      .get<Rubric>(`/rubrics/${encodeURIComponent(version)}/${encodeURIComponent(phase)}`, { params })
      .then((r) => r.data);
  },
};
