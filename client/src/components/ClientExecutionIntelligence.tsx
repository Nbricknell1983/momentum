import { useState, useMemo } from 'react';
import {
  BrainCircuit, ChevronDown, ChevronUp, Globe, MapPin, Search, Megaphone,
  Target, Zap, ArrowRight, CheckCircle2, Clock, Loader2, Eye,
  TrendingUp, Users, AlertCircle, Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Client, WorkstreamScope, WorkstreamStatus, ActivationPlan, SourceIntelligence } from '@/lib/types';

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

// ─── Workstream status helpers ────────────────────────────────────────────────

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

// ─── Next delivery moves derivation ──────────────────────────────────────────

function deriveNextMoves(plan: ActivationPlan): string[] {
  const moves: string[] = [];
  const ws = plan.workstreams;

  // Website
  if (ws.website?.status === 'queued') {
    moves.push('Generate website brief, page structure, and homepage content');
  } else if (ws.website?.status === 'ready_for_review') {
    moves.push('Review and approve website brief and content plan');
  } else if (ws.website?.status === 'approved') {
    moves.push('Begin website development using approved brief');
  } else if (ws.website?.status === 'live') {
    moves.push('Monitor website conversion performance and schedule review');
  }

  // GBP
  if (ws.gbp?.status === 'queued') {
    moves.push('Generate GBP optimisation tasks and content calendar');
  } else if (ws.gbp?.status === 'ready_for_review') {
    moves.push('Review GBP task list and begin high-priority optimisations');
  } else if (ws.gbp?.status === 'approved' || ws.gbp?.status === 'live') {
    moves.push('Work through GBP task checklist and post weekly content');
  }

  // SEO
  if (ws.seo?.status === 'queued') {
    moves.push('Kick off SEO keyword research and content strategy');
  } else if (ws.seo?.status === 'ready_for_review') {
    moves.push('Review SEO plan and approve content priorities');
  }

  // Ads
  if (ws.ads?.status === 'queued') {
    moves.push('Define paid search targets and set up initial campaign structure');
  } else if (ws.ads?.status === 'ready_for_review') {
    moves.push('Review paid ads strategy and approve campaign plan');
  }

  // Generic fallbacks if nothing specific
  if (moves.length === 0) {
    moves.push('Continue executing across active workstreams');
    moves.push('Schedule a delivery update with the client');
  }

  return moves.slice(0, 4);
}

// ─── Agent focus derivation ───────────────────────────────────────────────────

interface AgentFocusItem {
  scope: WorkstreamScope;
  status: WorkstreamStatus;
  note: string;
}

function deriveAgentFocus(plan: ActivationPlan): AgentFocusItem[] {
  const items: AgentFocusItem[] = [];
  const entries = Object.entries(plan.workstreams) as [WorkstreamScope, { status: WorkstreamStatus }][];

  for (const [scope, state] of entries) {
    if (!state || !plan.selectedScope.includes(scope)) continue;
    let note = '';
    if (state.status === 'generating') {
      note = `Agent is actively generating ${SCOPE_META[scope].label} content`;
    } else if (state.status === 'ready_for_review') {
      note = `Output ready — awaiting your review and approval`;
    } else if (state.status === 'queued') {
      note = `Queued — tap Generate to activate this workstream`;
    } else if (state.status === 'approved') {
      note = `Approved — ready for delivery team handoff`;
    } else if (state.status === 'live') {
      note = `Live — monitoring and optimising`;
    } else if (state.status === 'optimising') {
      note = `In optimisation cycle — tracking results`;
    }
    if (note) items.push({ scope, status: state.status, note });
  }

  return items;
}

// ─── Strategy summary helpers ─────────────────────────────────────────────────

function deriveStrategySummary(si: SourceIntelligence, plan: ActivationPlan): { headline: string; supporting?: string } {
  const obj = si.growthPrescription?.primaryObjective;
  const diag = si.growthPrescription?.businessDiagnosis;
  const growthObj = si.strategyIntelligence?.growthObjective;
  const scope = plan.selectedScope;

  let headline = '';
  if (obj) {
    headline = obj;
  } else if (growthObj) {
    headline = growthObj;
  } else {
    headline = `Delivering a coordinated ${scopeStrategyName(scope)} to grow local visibility and enquiries.`;
  }

  const supporting = diag && diag !== headline ? diag : undefined;

  return { headline, supporting };
}

// ─── Execution priorities derivation ─────────────────────────────────────────

