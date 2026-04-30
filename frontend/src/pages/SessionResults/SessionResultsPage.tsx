import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsService } from '@/services/sessions.service';
import { snapshotsService } from '@/services/snapshots.service';
import { evaluationsService } from '@/services/evaluations.service';
import { rubricsService } from '@/services/rubrics.service';
import { ScoreBreakdown } from '@/components/ScoreBreakdown';
import { PhaseEvaluation, SignalResult } from '@/types/evaluation';
import { Rubric, RubricSignal, WeightTier } from '@/types/rubric';

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

export function SessionResultsPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [planMdExpanded, setPlanMdExpanded] = useState(false);

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

  const rubricVersion = sessionQuery.data?.rubricVersion;
  const rubricQuery = useQuery({
    queryKey: ['rubric', rubricVersion, 'plan'],
    queryFn: () => rubricsService.get(rubricVersion!, 'plan'),
    enabled: !!rubricVersion,
  });

  const reEvalMutation = useMutation({
    mutationFn: () => evaluationsService.runForSession(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evals', id] });
    },
  });

  const planEval = useMemo<PhaseEvaluation | undefined>(
    () => evalsQuery.data?.find((e) => e.phase === 'plan'),
    [evalsQuery.data],
  );

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
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 text-xs">
            <Link to="/home" className="text-blue-600 hover:underline">
              ← Home
            </Link>
            <span className="px-2 py-0.5 rounded uppercase tracking-wide bg-gray-100 text-gray-700">
              {session.status}
            </span>
            <span className="text-gray-500">rubric: {session.rubricVersion}</span>
          </div>
          <h2 className="text-xl font-semibold mt-2">Session results</h2>
          <p className="text-xs text-gray-500 mt-1">id: {session.id}</p>
        </div>
        <button
          type="button"
          onClick={() => reEvalMutation.mutate()}
          disabled={reEvalMutation.isPending}
          className="rounded bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {reEvalMutation.isPending ? 'Re-evaluating…' : 'Re-evaluate'}
        </button>
      </header>

      <section>
        <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
          Question
        </h3>
        <div className="rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap font-mono">
          {session.prompt}
        </div>
      </section>

      {reEvalMutation.isError && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Re-evaluation failed: {(reEvalMutation.error as Error).message}
        </div>
      )}

      {!planEval ? (
        session.status === 'abandoned' ? (
          <div className="rounded border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            This session was cancelled — no evaluation was generated. You can still
            run one by clicking <strong>Re-evaluate</strong>.
          </div>
        ) : (
          <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Not yet evaluated. Click <strong>Re-evaluate</strong> to score this session.
          </div>
        )
      ) : (
        <PlanEvaluationView evaluation={planEval} rubric={rubricQuery.data} />
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
          <div className="text-5xl font-semibold tabular-nums">
            {formatScore(evaluation.score)}
            <span className="text-base text-gray-400 font-normal"> / 5</span>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Evaluated {new Date(evaluation.evaluatedAt).toLocaleString()}
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
            Top actions
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
          />
          <SignalGroup
            title="Bad signals — presence is negative; CRITICAL ones cap the final score"
            signals={badSignals}
            results={evaluation.signalResults}
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
}: {
  title: string;
  signals: RubricSignal[];
  results: Record<string, SignalResult>;
}) {
  return (
    <section>
      <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
        {title} ({signals.length})
      </h3>
      <div className="rounded border border-gray-200 divide-y divide-gray-200 bg-white">
        {signals.map((s) => (
          <SignalRow key={s.id} signal={s} llmResult={results[s.id]} />
        ))}
      </div>
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
