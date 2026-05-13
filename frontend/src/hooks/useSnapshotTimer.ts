import { useEffect } from 'react';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function useSnapshotTimer(sessionId: string | null, onTick: () => void) {
  useEffect(() => {
    if (!sessionId) return;
    const id = setInterval(onTick, FIVE_MINUTES_MS);
    return () => {
      clearInterval(id);
    };
  }, [sessionId, onTick]);

  return { intervalMs: FIVE_MINUTES_MS };
}
