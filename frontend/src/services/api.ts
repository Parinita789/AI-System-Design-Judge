import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach the JWT to every request when the store has one. Reading from
// the Zustand store at request time (not module load) means a fresh
// login takes effect immediately on the next request without needing
// to recreate the axios instance.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401: the token is missing, expired, or invalid. Clear the
// persisted auth state and redirect to /login. We use window.location
// instead of react-router's navigate so the redirect happens cleanly
// from outside React's render tree (interceptors are not components).
//
// Skip the redirect when the user is already on /login or /signup —
// a failed login attempt also returns 401 from the backend and we
// don't want that to kick the form off the page.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/signup') {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
