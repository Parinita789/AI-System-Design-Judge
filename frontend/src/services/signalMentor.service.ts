import { api } from './api';
import { SignalMentorArtifactRow } from '@/types/signalMentor';

export const signalMentorService = {
  get(evaluationId: string) {
    return api
      .get<SignalMentorArtifactRow>(`/signal-mentor/${evaluationId}`)
      .then((r) => r.data);
  },
  generate(evaluationId: string, model?: string, signal?: AbortSignal) {
    return api
      .post<SignalMentorArtifactRow>(
        `/signal-mentor/${evaluationId}`,
        model ? { model } : {},
        signal ? { signal } : undefined,
      )
      .then((r) => r.data);
  },
};
