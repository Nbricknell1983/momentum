import { useState, useMemo } from 'react';
import {
  BrainCircuit, ChevronDown, ChevronUp, Globe, MapPin, Search, Megaphone,
  Target, Zap, ArrowRight, CheckCircle2, Clock, Loader2, Eye,
  TrendingUp, AlertCircle, Layers, Activity, Radio, ScanLine, Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Client, WorkstreamScope, WorkstreamStatus, ActivationPlan, SourceIntelligence, ChannelStatus, ScopeAudit, ChannelReadinessStatus } from '@/lib/types';

// ─── Scope helpers ────────────────────────────────────────────────────────────

const SCOPE_META: Record<WorkstreamScope, {
  label: string;
  icon: typeof Globe;
  color: string;
  outcomes: string[];
}> = {
  website: {
    label: 'Website Build',
    icon: Globe,
    color: 'text-blue-600 dark:text-blue-400',
    outcomes: ['Conversion rate', 'Brand authority', 'Local search landing pages'],
  },
  gbp: {
    label: 'GBP / Local',
    icon: MapPin,
    color: 'text-emerald-600 dark:text-emerald-400',
    outcomes: ['Map pack visibility', 'Google review volume', 'Local trust signals'],
  },
  seo: {
    label: 'SEO',
    icon: Search,
    color: 'text-violet-600 dark:text-violet-400',
    outcomes: ['Organic search rankings', 'Service area keyword coverage', 'Impressions & clicks'],
  },
  ads: {
    label: 'Paid Ads',
    icon: Megaphone,
    color: 'text-amber-600 dark:text-amber-400',
    outcomes: ['Paid search impressions', 'Click-through rate', 'Lead cost efficiency'],
  },
};

