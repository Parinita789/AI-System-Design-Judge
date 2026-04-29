import { useEffect } from 'react';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function useSnapshotTimer(_sessionId: string | null, _onTick: () => void) {
  useEffect(() => {
    // Client-side timer driving 5-min snapshot captures (decisions.md §4).
    // Wire up setInterval here once the snapshot service is ready.
    return () => {
      // cleanup
    };
  }, [_sessionId, _onTick]);

  return { intervalMs: FIVE_MINUTES_MS };
}
