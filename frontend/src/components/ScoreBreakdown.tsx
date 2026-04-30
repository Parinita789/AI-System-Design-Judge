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
      max: 0,
    };
    for (const sig of tierSignals) {
      const kind = classifyResult(sig, results);
      stats[kind]++;
      stats.earned += pointsFor(kind, weightValues[tier]);
      // Skipped signals (LLM said "not applicable to this question") don't
      // contribute to max — they're excluded from the % so they don't
      // unfairly drag the score down.
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

  const badFiredCount = badTiers.reduce((acc, t) => acc + t.hit + t.partial, 0);
  const badMaxPenalty = badTiers.reduce((acc, t) => acc + t.max, 0);
  const badPenalty = badTiers.reduce((acc, t) => acc + t.earned, 0);

  const goodPartial = goodTiers.reduce((acc, t) => acc + t.partial, 0);
  const badPartial = badTiers.reduce((acc, t) => acc + t.partial, 0);
  const totalPartial = goodPartial + badPartial;

  // Pie data — buckets aligned with the bar chart's color rules so the
  // two charts tell a consistent story:
  //   green  = good signal credited (HIT/PARTIAL, weight ≠ medium)
  //   red    = bad signal fired     (HIT/PARTIAL, weight ≠ medium)
  //   yellow = medium-weight fired  (HIT/PARTIAL, any polarity)
  //   gray   = not credited / not fired (MISS / N/A / not-evaluated)
  const pieData = useMemo(() => {
    const buckets = {
      goodCredited: 0,
      badFired: 0,
      mediumFired: 0,
      notCredited: 0,
    };
    for (const sig of rubric.signals) {
      const kind = classifyResult(sig, evaluation.signalResults);
      const fired = kind === 'hit' || kind === 'partial';
      if (!fired) {
        buckets.notCredited++;
        continue;
      }
      if (sig.weight === 'medium') buckets.mediumFired++;
      else if (sig.polarity === 'good') buckets.goodCredited++;
      else buckets.badFired++;
    }
    return [
      { name: 'Good credited', value: buckets.goodCredited, fill: '#16a34a' },
      { name: 'Bad fired', value: buckets.badFired, fill: '#dc2626' },
      { name: 'Medium-weight fired', value: buckets.mediumFired, fill: '#eab308' },
      { name: 'Not credited / missed', value: buckets.notCredited, fill: '#d1d5db' },
    ].filter((d) => d.value > 0);
  }, [rubric.signals, evaluation.signalResults]);

  // Per-signal grouped bar data: ALL rubric criteria (good + bad).
  // Color rules for the "earned" bar (HIT and PARTIAL share a color —
  // bar height already conveys partial vs full credit):
  //   - medium-weight signal, judged HIT or PARTIAL → yellow (any polarity)
  //   - good polarity, HIT or PARTIAL, weight ≠ medium → green
  //   - bad  polarity, HIT or PARTIAL, weight ≠ medium → red
  //   - MISS / N/A / not-evaluated → neutral gray
  const perSignalData = useMemo(() => {
    const colorFor = (
      polarity: 'good' | 'bad',
      weight: WeightTier,
      kind: ResultKind,
    ): string => {
      if (kind !== 'hit' && kind !== 'partial') return '#d1d5db'; // gray-300
      if (weight === 'medium') return '#eab308'; // yellow-500
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
        earnedColor: colorFor(s.polarity, s.weight as WeightTier, kind),
        judgmentLabel: RESULT_LABEL[kind],
        description: s.description,
        evidence: result?.evidence ?? '',
      };
    });
    // Sort: good first, then bad. Within each polarity: heaviest weight first,
    // then alphabetical for stable ordering.
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

      {/* Top row: score cards on the left, pie chart on the right. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="grid grid-cols-1 gap-3">
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
          <Card
            title="Partial hits"
            subtitle="signals judged PARTIAL — half credit (good) or half penalty (bad)"
          >
            <div className="text-3xl font-semibold tabular-nums text-yellow-700">
              {totalPartial}
              <span className="ml-2 text-sm text-gray-500 font-normal">
                ({goodPartial} good · {badPartial} bad)
              </span>
            </div>
          </Card>
        </div>

        <div className="rounded border border-gray-300 bg-white p-3 flex flex-col">
          <div className="text-xs font-medium text-gray-700 mb-1">
            Coverage — how the LLM judged each of the {rubric.signals.length} rubric signals
          </div>
          {pieData.length === 0 ? (
            <div className="text-xs text-gray-500 py-8 text-center flex-1">No data</div>
          ) : (
            <div className="flex-1 min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
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
            </div>
          )}
        </div>
      </div>

      {/* Per-criterion: ALL good + bad signals, full-width row. */}
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
          <span className="font-semibold text-yellow-700">yellow</span> =
          medium-weight signal credited/fired (any polarity),{' '}
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

// Custom tooltip for the per-signal grouped bar — surfaces the rubric
// description + LLM judgment + evidence quote on hover.
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
