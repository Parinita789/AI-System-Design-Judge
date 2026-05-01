import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services/questions.service';
import { useSessionStore } from '@/store/sessionStore';
import { Mode, Seniority, SENIORITIES } from '@/types/question';

const MIN_PROMPT_LENGTH = 10;

// Mirror of backend mode-classifier.ts. Kept here so the user sees the
// inferred mode update live as they type. Backend re-infers if the
// field is absent at create time, so a slight drift between client and
// server only affects the on-screen chip, not the rubric routing.
const PRODUCTION_SCALE_PATTERNS: RegExp[] = [
  /\b\d+\s*[kmb]\b\s*(req|request|requests|qps|rps|tps|user|users|event|events|message|messages|connection|connections|eps|operations|ops)/i,
  /\b\d+\s*(million|billion)\b/i,
  /\b(distributed system|multi[- ]region|globally distributed|horizontal(ly)? scal|shard(ing|ed)?|geo[- ]?replicat)/i,
];
function classifyMode(prompt: string): Mode {
  return PRODUCTION_SCALE_PATTERNS.some((re) => re.test(prompt)) ? 'design' : 'build';
}

export function SessionStartPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActive = useSessionStore((s) => s.setActive);
  const [prompt, setPrompt] = useState('');
  // null = follow the inferred mode; otherwise pin a user override.
  const [userMode, setUserMode] = useState<Mode | null>(null);
  const [seniority, setSeniority] = useState<Seniority>('senior');

  const trimmed = prompt.trim();
  const inferredMode = useMemo(
    () => (trimmed ? classifyMode(trimmed) : null),
    [trimmed],
  );
  const effectiveMode = userMode ?? inferredMode;

  const mutation = useMutation({
    mutationFn: (p: { prompt: string; mode: Mode | null; seniority: Seniority }) =>
      questionsService.create({
        prompt: p.prompt,
        // Send mode only when we have one; backend falls back to its
        // own classifier when the field is absent.
        ...(p.mode ? { mode: p.mode } : {}),
        seniority: p.seniority,
      }),
    onSuccess: ({ session }) => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      setActive(session.id, session.startedAt);
      navigate(`/sessions/${session.id}/active`);
    },
  });

  const tooShort = trimmed.length > 0 && trimmed.length < MIN_PROMPT_LENGTH;
  const canSubmit = trimmed.length >= MIN_PROMPT_LENGTH && !mutation.isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({ prompt: trimmed, mode: effectiveMode, seniority });
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

        {effectiveMode && (
          <ModeChip
            inferred={inferredMode}
            effective={effectiveMode}
            isOverride={userMode !== null}
            onPick={(m) => setUserMode(m)}
            onClearOverride={() => setUserMode(null)}
            disabled={mutation.isPending}
          />
        )}

        <SeniorityPicker
          value={seniority}
          onPick={setSeniority}
          disabled={mutation.isPending}
        />

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

const MODE_LABEL: Record<Mode, string> = {
  build: 'Buildable in this session',
  design: 'Design at scale (interview)',
};

function ModeChip({
  inferred,
  effective,
  isOverride,
  onPick,
  onClearOverride,
  disabled,
}: {
  inferred: Mode | null;
  effective: Mode;
  isOverride: boolean;
  onPick: (m: Mode) => void;
  onClearOverride: () => void;
  disabled: boolean;
}) {
  const otherMode: Mode = effective === 'build' ? 'design' : 'build';
  return (
    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs flex items-center gap-2 flex-wrap">
      <span className="text-gray-600">
        {isOverride ? 'Mode (overridden):' : 'Detected mode:'}
      </span>
      <span
        className={`inline-block rounded border px-1.5 py-0.5 font-semibold uppercase tracking-wide ${
          effective === 'build'
            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
            : 'bg-amber-100 text-amber-800 border-amber-300'
        }`}
      >
        {effective}
      </span>
      <span className="text-gray-700">{MODE_LABEL[effective]}</span>
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPick(otherMode)}
          disabled={disabled}
          className="text-blue-600 hover:underline disabled:text-gray-400"
        >
          Use “{MODE_LABEL[otherMode]}” instead
        </button>
        {isOverride && inferred && (
          <button
            type="button"
            onClick={onClearOverride}
            disabled={disabled}
            className="text-gray-500 hover:text-gray-800 disabled:text-gray-300"
            title="Drop my override; auto-detect from the prompt"
          >
            (auto)
          </button>
        )}
      </span>
    </div>
  );
}

const SENIORITY_LABEL: Record<Seniority, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  staff: 'Staff',
};

function SeniorityPicker({
  value,
  onPick,
  disabled,
}: {
  value: Seniority;
  onPick: (s: Seniority) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-700 font-medium">Seniority:</span>
      <div className="inline-flex rounded border border-gray-300 overflow-hidden">
        {SENIORITIES.map((level, i) => {
          const isActive = value === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => onPick(level)}
              disabled={disabled}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-white'
              } ${i > 0 ? 'border-l border-gray-300' : ''}`}
            >
              {SENIORITY_LABEL[level]}
            </button>
          );
        })}
      </div>
      <span className="text-[11px] text-gray-500">
        Calibrates the rubric weights and the LLM's per-signal expectations.
      </span>
    </div>
  );
}
