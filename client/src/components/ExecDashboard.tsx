import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'wouter';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Info,
  ArrowRight,
  BarChart3,
  Users,
  Zap,
  Bell,
  Mail,
  Shield,
  Target,
  Activity,
  RefreshCw,
} from 'lucide-react';
import type { RootState } from '@/store';
import { deriveExecDashboard } from '@/lib/execAdapter';
import type {
  ExecutiveKPI,
  ExecutiveRiskSummary,
  ExecutiveOpportunitySummary,
  ExecutiveBottleneck,
  ExecutiveAlert,
  ExecutiveWatchlistLead,
  ExecutiveWatchlistClient,
} from '@/lib/execTypes';

// ── helpers ───────────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: ExecutiveKPI['trend'] }) {
  if (trend === 'up') return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (trend === 'down') return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-zinc-400" />;
}

function StatusDot({ status }: { status: ExecutiveKPI['status'] }) {
  const colors: Record<string, string> = {
    good: 'bg-emerald-500',
    warning: 'bg-amber-400',
    critical: 'bg-red-500',
    neutral: 'bg-zinc-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? 'bg-zinc-400'}`} />;
}

function SeverityBadge({ severity }: { severity: 'critical' | 'high' | 'medium' | 'info' }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
    high: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    medium: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
    info: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${styles[severity] ?? styles.info}`}>
      {severity}
    </span>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, typeof TrendingUp> = {
    sales: TrendingUp,
    onboarding: Zap,
    account: Users,
    execution: Bell,
    expansion: Target,
    referral: Activity,
    pipeline: BarChart3,
    reactivation: RefreshCw,
  };
  const Icon = icons[category] ?? Info;
  return <Icon className="w-4 h-4" />;
}

function TimeframeBadge({ timeframe }: { timeframe: 'now' | 'this_week' | 'this_month' }) {
  const map = { now: 'Act Now', this_week: 'This Week', this_month: 'This Month' };
  const colors = {
    now: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300',
    this_week: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
    this_month: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${colors[timeframe]}`}>
      {map[timeframe]}
    </span>
  );
}

const HEALTH_COLORS: Record<string, string> = {
  green: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800',
  amber: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800',
  red: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
};

// ── sub-components ────────────────────────────────────────────────────────────

function KPICard({ kpi }: { kpi: ExecutiveKPI }) {
  const borderColor =
    kpi.status === 'good'
      ? 'border-t-emerald-400'
      : kpi.status === 'warning'
      ? 'border-t-amber-400'
      : kpi.status === 'critical'
      ? 'border-t-red-500'
      : 'border-t-zinc-300 dark:border-t-zinc-700';

  return (
    <Link href={kpi.drilldownUrl ?? '#'}>
      <div
        data-testid={`exec-kpi-${kpi.id}`}
        className={`group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-t-2 ${borderColor} rounded-xl p-4 cursor-pointer hover:shadow-md transition-all`}
      >
        <div className="flex items-start justify-between mb-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{kpi.label}</span>
          <div className="flex items-center gap-1">
            <StatusDot status={kpi.status} />
            <TrendIcon trend={kpi.trend} />
          </div>
        </div>
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{kpi.value}</span>
          {kpi.unit && <span className="text-xs text-zinc-500 dark:text-zinc-400">{kpi.unit}</span>}
        </div>
        {kpi.subtext && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">{kpi.subtext}</p>
        )}
        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug line-clamp-2 group-hover:text-zinc-800 dark:group-hover:text-zinc-300 transition-colors">
          {kpi.interpretation}
        </p>
      </div>
    </Link>
  );
}

function RiskCard({ risk }: { risk: ExecutiveRiskSummary }) {
  return (
    <div
      data-testid={`exec-risk-${risk.id}`}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <CategoryIcon category={risk.category} />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{risk.title}</span>
        </div>
        <SeverityBadge severity={risk.severity} />
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed">{risk.description}</p>
      {risk.affectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {risk.affectedNames.map((name, idx) => (
            <span
              key={`${name}-${idx}`}
              className="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded"
            >
              {name}
            </span>
          ))}
          {risk.affectedCount > risk.affectedNames.length && (
            <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded">
              +{risk.affectedCount - risk.affectedNames.length} more
            </span>
          )}
        </div>
      )}
      <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Recommended: </span>
          {risk.recommendation}
        </p>
        <Link href={risk.drilldownUrl}>
          <span className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">
            View details <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
    </div>
  );
}

