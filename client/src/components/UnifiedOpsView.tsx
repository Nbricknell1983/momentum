import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'wouter';
import { format } from 'date-fns';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronRight,
  Circle, Clock, ExternalLink, Filter, Info, RefreshCw, Shield, Sparkles,
  TrendingUp, Users, Zap, Globe, Database, Server, Eye
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { RootState } from '@/store';
import { deriveUnifiedOpsState } from '@/lib/unifiedOpsAdapter';
import type {
  UnifiedOpsState, CrossSystemEntityState, CrossSystemBottleneck,
  LifecycleStage, SystemHealth, LifecycleStageCount,
} from '@/lib/unifiedOpsTypes';
import {
  LIFECYCLE_STAGES, LIFECYCLE_STAGE_LABELS, LIFECYCLE_STAGE_SHORT, STAGE_SIDE,
} from '@/lib/unifiedOpsTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthColour(h: SystemHealth): string {
  if (h === 'healthy') return 'text-emerald-500';
  if (h === 'attention') return 'text-amber-500';
  if (h === 'blocked') return 'text-red-500';
  return 'text-muted-foreground';
}

function healthBg(h: SystemHealth): string {
  if (h === 'healthy') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
  if (h === 'attention') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
  if (h === 'blocked') return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
  return 'bg-muted text-muted-foreground border-border';
}

function impactBg(impact: 'critical' | 'high' | 'medium'): string {
  if (impact === 'critical') return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
  if (impact === 'high') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
  return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
}

function severityDot(severity: 'critical' | 'high' | 'medium'): string {
  if (severity === 'critical') return 'bg-red-500';
  if (severity === 'high') return 'bg-amber-500';
  return 'bg-blue-500';
}

function stageColour(stage: LifecycleStage, count: number): string {
  if (count === 0) return 'border-border bg-muted text-muted-foreground';
  const side = STAGE_SIDE[stage];
  if (side === 'momentum') return 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200';
  return 'border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200';
}

function systemBadge(source: 'momentum' | 'ai_systems'): React.ReactNode {
  if (source === 'momentum') {
    return <Badge variant="outline" className="text-[10px] py-0 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400">Momentum</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] py-0 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400">AI Systems</Badge>;
}

// ── Summary stat card ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${accent ?? 'border-border bg-card'}`}>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs font-medium text-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Lifecycle flow bar ────────────────────────────────────────────────────────

