import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  Activity, AlertTriangle, Ban, CheckCircle2, ChevronDown, ChevronRight,
  Clock, ExternalLink, Info, Play, RefreshCw, RotateCcw, Shield, Zap,
  XCircle, Pause, List, Eye, BarChart2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { ExecJobStatus } from '@/../server/autopilotExecution';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExecJob {
  id: string;
  orgId: string;
  sweepActionId: string;
  sweepRunId: string;
  actionType: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  safetyLevel: 'low_risk' | 'medium_risk';
  priority: 'urgent' | 'high' | 'normal';
  reason: string;
  contextFacts: string[];
  suggestedAction: string;
  scope: string;
  dedupeKey: string;
  policyDecisionAtQueue: string;
  status: ExecJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  createdAt: string;
  dueAt: string;
  lastAttemptAt?: string;
  completedAt?: string;
  suppressedReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  lastError?: string;
  executionResult?: string;
  why: string;
}

interface ExecHealth {
  queued: number;
  executing: number;
  succeeded: number;
  failed: number;
  terminal: number;
  suppressed: number;
  cancelled: number;
}

interface RunSummary {
  orgId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  triggeredBy: string;
  jobsFound: number;
  jobsExecuted: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsSuppressed: number;
  jobsSkippedInFlight: number;
  errors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusConfig(status: ExecJobStatus): { label: string; icon: React.ReactNode; classes: string } {
  switch (status) {
    case 'queued':
      return { label: 'Queued', icon: <Clock className="w-3 h-3" />, classes: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
    case 'claimed':
    case 'executing':
      return { label: 'Executing', icon: <Activity className="w-3 h-3 animate-pulse" />, classes: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
    case 'succeeded':
      return { label: 'Succeeded', icon: <CheckCircle2 className="w-3 h-3" />, classes: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
    case 'failed':
      return { label: 'Failed', icon: <AlertTriangle className="w-3 h-3" />, classes: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
    case 'terminal_failed':
      return { label: 'Terminal', icon: <XCircle className="w-3 h-3" />, classes: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' };
    case 'suppressed':
      return { label: 'Suppressed', icon: <Pause className="w-3 h-3" />, classes: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700' };
    case 'cancelled':
      return { label: 'Cancelled', icon: <Ban className="w-3 h-3" />, classes: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700' };
    default:
      return { label: status, icon: <Info className="w-3 h-3" />, classes: 'bg-muted text-muted-foreground border-border' };
  }
}

function priorityDot(priority: 'urgent' | 'high' | 'normal'): string {
  if (priority === 'urgent') return 'bg-red-500';
  if (priority === 'high') return 'bg-amber-500';
  return 'bg-emerald-500';
}

function safetyBadge(level: string): React.ReactNode {
  if (level === 'low_risk') {
    return <Badge variant="outline" className="text-[9px] py-0 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">Low Risk</Badge>;
  }
  return <Badge variant="outline" className="text-[9px] py-0 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400">Med Risk</Badge>;
}

// ── Health strip ──────────────────────────────────────────────────────────────

function HealthStrip({ health }: { health: ExecHealth }) {
  const total = Object.values(health).reduce((s, n) => s + n, 0);
  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
      {([
        { label: 'Queued', value: health.queued, accent: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30' },
        { label: 'Executing', value: health.executing, accent: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30' },
        { label: 'Succeeded', value: health.succeeded, accent: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30' },
        { label: 'Failed', value: health.failed, accent: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30' },
        { label: 'Terminal', value: health.terminal, accent: health.terminal > 0 ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30' : '' },
        { label: 'Suppressed', value: health.suppressed, accent: '' },
        { label: 'Cancelled', value: health.cancelled, accent: '' },
      ] as { label: string; value: number; accent: string }[]).map(item => (
        <div key={item.label} className={`rounded-lg border px-3 py-2.5 text-center ${item.accent || 'border-border'}`}>
          <div className="text-xl font-bold">{item.value}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────────

function JobCard({ job, orgId, onAction }: {
  job: ExecJob;
  orgId: string;
  onAction: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAttempts, setShowAttempts] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const cfg = statusConfig(job.status);

  const cancelMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/orgs/${orgId}/autopilot/exec/jobs/${job.id}/cancel`),
    onSuccess: () => { toast({ title: 'Job cancelled' }); qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/autopilot/exec/jobs`] }); onAction(); },
    onError: () => toast({ title: 'Cancel failed', variant: 'destructive' }),
  });

  const retryMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/orgs/${orgId}/autopilot/exec/jobs/${job.id}/retry`),
    onSuccess: () => { toast({ title: 'Job re-queued' }); qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/autopilot/exec/jobs`] }); onAction(); },
    onError: () => toast({ title: 'Retry failed', variant: 'destructive' }),
  });

  const attemptsQuery = useQuery({
    queryKey: [`/api/orgs/${orgId}/autopilot/exec/jobs/${job.id}/attempts`],
    enabled: showAttempts,
  });

  const canCancel = job.status === 'queued' || job.status === 'failed';
  const canRetry = job.status === 'failed' || job.status === 'terminal_failed' || job.status === 'suppressed';

  return (
    <div className={`rounded-lg border overflow-hidden ${job.status === 'terminal_failed' ? 'border-red-200 dark:border-red-800/50' : job.status === 'succeeded' ? 'border-emerald-200/60 dark:border-emerald-900/40' : 'border-border'}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-left"
        data-testid={`job-row-${job.id}`}
      >
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot(job.priority)}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{job.entityName}</span>
            <span className="text-xs text-muted-foreground">— {job.actionType.replace(/_/g, ' ')}</span>
            {safetyBadge(job.safetyLevel)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{job.reason}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant="outline" className={`text-[10px] py-0 gap-1 ${cfg.classes}`}>
            {cfg.icon}{cfg.label}
          </Badge>
          <span className="text-[11px] text-muted-foreground hidden sm:block">{job.createdAt}</span>
          {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t bg-muted/30 px-4 py-3 space-y-3">
          {/* Why + what */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Why Created</p>
              <p className="text-xs">{job.why}</p>
              <div className="pt-1 space-y-0.5">
                {job.contextFacts.map((f, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <span className="mt-0.5 text-blue-500">·</span>{f}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Execution Detail</p>
              <InfoRow label="Status" value={cfg.label} />
              <InfoRow label="Attempts" value={`${job.attemptCount} / ${job.maxAttempts}`} />
              <InfoRow label="Policy at queue" value={job.policyDecisionAtQueue} />
              <InfoRow label="Scope" value={job.scope} />
              <InfoRow label="Entity type" value={job.entityType} />
              <InfoRow label="Dedupe key" value={job.dedupeKey} mono />
              {job.lastAttemptAt && <InfoRow label="Last attempt" value={job.lastAttemptAt} />}
              {job.completedAt && <InfoRow label="Completed at" value={job.completedAt} />}
            </div>
          </div>

          {/* Result or error */}
          {job.executionResult && (
            <div className="flex items-start gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
              <span className="text-xs">{job.executionResult}</span>
            </div>
          )}
          {job.lastError && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-red-700 dark:text-red-400">{job.lastError}</span>
            </div>
          )}
          {job.suppressedReason && (
            <div className="flex items-start gap-2 rounded-md bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 px-3 py-2">
              <Pause className="w-3.5 h-3.5 text-zinc-500 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-muted-foreground">{job.suppressedReason}</span>
            </div>
          )}

          {/* Attempts */}
          <div>
            <button
              onClick={() => setShowAttempts(v => !v)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Eye className="w-3 h-3" />
              {showAttempts ? 'Hide' : 'Show'} attempt history
            </button>
            {showAttempts && (
              <div className="mt-2 space-y-1.5">
                {attemptsQuery.isLoading && <div className="text-[11px] text-muted-foreground">Loading…</div>}
                {((attemptsQuery.data as any)?.attempts ?? []).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 text-[11px] bg-background rounded border px-2.5 py-1.5">
                    <span className="text-muted-foreground w-6 flex-shrink-0">#{a.attemptNumber}</span>
                    <span className={`font-medium ${a.status === 'succeeded' ? 'text-emerald-600' : a.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>{a.status}</span>
                    <span className="text-muted-foreground">Policy: {a.policyRecheckOutcome}</span>
                    {a.executionDurationMs && <span className="text-muted-foreground">{a.executionDurationMs}ms</span>}
                    {a.error && <span className="text-red-600 truncate">{a.error}</span>}
                    {a.handlerResult && <span className="text-emerald-600 truncate">{a.handlerResult}</span>}
                  </div>
                ))}
                {((attemptsQuery.data as any)?.attempts?.length === 0) && (
                  <p className="text-[11px] text-muted-foreground">No attempts recorded yet.</p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                data-testid={`btn-cancel-job-${job.id}`}
              >
                <Ban className="w-3 h-3" />Cancel
              </Button>
            )}
            {canRetry && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => retryMut.mutate()}
                disabled={retryMut.isPending}
                data-testid={`btn-retry-job-${job.id}`}
              >
                <RotateCcw className="w-3 h-3" />Retry
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className={`text-[11px] font-medium ${mono ? 'font-mono text-[10px]' : ''}`}>{value}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AutopilotExecutionWorkspace() {
  const { user } = useAuth();
  const orgId = (user as any)?.orgId as string | undefined;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ExecJobStatus | 'all'>('all');
  const [lastRunSummary, setLastRunSummary] = useState<RunSummary | null>(null);
  const [lastRunLogs, setLastRunLogs] = useState<string[]>([]);

  const healthQuery = useQuery({
    queryKey: [`/api/orgs/${orgId}/autopilot/exec/health`],
    enabled: !!orgId,
    refetchInterval: 15_000,
  });

  const jobsQuery = useQuery({
    queryKey: [`/api/orgs/${orgId}/autopilot/exec/jobs`],
    enabled: !!orgId,
    refetchInterval: 15_000,
  });

  const runMut = useMutation({
    mutationFn: () => apiRequest('POST', `/api/orgs/${orgId}/autopilot/exec/run`),
    onSuccess: (data: any) => {
      setLastRunSummary(data?.summary ?? null);
      setLastRunLogs(data?.logs ?? []);
      toast({ title: `Execution run complete — ${data?.summary?.jobsSucceeded ?? 0} succeeded` });
      qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/autopilot/exec/jobs`] });
      qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/autopilot/exec/health`] });
    },
    onError: () => toast({ title: 'Run failed', variant: 'destructive' }),
  });

  const health: ExecHealth = (healthQuery.data as any)?.health ?? {
    queued: 0, executing: 0, succeeded: 0, failed: 0, terminal: 0, suppressed: 0, cancelled: 0,
  };

  const allJobs: ExecJob[] = (jobsQuery.data as any)?.jobs ?? [];
  const filteredJobs = statusFilter === 'all' ? allJobs : allJobs.filter(j => j.status === statusFilter);

  const hasIssues = health.terminal > 0 || health.failed > 0;

  if (!orgId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">No organisation context — please sign in.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Autopilot Execution</h1>
              <p className="text-xs text-muted-foreground">
                Server-side low-risk action runner · Policy-aware · Fully auditable
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/autopilot/exec/jobs`] });
                qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/autopilot/exec/health`] });
              }}
              data-testid="button-refresh-exec"
            >
              <RefreshCw className="w-3 h-3" />Refresh
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending}
              data-testid="button-run-exec"
            >
              {runMut.isPending ? (
                <><Activity className="w-3 h-3 animate-pulse" />Running…</>
              ) : (
                <><Play className="w-3 h-3" />Run Now</>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        {/* Safety notice */}
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <Shield className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs space-y-0.5">
            <p className="font-medium text-emerald-800 dark:text-emerald-300">Safe by default</p>
            <p className="text-emerald-700 dark:text-emerald-400">Only <strong>low-risk internal actions</strong> are executed automatically. Policy is re-checked at execution time. High/medium-risk actions always require human approval. Every action is logged and explainable.</p>
          </div>
        </div>

        {/* Health strip */}
        {(healthQuery.isLoading) ? (
          <div className="h-20 bg-muted rounded-lg animate-pulse" />
        ) : (
          <HealthStrip health={health} />
        )}

        {/* Critical alert */}
        {hasIssues && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-red-700 dark:text-red-400">Attention required</p>
              {health.terminal > 0 && <p className="text-red-600 dark:text-red-400">{health.terminal} job{health.terminal !== 1 ? 's' : ''} reached terminal failure — manual review needed.</p>}
              {health.failed > 0 && <p className="text-red-600 dark:text-red-400">{health.failed} job{health.failed !== 1 ? 's' : ''} failed and will retry on next run.</p>}
            </div>
          </div>
        )}

        {/* Last run summary */}
        {lastRunSummary && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-muted-foreground" />
                Last Manual Run — {lastRunSummary.startedAt}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
                {[
                  { label: 'Found', value: lastRunSummary.jobsFound },
                  { label: 'Executed', value: lastRunSummary.jobsExecuted },
                  { label: 'Succeeded', value: lastRunSummary.jobsSucceeded },
                  { label: 'Failed', value: lastRunSummary.jobsFailed },
                  { label: 'Suppressed', value: lastRunSummary.jobsSuppressed },
                  { label: 'Duration', value: `${lastRunSummary.durationMs}ms` },
                ].map(item => (
                  <div key={item.label} className="rounded border px-2 py-1.5">
                    <div className="text-sm font-bold">{item.value}</div>
                    <div className="text-[10px] text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>
              {lastRunSummary.errors.length > 0 && (
                <div className="space-y-1 pt-1">
                  {lastRunSummary.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-red-600 dark:text-red-400">{e}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Job tabs */}
        <Tabs defaultValue="jobs">
          <TabsList className="h-8 text-xs">
            <TabsTrigger value="jobs" className="text-xs" data-testid="tab-exec-jobs">
              Jobs
              {allJobs.length > 0 && (
                <span className="ml-1.5 text-[9px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{allJobs.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs" data-testid="tab-exec-logs">
              Run Logs
            </TabsTrigger>
            <TabsTrigger value="safety" className="text-xs" data-testid="tab-exec-safety">
              Safety Controls
            </TabsTrigger>
          </TabsList>

          {/* Jobs tab */}
          <TabsContent value="jobs" className="mt-4 space-y-3">
            {/* Status filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'queued', 'executing', 'succeeded', 'failed', 'terminal_failed', 'suppressed', 'cancelled'] as const).map(s => (
                <Button
                  key={s}
                  variant={statusFilter === s ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px] px-2 capitalize"
                  onClick={() => setStatusFilter(s)}
                  data-testid={`filter-status-${s}`}
                >
                  {s === 'all' ? `All (${allJobs.length})` : s.replace('_', ' ')}
                  {s !== 'all' && ` (${allJobs.filter(j => j.status === s).length})`}
                </Button>
              ))}
            </div>

            {jobsQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <List className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">No jobs in this view</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Jobs are created when the sweep runner produces <strong>auto_created</strong> actions.
                  Run a sweep first, then click Run Now to process them.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredJobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    orgId={orgId}
                    onAction={() => {
                      qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/autopilot/exec/jobs`] });
                      qc.invalidateQueries({ queryKey: [`/api/orgs/${orgId}/autopilot/exec/health`] });
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Run logs tab */}
          <TabsContent value="logs" className="mt-4">
            {lastRunLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">No run logs yet</p>
                <p className="text-xs text-muted-foreground mt-1">Click Run Now to execute queued jobs and see the full execution log here.</p>
              </div>
            ) : (
              <div className="rounded-lg border bg-zinc-950 dark:bg-black p-4 space-y-0.5 font-mono text-[11px] overflow-auto max-h-96">
                {lastRunLogs.map((log, i) => (
                  <div key={i} className={`${log.includes('error') || log.includes('fail') ? 'text-red-400' : log.includes('succeeded') || log.includes('complete') ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {log}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Safety controls tab */}
          <TabsContent value="safety" className="mt-4">
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" />
                    Execution Safety Model
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <p className="text-muted-foreground">The autopilot execution layer enforces the following safety rules at all times:</p>
                  {[
                    { icon: '✅', text: 'Policy is re-checked at execution time, not just at queue time — if policy changes, jobs are suppressed.' },
                    { icon: '✅', text: 'Only low-risk actions are ever auto-executed. Medium/high-risk always require human approval.' },
                    { icon: '✅', text: 'Leases prevent duplicate in-flight execution of the same job.' },
                    { icon: '✅', text: 'Dedup keys prevent re-queuing the same action for the same entity on the same day.' },
                    { icon: '✅', text: 'All executions are logged with full audit trail — what ran, why, what changed.' },
                    { icon: '✅', text: 'Failed jobs retry with exponential backoff and reach terminal failure after 3 attempts.' },
                    { icon: '✅', text: 'Any job can be manually cancelled by an operator at any time.' },
                    { icon: '🚫', text: 'External communications are never sent automatically — they always enter the approval queue.' },
                    { icon: '🚫', text: 'High-risk actions (send_communication, create_referral_ask, send_portal_digest) are never auto-executed.' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0">{item.icon}</span>
                      <span className="text-muted-foreground">{item.text}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Handled Action Types</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      { type: 'create_cadence_reminder', risk: 'low_risk', desc: 'Writes a cadence reminder to Firestore. No external contact.' },
                      { type: 'flag_churn_risk', risk: 'low_risk', desc: 'Sets a flag on the client document. No external contact.' },
                      { type: 'flag_upsell_opportunity', risk: 'low_risk', desc: 'Sets a flag on the client document. No external contact.' },
                      { type: 'flag_referral_window', risk: 'low_risk', desc: 'Sets a flag on the client document. No external contact.' },
                      { type: 'log_activity', risk: 'low_risk', desc: 'Writes an activity log entry. No external contact.' },
                      { type: 'queue_draft_generation', risk: 'medium_risk', desc: 'Queues a draft for generation. Requires human review before any send.' },
                      { type: 'queue_approval_request', risk: 'medium_risk', desc: 'Puts a request into the approval queue. Human must approve.' },
                    ].map(item => (
                      <div key={item.type} className="flex items-start gap-3 text-xs">
                        {safetyBadge(item.risk)}
                        <div>
                          <span className="font-mono font-medium">{item.type}</span>
                          <span className="text-muted-foreground ml-2">{item.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
