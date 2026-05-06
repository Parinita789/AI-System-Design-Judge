import { api } from './api';
import { MentorArtifactRow } from '@/types/mentor';

export const mentorService = {
  // Fetch existing artifact; throws 404 (axios reject) if not yet generated.
  get(evaluationId: string) {
    return api
      .get<MentorArtifactRow>(`/mentor/${evaluationId}`)
      .then((r) => r.data);
  },
  // Generate or regenerate. Server upserts by phaseEvaluationId so a
  // second call overwrites the existing row.
  generate(evaluationId: string, model?: string, signal?: AbortSignal) {
    return api
      .post<MentorArtifactRow>(
        `/mentor/${evaluationId}`,
        model ? { model } : {},
        signal ? { signal } : undefined,
      )
      .then((r) => r.data);
  },
};