function OpportunityCard({ opp }: { opp: ExecutiveOpportunitySummary }) {
  return (
    <div
      data-testid={`exec-opp-${opp.id}`}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <CategoryIcon category={opp.category} />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{opp.title}</span>
        </div>
        <TimeframeBadge timeframe={opp.timeframe} />
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed">{opp.description}</p>
      {opp.affectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {opp.affectedNames.map((name, idx) => (
            <span
              key={`${name}-${idx}`}
              className="text-[10px] px-1.5 py-0.5 bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 rounded"
            >
              {name}
            </span>
          ))}
          {opp.affectedCount > opp.affectedNames.length && (
            <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded">
              +{opp.affectedCount - opp.affectedNames.length} more
            </span>
          )}
        </div>
      )}
      {opp.estimatedLabel && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mb-2">↑ {opp.estimatedLabel}</p>
      )}
      <Link href={opp.drilldownUrl}>
        <span className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">
          Act on this <ArrowRight className="w-3 h-3" />
        </span>
      </Link>
    </div>
  );
}

function AlertRow({ alert }: { alert: ExecutiveAlert }) {
  const Icon = alert.severity === 'critical' ? AlertTriangle : alert.severity === 'high' ? AlertTriangle : Info;
  const iconColor =
    alert.severity === 'critical'
      ? 'text-red-500'
      : alert.severity === 'high'
      ? 'text-amber-500'
      : 'text-blue-500';

  return (
    <div
      data-testid={`exec-alert-${alert.id}`}
      className="flex items-start gap-3 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
    >
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{alert.title}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{alert.body}</p>
      </div>
      {alert.drilldownUrl && (
        <Link href={alert.drilldownUrl}>
          <ArrowRight className="w-4 h-4 text-zinc-400 hover:text-violet-500 flex-shrink-0 mt-0.5 transition-colors" />
        </Link>
      )}
    </div>
  );
}

