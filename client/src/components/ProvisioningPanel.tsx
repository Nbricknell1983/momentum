import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw,
  Rocket, RotateCcw, Plug, ExternalLink, ChevronDown, ChevronUp,
  Clock, ShieldCheck, ShieldX, Zap, Info, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm'); } catch { return '—'; }
}

async function apiRequest(method: string, url: string, body?: unknown) {
  const auth = (window as any).__firebaseAuth;
  const token = auth ? await auth.currentUser?.getIdToken() : null;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Lifecycle state display config
// ---------------------------------------------------------------------------

type LifecycleState =
  | 'received' | 'validated' | 'tenant_created' | 'modules_configured'
  | 'workflows_queued' | 'ready_for_onboarding' | 'active' | 'failed';

const LIFECYCLE_CONFIG: Record<LifecycleState, { label: string; color: string; icon: typeof CheckCircle2; step: number }> = {
  received:              { label: 'Received',             color: 'text-blue-600 dark:text-blue-400',     icon: Clock,         step: 1 },
  validated:             { label: 'Validated',            color: 'text-blue-600 dark:text-blue-400',     icon: ShieldCheck,   step: 2 },
  tenant_created:        { label: 'Tenant Created',       color: 'text-indigo-600 dark:text-indigo-400', icon: CheckCircle2,  step: 3 },
  modules_configured:    { label: 'Modules Configured',   color: 'text-violet-600 dark:text-violet-400', icon: Settings,      step: 4 },
  workflows_queued:      { label: 'Workflows Queued',     color: 'text-amber-600 dark:text-amber-400',   icon: Zap,           step: 5 },
  ready_for_onboarding:  { label: 'Ready for Onboarding', color: 'text-emerald-600 dark:text-emerald-400', icon: ShieldCheck, step: 6 },
  active:                { label: 'Active',               color: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle2, step: 7 },
  failed:                { label: 'Failed',               color: 'text-red-600 dark:text-red-400',       icon: XCircle,       step: 0 },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProvisioningPanelProps {
  clientId:    string;
  orgId:       string;
  clientName?: string;
}

// ---------------------------------------------------------------------------
// Scope selection state
// ---------------------------------------------------------------------------

interface ScopeSelection {
  website: boolean;
  seo:     boolean;
  gbp:     boolean;
  ads:     boolean;
  portal:  boolean;
  autopilot: boolean;
}

const DEFAULT_SCOPE: ScopeSelection = {
  website:   false,
  seo:       false,
  gbp:       true,
  ads:       false,
  portal:    false,
  autopilot: false,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProvisioningPanel({ clientId, orgId, clientName }: ProvisioningPanelProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showLog, setShowLog] = useState(false);
  const [showScopeEditor, setShowScopeEditor] = useState(false);
  const [scope, setScope] = useState<ScopeSelection>(DEFAULT_SCOPE);
  const [planTier, setPlanTier] = useState('growth');

  // ── Queries ──────────────────────────────────────────────────────────────

  const baseUrl = `/api/integration/clients/${clientId}`;

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/integration', clientId, 'status', orgId],
    queryFn:  () => apiRequest('GET', `${baseUrl}/status?orgId=${orgId}`),
    refetchInterval: 30_000,
  });

  const { data: readinessData, isLoading: readinessLoading } = useQuery({
    queryKey: ['/api/integration', clientId, 'readiness', orgId],
    queryFn:  () => apiRequest('GET', `${baseUrl}/readiness?orgId=${orgId}`),
  });

  const { data: logData } = useQuery({
    queryKey: ['/api/integration', clientId, 'log', orgId],
    queryFn:  () => apiRequest('GET', `${baseUrl}/log?orgId=${orgId}`),
    enabled:  showLog,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['/api/integration', clientId] });
  };

  const provisionMutation = useMutation({
    mutationFn: () => apiRequest('POST', `${baseUrl}/provision?orgId=${orgId}`, {
      scopeSelection: scope,
      archetype: 'local_anchor',
      planTier,
      orgId,
    }),
    onSuccess: (data) => {
      toast({ title: 'Provisioning started', description: `Tenant ID: ${data.tenantId}` });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Provisioning failed', description: err.message, variant: 'destructive' });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => apiRequest('POST', `${baseUrl}/provision?orgId=${orgId}`, {
      scopeSelection: scope,
      archetype: 'local_anchor',
      planTier,
      orgId,
    }),
    onSuccess: () => {
      toast({ title: 'Retry sent' });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Retry failed', description: err.message, variant: 'destructive' });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest('POST', `${baseUrl}/refresh?orgId=${orgId}`, { orgId }),
    onSuccess: (data) => {
      toast({ title: 'Status refreshed', description: `State: ${data.lifecycleState}` });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ title: 'Refresh failed', description: err.message, variant: 'destructive' });
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────

  const integration = statusData?.integration;
  const readiness   = readinessData?.readiness;
  const configured  = statusData?.configured ?? readinessData?.readiness?.configured ?? false;
  const isProvisioned = !!integration?.tenantId;
  const isFailed      = integration?.lifecycleState === 'failed';
  const isActive      = integration?.lifecycleState === 'active';
  const lifecycleConfig = integration?.lifecycleState
    ? LIFECYCLE_CONFIG[integration.lifecycleState as LifecycleState]
    : null;

  const isBusy = provisionMutation.isPending || retryMutation.isPending || refreshMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────

  if (statusLoading || readinessLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading integration state…
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="provisioning-panel">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plug className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          <span className="text-sm font-semibold">AI Systems Integration</span>
          {!configured && (
            <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
              Not configured
            </Badge>
          )}
        </div>
        {isProvisioned && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => refreshMutation.mutate()}
            disabled={isBusy}
            data-testid="btn-refresh-status"
          >
            {refreshMutation.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
            Refresh
          </Button>
        )}
      </div>

      {/* ── Config warning ──────────────────────────────────────────────── */}
      {!configured && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Integration not configured</p>
            <p className="mt-0.5 text-amber-600 dark:text-amber-500">
              Add <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">AI_SYSTEMS_BASE_URL</code> and{' '}
              <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">AI_SYSTEMS_API_KEY</code> to Replit Secrets.
            </p>
          </div>
        </div>
      )}

      {/* ── Current State ───────────────────────────────────────────────── */}
      {isProvisioned && lifecycleConfig && (
        <div className="rounded-lg border bg-card p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <lifecycleConfig.icon className={`w-4 h-4 ${lifecycleConfig.color}`} />
              <span className={`text-sm font-medium ${lifecycleConfig.color}`}>{lifecycleConfig.label}</span>
            </div>
            {integration?.portalUrl && (
              <a
                href={integration.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                data-testid="link-portal-url"
              >
                Open Portal <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Tenant ID</p>
              <p className="font-mono text-xs truncate" data-testid="text-tenant-id">{integration.tenantId}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Provisioned</p>
              <p data-testid="text-provisioned-at">{fmtDate(integration.provisionedAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last sync</p>
              <p data-testid="text-last-synced">{fmtDate(integration.lastSyncedAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Schema version</p>
              <p>{integration.lastSyncedVersion || '—'}</p>
            </div>
          </div>

          {/* Step progress bar */}
          {lifecycleConfig.step > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{lifecycleConfig.step}/7</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isActive ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-violet-500'
                  }`}
                  style={{ width: `${(lifecycleConfig.step / 7) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Readiness Check ─────────────────────────────────────────────── */}
      {readiness && !isProvisioned && (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Readiness</span>
            <span className={`text-sm font-bold ${
              readiness.score >= 80 ? 'text-emerald-600 dark:text-emerald-400'
              : readiness.score >= 50 ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400'
            }`} data-testid="text-readiness-score">
              {readiness.score}%
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${
                readiness.score >= 80 ? 'bg-emerald-500'
                : readiness.score >= 50 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${readiness.score}%` }}
            />
          </div>

          {readiness.missingRequired?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                <ShieldX className="w-3 h-3" /> Required fields missing
              </p>
              {readiness.missingRequired.map((f: string) => (
                <div key={f} className="text-xs text-muted-foreground flex items-center gap-1.5 pl-4">
                  <span className="w-1 h-1 rounded-full bg-red-400" />
                  {f}
                </div>
              ))}
            </div>
          )}

          {readiness.warnings?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Info className="w-3 h-3" /> Warnings
              </p>
              {readiness.warnings.map((w: string) => (
                <div key={w} className="text-xs text-muted-foreground flex items-center gap-1.5 pl-4">
                  <span className="w-1 h-1 rounded-full bg-amber-400" />
                  {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sync Errors ─────────────────────────────────────────────────── */}
      {integration?.syncErrors?.length > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-3 space-y-1.5">
          <p className="text-xs font-medium text-red-700 dark:text-red-400 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Recent errors
          </p>
          {integration.syncErrors.slice(-3).map((e: any, i: number) => (
            <div key={i} className="text-xs text-red-600 dark:text-red-400 pl-4" data-testid={`text-sync-error-${i}`}>
              <span className="text-muted-foreground">{fmtDate(e.occurredAt)} · </span>
              {e.message}
              {e.httpStatus ? <span className="ml-1 opacity-60">[{e.httpStatus}]</span> : null}
            </div>
          ))}
        </div>
      )}

      {/* ── Scope editor ────────────────────────────────────────────────── */}
      {!isProvisioned && configured && (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <button
            className="flex items-center justify-between w-full text-xs font-medium text-left"
            onClick={() => setShowScopeEditor(s => !s)}
            data-testid="btn-toggle-scope"
          >
            <span className="flex items-center gap-1.5">
              <Settings className="w-3 h-3" /> Scope Selection
            </span>
            {showScopeEditor ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showScopeEditor && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-1.5">
                {(['website', 'seo', 'gbp', 'ads', 'portal', 'autopilot'] as (keyof ScopeSelection)[]).map(key => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={scope[key]}
                      onChange={e => setScope(s => ({ ...s, [key]: e.target.checked }))}
                      data-testid={`checkbox-scope-${key}`}
                      className="rounded"
                    />
                    <span className="capitalize">{key === 'seo' ? 'SEO' : key === 'gbp' ? 'GBP' : key}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Plan tier:</span>
                <select
                  value={planTier}
                  onChange={e => setPlanTier(e.target.value)}
                  className="text-xs border rounded px-1.5 py-0.5 bg-background"
                  data-testid="select-plan-tier"
                >
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="scale">Scale</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">

        {/* Create tenant */}
        {!isProvisioned && configured && (
          <Button
            size="sm"
            onClick={() => provisionMutation.mutate()}
            disabled={isBusy || !readiness?.ready}
            className="gap-1.5"
            data-testid="btn-provision"
          >
            {provisionMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Rocket className="w-4 h-4" />}
            Create Tenant
          </Button>
        )}

        {/* Retry */}
        {(isProvisioned && (isFailed || integration?.syncErrors?.length > 0)) && configured && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => retryMutation.mutate()}
            disabled={isBusy}
            className="gap-1.5"
            data-testid="btn-retry"
          >
            {retryMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RotateCcw className="w-4 h-4" />}
            Retry Provisioning
          </Button>
        )}

        {/* Refresh status */}
        {isProvisioned && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => refreshMutation.mutate()}
            disabled={isBusy}
            className="gap-1.5"
            data-testid="btn-refresh"
          >
            {refreshMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
            Refresh Status
          </Button>
        )}
      </div>

      {/* ── Audit log toggle ─────────────────────────────────────────────── */}
      {isProvisioned && (
        <div>
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowLog(s => !s)}
            data-testid="btn-toggle-log"
          >
            {showLog ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showLog ? 'Hide' : 'Show'} provisioning log
          </button>

          {showLog && logData?.log?.length > 0 && (
            <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
              {logData.log.map((entry: any) => (
                <div
                  key={entry.id}
                  className="text-xs border rounded-md p-2 space-y-0.5 bg-muted/30"
                  data-testid={`log-entry-${entry.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{entry.eventType.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground">{fmtDate(entry.eventAt)}</span>
                  </div>
                  {entry.httpStatus && (
                    <span className={`${entry.httpStatus < 400 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      HTTP {entry.httpStatus}
                    </span>
                  )}
                  {entry.error && (
                    <p className="text-red-600 dark:text-red-400 truncate">{entry.error}</p>
                  )}
                  {entry.durationMs && (
                    <span className="text-muted-foreground">{entry.durationMs}ms</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
