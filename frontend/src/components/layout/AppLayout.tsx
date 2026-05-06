import { useEffect, useState } from 'react';
import { Link, Outlet, useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { questionsService } from '@/services/questions.service';
import { sessionsService } from '@/services/sessions.service';

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
                  <Link
                    key={q.id}
                    to={`/questions/${q.id}`}
                    className={`block rounded px-2 py-1.5 text-sm transition-colors ${
                      isHighlighted
                        ? 'bg-blue-100 text-blue-900'
                        : 'hover:bg-gray-200 text-gray-900'
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
                );
              })}
              {questionsQuery.isError && (
                <div className="text-xs text-red-600 px-2 py-1">
                  Failed to load questions: {(questionsQuery.error as Error).message}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
      <main className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
        <Outlet />
      </main>
    </div>
  );
}
