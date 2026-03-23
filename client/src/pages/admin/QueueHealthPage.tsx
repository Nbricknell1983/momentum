import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  XCircle,
  SkipForward,
  ChevronRight,
  Activity,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TaskTypeStat {
  queued:     number;
  running:    number;
  failed24h:  number;
  skipped24h: number;
}

interface QueueHealth {
  healthy:    boolean;
  orgId:      string;
  queued:     number;
  running:    number;
  failed24h:  number;
  ttlSkips24h:number;
  deadLetter: number;
  byTaskType: Record<string, TaskTypeStat>;
  alertFlags: string[];
  checkedAt:  string;
  config:     {
    autopilotEnabled:  boolean;
    scanLimitPerOrg:   number;
    globalQueueMax:    number;
    maxRetries:        number;
  };
}

// ─── Sparkline component (client-only, no new API) ─────────────────────────

interface SparkPoint { t: number; v: number }

function Sparkline({ points, color = '#6366f1' }: { points: SparkPoint[]; color?: string }) {
  if (points.length < 2) return <span className="text-muted-foreground text-xs">–</span>;
  const max = Math.max(...points.map(p => p.v), 1);
  const w = 60; const h = 20;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - (p.v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={coords} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, icon: Icon, variant = 'default', sub
}: {
  title: string;
  value: number;
  icon: any;
  variant?: 'default' | 'warning' | 'danger' | 'success';
  sub?: string;
}) {
  const colors: Record<string, string> = {
    default: 'text-foreground',
    warning: 'text-amber-500',
    danger:  'text-red-500',
    success: 'text-emerald-500',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</span>
          <Icon className={`h-4 w-4 ${colors[variant]}`} />
        </div>
        <div className={`text-2xl font-bold ${colors[variant]}`}>{value.toLocaleString()}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Task name formatter ──────────────────────────────────────────────────────

const TASK_LABELS: Record<string, string> = {
  strategy:            'Strategy',
  website_xray:        'Website X-Ray',
  serp:                'SERP / SEO',
  gbp:                 'GBP',
  ads:                 'Google Ads',
  growth_prescription: 'Growth Rx',
  enrichment:          'Enrichment',
  prep:                'Prep Pack',
};
function taskLabel(t: string) { return TASK_LABELS[t] ?? t; }

function statusBadge(value: number, kind: 'running' | 'failed' | 'queued' | 'skipped') {
  if (value === 0) return <span className="text-muted-foreground text-xs">0</span>;
  const variants: Record<string, string> = {
    running: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    failed:  'bg-red-500/15 text-red-500 border-red-500/30',
    queued:  'bg-amber-500/15 text-amber-500 border-amber-500/30',
    skipped: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${variants[kind]}`}>
      {value}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QueueHealthPage() {
  const { isManager, orgId, authReady } = useAuth();
  const [, setLocation] = useLocation();

  // Sparkline sample accumulator (last 60 min, sampled on each refetch)
  const samplesRef = useRef<{ ts: number; queued: number; running: number }[]>([]);
  const SAMPLE_WINDOW = 60 * 60 * 1000;

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery<QueueHealth>({
    queryKey: ['/api/health/agent-queue'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/health/agent-queue');
      return res.json();
    },
    refetchInterval: 20_000,
    enabled: authReady && isManager && !!orgId,
  });

  // Accumulate sparkline samples
  useEffect(() => {
    if (!data) return;
    const now = Date.now();
    samplesRef.current = [
      ...samplesRef.current.filter(s => now - s.ts < SAMPLE_WINDOW),
      { ts: now, queued: data.queued, running: data.running },
    ];
  }, [data]);

  // Access control
  if (authReady && !isManager) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <XCircle className="h-10 w-10 text-muted-foreground" />
        <div className="text-lg font-semibold">Access Denied</div>
        <div className="text-sm text-muted-foreground">This page is restricted to managers.</div>
      </div>
    );
  }

  const queuedSamples  = samplesRef.current.map(s => ({ t: s.ts, v: s.queued }));
  const runningSamples = samplesRef.current.map(s => ({ t: s.ts, v: s.running }));

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div className="flex flex-col gap-5 p-6 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>Admin</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">Queue Health</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Agent Queue Health
          </h1>
          {updatedStr && (
            <p className="text-xs text-muted-foreground mt-0.5">Last updated {updatedStr}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-queue-health"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/admin/dead-letter')}
            data-testid="button-open-dead-letter"
          >
            <Inbox className="h-3.5 w-3.5 mr-1.5" />
            Dead-Letter
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load queue stats</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {/* Alerts banner */}
      {data?.alertFlags && data.alertFlags.length > 0 && (
        <Alert variant="destructive" className="border-red-500/40 bg-red-500/8">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <AlertTitle className="text-red-500">Queue Alerts</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-0.5">
              {data.alertFlags.map(f => (
                <li key={f} className="text-sm">{f}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Healthy banner */}
      {data?.healthy && data.alertFlags.length === 0 && (
        <Alert className="border-emerald-500/40 bg-emerald-500/8">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <AlertTitle className="text-emerald-600 dark:text-emerald-400">All systems healthy</AlertTitle>
          <AlertDescription className="text-emerald-700 dark:text-emerald-300">
            No alerts detected. Autopilot is {data.config?.autopilotEnabled ? 'active' : 'disabled'}.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          title="Queued"
          value={data?.queued ?? 0}
          icon={Clock}
          variant={data && data.queued > 200 ? 'warning' : 'default'}
          sub="awaiting execution"
        />
        <KpiCard
          title="Running"
          value={data?.running ?? 0}
          icon={RefreshCw}
          variant="default"
          sub="in progress"
        />
        <KpiCard
          title="Failed (24h)"
          value={data?.failed24h ?? 0}
          icon={XCircle}
          variant={data && data.failed24h > 10 ? 'danger' : data && data.failed24h > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          title="TTL Skips (24h)"
          value={data?.ttlSkips24h ?? 0}
          icon={SkipForward}
          variant="default"
          sub="within TTL window"
        />
        <KpiCard
          title="Dead-Letter"
          value={data?.deadLetter ?? 0}
          icon={Inbox}
          variant={data && data.deadLetter > 0 ? 'danger' : 'success'}
          sub="needs manual review"
        />
      </div>

      {/* Sparklines card */}
      {queuedSamples.length > 1 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Depth (60 min rolling)</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Queued</span>
              <Sparkline points={queuedSamples} color="#f59e0b" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Running</span>
              <Sparkline points={runningSamples} color="#6366f1" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-task table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Per-Task Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Loading stats…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Task</TableHead>
                  <TableHead className="text-center">Queued</TableHead>
                  <TableHead className="text-center">Running</TableHead>
                  <TableHead className="text-center">Failed (24h)</TableHead>
                  <TableHead className="text-center">TTL Skips (24h)</TableHead>
                  <TableHead className="text-right pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data && Object.entries(data.byTaskType).map(([task, stat]) => {
                  const hasIssue = stat.failed24h > 0 || stat.running > 5;
                  return (
                    <TableRow key={task} data-testid={`row-task-${task}`}>
                      <TableCell className="pl-4 font-medium text-sm">{taskLabel(task)}</TableCell>
                      <TableCell className="text-center">{statusBadge(stat.queued, 'queued')}</TableCell>
                      <TableCell className="text-center">{statusBadge(stat.running, 'running')}</TableCell>
                      <TableCell className="text-center">{statusBadge(stat.failed24h, 'failed')}</TableCell>
                      <TableCell className="text-center">{statusBadge(stat.skipped24h, 'skipped')}</TableCell>
                      <TableCell className="text-right pr-4">
                        {hasIssue ? (
                          <Badge variant="destructive" className="text-xs">Needs attention</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/30">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {data && Object.keys(data.byTaskType).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-8">
                      No task data yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Config footer */}
      {data?.config && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
          <span>Autopilot: <strong className={data.config.autopilotEnabled ? 'text-emerald-500' : 'text-muted-foreground'}>{data.config.autopilotEnabled ? 'enabled' : 'disabled'}</strong></span>
          <span>•</span>
          <span>Per-org cap: <strong>{data.config.scanLimitPerOrg}</strong></span>
          <span>•</span>
          <span>Global queue max: <strong>{data.config.globalQueueMax}</strong></span>
          <span>•</span>
          <span>Max retries: <strong>{data.config.maxRetries}</strong></span>
        </div>
      )}
    </div>
  );
}
