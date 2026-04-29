import { api } from './api';

export const snapshotsService = {
  capture(sessionId: string, elapsedMinutes: number) {
    return api
      .post(`/sessions/${sessionId}/snapshots`, { elapsedMinutes })
      .then((r) => r.data);
  },
};
