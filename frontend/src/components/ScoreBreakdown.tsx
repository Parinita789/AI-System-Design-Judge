import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PhaseEvaluation, SignalResult } from '@/types/evaluation';
import { Rubric, RubricSignal, WeightTier } from '@/types/rubric';

type ResultKind = SignalResult['result'] | 'not_evaluated';

const RESULT_FILL: Record<ResultKind, string> = {
  hit: '#10b981', // emerald-500
  partial: '#f59e0b', // amber-500
  miss: '#9ca3af', // gray-400
  cannot_evaluate: '#d1d5db', // gray-300
  not_evaluated: '#a78bfa', // violet-400
};

const RESULT_LABEL: Record<ResultKind, string> = {
  hit: 'Hit',
  partial: 'Partial',
  miss: 'Miss',
  cannot_evaluate: 'N/A',
  not_evaluated: 'Not Evaluated',
};

const TIERS: WeightTier[] = ['high', 'medium', 'low'];

function classifyResult(
  signal: RubricSignal,
  results: Record<string, SignalResult>,
): ResultKind {
  const r = results[signal.id];
  return r ? r.result : 'not_evaluated';
}

// HIT scores full weight; PARTIAL scores half. MISS / N/A / not_evaluated score 0.
function pointsFor(kind: ResultKind, weight: number): number {
  if (kind === 'hit') return weight;
  if (kind === 'partial') return weight / 2;
  return 0;
}

interface TierStats {
  tier: WeightTier;
  count: number;
  hit: number;
  partial: number;
  miss: number;
  cannot_evaluate: number;
  not_evaluated: number;
  earned: number;
  max: number;
}

function tierStats(
  signals: RubricSignal[],
  results: Record<string, SignalResult>,
  weightValues: Record<WeightTier, number>,
): TierStats[] {
  return TIERS.map((tier) => {
    const tierSignals = signals.filter((s) => s.weight === tier);
    const stats: TierStats = {
      tier,
      count: tierSignals.length,
      hit: 0,
      partial: 0,
      miss: 0,
      cannot_evaluate: 0,
      not_evaluated: 0,
      earned: 0,
      max: tierSignals.length * weightValues[tier],
    };
    for (const sig of tierSignals) {
      const kind = classifyResult(sig, results);
      stats[kind]++;
      stats.earned += pointsFor(kind, weightValues[tier]);
    }
    return stats;
  });
}

export interface ScoreBreakdownProps {
  rubric: Rubric;
  evaluation: PhaseEvaluation;
}

