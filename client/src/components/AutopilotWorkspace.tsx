import { useMemo, useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  Zap,
  ShieldCheck,
  Clock,
  X,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  Settings,
  History,
  PlayCircle,
  PauseCircle,
  Eye,
  Loader2,
  ArrowRight,
  RefreshCw,
  Lock,
} from 'lucide-react';
import type { RootState } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import {
  db,
  collection,
  doc,
  addDoc,
  getDoc,
  setDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
} from '@/lib/firebase';
import { deriveCadenceState, applyOverrides } from '@/lib/cadenceAdapter';
import { deriveReferralCandidates } from '@/lib/referralAdapter';
import {
  deriveAutopilotDecisions,
  deriveAutopilotState,
  buildDefaultPolicy,
} from '@/lib/autopilotEngine';
import type {
  AutopilotOrgPolicy,
  AutopilotRule,
  AutopilotDecision,
  AutopilotAuditEvent,
  AutopilotGlobalMode,
  AutopilotOutcome,
} from '@/lib/autopilotTypes';
import {
  DEFAULT_AUTOPILOT_RULES,
  OUTCOME_LABELS,
  OUTCOME_STYLES,
  SAFETY_LEVEL_LABELS,
  GLOBAL_MODE_LABELS,
  GLOBAL_MODE_DESCRIPTIONS,
  ACTION_TYPE_LABELS,
  SAFETY_LEVEL_DESCRIPTIONS,
} from '@/lib/autopilotTypes';

// ── helpers ───────────────────────────────────────────────────────────────────

function nowLabel(): string {
  return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

const SAFETY_DOT: Record<string, string> = {
  low_risk: 'bg-emerald-400',
  medium_risk: 'bg-amber-400',
  high_risk: 'bg-red-400',
  restricted: 'bg-zinc-400',
};

const OUTCOME_ICONS: Record<AutopilotOutcome, typeof Zap> = {
  auto_allowed: Zap,
  approval_required: Clock,
  recommendation_only: Eye,
  blocked: X,
};

const GLOBAL_MODE_COLORS: Record<AutopilotGlobalMode, string> = {
  active: 'text-emerald-600 dark:text-emerald-400',
  approval_only: 'text-amber-600 dark:text-amber-400',
  recommendations_only: 'text-blue-600 dark:text-blue-400',
  off: 'text-zinc-500 dark:text-zinc-400',
};

// ── Decision card ─────────────────────────────────────────────────────────────

function DecisionCard({ decision }: { decision: AutopilotDecision }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = OUTCOME_ICONS[decision.outcome] ?? Info;

  return (
    <div
      data-testid={`autopilot-decision-${decision.id}`}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden"
    >
      <div className="px-4 py-3 flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          decision.outcome === 'auto_allowed' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' :
          decision.outcome === 'approval_required' ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400' :
          decision.outcome === 'recommendation_only' ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400' :
          'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
        }`}>
          <Icon className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{decision.entityName}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${OUTCOME_STYLES[decision.outcome]}`}>
              {OUTCOME_LABELS[decision.outcome]}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <span className={`w-1.5 h-1.5 rounded-full ${SAFETY_DOT[decision.safetyLevel]}`} />
              {SAFETY_LEVEL_LABELS[decision.safetyLevel]}
            </span>
          </div>
          <p className="text-xs text-zinc-500">{decision.actionLabel} · {decision.decidedAt}</p>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-4 space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Explanation</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{decision.explanation}</p>
          </div>
          {decision.context.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Context facts</p>
              <ul className="space-y-0.5">
                {decision.context.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-500">
                    <ArrowRight className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {decision.whatWouldChange && (
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-0.5">To change this outcome</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">{decision.whatWouldChange}</p>
            </div>
          )}
          {decision.overriddenBy && (
            <div className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Override: {decision.overriddenBy}</span>
            </div>
          )}
          <p className="text-[10px] text-zinc-400">Rule applied: {decision.ruleLabel} ({decision.ruleId})</p>
        </div>
      )}
    </div>
  );
}

