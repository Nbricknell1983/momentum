import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Clock,
  CheckCircle,
  AlertTriangle,
  X,
  RefreshCw,
  History,
  Zap,
  Eye,
  ShieldCheck,
  Settings,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Ban,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import type { SweepRunRecord, SweepAction, SweepSuppression, SweepScheduleSettings, SweepScope, SweepScheduleMode } from '@/lib/sweepTypes';
import { SWEEP_SCOPE_LABELS, SWEEP_SCOPE_DESCRIPTIONS, SCHEDULE_MODE_LABELS } from '@/lib/sweepTypes';

// ── helpers ───────────────────────────────────────────────────────────────────

const OUTCOME_STYLES: Record<string, string> = {
  auto_created: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  approval_queued: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  recommendation: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  suppressed_dedupe: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
  blocked_policy: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
};

const OUTCOME_LABELS: Record<string, string> = {
  auto_created: 'Auto-Created',
  approval_queued: 'Needs Approval',
  recommendation: 'Recommendation',
  suppressed_dedupe: 'Suppressed (Dupe)',
  blocked_policy: 'Blocked (Policy)',
};

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'text-red-600 dark:text-red-400 font-semibold',
  high: 'text-amber-600 dark:text-amber-400 font-medium',
  normal: 'text-zinc-500',
};

const STATUS_ICON: Record<string, typeof Play> = {
  complete: CheckCircle,
  error: AlertTriangle,
  running: Loader2,
};

const STATUS_STYLES: Record<string, string> = {
  complete: 'text-emerald-600 dark:text-emerald-400',
  error: 'text-red-600 dark:text-red-400',
  running: 'text-amber-600 dark:text-amber-400',
};

const ALL_SCOPES: SweepScope[] = ['cadence', 'churn_risk', 'referral_window', 'expansion', 'lead_inactivity'];

// ── Run record card ───────────────────────────────────────────────────────────

function RunCard({ run }: { run: SweepRunRecord & { id?: string } }) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = STATUS_ICON[run.status] ?? Clock;

  return (
    <div data-testid={`sweep-run-${run.id}`} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <StatusIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${STATUS_STYLES[run.status]} ${run.status === 'running' ? 'animate-spin' : ''}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">{run.status}</span>
            <span className="text-[10px] text-zinc-400">{run.startedAt}</span>
            <span className="text-[10px] text-zinc-400 capitalize">· {run.triggeredBy}</span>
            {run.durationMs && <span className="text-[10px] text-zinc-400">· {run.durationMs}ms</span>}
          </div>
          <div className="flex gap-3 text-xs text-zinc-500 flex-wrap">
            <span>{run.candidateCount ?? 0} found</span>
            {run.actionCreatedCount > 0 && <span className="text-emerald-600 dark:text-emerald-400">{run.actionCreatedCount} created</span>}
            {run.approvalRequestedCount > 0 && <span className="text-amber-600 dark:text-amber-400">{run.approvalRequestedCount} need approval</span>}
            {run.suppressedDupeCount > 0 && <span>{run.suppressedDupeCount} suppressed</span>}
            {run.blockedCount > 0 && <span>{run.blockedCount} blocked</span>}
            {run.errorCount > 0 && <span className="text-red-500">{run.errorCount} errors</span>}
          </div>
        </div>
        <button onClick={() => setExpanded(e => !e)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex-shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-1.5 text-xs text-zinc-500">
          <p>Policy mode: <span className="font-medium text-zinc-700 dark:text-zinc-300">{run.policyMode}</span></p>
          {run.scopesSwept?.length > 0 && <p>Scopes: {run.scopesSwept.join(', ')}</p>}
          {run.error && <p className="text-red-500">Error: {run.error}</p>}
          <p>Recommendations: {run.recommendationCount ?? 0}</p>
        </div>
      )}
    </div>
  );
}

// ── Action card ───────────────────────────────────────────────────────────────