function LifecycleFlowBar({ stageCounts }: { stageCounts: LifecycleStageCount[] }) {
  const countByStage = Object.fromEntries(stageCounts.map(s => [s.stage, s]));

  return (
    <div className="space-y-2">
      {/* System labels */}
      <div className="flex items-center gap-0">
        <div className="flex items-center gap-1.5 flex-1">
          <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
          <span className="text-[11px] font-medium text-blue-700 dark:text-blue-400">Momentum</span>
          <div className="h-px flex-1 bg-blue-200 dark:bg-blue-800 mx-1" />
        </div>
        <div className="flex items-center gap-1.5 flex-1">
          <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
          <span className="text-[11px] font-medium text-violet-700 dark:text-violet-400">AI Systems</span>
          <div className="h-px flex-1 bg-violet-200 dark:bg-violet-800 mx-1" />
        </div>
      </div>
      {/* Stage blocks */}
      <div className="flex items-stretch gap-px overflow-x-auto pb-1">
        {LIFECYCLE_STAGES.map((stage, i) => {
          const sc = countByStage[stage] ?? { count: 0, stalledCount: 0 };
          return (
            <div key={stage} className="flex items-center flex-1 min-w-[80px]">
              <div className={`flex-1 rounded-lg border px-2 py-2.5 text-center ${stageColour(stage, sc.count)}`}>
                <div className="text-[11px] font-semibold mb-0.5">{sc.count}</div>
                <div className="text-[9px] leading-tight opacity-80">{LIFECYCLE_STAGE_SHORT[stage]}</div>
                {sc.stalledCount > 0 && (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-0.5 text-[8px] bg-red-500/20 text-red-600 dark:text-red-400 rounded px-1 py-0.5">
                      <AlertTriangle className="w-2 h-2" />
                      {sc.stalledCount}
                    </span>
                  </div>
                )}
              </div>
              {i < LIFECYCLE_STAGES.length - 1 && (
                <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0 mx-px" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bottleneck card ───────────────────────────────────────────────────────────

function BottleneckCard({ b }: { b: CrossSystemBottleneck }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-lg border p-4 space-y-2 ${b.impact === 'critical' ? 'border-red-200 dark:border-red-800/50' : b.impact === 'high' ? 'border-amber-200 dark:border-amber-800/50' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1">
          <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${b.impact === 'critical' ? 'text-red-500' : b.impact === 'high' ? 'text-amber-500' : 'text-blue-500'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{b.entityName}</span>
              <Badge variant="outline" className={`text-[10px] py-0 ${impactBg(b.impact)}`}>{b.impact}</Badge>
              <Badge variant="outline" className="text-[10px] py-0">{b.entityType}</Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">{b.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {b.stalledForDays !== undefined && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              <Clock className="w-3 h-3 inline mr-0.5 mb-px" />{b.stalledForDays}d stalled
            </span>
          )}
          <button onClick={() => setOpen(v => !v)} className="p-1 rounded hover:bg-muted">
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {/* Stage arrow */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-6">
        <span className="bg-muted px-1.5 py-0.5 rounded">{LIFECYCLE_STAGE_SHORT[b.fromStage]}</span>
        <ArrowRight className="w-3 h-3" />
        <span className="bg-muted px-1.5 py-0.5 rounded text-foreground font-medium">{LIFECYCLE_STAGE_SHORT[b.toStage]}</span>
        <span className="ml-1 opacity-60">blocked</span>
      </div>
      {open && (
        <div className="pl-6 pt-1 space-y-2">
          <p className="text-[11px] text-muted-foreground italic">Why: {b.why}</p>
          <div className="flex items-start gap-1.5 text-[11px]">
            <Zap className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
            <span><strong>Suggested fix:</strong> {b.suggestedFix}</span>
          </div>
          {b.drilldown && (
            <div>
              <Link href={b.drilldown.path}>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <ExternalLink className="w-3 h-3" />{b.drilldown.label}
                  {systemBadge(b.drilldown.source)}
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Entity row ────────────────────────────────────────────────────────────────

function EntityRow({ entity }: { entity: CrossSystemEntityState }) {
  const [open, setOpen] = useState(false);
  const health = entity.health.overall;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 text-left"
        data-testid={`entity-row-${entity.entityId}`}
      >
        {/* Type indicator */}
        <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${entity.entityType === 'client' ? 'bg-violet-500' : 'bg-blue-500'}`} />
        {/* Entity name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{entity.entityName}</span>
            <Badge variant="outline" className="text-[10px] py-0 capitalize">{entity.entityType}</Badge>
            {entity.isStalled && (
              <Badge variant="outline" className="text-[10px] py-0 bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Stalled
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{LIFECYCLE_STAGE_LABELS[entity.currentStage]}</div>
        </div>
        {/* Progress bar */}
        <div className="w-24 hidden sm:block">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${entity.entityType === 'client' ? 'bg-violet-500' : 'bg-blue-500'}`}
              style={{ width: `${entity.progressPct}%` }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground text-right mt-0.5">{entity.progressPct}%</div>
        </div>
        {/* Health */}
        <div className={`text-[11px] font-medium px-2 py-0.5 rounded border ${healthBg(health)} hidden sm:block`}>
          {health}
        </div>
        {/* Bottleneck count */}
        {entity.bottlenecks.length > 0 && (
          <span className="text-[11px] text-red-500 font-medium whitespace-nowrap hidden md:block">
            {entity.bottlenecks.length} issue{entity.bottlenecks.length !== 1 ? 's' : ''}
          </span>
        )}
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t bg-muted/30 px-4 py-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Momentum side */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />Momentum
              </div>
              <InfoRow label="Stage" value={entity.momentumSide.stage} />
              <InfoRow label="Strategy" value={entity.momentumSide.strategyStatus} />
              <InfoRow label="Proposal" value={entity.momentumSide.proposalStatus} />
              {entity.momentumSide.onboardingStatus && <InfoRow label="Onboarding" value={entity.momentumSide.onboardingStatus} />}
              {entity.momentumSide.provisioningStatus && <InfoRow label="Provisioning" value={entity.momentumSide.provisioningStatus} />}
              {entity.momentumSide.lastContact && <InfoRow label="Last contact" value={entity.momentumSide.lastContact} />}
              {entity.momentumSide.daysSinceContact !== undefined && (
                <InfoRow label="Days since contact" value={`${entity.momentumSide.daysSinceContact}d`} />
              )}
            </div>
            {/* AI Systems side */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-700 dark:text-violet-400">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />AI Systems
              </div>
              {entity.aiSystemsSide.tenantId && <InfoRow label="Tenant ID" value={entity.aiSystemsSide.tenantId} mono />}
              <InfoRow label="Delivery" value={entity.aiSystemsSide.deliveryStatus ?? 'n/a'} />
              <InfoRow label="Website" value={entity.aiSystemsSide.websiteStatus ?? 'n/a'} />
              <InfoRow label="Telemetry" value={entity.aiSystemsSide.telemetryStatus ?? 'n/a'} />
              <InfoRow label="Optimisation" value={entity.aiSystemsSide.optimisationStatus ?? 'n/a'} />
              <InfoRow label="Portal" value={entity.aiSystemsSide.portalStatus ?? 'n/a'} />
              {entity.aiSystemsSide.activeModules.length > 0 && (
                <div className="flex items-start gap-1.5">
                  <span className="text-[10px] text-muted-foreground w-24 flex-shrink-0">Modules</span>
                  <div className="flex flex-wrap gap-1">
                    {entity.aiSystemsSide.activeModules.map(m => (
                      <span key={m} className="text-[9px] bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              {entity.aiSystemsSide.dataQualityNote && (
                <p className="text-[10px] text-muted-foreground italic mt-1">{entity.aiSystemsSide.dataQualityNote}</p>
              )}
            </div>
          </div>

          {/* Bottlenecks */}
          {entity.bottlenecks.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-red-600 dark:text-red-400 mb-1">Cross-system issues</div>
              <div className="space-y-1.5">
                {entity.bottlenecks.map(b => (
                  <div key={b.id} className="flex items-start gap-2 text-[11px]">
                    <AlertTriangle className={`w-3 h-3 mt-0.5 flex-shrink-0 ${b.impact === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                    <span className="text-muted-foreground">{b.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Drilldowns */}
          <div className="flex flex-wrap gap-2 pt-1">
            {entity.drilldowns.slice(0, 4).map(d => (
              <Link key={d.label + d.path} href={d.entityId ? `${d.path}` : d.path}>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <ExternalLink className="w-3 h-3" />{d.label}
                  {systemBadge(d.source)}
                </Button>
              </Link>
            ))}
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
      <span className={`text-[11px] font-medium ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ── Inspect panel ─────────────────────────────────────────────────────────────

function InspectPanel({ ops }: { ops: UnifiedOpsState }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Source Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <InfoRow label="Generated at" value={ops.generatedAt} />
          <InfoRow label="Momentum leads" value={String(ops.sourceInfo.momentumLeadCount)} />
          <InfoRow label="Momentum clients" value={String(ops.sourceInfo.momentumClientCount)} />
          <InfoRow label="Total entities" value={String(ops.totalEntities)} />
          <InfoRow label="AI Systems quality" value={ops.sourceInfo.aiSystemsDataQuality} />
          <p className="text-[11px] text-muted-foreground italic pt-1">{ops.sourceInfo.aiSystemsNote}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Stage Distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {ops.stageCounts.map(sc => (
            <div key={sc.stage} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-32 flex-shrink-0">{LIFECYCLE_STAGE_LABELS[sc.stage]}</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${STAGE_SIDE[sc.stage] === 'momentum' ? 'bg-blue-500' : 'bg-violet-500'}`}
                  style={{ width: ops.totalEntities > 0 ? `${(sc.count / ops.totalEntities) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-[11px] font-medium w-6 text-right">{sc.count}</span>
              {sc.stalledCount > 0 && (
                <span className="text-[10px] text-red-500">({sc.stalledCount} stalled)</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Bottleneck Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {ops.bottlenecks.length === 0 && (
            <p className="text-[12px] text-muted-foreground">No bottlenecks detected.</p>
          )}
          {ops.bottlenecks.map(b => (
            <div key={b.id} className="text-[11px] flex items-start gap-2">
              <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${b.impact === 'critical' ? 'bg-red-500' : b.impact === 'high' ? 'bg-amber-500' : 'bg-blue-500'}`} />
              <span className="font-medium">{b.entityName}</span>
              <span className="text-muted-foreground">— {b.type}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function UnifiedOpsView() {
  const leads = useSelector((s: RootState) => s.app.leads);
  const clients = useSelector((s: RootState) => s.app.clients);
  const [refreshKey, setRefreshKey] = useState(0);
  const [filterImpact, setFilterImpact] = useState<'all' | 'critical' | 'high'>('all');
  const [entityFilter, setEntityFilter] = useState<'all' | 'stalled' | 'lead' | 'client'>('all');

  const ops: UnifiedOpsState = useMemo(
    () => deriveUnifiedOpsState(leads, clients),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, clients, refreshKey]
  );

  const filteredBottlenecks = useMemo(() => {
    if (filterImpact === 'all') return ops.bottlenecks;
    return ops.bottlenecks.filter(b => b.impact === filterImpact);
  }, [ops.bottlenecks, filterImpact]);

  const filteredEntities = useMemo(() => {
    return ops.entities.filter(e => {
      if (entityFilter === 'stalled') return e.isStalled;
      if (entityFilter === 'lead') return e.entityType === 'lead';
      if (entityFilter === 'client') return e.entityType === 'client';
      return true;
    });
  }, [ops.entities, entityFilter]);

  const activeClients = clients.filter(c => !c.archived && c.deliveryStatus === 'active').length;
  const optimisingCount = ops.stageCounts.find(s => s.stage === 'optimisation_active')?.count ?? 0;

  return (
    <div className="flex flex-col h-full overflow-auto bg-background">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b space-y-1 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Unified Operations</h1>
              <p className="text-xs text-muted-foreground">
                Cross-system view · Momentum + AI Systems · Generated {ops.generatedAt}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setRefreshKey(k => k + 1)}
            data-testid="button-refresh-ops"
          >
            <RefreshCw className="w-3 h-3" />Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <StatCard label="Total entities" value={ops.totalEntities} sub="leads + clients" />
          <StatCard
            label="Stalled"
            value={ops.stalledCount}
            sub="cross-system blocks"
            accent={ops.stalledCount > 0 ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20' : ''}
          />
          <StatCard
            label="Critical issues"
            value={ops.criticalBottlenecks}
            sub="need action now"
            accent={ops.criticalBottlenecks > 0 ? 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20' : ''}
          />
          <StatCard label="Active delivery" value={activeClients} sub="in AI Systems" />
          <StatCard label="Optimising" value={optimisingCount} sub="fully live + healthy" />
        </div>

        {/* Lifecycle flow */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                End-to-End Lifecycle Flow
              </CardTitle>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-xs">Blue stages are Momentum-side. Purple stages are AI Systems-side. Numbers show entity counts. Red badges indicate stalled entities.</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent>
            <LifecycleFlowBar stageCounts={ops.stageCounts} />
          </CardContent>
        </Card>

        {/* System alerts strip */}
        {ops.alerts.length > 0 && (
          <div className="space-y-2">
            {ops.alerts.slice(0, 5).map(a => (
              <div
                key={a.id}
                className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 ${a.severity === 'critical' ? 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20' : a.severity === 'high' ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20' : 'border-border'}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${severityDot(a.severity)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium">{a.entityName}</span>
                    <span className="text-sm text-muted-foreground">— {a.title}</span>
                    {systemBadge(a.sourceSystem === 'cross_system' ? 'momentum' : a.sourceSystem)}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{a.why}</p>
                </div>
                {a.drilldown && (
                  <Link href={a.drilldown.path}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                      <ExternalLink className="w-3 h-3" />{a.drilldown.label}
                    </Button>
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Main tabs */}
        <Tabs defaultValue="bottlenecks">
          <TabsList className="h-8 text-xs">
            <TabsTrigger value="bottlenecks" className="text-xs" data-testid="tab-bottlenecks">
              Bottlenecks
              {ops.bottlenecks.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {ops.bottlenecks.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="entities" className="text-xs" data-testid="tab-entities">Entities</TabsTrigger>
            <TabsTrigger value="milestones" className="text-xs" data-testid="tab-milestones">Milestones</TabsTrigger>
            <TabsTrigger value="inspect" className="text-xs" data-testid="tab-inspect">Inspect</TabsTrigger>
          </TabsList>

          {/* Bottlenecks tab */}
          <TabsContent value="bottlenecks" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {filteredBottlenecks.length} handoff {filteredBottlenecks.length !== 1 ? 'blocks' : 'block'} detected across both systems.
              </p>
              <div className="flex items-center gap-1.5">
                <Filter className="w-3 h-3 text-muted-foreground" />
                {(['all', 'critical', 'high'] as const).map(f => (
                  <Button
                    key={f}
                    variant={filterImpact === f ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setFilterImpact(f)}
                    data-testid={`filter-impact-${f}`}
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </div>
            {filteredBottlenecks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                <p className="text-sm font-medium">No handoff blocks detected</p>
                <p className="text-xs text-muted-foreground mt-1">All active entities are progressing through the lifecycle without cross-system stalls.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredBottlenecks.map(b => <BottleneckCard key={b.id} b={b} />)}
              </div>
            )}
          </TabsContent>

          {/* Entities tab */}
          <TabsContent value="entities" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {filteredEntities.length} entit{filteredEntities.length !== 1 ? 'ies' : 'y'} in view.
              </p>
              <div className="flex items-center gap-1.5">
                {(['all', 'stalled', 'lead', 'client'] as const).map(f => (
                  <Button
                    key={f}
                    variant={entityFilter === f ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-[10px] px-2 capitalize"
                    onClick={() => setEntityFilter(f)}
                    data-testid={`filter-entity-${f}`}
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </div>
            {filteredEntities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">No entities in this filter</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different filter.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEntities.map(e => <EntityRow key={e.entityId} entity={e} />)}
              </div>
            )}
          </TabsContent>

          {/* Milestones tab */}
          <TabsContent value="milestones" className="mt-4">
            {ops.recentMilestones.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <TrendingUp className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium">No milestones recorded yet</p>
                <p className="text-xs text-muted-foreground mt-1">Milestones appear here as entities progress through the lifecycle.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ops.recentMilestones.map(m => (
                  <div key={m.id} className="flex items-start gap-3 rounded-lg border px-3.5 py-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{m.entityName}</span>
                        <span className="text-sm text-muted-foreground">— {m.milestone}</span>
                        {systemBadge(m.sourceSystem)}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {m.achievedAt} · {LIFECYCLE_STAGE_LABELS[m.stage]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Inspect tab */}
          <TabsContent value="inspect" className="mt-4">
            <InspectPanel ops={ops} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
