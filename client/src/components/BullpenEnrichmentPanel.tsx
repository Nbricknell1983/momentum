import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Brain, RefreshCw, Loader2, CheckCircle2, AlertTriangle,
  XCircle, Clock, Zap, ChevronDown, ChevronUp, ShieldAlert,
  Users, TrendingUp, Info, Play,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BatchStatus {
  status: 'idle' | 'running' | 'complete' | 'error';
  startedAt?: string;
  completedAt?: string;
  startedBy?: string;
  enrichedLeads?: number;
  skippedLeads?: number;
  enrichedClients?: number;
  skippedClients?: number;
  fieldsAutoFilled?: number;
  totalProcessed?: number;
  blockerCounts?: Record<string, number>;
  error?: string;
}

// ── Dependency label map ────────────────────────────────────────────────────────

const DEP_LABELS: Record<string, { label: string; severity: 'high' | 'medium' | 'low' }> = {
  ahrefs_api:         { label: 'Ahrefs API not configured',             severity: 'medium' },
  gbp_oauth:          { label: 'GBP OAuth not connected',              severity: 'high'   },
  gbp_client_link:    { label: 'GBP location not linked per client',   severity: 'medium' },
  local_falcon_place: { label: 'Local Falcon place not linked',        severity: 'low'    },
  website_field:      { label: 'No website URL on record',             severity: 'medium' },
};

// ── Coverage badge ─────────────────────────────────────────────────────────────

