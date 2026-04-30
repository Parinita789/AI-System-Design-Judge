import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hintsService } from '@/services/hints.service';

interface HintChatPanelProps {
  sessionId: string;
}

export function HintChatPanel({ sessionId }: HintChatPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to bottom when new content lands.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, sendMutation.isPending]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed || sendMutation.isPending) return;
      sendMutation.mutate(trimmed);
    }
  };

  return (
    <div className="flex flex-col h-full rounded border border-gray-300 bg-white">
      <header className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-medium text-gray-700">Coach</h3>
        <p className="text-[11px] text-gray-500">
          Hints only — no full solutions. Ask clarifying questions.
        </p>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3 text-sm">
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

      <form onSubmit={handleSubmit} className="border-t border-gray-200 p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="Ask a clarifying question…  (Enter to send, Shift+Enter for newline)"
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={sendMutation.isPending}
        />
        <div className="flex justify-end mt-1">
          <button
            type="submit"
            disabled={!draft.trim() || sendMutation.isPending}
            className="rounded bg-blue-600 text-white px-3 py-1 text-xs font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
