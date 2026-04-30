import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PauseState {
  accumulatedMs: number; // total elapsed prior to the current run
  runStartedAt: number | null; // ms epoch when current run began; null while paused
}

interface ActiveSessionState {
  sessionId: string | null;
  startedAt: string | null;
  // Pause state keyed by sessionId so switching between sessions in the
  // sidebar doesn't lose each one's timer.
  pauseStates: Record<string, PauseState>;
  setActive: (sessionId: string, startedAt: string) => void;
  initPauseState: (sessionId: string, sessionStartedAt: string) => void;
  pause: (sessionId: string) => void;
  resume: (sessionId: string) => void;
  clear: () => void;
}

// Persists to localStorage so the session + pause state survive tab close.
export const useSessionStore = create<ActiveSessionState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      startedAt: null,
      pauseStates: {},
      setActive: (sessionId, startedAt) => set({ sessionId, startedAt }),
      initPauseState: (sessionId, sessionStartedAt) => {
        if (get().pauseStates[sessionId]) return;
        set({
          pauseStates: {
            ...get().pauseStates,
            [sessionId]: {
              accumulatedMs: 0,
              runStartedAt: new Date(sessionStartedAt).getTime(),
            },
          },
        });
      },
      pause: (sessionId) => {
        const state = get().pauseStates[sessionId];
        if (!state || state.runStartedAt === null) return;
        set({
          pauseStates: {
            ...get().pauseStates,
            [sessionId]: {
              accumulatedMs: state.accumulatedMs + (Date.now() - state.runStartedAt),
              runStartedAt: null,
            },
          },
        });
      },
      resume: (sessionId) => {
        const state = get().pauseStates[sessionId];
        if (!state || state.runStartedAt !== null) return;
        set({
          pauseStates: {
            ...get().pauseStates,
            [sessionId]: { accumulatedMs: state.accumulatedMs, runStartedAt: Date.now() },
          },
        });
      },
      clear: () => set({ sessionId: null, startedAt: null }),
    }),
    { name: 'active-session' },
  ),
);

// Compute pause-aware elapsed ms. Falls back to wall-clock when no pause
// state has been initialized yet (i.e. very first render before initPauseState fires).
export function computeElapsedMs(
  pauseState: PauseState | undefined,
  sessionStartedAt: string,
): number {
  if (!pauseState) return Date.now() - new Date(sessionStartedAt).getTime();
  if (pauseState.runStartedAt === null) return pauseState.accumulatedMs;
  return pauseState.accumulatedMs + (Date.now() - pauseState.runStartedAt);
}
