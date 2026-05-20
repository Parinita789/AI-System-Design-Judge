import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

// Wraps any subtree that requires an authenticated user. Redirects to
// /login if the store has no token, preserving the original destination
// in router state so LoginPage can route back to it after a successful
// sign-in.
export function RequireAuth() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}
