import { api } from './api';

export interface AIInteraction {
  id: string;
  sessionId: string;
  occurredAt: string;
  elapsedMinutes: number;
  inferredPhase: string | null;
  prompt: string;
  response: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
}

export const hintsService = {
  send(sessionId: string, message: string) {
    return api
      .post<AIInteraction>(`/sessions/${sessionId}/hints`, { message })
      .then((r) => r.data);
  },
  list(sessionId: string) {
    return api.get<AIInteraction[]>(`/sessions/${sessionId}/hints`).then((r) => r.data);
  },
};
