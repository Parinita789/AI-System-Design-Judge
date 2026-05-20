import { useQuery } from '@tanstack/react-query';
import { costCapService, type DailySpend } from '@/services/costCap.service';

export const DAILY_SPEND_QUERY_KEY = ['llm-spend', 'today'] as const;

// Auto-refresh interval as a safety net for multi-tab cases — mutations
// already invalidate the key on success, so 60s is a backstop, not the
// primary freshness mechanism.
const BACKGROUND_REFETCH_MS = 60_000;

export function DailySpendBadge() {
  const query = useQuery({
    queryKey: DAILY_SPEND_QUERY_KEY,
    queryFn: () => costCapService.today(),
    refetchInterval: BACKGROUND_REFETCH_MS,
    // Refetch on focus is the cheap way to catch "user came back after a
    // long idle" — by then the daily window may have rolled over.
    refetchOnWindowFocus: true,
  });

  if (query.isPending) {
    return <Skeleton />;
  }
  if (query.isError || !query.data) {
    // Don't draw attention to a failed status read — the cap still
    // enforces server-side. Silent failure beats a scary banner.
    return null;
  }

  return <SpendBar data={query.data} />;
}

function SpendBar({ data }: { data: DailySpend }) {
  const pct = data.capUsd > 0 ? Math.min(100, (data.spentTodayUsd / data.capUsd) * 100) : 0;
  const tier = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
  const barClass = TIER_BAR[tier];
  const textClass = TIER_TEXT[tier];
  const tooltip = `Resets ${formatResetTooltip(data.resetAtUtc)}`;

  return (
    <div className="border-t border-gray-200 px-3 py-2" title={tooltip}>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-600">Daily LLM budget</span>
        <span className={`tabular-nums font-medium ${textClass}`}>
          ${data.spentTodayUsd.toFixed(2)} / ${data.capUsd.toFixed(2)}
        </span>
      </div>
      <div className="h-1.5 rounded bg-gray-200 overflow-hidden">
        <div
          className={`h-full transition-[width] duration-300 ${barClass}`}
          style={{ width: `${pct}%` }}
          aria-label={`${pct.toFixed(0)}% of daily budget used`}
        />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="border-t border-gray-200 px-3 py-2">
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-600">Daily LLM budget</span>
        <span className="text-gray-400">…</span>
      </div>
      <div className="h-1.5 rounded bg-gray-100" />
    </div>
  );
}

const TIER_BAR: Record<'ok' | 'warn' | 'over', string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  over: 'bg-rose-500',
};

const TIER_TEXT: Record<'ok' | 'warn' | 'over', string> = {
  ok: 'text-gray-900',
  warn: 'text-amber-700',
  over: 'text-rose-700',
};

function formatResetTooltip(iso: string): string {
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return 'at the next UTC midnight';
  const diffMs = target - Date.now();
  if (diffMs <= 0) return 'momentarily';
  const totalMinutes = Math.ceil(diffMs / 60_000);
  if (totalMinutes < 60) return `in ${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `in ${hours}h` : `in ${hours}h ${minutes}m`;
}
