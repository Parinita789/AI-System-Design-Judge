import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ActiveSessionState {
  sessionId: string | null;
  startedAt: string | null;
  setActive: (sessionId: string, startedAt: string) => void;
  clear: () => void;
}

// Persists to localStorage so the session survives tab close (decisions.md §4).
export const useSessionStore = create<ActiveSessionState>()(
  persist(
    (set) => ({
      sessionId: null,
      startedAt: null,
      setActive: (sessionId, startedAt) => set({ sessionId, startedAt }),
      clear: () => set({ sessionId: null, startedAt: null }),
    }),
    { name: 'active-session' },
  ),
);
