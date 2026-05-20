import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/authStore';
import { describeError } from '@/lib/error';

// Mirrors the backend SignupDto: email + password (8–50 chars,
// matching the @MinLength(8) + @MaxLength(50) on the DTO).
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 50;

export function SignupPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: authService.signup,
    onSuccess: ({ user, token }) => {
      // See LoginPage — wipe any cached data from a previous session
      // before storing the new token.
      queryClient.clear();
      setAuth(user, token);
      navigate('/home', { replace: true });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ email: email.trim(), password });
  };

  const passwordOk = password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Create an account</h1>
        <p className="text-sm text-gray-600 mb-6">
          Already have one?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">
            Sign in
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
            <span className="text-sm font-medium text-gray-700">
              Password{' '}
              <span className="text-xs text-gray-500 font-normal">
                ({PASSWORD_MIN}–{PASSWORD_MAX} characters)
              </span>
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN}
              maxLength={PASSWORD_MAX}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 px-3 py-2 border"
            />
            {password.length > 0 && !passwordOk && (
              <span className="text-xs text-red-600 mt-1 block">
                Password must be {PASSWORD_MIN}–{PASSWORD_MAX} characters.
              </span>
            )}
          </label>

          {mutation.isError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {describeError(mutation.error)}
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending || !email || !passwordOk}
            className="w-full bg-blue-600 text-white rounded-md py-2 px-4 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
