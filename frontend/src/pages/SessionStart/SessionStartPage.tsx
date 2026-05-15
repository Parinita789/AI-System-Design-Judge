import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services/questions.service';
import { useSessionStore } from '@/store/sessionStore';
import { describeError } from '@/lib/error';
import {
  QUESTION_KIND_LABELS,
  QUESTION_KINDS,
  QuestionKind,
  SENIORITIES,
  Seniority,
} from '@/types/question';

const MIN_PROMPT_LENGTH = 10;

const AGENTIC_VOCAB = /\b(agent|agents|agentic|llm|llms|ai\s|ai-|tool[\s-]?use|chatbot|copilot|gpt|rag|retrieval[\s-]?augmented)\b/i;
const BUILDABLE_VOCAB = /\b(build|implement|ship|prototype|in\s+(?:1|one)\s*hour|live\s*demo)\b/i;

function classifyKind(prompt: string): QuestionKind {
  const isAgentic = AGENTIC_VOCAB.test(prompt);
  const isBuildable = BUILDABLE_VOCAB.test(prompt);
  if (isAgentic && isBuildable) return 'agentic_build';
  if (isAgentic) return 'agentic_design';
  return 'traditional_design';
}

const KIND_DESCRIPTIONS: Record<QuestionKind, string> = {
  traditional_design: 'Production-scale system, no LLM/agent. Plan only — no build phase.',
  agentic_design: 'AI/agent system, design-only. Plan only — no build phase.',
  agentic_build: '1-hour buildable agent. Plan + CLI-watched build phase.',
};

export function SessionStartPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActive = useSessionStore((s) => s.setActive);
  const [prompt, setPrompt] = useState('');
  const [userKind, setUserKind] = useState<QuestionKind | null>(null);
  const [seniority, setSeniority] = useState<Seniority>('senior');

  const trimmed = prompt.trim();
  const inferredKind = useMemo(
    () => (trimmed ? classifyKind(trimmed) : null),
    [trimmed],
  );
  const effectiveKind = userKind ?? inferredKind;

  const mutation = useMutation({
    mutationFn: (p: { prompt: string; kind: QuestionKind | null; seniority: Seniority }) =>
      questionsService.create({
        prompt: p.prompt,
        ...(p.kind ? { kind: p.kind } : {}),
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
    mutation.mutate({ prompt: trimmed, kind: effectiveKind, seniority });
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

        {effectiveKind && (
          <KindPicker
            inferred={inferredKind}
            effective={effectiveKind}
            isOverride={userKind !== null}
            onPick={(k) => setUserKind(k)}
            onClearOverride={() => setUserKind(null)}
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
            Failed to start session: {describeError(mutation.error)}
          </div>
        )}
      </form>
    </div>
  );
}

function KindPicker({
  inferred,
  effective,
  isOverride,
  onPick,
  onClearOverride,
  disabled,
}: {
  inferred: QuestionKind | null;
  effective: QuestionKind;
  isOverride: boolean;
  onPick: (k: QuestionKind) => void;
  onClearOverride: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gray-600">
          {isOverride ? 'Kind (overridden):' : 'Detected kind:'}
        </span>
        <span className="inline-block rounded border border-blue-300 bg-blue-100 text-blue-900 px-1.5 py-0.5 font-semibold uppercase tracking-wide">
          {effective.replace(/_/g, ' ')}
        </span>
        <span className="text-gray-700">{KIND_DESCRIPTIONS[effective]}</span>
        {isOverride && inferred && inferred !== effective && (
          <button
            type="button"
            onClick={onClearOverride}
            disabled={disabled}
            className="ml-auto text-gray-500 hover:text-gray-800 disabled:text-gray-300"
            title="Drop my override; auto-detect from the prompt"
          >
            (auto)
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {QUESTION_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            disabled={disabled}
            className={`rounded px-2 py-1 text-[11px] font-medium border transition-colors ${
              k === effective
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {QUESTION_KIND_LABELS[k]}
          </button>
        ))}
      </div>
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
