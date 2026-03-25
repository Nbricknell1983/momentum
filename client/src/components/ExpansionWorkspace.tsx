/**
 * Expansion Workspace
 *
 * Premium internal view for account expansion, churn risk, referral timing,
 * and next best account actions. Manager-gated. All data is derived from live
 * Redux portfolio state — no AI or API calls required.
 *
 * Tabs:
 *   Overview      — Portfolio health summary and spotlight clients
 *   Opportunities — Upsell / cross-sell cards with conversation angles
 *   Churn Risks   — Risk alerts with severity, cause, and intervention
 *   Referrals     — Referral-ready clients with timing and ask guidance
 *   Actions       — Urgent account action queue with scripts and assets
 *   Inspection    — Signal audit trail for every triggered recommendation
 */

import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { deriveExpansionState, deriveSignalInspections } from '@/lib/expansionAdapter';
import {
  ExpansionState,
  ClientExpansionState,
  ExpansionOpportunity,
  ChurnRiskSignal,
  ReferralOpportunity,
  ExpansionNextBestAction,
  ExpansionSignalInspection,
  EXPANSION_OPPORTUNITY_LABELS,
  EXPANSION_OPPORTUNITY_COLORS,
  CHURN_SEVERITY_LABELS,
  CHURN_SEVERITY_COLORS,
  CHURN_SEVERITY_BG,
  CHURN_URGENCY_LABELS,
  REFERRAL_ASK_LABELS,
  REFERRAL_ASK_COLORS,
  EXPANSION_ACTION_LABELS,
  EXPANSION_ACTION_COLORS,
  EXPANSION_URGENCY_LABELS,
  EXPANSION_URGENCY_COLORS,
  HEALTH_TREND_LABELS,
  HEALTH_TREND_COLORS,
} from '@/lib/expansionTypes';
import {
  TrendingUp, AlertTriangle, Users, Zap, Search, ChevronRight,
  ChevronDown, Activity, Target, Shield, Award, ArrowRight,
  MessageSquare, Lightbulb, BookOpen, CheckCircle2, Clock,
  BarChart3, UserPlus, Megaphone,
} from 'lucide-react';

// ── Tab Definition ────────────────────────────────────────────────────────────

type WorkspaceTab = 'overview' | 'opportunities' | 'churn' | 'referrals' | 'actions' | 'inspection';

interface TabDef {
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  countKey?: keyof Pick<ExpansionState,
    'topOpportunities' | 'activeChurnRisks' | 'referralReadyClients' | 'urgentActions'>;
}

const TABS: TabDef[] = [
  { id: 'overview',      label: 'Overview',      icon: BarChart3 },
  { id: 'opportunities', label: 'Opportunities',  icon: TrendingUp,    countKey: 'topOpportunities' },
  { id: 'churn',         label: 'Churn Risks',    icon: AlertTriangle, countKey: 'activeChurnRisks' },
  { id: 'referrals',     label: 'Referrals',      icon: UserPlus,      countKey: 'referralReadyClients' },
  { id: 'actions',       label: 'Actions',        icon: Zap,           countKey: 'urgentActions' },
  { id: 'inspection',    label: 'Inspection',     icon: Search },
];

