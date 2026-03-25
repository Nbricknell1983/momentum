import { useState }         from 'react';
import { useSelector }      from 'react-redux';
import { format, formatDistanceToNow } from 'date-fns';
import {
  RefreshCw, CheckCircle2, AlertCircle, Clock, AlertTriangle,
  Wifi, WifiOff, ArrowRight, ChevronDown, ChevronRight,
  Activity, Database, Zap, Globe, Eye, Info, Play,
} from 'lucide-react';
import { Button }           from '@/components/ui/button';
import { Badge }            from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast }         from '@/hooks/use-toast';
import type { RootState }   from '@/store';
import { useAISystemsSyncAll } from '@/hooks/useAISystemsSync';
import type { AISystemsSyncSnapshot, SyncStatus } from '@/lib/aiSystemsSyncTypes';
import { apiRequest }       from '@/lib/queryClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: SyncStatus) {
  switch (status) {
    case 'live':         return <Badge className="bg-green-100 text-green-700 border-green-200">Live</Badge>;
    case 'stale':        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Stale</Badge>;
    case 'expired':      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Expired</Badge>;
    case 'failed':       return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
    case 'never_synced': return <Badge className="bg-gray-100 text-gray-500 border-gray-200">Never synced</Badge>;
  }
}

function syncStatusIcon(status: SyncStatus) {
  switch (status) {
    case 'live':         return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'stale':        return <Clock        className="w-4 h-4 text-yellow-500" />;
    case 'expired':      return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    case 'failed':       return <AlertCircle  className="w-4 h-4 text-red-500" />;
    case 'never_synced': return <WifiOff      className="w-4 h-4 text-gray-400" />;
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'dd/MM/yyyy HH:mm');
  } catch { return iso; }
}

function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); }
  catch { return '—'; }
}

function lifecycleBadge(state?: string) {
  if (!state) return <span className="text-muted-foreground text-xs">—</span>;
  const colors: Record<string, string> = {
    active:               'bg-green-100 text-green-700',
    ready_for_onboarding: 'bg-blue-100 text-blue-700',
    workflows_queued:     'bg-blue-100 text-blue-700',
    modules_configured:   'bg-indigo-100 text-indigo-700',
    tenant_created:       'bg-purple-100 text-purple-700',
    validated:            'bg-purple-100 text-purple-700',
    received:             'bg-gray-100 text-gray-600',
    paused:               'bg-yellow-100 text-yellow-700',
    failed:               'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors[state] ?? 'bg-gray-100 text-gray-600'}`}>
      {state.replace(/_/g, ' ')}
    </span>
  );
}

function healthDot(h?: string) {
  if (h === 'green') return <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />;
  if (h === 'amber') return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1" />;
  if (h === 'red')   return <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${colour}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-0.5 opacity-70">{label}</div>
    </div>
  );
}

// ── Client Sync Row ───────────────────────────────────────────────────────────

