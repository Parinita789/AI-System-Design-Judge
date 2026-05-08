import { useEffect } from 'react';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function useSnapshotTimer(_sessionId: string | null, _onTick: () => void) {
  useEffect(() => {
    return () => {
      // cleanup
    };
  }, [_sessionId, _onTick]);

  return { intervalMs: FIVE_MINUTES_MS };
}
