import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import { api } from '@/services/api';
import { sessionsService } from '@/services/sessions.service';
import { snapshotsService } from '@/services/snapshots.service';
import { useSessionStore, computeElapsedMs } from '@/store/sessionStore';
import { HintChatPanel } from '@/components/HintChatPanel';
import { MermaidBlock } from '@/components/MermaidBlock';

type ViewMode = 'edit' | 'split' | 'preview';

const PREVIEW_DEBOUNCE_MS = 300;

const CHAT_EXPANDED_KEY = 'app-chat-expanded';
const CHAT_HEIGHT_KEY = 'app-chat-height';
const CHAT_MIN_HEIGHT = 120;
const CHAT_DEFAULT_HEIGHT = 240;

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
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [previewContent, setPreviewContent] = useState('');
  const [chatExpanded, setChatExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(CHAT_EXPANDED_KEY) === '1';
  });
  const [chatHeight, setChatHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return CHAT_DEFAULT_HEIGHT;
    const stored = Number(window.localStorage.getItem(CHAT_HEIGHT_KEY));
    return Number.isFinite(stored) && stored >= CHAT_MIN_HEIGHT ? stored : CHAT_DEFAULT_HEIGHT;
  });
  useEffect(() => {
    window.localStorage.setItem(CHAT_EXPANDED_KEY, chatExpanded ? '1' : '0');
  }, [chatExpanded]);
  useEffect(() => {
    window.localStorage.setItem(CHAT_HEIGHT_KEY, String(Math.round(chatHeight)));
  }, [chatHeight]);

  const startChatResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = chatHeight;
    const maxHeight = Math.floor(window.innerHeight * 0.7);
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const next = Math.max(CHAT_MIN_HEIGHT, Math.min(maxHeight, startHeight + delta));
      setChatHeight(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const lastSavedContentRef = useRef<string | null>(null);
  const seededRef = useRef(false);

  const sessionQuery = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessionsService.get(id!),
    enabled: !!id,
    retry: false,
  });

  useEffect(() => {
    if (sessionQuery.isError) {
      clearStore();
      navigate('/home', { replace: true });
    }
  }, [sessionQuery.isError, clearStore, navigate]);

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

  useEffect(() => {
    if (seededRef.current) return;
    if (latestSnapshotQuery.isPending) return;
    const seeded = latestSnapshotQuery.data?.artifacts?.planMd ?? '';
    setContent(seeded);
    setPreviewContent(seeded);
    lastSavedContentRef.current = seeded;
    if (latestSnapshotQuery.data) {
      setLastSavedAt(new Date(latestSnapshotQuery.data.takenAt).getTime());
    }
    seededRef.current = true;
  }, [latestSnapshotQuery.isPending, latestSnapshotQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!id || !sessionQuery.data) throw new Error('No active session');
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
      // Flush unsaved content on both End and Cancel — even an abandoned
      // session's plan.md is the source-of-truth for retry-inheritance,
      // so a cancelled attempt must still land its diagrams on disk.
      if (seededRef.current && content !== lastSavedContentRef.current) {
        await saveMutation.mutateAsync(content);
      }
      return sessionsService.end(id, status);
    },
    onSuccess: (_result, status) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['evals', id] });
      clearStore();
      if (status === 'completed' && id) {
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

  // Freeze the timer the moment End/Cancel is pressed so it doesn't keep
  // advancing during the backend round-trip and final eval.
  const timerStopped = isPaused || endMutation.isPending || endMutation.isSuccess;
  useEffect(() => {
    if (timerStopped) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timerStopped]);

  useEffect(() => {
    if (!id || !sessionQuery.data) return;
    initPauseState(id, sessionQuery.data.startedAt);
  }, [id, sessionQuery.data, initPauseState]);

  useEffect(() => {
    const t = setInterval(saveIfDirty, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [saveIfDirty]);

  useEffect(() => {
    const t = setTimeout(() => setPreviewContent(content), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [content]);

  // Mirror live values into refs so the unload listener (registered once)
  // reads the latest content without rebinding.
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  const sessionRef = useRef(sessionQuery.data);
  useEffect(() => {
    sessionRef.current = sessionQuery.data;
  }, [sessionQuery.data]);

  // sendBeacon is used because fetch/axios don't reliably complete on unload.
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
      // application/json so NestJS body-parses; sendBeacon defaults to form-urlencoded.
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
  if (sessionQuery.isError) return null;
  if (sessionQuery.isPending) return <div>Loading session…</div>;

  const session = sessionQuery.data;
  // Re-render each tick so the elapsed timer updates; pauseState handles the math.
  void now;
  const elapsed = computeElapsedMs(pauseState, session.startedAt);
  const dirty = seededRef.current && content !== lastSavedContentRef.current;

  const handlePauseToggle = () => {
    if (!id) return;
    if (isPaused) resumeAction(id);
    else pauseAction(id);
  };

  return (
    <div className="flex flex-col gap-2 h-[calc(100vh-1.5rem)]">
      <header className="flex items-center justify-between gap-3 shrink-0">
        <h2 className="text-base font-semibold leading-none">Active session</h2>
        <div className="flex items-center gap-3">
          <span
            className={`text-base font-semibold font-mono tabular-nums leading-none px-2 py-1.5 ${
              isPaused ? 'text-amber-600' : 'text-gray-800'
            }`}
          >
            {formatElapsed(elapsed)}
          </span>
          <button
            type="button"
            onClick={handlePauseToggle}
            disabled={endMutation.isPending}
            className={`rounded px-3 py-1.5 text-sm font-medium leading-none disabled:opacity-50 disabled:cursor-not-allowed ${
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
            className="rounded bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium leading-none hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {endMutation.isPending && endMutation.variables === 'completed'
              ? 'Evaluating…'
              : 'End session'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={endMutation.isPending}
            className="rounded border border-red-300 text-red-700 px-3 py-1.5 text-sm font-medium leading-none hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {endMutation.isPending && endMutation.variables === 'abandoned'
              ? 'Cancelling…'
              : 'Cancel'}
          </button>
        </div>
      </header>

      {endMutation.isError && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 shrink-0">
          Failed to end session: {(endMutation.error as Error).message}
        </div>
      )}

      <section className="shrink-0">
        <h3 className="text-[11px] font-medium text-gray-700 mb-0.5 uppercase tracking-wide">
          Question
        </h3>
        <div className="rounded border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm whitespace-pre-wrap font-mono max-h-24 overflow-y-auto">
          {session.question.prompt}
        </div>
      </section>

      <section className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1 shrink-0 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
              Plan (plan.md)
            </h3>
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          </div>
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
        <div className="flex-1 flex gap-2 min-h-0">
          {viewMode !== 'preview' && (
            <div
              className={`${
                viewMode === 'split' ? 'w-1/2' : 'flex-1'
              } rounded border border-gray-300 overflow-hidden min-h-0`}
            >
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
          )}
          {viewMode !== 'edit' && (
            <div
              className={`${
                viewMode === 'split' ? 'w-1/2' : 'flex-1'
              } rounded border border-gray-300 bg-white overflow-y-auto overflow-x-auto min-h-0`}
            >
              <PreviewPane
                content={previewContent}
                onInsertExample={(snippet) => {
                  const next = (content.endsWith('\n') ? content : content + '\n') + snippet;
                  setContent(next);
                  setPreviewContent(next);
                  saveMutation.mutate(next);
                }}
                onDeleteBlock={(index) => {
                  const re = /```\s*mermaid\s*\n[\s\S]*?```\n?/gi;
                  let count = 0;
                  const next = content
                    .replace(re, (match) => (count++ === index ? '' : match))
                    .replace(/\n{3,}/g, '\n\n');
                  setContent(next);
                  setPreviewContent(next);
                  saveMutation.mutate(next);
                }}
              />
            </div>
          )}
        </div>
        {saveMutation.isError && (
          <div className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shrink-0">
            Save failed: {(saveMutation.error as Error).message}
          </div>
        )}
      </section>

      {chatExpanded && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize chat panel"
          onMouseDown={startChatResize}
          title="Drag to resize"
          className="h-1.5 -my-0.5 shrink-0 bg-transparent hover:bg-blue-300 active:bg-blue-400 cursor-row-resize transition-colors"
        />
      )}
      <aside
        className="shrink-0"
        style={chatExpanded ? { height: `${chatHeight}px` } : undefined}
      >
        <HintChatPanel
          sessionId={id}
          expanded={chatExpanded}
          onToggleExpanded={() => setChatExpanded((v) => !v)}
        />
      </aside>

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

const MERMAID_PLACEHOLDER = `flowchart LR
  Client -->|HTTPS| API[API Gateway]
  API --> Cache[(Redis cache)]
  API --> DB[(Primary DB)]
  Cache -.->|miss| DB`;

function extractMermaidBlocks(md: string): string[] {
  const blocks: string[] = [];
  const re = /```\s*mermaid\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(md)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function mermaidLiveUrl(code: string): string {
  const state = {
    code,
    mermaid: '{\n  "theme": "default"\n}',
    autoSync: true,
    updateDiagram: true,
  };
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return `https://mermaid.live/edit#base64:${btoa(binary)}`;
}

function PreviewPane({
  content,
  onInsertExample,
  onDeleteBlock,
}: {
  content: string;
  onInsertExample: (snippet: string) => void;
  onDeleteBlock: (index: number) => void;
}) {
  const blocks = extractMermaidBlocks(content);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  const handlePasteInsert = (raw: string) => {
    const cleaned = raw
      .trim()
      .replace(/^```\s*mermaid\s*\n?/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    if (!cleaned) return;
    onInsertExample(`\`\`\`mermaid\n${cleaned}\n\`\`\`\n`);
    setPasteOpen(false);
  };

  if (blocks.length === 0) {
    return (
      <div className="p-3 text-xs text-gray-700">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-medium text-amber-900">No diagram in this plan</span>
          <a
            href="https://mermaid.js.org/intro/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline text-[11px]"
          >
            Mermaid docs ↗
          </a>
        </div>
        <p className="text-[11px] text-gray-600 leading-snug mb-2">
          Paste your Mermaid source below — flowchart, sequenceDiagram,
          erDiagram, classDiagram and more are supported. Triple-backtick
          fences are added for you.
        </p>
        <InlineDiagramComposer onInsert={handlePasteInsert} />
        <div className="mt-2">
          <a
            href={mermaidLiveUrl('flowchart LR\n  A --> B')}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded border border-blue-300 text-blue-700 bg-white px-2.5 py-1 text-[11px] font-medium hover:bg-blue-50"
            title="Build your diagram visually in the official editor, then paste back"
          >
            Open Mermaid Live Editor ↗
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">
          {blocks.length} diagram{blocks.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            className="rounded border border-gray-300 bg-white text-gray-700 px-2 py-0.5 text-[11px] font-medium hover:bg-gray-100"
            title="Paste mermaid source from mermaid.live or anywhere else"
          >
            + Add diagram
          </button>
          <a
            href={mermaidLiveUrl('flowchart LR\n  A --> B')}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-blue-300 bg-white text-blue-700 px-2 py-0.5 text-[11px] font-medium hover:bg-blue-50"
            title="Build a new diagram in the official editor, then paste back"
          >
            Mermaid Live ↗
          </a>
        </div>
      </div>
      {blocks.map((src, i) => (
        <div key={`${i}-${src.length}`} className="relative group">
          <div className="absolute top-1 right-1 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <a
              href={mermaidLiveUrl(src)}
              target="_blank"
              rel="noreferrer"
              title="Open this diagram in the official Mermaid Live Editor"
              aria-label={`Open diagram ${i + 1} in Mermaid Live Editor`}
              className="inline-flex items-center justify-center h-6 px-2 rounded border border-gray-300 bg-white text-[11px] text-blue-700 hover:border-blue-300 hover:bg-blue-50"
            >
              Edit ↗
            </a>
            <button
              type="button"
              onClick={() => setPendingDeleteIndex(i)}
              title="Delete this diagram"
              aria-label={`Delete diagram ${i + 1}`}
              className="inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 bg-white text-gray-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50"
            >
              ×
            </button>
          </div>
          <MermaidBlock source={src} />
        </div>
      ))}
      {pasteOpen && (
        <div className="rounded border border-blue-200 bg-blue-50/30 p-2">
          <div className="text-[11px] font-medium text-gray-700 mb-1.5">
            Paste a new diagram
          </div>
          <InlineDiagramComposer
            onInsert={handlePasteInsert}
            onCancel={() => setPasteOpen(false)}
            showCancel
          />
        </div>
      )}
      {pendingDeleteIndex !== null && (
        <ConfirmDeleteDiagramDialog
          index={pendingDeleteIndex}
          onConfirm={() => {
            onDeleteBlock(pendingDeleteIndex);
            setPendingDeleteIndex(null);
          }}
          onDismiss={() => setPendingDeleteIndex(null)}
        />
      )}
    </div>
  );
}

function InlineDiagramComposer({
  onInsert,
  onCancel,
  showCancel = false,
}: {
  onInsert: (source: string) => void;
  onCancel?: () => void;
  showCancel?: boolean;
}) {
  const [value, setValue] = useState('');
  const canInsert = value.trim().length > 0;

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder={MERMAID_PLACEHOLDER}
        spellCheck={false}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-[11px] font-mono leading-snug resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onInsert(value);
            setValue('');
          }}
          disabled={!canInsert}
          className="rounded bg-blue-600 text-white px-2.5 py-1 text-[11px] font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Insert into plan
        </button>
        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 bg-white text-gray-700 px-2.5 py-1 text-[11px] font-medium hover:bg-gray-100"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmDeleteDiagramDialog({
  index,
  onConfirm,
  onDismiss,
}: {
  index: number;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onDismiss]);

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
          <h2 className="text-base font-semibold text-gray-900">
            Delete diagram #{index + 1}?
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            This will remove the{' '}
            <code className="font-mono bg-gray-100 px-1 rounded text-xs">```mermaid</code>{' '}
            block from your plan.md. You can undo from the editor (Cmd/Ctrl-Z) if needed.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-lg">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="rounded bg-rose-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-rose-700"
          >
            Delete diagram
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const options: Array<{ value: ViewMode; label: string; title: string }> = [
    { value: 'edit', label: 'Edit', title: 'Editor only' },
    { value: 'split', label: 'Split', title: 'Editor on top, live preview below' },
    { value: 'preview', label: 'Preview', title: 'Rendered preview only' },
  ];
  return (
    <div className="inline-flex rounded border border-gray-300 overflow-hidden text-[11px]">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-pressed={mode === o.value}
          className={`px-2.5 py-1 ${
            mode === o.value
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          } ${i > 0 ? 'border-l border-gray-300' : ''}`}
        >
          {o.label}
        </button>
      ))}
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
              ? 'Your latest changes (including any diagrams) will be saved so a retry can inherit them. The attempt will be marked abandoned and won’t be evaluated.'
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
