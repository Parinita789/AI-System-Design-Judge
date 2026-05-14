import { api } from './api';
import { BuildEventsSummary, MintedBuildToken } from '@/types/buildEvent';

export const buildSessionsService = {
  startBuild(sessionId: string): Promise<MintedBuildToken> {
    return api
      .post<MintedBuildToken>(`/sessions/${encodeURIComponent(sessionId)}/start-build`)
      .then((r) => r.data);
  },
  eventsSummary(sessionId: string): Promise<BuildEventsSummary> {
    return api
      .get<BuildEventsSummary>(`/sessions/${encodeURIComponent(sessionId)}/build-events`)
      .then((r) => r.data);
  },
};