function CoverageBadge({ level }: { level?: string }) {
  if (!level) return null;
  const map: Record<string, { cls: string; label: string }> = {
    complete: { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', label: 'Complete' },
    good:     { cls: 'bg-sky-500/15 text-sky-400 border-sky-500/20',             label: 'Good'     },
    partial:  { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20',       label: 'Partial'  },
    none:     { cls: 'bg-muted/20 text-muted-foreground border-border/30',       label: 'None'     },
  };
  const s = map[level] ?? map.none;
  return (
    <Badge className={`border text-[10px] px-1.5 py-0 ${s.cls}`}>{s.label}</Badge>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDt(iso?: string | null) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm'); } catch { return iso; }
}

function fmtAgo(iso?: string | null) {
  if (!iso) return null;
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return null; }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BullpenEnrichmentPanel() {
  const { orgId } = useAuth();
  const qc = useQueryClient();
  const [showBlockers, setShowBlockers] = useState(false);
  const [pollActive, setPollActive] = useState(false);

  // ── Batch status query (with polling when running) ───────────────────────────
  const { data: batchStatus, refetch: refetchStatus } = useQuery<BatchStatus>({
    queryKey: ['/api/enrichment/batch-status', orgId],
    queryFn: async () => {
      const r = await fetch(`/api/enrichment/batch-status?orgId=${orgId}`);
      if (!r.ok) return { status: 'idle' };
      return r.json();
    },
    enabled: !!orgId,
    refetchInterval: pollActive ? 5000 : false,
    staleTime: 10000,
  });

  // Enable/disable polling based on batch status
  useEffect(() => {
    if (batchStatus?.status === 'running') {
      setPollActive(true);
    } else {
      setPollActive(false);
    }
  }, [batchStatus?.status]);

  // ── Run batch mutation ────────────────────────────────────────────────────────
  const runBatch = useMutation({
    mutationFn: (force: boolean) =>
      apiRequest('POST', '/api/enrichment/batch', { orgId, force }),
    onSuccess: () => {
      setPollActive(true);
      qc.invalidateQueries({ queryKey: ['/api/enrichment/batch-status', orgId] });
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────────
  const isRunning = batchStatus?.status === 'running' || runBatch.isPending;
  const hasResult = batchStatus?.status === 'complete' || batchStatus?.status === 'error';
  const blockerEntries = Object.entries(batchStatus?.blockerCounts ?? {}).sort(([,a],[,b]) => b - a);

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4" data-testid="bullpen-enrichment-panel">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-foreground">Intelligence Enrichment</span>
          {isRunning && (
            <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/20 text-xs px-1.5 py-0.5 animate-pulse">
              Running…
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasResult && (
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => runBatch.mutate(true)}
              disabled={isRunning}
              data-testid="force-rerun-enrichment-btn"
              title="Force re-run all (ignores 7-day skip)"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            size="sm" variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => runBatch.mutate(false)}
            disabled={isRunning}
            data-testid="run-enrichment-batch-btn"
          >
            {isRunning
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Play className="h-3 w-3" />}
            {isRunning ? 'Processing…' : 'Run Enrichment'}
          </Button>
        </div>
      </div>

      {/* ── Status description ── */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Automatically enriches all active leads and clients — inferring identity, generating strategic intelligence, and flagging missing integrations or data dependencies.
        Records enriched in the last 7 days are skipped unless forced.
      </p>

      {/* ── Running indicator ── */}
      {isRunning && (
        <div className="rounded-lg border border-violet-500/20 bg-violet-500/8 p-3 flex items-center gap-3">
          <Loader2 className="h-4 w-4 text-violet-400 animate-spin flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-violet-300">Enrichment batch running</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Processing leads and clients with 3-pass intelligence analysis. This may take several minutes depending on your pipeline size.
            </p>
          </div>
        </div>
      )}

      {/* ── Error state ── */}
      {batchStatus?.status === 'error' && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/8 p-3 flex items-start gap-2">
          <XCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-300">Batch run failed</p>
            {batchStatus.error && <p className="text-[11px] text-muted-foreground mt-0.5">{batchStatus.error}</p>}
          </div>
        </div>
      )}

      {/* ── Results card ── */}
      {batchStatus?.status === 'complete' && (
        <div className="space-y-3">
          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2">
            <StatTile
              label="Leads enriched"
              value={batchStatus.enrichedLeads ?? 0}
              sub={`${batchStatus.skippedLeads ?? 0} skipped`}
              icon={<TrendingUp className="h-3.5 w-3.5 text-violet-400" />}
            />
            <StatTile
              label="Clients enriched"
              value={batchStatus.enrichedClients ?? 0}
              sub={`${batchStatus.skippedClients ?? 0} skipped`}
              icon={<Users className="h-3.5 w-3.5 text-sky-400" />}
            />
            <StatTile
              label="Fields auto-filled"
              value={batchStatus.fieldsAutoFilled ?? 0}
              sub="high confidence"
              icon={<Zap className="h-3.5 w-3.5 text-emerald-400" />}
            />
            <StatTile
              label="Dependency blockers"
              value={blockerEntries.length}
              sub="unique types"
              icon={<ShieldAlert className="h-3.5 w-3.5 text-amber-400" />}
            />
          </div>

          {/* Last run timestamp */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
            <Clock className="h-3 w-3" />
            Completed {fmtAgo(batchStatus.completedAt)} — {fmtDt(batchStatus.completedAt)}
          </div>

          {/* Dependency blockers */}
          {blockerEntries.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-amber-500/5 transition-colors"
                onClick={() => setShowBlockers(s => !s)}
                data-testid="toggle-blockers-btn"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-300">
                    {blockerEntries.length} integration gap{blockerEntries.length !== 1 ? 's' : ''} blocking enrichment
                  </span>
                </div>
                {showBlockers ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>

              {showBlockers && (
                <div className="px-3 pb-3 space-y-2 border-t border-amber-500/15 pt-2">
                  {blockerEntries.map(([dep, count]) => {
                    const meta = DEP_LABELS[dep] ?? { label: dep, severity: 'low' };
                    const severityColor = meta.severity === 'high' ? 'text-red-400' : meta.severity === 'medium' ? 'text-amber-400' : 'text-muted-foreground';
                    return (
                      <div key={dep} className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <ShieldAlert className={`h-3 w-3 flex-shrink-0 mt-0.5 ${severityColor}`} />
                          <div>
                            <p className="text-xs text-foreground/80">{meta.label}</p>
                            <p className="text-[11px] text-muted-foreground">Affects {count} record{count !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <Badge className={`border text-[10px] px-1.5 py-0 flex-shrink-0 ${
                          meta.severity === 'high'   ? 'bg-red-500/15 text-red-400 border-red-500/20' :
                          meta.severity === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                                                       'bg-muted/20 text-muted-foreground border-border/30'
                        }`}>
                          {meta.severity}
                        </Badge>
                      </div>
                    );
                  })}

                  <div className="mt-2 pt-2 border-t border-amber-500/15">
                    <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <Info className="h-3 w-3 flex-shrink-0 mt-0.5 text-amber-400/60" />
                      <span>These gaps cannot be resolved by the enrichment engine alone. Each requires a specific integration, API key, or manual data entry to unlock.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Idle state ── */}
      {!isRunning && !hasResult && (
        <div className="rounded-xl border border-dashed border-border/40 p-5 text-center space-y-2">
          <Brain className="h-7 w-7 text-muted-foreground/30 mx-auto" />
          <p className="text-sm text-muted-foreground">No enrichment run yet.</p>
          <p className="text-xs text-muted-foreground/60">
            Click Run Enrichment to analyse all active leads and clients — inferring missing intelligence, generating strategic summaries, and surfacing integration blockers.
          </p>
        </div>
      )}

      {/* ── Field coverage guide ── */}
      <details className="group">
        <summary className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none">
          <ChevronDown className="h-3.5 w-3.5 group-open:rotate-180 transition-transform" />
          What gets enriched
        </summary>
        <div className="mt-2 space-y-2 pl-5">
          {FIELD_COVERAGE_GROUPS.map(g => (
            <div key={g.label}>
              <p className="text-[11px] font-semibold text-foreground/60 uppercase tracking-wide mb-1">{g.label}</p>
              <div className="flex flex-wrap gap-1">
                {g.fields.map(f => (
                  <span key={f.name} className={`text-[11px] px-1.5 py-0.5 rounded border ${
                    f.source === 'gpt-auto'   ? 'bg-violet-500/8 border-violet-500/20 text-violet-300' :
                    f.source === 'gpt-suggest'? 'bg-amber-500/8 border-amber-500/20 text-amber-300'   :
                    f.source === 'deterministic' ? 'bg-sky-500/8 border-sky-500/20 text-sky-300'      :
                                                   'bg-muted/10 border-border/30 text-muted-foreground'
                  }`}>
                    {f.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-violet-500/40 inline-block" />auto-write (high confidence)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/40 inline-block" />suggestion (medium confidence)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-500/40 inline-block" />deterministic</span>
          </div>
        </div>
      </details>
    </div>
  );
}

// ── Stat tile ──────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, icon }: { label: string; value: number; sub: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/30 bg-muted/10 p-2.5 space-y-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

// ── Field coverage guide data ─────────────────────────────────────────────────

const FIELD_COVERAGE_GROUPS = [
  {
    label: 'Identity & Presence',
    fields: [
      { name: 'industry',          source: 'gpt-auto'      },
      { name: 'businessCategory',  source: 'gpt-auto'      },
      { name: 'locationContext',   source: 'gpt-auto'      },
      { name: 'websiteStatus',     source: 'deterministic' },
      { name: 'socialPresence',    source: 'deterministic' },
    ],
  },
  {
    label: 'Lead Strategic Intelligence',
    fields: [
      { name: 'dealSummary',       source: 'gpt-auto'      },
      { name: 'nextBestAction',    source: 'gpt-auto'      },
      { name: 'urgencyLevel',      source: 'gpt-auto'      },
      { name: 'stuckReason',       source: 'gpt-suggest'   },
      { name: 'conversionStrategy',source: 'gpt-auto'      },
    ],
  },
  {
    label: 'Client Strategic Intelligence',
    fields: [
      { name: 'aiSummary',         source: 'gpt-auto'      },
      { name: 'healthContext',     source: 'gpt-auto'      },
      { name: 'growthOpportunity', source: 'gpt-auto'      },
      { name: 'nextBestAction',    source: 'gpt-auto'      },
      { name: 'deliveryGaps',      source: 'gpt-suggest'   },
    ],
  },
  {
    label: 'Blocked (require external resources)',
    fields: [
      { name: 'seoBacklinks',      source: 'blocked' },
      { name: 'gbpPerformance',    source: 'blocked' },
      { name: 'rankTracking',      source: 'blocked' },
      { name: 'websiteAnalysis',   source: 'blocked' },
    ],
  },
];
