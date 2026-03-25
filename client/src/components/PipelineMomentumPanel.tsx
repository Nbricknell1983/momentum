/**
 * PipelineMomentumPanel
 *
 * Portfolio-level momentum view. Shows all active leads ranked by momentum
 * score with stall indicators, urgency flags, hot opportunities, and
 * close-readiness signals.
 *
 * Not tied to a single lead — designed for the pipeline page or admin area.
 */

import { useMemo, useState } from 'react';
import {
  TrendingUp, AlertTriangle, Clock, Flame, Zap, BarChart2,
  ArrowRight, Phone, CheckCircle2, Target, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Lead, STAGE_LABELS } from '@/lib/types';
import {
  derivePipelineMomentumScore, PipelineMomentumScore, MomentumTrajectory,
} from '@/lib/salesIntelligenceTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRAJECTORY_CONFIG: Record<MomentumTrajectory, { icon: typeof TrendingUp; color: string; label: string }> = {
  accelerating: { icon: TrendingUp,    color: 'text-emerald-500', label: 'Accelerating' },
  steady:       { icon: BarChart2,     color: 'text-blue-500',    label: 'Steady' },
  decelerating: { icon: AlertTriangle, color: 'text-amber-500',   label: 'Decelerating' },
  stalled:      { icon: Clock,         color: 'text-orange-500',  label: 'Stalled' },
  at_risk:      { icon: AlertTriangle, color: 'text-red-500',     label: 'At Risk' },
};

const URGENCY_BADGE: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-100 dark:bg-red-950/50',    text: 'text-red-700 dark:text-red-300' },
  high:     { bg: 'bg-orange-100 dark:bg-orange-950/50', text: 'text-orange-700 dark:text-orange-300' },
  medium:   { bg: 'bg-amber-100 dark:bg-amber-950/50',  text: 'text-amber-700 dark:text-amber-300' },
  low:      { bg: 'bg-emerald-100 dark:bg-emerald-950/50', text: 'text-emerald-700 dark:text-emerald-300' },
};

const SCORE_BAR_COLOR = (score: number) =>
  score >= 70 ? 'bg-emerald-400 dark:bg-emerald-500'
  : score >= 40 ? 'bg-amber-400 dark:bg-amber-500'
  : 'bg-red-400 dark:bg-red-500';

type FilterView = 'all' | 'stalled' | 'hot' | 'ready';

// ─── Momentum Row ──────────────────────────────────────────────────────────────

interface MomentumRow {
  lead: Lead;
  score: PipelineMomentumScore;
}

