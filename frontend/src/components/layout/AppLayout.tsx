import { useEffect, useState } from 'react';
import { Link, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services/questions.service';
import { sessionsService } from '@/services/sessions.service';
import { useSessionStore } from '@/store/sessionStore';
import { useAuthStore } from '@/store/authStore';
import { extractApiError } from '@/lib/error';
import type { QuestionWithSessions } from '@/types/question';

const SIDEBAR_COLLAPSED_KEY = 'app-sidebar-collapsed';

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function AppLayout() {
  const sessionMatch = useMatch('/sessions/:id/*');
  const activeSessionId = sessionMatch?.params.id;
  const questionMatch = useMatch('/questions/:id');
  const activeQuestionId = questionMatch?.params.id;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const forgetSession = useSessionStore((s) => s.forget);
  const currentUser = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const onLogout = () => {
    // Clear the persisted token and Tan​Stack caches together — leaving
    // the user-scoped cache around after a sign-out would briefly show
    // the previous user's data to the next sign-in until refetch.
    clearAuth();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const activeSessionQuery = useQuery({
    queryKey: ['session', activeSessionId],
    queryFn: () => sessionsService.get(activeSessionId!),
    enabled: !!activeSessionId,
  });
  const highlightQuestionId = activeQuestionId ?? activeSessionQuery.data?.questionId;

  const questionsQuery = useQuery({
    queryKey: ['questions'],
    queryFn: () => questionsService.list(),
  });

  const [deletingQuestion, setDeletingQuestion] = useState<QuestionWithSessions | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (questionId: string) => questionsService.delete(questionId),
    onSuccess: (_out, questionId) => {
      const question = questionsQuery.data?.find((q) => q.id === questionId);
      const sessionIds = question?.sessions.map((s) => s.id) ?? [];

      const onDeletedQuestion = activeQuestionId === questionId;
      const onDeletedSession =
        !!activeSessionId && sessionIds.includes(activeSessionId);
      if (onDeletedQuestion || onDeletedSession) {
        navigate('/home');
      }

      for (const sid of sessionIds) forgetSession(sid);
      queryClient.removeQueries({ queryKey: ['question', questionId] });
      for (const sid of sessionIds) {
        queryClient.removeQueries({ queryKey: ['session', sid] });
        queryClient.removeQueries({ queryKey: ['evals', sid] });
        queryClient.removeQueries({ queryKey: ['snapshot', sid] });
        queryClient.removeQueries({ queryKey: ['build-events', sid] });
      }
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      setDeletingQuestion(null);
    },
  });

  return (
    <div className="h-screen flex bg-white">
      <aside
        className={`shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col transition-[width] duration-150 ease-in-out ${
          collapsed ? 'w-10' : 'w-72'
        }`}
      >
        <div
          className={`flex items-center ${
            collapsed ? 'justify-center px-1' : 'justify-between px-4'
          } pt-3 pb-2`}
        >
          {!collapsed && <h1 className="text-base font-semibold text-gray-900">Interview Assistant</h1>}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
          >
            <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          </button>
        </div>
        {collapsed ? (
          <div className="flex-1 flex flex-col items-center pt-1">
            <Link
              to="/home"
              title="New question"
              aria-label="New question"
              className="rounded bg-blue-600 text-white w-7 h-7 flex items-center justify-center text-sm font-bold hover:bg-blue-700"
            >
              +
            </Link>
          </div>
        ) : (
          <>
            <div className="px-3 pb-2">
              <Link
                to="/home"
                className="block w-full text-center rounded bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700"
              >
                + New question
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <div className="text-xs uppercase tracking-wide text-gray-500 px-2 pt-1 pb-1">
                Questions
              </div>
              {questionsQuery.isPending && (
                <div className="text-xs text-gray-500 px-2 py-1">Loading…</div>
              )}
              {questionsQuery.data && questionsQuery.data.length === 0 && (
                <div className="text-xs text-gray-500 px-2 py-1">No questions yet.</div>
              )}
              {questionsQuery.data?.map((q) => {
                const isHighlighted = highlightQuestionId === q.id;
                const attempts = q.sessions.length;
                const completedAttempts = q.sessions.filter((s) => s.status === 'completed');
                const bestPlanScore = completedAttempts
                  .map((s) =>
                    s.phaseEvaluations
                      .filter((e) => e.phase === 'plan')
                      .map((e) => Number(e.score))
                      .find((n) => Number.isFinite(n)),
                  )
                  .filter((n): n is number => n !== undefined && Number.isFinite(n))
                  .reduce<number | null>(
                    (best, n) => (best === null || n > best ? n : best),
                    null,
                  );

                return (
                  <div
                    key={q.id}
                    className={`group relative rounded transition-colors ${
                      isHighlighted ? 'bg-blue-100' : 'hover:bg-gray-200'
                    }`}
                  >
                    <Link
                      to={`/questions/${q.id}`}
                      className={`block px-2 py-1.5 pr-8 text-sm ${
                        isHighlighted ? 'text-blue-900' : 'text-gray-900'
                      }`}
                    >
                      <div className="line-clamp-2 leading-snug">{q.prompt}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
                        <span>{relativeTime(q.createdAt)}</span>
                        <span>·</span>
                        <span>
                          {attempts} attempt{attempts === 1 ? '' : 's'}
                        </span>
                        {bestPlanScore !== null && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-700">
                              best {bestPlanScore.toFixed(2)}
                            </span>
                          </>
                        )}
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (deleteMutation.isPending) return;
                        setDeletingQuestion(q);
                      }}
                      title="Delete this question and every attempt of it"
                      aria-label={`Delete question: ${q.prompt.slice(0, 40)}`}
                      className="absolute right-1 top-1.5 rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-rose-100 hover:text-rose-700 focus:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                      disabled={deleteMutation.isPending}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                );
              })}
              {questionsQuery.isError && (
                <div className="text-xs text-red-600 px-2 py-1">
                  Failed to load questions: {extractApiError(questionsQuery.error)}
                </div>
              )}
            </div>
            {currentUser && (
              <div className="border-t border-gray-200 px-3 py-2 flex items-center justify-between">
                <span
                  className="text-xs text-gray-600 truncate"
                  title={currentUser.email}
                >
                  {currentUser.email}
                </span>
                <button
                  type="button"
                  onClick={onLogout}
                  className="ml-2 shrink-0 text-xs text-gray-500 hover:text-gray-900 underline"
                >
                  Sign out
                </button>
              </div>
            )}
          </>
        )}
      </aside>
      <main className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
        <Outlet />
      </main>
      {deletingQuestion && (
        <ConfirmDeleteQuestionDialog
          question={deletingQuestion}
          isPending={deleteMutation.isPending}
          error={deleteMutation.isError ? extractApiError(deleteMutation.error) : null}
          onConfirm={() => deleteMutation.mutate(deletingQuestion.id)}
          onDismiss={() => {
            if (deleteMutation.isPending) return;
            deleteMutation.reset();
            setDeletingQuestion(null);
          }}
        />
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ConfirmDeleteQuestionDialog({
  question,
  isPending,
  error,
  onConfirm,
  onDismiss,
}: {
  question: QuestionWithSessions;
  isPending: boolean;
  error: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPending) return;
      if (e.key === 'Escape') onDismiss();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onDismiss, isPending]);

  const attemptCount = question.sessions.length;
  const attemptLabel = attemptCount === 1 ? 'attempt' : 'attempts';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={isPending ? undefined : onDismiss}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl border border-rose-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold text-rose-900">
            Delete this question?
          </h2>
          <p className="mt-1 text-xs text-gray-500 line-clamp-2 italic">
            "{question.prompt}"
          </p>
          <p className="mt-2 text-sm text-gray-700">
            This removes the question and{' '}
            <strong>
              all {attemptCount} {attemptLabel}
            </strong>{' '}
            of it — every plan.md snapshot, build event log, captured Claude
            Code turns, plan + build evaluations, and mentor +
            signal-mentor artifacts across every attempt. Not reversible.
          </p>
          <p className="mt-2 text-[11px] text-gray-500">
            On-disk prompt + response files are cleaned up in the background.
          </p>
        </div>
        {error && (
          <div className="mx-5 mb-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            Couldn't delete: {error}
          </div>
        )}
        <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-lg">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isPending}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            disabled={isPending}
            className="rounded bg-rose-700 text-white px-3 py-1.5 text-sm font-medium hover:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Deleting…' : `Delete question + ${attemptCount} ${attemptLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}
