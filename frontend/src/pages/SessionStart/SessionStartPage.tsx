import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services/questions.service';
import { useSessionStore } from '@/store/sessionStore';

const MIN_PROMPT_LENGTH = 10;

export function SessionStartPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActive = useSessionStore((s) => s.setActive);
  const [prompt, setPrompt] = useState('');

  const mutation = useMutation({
    mutationFn: (p: string) => questionsService.create({ prompt: p }),
    onSuccess: ({ session }) => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      setActive(session.id, session.startedAt);
      navigate(`/sessions/${session.id}/active`);
    },
  });

  const trimmed = prompt.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_PROMPT_LENGTH;
  const canSubmit = trimmed.length >= MIN_PROMPT_LENGTH && !mutation.isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate(trimmed);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold mb-1">Practice an AI System Design Question</h2>
      <p className="text-sm text-gray-600 mb-4">
        Paste the system-design question you want to work on. Once you start, you'll land in the
        editor and have a working session.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="block text-sm font-medium mb-1">Question</span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder="e.g. Design a URL shortener that handles 100M URLs/day with sub-50ms read latency."
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={mutation.isPending}
            autoFocus
          />
          {tooShort && (
            <span className="text-xs text-red-600 mt-1 block">
              Question must be at least {MIN_PROMPT_LENGTH} characters.
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {mutation.isPending ? 'Starting…' : 'Start Session'}
        </button>

        {mutation.isError && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            Failed to start session: {(mutation.error as Error).message}
          </div>
        )}
      </form>
    </div>
  );
}
