import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

// Wraps routes that should only be reachable when NOT authenticated
// (login, signup). An already-signed-in user landing on /login is
// bounced to /home so the back button doesn't get stuck on a stale
// login screen after a successful sign-in.
export function PublicOnly() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }
  return <Outlet />;
}
