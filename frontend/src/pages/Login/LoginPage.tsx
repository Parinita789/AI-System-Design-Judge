import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/authStore';
import { describeError } from '@/lib/error';

// Returns to the originally-requested location after a successful
// login, falling back to /home if there's no prior route in state.
function useReturnTo(): string {
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  return from ?? '/home';
}

export function LoginPage() {
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: authService.login,
    onSuccess: ({ user, token }) => {
      // Wipe any cached data from a previous session before storing
      // the new token. Without this, TanStack Query would briefly
      // show the previous user's questions/sessions in the sidebar
      // until the new fetches return — a display-only leak (backend
      // ownership filters block the actual data) but jarring UX.
      queryClient.clear();
      setAuth(user, token);
      navigate(returnTo, { replace: true });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ email: email.trim(), password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Sign in</h1>
        <p className="text-sm text-gray-600 mb-6">
          Welcome back. New here?{' '}
          <Link to="/signup" className="text-blue-600 hover:underline">
            Create an account
          </Link>
          .
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 px-3 py-2 border"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 px-3 py-2 border"
            />
          </label>

          {mutation.isError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {describeError(mutation.error)}
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending || !email || !password}
            className="w-full bg-blue-600 text-white rounded-md py-2 px-4 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