function scopeStrategyName(scope: WorkstreamScope[]): string {
  const sorted = [...scope].sort();
  const key = sorted.join('+');
  const names: Record<string, string> = {
    'website': 'Conversion Website Build',
    'gbp': 'GBP Optimisation Sprint',
    'seo': 'Organic SEO Campaign',
    'ads': 'Paid Search Activation',
    'gbp+website': 'Local Presence & Website Build',
    'seo+website': 'Organic Growth Website Strategy',
    'ads+website': 'Website + Paid Acquisition',
    'gbp+seo': 'Local Search Dominance',
    'ads+gbp': 'Map Pack + Paid Capture',
    'ads+seo': 'Full Search Funnel',
    'gbp+seo+website': 'Local Visibility Authority Build',
    'ads+gbp+website': 'Paid + Local + Conversion Stack',
    'ads+seo+website': 'Full Organic & Paid Build',
    'ads+gbp+seo': 'Local Search Domination Stack',
    'ads+gbp+seo+website': 'Full Digital Growth Stack',
  };
  return names[key] || 'Multi-Channel Growth Strategy';
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<WorkstreamStatus, string> = {
  queued: 'Queued',
  generating: 'Generating',
  ready_for_review: 'Ready for review',
  approved: 'Approved',
  live: 'Live',
  optimising: 'Optimising',
};

function statusBadge(status: WorkstreamStatus) {
  const configs: Record<WorkstreamStatus, string> = {
    queued: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
    generating: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
    ready_for_review: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
    approved: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300',
    live: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300',
    optimising: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300',
  };
  return configs[status];
}

// ─── Derivations for ACTIVATED clients ───────────────────────────────────────

function deriveNextMoves(plan: ActivationPlan): string[] {
  const moves: string[] = [];
  const ws = plan.workstreams;
  if (ws.website?.status === 'queued') moves.push('Generate website brief, page structure, and homepage content');
  else if (ws.website?.status === 'ready_for_review') moves.push('Review and approve website brief and content plan');
  else if (ws.website?.status === 'approved') moves.push('Begin website development using approved brief');
  else if (ws.website?.status === 'live') moves.push('Monitor website conversion performance and schedule review');
  if (ws.gbp?.status === 'queued') moves.push('Generate GBP optimisation tasks and content calendar');
  else if (ws.gbp?.status === 'ready_for_review') moves.push('Review GBP task list and begin high-priority optimisations');
  else if (ws.gbp?.status === 'approved' || ws.gbp?.status === 'live') moves.push('Work through GBP task checklist and post weekly content');
  if (ws.seo?.status === 'queued') moves.push('Kick off SEO keyword research and content strategy');
  else if (ws.seo?.status === 'ready_for_review') moves.push('Review SEO plan and approve content priorities');
  if (ws.ads?.status === 'queued') moves.push('Define paid search targets and set up initial campaign structure');
  else if (ws.ads?.status === 'ready_for_review') moves.push('Review paid ads strategy and approve campaign plan');
  if (moves.length === 0) {
    moves.push('Continue executing across active workstreams');
    moves.push('Schedule a delivery update with the client');
  }
  return moves.slice(0, 4);
}

interface AgentFocusItem { scope: WorkstreamScope; status: WorkstreamStatus; note: string; }

function deriveAgentFocus(plan: ActivationPlan): AgentFocusItem[] {
  const items: AgentFocusItem[] = [];
  const entries = Object.entries(plan.workstreams) as [WorkstreamScope, { status: WorkstreamStatus }][];
  for (const [scope, state] of entries) {
    if (!state || !plan.selectedScope.includes(scope)) continue;
    let note = '';
    if (state.status === 'generating') note = `Agent is actively generating ${SCOPE_META[scope].label} content`;
    else if (state.status === 'ready_for_review') note = 'Output ready — awaiting your review and approval';
    else if (state.status === 'queued') note = 'Queued — tap Generate to activate this workstream';
    else if (state.status === 'approved') note = 'Approved — ready for delivery team handoff';
    else if (state.status === 'live') note = 'Live — monitoring and optimising';
    else if (state.status === 'optimising') note = 'In optimisation cycle — tracking results';
    if (note) items.push({ scope, status: state.status, note });
  }
  return items;
}

function deriveStrategySummary(si: SourceIntelligence, plan: ActivationPlan): { headline: string; supporting?: string } {
  const obj = si.growthPrescription?.primaryObjective;
  const diag = si.growthPrescription?.businessDiagnosis;
  const growthObj = si.strategyIntelligence?.growthObjective;
  const scope = plan.selectedScope;
  let headline = obj || growthObj || `Delivering a coordinated ${scopeStrategyName(scope)} to grow local visibility and enquiries.`;
  const supporting = diag && diag !== headline ? diag : undefined;
  return { headline, supporting };
}

function deriveExecutionPriorities(si: SourceIntelligence, plan: ActivationPlan): string[] {
  const stack = si.growthPrescription?.recommendedStack;
  if (stack && stack.length > 0) {
    return stack
      .sort((a, b) => a.priority - b.priority)
      .filter(item => plan.selectedScope.includes(item.product as WorkstreamScope))
      .map(item => { const meta = SCOPE_META[item.product as WorkstreamScope]; return meta ? `${meta.label} — ${item.reason}` : item.reason; })
      .slice(0, 4);
  }
  const diagPriorities = si.aiGrowthPlan?.strategyDiagnosis?.priorities;
  if (diagPriorities && diagPriorities.length > 0) {
    return diagPriorities
      .sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0))
      .slice(0, 4)
      .map((p: any) => p.action || p.description || '');
  }
  const fallbacks: Record<WorkstreamScope, string> = {
    website: 'Website Build — establish conversion-optimised online presence',
    gbp: 'GBP Optimisation — maximise map pack visibility and local trust',
    seo: 'SEO — build organic keyword rankings and content authority',
    ads: 'Paid Ads — capture high-intent search traffic immediately',
  };
  return (['website', 'gbp', 'seo', 'ads'] as WorkstreamScope[])
    .filter(s => plan.selectedScope.includes(s))
    .map(s => fallbacks[s]);
}

function deriveVisibilityObjectives(scope: WorkstreamScope[]): string[] {
  return [...new Set(scope.flatMap(s => SCOPE_META[s].outcomes))];
}

// ─── Derivations for NON-ACTIVATED clients ───────────────────────────────────

interface ChannelDeliveryState {
  label: string;
  icon: typeof Globe;
  color: string;
  statusLabel: string;
  statusCls: string;
  agentNote: string;
  dotColor: string;
}