// ── Rule row ──────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule: AutopilotRule;
  onChange: (id: string, field: 'enabled' | 'orgOverride', value: boolean | AutopilotOutcome | undefined) => void;
  globalMode: AutopilotGlobalMode;
}

function RuleRow({ rule, onChange, globalMode }: RuleRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isOff = globalMode === 'off';
  const effectiveOutcome = isOff ? 'blocked' : (rule.orgOverride ?? rule.defaultOutcome);

  const OUTCOME_OPTIONS: AutopilotOutcome[] = ['auto_allowed', 'approval_required', 'recommendation_only', 'blocked'];

  return (
    <div data-testid={`autopilot-rule-${rule.id}`} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Enabled toggle */}
        <button
          data-testid={`rule-toggle-${rule.id}`}
          onClick={() => onChange(rule.id, 'enabled', !rule.enabled)}
          disabled={isOff}
          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${rule.enabled && !isOff ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-600'} disabled:opacity-50`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${rule.enabled && !isOff ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{rule.label}</span>
            <span className={`flex items-center gap-1 text-[10px] font-medium ${rule.enabled ? 'text-zinc-500' : 'text-zinc-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${SAFETY_DOT[rule.safetyLevel]}`} />
              {SAFETY_LEVEL_LABELS[rule.safetyLevel]}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">{ACTION_TYPE_LABELS[rule.actionType]}</p>
        </div>

        {/* Outcome selector */}
        <select
          data-testid={`rule-outcome-${rule.id}`}
          value={rule.orgOverride ?? rule.defaultOutcome}
          onChange={e => onChange(rule.id, 'orgOverride', e.target.value === rule.defaultOutcome ? undefined : e.target.value as AutopilotOutcome)}
          disabled={!rule.enabled || isOff}
          className="text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-700 dark:text-zinc-300 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-violet-400"
        >
          {OUTCOME_OPTIONS.map(o => (
            <option key={o} value={o}>
              {OUTCOME_LABELS[o]}{o === rule.defaultOutcome ? ' (default)' : ''}
            </option>
          ))}
        </select>

        {rule.orgOverride && (
          <button
            onClick={() => onChange(rule.id, 'orgOverride', undefined)}
            className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline flex-shrink-0"
          >
            Reset
          </button>
        )}

        <button
          onClick={() => setExpanded(e => !e)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 ml-12 space-y-2">
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{rule.description}</p>
          <p className="text-xs text-zinc-500 leading-relaxed italic">{rule.rationale}</p>
          {rule.escalationConditions?.length ? (
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 mb-1">Escalation conditions (switch to "{OUTCOME_LABELS[rule.escalatedOutcome ?? 'blocked']}"):</p>
              {rule.escalationConditions.map((c, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-300">• {c.label}</p>
              ))}
            </div>
          ) : null}
          {rule.orgOverride && (
            <p className="text-[10px] text-violet-600 dark:text-violet-400">Org override active: default "{OUTCOME_LABELS[rule.defaultOutcome]}" → "{OUTCOME_LABELS[rule.orgOverride]}"</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Audit event row ───────────────────────────────────────────────────────────

function AuditEventRow({ event }: { event: AutopilotAuditEvent }) {
  const icons: Record<string, typeof Zap> = {
    decision_made: Eye,
    action_auto_run: Zap,
    approval_requested: Clock,
    approval_granted: CheckCircle,
    approval_denied: X,
    action_blocked: Lock,
    policy_changed: Settings,
    global_mode_changed: RefreshCw,
  };
  const Icon = icons[event.eventType] ?? Info;

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <Icon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
            {event.eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </span>
          {event.entityName && <span className="text-xs text-zinc-500">{event.entityName}</span>}
          {event.outcome && (
            <span className={`text-[10px] font-medium px-1 py-0.5 rounded border ${OUTCOME_STYLES[event.outcome]}`}>
              {OUTCOME_LABELS[event.outcome]}
            </span>
          )}
        </div>
        {event.note && <p className="text-xs text-zinc-500 mt-0.5">{event.note}</p>}
        <p className="text-[10px] text-zinc-400 mt-0.5">{event.occurredAt} · {event.performedBy}</p>
      </div>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type Tab = 'policy' | 'decisions' | 'pending' | 'blocked' | 'audit';

const TABS: { id: Tab; label: string }[] = [
  { id: 'policy', label: 'Policy Settings' },
  { id: 'decisions', label: 'Live Decisions' },
  { id: 'pending', label: 'Pending Approval' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'audit', label: 'Audit Trail' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function AutopilotWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>('policy');
  const [policy, setPolicy] = useState<AutopilotOrgPolicy | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AutopilotAuditEvent[]>([]);

  const clients = useSelector((s: RootState) => s.app.clients);
  const leads = useSelector((s: RootState) => s.app.leads);
  const { orgId, user } = useAuth();
  const userName = (user as { displayName?: string | null })?.displayName ?? user?.email ?? 'System';

  // ── Load policy from Firestore ──────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !db) { setPolicyLoading(false); return; }
    const ref = doc(db, 'orgs', orgId, 'autopilotPolicy', 'policy');
    getDoc(ref).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as AutopilotOrgPolicy;
        // Merge any new default rules not in saved policy
        const savedIds = new Set(data.rules.map(r => r.id));
        const merged = [
          ...data.rules,
          ...DEFAULT_AUTOPILOT_RULES.filter(r => !savedIds.has(r.id)),
        ];
        setPolicy({ ...data, rules: merged });
      } else {
        setPolicy(buildDefaultPolicy(orgId));
      }
      setPolicyLoading(false);
    }).catch(() => {
      setPolicy(buildDefaultPolicy(orgId));
      setPolicyLoading(false);
    });
  }, [orgId]);

  // ── Load audit events ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !db) return;
    const ref = collection(db, 'orgs', orgId, 'autopilotAudit');
    const q = query(ref, orderBy('occurredAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, snap => {
      setAuditEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as AutopilotAuditEvent)));
    });
    return () => unsub();
  }, [orgId]);

  // ── Derive decisions from live data ─────────────────────────────────────────
  const rawCadence = useMemo(() => deriveCadenceState(leads, clients), [leads, clients]);
  const cadenceItems = useMemo(() => applyOverrides(rawCadence.allItems, {}), [rawCadence]);
  const pendingCadenceItems = useMemo(() => cadenceItems.filter(i => i.status === 'pending'), [cadenceItems]);

  const referralCandidates = useMemo(() => deriveReferralCandidates(clients), [clients]);

  const decisions = useMemo(() => {
    if (!policy) return [];
    return deriveAutopilotDecisions(policy, clients, leads, referralCandidates, pendingCadenceItems);
  }, [policy, clients, leads, referralCandidates, pendingCadenceItems]);

  const apState = useMemo(() => {
    if (!policy) return null;
    return deriveAutopilotState(policy, decisions);
  }, [policy, decisions]);

  // ── Policy mutation helpers ─────────────────────────────────────────────────
  const updateGlobalMode = useCallback((mode: AutopilotGlobalMode) => {
    if (!policy) return;
    setPolicy(p => p ? { ...p, globalMode: mode, updatedAt: nowLabel(), updatedBy: userName } : p);
  }, [policy, userName]);

  const updateRule = useCallback((id: string, field: 'enabled' | 'orgOverride', value: boolean | AutopilotOutcome | undefined) => {
    setPolicy(p => {
      if (!p) return p;
      const rules = p.rules.map(r => r.id === id ? { ...r, [field]: value } : r);
      return { ...p, rules, updatedAt: nowLabel(), updatedBy: userName };
    });
  }, [userName]);

  const savePolicy = useCallback(async () => {
    if (!policy || !orgId || !db) return;
    setSaving(true);
    try {
      const ref = doc(db, 'orgs', orgId, 'autopilotPolicy', 'policy');
      await setDoc(ref, { ...policy, updatedAt: nowLabel(), updatedBy: userName });
      // Log audit event
      await addDoc(collection(db, 'orgs', orgId, 'autopilotAudit'), {
        orgId,
        eventType: 'policy_changed',
        performedBy: userName,
        note: `Policy saved. Global mode: ${policy.globalMode}`,
        occurredAt: nowLabel(),
      } satisfies Omit<AutopilotAuditEvent, 'id'>);
    } finally {
      setSaving(false);
    }
  }, [policy, orgId, userName]);

  const changeGlobalMode = useCallback(async (mode: AutopilotGlobalMode) => {
    updateGlobalMode(mode);
    if (!orgId || !db) return;
    await addDoc(collection(db, 'orgs', orgId, 'autopilotAudit'), {
      orgId,
      eventType: 'global_mode_changed',
      performedBy: userName,
      note: `Global mode changed to: ${mode}`,
      occurredAt: nowLabel(),
    } satisfies Omit<AutopilotAuditEvent, 'id'>).catch(() => {});
  }, [updateGlobalMode, orgId, userName]);

  // ── Derived decision groups ─────────────────────────────────────────────────
  const autoDecisions = decisions.filter(d => d.outcome === 'auto_allowed');
  const pendingDecisions = decisions.filter(d => d.outcome === 'approval_required');
  const blockedDecisions = decisions.filter(d => d.outcome === 'blocked');
  const recDecisions = decisions.filter(d => d.outcome === 'recommendation_only');

  if (policyLoading || !policy || !apState) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Autopilot Policy</h1>
              <span className={`text-xs font-semibold ${GLOBAL_MODE_COLORS[policy.globalMode]}`}>
                · {GLOBAL_MODE_LABELS[policy.globalMode]}
              </span>
            </div>
            <p className="text-xs text-zinc-500">{GLOBAL_MODE_DESCRIPTIONS[policy.globalMode]}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-zinc-400">Last saved: {policy.updatedAt}</span>
            <button
              data-testid="autopilot-save"
              onClick={savePolicy}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Save Policy
            </button>
          </div>
        </div>

        {/* Summary row */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {[
            { label: 'Auto-Run', count: apState.autoRunCount, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Pending Approval', count: apState.approvalPendingCount, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Recommendation', count: apState.recommendationCount, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Blocked', count: apState.blockedCount, color: 'text-zinc-500' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span className={`font-bold text-sm ${s.color}`}>{s.count}</span>
              <span className="text-zinc-500">{s.label}</span>
            </div>
          ))}
          <span className="text-[10px] text-zinc-400 ml-auto">Derived: {apState.generatedAt}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 flex-shrink-0">
        <div className="flex">
          {TABS.map(tab => {
            const badge =
              tab.id === 'decisions' ? decisions.length
                : tab.id === 'pending' ? pendingDecisions.length
                : tab.id === 'blocked' ? blockedDecisions.length
                : tab.id === 'audit' ? auditEvents.length
                : null;
            return (
              <button
                key={tab.id}
                data-testid={`autopilot-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {tab.label}
                {badge !== null && badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">

        {/* Policy Settings */}
        {activeTab === 'policy' && (
          <div className="space-y-8">
            {/* Global mode */}
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">Global Autopilot Mode</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['active', 'approval_only', 'recommendations_only', 'off'] as AutopilotGlobalMode[]).map(mode => (
                  <button
                    key={mode}
                    data-testid={`global-mode-${mode}`}
                    onClick={() => changeGlobalMode(mode)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      policy.globalMode === mode
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-violet-300 dark:hover:border-violet-700'
                    }`}
                  >
                    <div className={`text-xs font-bold mb-1 ${policy.globalMode === mode ? GLOBAL_MODE_COLORS[mode] : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {GLOBAL_MODE_LABELS[mode]}
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">{GLOBAL_MODE_DESCRIPTIONS[mode]}</p>
                  </button>
                ))}
              </div>
            </section>

            {/* Safety level legend */}
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-3">Safety Level Definitions</h2>
              <div className="grid grid-cols-2 gap-3">
                {(['low_risk', 'medium_risk', 'high_risk', 'restricted'] as const).map(level => (
                  <div key={level} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 flex items-start gap-2.5">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${SAFETY_DOT[level]}`} />
                    <div>
                      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 mb-0.5">{SAFETY_LEVEL_LABELS[level]}</p>
                      <p className="text-[10px] text-zinc-500 leading-relaxed">{SAFETY_LEVEL_DESCRIPTIONS[level]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Rule table */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Policy Rules</h2>
                <p className="text-[10px] text-zinc-400">Changes take effect immediately · Save to persist</p>
              </div>

              {(['low_risk', 'medium_risk', 'high_risk'] as const).map(level => {
                const rulesForLevel = policy.rules.filter(r => r.safetyLevel === level);
                if (rulesForLevel.length === 0) return null;
                return (
                  <div key={level} className="mb-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${SAFETY_DOT[level]}`} />
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{SAFETY_LEVEL_LABELS[level]}</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                      {rulesForLevel.map(rule => (
                        <RuleRow key={rule.id} rule={rule} onChange={updateRule} globalMode={policy.globalMode} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          </div>
        )}

        {/* Live Decisions */}
        {activeTab === 'decisions' && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Auto-Run', decisions: autoDecisions, color: 'border-t-emerald-500' },
                { label: 'Pending Approval', decisions: pendingDecisions, color: 'border-t-amber-400' },
                { label: 'Recommendations', decisions: recDecisions, color: 'border-t-blue-400' },
                { label: 'Blocked', decisions: blockedDecisions, color: 'border-t-zinc-300 dark:border-t-zinc-600' },
              ].map(g => (
                <div key={g.label} className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-t-2 ${g.color} rounded-xl p-4 text-center`}>
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-0.5">{g.decisions.length}</div>
                  <div className="text-xs text-zinc-500">{g.label}</div>
                </div>
              ))}
            </div>

            {decisions.length === 0 ? (
              <div className="text-center py-16">
                <Zap className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No decisions yet</p>
                <p className="text-xs text-zinc-500 mt-1">Decisions appear when there are active cadence items, referral candidates, or client signals in the system.</p>
              </div>
            ) : (
              <>
                {autoDecisions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">Auto-Run ({autoDecisions.length})</p>
                    <div className="space-y-2">{autoDecisions.map(d => <DecisionCard key={d.id} decision={d} />)}</div>
                  </div>
                )}
                {pendingDecisions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">Pending Approval ({pendingDecisions.length})</p>
                    <div className="space-y-2">{pendingDecisions.map(d => <DecisionCard key={d.id} decision={d} />)}</div>
                  </div>
                )}
                {recDecisions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">Recommendations ({recDecisions.length})</p>
                    <div className="space-y-2">{recDecisions.map(d => <DecisionCard key={d.id} decision={d} />)}</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Pending Approval */}
        {activeTab === 'pending' && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-300 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>These actions are classified as <strong>approval_required</strong> by the current policy. Use the Execution Queue or Cadence workspace to approve and send them. No action runs without explicit human sign-off.</span>
            </div>
            {pendingDecisions.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No pending approvals</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingDecisions.map(d => <DecisionCard key={d.id} decision={d} />)}
              </div>
            )}
          </div>
        )}

        {/* Blocked */}
        {activeTab === 'blocked' && (
          <div className="space-y-4">
            <div className="p-3 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed flex items-start gap-2">
              <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>These actions are suppressed by policy or context conditions. Expand each card to see why it was blocked and what would need to change for it to proceed.</span>
            </div>
            {blockedDecisions.length === 0 ? (
              <div className="text-center py-12">
                <ShieldCheck className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No blocked actions</p>
              </div>
            ) : (
              <div className="space-y-2">
                {blockedDecisions.map(d => <DecisionCard key={d.id} decision={d} />)}
              </div>
            )}
          </div>
        )}

        {/* Audit Trail */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300 leading-relaxed flex items-start gap-2">
              <History className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>All policy changes and manual approvals are logged here in real time. This log is immutable and persisted to Firestore.</span>
            </div>
            {auditEvents.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No audit events yet</p>
                <p className="text-xs text-zinc-500 mt-1">Save a policy change to create the first audit record.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                {auditEvents.map((e, i) => <AuditEventRow key={e.id ?? i} event={e} />)}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
