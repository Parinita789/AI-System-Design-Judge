import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsService } from '@/services/sessions.service';
import { questionsService } from '@/services/questions.service';
import { snapshotsService } from '@/services/snapshots.service';
import { evaluationsService } from '@/services/evaluations.service';
import { rubricsService } from '@/services/rubrics.service';
import { useSessionStore } from '@/store/sessionStore';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { PhaseEvaluation, SignalResult } from '@/types/evaluation';
import { Rubric, RubricSignal, WeightTier } from '@/types/rubric';
import { QuestionWithSessions } from '@/types/question';

type ResultKind = SignalResult['result'] | 'not_evaluated';

const RESULT_STYLES: Record<ResultKind, { label: string; className: string }> = {
  hit: { label: 'HIT', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  partial: { label: 'PARTIAL', className: 'bg-amber-100 text-amber-800 border-amber-300' },
  miss: { label: 'MISS', className: 'bg-gray-100 text-gray-700 border-gray-300' },
  cannot_evaluate: {
    label: 'N/A',
    className: 'bg-gray-50 text-gray-500 border-gray-200',
  },
  not_evaluated: {
    label: 'NOT EVALUATED',
    className: 'bg-purple-50 text-purple-700 border-purple-200',
  },
};

const WEIGHT_STYLES: Record<WeightTier, string> = {
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-gray-50 text-gray-600 border-gray-200',
};

function formatScore(score: number | string): string {
  const n = typeof score === 'string' ? parseFloat(score) : score;
  return Number.isFinite(n) ? n.toFixed(2) : String(score);
}

// < 3 = Failed, [3, 4) = Average, [4, 5) = Good, >= 5 = Great.
function scoreVerdict(score: number | string): { label: string; className: string } {
  const n = typeof score === 'string' ? parseFloat(score) : score;
  if (!Number.isFinite(n)) {
    return { label: '—', className: 'bg-gray-100 text-gray-600 border-gray-300' };
  }
  if (n < 3) return { label: 'Failed', className: 'bg-rose-100 text-rose-800 border-rose-300' };
  if (n < 4) return { label: 'Average', className: 'bg-amber-100 text-amber-800 border-amber-300' };
  if (n < 5) return { label: 'Good', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  return { label: 'Great', className: 'bg-emerald-200 text-emerald-900 border-emerald-400' };
}

export function SessionResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActive = useSessionStore((s) => s.setActive);
  const [planMdExpanded, setPlanMdExpanded] = useState(false);
  // null = "show the latest plan eval"; otherwise pin to a specific historical eval id.
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  // Default: Evaluation history is open when the page loads (it's the
  // primary thing the user wants to see when revisiting an attempted
  // question). Attempts stays collapsed — secondary navigation only.
  const [historyOpen, setHistoryOpen] = useState(true);
  const [attemptsOpen, setAttemptsOpen] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessionsService.get(id!),
    enabled: !!id,
  });

  const evalsQuery = useQuery({
    queryKey: ['evals', id],
    queryFn: () => evaluationsService.listForSession(id!),
    enabled: !!id,
  });

  const snapshotQuery = useQuery({
    queryKey: ['snapshot-latest', id],
    queryFn: () => snapshotsService.latest(id!),
    enabled: !!id,
  });

  // The session response carries the parent question (rubricVersion + prompt).
  const questionId = sessionQuery.data?.questionId;
  const rubricVersion = sessionQuery.data?.question.rubricVersion;
  const rubricQuery = useQuery({
    queryKey: ['rubric', rubricVersion, 'plan'],
    queryFn: () => rubricsService.get(rubricVersion!, 'plan'),
    enabled: !!rubricVersion,
  });

  // Pull the question + every attempt of it (replaces the old lineage query).
  const questionQuery = useQuery({
    queryKey: ['question', questionId],
    queryFn: () => questionsService.get(questionId!),
    enabled: !!questionId,
  });

  const reEvalMutation = useMutation({
    mutationFn: () => evaluationsService.runForSession(id!),
    onSuccess: () => {
      // Drop any pinned historical selection so the new latest auto-loads.
      setSelectedEvalId(null);
      queryClient.invalidateQueries({ queryKey: ['evals', id] });
      queryClient.invalidateQueries({ queryKey: ['question', questionId] });
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });

  // Try-again creates a new Session under the same Question; the backend
  // copies the most-recent plan.md from any prior attempt.
  const retryMutation = useMutation({
    mutationFn: () => questionsService.startAttempt(questionId!),
    onSuccess: (newSession) => {
      setActive(newSession.id, newSession.startedAt);
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({ queryKey: ['question', questionId] });
      navigate(`/sessions/${newSession.id}/active`);
    },
  });

  // Plan evaluations only, newest first (the API already orders desc).
  const planEvals = useMemo<PhaseEvaluation[]>(
    () => (evalsQuery.data ?? []).filter((e) => e.phase === 'plan'),
    [evalsQuery.data],
  );
  // Pinned (selected) eval if its id matches; otherwise the latest.
  const displayedEval = useMemo<PhaseEvaluation | undefined>(() => {
    if (selectedEvalId) {
      const match = planEvals.find((e) => e.id === selectedEvalId);
      if (match) return match;
    }
    return planEvals[0];
  }, [planEvals, selectedEvalId]);

  if (!id) return <div>Missing session id.</div>;
  if (sessionQuery.isPending || evalsQuery.isPending) return <div>Loading…</div>;
  if (sessionQuery.isError) {
    return (
      <div className="text-red-600">
        Failed to load session: {(sessionQuery.error as Error).message}
      </div>
    );
  }

  const session = sessionQuery.data;
  const planMd =
    (snapshotQuery.data?.artifacts as { planMd?: string | null } | null)?.planMd ?? null;

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">Session results</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending || !questionId}
            className="rounded bg-emerald-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            title="Start a new attempt at this question, pre-loaded with this attempt's plan.md"
          >
            {retryMutation.isPending ? 'Starting…' : 'Try again'}
          </button>
          <button
            type="button"
            onClick={() => reEvalMutation.mutate()}
            disabled={reEvalMutation.isPending}
            className="rounded border border-blue-600 text-blue-700 bg-white px-3 py-1.5 text-sm font-medium hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Re-run the LLM evaluator on the same plan.md (overwrites this attempt's score)"
          >
            {reEvalMutation.isPending ? 'Re-evaluating…' : 'Re-evaluate'}
          </button>
        </div>
      </header>

      {retryMutation.isError && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn't start a new attempt: {(retryMutation.error as Error).message}
        </div>
      )}

      {/* Top-of-page collapsible secondary sections.
          Default closed — keep the score breakdown front-and-center. */}
      {planEvals.length > 0 && (
        <CollapsibleSection
          label="Evaluation history"
          count={planEvals.length}
          open={historyOpen}
          onToggle={() => setHistoryOpen((v) => !v)}
        >
          <EvaluationHistorySection
            planEvals={planEvals}
            selectedEvalId={displayedEval?.id ?? null}
            onSelect={setSelectedEvalId}
            isLatest={(evalId) => planEvals[0]?.id === evalId}
            sessionStatus={session.status}
            rubricVersion={session.question.rubricVersion}
          />
        </CollapsibleSection>
      )}
      {(questionQuery.data?.sessions.length ?? 0) > 0 && (
        <CollapsibleSection
          label="Attempts of this question"
          count={questionQuery.data?.sessions.length ?? 0}
          open={attemptsOpen}
          onToggle={() => setAttemptsOpen((v) => !v)}
        >
          <AttemptsSection
            currentSessionId={session.id}
            attempts={questionQuery.data?.sessions ?? []}
            loading={questionQuery.isPending}
          />
        </CollapsibleSection>
      )}

      <section>
        <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
          Question
        </h3>
        <div className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap font-mono">
          {session.question.prompt}
        </div>
      </section>

      {reEvalMutation.isError && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Re-evaluation failed: {(reEvalMutation.error as Error).message}
        </div>
      )}

      {!displayedEval ? (
        session.status === 'abandoned' ? (
          <CancelledEmptyState
            siblings={questionQuery.data?.sessions ?? []}
            currentSessionId={session.id}
          />
        ) : (
          <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Not yet evaluated. Click <strong>Re-evaluate</strong> to score this session.
          </div>
        )
      ) : (
        <PlanEvaluationView evaluation={displayedEval} rubric={rubricQuery.data} />
      )}

      <section>
        <button
          type="button"
          onClick={() => setPlanMdExpanded((v) => !v)}
          className="text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          {planMdExpanded ? '▼' : '▶'} plan.md ({planMd ? planMd.length : 0} chars)
        </button>
        {planMdExpanded && (
          <pre className="mt-2 rounded border border-gray-300 bg-gray-50 p-3 text-xs whitespace-pre-wrap font-mono overflow-x-auto">
            {planMd ?? '(no plan content captured)'}
          </pre>
        )}
      </section>
    </div>
  );
}

