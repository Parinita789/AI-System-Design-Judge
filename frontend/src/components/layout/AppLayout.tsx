import { Link, Outlet, useMatch } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  const sessionMatch = useMatch('/sessions/:id/*');
  const activeId = sessionMatch?.params.id;

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionsService.list(),
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
            + New session
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-xs uppercase tracking-wide text-gray-500 px-2 pt-2 pb-1">
            Past sessions
          </div>
          {sessionsQuery.isPending && (
            <div className="text-xs text-gray-500 px-2 py-1">Loading…</div>
          )}
          {sessionsQuery.data && sessionsQuery.data.length === 0 && (
            <div className="text-xs text-gray-500 px-2 py-1">No sessions yet.</div>
          )}
          {sessionsQuery.data?.map((s) => {
            const isHighlighted = activeId === s.id;
            // Active sessions resume in the editor; ended (completed/abandoned)
            // sessions open the read-only results page instead.
            const target =
              s.status === 'active' ? `/sessions/${s.id}/active` : `/sessions/${s.id}`;
            return (
              <Link
                key={s.id}
                to={target}
                className={`block rounded px-2 py-2 text-sm transition-colors ${
                  isHighlighted ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-200 text-gray-900'
                }`}
              >
                <div className="line-clamp-2 leading-snug">{s.prompt}</div>
                <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-2">
                  <span>{relativeTime(s.startedAt)}</span>
                  {s.status !== 'active' && (
                    <span className="uppercase tracking-wide">{s.status}</span>
                  )}
                </div>
              </Link>
            );
          })}
          {sessionsQuery.isError && (
            <div className="text-xs text-red-600 px-2 py-1">
              Failed to load sessions: {(sessionsQuery.error as Error).message}
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