function BottleneckRow({ b }: { b: ExecutiveBottleneck }) {
  return (
    <div
      data-testid={`exec-bottleneck-${b.id}`}
      className="flex items-start gap-3 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
    >
      <div className="w-2 h-2 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{b.stageLabel}</span>
          <span className="text-xs text-zinc-500">{b.blockCount} leads</span>
          {b.avgDaysStuck !== undefined && (
            <span className="text-xs text-amber-600 dark:text-amber-400">avg {b.avgDaysStuck}d</span>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{b.description}</p>
      </div>
      <Link href={b.drilldownUrl}>
        <ArrowRight className="w-4 h-4 text-zinc-400 hover:text-violet-500 flex-shrink-0 mt-1 transition-colors" />
      </Link>
    </div>
  );
}

// ── tabs ───────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'pipeline' | 'accounts' | 'workload' | 'inspection';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'workload', label: 'Workload' },
  { id: 'inspection', label: 'Inspection' },
];

// ── Overview tab ───────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: ReturnType<typeof deriveExecDashboard> }) {
  return (
    <div className="space-y-8">
      {/* KPI Row */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
          Key Metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.kpis.map(kpi => (
            <KPICard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      </section>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
            Critical Alerts
          </h2>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.alerts.map(a => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </div>
        </section>
      )}

      {/* Risks + Opportunities side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.risks.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
              Risks to Address
            </h2>
            <div className="space-y-3">
              {data.risks.map(r => (
                <RiskCard key={r.id} risk={r} />
              ))}
            </div>
          </section>
        )}
        {data.opportunities.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
              Opportunities to Act On
            </h2>
            <div className="space-y-3">
              {data.opportunities.map(o => (
                <OpportunityCard key={o.id} opp={o} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Bottlenecks */}
      {data.bottlenecks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
            Bottlenecks Slowing Momentum
          </h2>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4">
            {data.bottlenecks.map(b => (
              <BottleneckRow key={b.id} b={b} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {data.alerts.length === 0 && data.risks.length === 0 && data.bottlenecks.length === 0 && (
        <div className="text-center py-16">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">No critical issues detected</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">All systems are operating within healthy parameters.</p>
        </div>
      )}
    </div>
  );
}

// ── Pipeline tab ───────────────────────────────────────────────────────────────

function PipelineTab({ data }: { data: ReturnType<typeof deriveExecDashboard> }) {
  const { pipeline, watchlistLeads } = data;
  const maxCount = Math.max(...pipeline.stageBreakdown.map(s => s.count), 1);

  return (
    <div className="space-y-8">
      {/* Stage breakdown */}
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
          Pipeline Stage Distribution
        </h2>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-3">
          {pipeline.stageBreakdown.map(s => (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-28 text-xs font-medium text-zinc-600 dark:text-zinc-400 text-right flex-shrink-0">
                {s.label}
              </span>
              <div className="flex-1 h-7 bg-zinc-100 dark:bg-zinc-800 rounded-md overflow-hidden">
                <div
                  className={`h-full rounded-md transition-all ${s.isBottleneck ? 'bg-amber-400' : 'bg-violet-500'}`}
                  style={{ width: `${Math.max((s.count / maxCount) * 100, s.count > 0 ? 5 : 0)}%` }}
                />
              </div>
              <span className={`w-6 text-sm font-bold ${s.isBottleneck ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {s.count}
              </span>
              {s.isBottleneck && (
                <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
                  Bottleneck
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-6 mt-4 px-1">
          <div className="text-center">
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{pipeline.totalActive}</div>
            <div className="text-xs text-zinc-500">Active leads</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{pipeline.totalStalled}</div>
            <div className="text-xs text-zinc-500">Stalled ≥14d</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{pipeline.proposalRate}%</div>
            <div className="text-xs text-zinc-500">Proposal rate</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{pipeline.winRate}%</div>
            <div className="text-xs text-zinc-500">Win rate</div>
          </div>
        </div>
      </section>

      {/* Stalled leads watchlist */}
      {watchlistLeads.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
              Stalled Lead Watchlist
            </h2>
            <Link href="/leads">
              <span className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
                Open Leads <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Stage</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Issue</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {watchlistLeads.map(l => (
                  <tr key={l.id} data-testid={`exec-watchlead-${l.id}`} className="border-b border-zinc-50 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{l.name}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{l.stage}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{l.issue}</td>
                    <td className="px-4 py-2.5">
                      <SeverityBadge severity={l.urgency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {watchlistLeads.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No stalled leads</p>
          <p className="text-xs text-zinc-500 mt-1">All active leads have had recent activity.</p>
        </div>
      )}
    </div>
  );
}

// ── Accounts tab ───────────────────────────────────────────────────────────────

function AccountsTab({ data }: { data: ReturnType<typeof deriveExecDashboard> }) {
  const { accounts, watchlistClients, opportunities } = data;
  const accountOpps = opportunities.filter(o => o.category === 'expansion' || o.category === 'referral');

  return (
    <div className="space-y-8">
      {/* Health + Delivery breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
            Account Health
          </h2>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
            {accounts.healthBreakdown.map(h => (
              <div key={h.status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${HEALTH_COLORS[h.status] ?? ''}`}>
                    {h.label}
                  </span>
                </div>
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{h.count}</span>
              </div>
            ))}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex justify-between">
              <span className="text-xs text-zinc-500">Total active</span>
              <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{accounts.totalActive}</span>
            </div>
          </div>
        </section>
        <section>
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
            Delivery Status
          </h2>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
            {accounts.deliveryBreakdown.filter(d => d.count > 0 || d.status === 'blocked').map(d => (
              <div key={d.status} className="flex items-center justify-between">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{d.label}</span>
                <span className={`text-sm font-bold ${d.status === 'blocked' && d.count > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                  {d.count}
                </span>
              </div>
            ))}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-base font-bold text-amber-600 dark:text-amber-400">{accounts.hotUpsell}</div>
                <div className="text-[10px] text-zinc-500">Upsell ready</div>
              </div>
              <div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">{accounts.referralReady}</div>
                <div className="text-[10px] text-zinc-500">Referral ready</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Account opportunities */}
      {accountOpps.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
              Growth Opportunities
            </h2>
            <Link href="/expansion">
              <span className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
                Expansion workspace <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {accountOpps.map(o => <OpportunityCard key={o.id} opp={o} />)}
          </div>
        </section>
      )}

      {/* Client watchlist */}
      {watchlistClients.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
              Account Watchlist
            </h2>
            <Link href="/clients">
              <span className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
                Open Clients <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Account</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Health</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Issue</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {watchlistClients.map(c => (
                  <tr key={c.id} data-testid={`exec-watchclient-${c.id}`} className="border-b border-zinc-50 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{c.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border capitalize ${HEALTH_COLORS[c.health] ?? ''}`}>
                        {c.health}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">{c.issue}</td>
                    <td className="px-4 py-2.5 text-zinc-500 capitalize">{c.deliveryStatus ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {watchlistClients.length === 0 && accounts.totalActive > 0 && (
        <div className="text-center py-12">
          <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">All accounts are healthy</p>
          <p className="text-xs text-zinc-500 mt-1">No accounts require urgent attention at this time.</p>
        </div>
      )}
    </div>
  );
}

// ── Workload tab ───────────────────────────────────────────────────────────────

function WorkloadTab({ data }: { data: ReturnType<typeof deriveExecDashboard> }) {
  const { workload } = data;

  const tiles = [
    {
      label: 'Overdue Cadence',
      value: workload.overdueCadence,
      status: workload.overdueCadence === 0 ? 'good' : workload.overdueCadence <= 3 ? 'warning' : 'critical',
      url: '/cadence',
      icon: Bell,
      description: 'Follow-up items past their due date',
    },
    {
      label: 'Due Today',
      value: workload.todayCadence,
      status: workload.todayCadence === 0 ? 'good' : 'warning',
      url: '/cadence',
      icon: Bell,
      description: 'Cadence items due today',
    },
    {
      label: 'Pending Outreach',
      value: workload.pendingDrafts,
      status: workload.pendingDrafts === 0 ? 'good' : workload.pendingDrafts <= 5 ? 'warning' : 'critical',
      url: '/comms',
      icon: Mail,
      description: 'Communication drafts awaiting review',
    },
    {
      label: 'Blocked Deliveries',
      value: workload.blockedDeliveries,
      status: workload.blockedDeliveries === 0 ? 'good' : workload.blockedDeliveries <= 2 ? 'warning' : 'critical',
      url: '/clients',
      icon: Shield,
      description: 'Active accounts with blocked delivery',
    },
    {
      label: 'Churn Alerts',
      value: workload.criticalChurn,
      status: workload.criticalChurn === 0 ? 'good' : 'critical',
      url: '/expansion',
      icon: AlertTriangle,
      description: 'Accounts at high churn risk',
    },
  ];

  const statusBorder: Record<string, string> = {
    good: 'border-t-emerald-400',
    warning: 'border-t-amber-400',
    critical: 'border-t-red-500',
  };
  const statusText: Record<string, string> = {
    good: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    critical: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
          Operational Pressure Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {tiles.map(t => (
            <Link key={t.label} href={t.url}>
              <div
                data-testid={`exec-workload-${t.label.toLowerCase().replace(/ /g, '-')}`}
                className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-t-2 ${statusBorder[t.status]} rounded-xl p-4 cursor-pointer hover:shadow-md transition-all`}
              >
                <t.icon className={`w-4 h-4 mb-2 ${statusText[t.status]}`} />
                <div className={`text-2xl font-bold mb-1 ${statusText[t.status]}`}>{t.value}</div>
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">{t.label}</div>
                <div className="text-[10px] text-zinc-500 leading-snug">{t.description}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
          Cadence Pressure by Category
        </h2>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Sales', value: workload.overdueByCategory.sales, url: '/cadence' },
              { label: 'Onboarding', value: workload.overdueByCategory.onboarding, url: '/cadence' },
              { label: 'Accounts', value: workload.overdueByCategory.account, url: '/cadence' },
              { label: 'Referrals', value: workload.overdueByCategory.referral, url: '/cadence' },
            ].map(cat => (
              <Link key={cat.label} href={cat.url}>
                <div className="text-center cursor-pointer group">
                  <div className={`text-2xl font-bold mb-1 ${cat.value > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-600'}`}>
                    {cat.value}
                  </div>
                  <div className="text-xs text-zinc-500 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{cat.label}</div>
                </div>
              </Link>
            ))}
          </div>
          <div className="border-t border-zinc-100 dark:border-zinc-800 mt-4 pt-4 text-center">
            <Link href="/cadence">
              <span className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">
                Open Cadence Workspace <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
          Quick Access — Workspaces
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Cadence Queue', url: '/cadence', Icon: Bell, desc: 'Manage all follow-ups' },
            { label: 'Comms Drafts', url: '/comms', Icon: Mail, desc: 'Review outreach drafts' },
            { label: 'Expansion', url: '/expansion', Icon: Target, desc: 'Upsell, churn, referrals' },
            { label: 'Agent Command', url: '/agents', Icon: Zap, desc: 'AI job queue and status' },
          ].map(link => (
            <Link key={link.label} href={link.url}>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm transition-all group">
                <link.Icon className="w-5 h-5 text-zinc-400 group-hover:text-violet-500 mb-2 transition-colors" />
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">{link.label}</div>
                <div className="text-[11px] text-zinc-500">{link.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Inspection tab ─────────────────────────────────────────────────────────────

function InspectionTab({ data }: { data: ReturnType<typeof deriveExecDashboard> }) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
          Source Data
        </h2>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-2">
          {data.sourceData.derivationInputs.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <span className="text-xs text-zinc-700 dark:text-zinc-300">{line}</span>
            </div>
          ))}
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-3">
            <span className="text-xs text-zinc-500">Dashboard generated: {data.generatedAt}</span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
          KPI Derivation Log
        </h2>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800">
          {data.kpis.map(kpi => (
            <div key={kpi.id} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <StatusDot status={kpi.status} />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{kpi.label}</span>
                <span className="text-xs text-zinc-500">→ {kpi.value}{kpi.unit ? ` ${kpi.unit}` : ''}</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{kpi.interpretation}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">
          Derivation Rules
        </h2>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Stalled leads:</span> Active leads with no activity for ≥14 days</p>
          <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Churn warnings:</span> Clients with red health OR churn risk score ≥ 0.6</p>
          <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Upsell ready:</span> Clients with upsellReadiness = "hot" or "ready"</p>
          <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Referral ready:</span> Green-health clients with ≥30 days since last contact</p>
          <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Pipeline bottleneck:</span> Non-entry stage with the highest lead concentration</p>
          <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Proposal rate:</span> Leads at proposal/verbal commit ÷ total active leads</p>
          <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Win rate:</span> Won leads ÷ (won + lost) closed opportunities</p>
          <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Dormant leads:</span> Suspect/contacted/nurture leads inactive for ≥30 days</p>
          <p><span className="font-medium text-zinc-800 dark:text-zinc-200">All data:</span> Derived from live Redux state (leads + clients). No AI or API calls. Zero latency.</p>
        </div>
      </section>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ExecDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const leads = useSelector((s: RootState) => s.app.leads);
  const clients = useSelector((s: RootState) => s.app.clients);

  const data = useMemo(() => deriveExecDashboard(leads, clients), [leads, clients]);

  const totalAlerts = data.alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Executive Dashboard</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Operating picture across {data.sourceData.activeLeads} leads and {data.sourceData.activeClients} accounts
              <span className="ml-2 text-zinc-400">· {data.generatedAt}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {totalAlerts > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {totalAlerts} alert{totalAlerts !== 1 ? 's' : ''}
              </span>
            )}
            {data.workload.overdueCadence > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg text-xs font-semibold">
                <Bell className="w-3.5 h-3.5" />
                {data.workload.overdueCadence} overdue
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 flex-shrink-0">
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              data-testid={`exec-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {activeTab === 'overview' && <OverviewTab data={data} />}
        {activeTab === 'pipeline' && <PipelineTab data={data} />}
        {activeTab === 'accounts' && <AccountsTab data={data} />}
        {activeTab === 'workload' && <WorkloadTab data={data} />}
        {activeTab === 'inspection' && <InspectionTab data={data} />}
      </div>
    </div>
  );
}
