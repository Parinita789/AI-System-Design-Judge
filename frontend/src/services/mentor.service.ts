import { api } from './api';
import { MentorArtifactRow } from '@/types/mentor';

export const mentorService = {
  get(evaluationId: string) {
    return api
      .get<MentorArtifactRow>(`/mentor/${encodeURIComponent(evaluationId)}`)
      .then((r) => r.data);
  },
  generate(evaluationId: string, model?: string, signal?: AbortSignal) {
    return api
      .post<MentorArtifactRow>(
        `/mentor/${encodeURIComponent(evaluationId)}`,
        model ? { model } : {},
        signal ? { signal } : undefined,
      )
      .then((r) => r.data);
  },
};
