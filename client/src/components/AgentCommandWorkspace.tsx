/**
 * Agent Command Workspace
 *
 * Unified command layer showing:
 *   - Momentum agents (sales, strategy, proposal, onboarding, comms, growth)
 *   - AI Systems delivery agent summaries (website, SEO, GBP, content, telemetry)
 *   - Responsibility split per phase
 *   - Cross-system coordination views
 *   - Agent timeline (cross-system activity events)
 *   - Plain-language agent explanations
 *
 * NEVER collapses Momentum agents and AI Systems agents into one list.
 * Shows coordination, not duplication.
 */

import { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { format } from 'date-fns';
import {
  Cpu, Brain, Layers, GitBranch, Clock, CheckCircle2,
  AlertCircle, AlertTriangle, ChevronRight, ChevronDown,
  Shield, Zap, TrendingUp, Package, Mail, Search,
  FileText, Globe, BarChart3, Radio, Star, Info,
  ArrowRight, Circle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RootState } from '@/store';
import { deriveAgentCommandState } from '@/lib/agentCommandAdapter';
import {
  MOMENTUM_AGENT_META, AI_SYSTEMS_AGENT_META,
  STATUS_COLORS, STATUS_DOTS, STATUS_LABELS,
  RESPONSIBILITY_MAP,
} from '@/lib/agentCommandTypes';
import type {
  MomentumAgentStatus, MomentumAgentType, LinkedDeliveryAgentSummary,
  AgentStatus, CrossSystemAgentView, AgentTimelineEvent,
  AISystemsAgentType, WorkPhase,
} from '@/lib/agentCommandTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string): string {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yyyy'); } catch { return '—'; }
}

function fmtTime(d?: string): string {
  if (!d) return '—';
  try { return format(new Date(d), 'dd MMM, HH:mm'); } catch { return '—'; }
}

// ─── Icon map for Momentum agent types ───────────────────────────────────────

const MOMENTUM_ICONS: Record<MomentumAgentType, typeof Brain> = {
  lead_research:   Search,
  strategy:        Brain,
  proposal:        FileText,
  onboarding:      Package,
  sales_execution: Zap,
  follow_up:       Mail,
  account_growth:  TrendingUp,
};

const AI_SYSTEMS_ICONS: Record<AISystemsAgentType, typeof Globe> = {
  website_agent:      Globe,
  seo_agent:          BarChart3,
  gbp_agent:          Star,
  content_agent:      FileText,
  telemetry_agent:    Radio,
  optimisation_agent: Zap,
  publishing_agent:   Globe,
};

const AGENT_COLORS: Record<MomentumAgentType, string> = {
  lead_research:   'text-blue-600 dark:text-blue-400',
  strategy:        'text-violet-600 dark:text-violet-400',
  proposal:        'text-indigo-600 dark:text-indigo-400',
  onboarding:      'text-teal-600 dark:text-teal-400',
  sales_execution: 'text-amber-600 dark:text-amber-400',
  follow_up:       'text-orange-600 dark:text-orange-400',
  account_growth:  'text-emerald-600 dark:text-emerald-400',
};

const AGENT_BG: Record<MomentumAgentType, string> = {
  lead_research:   'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
  strategy:        'bg-violet-50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800',
  proposal:        'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800',
  onboarding:      'bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800',
  sales_execution: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
  follow_up:       'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800',
  account_growth:  'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
};

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status, size = 'sm' }: { status: AgentStatus; size?: 'xs' | 'sm' }) {
  const colors = STATUS_COLORS[status];
  const dot = STATUS_DOTS[status];
  const label = STATUS_LABELS[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${size === 'xs' ? 'text-[10px]' : 'text-xs'} ${colors}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

// ─── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const map = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    low: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  };
  return (
    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${(map as any)[severity] || map.low}`}>
      {severity}
    </span>
  );
}

// ─── Health badge ─────────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: string }) {
  const map = {
    healthy:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    degraded: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    critical: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300',
    on_track: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
    at_risk:  'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
    blocked:  'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300',
    completed:'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  };
  const labels: Record<string, string> = {
    healthy: 'Healthy', degraded: 'Degraded', critical: 'Critical',
    on_track: 'On Track', at_risk: 'At Risk', blocked: 'Blocked', completed: 'Complete',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${(map as any)[health] || map.on_track}`}>
      {labels[health] || health}
    </span>
  );
}

// ─── Global command bar ───────────────────────────────────────────────────────