export function ScoreBreakdown({ rubric, evaluation }: ScoreBreakdownProps) {
  const goodSignals = useMemo(
    () => rubric.signals.filter((s) => s.polarity === 'good'),
    [rubric.signals],
  );
  const badSignals = useMemo(
    () => rubric.signals.filter((s) => s.polarity === 'bad'),
    [rubric.signals],
  );

  const goodTiers = useMemo(
    () => tierStats(goodSignals, evaluation.signalResults, rubric.weightValues),
    [goodSignals, evaluation.signalResults, rubric.weightValues],
  );
  const badTiers = useMemo(
    () => tierStats(badSignals, evaluation.signalResults, rubric.weightValues),
    [badSignals, evaluation.signalResults, rubric.weightValues],
  );

  const goodTotal = goodTiers.reduce(
    (acc, t) => ({
      earned: acc.earned + t.earned,
      max: acc.max + t.max,
    }),
    { earned: 0, max: 0 },
  );
  const goodPct = goodTotal.max > 0 ? (goodTotal.earned / goodTotal.max) * 100 : 0;

  const badFiredCount = badTiers.reduce((acc, t) => acc + t.hit + t.partial, 0);
  const badMaxPenalty = badTiers.reduce((acc, t) => acc + t.max, 0);
  const badPenalty = badTiers.reduce((acc, t) => acc + t.earned, 0);

  // Pie data — overall judgment distribution across ALL signals
  const pieData = useMemo(() => {
    const counts: Record<ResultKind, number> = {
      hit: 0,
      partial: 0,
      miss: 0,
      cannot_evaluate: 0,
      not_evaluated: 0,
    };
    for (const sig of rubric.signals) {
      counts[classifyResult(sig, evaluation.signalResults)]++;
    }
    return (Object.keys(counts) as ResultKind[])
      .map((k) => ({ name: RESULT_LABEL[k], value: counts[k], fill: RESULT_FILL[k] }))
      .filter((d) => d.value > 0);
  }, [rubric.signals, evaluation.signalResults]);

  const goodBarData = goodTiers.map((t) => ({
    tier: t.tier.toUpperCase(),
    Hit: t.hit,
    Partial: t.partial,
    Miss: t.miss,
    'N/A': t.cannot_evaluate,
    'Not Evaluated': t.not_evaluated,
  }));
  const badBarData = badTiers.map((t) => ({
    tier: t.tier.toUpperCase(),
    Hit: t.hit,
    Partial: t.partial,
    Miss: t.miss,
    'N/A': t.cannot_evaluate,
    'Not Evaluated': t.not_evaluated,
  }));

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
        Score breakdown
      </h3>

      {/* Totals card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card title="LLM Final Score" subtitle={`${rubric.scoring.scaleMin}–${rubric.scoring.scaleMax} scale`}>
          <div className="text-3xl font-semibold tabular-nums">
            {Number(evaluation.score).toFixed(2)}
            <span className="text-base text-gray-400 font-normal"> / {rubric.scoring.scaleMax}</span>
          </div>
        </Card>
        <Card
          title="Good signals — earned / max"
          subtitle={`${goodSignals.length} signals, weight values H=${rubric.weightValues.high} M=${rubric.weightValues.medium} L=${rubric.weightValues.low}`}
        >
          <div className="text-3xl font-semibold tabular-nums text-emerald-700">
            {goodTotal.earned.toFixed(1)}
            <span className="text-base text-gray-400 font-normal"> / {goodTotal.max}</span>
            <span className="ml-2 text-sm text-gray-500 font-normal">({goodPct.toFixed(0)}%)</span>
          </div>
        </Card>
        <Card
          title="Bad signals — penalties"
          subtitle={`${badSignals.length} possible. fired = HIT or PARTIAL on a bad signal`}
        >
          <div className="text-3xl font-semibold tabular-nums text-rose-700">
            {badFiredCount}
            <span className="text-base text-gray-400 font-normal"> fired</span>
            <span className="ml-2 text-sm text-gray-500 font-normal">
              ({badPenalty.toFixed(1)} / {badMaxPenalty} max penalty)
            </span>
          </div>
        </Card>
      </div>

      {/* Pie + good-tier bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded border border-gray-300 bg-white p-3">
          <div className="text-xs font-medium text-gray-700 mb-1">
            Judgment distribution (all {rubric.signals.length} signals)
          </div>
          {pieData.length === 0 ? (
            <div className="text-xs text-gray-500 py-8 text-center">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                >
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded border border-gray-300 bg-white p-3">
          <div className="text-xs font-medium text-gray-700 mb-1">
            Good signals by weight tier
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={goodBarData}>
              <XAxis dataKey="tier" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Hit" stackId="a" fill={RESULT_FILL.hit} />
              <Bar dataKey="Partial" stackId="a" fill={RESULT_FILL.partial} />
              <Bar dataKey="Miss" stackId="a" fill={RESULT_FILL.miss} />
              <Bar dataKey="N/A" stackId="a" fill={RESULT_FILL.cannot_evaluate} />
              <Bar dataKey="Not Evaluated" stackId="a" fill={RESULT_FILL.not_evaluated} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-tier table */}
      <div className="rounded border border-gray-300 bg-white overflow-hidden">
        <div className="text-xs font-medium text-gray-700 px-3 py-2 border-b border-gray-200">
          Per-tier scoring (good signals)
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Tier</th>
              <th className="text-right px-3 py-1.5 font-medium">Signals</th>
              <th className="text-right px-3 py-1.5 font-medium">Hit</th>
              <th className="text-right px-3 py-1.5 font-medium">Partial</th>
              <th className="text-right px-3 py-1.5 font-medium">Miss</th>
              <th className="text-right px-3 py-1.5 font-medium">Skipped</th>
              <th className="text-right px-3 py-1.5 font-medium">Earned</th>
              <th className="text-right px-3 py-1.5 font-medium">Max</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 tabular-nums">
            {goodTiers.map((t) => (
              <tr key={t.tier}>
                <td className="px-3 py-1.5 font-medium uppercase">{t.tier}</td>
                <td className="text-right px-3 py-1.5">{t.count}</td>
                <td className="text-right px-3 py-1.5 text-emerald-700">{t.hit}</td>
                <td className="text-right px-3 py-1.5 text-amber-700">{t.partial}</td>
                <td className="text-right px-3 py-1.5 text-gray-500">{t.miss}</td>
                <td className="text-right px-3 py-1.5 text-purple-700">{t.not_evaluated}</td>
                <td className="text-right px-3 py-1.5 font-semibold">{t.earned.toFixed(1)}</td>
                <td className="text-right px-3 py-1.5 text-gray-500">{t.max}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className="px-3 py-1.5">TOTAL</td>
              <td className="text-right px-3 py-1.5">{goodSignals.length}</td>
              <td className="text-right px-3 py-1.5 text-emerald-700">
                {goodTiers.reduce((a, t) => a + t.hit, 0)}
              </td>
              <td className="text-right px-3 py-1.5 text-amber-700">
                {goodTiers.reduce((a, t) => a + t.partial, 0)}
              </td>
              <td className="text-right px-3 py-1.5 text-gray-500">
                {goodTiers.reduce((a, t) => a + t.miss, 0)}
              </td>
              <td className="text-right px-3 py-1.5 text-purple-700">
                {goodTiers.reduce((a, t) => a + t.not_evaluated, 0)}
              </td>
              <td className="text-right px-3 py-1.5">{goodTotal.earned.toFixed(1)}</td>
              <td className="text-right px-3 py-1.5 text-gray-500">{goodTotal.max}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bad-tier bar */}
      <div className="rounded border border-gray-300 bg-white p-3">
        <div className="text-xs font-medium text-gray-700 mb-1">
          Bad signals by weight tier (any HIT/PARTIAL is a penalty)
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={badBarData}>
            <XAxis dataKey="tier" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Hit" stackId="a" fill={RESULT_FILL.hit} />
            <Bar dataKey="Partial" stackId="a" fill={RESULT_FILL.partial} />
            <Bar dataKey="Miss" stackId="a" fill={RESULT_FILL.miss} />
            <Bar dataKey="N/A" stackId="a" fill={RESULT_FILL.cannot_evaluate} />
            <Bar dataKey="Not Evaluated" stackId="a" fill={RESULT_FILL.not_evaluated} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-gray-300 bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{title}</div>
      {subtitle && <div className="text-[11px] text-gray-400 mb-1">{subtitle}</div>}
      {children}
    </div>
  );
}