function deriveChannelStates(client: Client): ChannelDeliveryState[] {
  const cs = client.channelStatus;
  const map: { key: keyof typeof cs; label: string; icon: typeof Globe; color: string }[] = [
    { key: 'website', label: 'Website',  icon: Globe,     color: 'text-blue-600 dark:text-blue-400' },
    { key: 'gbp',     label: 'GBP',      icon: MapPin,    color: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'seo',     label: 'SEO',      icon: Search,    color: 'text-violet-600 dark:text-violet-400' },
    { key: 'ppc',     label: 'Paid Ads', icon: Megaphone, color: 'text-amber-600 dark:text-amber-400' },
  ];

  const statusMap: Record<ChannelStatus, { label: string; cls: string; dot: string; note: (label: string) => string }> = {
    live:        { label: 'Live',         cls: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', note: l => `${l} is live and active — monitoring performance and results` },
    in_progress: { label: 'In progress',  cls: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300',           dot: 'bg-blue-500 animate-pulse', note: l => `${l} delivery is underway — work in progress` },
    paused:      { label: 'Paused',       cls: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300',       dot: 'bg-amber-400', note: l => `${l} project paused — check blockers or client sign-off needed` },
    not_started: { label: 'Not started',  cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',       dot: 'bg-slate-300 dark:bg-slate-600', note: l => `${l} not yet started — can be activated when ready` },
  };

  return map.map(({ key, label, icon, color }) => {
    const status = cs[key] ?? 'not_started';
    const cfg = statusMap[status];
    return {
      label,
      icon,
      color,
      statusLabel: cfg.label,
      statusCls: cfg.cls,
      agentNote: cfg.note(label),
      dotColor: cfg.dot,
    };
  });
}

function deriveNonActivatedMoves(client: Client): string[] {
  const moves: string[] = [];
  const cs = client.channelStatus;
  const days = client.daysSinceContact ?? (client.lastContactDate
    ? Math.floor((Date.now() - new Date(client.lastContactDate).getTime()) / 86400000)
    : 999);

  if (client.healthStatus === 'red') moves.push('At-risk account — book an immediate check-in call');
  else if (days > 21) moves.push(`No contact in ${days} days — schedule a growth review call this week`);

  if (cs.gbp === 'not_started') moves.push('GBP optimisation can begin immediately — no dependencies required');
  if (cs.gbp === 'in_progress') moves.push('Continue GBP optimisation sprint — post content and respond to reviews');
  if (cs.website === 'paused') moves.push('Unblock website project — check if client approval or assets are needed');
  if (cs.seo === 'not_started' && cs.website !== 'not_started') moves.push('Begin SEO keyword mapping once page structure is confirmed');
  if (cs.ppc === 'not_started') moves.push('Consider paid search activation to capture high-intent traffic immediately');

  if (moves.length < 2) moves.push('Run a full account review and update channel statuses');

  return moves.slice(0, 4);
}

function deriveNonActivatedHeadline(client: Client): { headline: string; supporting?: string } {
  const liveChannels = Object.values(client.channelStatus).filter(s => s === 'live').length;
  const inProgress = Object.values(client.channelStatus).filter(s => s === 'in_progress').length;

  if (liveChannels >= 2) return { headline: `${liveChannels} channels live — focus on performance tracking and expansion opportunities.` };
  if (liveChannels === 1) return { headline: 'One channel live — review performance and consider activating additional channels.', supporting: client.healthReasons[0] };
  if (inProgress > 0) return { headline: 'Delivery in progress — track milestones and keep client updated on timeline.', supporting: client.healthReasons[0] };
  return {
    headline: client.healthReasons[0] || 'Account ready for delivery — activate channels to begin execution.',
    supporting: client.healthReasons[1],
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientExecutionIntelligence({ client }: { client: Client }) {
  const [collapsed, setCollapsed] = useState(false);

  const si = client.sourceIntelligence;
  const plan = client.activationPlan;
  const isActivated = !!plan;

  // ── Activated path ────────────────────────────────────────────────────────
  const strategySummary = useMemo(() =>
    si && plan ? deriveStrategySummary(si, plan) : null,
  [si, plan]);

  const strategyName = useMemo(() =>
    plan ? scopeStrategyName(plan.selectedScope) : null,
  [plan]);

  const executionPriorities = useMemo(() =>
    si && plan ? deriveExecutionPriorities(si, plan) : [],
  [si, plan]);

  const agentFocus = useMemo(() =>
    plan ? deriveAgentFocus(plan) : [],
  [plan]);

  const nextMovesActivated = useMemo(() =>
    plan ? deriveNextMoves(plan) : [],
  [plan]);

  const visibilityObjectives = useMemo(() =>
    plan ? deriveVisibilityObjectives(plan.selectedScope) : [],
  [plan]);

  // ── Non-activated path ────────────────────────────────────────────────────
  const audit = client.scopeAudit;
  const liveCount       = Object.values(client.channelStatus).filter(s => s === 'live').length;
  const inProgressCount = Object.values(client.channelStatus).filter(s => s === 'in_progress').length;
  const isAuditMode     = !isActivated && liveCount < 2 && inProgressCount === 0;

  const channelStates = useMemo(() =>
    !isActivated && !isAuditMode ? deriveChannelStates(client) : [],
  [isActivated, isAuditMode, client]);

  const nonActivatedHeadline = useMemo(() =>
    !isActivated && !isAuditMode ? deriveNonActivatedHeadline(client) : null,
  [isActivated, isAuditMode, client]);

  const nextMovesNonActivated = useMemo(() =>
    !isActivated && !isAuditMode ? deriveNonActivatedMoves(client) : [],
  [isActivated, isAuditMode, client]);

  const panelTitle    = isActivated ? 'Growth Execution Intelligence' : isAuditMode ? 'Growth Audit' : 'Delivery Intelligence';
  const panelSubtitle = isActivated ? (strategyName ?? '') : isAuditMode ? (audit ? 'Scope recommendations ready' : 'Scanning account…') : 'Live channel status and recommended actions';

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        isActivated
          ? 'border-indigo-100 dark:border-indigo-900/50 bg-gradient-to-b from-indigo-50/60 to-white dark:from-indigo-950/20 dark:to-slate-900/0'
          : 'border-slate-200 dark:border-slate-700/60 bg-gradient-to-b from-slate-50/60 to-white dark:from-slate-800/20 dark:to-slate-900/0'
      }`}
      data-testid="client-execution-intelligence"
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
          isActivated
            ? 'hover:bg-indigo-50/80 dark:hover:bg-indigo-950/30'
            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30'
        }`}
        data-testid="execution-intelligence-toggle"
      >
        <div className="flex items-center gap-2.5">
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
            isActivated
              ? 'bg-indigo-100 dark:bg-indigo-900/50'
              : 'bg-slate-100 dark:bg-slate-800'
          }`}>
            {isActivated
              ? <BrainCircuit className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              : <Activity className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            }
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{panelTitle}</span>
              {isActivated && (
                <Badge className="text-[10px] px-1.5 py-0 h-4 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-0 font-medium">
                  AI Derived
                </Badge>
              )}
            </div>
            {collapsed && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                {panelSubtitle}
              </p>
            )}
          </div>
        </div>
        {collapsed
          ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          : <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
        }
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">

          {/* ── ACTIVATED CLIENTS ─────────────────────────────────────────── */}
          {isActivated && strategySummary && (
            <>
              {/* Strategy summary */}
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug" data-testid="execution-strategy-headline">
                  {strategySummary.headline}
                </p>
                {strategySummary.supporting && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{strategySummary.supporting}</p>
                )}
              </div>

              <div className="w-full h-px bg-indigo-100/80 dark:bg-indigo-800/30" />

              {/* Scope sold — as one coordinated strategy */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    {strategyName}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2" data-testid="execution-scope-pills">
                  {plan!.selectedScope.map(scope => {
                    const meta = SCOPE_META[scope];
                    const Icon = meta.icon;
                    return (
                      <div
                        key={scope}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                        data-testid={`scope-pill-${scope}`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                        {meta.label}
                      </div>
                    );
                  })}
                </div>
                {plan!.selectedScope.length > 1 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                    These workstreams operate as one coordinated strategy — not isolated deliverables.
                  </p>
                )}
              </div>

              {executionPriorities.length > 0 && (
                <>
                  <div className="w-full h-px bg-indigo-100/80 dark:bg-indigo-800/30" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Execution priorities</span>
                    </div>
                    <ol className="space-y-1.5" data-testid="execution-priorities-list">
                      {executionPriorities.map((priority, idx) => (
                        <li key={idx} className="flex items-start gap-2.5">
                          <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{priority}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              )}

              {agentFocus.length > 0 && (
                <>
                  <div className="w-full h-px bg-indigo-100/80 dark:bg-indigo-800/30" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active agent focus</span>
                    </div>
                    <div className="space-y-2" data-testid="agent-focus-list">
                      {agentFocus.map(item => {
                        const meta = SCOPE_META[item.scope];
                        const Icon = meta.icon;
                        return (
                          <div key={item.scope} className="flex items-start gap-2.5">
                            <div className={`shrink-0 mt-0.5 h-5 w-5 rounded-md flex items-center justify-center ${
                              item.status === 'generating' ? 'bg-blue-100 dark:bg-blue-950/50' :
                              item.status === 'ready_for_review' ? 'bg-amber-100 dark:bg-amber-950/50' :
                              'bg-slate-100 dark:bg-slate-800'
                            }`}>
                              {item.status === 'generating' ? <Loader2 className="h-3 w-3 text-blue-600 dark:text-blue-400 animate-spin" /> :
                               item.status === 'ready_for_review' ? <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" /> :
                               item.status === 'live' || item.status === 'optimising' || item.status === 'approved'
                                 ? <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                 : <Clock className="h-3 w-3 text-slate-400" />
                              }
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <Icon className={`h-3 w-3 ${meta.color}`} />
                                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{meta.label}</span>
                                <span className={`text-[10px] px-1.5 py-px rounded-full font-medium ${statusBadge(item.status)}`}>
                                  {STATUS_LABEL[item.status]}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">{item.note}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <div className="w-full h-px bg-indigo-100/80 dark:bg-indigo-800/30" />

              {/* Next delivery moves */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Next delivery moves</span>
                </div>
                <ul className="space-y-1.5" data-testid="next-delivery-moves">
                  {nextMovesActivated.map((move, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <ArrowRight className="h-3 w-3 text-indigo-400 dark:text-indigo-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{move}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {visibilityObjectives.length > 0 && (
                <>
                  <div className="w-full h-px bg-indigo-100/80 dark:bg-indigo-800/30" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Visibility objectives</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5" data-testid="visibility-objectives">
                      {visibilityObjectives.map(obj => (
                        <span key={obj} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/50">
                          <TrendingUp className="h-3 w-3" />
                          {obj}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── AUDIT MODE (non-activated, idle channels) ─────────────────── */}
          {!isActivated && isAuditMode && (
            <>
              {/* Audit status banner */}
              {!audit ? (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">Growth audit running</p>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">
                      Scanning channel presence, identifying what can begin immediately, and generating scope recommendations…
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Audit complete</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{audit.auditSummary}</p>
                </div>
              )}

              <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />

              {/* Channel readiness */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <ScanLine className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Channel readiness</span>
                </div>
                <div className="space-y-2" data-testid="channel-readiness-list">
                  {([
                    { scope: 'website' as WorkstreamScope, label: 'Website', icon: Globe, color: 'text-blue-600 dark:text-blue-400' },
                    { scope: 'gbp'     as WorkstreamScope, label: 'GBP / Local', icon: MapPin, color: 'text-emerald-600 dark:text-emerald-400' },
                    { scope: 'seo'     as WorkstreamScope, label: 'SEO', icon: Search, color: 'text-violet-600 dark:text-violet-400' },
                    { scope: 'ads'     as WorkstreamScope, label: 'Paid Ads', icon: Megaphone, color: 'text-amber-600 dark:text-amber-400' },
                  ] as const).map(({ scope, label, icon: Icon, color }) => {
                    const readiness = audit?.channelReadiness?.[scope];
                    const status: ChannelReadinessStatus | undefined = readiness?.status;
                    const cfg = !audit ? {
                      badge: 'bg-slate-100 dark:bg-slate-800 text-slate-500', dot: 'bg-slate-300',
                      label: 'Scanning…', icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,
                    } : status === 'can_begin_immediately' ? {
                      badge: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500',
                      label: 'Can begin immediately', icon: <Zap className="h-2.5 w-2.5" />,
                    } : status === 'recommended' ? {
                      badge: 'bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800', dot: 'bg-violet-500',
                      label: 'Recommended', icon: <Sparkles className="h-2.5 w-2.5" />,
                    } : status === 'needs_setup' ? {
                      badge: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800', dot: 'bg-amber-400',
                      label: 'Needs setup', icon: <AlertCircle className="h-2.5 w-2.5" />,
                    } : {
                      badge: 'bg-slate-100 dark:bg-slate-800 text-slate-400', dot: 'bg-slate-200',
                      label: 'Not applicable', icon: null,
                    };
                    const isHighlight = status === 'can_begin_immediately' || status === 'recommended';
                    return (
                      <div key={scope} className={`flex items-start gap-2.5 ${!isHighlight && audit ? 'opacity-60' : ''}`}>
                        <div className={`shrink-0 mt-0.5 h-5 w-5 rounded-md flex items-center justify-center ${
                          status === 'can_begin_immediately' ? 'bg-emerald-100 dark:bg-emerald-950/50' :
                          status === 'recommended' ? 'bg-violet-100 dark:bg-violet-950/50' :
                          'bg-slate-100 dark:bg-slate-800'
                        }`}>
                          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Icon className={`h-3 w-3 ${color}`} />
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-px rounded-full font-medium ${cfg.badge}`}>
                              {cfg.icon}{cfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {readiness?.note || (audit ? '' : 'Assessing…')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recommended scope */}
              {audit && audit.recommendedScope.length > 0 && (
                <>
                  <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Recommended scope</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5" data-testid="recommended-scope-pills">
                      {audit.recommendedScope.map(s => {
                        const meta = { website: { label: 'Website Build', icon: Globe }, gbp: { label: 'GBP / Local', icon: MapPin }, seo: { label: 'SEO', icon: Search }, ads: { label: 'Paid Ads', icon: Megaphone } }[s];
                        const Icon = meta.icon;
                        return (
                          <span key={s} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50 font-medium">
                            <Icon className="h-3 w-3" />{meta.label}
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Assign these channels in the client profile to begin execution.</p>
                  </div>
                </>
              )}

              {/* Immediate opportunities */}
              {audit && audit.immediateOpportunities.length > 0 && (
                <>
                  <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Immediate opportunities</span>
                    </div>
                    <ul className="space-y-1.5" data-testid="immediate-opportunities-list">
                      {audit.immediateOpportunities.map((opp, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <ArrowRight className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{opp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Blockers */}
              {audit && audit.blockers.length > 0 && (
                <>
                  <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Blockers</span>
                    </div>
                    <ul className="space-y-1.5">
                      {audit.blockers.map((b, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                          <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── NON-ACTIVATED WITH ACTIVE CHANNELS (standard delivery view) ── */}
          {!isActivated && !isAuditMode && nonActivatedHeadline && (
            <>
              {/* Delivery headline */}
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">
                  {nonActivatedHeadline.headline}
                </p>
                {nonActivatedHeadline.supporting && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{nonActivatedHeadline.supporting}</p>
                )}
              </div>

              <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />

              {/* Channel delivery states */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Radio className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Delivery channel status
                  </span>
                </div>
                <div className="space-y-2" data-testid="channel-delivery-states">
                  {channelStates.map(channel => {
                    const Icon = channel.icon;
                    const isActive = channel.statusLabel === 'Live' || channel.statusLabel === 'In progress';
                    return (
                      <div key={channel.label} className={`flex items-start gap-2.5 ${!isActive ? 'opacity-60' : ''}`}>
                        <div className={`shrink-0 mt-0.5 h-5 w-5 rounded-md flex items-center justify-center ${
                          channel.statusLabel === 'Live' ? 'bg-emerald-100 dark:bg-emerald-950/50' :
                          channel.statusLabel === 'In progress' ? 'bg-blue-100 dark:bg-blue-950/50' :
                          channel.statusLabel === 'Paused' ? 'bg-amber-100 dark:bg-amber-950/50' :
                          'bg-slate-100 dark:bg-slate-800'
                        }`}>
                          <span className={`h-2 w-2 rounded-full ${channel.dotColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Icon className={`h-3 w-3 ${channel.color}`} />
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{channel.label}</span>
                            <span className={`text-[10px] px-1.5 py-px rounded-full font-medium ${channel.statusCls}`}>
                              {channel.statusLabel}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{channel.agentNote}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />

              {/* Next moves */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Recommended next moves</span>
                </div>
                <ul className="space-y-1.5" data-testid="recommended-next-moves">
                  {nextMovesNonActivated.map((move, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <ArrowRight className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{move}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}
