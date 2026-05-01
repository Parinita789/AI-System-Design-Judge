import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import { api } from '@/services/api';
import { sessionsService } from '@/services/sessions.service';
import { snapshotsService } from '@/services/snapshots.service';
import { useSessionStore, computeElapsedMs } from '@/store/sessionStore';
import { HintChatPanel } from '@/components/HintChatPanel';

const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatRelative(ts: number, now: number): string {
  const sec = Math.floor((now - ts) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export function ActiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearStore = useSessionStore((s) => s.clear);
  const initPauseState = useSessionStore((s) => s.initPauseState);
  const pauseAction = useSessionStore((s) => s.pause);
  const resumeAction = useSessionStore((s) => s.resume);
  const pauseState = useSessionStore((s) => (id ? s.pauseStates[id] : undefined));
  const isPaused = pauseState?.runStartedAt === null && pauseState !== undefined;
  const [now, setNow] = useState(() => Date.now());
  const [content, setContent] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const lastSavedContentRef = useRef<string | null>(null);
  const seededRef = useRef(false);

  const sessionQuery = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessionsService.get(id!),
    enabled: !!id,
    retry: false,
  });

  // If the session in the URL no longer exists, fall back to the start screen.
  useEffect(() => {
    if (sessionQuery.isError) {
      clearStore();
      navigate('/home', { replace: true });
    }
  }, [sessionQuery.isError, clearStore, navigate]);

  // If the session has already ended (completed or abandoned), redirect to
  // the read-only results page instead of resuming the editor.
  useEffect(() => {
    if (sessionQuery.data && sessionQuery.data.status !== 'active' && id) {
      navigate(`/sessions/${id}`, { replace: true });
    }
  }, [sessionQuery.data, id, navigate]);

  const latestSnapshotQuery = useQuery({
    queryKey: ['snapshot-latest', id],
    queryFn: () => snapshotsService.latest(id!),
    enabled: !!id,
  });

  // Seed editor once with the latest snapshot's content.
  useEffect(() => {
    if (seededRef.current) return;
    if (latestSnapshotQuery.isPending) return;
    const seeded = latestSnapshotQuery.data?.artifacts?.planMd ?? '';
    setContent(seeded);
    lastSavedContentRef.current = seeded;
    if (latestSnapshotQuery.data) {
      setLastSavedAt(new Date(latestSnapshotQuery.data.takenAt).getTime());
    }
    seededRef.current = true;
  }, [latestSnapshotQuery.isPending, latestSnapshotQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!id || !sessionQuery.data) throw new Error('No active session');
      // Use pause-aware elapsed so paused time isn't counted as active work
      // (matters for the rubric's temporal signals later).
      const elapsedMs = computeElapsedMs(
        useSessionStore.getState().pauseStates[id],
        sessionQuery.data.startedAt,
      );
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      return snapshotsService.capture(id, elapsedMinutes, { planMd: text });
    },
    onSuccess: (snap) => {
      lastSavedContentRef.current = snap.artifacts.planMd ?? '';
      setLastSavedAt(new Date(snap.takenAt).getTime());
    },
  });

  const saveIfDirty = useCallback(() => {
    if (!seededRef.current) return;
    if (saveMutation.isPending) return;
    if (content === lastSavedContentRef.current) return;
    saveMutation.mutate(content);
  }, [content, saveMutation]);

  const endMutation = useMutation({
    mutationFn: async (status: 'completed' | 'abandoned') => {
      if (!id) throw new Error('No active session');
      // For "End", flush any unsaved content first. Cancel discards.
      if (status === 'completed' && seededRef.current && content !== lastSavedContentRef.current) {
        await saveMutation.mutateAsync(content);
      }
      return sessionsService.end(id, status);
    },
    onSuccess: (_result, status) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['evals', id] });
      clearStore();
      if (status === 'completed' && id) {
        // Navigate to the results page; SessionResultsPage shows the eval (or
        // an error banner if `evalError` is non-null on the latest run).
        navigate(`/sessions/${id}`, { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
    },
  });

  const handleEnd = () => {
    if (endMutation.isPending) return;
    endMutation.mutate('completed');
  };

  const handleCancel = () => {
    if (endMutation.isPending) return;
    setCancelDialogOpen(true);
  };

  const confirmCancel = () => {
    setCancelDialogOpen(false);
    endMutation.mutate('abandoned');
  };

  const dirtyNow = seededRef.current && content !== lastSavedContentRef.current;

  // Tick clock for elapsed/relative times. Skip while paused or once the
  // session is ending/ended so the displayed timer freezes the moment
  // End/Cancel is pressed instead of continuing to advance during the
  // backend round-trip and final eval.
  const timerStopped = isPaused || endMutation.isPending || endMutation.isSuccess;
  useEffect(() => {
    if (timerStopped) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timerStopped]);

  // Initialize pause state for this session on mount.
  useEffect(() => {
    if (!id || !sessionQuery.data) return;
    initPauseState(id, sessionQuery.data.startedAt);
  }, [id, sessionQuery.data, initPauseState]);

  // Auto-save every 5 minutes if content has changed.
  useEffect(() => {
    const t = setInterval(saveIfDirty, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [saveIfDirty]);

  // Mirror live editor content + session into refs so the unload listener
  // (registered once per session) reads the latest values without rebinding.
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  const sessionRef = useRef(sessionQuery.data);
  useEffect(() => {
    sessionRef.current = sessionQuery.data;
  }, [sessionQuery.data]);

  // Flush dirty content on tab close / refresh / OS shutdown via sendBeacon —
  // regular fetch/axios doesn't reliably complete during page unload.
  useEffect(() => {
    if (!id) return;
    const flushOnExit = () => {
      if (!seededRef.current) return;
      if (!sessionRef.current) return;
      if (contentRef.current === lastSavedContentRef.current) return;

      const elapsedMs = computeElapsedMs(
        useSessionStore.getState().pauseStates[id],
        sessionRef.current.startedAt,
      );
      const elapsedMinutes = Math.floor(elapsedMs / 60000);

      const baseURL = api.defaults.baseURL ?? '/api';
      const url = `${baseURL}/sessions/${id}/snapshots`;
      const body = JSON.stringify({
        elapsedMinutes,
        artifacts: { planMd: contentRef.current },
      });
      // Blob with application/json so NestJS body-parses it correctly;
      // sendBeacon defaults to form-urlencoded otherwise.
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    };

    window.addEventListener('beforeunload', flushOnExit);
    window.addEventListener('pagehide', flushOnExit);
    return () => {
      window.removeEventListener('beforeunload', flushOnExit);
      window.removeEventListener('pagehide', flushOnExit);
    };
  }, [id]);

  if (!id) return <div>Missing session id.</div>;
  if (sessionQuery.isError) return null; // redirect effect kicks in
  if (sessionQuery.isPending) return <div>Loading session…</div>;

  const session = sessionQuery.data;
  // Read `now` so the timer re-renders each second; pauseState handles the pause math.
  void now;
  const elapsed = computeElapsedMs(pauseState, session.startedAt);
  const dirty = seededRef.current && content !== lastSavedContentRef.current;

  const handlePauseToggle = () => {
    if (!id) return;
    if (isPaused) resumeAction(id);
    else pauseAction(id);
  };

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-3rem)]">
      {/* Compact header: title on left, all session controls on right in one row */}
      <header className="flex items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold leading-tight">Active session</h2>
          <p className="text-[11px] text-gray-500 leading-tight">id: {session.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              Elapsed{isPaused && <span className="ml-1 text-amber-600">• paused</span>}
            </div>
            <div
              className={`text-xl font-mono tabular-nums ${isPaused ? 'text-amber-600' : ''}`}
            >
              {formatElapsed(elapsed)}
            </div>
          </div>
          <button
            type="button"
            onClick={handlePauseToggle}
            disabled={endMutation.isPending}
            className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
              isPaused
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-gray-100 text-gray-800 hover:bg-gray-200 border border-gray-300'
            }`}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={handleEnd}
            disabled={endMutation.isPending}
            className="rounded bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {endMutation.isPending && endMutation.variables === 'completed'
              ? 'Evaluating…'
              : 'End session'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={endMutation.isPending}
            className="rounded border border-red-300 text-red-700 px-3 py-1.5 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {endMutation.isPending && endMutation.variables === 'abandoned'
              ? 'Cancelling…'
              : 'Cancel'}
          </button>
        </div>
      </header>

      {endMutation.isError && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shrink-0">
          Failed to end session: {(endMutation.error as Error).message}
        </div>
      )}

      {/* Body fills remaining vertical space — both columns share the same height */}
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
          <section className="shrink-0">
            <h3 className="text-xs font-medium text-gray-700 mb-1 uppercase tracking-wide">
              Question
            </h3>
            <div className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap font-mono max-h-28 overflow-y-auto">
              {session.question.prompt}
            </div>
          </section>

          <section className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                Plan (plan.md)
              </h3>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {saveMutation.isPending ? (
                  <span>Saving…</span>
                ) : lastSavedAt ? (
                  <span>
                    Last saved {formatRelative(lastSavedAt, now)}
                    {dirty && <span className="text-amber-600"> • unsaved changes</span>}
                  </span>
                ) : (
                  <span>Not saved yet</span>
                )}
                <button
                  type="button"
                  onClick={saveIfDirty}
                  disabled={!seededRef.current || saveMutation.isPending || !dirty}
                  className="rounded bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Save now
                </button>
              </div>
            </div>
            <div className="flex-1 rounded border border-gray-300 overflow-hidden min-h-0">
              <Editor
                height="100%"
                language="markdown"
                value={content}
                onChange={(v) => setContent(v ?? '')}
                theme="vs-dark"
                options={{
                  wordWrap: 'on',
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
            {saveMutation.isError && (
              <div className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shrink-0">
                Save failed: {(saveMutation.error as Error).message}
              </div>
            )}
          </section>
        </div>

        <aside className="w-[360px] shrink-0">
          <HintChatPanel sessionId={id} />
        </aside>
      </div>

      {cancelDialogOpen && (
        <ConfirmCancelDialog
          dirty={dirtyNow}
          pending={endMutation.isPending}
          onConfirm={confirmCancel}
          onDismiss={() => setCancelDialogOpen(false)}
        />
      )}
    </div>
  );
}

function ConfirmCancelDialog({
  dirty,
  pending,
  onConfirm,
  onDismiss,
}: {
  dirty: boolean;
  pending: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white shadow-xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold text-gray-900">Cancel this session?</h2>
          <p className="mt-1 text-sm text-gray-600">
            {dirty
              ? 'Unsaved changes will be discarded. The attempt will be marked abandoned and won’t be evaluated.'
              : 'The attempt will be marked abandoned and won’t be evaluated.'}
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-lg">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Keep working
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded bg-rose-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Cancelling…' : 'Cancel session'}
          </button>
        </div>
      </div>
    </div>
  );
}