function PlanEvaluationView({
  evaluation,
  rubric,
}: {
  evaluation: PhaseEvaluation;
  rubric: Rubric | undefined;
}) {
  const goodSignals = rubric?.signals.filter((s) => s.polarity === 'good') ?? [];
  const badSignals = rubric?.signals.filter((s) => s.polarity === 'bad') ?? [];

  // Signals the LLM returned that don't match any rubric ID — surface them
  // so the user knows the model invented IDs (a common failure mode).
  const extraSignalIds = useMemo(() => {
    if (!rubric) return [];
    const known = new Set(rubric.signals.map((s) => s.id));
    return Object.keys(evaluation.signalResults).filter((id) => !known.has(id));
  }, [rubric, evaluation.signalResults]);

  return (
    <>
      <section className="rounded border border-gray-300 bg-white p-4 flex items-center gap-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Plan score</div>
          <div className="text-5xl font-semibold tabular-nums flex items-baseline gap-3">
            <span>
              {formatScore(evaluation.score)}
              <span className="text-base text-gray-400 font-normal"> / 5</span>
            </span>
            {(() => {
              const verdict = scoreVerdict(evaluation.score);
              return (
                <span
                  className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${verdict.className}`}
                >
                  {verdict.label}
                </span>
              );
            })()}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Evaluated {new Date(evaluation.evaluatedAt).toLocaleString()}
          </div>
        </div>
        {rubric && (
          <CoverageSummary signals={rubric.signals} results={evaluation.signalResults} />
        )}
      </section>

      {rubric && <ScoreBreakdown rubric={rubric} evaluation={evaluation} />}

      {evaluation.feedbackText && (
        <section>
          <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
            Feedback
          </h3>
          <div className="rounded border border-gray-300 bg-white p-3 text-sm whitespace-pre-wrap">
            {evaluation.feedbackText}
          </div>
        </section>
      )}

      {evaluation.topActionableItems.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
            Recommended plan improvements
          </h3>
          <ol className="rounded border border-gray-300 bg-white p-3 text-sm space-y-1 list-decimal list-inside">
            {evaluation.topActionableItems.map((item, i) => (
              <li key={i} className="pl-1">
                {item}
              </li>
            ))}
          </ol>
        </section>
      )}

      {!rubric ? (
        <section>
          <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
            Signals (raw — rubric not loaded)
          </h3>
          <SignalRowsRaw results={evaluation.signalResults} />
        </section>
      ) : (
        <>
          <SignalGroup
            title="Good signals — presence is positive"
            signals={goodSignals}
            results={evaluation.signalResults}
            weightValues={rubric.weightValues}
          />
          <SignalGroup
            title="Bad signals — presence is negative; CRITICAL ones cap the final score"
            signals={badSignals}
            results={evaluation.signalResults}
            weightValues={rubric.weightValues}
          />
          {extraSignalIds.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-purple-700 uppercase tracking-wide mb-2">
                Extra signals returned by the LLM ({extraSignalIds.length}) — not in this rubric
              </h3>
              <div className="rounded border border-purple-200 bg-purple-50/30 divide-y divide-purple-100">
                {extraSignalIds.map((id) => {
                  const sig = evaluation.signalResults[id];
                  const style = RESULT_STYLES[sig.result];
                  return (
                    <div key={id} className="px-3 py-2 flex items-start gap-3">
                      <span
                        className={`shrink-0 mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${style.className}`}
                      >
                        {style.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-mono text-gray-900">{id}</div>
                        {sig.evidence && (
                          <div className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">
                            {sig.evidence}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-500 mt-1 italic">
                Smaller LLMs occasionally invent signal IDs. These are shown for transparency
                but did not contribute to scoring against the rubric.
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}

function CoverageSummary({
  signals,
  results,
}: {
  signals: RubricSignal[];
  results: Record<string, SignalResult>;
}) {
  const counts = { hit: 0, partial: 0, miss: 0, cannot_evaluate: 0, not_evaluated: 0 };
  for (const s of signals) {
    const r = results[s.id];
    if (!r) counts.not_evaluated++;
    else counts[r.result]++;
  }
  return (
    <div className="ml-auto text-xs text-gray-700 leading-relaxed">
      <div className="font-medium text-gray-800 mb-0.5">Coverage ({signals.length} signals)</div>
      <div className="flex gap-3">
        <span className="text-emerald-700">✓ {counts.hit} hit</span>
        <span className="text-amber-700">~ {counts.partial} partial</span>
        <span className="text-gray-500">– {counts.miss} miss</span>
        <span className="text-purple-700">? {counts.not_evaluated} skipped</span>
      </div>
    </div>
  );
}

function SignalGroup({
  title,
  signals,
  results,
  weightValues,
}: {
  title: string;
  signals: RubricSignal[];
  results: Record<string, SignalResult>;
  weightValues: Record<WeightTier, number>;
}) {
  const [open, setOpen] = useState(false);
  // Heaviest signals first, then alphabetical for stable order within a tier.
  const sorted = useMemo(
    () =>
      [...signals].sort((a, b) => {
        const dw = weightValues[b.weight] - weightValues[a.weight];
        if (dw !== 0) return dw;
        return a.id.localeCompare(b.id);
      }),
    [signals, weightValues],
  );
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 uppercase tracking-wide hover:bg-gray-50"
      >
        <span>
          {open ? '▼' : '▶'} {title}
        </span>
        <span className="text-[11px] font-normal normal-case text-gray-500">
          {signals.length} {signals.length === 1 ? 'signal' : 'signals'}
        </span>
      </button>
      {open && (
        <div className="mt-2 rounded border border-gray-200 divide-y divide-gray-200 bg-white">
          {sorted.map((s) => (
            <SignalRow key={s.id} signal={s} llmResult={results[s.id]} />
          ))}
        </div>
      )}
    </section>
  );
}

function SignalRow({
  signal,
  llmResult,
}: {
  signal: RubricSignal;
  llmResult: SignalResult | undefined;
}) {
  const kind: ResultKind = llmResult ? llmResult.result : 'not_evaluated';
  const resultStyle = RESULT_STYLES[kind];
  return (
    <div className="px-3 py-2 flex items-start gap-3">
      <span
        className={`shrink-0 mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide whitespace-nowrap ${resultStyle.className}`}
      >
        {resultStyle.label}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-mono text-gray-900">{signal.id}</span>
          <span
            className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${WEIGHT_STYLES[signal.weight]}`}
          >
            {signal.weight}
          </span>
          {signal.critical && (
            <span className="inline-block rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-800">
              critical
            </span>
          )}
          {signal.capAtScore !== undefined && (
            <span className="inline-block rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-800">
              caps at {signal.capAtScore}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-700 mt-0.5">{signal.description}</div>
        {llmResult?.evidence && (
          <div className="text-xs text-gray-600 mt-1 italic whitespace-pre-wrap border-l-2 border-gray-200 pl-2">
            {llmResult.evidence}
          </div>
        )}
        {!llmResult && (
          <div className="text-[11px] text-purple-700 mt-1">
            The LLM did not return a judgment for this signal.
          </div>
        )}
      </div>
    </div>
  );
}

function SignalRowsRaw({ results }: { results: Record<string, SignalResult> }) {
  const entries = Object.entries(results);
  return (
    <div className="rounded border border-gray-200 divide-y divide-gray-200">
      {entries.map(([id, sig]) => {
        const style = RESULT_STYLES[sig.result];
        return (
          <div key={id} className="px-3 py-2 flex items-start gap-3">
            <span
              className={`shrink-0 mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-wide ${style.className}`}
            >
              {style.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-mono text-gray-900">{id}</div>
              {sig.evidence && (
                <div className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">
                  {sig.evidence}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AttemptsSection({
  currentSessionId,
  attempts,
  loading,
}: {
  currentSessionId: string;
  attempts: QuestionWithSessions['sessions'];
  loading: boolean;
}) {
  if (loading) {
    return (
      <section>
        <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
          Attempts
        </h3>
        <div className="text-xs text-gray-500">Loading…</div>
      </section>
    );
  }
  if (!attempts.length) return null;

  return (
    <section>
      <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
        Attempts ({attempts.length})
      </h3>
      <div className="rounded border border-gray-300 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium w-10">#</th>
              <th className="text-left px-3 py-1.5 font-medium">When</th>
              <th className="text-left px-3 py-1.5 font-medium">Status</th>
              <th className="text-right px-3 py-1.5 font-medium">Plan score</th>
              <th className="text-right px-3 py-1.5 font-medium w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {attempts.map((a, i) => {
              const planScore = a.phaseEvaluations.find((e) => e.phase === 'plan')?.score;
              const isCurrent = a.id === currentSessionId;
              return (
                <tr key={a.id} className={isCurrent ? 'bg-blue-50' : ''}>
                  <td className="px-3 py-1.5 text-gray-500 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-700">
                    {new Date(a.startedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 text-xs uppercase tracking-wide text-gray-600">
                    {a.status}
                    {isCurrent && (
                      <span className="ml-2 normal-case text-[10px] text-blue-700">
                        (this attempt)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                    {planScore !== undefined && planScore !== null
                      ? formatScore(planScore)
                      : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {!isCurrent && (
                      <Link
                        to={
                          a.status === 'active'
                            ? `/sessions/${a.id}/active`
                            : `/sessions/${a.id}`
                        }
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EvaluationHistorySection({
  planEvals,
  selectedEvalId,
  onSelect,
  isLatest,
  sessionStatus,
  rubricVersion,
}: {
  planEvals: PhaseEvaluation[];
  selectedEvalId: string | null;
  onSelect: (id: string | null) => void;
  isLatest: (id: string) => boolean;
  sessionStatus: string;
  rubricVersion: string;
}) {
  return (
    <section>
      <div className="rounded border border-gray-300 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium w-10">#</th>
              <th className="text-left px-3 py-1.5 font-medium">When</th>
              <th className="text-left px-3 py-1.5 font-medium">Status</th>
              <th className="text-left px-3 py-1.5 font-medium">Rubric</th>
              <th className="text-right px-3 py-1.5 font-medium">Score</th>
              <th className="text-right px-3 py-1.5 font-medium w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {planEvals.map((e, i) => {
              const showing = e.id === selectedEvalId;
              const latest = isLatest(e.id);
              return (
                <tr key={e.id} className={showing ? 'bg-blue-50' : ''}>
                  <td className="px-3 py-1.5 text-gray-500 tabular-nums">
                    {planEvals.length - i}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-700">
                    {new Date(e.evaluatedAt).toLocaleString()}
                    {latest && (
                      <span className="ml-2 normal-case text-[10px] text-emerald-700 uppercase tracking-wide">
                        latest
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="inline-block rounded bg-gray-100 text-gray-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      {sessionStatus}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-600 font-mono">
                    {rubricVersion}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                    {formatScore(e.score)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {showing ? (
                      <span className="text-[11px] text-blue-700">currently shown</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelect(e.id)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View →
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CancelledEmptyState({
  siblings,
  currentSessionId,
}: {
  siblings: QuestionWithSessions['sessions'];
  currentSessionId: string;
}) {
  // Prefer the most recently completed sibling that actually has a plan eval.
  const scoredSibling = [...siblings]
    .filter(
      (s) =>
        s.id !== currentSessionId &&
        s.status === 'completed' &&
        s.phaseEvaluations.some((e) => e.phase === 'plan'),
    )
    .sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )[0];

  return (
    <div className="rounded border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700 space-y-1">
      <div>
        This attempt was cancelled — no evaluation was generated. You can still
        run one by clicking <strong>Re-evaluate</strong>.
      </div>
      {scoredSibling && (
        <div className="text-xs">
          Or jump to the latest scored attempt of this question:{' '}
          <Link
            to={`/sessions/${scoredSibling.id}`}
            className="text-blue-600 hover:underline"
          >
            view scored attempt →
          </Link>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        <span>
          {open ? '▼' : '▶'} {label}
        </span>
        <span className="text-xs font-normal text-gray-500">
          {count} {count === 1 ? 'entry' : 'entries'}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </section>
  );
}
