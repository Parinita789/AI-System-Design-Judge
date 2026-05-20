import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string; // ISO timestamp from the server
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

// JWT + user persisted to localStorage under `auth`. The axios
// request interceptor reads `token` on every API call; the response
// interceptor clears + redirects on 401. Token rotation on login or
// signup overwrites both fields in a single setAuth call so middleware
// never observes a partial state.
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => set({ user, token }),
      clearAuth: () => set({ user: null, token: null }),
      isAuthenticated: () => get().token !== null,
    }),
    { name: 'auth' },
  ),
);