function MomentumLeadRow({ row, onClick }: { row: MomentumRow; onClick?: () => void }) {
  const { lead, score } = row;
  const traj = TRAJECTORY_CONFIG[score.trajectory] || TRAJECTORY_CONFIG.steady;
  const TrajIcon = traj.icon;
  const urg = URGENCY_BADGE[score.urgency] || URGENCY_BADGE.low;

  return (
    <div
      data-testid={`momentum-row-${lead.id}`}
      className="group flex items-center gap-3 p-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 cursor-pointer transition-colors"
      onClick={onClick}
    >
      {/* Score circle */}
      <div className="flex flex-col items-center w-10 flex-shrink-0">
        <span className={[
          'text-lg font-bold tabular-nums',
          score.score >= 70 ? 'text-emerald-600 dark:text-emerald-400'
          : score.score >= 40 ? 'text-amber-600 dark:text-amber-400'
          : 'text-red-600 dark:text-red-400',
        ].join(' ')}>{score.score}</span>
        <div className="w-8 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden mt-1">
          <div className={`h-full rounded-full ${SCORE_BAR_COLOR(score.score)}`} style={{ width: `${score.score}%` }} />
        </div>
      </div>

      {/* Name + stage */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{lead.companyName || lead.name}</p>
          {score.stallLabel && (
            <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/50 px-1.5 py-0.5 rounded flex-shrink-0">
              {score.stallLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{STAGE_LABELS[lead.stage] || lead.stage}</span>
          <span className="text-zinc-200 dark:text-zinc-700">·</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{score.nextMilestone}</span>
        </div>
      </div>

      {/* Trajectory + urgency */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div className={`flex items-center gap-1 text-xs font-medium ${traj.color}`}>
          <TrajIcon className="w-3 h-3" />
          <span className="hidden md:block">{traj.label}</span>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${urg.bg} ${urg.text}`}>
          {score.urgencyLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Summary Tiles ─────────────────────────────────────────────────────────────

function SummaryTile({ label, value, sub, color, icon: Icon }: {
  label: string; value: number; sub?: string;
  color: string; icon: typeof TrendingUp;
}) {
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <Icon className="w-3.5 h-3.5 opacity-60" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface PipelineMomentumPanelProps {
  onLeadClick?: (lead: Lead) => void;
}

export function PipelineMomentumPanel({ onLeadClick }: PipelineMomentumPanelProps) {
  const leads     = useSelector((state: RootState) => state.leads || []);
  const activities = useSelector((state: RootState) => state.activities || []);
  const [filter, setFilter] = useState<FilterView>('all');

  // Only active leads
  const activeLeads = useMemo(
    () => (leads as Lead[]).filter(l => !['won', 'lost'].includes(l.stage || '')),
    [leads],
  );

  // Compute momentum for each
  const rows: MomentumRow[] = useMemo(
    () => activeLeads
      .map(lead => ({ lead, score: derivePipelineMomentumScore(lead, activities) }))
      .sort((a, b) => {
        // Sort: critical first, then by score desc
        const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const uDiff = urgencyOrder[a.score.urgency] - urgencyOrder[b.score.urgency];
        return uDiff !== 0 ? uDiff : b.score.score - a.score.score;
      }),
    [activeLeads, activities],
  );

  // Summary counts
  const stalled   = rows.filter(r => r.score.trajectory === 'stalled' || r.score.trajectory === 'at_risk');
  const hot       = rows.filter(r => r.score.trajectory === 'accelerating' && r.score.score >= 70);
  const ready     = rows.filter(r => r.score.closeReadiness >= 70);
  const critical  = rows.filter(r => r.score.urgency === 'critical');

  // Filtered view
  const visible = useMemo(() => {
    if (filter === 'stalled')  return stalled;
    if (filter === 'hot')      return hot;
    if (filter === 'ready')    return ready;
    return rows;
  }, [filter, rows]);

  const FILTERS: { id: FilterView; label: string; count: number; icon: typeof TrendingUp }[] = [
    { id: 'all',     label: 'All Active', count: rows.length,    icon: BarChart2 },
    { id: 'stalled', label: 'Stalled',    count: stalled.length, icon: Clock },
    { id: 'hot',     label: 'Hot',        count: hot.length,     icon: Flame },
    { id: 'ready',   label: 'Close-Ready', count: ready.length,  icon: CheckCircle2 },
  ];

  return (
    <div className="flex flex-col h-full" data-testid="pipeline-momentum-panel">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Pipeline Momentum</h2>
          <Badge variant="outline" className="text-xs">{rows.length} active</Badge>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-4 gap-2">
          <SummaryTile
            label="Critical" value={critical.length} sub="act today"
            color="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
            icon={AlertTriangle}
          />
          <SummaryTile
            label="Stalled" value={stalled.length} sub="no contact 7d+"
            color="border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300"
            icon={Clock}
          />
          <SummaryTile
            label="Hot" value={hot.length} sub="accelerating"
            color="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
            icon={Flame}
          />
          <SummaryTile
            label="Close-Ready" value={ready.length} sub="readiness ≥70"
            color="border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
            icon={Target}
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60">
        {FILTERS.map(f => {
          const Icon = f.icon;
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              data-testid={`momentum-filter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                active
                  ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
              ].join(' ')}
            >
              <Icon className="w-3 h-3" />
              <span>{f.label}</span>
              {f.count > 0 && (
                <span className={[
                  'text-[10px] font-bold px-1 rounded',
                  active ? 'bg-violet-200 dark:bg-violet-800' : 'bg-zinc-200 dark:bg-zinc-700',
                ].join(' ')}>{f.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lead list */}
      <div className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No leads match this filter</p>
          </div>
        ) : (
          <div>
            {visible.map(row => (
              <MomentumLeadRow
                key={row.lead.id}
                row={row}
                onClick={() => onLeadClick?.(row.lead)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      {rows.length > 0 && (
        <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
            Momentum score = stage progress + recency + conversation depth + data completeness.
            Scores update live.
          </p>
        </div>
      )}
    </div>
  );
}

export default PipelineMomentumPanel;