function ActionCard({ action, onReview }: { action: SweepAction; onReview: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div data-testid={`sweep-action-${action.id}`} className={`bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden ${action.reviewed ? 'opacity-60 border-zinc-200 dark:border-zinc-800' : 'border-amber-200 dark:border-amber-800'}`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{action.entityName}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${OUTCOME_STYLES[action.outcome] ?? ''}`}>
              {OUTCOME_LABELS[action.outcome] ?? action.outcome}
            </span>
            <span className={`text-[10px] ${PRIORITY_STYLES[action.priority] ?? ''}`}>
              {action.priority.toUpperCase()}
            </span>
            {action.reviewed && <span className="text-[10px] text-zinc-400">Reviewed</span>}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{action.reason}</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">{SWEEP_SCOPE_LABELS[action.scope as SweepScope] ?? action.scope} · {action.createdAt}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!action.reviewed && action.outcome === 'approval_queued' && (
            <button
              data-testid={`sweep-review-${action.id}`}
              onClick={() => onReview(action.id!)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900 transition-colors"
            >
              <CheckCircle className="w-3 h-3" />
              Mark Reviewed
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Suggested action</p>
            <p className="text-xs text-zinc-700 dark:text-zinc-300">{action.suggestedAction}</p>
          </div>
          {action.contextFacts?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Context</p>
              <ul className="space-y-0.5">
                {action.contextFacts.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-500">
                    <ArrowRight className="w-2.5 h-2.5 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {action.policyOutcome && (
            <p className="text-[10px] text-zinc-400">Policy: {action.policyOutcome} · Safety: {action.safetyLevel}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Suppression row ───────────────────────────────────────────────────────────

function SuppressionRow({ s }: { s: SweepSuppression }) {
  return (
    <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="flex items-start gap-3">
        <Ban className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{s.entityName}</span>
            <span className="text-[10px] text-zinc-500 capitalize">{s.suppressionReason.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{s.suppressionDetail}</p>
          <p className="text-[10px] text-zinc-400 mt-0.5">{SWEEP_SCOPE_LABELS[s.scope as SweepScope] ?? s.scope} · {s.suppressedAt}</p>
        </div>
      </div>
    </div>
  );
}

// ── Schedule editor ───────────────────────────────────────────────────────────

function ScheduleEditor({ orgId, current, onSave }: { orgId: string; current: SweepScheduleSettings | null; onSave: () => void }) {
  const [mode, setMode] = useState<SweepScheduleMode>(current?.mode ?? 'manual');
  const [dailyHour, setDailyHour] = useState(current?.dailyHour ?? 8);
  const [weekdaysOnly, setWeekdaysOnly] = useState(current?.weekdaysOnly ?? true);
  const [enabledScopes, setEnabledScopes] = useState<SweepScope[]>(current?.enabledScopes ?? ALL_SCOPES);
  const [saving, setSaving] = useState(false);

  const toggleScope = (scope: SweepScope) => {
    setEnabledScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest('PUT', `/api/orgs/${orgId}/sweeps/schedule`, { mode, dailyHour, weekdaysOnly, enabledScopes });
      onSave();
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  };

  const MODES: SweepScheduleMode[] = ['every_hour', 'twice_daily', 'daily_morning', 'manual', 'disabled'];

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">Schedule Mode</p>
        <div className="grid grid-cols-1 gap-2">
          {MODES.map(m => (
            <button
              key={m}
              data-testid={`sweep-mode-${m}`}
              onClick={() => setMode(m)}
              className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                mode === m
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-950'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-violet-300 dark:hover:border-violet-700'
              }`}
            >
              <span className={`text-xs font-semibold ${mode === m ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {SCHEDULE_MODE_LABELS[m]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Daily hour picker */}
      {mode === 'daily_morning' && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Run Hour (AEST)</p>
          <select
            value={dailyHour}
            onChange={e => setDailyHour(Number(e.target.value))}
            className="text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-400"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, '0')}:00 AEST</option>
            ))}
          </select>
        </div>
      )}

      {/* Weekdays only */}
      <div className="flex items-center gap-3">
        <button
          data-testid="sweep-weekdays-toggle"
          onClick={() => setWeekdaysOnly(v => !v)}
          className={`relative w-9 h-5 rounded-full transition-colors ${weekdaysOnly ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${weekdaysOnly ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <span className="text-xs text-zinc-700 dark:text-zinc-300">Weekdays only (Mon–Fri AEST)</span>
      </div>

      {/* Scope toggles */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">Enabled Scopes</p>
        <div className="space-y-2">
          {ALL_SCOPES.map(scope => (
            <div key={scope} className="flex items-start gap-3">
              <button
                data-testid={`sweep-scope-${scope}`}
                onClick={() => toggleScope(scope)}
                className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${enabledScopes.includes(scope) ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabledScopes.includes(scope) ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <div>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{SWEEP_SCOPE_LABELS[scope]}</p>
                <p className="text-[10px] text-zinc-400">{SWEEP_SCOPE_DESCRIPTIONS[scope]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        data-testid="sweep-save-schedule"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors"
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
        Save Schedule
      </button>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = 'status' | 'history' | 'actions' | 'suppressed' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'history', label: 'Run History' },
  { id: 'actions', label: 'Actions Created' },
  { id: 'suppressed', label: 'Suppressed' },
  { id: 'settings', label: 'Schedule Settings' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function SweepWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const [running, setRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<SweepRunRecord | null>(null);

  const { orgId } = useAuth();
  const qc = useQueryClient();

  // ── Data queries ────────────────────────────────────────────────────────────
  // Default queryFn joins queryKey with "/" and attaches Firebase auth header automatically
  const { data: statusData, refetch: refetchStatus } = useQuery<any>({
    queryKey: [`/api/orgs/${orgId}/sweeps/status`],
    enabled: !!orgId,
    refetchInterval: 30_000,
  });

  const { data: historyData } = useQuery<any>({
    queryKey: [`/api/orgs/${orgId}/sweeps/history`],
    enabled: !!orgId,
  });

  const { data: actionsData, refetch: refetchActions } = useQuery<any>({
    queryKey: [`/api/orgs/${orgId}/sweeps/actions`],
    enabled: !!orgId,
  });

  const { data: suppressedData } = useQuery<any>({
    queryKey: [`/api/orgs/${orgId}/sweeps/suppressed`],
    enabled: !!orgId,
  });

  const runs: SweepRunRecord[] = historyData?.runs ?? [];
  const actions: SweepAction[] = actionsData?.actions ?? [];
  const suppressions: SweepSuppression[] = suppressedData?.suppressions ?? [];
  const schedule: SweepScheduleSettings | null = statusData?.schedule ?? null;
  const lastRun: SweepRunRecord | null = lastRunResult ?? statusData?.lastRun ?? null;

  const approvalNeeded = actions.filter(a => a.outcome === 'approval_queued' && !a.reviewed);
  const autoCreated = actions.filter(a => a.outcome === 'auto_created');
  const recommendations = actions.filter(a => a.outcome === 'recommendation');

  // ── Manual run ──────────────────────────────────────────────────────────────
  const handleRunNow = useCallback(async () => {
    if (!orgId || running) return;
    setRunning(true);
    try {
      const res = await apiRequest('POST', `/api/orgs/${orgId}/sweeps/run`, {});
      const data = await res.json();
      if (data.record) setLastRunResult(data.record);
      await refetchStatus();
      qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/sweeps/history`] });
      qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/sweeps/actions`] });
      qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/sweeps/suppressed`] });
    } catch { /* ignore */ } finally {
      setRunning(false);
    }
  }, [orgId, running, refetchStatus, qc]);

  const handleMarkReviewed = useCallback(async (actionId: string) => {
    if (!orgId) return;
    await apiRequest('PATCH', `/api/orgs/${orgId}/sweeps/actions/${actionId}/review`, {});
    refetchActions();
  }, [orgId, refetchActions]);

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Scheduled Sweeps</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {schedule?.mode ? SCHEDULE_MODE_LABELS[schedule.mode as SweepScheduleMode] : 'Manual only'}
              {schedule?.lastRunAt ? ` · Last run: ${schedule.lastRunAt}` : ''}
            </p>
          </div>
          <button
            data-testid="sweep-run-now"
            onClick={handleRunNow}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? 'Running...' : 'Run Now'}
          </button>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {[
            { label: 'Needing Approval', count: approvalNeeded.length, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Auto-Created', count: autoCreated.length, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Recommendations', count: recommendations.length, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Suppressed (today)', count: suppressions.length, color: 'text-zinc-500' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span className={`font-bold text-sm ${s.color}`}>{s.count}</span>
              <span className="text-zinc-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 flex-shrink-0">
        <div className="flex">
          {TABS.map(tab => {
            const badge =
              tab.id === 'history' ? runs.length
                : tab.id === 'actions' ? approvalNeeded.length
                : tab.id === 'suppressed' ? suppressions.length
                : null;
            return (
              <button
                key={tab.id}
                data-testid={`sweep-tab-${tab.id}`}
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

        {/* Status */}
        {activeTab === 'status' && (
          <div className="space-y-6">
            {/* Last run result banner */}
            {lastRun && (
              <div className={`p-4 border rounded-xl ${lastRun.status === 'complete' ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {lastRun.status === 'complete'
                    ? <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    : <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                  }
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Last Sweep — {lastRun.status === 'complete' ? 'Complete' : 'Error'}
                  </span>
                  <span className="text-xs text-zinc-500">{lastRun.completedAt}</span>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {[
                    { label: 'Candidates', value: lastRun.candidateCount ?? 0 },
                    { label: 'Created', value: lastRun.actionCreatedCount ?? 0 },
                    { label: 'Approvals', value: lastRun.approvalRequestedCount ?? 0 },
                    { label: 'Recs', value: lastRun.recommendationCount ?? 0 },
                    { label: 'Suppressed', value: lastRun.suppressedDupeCount ?? 0 },
                    { label: 'Blocked', value: lastRun.blockedCount ?? 0 },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{s.value}</div>
                      <div className="text-[10px] text-zinc-500">{s.label}</div>
                    </div>
                  ))}
                </div>
                {lastRun.error && <p className="text-xs text-red-500 mt-2">Error: {lastRun.error}</p>}
              </div>
            )}

            {/* Tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Needs Approval', value: approvalNeeded.length, color: 'border-t-amber-400', textColor: 'text-amber-600 dark:text-amber-400', action: () => setActiveTab('actions') },
                { label: 'Auto-Created', value: autoCreated.length, color: 'border-t-emerald-500', textColor: 'text-emerald-600 dark:text-emerald-400', action: null },
                { label: 'Recommendations', value: recommendations.length, color: 'border-t-blue-400', textColor: 'text-blue-600 dark:text-blue-400', action: null },
                { label: 'Suppressed', value: suppressions.length, color: 'border-t-zinc-300 dark:border-t-zinc-600', textColor: 'text-zinc-600 dark:text-zinc-400', action: () => setActiveTab('suppressed') },
              ].map(t => (
                <div
                  key={t.label}
                  onClick={t.action ?? undefined}
                  className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-t-2 ${t.color} rounded-xl p-4 ${t.action ? 'cursor-pointer hover:shadow-sm' : ''}`}
                >
                  <div className={`text-2xl font-bold ${t.textColor} mb-0.5`}>{t.value}</div>
                  <div className="text-xs text-zinc-500">{t.label}</div>
                  {t.action && <p className="text-[10px] text-violet-500 mt-1">View →</p>}
                </div>
              ))}
            </div>

            {/* How sweeps work */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">How Sweeps Work</h3>
              <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                <p>1. <span className="font-medium text-zinc-800 dark:text-zinc-200">Sweep runs</span> — either on schedule or triggered manually with Run Now above</p>
                <p>2. <span className="font-medium text-zinc-800 dark:text-zinc-200">Candidates found</span> — leads and clients are scanned across 5 scopes (cadence, churn, referral, expansion, inactivity)</p>
                <p>3. <span className="font-medium text-zinc-800 dark:text-zinc-200">Policy applied</span> — each candidate action is classified using the Autopilot Policy. Low-risk = auto-created. Medium/high-risk = approval queued or recommendation.</p>
                <p>4. <span className="font-medium text-zinc-800 dark:text-zinc-200">Deduplication</span> — each entity gets a daily cooldown per action type. No duplicate reminders.</p>
                <p>5. <span className="font-medium text-zinc-800 dark:text-zinc-200">Audit trail</span> — every sweep run, action, and suppression is written to Firestore.</p>
                <p>6. <span className="font-medium text-zinc-800 dark:text-zinc-200">Human review</span> — items needing approval appear in the Actions Created tab. Nothing is sent externally without sign-off.</p>
              </div>
            </div>

            {/* Dedup protection */}
            <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
              <p className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Deduplication windows</p>
              <p>· Cadence reminders: 1-day cooldown per entity</p>
              <p>· Churn risk flags: 3-day cooldown per entity</p>
              <p>· Referral window flags: 7-day cooldown per entity</p>
              <p>· Expansion flags: 7-day cooldown per entity</p>
            </div>
          </div>
        )}

        {/* History */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {runs.length === 0 ? (
              <div className="text-center py-16">
                <History className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No sweep runs yet</p>
                <p className="text-xs text-zinc-500 mt-1">Click Run Now to trigger the first sweep.</p>
              </div>
            ) : (
              runs.map((r, i) => <RunCard key={(r as any).id ?? i} run={r} />)
            )}
          </div>
        )}

        {/* Actions */}
        {activeTab === 'actions' && (
          <div className="space-y-5">
            {approvalNeeded.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">Needs Approval ({approvalNeeded.length})</p>
                <div className="space-y-2">
                  {approvalNeeded.map(a => <ActionCard key={a.id} action={a} onReview={handleMarkReviewed} />)}
                </div>
              </div>
            )}
            {autoCreated.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">Auto-Created ({autoCreated.length})</p>
                <div className="space-y-2">
                  {autoCreated.map(a => <ActionCard key={a.id} action={a} onReview={handleMarkReviewed} />)}
                </div>
              </div>
            )}
            {recommendations.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">Recommendations ({recommendations.length})</p>
                <div className="space-y-2">
                  {recommendations.map(a => <ActionCard key={a.id} action={a} onReview={handleMarkReviewed} />)}
                </div>
              </div>
            )}
            {actions.length === 0 && (
              <div className="text-center py-16">
                <Zap className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No actions yet</p>
                <p className="text-xs text-zinc-500 mt-1">Run a sweep to generate actions.</p>
              </div>
            )}
          </div>
        )}

        {/* Suppressed */}
        {activeTab === 'suppressed' && (
          <div className="space-y-3">
            {suppressions.length === 0 ? (
              <div className="text-center py-16">
                <ShieldCheck className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No suppressions yet</p>
                <p className="text-xs text-zinc-500 mt-1">Suppressions appear when deduplication kicks in on subsequent sweep runs.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                {suppressions.map((s, i) => <SuppressionRow key={s.id ?? i} s={s} />)}
              </div>
            )}
          </div>
        )}

        {/* Settings */}
        {activeTab === 'settings' && orgId && (
          <div className="max-w-md">
            <ScheduleEditor
              orgId={orgId}
              current={schedule}
              onSave={() => {
                qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/sweeps/status`] });
              }}
            />
          </div>
        )}

      </div>
    </div>
  );
}
