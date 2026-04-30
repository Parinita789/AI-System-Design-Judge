import { Link, Outlet, useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { questionsService } from '@/services/questions.service';
import { sessionsService } from '@/services/sessions.service';

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
  // Track whether a session route is active so we can highlight its parent question.
  const sessionMatch = useMatch('/sessions/:id/*');
  const activeSessionId = sessionMatch?.params.id;
  const questionMatch = useMatch('/questions/:id');
  const activeQuestionId = questionMatch?.params.id;

  // If the URL is a session, fetch it (cached) so we know which question
  // owns it, to highlight that question in the sidebar.
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
      <aside className="w-72 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-lg font-semibold text-gray-900">AI Judge</h1>
        </div>
        <div className="p-3 border-b border-gray-200">
          <Link
            to="/home"
            className="block w-full text-center rounded bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700"
          >
            + New question
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-xs uppercase tracking-wide text-gray-500 px-2 pt-2 pb-1">
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
              .reduce<number | null>((best, n) => (best === null || n > best ? n : best), null);

            return (
              <Link
                key={q.id}
                to={`/questions/${q.id}`}
                className={`block rounded px-2 py-2 text-sm transition-colors ${
                  isHighlighted ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-200 text-gray-900'
                }`}
              >
                <div className="line-clamp-2 leading-snug">{q.prompt}</div>
                <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2">
                  <span>{relativeTime(q.createdAt)}</span>
                  <span>·</span>
                  <span>
                    {attempts} attempt{attempts === 1 ? '' : 's'}
                  </span>
                  {bestPlanScore !== null && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-700">best {bestPlanScore.toFixed(2)}</span>
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
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
