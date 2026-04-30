import { api } from './api';

export interface SnapshotArtifacts {
  planMd: string | null;
  codeFiles: Record<string, string>;
  gitLog: string | null;
  newJsonlEntries: unknown[];
}

export interface Snapshot {
  id: string;
  sessionId: string;
  takenAt: string;
  elapsedMinutes: number;
  inferredPhase: string | null;
  artifacts: SnapshotArtifacts;
}

export const snapshotsService = {
  capture(sessionId: string, elapsedMinutes: number, artifacts?: { planMd?: string }) {
    return api
      .post<Snapshot>(`/sessions/${sessionId}/snapshots`, { elapsedMinutes, artifacts })
      .then((r) => r.data);
  },
  latest(sessionId: string) {
    return api
      .get<Snapshot | null>(`/sessions/${sessionId}/snapshots/latest`)
      .then((r) => r.data);
  },
  list(sessionId: string) {
    return api.get<Snapshot[]>(`/sessions/${sessionId}/snapshots`).then((r) => r.data);
  },
};
