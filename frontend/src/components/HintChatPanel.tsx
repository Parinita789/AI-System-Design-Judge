import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hintsService } from '@/services/hints.service';

interface HintChatPanelProps {
  sessionId: string;
  expanded: boolean;
  onToggleExpanded: () => void;
}

export function HintChatPanel({
  sessionId,
  expanded,
  onToggleExpanded,
}: HintChatPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [draft, expanded]);

  const historyQuery = useQuery({
    queryKey: ['hints', sessionId],
    queryFn: () => hintsService.list(sessionId),
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => hintsService.send(sessionId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hints', sessionId] });
      setDraft('');
    },
  });

  const messages = historyQuery.data ?? [];

  useEffect(() => {
    if (!expanded) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, sendMutation.isPending, expanded]);

  const trySend = () => {
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    trySend();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      trySend();
    }
  };

  return (
    <div className="flex flex-col h-full rounded border border-gray-300 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50 hover:bg-gray-100 text-left shrink-0"
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </span>
          <span className="text-sm font-medium text-gray-700">Ask the Coach</span>
          <span className="text-[11px] text-gray-500">
            for hints or clarifications
          </span>
          {messages.length > 0 && (
            <span className="text-[10px] text-gray-500 tabular-nums">
              · {messages.length} message{messages.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <>
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3 text-sm"
          >
            {historyQuery.isPending && (
              <div className="text-xs text-gray-500">Loading…</div>
            )}

            {!historyQuery.isPending && messages.length === 0 && (
              <div className="text-xs text-gray-500 italic">
                No messages yet. Ask something like "What's the first thing I should pin down?"
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg bg-blue-600 text-white px-3 py-2 whitespace-pre-wrap">
                    {m.prompt}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-lg bg-gray-100 text-gray-900 px-3 py-2 whitespace-pre-wrap">
                    {m.response}
                  </div>
                </div>
              </div>
            ))}

            {sendMutation.isPending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-100 text-gray-500 px-3 py-2 italic">
                  Thinking…
                </div>
              </div>
            )}

            {sendMutation.isError && (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                Failed to get hint: {(sendMutation.error as Error).message}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-gray-200 p-2 shrink-0">
            <div className="flex items-stretch rounded border border-gray-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Ask a clarifying question… (Enter to send, Shift+Enter for newline)"
                className="flex-1 bg-transparent px-2 py-1.5 text-sm resize-none focus:outline-none max-h-40 overflow-y-auto leading-snug"
                disabled={sendMutation.isPending}
              />
              <button
                type="submit"
                disabled={!draft.trim() || sendMutation.isPending}
                aria-label="Send message"
                title="Send (Enter)"
                className="self-end m-1 inline-flex items-center justify-center w-7 h-7 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-3.5 h-3.5"
                  aria-hidden="true"
                >
                  <path d="M3.4 20.4 21 12 3.4 3.6c-.3-.1-.7.2-.6.5L5 11l11 1-11 1-2.2 6.9c-.1.3.3.6.6.5Z" />
                </svg>
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