// ── Shared Helpers ────────────────────────────────────────────────────────────

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-zinc-100 text-zinc-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-zinc-100 text-zinc-500',
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function EvidenceList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-500">
          <CheckCircle2 className="w-3 h-3 text-zinc-400 flex-shrink-0 mt-0.5" />
          {item}
        </li>
      ))}
    </ul>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ state }: { state: ExpansionState }) {
  const tiles = [
    {
      label: 'Portfolio Health',
      value: `${state.portfolioHealthScore}%`,
      sub: 'average account score',
      icon: Activity,
      color: state.portfolioHealthScore >= 70 ? 'text-emerald-600' : state.portfolioHealthScore >= 40 ? 'text-amber-600' : 'text-red-600',
    },
    {
      label: 'Expansion Opportunities',
      value: state.totalOpportunityCount,
      sub: 'across all accounts',
      icon: TrendingUp,
      color: 'text-violet-600',
    },
    {
      label: 'Active Churn Risks',
      value: state.activeChurnRisks.length,
      sub: state.activeChurnRisks.filter(r => r.severity === 'critical').length > 0
        ? `${state.activeChurnRisks.filter(r => r.severity === 'critical').length} critical`
        : 'being monitored',
      icon: AlertTriangle,
      color: state.activeChurnRisks.some(r => r.severity === 'critical') ? 'text-red-600' : 'text-orange-600',
    },
    {
      label: 'Referral-Ready Clients',
      value: state.referralReadyClients.length,
      sub: 'in referral window',
      icon: UserPlus,
      color: 'text-emerald-600',
    },
    {
      label: 'Urgent Actions',
      value: state.urgentActions.length,
      sub: 'today or this week',
      icon: Zap,
      color: 'text-amber-600',
    },
  ];

  const spotlightClients = state.clients
    .filter(cs =>
      cs.churnRisks.some(r => r.severity === 'critical' || r.severity === 'high') ||
      cs.opportunities.length >= 2 ||
      cs.referralOpportunity?.confidence === 'high'
    )
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tiles.map(tile => (
          <div
            key={tile.label}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{tile.label}</span>
              <tile.icon className={`w-4 h-4 ${tile.color}`} />
            </div>
            <div className={`text-2xl font-bold ${tile.color}`}>{tile.value}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* Spotlight clients */}
      {spotlightClients.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-violet-500" />
            Accounts Needing Attention
          </h3>
          <div className="space-y-2">
            {spotlightClients.map(cs => {
              const criticalRisk = cs.churnRisks.find(r => r.severity === 'critical');
              const highRisk = cs.churnRisks.find(r => r.severity === 'high');
              const topOpp = cs.opportunities[0];

              return (
                <div
                  key={cs.clientId}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">
                          {cs.clientName}
                        </span>
                        <Pill
                          label={HEALTH_TREND_LABELS[cs.healthTrend.trend]}
                          className={`${HEALTH_TREND_COLORS[cs.healthTrend.trend].replace('text-', 'bg-').replace('600', '100')} ${HEALTH_TREND_COLORS[cs.healthTrend.trend]}`}
                        />
                        {criticalRisk && <Pill label="Critical Risk" className="bg-red-100 text-red-700" />}
                        {!criticalRisk && highRisk && <Pill label="High Risk" className="bg-orange-100 text-orange-700" />}
                      </div>
                      <p className="text-xs text-zinc-500">{cs.healthTrend.summary}</p>
                      {topOpp && (
                        <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                          Opportunity: {topOpp.title}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold text-zinc-700 dark:text-zinc-300">
                        {cs.healthTrend.overallScore}
                      </div>
                      <div className="text-xs text-zinc-400">health</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generated at */}
      <p className="text-xs text-zinc-400">
        Signals derived from live portfolio data · Generated {state.generatedAt}
      </p>
    </div>
  );
}

// ── Opportunity Card ──────────────────────────────────────────────────────────

function OpportunityCard({ opp }: { opp: ExpansionOpportunity }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{opp.clientName}</span>
            <Pill label={EXPANSION_OPPORTUNITY_LABELS[opp.type]} className={EXPANSION_OPPORTUNITY_COLORS[opp.type]} />
            <Pill label={opp.priority.charAt(0).toUpperCase() + opp.priority.slice(1)} className={PRIORITY_COLORS[opp.priority]} />
          </div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{opp.title}</p>
        </div>
        <Pill label={opp.confidence === 'high' ? 'High confidence' : opp.confidence === 'medium' ? 'Medium' : 'Low'} className={CONFIDENCE_COLORS[opp.confidence]} />
      </div>

      <p className="text-xs text-zinc-500 mb-3">{opp.why}</p>

      <button
        data-testid={`opp-expand-${opp.id}`}
        className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline mb-2"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {expanded ? 'Hide details' : 'Show conversation guide'}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Expected Outcome</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{opp.expectedOutcome}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> Conversation Angle
            </p>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-violet-50 dark:bg-violet-950/20 rounded p-2 italic">
              {opp.conversationAngle}
            </p>
          </div>
          {opp.estimatedImpact && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Estimated Impact</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{opp.estimatedImpact}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Evidence</p>
            <EvidenceList items={opp.evidence} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Opportunities Tab ─────────────────────────────────────────────────────────

function OpportunitiesTab({ state }: { state: ExpansionState }) {
  const [filter, setFilter] = useState<'all' | 'urgent' | 'high'>('all');

  const filtered = state.topOpportunities.filter(o => {
    if (filter === 'urgent') return o.priority === 'urgent';
    if (filter === 'high') return o.priority === 'urgent' || o.priority === 'high';
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          data-testid="opp-filter-all"
          onClick={() => setFilter('all')}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filter === 'all' ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'}`}
        >
          All ({state.topOpportunities.length})
        </button>
        <button
          data-testid="opp-filter-urgent"
          onClick={() => setFilter('urgent')}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filter === 'urgent' ? 'bg-red-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'}`}
        >
          Urgent only
        </button>
        <button
          data-testid="opp-filter-high"
          onClick={() => setFilter('high')}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${filter === 'high' ? 'bg-orange-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'}`}
        >
          Urgent + High
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No opportunities match this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(opp => <OpportunityCard key={opp.id} opp={opp} />)}
        </div>
      )}
    </div>
  );
}

// ── Churn Risk Card ───────────────────────────────────────────────────────────

function ChurnRiskCard({ risk }: { risk: ChurnRiskSignal }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border rounded-lg p-4 ${CHURN_SEVERITY_BG[risk.severity]}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{risk.clientName}</span>
            <Pill label={CHURN_SEVERITY_LABELS[risk.severity]} className={`bg-white border ${CHURN_SEVERITY_COLORS[risk.severity]}`} />
          </div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{risk.title}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <Pill label={CHURN_URGENCY_LABELS[risk.urgency]} className={
            risk.urgency === 'immediate' ? 'bg-red-100 text-red-700'
            : risk.urgency === 'this_week' ? 'bg-orange-100 text-orange-700'
            : 'bg-amber-100 text-amber-700'
          } />
        </div>
      </div>

      <p className="text-xs text-zinc-500 mb-2">{risk.likelyCause}</p>

      <button
        data-testid={`risk-expand-${risk.id}`}
        className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:underline mb-2"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {expanded ? 'Hide intervention' : 'Show intervention guide'}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-zinc-200/60 dark:border-zinc-700 pt-3">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Indicators</p>
            <EvidenceList items={risk.indicators} />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Suggested Intervention
            </p>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-white/60 dark:bg-zinc-900/60 rounded p-2">
              {risk.suggestedIntervention}
            </p>
          </div>
          <p className="text-xs text-zinc-400">Detected {risk.detectedAt}</p>
        </div>
      )}
    </div>
  );
}

// ── Churn Tab ─────────────────────────────────────────────────────────────────

function ChurnTab({ state }: { state: ExpansionState }) {
  const bySeverity = {
    critical: state.activeChurnRisks.filter(r => r.severity === 'critical'),
    high: state.activeChurnRisks.filter(r => r.severity === 'high'),
    medium: state.activeChurnRisks.filter(r => r.severity === 'medium'),
    low: state.activeChurnRisks.filter(r => r.severity === 'low'),
  };

  if (state.activeChurnRisks.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-400">
        <Shield className="w-10 h-10 mx-auto mb-3 text-emerald-400 opacity-60" />
        <p className="text-sm font-medium text-zinc-500">No churn risks detected</p>
        <p className="text-xs mt-1">All accounts are healthy based on current portfolio data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {(['critical', 'high', 'medium', 'low'] as const).map(severity => {
        const risks = bySeverity[severity];
        if (risks.length === 0) return null;
        return (
          <div key={severity}>
            <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${CHURN_SEVERITY_COLORS[severity]}`}>
              {CHURN_SEVERITY_LABELS[severity]} ({risks.length})
            </h3>
            <div className="space-y-2">
              {risks.map(risk => <ChurnRiskCard key={risk.id} risk={risk} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Referral Card ─────────────────────────────────────────────────────────────

function ReferralCard({ referral }: { referral: ReferralOpportunity }) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor =
    referral.readinessScore >= 70 ? 'text-emerald-600'
    : referral.readinessScore >= 50 ? 'text-amber-600'
    : 'text-zinc-500';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{referral.clientName}</span>
            <Pill label={REFERRAL_ASK_LABELS[referral.askStyle]} className={REFERRAL_ASK_COLORS[referral.askStyle]} />
            <Pill label={`${referral.confidence} confidence`} className={CONFIDENCE_COLORS[referral.confidence]} />
          </div>
          <div className="flex items-center gap-1">
            <span className={`text-2xl font-bold ${scoreColor}`}>{referral.readinessScore}</span>
            <span className="text-xs text-zinc-400">/100 readiness</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs text-zinc-400">{referral.suggestedTiming}</p>
        </div>
      </div>

      <button
        data-testid={`referral-expand-${referral.id}`}
        className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline mb-2"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {expanded ? 'Hide guide' : 'Show referral guide'}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> What to Say
            </p>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-emerald-50 dark:bg-emerald-950/20 rounded p-2 italic">
              {referral.conversationAngle}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Why Now</p>
            <EvidenceList items={referral.triggers} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Referrals Tab ─────────────────────────────────────────────────────────────

function ReferralsTab({ state }: { state: ExpansionState }) {
  if (state.referralReadyClients.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-400">
        <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium text-zinc-500">No referral windows open</p>
        <p className="text-xs mt-1">Referral opportunities appear when accounts are healthy, delivery is active, and relationships are warm.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-lg p-3">
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          <strong>{state.referralReadyClients.length} client{state.referralReadyClients.length > 1 ? 's are' : ' is'} in a referral window.</strong>{' '}
          Referrals are most effective when raised during or immediately after a visible win. Use the conversation guide for each account.
        </p>
      </div>
      {state.referralReadyClients.map(ref => <ReferralCard key={ref.id} referral={ref} />)}
    </div>
  );
}

// ── Action Card ───────────────────────────────────────────────────────────────

function ActionCard({ action }: { action: ExpansionNextBestAction }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{action.clientName}</span>
            <Pill label={EXPANSION_ACTION_LABELS[action.actionType]} className={EXPANSION_ACTION_COLORS[action.actionType]} />
          </div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{action.title}</p>
        </div>
        <Pill label={EXPANSION_URGENCY_LABELS[action.urgency]} className={EXPANSION_URGENCY_COLORS[action.urgency]} />
      </div>

      <button
        data-testid={`action-expand-${action.id}`}
        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {expanded ? 'Hide playbook' : 'Show what to do'}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-2">
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> What to Say
            </p>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-blue-50 dark:bg-blue-950/20 rounded p-2 italic">
              {action.whatToSay}
            </p>
          </div>
          {action.assetToReference && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                <BookOpen className="w-3 h-3" /> Asset to Reference
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{action.assetToReference}</p>
            </div>
          )}
          {action.proofPoint && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                <Award className="w-3 h-3" /> Proof Point
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{action.proofPoint}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Next Move
            </p>
            <p className="text-xs text-zinc-700 dark:text-zinc-300">{action.nextMove}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Actions Tab ───────────────────────────────────────────────────────────────

function ActionsTab({ state }: { state: ExpansionState }) {
  const today = state.urgentActions.filter(a => a.urgency === 'today');
  const thisWeek = state.urgentActions.filter(a => a.urgency === 'this_week');
  const thisMonth = state.clients
    .flatMap(cs => cs.nextBestActions)
    .filter(a => a.urgency === 'this_month')
    .slice(0, 8);

  if (state.urgentActions.length === 0 && thisMonth.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-400">
        <Zap className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium text-zinc-500">No urgent actions queued</p>
        <p className="text-xs mt-1">Actions appear as opportunities, risks, and referral windows are detected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {today.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Today ({today.length})
          </h3>
          <div className="space-y-2">
            {today.map(a => <ActionCard key={a.id} action={a} />)}
          </div>
        </div>
      )}
      {thisWeek.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-600 mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> This Week ({thisWeek.length})
          </h3>
          <div className="space-y-2">
            {thisWeek.map(a => <ActionCard key={a.id} action={a} />)}
          </div>
        </div>
      )}
      {thisMonth.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> This Month ({thisMonth.length})
          </h3>
          <div className="space-y-2">
            {thisMonth.map(a => <ActionCard key={a.id} action={a} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inspection Tab ────────────────────────────────────────────────────────────

function InspectionTab({ state }: { state: ExpansionState }) {
  const [selectedClient, setSelectedClient] = useState<string>('__all__');
  const inspections = useMemo(() => deriveSignalInspections(state), [state]);

  const clientOptions = [
    { id: '__all__', name: 'All Clients' },
    ...state.clients
      .filter(cs => cs.growthSignals.length > 0)
      .map(cs => ({ id: cs.clientId, name: cs.clientName })),
  ];

  const filtered = selectedClient === '__all__'
    ? inspections
    : inspections.filter(i => i.clientId === selectedClient);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-zinc-500">Filter by client:</label>
        <select
          data-testid="inspection-client-filter"
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
          className="text-xs border border-zinc-200 dark:border-zinc-700 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300"
        >
          {clientOptions.map(o => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-400">{filtered.length} signal{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No signals for this selection.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inspection => (
            <div
              key={inspection.signalId}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{inspection.clientName}</span>
                  <span className="mx-2 text-zinc-300">·</span>
                  <span className="text-xs text-zinc-500 font-mono">{inspection.signalType}</span>
                </div>
                <span className="text-xs text-zinc-400 flex-shrink-0">{inspection.detectedAt}</span>
              </div>
              <p className="text-xs text-zinc-500 mb-2">{inspection.why}</p>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Supporting Data</p>
                {Object.entries(inspection.supportingData).map(([k, v]) => (
                  <p key={k} className="text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-mono text-zinc-400">{k}:</span> {v}
                  </p>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-xs text-zinc-400">
                  <span className="font-semibold">Recommendation generated:</span>{' '}
                  {inspection.recommendationGenerated}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Workspace ────────────────────────────────────────────────────────────

export function ExpansionWorkspace() {
  const clients = useSelector((state: RootState) => state.app.clients);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');

  const state = useMemo(() => deriveExpansionState(clients), [clients]);

  const getCount = (countKey?: keyof Pick<ExpansionState, 'topOpportunities' | 'activeChurnRisks' | 'referralReadyClients' | 'urgentActions'>) => {
    if (!countKey) return undefined;
    return state[countKey].length;
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-600" />
              Expansion Engine
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Upsell opportunities · Churn risk · Referral timing · Account growth actions
            </p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${
              state.portfolioHealthScore >= 70 ? 'text-emerald-600'
              : state.portfolioHealthScore >= 40 ? 'text-amber-600'
              : 'text-red-600'
            }`}>
              {state.portfolioHealthScore}%
            </div>
            <div className="text-xs text-zinc-400">portfolio health</div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-4 -mb-4">
          {TABS.map(tab => {
            const count = getCount(tab.countKey);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-testid={`expansion-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-violet-600 text-violet-600'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-violet-100 text-violet-700' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {activeTab === 'overview' && <OverviewTab state={state} />}
        {activeTab === 'opportunities' && <OpportunitiesTab state={state} />}
        {activeTab === 'churn' && <ChurnTab state={state} />}
        {activeTab === 'referrals' && <ReferralsTab state={state} />}
        {activeTab === 'actions' && <ActionsTab state={state} />}
        {activeTab === 'inspection' && <InspectionTab state={state} />}
      </div>
    </div>
  );
}