function ClientSyncRow({
  snapshot, orgId, onRefresh,
}: {
  snapshot: AISystemsSyncSnapshot;
  orgId: string;
  onRefresh: (clientId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = snapshot.summary;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
        data-testid={`ai-sync-row-${snapshot.clientId}`}
      >
        {syncStatusIcon(snapshot.syncStatus)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{snapshot.clientId}</span>
            {statusBadge(snapshot.syncStatus)}
            {s && lifecycleBadge(s.lifecycleState)}
            {s && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                {healthDot(s.overallHealth)}{s.overallHealth ?? 'unknown'}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Tenant: <span className="font-mono">{snapshot.tenantId}</span>
            {snapshot.lastSyncedAt && (
              <> · Synced {fmtAgo(snapshot.lastSyncedAt)}</>
            )}
            {snapshot.syncMethod && (
              <> · via {snapshot.syncMethod}</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {snapshot.syncCount > 0 && (
            <span className="text-xs text-muted-foreground">{snapshot.syncCount} sync{snapshot.syncCount !== 1 ? 's' : ''}</span>
          )}
          {snapshot.errorCount > 0 && (
            <span className="text-xs text-red-500">{snapshot.errorCount} error{snapshot.errorCount !== 1 ? 's' : ''}</span>
          )}
          <button
            className="p-1.5 rounded hover:bg-muted transition-colors"
            onClick={e => { e.stopPropagation(); onRefresh(snapshot.clientId); }}
            title="Refresh this client"
            data-testid={`ai-sync-refresh-${snapshot.clientId}`}
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border/60 bg-muted/20">
          {snapshot.lastError && (
            <div className="mb-3 p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
              <strong>Last error:</strong> {snapshot.lastError}
            </div>
          )}
          {!s ? (
            <p className="text-sm text-muted-foreground italic">No summary data available yet. Run a sync to pull delivery state from AI Systems.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-medium mb-1.5 text-muted-foreground uppercase tracking-wide">Delivery State</p>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Website</span><span className="font-mono">{s.websiteStatus}</span></div>
                  <div className="flex justify-between"><span>SEO</span><span className="font-mono">{s.seoStatus}</span></div>
                  <div className="flex justify-between"><span>GBP</span><span className="font-mono">{s.gbpStatus}</span></div>
                  <div className="flex justify-between"><span>Content</span><span className="font-mono">{s.contentStatus}</span></div>
                  <div className="flex justify-between"><span>Telemetry</span><span className="font-mono">{s.telemetryStatus}</span></div>
                  <div className="flex justify-between"><span>Portal</span><span className="font-mono">{s.portalStatus}</span></div>
                </div>
              </div>
              <div>
                <p className="font-medium mb-1.5 text-muted-foreground uppercase tracking-wide">Active Agents / Links</p>
                {s.activeAgents?.length > 0
                  ? s.activeAgents.map(a => <div key={a} className="font-mono">{a}</div>)
                  : <p className="text-muted-foreground">None active</p>
                }
                {s.websiteUrl && (
                  <a href={s.websiteUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 mt-2 text-blue-600 hover:underline">
                    <Globe className="w-3 h-3" /> Website
                  </a>
                )}
                {s.portalUrl && (
                  <a href={s.portalUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 mt-1 text-blue-600 hover:underline">
                    <Eye className="w-3 h-3" /> Portal
                  </a>
                )}
              </div>
              {s.activeBlockers?.length > 0 && (
                <div className="col-span-2">
                  <p className="font-medium mb-1.5 text-muted-foreground uppercase tracking-wide">Active Blockers</p>
                  <div className="space-y-1">
                    {s.activeBlockers.map((b: any) => (
                      <div key={b.blockerId} className="flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                        <span>[{b.module}] {b.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {s.recentMilestones?.length > 0 && (
                <div className="col-span-2">
                  <p className="font-medium mb-1.5 text-muted-foreground uppercase tracking-wide">Recent Milestones</p>
                  <div className="space-y-1">
                    {s.recentMilestones.slice(0, 3).map((m: any) => (
                      <div key={m.milestoneId} className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                        <span>{m.label}</span>
                        <span className="text-muted-foreground ml-auto">{fmtDate(m.achievedAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-4 text-xs text-muted-foreground">
            <span>Last attempted: {fmtDate(snapshot.lastAttemptedAt)}</span>
            <span>Last synced: {fmtDate(snapshot.lastSyncedAt)}</span>
            <span className="ml-auto">Schema: {snapshot.schemaVersion}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Workspace ────────────────────────────────────────────────────────────

export default function AISystemsSyncWorkspace() {
  const { toast }            = useToast();
  const orgId                = useSelector((s: RootState) => s.app.currentOrgId);
  const { snapshots, loading } = useAISystemsSyncAll(orgId);

  const [running,    setRunning]    = useState(false);
  const [runLog,     setRunLog]     = useState<string[]>([]);
  const [activeTab,  setActiveTab]  = useState('clients');

  const live    = snapshots.filter(s => s.syncStatus === 'live').length;
  const stale   = snapshots.filter(s => s.syncStatus === 'stale').length;
  const expired = snapshots.filter(s => s.syncStatus === 'expired').length;
  const failed  = snapshots.filter(s => s.syncStatus === 'failed').length;
  const never   = snapshots.filter(s => s.syncStatus === 'never_synced').length;
  const withSummary = snapshots.filter(s => !!s.summary).length;

  // Sort: failed/expired first, then stale, then live
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    const order: Record<string, number> = { failed: 0, expired: 1, stale: 2, never_synced: 3, live: 4 };
    return (order[a.syncStatus] ?? 5) - (order[b.syncStatus] ?? 5);
  });

  async function handleRunSync() {
    if (!orgId || running) return;
    setRunning(true);
    setRunLog([]);
    try {
      const data: any = await apiRequest('POST', `/api/integration/sync/run`);
      setRunLog(data.log ?? []);
      const r = data.run;
      toast({
        title: 'Sync complete',
        description: `${r.clientsSucceeded}/${r.clientsAttempted} clients synced, ${r.clientsSkipped} skipped`,
      });
    } catch (err: any) {
      toast({ title: 'Sync failed', description: err.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  }

  async function handleRefreshClient(clientId: string) {
    if (!orgId) return;
    try {
      await apiRequest('POST', `/api/integration/sync/clients/${clientId}/refresh`);
      toast({ title: 'Refreshed', description: `Client ${clientId} sync triggered` });
    } catch (err: any) {
      toast({ title: 'Refresh failed', description: err.message, variant: 'destructive' });
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">AI Systems Sync</h1>
            <p className="text-sm text-muted-foreground">
              Live delivery summaries pulled from AI Systems every 4 hours · Push-receive supported
            </p>
          </div>
        </div>
        <Button
          onClick={handleRunSync}
          disabled={running}
          data-testid="button-run-sync"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Syncing…' : 'Sync Now'}
        </Button>
      </div>

      {/* Health strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Live"          value={live}    colour="border-green-200 bg-green-50 dark:bg-green-950/20 text-green-700" />
        <StatCard label="Stale"         value={stale}   colour="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-700" />
        <StatCard label="Expired"       value={expired} colour="border-orange-200 bg-orange-50 dark:bg-orange-950/20 text-orange-700" />
        <StatCard label="Failed"        value={failed}  colour="border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700" />
        <StatCard label="Never synced"  value={never}   colour="border-gray-200 bg-gray-50 dark:bg-gray-900/20 text-gray-600" />
        <StatCard label="With summary"  value={withSummary} colour="border-blue-200 bg-blue-50 dark:bg-blue-950/20 text-blue-700" />
      </div>

      {/* Alerts */}
      {(failed > 0 || expired > 0) && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            {failed > 0 && <><strong>{failed}</strong> client{failed !== 1 ? 's' : ''} failed their last sync. </>}
            {expired > 0 && <><strong>{expired}</strong> client{expired !== 1 ? 's' : ''} have expired sync data (&gt;24h old). </>}
            Run a sync now to refresh.
          </span>
        </div>
      )}

      {/* Sync contract note */}
      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/10">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Summary contract:</strong> Momentum pulls{' '}
              <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded text-xs">GET /api/integration/tenants/{'{tenantId}'}/summary</code>{' '}
              from AI Systems for each provisioned client. AI Systems can also push summaries to{' '}
              <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded text-xs">POST /api/integration/sync/push</code>.{' '}
              Data is cached in Firestore at{' '}
              <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded text-xs">orgs/{'{orgId}'}/aiSystemsSync/{'{clientId}'}</code>.{' '}
              Adapters prefer live data (&lt;4h) → cached data (&lt;24h) → inferred state.
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="clients"  data-testid="tab-clients">Clients ({snapshots.length})</TabsTrigger>
          <TabsTrigger value="run-log" data-testid="tab-run-log">Last Run Log</TabsTrigger>
          <TabsTrigger value="quality" data-testid="tab-quality">Data Quality Rules</TabsTrigger>
        </TabsList>

        {/* ── Clients tab ─────────────────────────────────────────────────── */}
        <TabsContent value="clients" className="mt-4 space-y-2">
          {loading && (
            <div className="text-center py-10 text-muted-foreground text-sm">Loading sync snapshots…</div>
          )}
          {!loading && snapshots.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="font-medium">No sync data yet</p>
              <p className="text-sm mt-1">Run a sync to pull delivery summaries from AI Systems for all provisioned clients.</p>
            </div>
          )}
          {sortedSnapshots.map(snap => (
            <ClientSyncRow
              key={snap.clientId}
              snapshot={snap}
              orgId={orgId ?? ''}
              onRefresh={handleRefreshClient}
            />
          ))}
        </TabsContent>

        {/* ── Run log tab ─────────────────────────────────────────────────── */}
        <TabsContent value="run-log" className="mt-4">
          <div className="rounded-lg bg-gray-900 dark:bg-gray-950 p-4 font-mono text-xs overflow-y-auto max-h-[500px] min-h-[200px]">
            {runLog.length === 0 ? (
              <p className="text-gray-500">No sync run output yet. Click "Sync Now" to run a manual sync.</p>
            ) : (
              runLog.map((line, i) => (
                <div key={i} className={
                  line.includes('✗') || line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')
                    ? 'text-red-400'
                    : line.includes('✓') || line.toLowerCase().includes('complete')
                    ? 'text-green-400'
                    : line.startsWith('[')
                    ? 'text-blue-300'
                    : 'text-gray-300'
                }>{line}</div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ── Quality rules tab ───────────────────────────────────────────── */}
        <TabsContent value="quality" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4" /> Data Quality and Fallback Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-4">
              <div className="space-y-2">
                {[
                  { badge: 'Live', color: 'bg-green-100 text-green-700', desc: 'Last synced within 4 hours. Full AI Systems delivery summary available. Used directly in Unified Ops, Client Command, Daily Briefing, and Expansion views.' },
                  { badge: 'Cached', color: 'bg-yellow-100 text-yellow-700', desc: 'Last synced between 4 and 24 hours ago. Previous summary preserved and used with a "Cached" indicator. Adapters prefer this over inferred state.' },
                  { badge: 'Expired', color: 'bg-orange-100 text-orange-700', desc: 'Last synced more than 24 hours ago. Previous summary not used. Falls back to state inferred from Momentum fields (deliveryStatus, modules, healthStatus).' },
                  { badge: 'Failed', color: 'bg-red-100 text-red-700', desc: 'Last sync attempt failed. If a previous summary exists (within 24h), it may still be used with a staleness warning. Otherwise falls back to inferred.' },
                  { badge: 'Never synced', color: 'bg-gray-100 text-gray-600', desc: 'No sync has been attempted for this client. AI Systems state is fully inferred from Momentum-synced fields. Quality marked "derived" in all views.' },
                ].map(({ badge, color, desc }) => (
                  <div key={badge} className="flex items-start gap-3 p-3 rounded border border-border">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${color}`}>{badge}</span>
                    <p className="text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 rounded border border-border bg-muted/30">
                <p className="font-medium mb-2">Fallback priority chain</p>
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="px-2 py-1 rounded bg-green-100 text-green-700">Live AI Systems summary</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700">Cached AI Systems summary</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">Inferred from Momentum fields</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="px-2 py-1 rounded bg-gray-100 text-gray-600">Unavailable</span>
                </div>
              </div>

              <div className="mt-4">
                <p className="font-medium mb-2">Where sync data is used</p>
                <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                  {[
                    ['Unified Cross-System Ops', '/unified-ops', 'aiSystemsAdapter.buildAISystemsStateFromLiveSummary()'],
                    ['Client Command Centre', '/portal/:clientId', 'Prefers live snapshot blockers, milestones, next actions'],
                    ['Manager Daily Briefing', '/briefing', 'Blockers and health notes from live snapshots'],
                    ['Expansion Engine', '/clients', 'Delivery health feeds churn-risk and referral-timing signals'],
                    ['Agent Command / Bullpen', '/bullpen', 'Tenant lifecycle state informs agent prioritisation'],
                  ].map(([name, path, detail]) => (
                    <div key={name} className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
                      <Zap className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-foreground">{name}</span>
                        <span className="text-muted-foreground"> · {path}</span>
                        <p className="text-muted-foreground">{detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
