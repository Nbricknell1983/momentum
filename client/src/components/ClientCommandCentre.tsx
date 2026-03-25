/**
 * ClientCommandCentre
 *
 * Premium, non-technical client-facing dashboard.
 * Shows: delivery phase · channels · performance · milestones · next actions
 *
 * Designed to be shown TO the client — no raw data, no jargon, no internal states.
 * Can be used as an admin preview tab OR embedded in the client portal page.
 */

import { useMemo, useState } from 'react';
import {
  CheckCircle2, Circle, Globe, MapPin, Search, Megaphone,
  TrendingUp, Star, ArrowRight, AlertCircle, Clock, Zap,
  ChevronDown, ChevronUp, Award, Target, Rocket, Shield,
  BarChart2, Users, Wifi, PackageCheck, Lock,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import type { Client } from '@/lib/types';
import { deriveClientDashboard } from '@/lib/clientCommandAdapter';
import type {
  ClientDashboardState, ChannelDelivery, ClientMilestone, ClientNextAction,
  PerformanceSummary, ClientHealthScore, OptimisationActivity, StrategyAlignment,
  DeliverySummary,
} from '@/lib/clientCommandTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, typeof Globe> = {
  website: Globe,
  gbp:     MapPin,
  seo:     Search,
  ads:     Megaphone,
};

const STATUS_COLORS: Record<string, string> = {
  planned:      'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
  in_progress:  'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300',
  live:         'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400',
  optimising:   'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-400',
  not_included: 'bg-zinc-50 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600',
};

const MILESTONE_ICONS: Record<string, typeof Award> = {
  launch:    Rocket,
  ranking:   TrendingUp,
  review:    Star,
  traffic:   BarChart2,
  content:   PackageCheck,
  gbp:       MapPin,
  goal:      Target,
  handshake: Users,
};

const HEALTH_COLORS: Record<string, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  blue:    'text-blue-600 dark:text-blue-400',
  amber:   'text-amber-600 dark:text-amber-400',
  red:     'text-red-600 dark:text-red-400',
};

const HEALTH_BG: Record<string, string> = {
  emerald: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
  blue:    'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
  amber:   'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  red:     'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
};

const URGENCY_COLORS: Record<string, string> = {
  required_now: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30',
  this_week:    'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30',
  when_ready:   'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30',
};

