import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Cpu, TrendingUp, BookOpen, Globe, Search, BarChart3, Star,
  ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle, AlertCircle,
  Loader2, Plus, Zap, Shield, Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/contexts/AuthContext';
import { updateClient } from '@/store/index';
import {
  Client, AIAction, ExecutionStatusValue, ExecutionStatusState,
  AutomationMode, IntelligenceScore,
  EXECUTION_STATUS_LABELS, EXECUTION_STATUS_COLORS,
  AUTOMATION_MODE_LABELS, AUTOMATION_MODE_DESCRIPTIONS,
} from '@/lib/types';
import {
  fetchClientAIActions, addClientAIAction, updateClientAIActionStatus,
  computeIntelligenceScore, updateClientInFirestore,
} from '@/lib/firestoreService';
import { format } from 'date-fns';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | string | null) {
  if (!d) return '—';
  return format(new Date(d), 'dd/MM/yyyy HH:mm');
}

const ENGINE_LABELS: Record<AIAction['engine'], string> = {
  website: 'Website', seo: 'SEO', gbp: 'GBP', ads: 'Ads',
  sales: 'Sales', strategy: 'Strategy', client_growth: 'Growth', system: 'System',
};

const ENGINE_COLORS: Record<AIAction['engine'], string> = {
  website: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400',
  seo: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  gbp: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  ads: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  sales: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-400',
  strategy: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400',
  client_growth: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400',
  system: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const ACTION_STATUS_CONFIG: Record<AIAction['status'], { label: string; icon: typeof CheckCircle2; cls: string }> = {
  queued:   { label: 'Queued',   icon: Clock,        cls: 'text-muted-foreground' },
  approved: { label: 'Approved', icon: CheckCircle2, cls: 'text-blue-500' },
  running:  { label: 'Running',  icon: Loader2,      cls: 'text-amber-500 animate-spin' },
  done:     { label: 'Done',     icon: CheckCircle2, cls: 'text-emerald-500' },
  rejected: { label: 'Rejected', icon: XCircle,      cls: 'text-red-500' },
};

const EXEC_CHANNELS: { key: keyof ExecutionStatusState; label: string; icon: typeof Globe }[] = [
  { key: 'website', label: 'Website', icon: Globe },
  { key: 'seo',     label: 'SEO',     icon: Search },
  { key: 'gbp',     label: 'GBP',     icon: Star },
  { key: 'ads',     label: 'Ads',     icon: BarChart3 },
];

const EXEC_STATUS_ORDER: ExecutionStatusValue[] = [
  'not_started', 'ready', 'in_progress', 'active', 'needs_input', 'blocked',
];

const SCORE_PILLARS = [
  { key: 'understanding', label: 'Understanding', icon: BookOpen,   description: 'How well the system knows this business' },
  { key: 'execution',     label: 'Execution',     icon: Cpu,        description: 'How actively it\'s executing on growth' },
  { key: 'performance',   label: 'Performance',   icon: TrendingUp, description: 'How well the work is performing' },
  { key: 'learning',      label: 'Learning',      icon: Brain,      description: 'How much the system has learned' },
] as const;

// ─── Intelligence Score Display ─────────────────────────────────────────────

function ScorePillar({ label, value, icon: Icon, description }: { label: string; value: number; icon: typeof Brain; description: string }) {
  const color = value >= 70 ? 'text-emerald-500' : value >= 40 ? 'text-amber-500' : 'text-red-400';
  const barColor = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex flex-col gap-1" title={description}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </span>
        <span className={`text-xs font-bold ${color}`}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Automation Mode ─────────────────────────────────────────────────────────

const MODE_CONFIG: Record<AutomationMode, { icon: typeof Bot; color: string }> = {
  assisted:   { icon: Shield, color: 'text-blue-500' },
  supervised: { icon: AlertCircle, color: 'text-amber-500' },
  autonomous: { icon: Bot, color: 'text-emerald-500' },
};

// ─── Main Component ──────────────────────────────────────────────────────────

interface Props {
  client: Client;
}

export default function GrowthOperatorPanel({ client }: Props) {
  const { orgId, authReady } = useAuth();
  const dispatch = useDispatch();
  const { toast } = useToast();

  const [expanded, setExpanded] = useState(true);
  const [score, setScore] = useState<IntelligenceScore | null>(null);
  const [actions, setActions] = useState<AIAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [savingExec, setSavingExec] = useState<string | null>(null);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionText, setNewActionText] = useState('');
  const [newActionEngine, setNewActionEngine] = useState<AIAction['engine']>('system');
  const [addingAction, setAddingAction] = useState(false);

  useEffect(() => {
    computeIntelligenceScore(client).then(s => setScore({ ...s, updatedAt: new Date() }));
  }, [client.id, client.healthStatus, client.executionStatus, client.clientOnboarding]);

  useEffect(() => {
    if (!orgId || !authReady) return;
    setLoadingActions(true);
    fetchClientAIActions(orgId, client.id, authReady).then(data => {
      setActions(data);
      setLoadingActions(false);
    });
  }, [orgId, authReady, client.id]);

  const saveMode = useCallback(async (mode: AutomationMode) => {
    if (!orgId || !authReady) return;
    setSavingMode(true);
    try {
      dispatch(updateClient({ ...client, automationMode: mode }));
      await updateClientInFirestore(orgId, client.id, { automationMode: mode }, authReady);
    } catch {
      toast({ title: 'Failed to update mode', variant: 'destructive' });
    } finally {
      setSavingMode(false);
    }
  }, [orgId, authReady, client, dispatch, toast]);

  const saveExecStatus = useCallback(async (channel: keyof ExecutionStatusState, status: ExecutionStatusValue) => {
    if (!orgId || !authReady) return;
    setSavingExec(channel);
    const updated: ExecutionStatusState = {
      ...client.executionStatus,
      [channel]: { status, updatedAt: new Date() },
    };
    try {
      dispatch(updateClient({ ...client, executionStatus: updated }));
      await updateClientInFirestore(orgId, client.id, { executionStatus: updated }, authReady);
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    } finally {
      setSavingExec(null);
    }
  }, [orgId, authReady, client, dispatch, toast]);

  const approveAction = useCallback(async (action: AIAction) => {
    if (!orgId || !authReady) return;
    try {
      await updateClientAIActionStatus(orgId, client.id, action.id, 'approved', undefined, authReady);
      setActions(prev => prev.map(a => a.id === action.id ? { ...a, status: 'approved' } : a));
    } catch {
      toast({ title: 'Failed to approve action', variant: 'destructive' });
    }
  }, [orgId, authReady, client.id, toast]);

  const rejectAction = useCallback(async (action: AIAction) => {
    if (!orgId || !authReady) return;
    try {
      await updateClientAIActionStatus(orgId, client.id, action.id, 'rejected', undefined, authReady);
      setActions(prev => prev.map(a => a.id === action.id ? { ...a, status: 'rejected' } : a));
    } catch {
      toast({ title: 'Failed to reject action', variant: 'destructive' });
    }
  }, [orgId, authReady, client.id, toast]);

  const handleAddAction = useCallback(async () => {
    if (!orgId || !authReady || !newActionText.trim()) return;
    setAddingAction(true);
    try {
      const newAction: Omit<AIAction, 'id'> = {
        engine: newActionEngine,
        action: newActionText.trim(),
        reason: 'Manually logged',
        status: 'queued',
        createdAt: new Date(),
      };
      const id = await addClientAIAction(orgId, client.id, newAction, authReady);
      setActions(prev => [{ ...newAction, id }, ...prev]);
      setNewActionText('');
      setShowAddAction(false);
      toast({ title: 'Action logged' });
    } catch {
      toast({ title: 'Failed to log action', variant: 'destructive' });
    } finally {
      setAddingAction(false);
    }
  }, [orgId, authReady, client.id, newActionText, newActionEngine, toast]);

  const automationMode = client.automationMode ?? 'assisted';
  const ModeIcon = MODE_CONFIG[automationMode].icon;
  const modeColor = MODE_CONFIG[automationMode].color;

  const [runningAutopilot, setRunningAutopilot] = useState(false);

  const handleAutopilotRun = useCallback(async () => {
    const queued = actions.filter(a => a.status === 'queued');
    if (queued.length === 0) {
      toast({ title: 'No queued actions to approve' });
      return;
    }
    setRunningAutopilot(true);
    try {
      const res = await fetch('/api/ai/client/autopilot-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          clientName: client.businessName,
          queuedActions: queued.map(a => ({ id: a.id, action: a.action, engine: a.engine })),
        }),
      });
      if (!res.ok) throw new Error('Autopilot run failed');
      for (const action of queued) {
        await updateClientAIActionStatus(orgId!, client.id, action.id, 'approved', 'Auto-approved by Autopilot', authReady);
      }
      setActions(prev => prev.map(a => a.status === 'queued' ? { ...a, status: 'approved' as const, outcome: 'Auto-approved by Autopilot' } : a));
      toast({ title: `Autopilot approved ${queued.length} ${queued.length === 1 ? 'action' : 'actions'}`, description: 'All queued actions have been approved.' });
    } catch (err: any) {
      toast({ title: 'Autopilot run failed', description: err.message, variant: 'destructive' });
    } finally {
      setRunningAutopilot(false);
    }
  }, [actions, client, orgId, authReady, toast]);

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        data-testid="button-growth-operator-toggle"
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 text-white">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Growth Operator</p>
            <p className="text-xs text-muted-foreground">
              {score ? `Intelligence ${score.overall}` : 'Loading…'} · Mode: {AUTOMATION_MODE_LABELS[automationMode]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions.filter(a => a.status === 'queued').length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {actions.filter(a => a.status === 'queued').length} pending
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t divide-y">

          {/* ── Intelligence Score ── */}
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Intelligence Score</p>
              {score && (
                <span className={`text-sm font-bold ${score.overall >= 70 ? 'text-emerald-500' : score.overall >= 40 ? 'text-amber-500' : 'text-red-400'}`}>
                  {score.overall} / 100
                </span>
              )}
            </div>
            {score ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {SCORE_PILLARS.map(p => (
                  <ScorePillar
                    key={p.key}
                    label={p.label}
                    value={score[p.key]}
                    icon={p.icon}
                    description={p.description}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Computing score…
              </div>
            )}
          </div>

          {/* ── Automation Mode ── */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Automation Mode</p>
            <div className="flex items-center gap-2">
              <Select value={automationMode} onValueChange={(v) => saveMode(v as AutomationMode)} disabled={savingMode}>
                <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-automation-mode">
                  <div className="flex items-center gap-1.5">
                    <ModeIcon className={`h-3.5 w-3.5 ${modeColor}`} />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {(['assisted', 'supervised', 'autonomous'] as AutomationMode[]).map(m => (
                    <SelectItem key={m} value={m}>
                      <div>
                        <p className="font-medium">{AUTOMATION_MODE_LABELS[m]}</p>
                        <p className="text-xs text-muted-foreground">{AUTOMATION_MODE_DESCRIPTIONS[m]}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {savingMode && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
            </div>
          </div>

          {/* ── Execution Status ── */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Execution Status</p>
            <div className="grid grid-cols-2 gap-2">
              {EXEC_CHANNELS.map(({ key, label, icon: Icon }) => {
                const ch = client.executionStatus?.[key];
                const status: ExecutionStatusValue = ch?.status ?? 'not_started';
                const colorCls = EXECUTION_STATUS_COLORS[status];
                const isSaving = savingExec === key;
                return (
                  <div key={key} className={`rounded-lg border p-2.5 space-y-2 ${colorCls} border-current/20`} data-testid={`exec-channel-${key}`}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        <Icon className="h-3 w-3" /> {label}
                      </span>
                      {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
                    <Select
                      value={status}
                      onValueChange={(v) => saveExecStatus(key, v as ExecutionStatusValue)}
                      disabled={!!savingExec}
                    >
                      <SelectTrigger className="h-6 text-[11px] bg-white/50 dark:bg-black/20 border-0 shadow-none px-2" data-testid={`select-exec-${key}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EXEC_STATUS_ORDER.map(s => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {EXECUTION_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── AI Actions Feed ── */}
          <div className="px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 shrink-0">
                <Zap className="h-3 w-3" /> AI Actions
              </p>
              <div className="flex items-center gap-1.5 ml-auto">
                {automationMode === 'autonomous' && actions.filter(a => a.status === 'queued').length > 0 && (
                  <Button
                    variant="default" size="sm"
                    className="h-6 text-xs px-2 gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={handleAutopilotRun}
                    disabled={runningAutopilot}
                    data-testid="button-run-autopilot"
                  >
                    {runningAutopilot ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
                    {runningAutopilot ? 'Running…' : `Autopilot (${actions.filter(a => a.status === 'queued').length})`}
                  </Button>
                )}
                <Button
                  variant="ghost" size="sm"
                  className="h-6 text-xs px-2 gap-1"
                  onClick={() => setShowAddAction(v => !v)}
                  data-testid="button-add-ai-action"
                >
                  <Plus className="h-3 w-3" /> Log
                </Button>
              </div>
            </div>

            {showAddAction && (
              <div className="space-y-2 bg-muted/30 rounded-lg p-3 border">
                <input
                  type="text"
                  value={newActionText}
                  onChange={e => setNewActionText(e.target.value)}
                  placeholder="Describe the action…"
                  className="w-full text-xs rounded border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                  data-testid="input-new-action-text"
                />
                <div className="flex items-center gap-2">
                  <Select value={newActionEngine} onValueChange={v => setNewActionEngine(v as AIAction['engine'])}>
                    <SelectTrigger className="h-7 text-xs flex-1" data-testid="select-new-action-engine">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ENGINE_LABELS) as AIAction['engine'][]).map(e => (
                        <SelectItem key={e} value={e} className="text-xs">{ENGINE_LABELS[e]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm" className="h-7 text-xs"
                    onClick={handleAddAction}
                    disabled={!newActionText.trim() || addingAction}
                    data-testid="button-save-ai-action"
                  >
                    {addingAction ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </div>
            )}

            {loadingActions ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading actions…
              </div>
            ) : actions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                No actions logged yet. Actions from the AI engines will appear here.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {actions.map(action => {
                  const st = ACTION_STATUS_CONFIG[action.status];
                  const StatusIcon = st.icon;
                  return (
                    <div key={action.id} className="flex flex-col gap-1 p-2.5 rounded-lg border bg-muted/20 text-xs" data-testid={`ai-action-${action.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <StatusIcon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${st.cls}`} />
                          <span className="font-medium text-foreground leading-snug">{action.action}</span>
                        </div>
                        <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${ENGINE_COLORS[action.engine]}`}>
                          {ENGINE_LABELS[action.engine]}
                        </span>
                      </div>
                      {action.reason && (
                        <p className="text-muted-foreground ml-5">{action.reason}</p>
                      )}
                      {action.outcome && (
                        <p className="text-emerald-600 dark:text-emerald-400 ml-5 font-medium">→ {action.outcome}</p>
                      )}
                      <div className="flex items-center justify-between ml-5">
                        <span className="text-muted-foreground">{fmtDate(action.createdAt)}</span>
                        {action.status === 'queued' && automationMode === 'supervised' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => approveAction(action)}
                              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium"
                              data-testid={`button-approve-action-${action.id}`}
                            >
                              Approve
                            </button>
                            <span className="text-muted-foreground">·</span>
                            <button
                              onClick={() => rejectAction(action)}
                              className="text-red-500 hover:text-red-600 font-medium"
                              data-testid={`button-reject-action-${action.id}`}
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
