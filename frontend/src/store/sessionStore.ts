import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PauseState {
  accumulatedMs: number;  runStartedAt: number | null;}

interface ActiveSessionState {
  sessionId: string | null;
  startedAt: string | null;
  pauseStates: Record<string, PauseState>;
  setActive: (sessionId: string, startedAt: string) => void;
  initPauseState: (sessionId: string, sessionStartedAt: string) => void;
  pause: (sessionId: string) => void;
  resume: (sessionId: string) => void;
  clear: () => void;
  forget: (sessionId: string) => void;
}

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
      forget: (sessionId) => {
        const state = get();
        const next: Partial<ActiveSessionState> = {};
        if (state.sessionId === sessionId) {
          next.sessionId = null;
          next.startedAt = null;
        }
        if (state.pauseStates[sessionId]) {
          const { [sessionId]: _drop, ...rest } = state.pauseStates;
          next.pauseStates = rest;
        }
        if (Object.keys(next).length > 0) set(next);
      },
    }),
    { name: 'active-session' },
  ),
);

export function computeElapsedMs(
  pauseState: PauseState | undefined,
  sessionStartedAt: string,
): number {
  if (!pauseState) return Date.now() - new Date(sessionStartedAt).getTime();
  if (pauseState.runStartedAt === null) return pauseState.accumulatedMs;
  return pauseState.accumulatedMs + (Date.now() - pauseState.runStartedAt);
}