const URGENCY_ICON_COLORS: Record<string, string> = {
  required_now: 'text-red-500',
  this_week:    'text-amber-500',
  when_ready:   'text-blue-500',
};

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</h3>
      {subtitle && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Health score ring ────────────────────────────────────────────────────────

function HealthRing({ health }: { health: ClientHealthScore }) {
  const circumference = 2 * Math.PI * 30; // r=30
  const offset = circumference - (health.score / 100) * circumference;
  const colorClass = HEALTH_COLORS[health.color] || HEALTH_COLORS.blue;
  const bgClass = HEALTH_BG[health.color] || HEALTH_BG.blue;

  return (
    <div className={`rounded-2xl border p-4 ${bgClass}`} data-testid="health-score-card">
      <div className="flex items-center gap-4">
        {/* Score ring */}
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
            <circle cx="40" cy="40" r="30" fill="none" stroke="currentColor" strokeWidth="6"
              className="text-zinc-200 dark:text-zinc-700" />
            <circle cx="40" cy="40" r="30" fill="none" strokeWidth="6"
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className={colorClass}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-xl font-bold tabular-nums ${colorClass}`}>{health.score}</span>
          </div>
        </div>

        <div className="flex-1">
          <p className={`text-lg font-semibold ${colorClass}`}>{health.statusLabel}</p>
          {health.highlights.slice(0, 2).map((h, i) => (
            <div key={i} className="flex items-center gap-1.5 mt-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{h}</p>
            </div>
          ))}
          {health.alerts.slice(0, 1).map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 mt-1">
              <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Delivery phase banner ────────────────────────────────────────────────────

function DeliveryPhaseBanner({ delivery }: { delivery: DeliverySummary }) {
  const phaseColors: Record<string, string> = {
    not_started: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
    onboarding:  'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    building:    'bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300',
    live:        'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
    optimising:  'bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300',
  };
  const phaseClass = phaseColors[delivery.phase] || phaseColors.onboarding;

  return (
    <div className={`rounded-xl p-4 ${phaseClass}`} data-testid="delivery-phase-banner">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Wifi className="w-4 h-4" />
            <p className="text-sm font-semibold">{delivery.phaseLabel}</p>
          </div>
          <p className="text-xs opacity-80">{delivery.phaseDescription}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold tabular-nums">{delivery.overallProgress}%</p>
          <p className="text-[10px] opacity-60">overall progress</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-current/20">
        <div
          className="h-full rounded-full bg-current transition-all duration-700"
          style={{ width: `${delivery.overallProgress}%` }}
        />
      </div>
    </div>
  );
}

// ─── Channel cards ────────────────────────────────────────────────────────────

function ChannelCard({ channel }: { channel: ChannelDelivery }) {
  const Icon = CHANNEL_ICONS[channel.channel] || Globe;
  const statusClass = STATUS_COLORS[channel.status] || STATUS_COLORS.planned;
  const isNotIncluded = channel.status === 'not_included';

  return (
    <div
      data-testid={`channel-card-${channel.channel}`}
      className={[
        'rounded-xl border p-3.5 transition-all',
        isNotIncluded
          ? 'border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 opacity-50'
          : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={[
            'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
            isNotIncluded ? 'bg-zinc-100 dark:bg-zinc-800' : 'bg-violet-100 dark:bg-violet-900/40',
          ].join(' ')}>
            <Icon className={['w-3.5 h-3.5', isNotIncluded ? 'text-zinc-400' : 'text-violet-600 dark:text-violet-400'].join(' ')} />
          </div>
          <p className={['text-xs font-medium leading-tight', isNotIncluded ? 'text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'].join(' ')}>
            {channel.label}
          </p>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusClass} flex-shrink-0`}>
          {channel.statusLabel}
        </span>
      </div>

      {!isNotIncluded && (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">{channel.highlight}</p>
          {channel.milestoneDate && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
              ↑ {channel.milestoneDate}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Performance section ──────────────────────────────────────────────────────

function PerformanceSection({ perf }: { perf: PerformanceSummary }) {
  if (!perf.dataAvailable) {
    return (
      <div className="p-5 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 text-center">
        <BarChart2 className="w-6 h-6 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Performance data coming soon</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-xs mx-auto">{perf.dataNote}</p>
      </div>
    );
  }

  const trendIcon = perf.visibilityTrend === 'improving' ? '↑' : perf.visibilityTrend === 'declining' ? '↓' : '→';
  const trendColor = perf.visibilityTrend === 'improving' ? 'text-emerald-600 dark:text-emerald-400'
    : perf.visibilityTrend === 'declining' ? 'text-red-600 dark:text-red-400'
    : 'text-zinc-500 dark:text-zinc-400';

  return (
    <div className="space-y-3" data-testid="performance-section">
      {/* Top win */}
      <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
        <div className="flex items-start gap-2">
          <Award className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-0.5">Key Win</p>
            <p className="text-sm text-emerald-800 dark:text-emerald-300">{perf.topWin}</p>
          </div>
        </div>
      </div>

      {/* Visibility score + trend */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Visibility Score</p>
          <p className="text-3xl font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">{perf.visibilityScore}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">out of 100</p>
        </div>
        <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Trend</p>
          <p className={`text-2xl font-bold tabular-nums ${trendColor}`}>{trendIcon}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-tight mt-0.5">{perf.trendLabel}</p>
        </div>
      </div>

      {/* Key metrics */}
      {perf.keyMetrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {perf.keyMetrics.map((m, i) => (
            <div key={i} className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">{m.label}</p>
              <div className="flex items-end gap-1">
                <p className="text-xl font-bold text-zinc-800 dark:text-zinc-200">{m.value}</p>
                {m.trend && (
                  <span className={['text-sm font-bold mb-0.5',
                    m.trend === 'up' ? 'text-emerald-500' : m.trend === 'down' ? 'text-red-500' : 'text-zinc-400',
                  ].join(' ')}>
                    {m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : ''}
                  </span>
                )}
              </div>
              {m.detail && <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{m.detail}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Milestone timeline ───────────────────────────────────────────────────────

function MilestoneTimeline({ milestones }: { milestones: ClientMilestone[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? milestones : milestones.slice(0, 5);

  return (
    <div className="space-y-0" data-testid="milestone-timeline">
      {visible.map((m, i) => {
        const Icon = MILESTONE_ICONS[m.icon] || Target;
        return (
          <div key={m.id} className="flex gap-3">
            {/* Connector */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={[
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all',
                m.achieved
                  ? 'bg-emerald-100 dark:bg-emerald-900/50 border-emerald-400 dark:border-emerald-600'
                  : m.isNext
                  ? 'bg-violet-100 dark:bg-violet-900/50 border-violet-400 dark:border-violet-600 ring-2 ring-violet-200 dark:ring-violet-800'
                  : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600',
              ].join(' ')}>
                {m.achieved
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  : <Icon className={['w-3.5 h-3.5', m.isNext ? 'text-violet-500' : 'text-zinc-400'].join(' ')} />
                }
              </div>
              {i < visible.length - 1 && (
                <div className={[
                  'w-0.5 flex-1 my-1',
                  m.achieved ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-zinc-200 dark:bg-zinc-700',
                ].join(' ')} style={{ minHeight: '16px' }} />
              )}
            </div>

            {/* Content */}
            <div className="pb-4 flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={[
                    'text-sm font-medium leading-snug',
                    m.achieved ? 'text-zinc-800 dark:text-zinc-200'
                    : m.isNext ? 'text-violet-700 dark:text-violet-300'
                    : 'text-zinc-500 dark:text-zinc-400',
                  ].join(' ')}>
                    {m.title}
                    {m.isNext && !m.achieved && (
                      <span className="ml-2 text-[10px] font-bold text-violet-500 bg-violet-100 dark:bg-violet-900/40 px-1.5 py-0.5 rounded">NEXT</span>
                    )}
                  </p>
                  <p className={['text-xs mt-0.5 leading-snug',
                    m.achieved ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-400 dark:text-zinc-500',
                  ].join(' ')}>
                    {m.description}
                  </p>
                </div>
                {m.achievedAt && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0">{m.achievedAt}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {!showAll && milestones.length > 5 && (
        <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => setShowAll(true)}>
          Show all {milestones.length} milestones
        </Button>
      )}
    </div>
  );
}

// ─── Next actions ─────────────────────────────────────────────────────────────

function NextActionsSection({ actions }: { actions: ClientNextAction[] }) {
  if (actions.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 text-center">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No action required from you right now.</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">We'll let you know when something needs your input.</p>
      </div>
    );
  }

  const CATEGORY_LABELS: Record<string, string> = {
    approval: 'Approval needed', content: 'Content needed',
    access: 'Access needed', feedback: 'Feedback needed', other: 'Action needed',
  };

  return (
    <div className="space-y-2" data-testid="next-actions-section">
      {actions.map(action => {
        const urgClass = URGENCY_COLORS[action.urgency] || URGENCY_COLORS.when_ready;
        const iconClass = URGENCY_ICON_COLORS[action.urgency] || 'text-blue-500';
        const UrgIcon = action.urgency === 'required_now' ? AlertCircle
          : action.urgency === 'this_week' ? Clock : Target;
        return (
          <div key={action.id} className={`rounded-xl border p-3.5 ${urgClass}`} data-testid={`next-action-${action.id}`}>
            <div className="flex items-start gap-3">
              <UrgIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${iconClass}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{action.action}</p>
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                    {CATEGORY_LABELS[action.category]}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">{action.description}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Optimisation activity ────────────────────────────────────────────────────

function OptimisationSection({ opt }: { opt: OptimisationActivity }) {
  if (!opt.isActive) {
    return (
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 text-center bg-zinc-50 dark:bg-zinc-900">
        <Zap className="w-5 h-5 text-zinc-300 dark:text-zinc-600 mx-auto mb-1.5" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Optimisation starts once your digital presence is live.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="optimisation-section">
      <div className="p-3.5 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30">
        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-4 h-4 text-violet-500" />
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Active</p>
        </div>
        <p className="text-sm text-violet-800 dark:text-violet-300">{opt.summary}</p>
      </div>

      {opt.recentActions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">Recently done</p>
          <div className="space-y-1.5">
            {opt.recentActions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {opt.upcomingWork.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">Coming up</p>
          <div className="space-y-1.5">
            {opt.upcomingWork.map((u, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <ArrowRight className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                <span>{u}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Strategy alignment ───────────────────────────────────────────────────────

function StrategyAlignmentSection({ alignment }: { alignment: StrategyAlignment }) {
  return (
    <div className="grid grid-cols-3 gap-3" data-testid="strategy-alignment-section">
      {/* Planned */}
      <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
        <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-2">Planned</p>
        <div className="space-y-1.5">
          {alignment.promised.map((p, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <Circle className="w-2.5 h-2.5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-300 leading-snug">{p}</p>
            </div>
          ))}
          {alignment.promised.length === 0 && (
            <p className="text-xs text-blue-400">Plan being confirmed</p>
          )}
        </div>
      </div>

      {/* Delivered */}
      <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
        <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-2">Delivered</p>
        <div className="space-y-1.5">
          {alignment.delivered.map((d, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-snug">{d}</p>
            </div>
          ))}
          {alignment.delivered.length === 0 && (
            <p className="text-xs text-emerald-400">Delivery starting soon</p>
          )}
        </div>
      </div>

      {/* Upcoming */}
      <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-2">Upcoming</p>
        <div className="space-y-1.5">
          {alignment.upcoming.map((u, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <ArrowRight className="w-2.5 h-2.5 text-zinc-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug">{u}</p>
            </div>
          ))}
          {alignment.upcoming.length === 0 && (
            <p className="text-xs text-zinc-400">All planned items delivered</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin inspection bar ─────────────────────────────────────────────────────

function AdminInspectionBar({ dashboard }: { dashboard: ClientDashboardState }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-xl overflow-hidden border-zinc-200 dark:border-zinc-700">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 text-left"
        onClick={() => setExpanded(e => !e)}
        data-testid="btn-admin-inspection"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Admin Inspection</span>
          <Badge variant="outline" className="text-[10px]">Internal only</Badge>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}
      </button>

      {expanded && (
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Data Sources</p>
              <ul className="space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                <li>• activationPlan: {dashboard.delivery.channels.filter(c => c.isIncluded).length} channels</li>
                <li>• healthStatus: {dashboard.health.status}</li>
                <li>• milestones: {dashboard.milestones.filter(m => m.achieved).length}/{dashboard.milestones.length}</li>
                <li>• nextActions: {dashboard.nextActions.length}</li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Hidden from client</p>
              <ul className="space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                <li>• churnRiskScore</li>
                <li>• healthReasons (raw)</li>
                <li>• internalNotes</li>
                <li>• provisioningState</li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Derived at</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {format(new Date(dashboard.generatedAt), 'dd/MM/yyyy HH:mm')}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Pure derivation — no API calls</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Navigation tabs ──────────────────────────────────────────────────────────

type CommandTab = 'overview' | 'delivery' | 'performance' | 'milestones' | 'actions';

const COMMAND_TABS: { id: CommandTab; label: string; icon: typeof Globe }[] = [
  { id: 'overview',     label: 'Overview',     icon: BarChart2 },
  { id: 'delivery',     label: 'Delivery',     icon: PackageCheck },
  { id: 'performance',  label: 'Performance',  icon: TrendingUp },
  { id: 'milestones',   label: 'Milestones',   icon: Award },
  { id: 'actions',      label: 'Your Actions', icon: Target },
];

// ─── Main component ───────────────────────────────────────────────────────────

interface ClientCommandCentreProps {
  client: Client;
  showAdminBar?: boolean;   // show the admin inspection panel at the bottom
  compact?: boolean;        // no tab nav — just the overview
}

export function ClientCommandCentre({ client, showAdminBar = true, compact = false }: ClientCommandCentreProps) {
  const [tab, setTab] = useState<CommandTab>('overview');
  const dashboard = useMemo(() => deriveClientDashboard(client), [client]);

  if (compact) {
    // Minimal overview mode for embedding in portal
    return (
      <div className="space-y-4 p-4" data-testid="client-command-centre-compact">
        <HealthRing health={dashboard.health} />
        <DeliveryPhaseBanner delivery={dashboard.delivery} />
        <div className="grid grid-cols-2 gap-3">
          {dashboard.delivery.channels.filter(c => c.isIncluded).map(c => (
            <ChannelCard key={c.channel} channel={c} />
          ))}
        </div>
        {dashboard.nextActions.length > 0 && (
          <div>
            <SectionHeader title="What We Need From You" />
            <NextActionsSection actions={dashboard.nextActions} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="client-command-centre">
      {/* Tab nav */}
      <div className="flex gap-1 p-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/60 flex-wrap">
        {COMMAND_TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              data-testid={`command-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                active
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
              ].join(' ')}
            >
              <Icon className="w-3 h-3" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-5">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <>
              <HealthRing health={dashboard.health} />
              <DeliveryPhaseBanner delivery={dashboard.delivery} />

              {/* Channel grid */}
              <div>
                <SectionHeader title="Your Digital Presence" subtitle="Status of each channel in your growth plan" />
                <div className="grid grid-cols-2 gap-3">
                  {dashboard.delivery.channels.map(c => <ChannelCard key={c.channel} channel={c} />)}
                </div>
              </div>

              {/* Quick wins summary */}
              {dashboard.performance.dataAvailable && (
                <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="w-4 h-4 text-emerald-500" />
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Key Win</p>
                  </div>
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">{dashboard.performance.topWin}</p>
                </div>
              )}

              {/* Pending actions count */}
              {dashboard.nextActions.length > 0 && (
                <div
                  className="flex items-center justify-between p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 cursor-pointer"
                  onClick={() => setTab('actions')}
                  data-testid="overview-actions-prompt"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      {dashboard.nextActions.length} item{dashboard.nextActions.length !== 1 ? 's' : ''} need your attention
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-amber-500" />
                </div>
              )}

              {showAdminBar && <AdminInspectionBar dashboard={dashboard} />}
            </>
          )}

          {/* DELIVERY */}
          {tab === 'delivery' && (
            <>
              <DeliveryPhaseBanner delivery={dashboard.delivery} />

              <div>
                <SectionHeader
                  title="What's Being Built"
                  subtitle="Each channel in your digital growth plan and where it's at"
                />
                <div className="space-y-3">
                  {dashboard.delivery.channels.map(c => (
                    <div
                      key={c.channel}
                      className={[
                        'rounded-xl border p-4',
                        c.isIncluded
                          ? 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                          : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 opacity-50',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {(() => { const Icon = CHANNEL_ICONS[c.channel] || Globe; return <Icon className="w-4 h-4 text-violet-500" />; })()}
                          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{c.label}</p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_COLORS[c.status]}`}>
                          {c.statusLabel}
                        </span>
                      </div>
                      {c.isIncluded && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{c.highlight}</p>
                      )}
                      {c.milestoneDate && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">Live since {c.milestoneDate}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <SectionHeader title="Strategy vs Delivery" subtitle="What was planned versus what's been done" />
                <StrategyAlignmentSection alignment={dashboard.strategyAlignment} />
              </div>

              <div>
                <SectionHeader title="What We're Working On" subtitle="Current and upcoming optimisation activity" />
                <OptimisationSection opt={dashboard.optimisation} />
              </div>

              {showAdminBar && <AdminInspectionBar dashboard={dashboard} />}
            </>
          )}

          {/* PERFORMANCE */}
          {tab === 'performance' && (
            <>
              <SectionHeader
                title="Your Performance"
                subtitle="A simplified summary of how your digital presence is performing"
              />
              <PerformanceSection perf={dashboard.performance} />
              {showAdminBar && <AdminInspectionBar dashboard={dashboard} />}
            </>
          )}

          {/* MILESTONES */}
          {tab === 'milestones' && (
            <>
              <SectionHeader
                title="Your Growth Journey"
                subtitle="Key milestones in your digital growth — past, present, and next"
              />
              <MilestoneTimeline milestones={dashboard.milestones} />
              {showAdminBar && <AdminInspectionBar dashboard={dashboard} />}
            </>
          )}

          {/* YOUR ACTIONS */}
          {tab === 'actions' && (
            <>
              <SectionHeader
                title="What We Need From You"
                subtitle="Items that require your input or approval to keep things moving"
              />
              <NextActionsSection actions={dashboard.nextActions} />
              {showAdminBar && <AdminInspectionBar dashboard={dashboard} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClientCommandCentre;