function deriveExecutionPriorities(si: SourceIntelligence, plan: ActivationPlan): string[] {
  // Try growthPrescription.recommendedStack first
  const stack = si.growthPrescription?.recommendedStack;
  if (stack && stack.length > 0) {
    return stack
      .sort((a, b) => a.priority - b.priority)
      .filter(item => plan.selectedScope.includes(item.product as WorkstreamScope))
      .map(item => {
        const meta = SCOPE_META[item.product as WorkstreamScope];
        return meta ? `${meta.label} — ${item.reason}` : item.reason;
      })
      .slice(0, 4);
  }

  // Try strategyDiagnosis.priorities
  const diagPriorities = si.aiGrowthPlan?.strategyDiagnosis?.priorities;
  if (diagPriorities && diagPriorities.length > 0) {
    return diagPriorities
      .sort((a: any, b: any) => (a.rank ?? 0) - (b.rank ?? 0))
      .slice(0, 4)
      .map((p: any) => p.action || p.description || '');
  }

  // Fallback: derive from scope order with standard reasoning
  const scopeOrder: WorkstreamScope[] = ['website', 'gbp', 'seo', 'ads'];
  const fallbacks: Record<WorkstreamScope, string> = {
    website: 'Website Build — establish conversion-optimised online presence',
    gbp: 'GBP Optimisation — maximise map pack visibility and local trust',
    seo: 'SEO — build organic keyword rankings and content authority',
    ads: 'Paid Ads — capture high-intent search traffic immediately',
  };
  return scopeOrder
    .filter(s => plan.selectedScope.includes(s))
    .map(s => fallbacks[s]);
}

// ─── Visibility objectives ────────────────────────────────────────────────────

function deriveVisibilityObjectives(scope: WorkstreamScope[]): string[] {
  const all = scope.flatMap(s => SCOPE_META[s].outcomes);
  return [...new Set(all)];
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientExecutionIntelligence({ client }: { client: Client }) {
  const [collapsed, setCollapsed] = useState(false);

  const si = client.sourceIntelligence;
  const plan = client.activationPlan;

  if (!si || !plan) return null;

  const strategySummary = useMemo(() => deriveStrategySummary(si, plan), [si, plan]);
  const strategyName = useMemo(() => scopeStrategyName(plan.selectedScope), [plan.selectedScope]);
  const executionPriorities = useMemo(() => deriveExecutionPriorities(si, plan), [si, plan]);
  const agentFocus = useMemo(() => deriveAgentFocus(plan), [plan]);
  const nextMoves = useMemo(() => deriveNextMoves(plan), [plan]);
  const visibilityObjectives = useMemo(() => deriveVisibilityObjectives(plan.selectedScope), [plan.selectedScope]);

  const scopeList = plan.selectedScope;

  return (
    <div
      className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-gradient-to-b from-indigo-50/60 to-white dark:from-indigo-950/20 dark:to-slate-900/0 overflow-hidden"
      data-testid="client-execution-intelligence"
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/30 transition-colors"
        data-testid="execution-intelligence-toggle"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
            <BrainCircuit className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Growth Execution Intelligence
              </span>
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border-0 font-medium">
                AI Derived
              </Badge>
            </div>
            {collapsed && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                {strategyName}
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

          {/* Strategy summary */}
          <div className="space-y-1">
            <p
              className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug"
              data-testid="execution-strategy-headline"
            >
              {strategySummary.headline}
            </p>
            {strategySummary.supporting && (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {strategySummary.supporting}
              </p>
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
              {scopeList.map(scope => {
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
            {scopeList.length > 1 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                These workstreams operate as one coordinated strategy — not isolated deliverables.
              </p>
            )}
          </div>

          <div className="w-full h-px bg-indigo-100/80 dark:bg-indigo-800/30" />

          {/* Execution priorities */}
          {executionPriorities.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Execution priorities
                </span>
              </div>
              <ol className="space-y-1.5" data-testid="execution-priorities-list">
                {executionPriorities.map((priority, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {priority}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Active agent focus */}
          {agentFocus.length > 0 && (
            <>
              <div className="w-full h-px bg-indigo-100/80 dark:bg-indigo-800/30" />
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Active agent focus
                  </span>
                </div>
                <div className="space-y-2" data-testid="agent-focus-list">
                  {agentFocus.map(item => {
                    const meta = SCOPE_META[item.scope];
                    const Icon = meta.icon;
                    return (
                      <div key={item.scope} className="flex items-start gap-2.5">
                        <div className={`shrink-0 mt-0.5 h-5 w-5 rounded-md flex items-center justify-center ${
                          item.status === 'generating'
                            ? 'bg-blue-100 dark:bg-blue-950/50'
                            : item.status === 'ready_for_review'
                            ? 'bg-amber-100 dark:bg-amber-950/50'
                            : 'bg-slate-100 dark:bg-slate-800'
                        }`}>
                          {item.status === 'generating' ? (
                            <Loader2 className="h-3 w-3 text-blue-600 dark:text-blue-400 animate-spin" />
                          ) : item.status === 'ready_for_review' ? (
                            <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                          ) : item.status === 'live' || item.status === 'optimising' || item.status === 'approved' ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Clock className="h-3 w-3 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Icon className={`h-3 w-3 ${meta.color}`} />
                            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                              {meta.label}
                            </span>
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
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Next delivery moves
              </span>
            </div>
            <ul className="space-y-1.5" data-testid="next-delivery-moves">
              {nextMoves.map((move, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <ArrowRight className="h-3 w-3 text-indigo-400 dark:text-indigo-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{move}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Visibility objectives */}
          {visibilityObjectives.length > 0 && (
            <>
              <div className="w-full h-px bg-indigo-100/80 dark:bg-indigo-800/30" />
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Visibility objectives
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5" data-testid="visibility-objectives">
                  {visibilityObjectives.map(obj => (
                    <span
                      key={obj}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/50"
                    >
                      <TrendingUp className="h-3 w-3" />
                      {obj}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}