function CommandBar({ state, view, onView }: {
  state: ReturnType<typeof deriveAgentCommandState>;
  view: string;
  onView: (v: string) => void;
}) {
  const VIEWS = [
    { id: 'overview',       label: 'Overview',       icon: Layers },
    { id: 'agents',         label: 'Momentum Agents', icon: Brain },
    { id: 'delivery',       label: 'Delivery Agents', icon: Cpu },
    { id: 'coordination',   label: 'Coordination',   icon: GitBranch },
    { id: 'timeline',       label: 'Timeline',       icon: Clock },
    { id: 'responsibility', label: 'Responsibility', icon: Shield },
  ];

  const healthColors = {
    healthy: 'bg-emerald-500',
    degraded: 'bg-amber-400',
    critical: 'bg-red-500',
  };

  return (
    <div className="border-b bg-white dark:bg-zinc-950 px-6 py-3 flex items-center gap-6 shrink-0">
      {/* Health indicator */}
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${healthColors[state.globalHealthStatus]} ${state.globalHealthStatus === 'healthy' ? '' : 'animate-pulse'}`} />
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
          {state.globalHealthStatus === 'healthy' ? 'All Systems' : state.globalHealthStatus.charAt(0).toUpperCase() + state.globalHealthStatus.slice(1)}
        </span>
      </div>

      {/* Key metrics */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span><strong className="text-zinc-800 dark:text-zinc-200">{state.totalMomentumAgentsActive}</strong> active</span>
        <span><strong className="text-zinc-800 dark:text-zinc-200">{state.leadsInProgress}</strong> leads</span>
        <span><strong className="text-zinc-800 dark:text-zinc-200">{state.clientsInDelivery}</strong> clients</span>
        {state.totalBlockers > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            <strong>{state.totalBlockers}</strong> blocker{state.totalBlockers !== 1 ? 's' : ''}
            {state.criticalBlockers > 0 && ` (${state.criticalBlockers} critical)`}
          </span>
        )}
      </div>

      {/* Tab nav */}
      <div className="ml-auto flex items-center gap-1">
        {VIEWS.map(v => (
          <button key={v.id}
            onClick={() => onView(v.id)}
            data-testid={`agent-view-${v.id}`}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
              view === v.id
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800',
            ].join(' ')}
          >
            <v.icon className="w-3 h-3" />
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Momentum agent card ──────────────────────────────────────────────────────

function MomentumAgentCard({ agent, expanded, onToggle }: {
  agent: MomentumAgentStatus;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = MOMENTUM_ICONS[agent.agentType];
  const iconColor = AGENT_COLORS[agent.agentType];
  const bg = AGENT_BG[agent.agentType];

  return (
    <div className={`rounded-xl border ${bg} overflow-hidden`} data-testid={`agent-card-${agent.agentType}`}>
      {/* Card header */}
      <button
        className="w-full p-4 text-left flex items-start gap-3"
        onClick={onToggle}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColor} bg-white dark:bg-zinc-900 border border-current/20`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{agent.name}</p>
            <StatusPill status={agent.status} size="xs" />
            {agent.blockers.length > 0 && (
              <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
                {agent.blockers.length} blocker{agent.blockers.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{agent.currentFocus}</p>
        </div>
        <div className="flex-shrink-0 mt-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-current/10 pt-3">
          {/* Next move */}
          <div className="flex items-start gap-2">
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">Next move</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{agent.nextMove}</p>
            </div>
          </div>

          {/* Blockers */}
          {agent.blockers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Blockers</p>
              {agent.blockers.map(b => (
                <div key={b.id} className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                  <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-red-700 dark:text-red-300">{b.description}</p>
                    <p className="text-[10px] text-red-500 mt-0.5">Action: {b.requiredAction}</p>
                    {b.entityName && <p className="text-[10px] text-zinc-400 mt-0.5">{b.entityName}</p>}
                  </div>
                  <SeverityBadge severity={b.severity} />
                </div>
              ))}
            </div>
          )}

          {/* Explanation */}
          <div className="p-3 rounded-lg bg-white/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 space-y-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-1">
              <Info className="w-3 h-3" /> Agent explanation
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <p className="font-medium text-zinc-600 dark:text-zinc-400">What it does</p>
                <p className="text-zinc-500 dark:text-zinc-500 leading-relaxed">{agent.explanation.whatItDoes}</p>
              </div>
              <div>
                <p className="font-medium text-zinc-600 dark:text-zinc-400">Why now</p>
                <p className="text-zinc-500 dark:text-zinc-500 leading-relaxed">{agent.explanation.whyNow}</p>
              </div>
              <div>
                <p className="font-medium text-zinc-600 dark:text-zinc-400">Needs</p>
                <p className="text-zinc-500 dark:text-zinc-500 leading-relaxed">{agent.explanation.whatItNeeds}</p>
              </div>
              <div>
                <p className="font-medium text-zinc-600 dark:text-zinc-400">Success looks like</p>
                <p className="text-zinc-500 dark:text-zinc-500 leading-relaxed">{agent.explanation.whatSuccessLooksLike}</p>
              </div>
            </div>
          </div>

          {/* Expected outcome */}
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">Expected outcome</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{agent.expectedOutcome.expectedOutcome}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{agent.expectedOutcome.timeframe}</p>
            </div>
          </div>

          {/* Recent activity */}
          {agent.recentActivity.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Recent activity</p>
              {agent.recentActivity.slice(0, 3).map(a => (
                <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                  <Circle className="w-2 h-2 text-zinc-300 flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">{a.description}</p>
                    {a.entityName && <p className="text-[10px] text-zinc-400 mt-0.5">{a.entityName} · {fmtDate(a.timestamp)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Metrics */}
          {agent.metrics && (
            <div className="flex items-center gap-4 text-xs pt-1 border-t border-current/10">
              <span className="text-zinc-500">Processed: <strong className="text-zinc-700 dark:text-zinc-300">{agent.metrics.totalProcessed}</strong></span>
              <span className="text-zinc-500">Pending: <strong className="text-zinc-700 dark:text-zinc-300">{agent.metrics.pendingItems}</strong></span>
              <span className="text-zinc-500">Success: <strong className="text-zinc-700 dark:text-zinc-300">{Math.round(agent.metrics.successRate * 100)}%</strong></span>
            </div>
          )}

          {/* Client visibility */}
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <Shield className="w-3 h-3" />
            <span>Client visibility: <strong>{agent.clientVisibility === 'internal_only' ? 'Internal only' : agent.clientVisibility === 'summarised' ? 'Summarised version only' : 'Full'}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AI Systems delivery agent card ──────────────────────────────────────────

function DeliveryAgentCard({ agent }: { agent: LinkedDeliveryAgentSummary }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = AI_SYSTEMS_ICONS[agent.agentType] || Globe;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" data-testid={`delivery-agent-${agent.agentType}`}>
      <button className="w-full p-4 text-left flex items-start gap-3" onClick={() => setExpanded(v => !v)}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-zinc-500 bg-zinc-100 dark:bg-zinc-800">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{agent.name}</p>
            <StatusPill status={agent.status} size="xs" />
            <Badge variant="outline" className="text-[10px] py-0">AI Systems</Badge>
            {agent.approvalsNeeded.length > 0 && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                {agent.approvalsNeeded.length} approval{agent.approvalsNeeded.length !== 1 ? 's' : ''} needed
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{agent.currentFocus}</p>
          {agent.linkedClientName && <p className="text-[10px] text-zinc-400 mt-0.5">{agent.linkedClientName}</p>}
        </div>
        <div className="flex-shrink-0 mt-0.5">
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-3">
          {agent.approvalsNeeded.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">Approvals needed from Momentum</p>
              {agent.approvalsNeeded.map((a, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">{a}</p>
                </div>
              ))}
            </div>
          )}
          {agent.recentCompletedWork.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Recent completed work</p>
              {agent.recentCompletedWork.map((w, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{w}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-start gap-2">
            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">Next expected move</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{agent.nextExpectedMove}</p>
            </div>
          </div>
          <p className="text-[10px] text-zinc-400">Last updated: {fmtDate(agent.lastUpdated)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Timeline panel ───────────────────────────────────────────────────────────

function AgentTimeline({ events }: { events: AgentTimelineEvent[] }) {
  const EVENT_ICONS: Record<string, typeof Clock> = {
    research_completed: Search, strategy_generated: Brain,
    proposal_prepared: FileText, proposal_accepted: CheckCircle2,
    onboarding_started: Package, onboarding_ready: CheckCircle2,
    tenant_provisioned: Cpu, website_structure_generated: Globe,
    website_html_generated: Globe, content_produced: FileText,
    gbp_optimised: Star, seo_setup_completed: BarChart3,
    telemetry_scan_completed: Radio, optimisation_triggered: Zap,
    follow_up_sent: Mail, portal_digest_sent: Mail,
    upsell_identified: TrendingUp, account_review_completed: CheckCircle2,
  };

  return (
    <div className="space-y-0" data-testid="agent-timeline">
      {events.length === 0 && (
        <div className="text-center py-8 text-zinc-400">
          <Clock className="w-6 h-6 mx-auto mb-2 opacity-40" />
          <p className="text-xs">No events yet — activity will appear as agents work through the pipeline.</p>
        </div>
      )}
      {events.map((ev, i) => {
        const Icon = EVENT_ICONS[ev.eventType] || Circle;
        const isMomentum = ev.agentSystem === 'momentum';
        return (
          <div key={ev.id} className="flex items-start gap-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
            {/* System indicator */}
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isMomentum ? 'bg-violet-100 dark:bg-violet-950/40' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
              <Icon className={`w-3 h-3 ${isMomentum ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-zinc-700 dark:text-zinc-300">{ev.description}</p>
                <Badge variant="outline" className={`text-[9px] py-0 ${isMomentum ? 'border-violet-300 text-violet-600 dark:text-violet-400' : 'text-zinc-500'}`}>
                  {isMomentum ? 'Momentum' : 'AI Systems'}
                </Badge>
                {ev.isClientVisible && (
                  <span className="text-[9px] text-emerald-500 font-medium">• client visible</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {ev.entityName && <p className="text-[10px] text-zinc-400">{ev.entityName}</p>}
                <p className="text-[10px] text-zinc-400">{fmtTime(ev.timestamp)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Cross-system coordination card ──────────────────────────────────────────

function CoordinationCard({ view }: { view: CrossSystemAgentView }) {
  const [expanded, setExpanded] = useState(false);
  const PHASE_LABELS: Record<string, string> = {
    prospecting: 'Prospecting', strategy: 'Strategy', proposal: 'Proposal',
    onboarding: 'Onboarding', provisioning: 'Provisioning',
    delivery: 'Delivery', growth: 'Growth', retention: 'Retention',
  };
  const HANDOFF_LABELS: Record<string, string> = {
    not_started: 'Momentum only', handoff_pending: 'Handoff pending',
    handoff_complete: 'AI Systems delivering', bi_directional: 'Both active',
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" data-testid={`coordination-${view.entityId}`}>
      <button className="w-full p-4 text-left flex items-start gap-3" onClick={() => setExpanded(v => !v)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{view.entityName}</p>
            <Badge variant="outline" className="text-[10px] py-0">{view.entityType === 'lead' ? 'Lead' : 'Client'}</Badge>
            <HealthBadge health={view.overallHealth} />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-zinc-400">Phase: <strong className="text-zinc-600 dark:text-zinc-400">{PHASE_LABELS[view.currentPhase] || view.currentPhase}</strong></span>
            <span className="text-[10px] text-zinc-400">{HANDOFF_LABELS[view.handoffStatus] || view.handoffStatus}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <p className="text-[10px] text-zinc-400">Momentum: <strong className="text-violet-600 dark:text-violet-400">{view.momentumAgents.length}</strong></p>
            <p className="text-[10px] text-zinc-400">AI Systems: <strong className="text-zinc-600 dark:text-zinc-300">{view.deliveryAgents.length}</strong></p>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-4">
          {view.coordinationNotes.length > 0 && (
            <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Coordination notes</p>
              {view.coordinationNotes.map((n, i) => (
                <p key={i} className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5">
                  <GitBranch className="w-3 h-3 flex-shrink-0 mt-0.5 text-zinc-400" />
                  {n}
                </p>
              ))}
            </div>
          )}

          {view.momentumAgents.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide mb-2">Momentum agents</p>
              <div className="space-y-1.5">
                {view.momentumAgents.map(a => {
                  const Icon = MOMENTUM_ICONS[a.agentType];
                  return (
                    <div key={a.agentType} className="flex items-center gap-2 p-2 rounded-lg bg-violet-50 dark:bg-violet-950/20">
                      <Icon className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                      <span className="text-xs text-zinc-700 dark:text-zinc-300">{a.name}</span>
                      <StatusPill status={a.status} size="xs" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view.deliveryAgents.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">AI Systems delivery agents</p>
              <div className="space-y-1.5">
                {view.deliveryAgents.map(a => {
                  const Icon = AI_SYSTEMS_ICONS[a.agentType] || Globe;
                  return (
                    <div key={a.agentType} className="flex items-center gap-2 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800">
                      <Icon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                      <span className="text-xs text-zinc-700 dark:text-zinc-300">{a.name}</span>
                      <StatusPill status={a.status} size="xs" />
                      {a.approvalsNeeded.length > 0 && (
                        <span className="text-[10px] text-amber-500 ml-auto">{a.approvalsNeeded.length} approval{a.approvalsNeeded.length !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Responsibility map view ──────────────────────────────────────────────────

function ResponsibilityView() {
  return (
    <div className="space-y-4" data-testid="responsibility-map">
      <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">How responsibilities are split</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Momentum owns sales, strategy, and client relationships. AI Systems owns delivery. At each phase, the handoff point and coordination requirements are clearly defined.
        </p>
        <div className="flex items-center gap-4 mt-3 text-xs">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-violet-500" /> Momentum</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-zinc-400" /> AI Systems</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> Shared</div>
        </div>
      </div>

      {RESPONSIBILITY_MAP.map(phase => (
        <div key={phase.phase} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{phase.phaseLabel}</p>
            {phase.aiSystemsOwns.length === 0 && (
              <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-600 dark:text-violet-400">Momentum only</Badge>
            )}
            {phase.momentumOwns.length > 0 && phase.aiSystemsOwns.length > 0 && (
              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600 dark:text-emerald-400">Coordinated</Badge>
            )}
          </div>
          <div className="p-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wide mb-2">Momentum owns</p>
              {phase.momentumOwns.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">{r}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-2">AI Systems owns</p>
              {phase.aiSystemsOwns.length > 0
                ? phase.aiSystemsOwns.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 flex-shrink-0" />
                      <p className="text-xs text-zinc-700 dark:text-zinc-300">{r}</p>
                    </div>
                  ))
                : <p className="text-xs text-zinc-400 italic">Not yet involved</p>
              }
            </div>
          </div>
          {(phase.coordinationRequired.length > 0 || phase.momentumRetains.length > 0) && (
            <div className="px-4 pb-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 grid grid-cols-2 gap-4">
              {phase.coordinationRequired.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide mb-1">Coordination</p>
                  {phase.coordinationRequired.map((r, i) => (
                    <p key={i} className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-start gap-1">
                      <GitBranch className="w-2.5 h-2.5 flex-shrink-0 mt-0.5" />{r}
                    </p>
                  ))}
                </div>
              )}
              {phase.momentumRetains.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wide mb-1">Momentum retains</p>
                  {phase.momentumRetains.map((r, i) => (
                    <p key={i} className="text-[10px] text-zinc-500 dark:text-zinc-400">• {r}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="px-4 pb-3">
            <p className="text-[10px] text-zinc-400"><strong className="text-zinc-500">Handoff trigger:</strong> {phase.handoffTrigger}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Overview stats ───────────────────────────────────────────────────────────

function OverviewStats({ state }: { state: ReturnType<typeof deriveAgentCommandState> }) {
  const PHASE_DISTRIBUTION = [
    { label: 'Prospecting', value: state.leadsInProgress, color: 'bg-blue-400' },
    { label: 'In Delivery', value: state.clientsInDelivery, color: 'bg-violet-400' },
    { label: 'Blocked', value: state.totalBlockers, color: 'bg-red-400' },
    { label: 'Active Agents', value: state.totalMomentumAgentsActive + state.totalDeliveryAgentsActive, color: 'bg-emerald-400' },
  ];

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        {PHASE_DISTRIBUTION.map(s => (
          <div key={s.label} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
            <div className={`w-2 h-6 rounded-full ${s.color} mb-2`} />
            <p className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">{s.value}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* All blockers summary */}
      {state.momentumAgentRoster.flatMap(a => a.blockers).length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">
            Active blockers ({state.totalBlockers})
          </p>
          <div className="space-y-2">
            {state.momentumAgentRoster.flatMap(a => a.blockers).slice(0, 5).map(b => (
              <div key={b.id} className="flex items-start gap-2">
                <SeverityBadge severity={b.severity} />
                <p className="text-xs text-amber-800 dark:text-amber-300 flex-1">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent roster summary */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Momentum agent roster</p>
        <div className="space-y-2">
          {state.momentumAgentRoster.map(a => {
            const Icon = MOMENTUM_ICONS[a.agentType];
            return (
              <div key={a.agentType} className="flex items-center gap-3">
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${AGENT_COLORS[a.agentType]}`} />
                <p className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 truncate">{a.name}</p>
                <StatusPill status={a.status} size="xs" />
                {a.blockers.length > 0 && <AlertTriangle className="w-3 h-3 text-amber-500" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* System split note */}
      <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/20 p-4">
        <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-1">System architecture</p>
        <p className="text-[11px] text-violet-700 dark:text-violet-300 leading-relaxed">
          Momentum agents manage sales, strategy, proposal, onboarding, and client success. AI Systems agents handle website build, SEO, GBP, content, telemetry, and optimisation. Both systems coordinate — never duplicate.
        </p>
      </div>
    </div>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

export function AgentCommandWorkspace() {
  const leads = useSelector((state: RootState) => state.app.leads);
  const clients = useSelector((state: RootState) => state.app.clients);
  const [view, setView] = useState('overview');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const commandState = useMemo(
    () => deriveAgentCommandState(leads, clients),
    [leads, clients],
  );

  const toggleAgent = (type: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return next;
    });
  };

  const deliveryAgents = useMemo(() =>
    commandState.crossSystemViews.flatMap(v => v.deliveryAgents),
    [commandState],
  );

  return (
    <div className="flex flex-col h-full bg-background" data-testid="agent-command-workspace">
      {/* Page header */}
      <div className="px-6 py-4 border-b bg-white dark:bg-zinc-950 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Agent Command Layer</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Unified view of Momentum agents + AI Systems delivery — generated {fmtDate(commandState.generatedAt)}</p>
          </div>
        </div>
      </div>

      {/* Command bar with view selector */}
      <CommandBar state={commandState} view={view} onView={setView} />

      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-6">

            {/* OVERVIEW */}
            {view === 'overview' && (
              <div className="max-w-4xl mx-auto">
                <OverviewStats state={commandState} />
              </div>
            )}

            {/* MOMENTUM AGENTS */}
            {view === 'agents' && (
              <div className="max-w-3xl mx-auto space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Momentum Agent Roster</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">7 specialist agents operating across the sales and client success lifecycle</p>
                  </div>
                  <Badge variant="outline" className="border-violet-300 text-violet-600 dark:text-violet-400 text-xs">Momentum side</Badge>
                </div>
                {commandState.momentumAgentRoster.map(agent => (
                  <MomentumAgentCard
                    key={agent.agentType}
                    agent={agent}
                    expanded={expandedAgents.has(agent.agentType)}
                    onToggle={() => toggleAgent(agent.agentType)}
                  />
                ))}
              </div>
            )}

            {/* DELIVERY AGENTS (AI SYSTEMS) */}
            {view === 'delivery' && (
              <div className="max-w-3xl mx-auto space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">AI Systems Delivery Agents</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Lightweight summaries of delivery agent activity — managed by AI Systems</p>
                  </div>
                  <Badge variant="outline" className="text-xs text-zinc-500">AI Systems side</Badge>
                </div>
                {deliveryAgents.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400 dark:text-zinc-600">
                    <Cpu className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">No delivery agents active</p>
                    <p className="text-xs mt-1">Delivery agents activate when clients are provisioned in AI Systems</p>
                  </div>
                ) : (
                  deliveryAgents.map((a, i) => <DeliveryAgentCard key={`${a.agentType}-${i}`} agent={a} />)
                )}
              </div>
            )}

            {/* COORDINATION (cross-system per entity) */}
            {view === 'coordination' && (
              <div className="max-w-3xl mx-auto space-y-3">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Cross-System Coordination</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Per-entity view of Momentum and AI Systems agent activity — handoffs, blockers, and next moves</p>
                </div>
                {commandState.crossSystemViews.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400 dark:text-zinc-600">
                    <GitBranch className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium">No active entities</p>
                    <p className="text-xs mt-1">Add leads and clients to see cross-system coordination views</p>
                  </div>
                ) : (
                  commandState.crossSystemViews.map(v => <CoordinationCard key={v.entityId} view={v} />)
                )}
              </div>
            )}

            {/* TIMELINE */}
            {view === 'timeline' && (
              <div className="max-w-3xl mx-auto">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Agent Activity Timeline</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Cross-system events — Momentum and AI Systems activity in chronological order</p>
                </div>
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
                  <AgentTimeline events={commandState.agentTimeline} />
                </div>
              </div>
            )}

            {/* RESPONSIBILITY */}
            {view === 'responsibility' && (
              <div className="max-w-3xl mx-auto">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Responsibility Map</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Who owns what at each phase — clear handoffs, retained responsibilities, and coordination requirements</p>
                </div>
                <ResponsibilityView />
              </div>
            )}

          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export default AgentCommandWorkspace;
