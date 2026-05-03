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

function pointsFor(kind: ResultKind, weight: number): number {
  if (kind === 'hit') return weight;
  if (kind === 'partial') return weight / 2;
  return 0;
}

// Bad-MISS uses gray (not red) because not firing a bad signal is a positive outcome.
function buildPolarityPie(
  signals: RubricSignal[],
  results: Record<string, SignalResult>,
  polarity: 'good' | 'bad',
): Array<{ name: string; value: number; fill: string }> {
  const counts: Record<ResultKind, number> = {
    hit: 0,
    partial: 0,
    miss: 0,
    cannot_evaluate: 0,
    not_evaluated: 0,
  };
  for (const s of signals) counts[classifyResult(s, results)]++;
  const skipped = counts.cannot_evaluate + counts.not_evaluated;

  if (polarity === 'good') {
    return [
      { name: 'Hit', value: counts.hit, fill: '#15803d' }, // green-700
      { name: 'Partial', value: counts.partial, fill: '#86efac' }, // green-300
      { name: 'Miss', value: counts.miss, fill: '#9ca3af' }, // gray-400
      { name: 'N/A', value: skipped, fill: '#e5e7eb' }, // gray-200
    ].filter((d) => d.value > 0);
  }
  return [
    { name: 'Fired (HIT)', value: counts.hit, fill: '#b91c1c' }, // red-700
    { name: 'Partial fire', value: counts.partial, fill: '#fca5a5' }, // red-300
    { name: 'Didn’t fire', value: counts.miss, fill: '#9ca3af' }, // gray-400
    { name: 'N/A', value: skipped, fill: '#e5e7eb' }, // gray-200
  ].filter((d) => d.value > 0);
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
      max: 0,
    };
    for (const sig of tierSignals) {
      const kind = classifyResult(sig, results);
      stats[kind]++;
      stats.earned += pointsFor(kind, weightValues[tier]);
      // Skipped signals don't contribute to max so they don't drag the % down.
      if (kind !== 'cannot_evaluate') {
        stats.max += weightValues[tier];
      }
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

  const goodHitCount = goodTiers.reduce((acc, t) => acc + t.hit, 0);
  const goodPartial = goodTiers.reduce((acc, t) => acc + t.partial, 0);
  const goodCreditedCount = goodHitCount + goodPartial;
  const goodTotalCount = goodSignals.length;

  const badHitCount = badTiers.reduce((acc, t) => acc + t.hit, 0);
  const badPartial = badTiers.reduce((acc, t) => acc + t.partial, 0);
  const badFiredCount = badHitCount + badPartial;
  const badTotalCount = badSignals.length;
  const badMaxPenalty = badTiers.reduce((acc, t) => acc + t.max, 0);
  const badPenalty = badTiers.reduce((acc, t) => acc + t.earned, 0);

  const totalPartial = goodPartial + badPartial;

  const goodPieData = useMemo(
    () => buildPolarityPie(goodSignals, evaluation.signalResults, 'good'),
    [goodSignals, evaluation.signalResults],
  );
  const badPieData = useMemo(
    () => buildPolarityPie(badSignals, evaluation.signalResults, 'bad'),
    [badSignals, evaluation.signalResults],
  );

  const perSignalData = useMemo(() => {
    const colorFor = (polarity: 'good' | 'bad', kind: ResultKind): string => {
      if (kind !== 'hit' && kind !== 'partial') return '#d1d5db'; // gray-300
      return polarity === 'good' ? '#16a34a' : '#dc2626';
    };

    const all = rubric.signals.map((s) => {
      const result = evaluation.signalResults[s.id] as SignalResult | undefined;
      const kind = classifyResult(s, evaluation.signalResults);
      const max = rubric.weightValues[s.weight];
      const earned = pointsFor(kind, max);
      return {
        id: s.id,
        shortId: s.id.length > 22 ? s.id.slice(0, 20) + '…' : s.id,
        polarity: s.polarity,
        weight: s.weight as WeightTier,
        max,
        earned,
        kind,
        earnedColor: colorFor(s.polarity, kind),
        judgmentLabel: RESULT_LABEL[kind],
        description: s.description,
        evidence: result?.evidence ?? '',
      };
    });
    return all.sort((a, b) => {
      if (a.polarity !== b.polarity) return a.polarity === 'good' ? -1 : 1;
      if (a.max !== b.max) return b.max - a.max;
      return a.id.localeCompare(b.id);
    });
  }, [rubric.signals, evaluation.signalResults, rubric.weightValues]);

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
        Score breakdown
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="grid grid-cols-1 gap-3">
          <Card
            title="Good signals — credited / total"
            subtitle="credited = signals judged HIT or PARTIAL"
          >
            <div className="text-3xl font-semibold tabular-nums text-emerald-700">
              {goodCreditedCount}
              <span className="text-base text-gray-400 font-normal"> / {goodTotalCount}</span>
              <span className="ml-2 text-sm text-gray-500 font-normal">
                ({goodHitCount} HIT · {goodPartial} PARTIAL)
              </span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              Weighted: {goodTotal.earned.toFixed(1)} / {goodTotal.max} ({goodPct.toFixed(0)}%)
            </div>
          </Card>
          <Card
            title="Bad signals — fired / total"
            subtitle="fired = signals judged HIT or PARTIAL on a bad signal"
          >
            <div className="text-3xl font-semibold tabular-nums text-rose-700">
              {badFiredCount}
              <span className="text-base text-gray-400 font-normal"> / {badTotalCount}</span>
              <span className="ml-2 text-sm text-gray-500 font-normal">
                ({badHitCount} HIT · {badPartial} PARTIAL)
              </span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              Weighted penalty: {badPenalty.toFixed(1)} / {badMaxPenalty}
            </div>
          </Card>
          <Card
            title="Partial hits — total / overall"
            subtitle="signals judged PARTIAL — half credit (good) or half penalty (bad)"
          >
            <div className="text-3xl font-semibold tabular-nums text-yellow-700">
              {totalPartial}
              <span className="text-base text-gray-400 font-normal"> / {goodTotalCount + badTotalCount}</span>
              <span className="ml-2 text-sm text-gray-500 font-normal">
                ({goodPartial} good · {badPartial} bad)
              </span>
            </div>
          </Card>
        </div>

        <div className="rounded border border-gray-300 bg-white p-3 flex flex-col">
          <div className="text-xs font-medium text-gray-700 mb-1">
            Coverage — how the LLM judged each rubric signal, split by polarity
          </div>
          <div className="text-[11px] text-gray-500 mb-2">
            Each pie counts every signal in its polarity exactly once. Slice
            sizes show what happened: HIT, PARTIAL, MISS, or N/A
            (skipped/not-evaluated).
          </div>
          <div className="flex-1 min-h-[260px] grid grid-cols-2 gap-2">
            <PolarityPie
              title={`Good signals (${goodSignals.length})`}
              data={goodPieData}
            />
            <PolarityPie
              title={`Bad signals (${badSignals.length})`}
              data={badPieData}
            />
          </div>
        </div>
      </div>

      <div className="rounded border border-gray-300 bg-white p-3">
        <div className="text-xs font-medium text-gray-700 mb-1">
          Per-criterion: weight vs earned ({rubric.signals.length} rubric criteria)
        </div>
        <div className="text-[11px] text-gray-500 mb-2 leading-snug">
          Each signal has two bars. The gray bar = full weight (what's at stake).
          The colored bar = what was earned/incurred — height is the full weight on
          HIT, half on PARTIAL, 0 on MISS. Color rules:{' '}
          <span className="font-semibold text-emerald-700">green</span> = good
          signal credited (HIT or PARTIAL),{' '}
          <span className="font-semibold text-rose-700">red</span> = bad signal
          fired (HIT or PARTIAL),{' '}
          <span className="font-semibold text-gray-500">gray</span> = miss / not
          evaluated.
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart
            data={perSignalData}
            margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
          >
            <XAxis
              dataKey="shortId"
              angle={-50}
              textAnchor="end"
              interval={0}
              tick={({ x, y, payload }) => {
                const d = perSignalData.find((p) => p.shortId === payload.value);
                const isBad = d?.polarity === 'bad';
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0}
                      y={0}
                      dy={4}
                      textAnchor="end"
                      transform="rotate(-50)"
                      fontSize={10}
                      fill={isBad ? '#be123c' : '#374151'}
                    >
                      {isBad ? `↓ ${payload.value}` : payload.value}
                    </text>
                  </g>
                );
              }}
              height={100}
            />
            <YAxis
              allowDecimals
              tick={{ fontSize: 11 }}
              label={{ value: 'Points', angle: -90, position: 'insideLeft', fontSize: 11 }}
            />
            <Tooltip content={<PerSignalTooltip />} />
            <Legend />
            <Bar dataKey="max" name="Max possible" fill="#d1d5db" />
            <Bar dataKey="earned" name="Earned / incurred">
              {perSignalData.map((d, i) => (
                <Cell key={i} fill={d.earnedColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function PerSignalTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PerSignalDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isBad = d.polarity === 'bad';
  return (
    <div className="bg-white border border-gray-300 rounded shadow p-2 text-xs max-w-xs">
      <div className="font-medium font-mono text-gray-900">{d.id}</div>
      <div className="text-gray-500 mt-0.5">
        polarity:{' '}
        <span className={`font-medium ${isBad ? 'text-rose-700' : 'text-emerald-700'}`}>
          {d.polarity}
        </span>{' '}
        · weight: <span className="uppercase">{d.weight}</span> ({d.max} pts) ·{' '}
        judgment:{' '}
        <span className="font-medium" style={{ color: d.earnedColor }}>
          {d.judgmentLabel}
        </span>
      </div>
      <div className="mt-1 text-gray-800">
        {isBad ? 'Penalty incurred' : 'Earned'}{' '}
        <span className="font-semibold">{d.earned}</span> of {d.max}
        {isBad && d.kind === 'miss' && (
          <span className="ml-1 text-emerald-700">(penalty avoided ✓)</span>
        )}
      </div>
      {d.description && (
        <div className="mt-1 text-gray-600 leading-snug">{d.description}</div>
      )}
      {d.evidence && (
        <div className="mt-1 italic text-gray-600 leading-snug border-l-2 border-gray-200 pl-2">
          {d.evidence}
        </div>
      )}
    </div>
  );
}

interface PerSignalDatum {
  id: string;
  shortId: string;
  polarity: 'good' | 'bad';
  weight: WeightTier;
  max: number;
  earned: number;
  kind: ResultKind;
  earnedColor: string;
  judgmentLabel: string;
  description: string;
  evidence: string;
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

function PolarityPie({
  title,
  data,
}: {
  title: string;
  data: Array<{ name: string; value: number; fill: string }>;
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  return (
    <div className="flex flex-col">
      <div className="text-[11px] font-medium text-gray-700 text-center">{title}</div>
      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[11px] text-gray-400">
          No signals
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={60}
              label={(entry) => `${entry.value}`}
              labelLine={false}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [`${value}`, name]}
            />
            <Legend
              verticalAlign="bottom"
              iconSize={8}
              wrapperStyle={{ fontSize: '10px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
