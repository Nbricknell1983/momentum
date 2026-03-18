import { useState, useCallback, useMemo } from 'react';
import {
  Zap, ChevronDown, ChevronUp, Loader2, TrendingDown, BookOpen,
  AlertTriangle, CheckCircle2, Users, RefreshCw, Bot, Target,
  BarChart3, ArrowRight, Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Client, MomentumStatus } from '@/lib/types';
import { format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yyyy'); } catch { return ''; }
}

const MOMENTUM_COLORS: Record<MomentumStatus, string> = {
  'not-started': 'text-muted-foreground',
  building: 'text-blue-600 dark:text-blue-400',
  strong: 'text-emerald-600 dark:text-emerald-400',
  stalled: 'text-amber-600 dark:text-amber-400',
};

const MOMENTUM_LABELS: Record<MomentumStatus, string> = {
  'not-started': 'Not Started',
  building: 'Building',
  strong: 'Strong',
  stalled: 'Stalled',
};

function MetricPill({
  label, value, sub, color,
}: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-2.5 px-3 rounded-lg border bg-muted/20 min-w-[70px]">
      <span className={`text-xl font-bold ${color || 'text-foreground'}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight mt-0.5">{label}</span>
      {sub && <span className="text-[9px] text-muted-foreground/70">{sub}</span>}
    </div>
  );
}

function ClientAttentionRow({ client }: { client: Client }) {
  const ms = client.learningInsight?.momentumStatus;
  const activePlayCount = (client.appliedPlays || []).filter(p => p.status === 'active').length;
  const enginesRun = [client.websiteEngine, client.seoEngine, client.gbpEngine, client.adsEngine].filter(Boolean).length;

  return (
    <div className="flex items-center gap-2 py-2 border-b last:border-0">
      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-semibold">
        {client.businessName?.charAt(0) || '?'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{client.businessName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {ms ? (
            <span className={`text-[10px] ${MOMENTUM_COLORS[ms]}`}>{MOMENTUM_LABELS[ms]}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">No insight yet</span>
          )}
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground">{enginesRun}/4 engines</span>
          {activePlayCount > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{activePlayCount} {activePlayCount === 1 ? 'play' : 'plays'}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {client.automationMode === 'autonomous' && (
          <Badge variant="outline" className="text-[9px] h-4 px-1 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700">
            Auto
          </Badge>
        )}
        {client.healthStatus === 'red' && (
          <AlertTriangle className="h-3 w-3 text-red-500" />
        )}
        {client.healthStatus === 'amber' && (
          <AlertTriangle className="h-3 w-3 text-amber-500" />
        )}
      </div>
    </div>
  );
}

// ─── Priority Item ────────────────────────────────────────────────────────────

function PriorityItem({ item, idx }: { item: string; idx: number }) {
  return (
    <div className="flex items-start gap-2.5 text-xs">
      <span className="mt-0.5 h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0">
        {idx + 1}
      </span>
      <span className="leading-relaxed">{item}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface GrowthBriefData {
  todaysPriorities: string[];
  portfolioSummary: string;
  urgentClients: string[];
  generatedAt: string;
}

interface Props {
  clients: Client[];
}

export default function GrowthOperatorDailyBrief({ clients }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<GrowthBriefData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // ─── Portfolio metrics ─────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const activeClients = clients.filter(c => !c.archived);
    const withAnyEngine = activeClients.filter(c => c.websiteEngine || c.seoEngine || c.gbpEngine || c.adsEngine);
    const activePlays = activeClients.reduce((sum, c) => sum + (c.appliedPlays || []).filter(p => p.status === 'active').length, 0);
    const autonomousClients = activeClients.filter(c => c.automationMode === 'autonomous');
    const stalledClients = activeClients.filter(c => c.learningInsight?.momentumStatus === 'stalled');
    const strongClients = activeClients.filter(c => c.learningInsight?.momentumStatus === 'strong');
    const notStarted = activeClients.filter(c => !c.learningInsight || c.learningInsight.momentumStatus === 'not-started');

    // Clients needing growth operator attention: stalled + health issues + no active plays
    const needsAttention = activeClients
      .filter(c =>
        c.learningInsight?.momentumStatus === 'stalled' ||
        c.healthStatus === 'red' ||
        (withAnyEngine.includes(c) && (c.appliedPlays || []).filter(p => p.status === 'active').length === 0 && !c.learningInsight)
      )
      .slice(0, 5);

    return {
      total: activeClients.length,
      withEngines: withAnyEngine.length,
      activePlays,
      autonomousCount: autonomousClients.length,
      stalledCount: stalledClients.length,
      strongCount: strongClients.length,
      notStartedCount: notStarted.length,
      needsAttention,
    };
  }, [clients]);

  const handleGenerateBrief = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const activeClients = clients.filter(c => !c.archived);

      const payload = {
        totalClients: activeClients.length,
        clientsWithEngines: metrics.withEngines,
        activePlays: metrics.activePlays,
        stalledClients: metrics.stalledCount,
        strongClients: metrics.strongCount,
        autonomousClients: metrics.autonomousCount,
        needsAttentionClients: metrics.needsAttention.map(c => ({
          name: c.businessName,
          momentum: c.learningInsight?.momentumStatus || 'not-started',
          health: c.healthStatus || 'green',
          automationMode: c.automationMode || 'assisted',
          enginesRun: [c.websiteEngine, c.seoEngine, c.gbpEngine, c.adsEngine].filter(Boolean).length,
          activePlays: (c.appliedPlays || []).filter(p => p.status === 'active').length,
          nextBestMove: c.learningInsight?.nextBestMove || null,
        })),
        portfolioHighlights: activeClients
          .filter(c => c.learningInsight?.momentumStatus === 'strong')
          .slice(0, 3)
          .map(c => `${c.businessName}: ${c.learningInsight?.topPerformingChannel || 'strong'}`),
        date: format(new Date(), 'EEEE, dd MMMM yyyy'),
      };

      const res = await fetch('/api/ai/growth-operator/daily-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to generate brief');
      const data: GrowthBriefData = await res.json();
      setBrief({ ...data, generatedAt: new Date().toISOString() });
    } catch (err: any) {
      setError(err.message);
      toast({ title: 'Brief generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [clients, metrics, toast]);

  const hasData = metrics.total > 0;

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="card-growth-operator-brief">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        data-testid="toggle-growth-operator-brief"
      >
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold">AI Growth Operator Briefing</span>
          {metrics.stalledCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
              {metrics.stalledCount} stalled
            </span>
          )}
          {metrics.autonomousCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400">
              {metrics.autonomousCount} autopilot
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {brief?.generatedAt && (
            <span className="text-[10px] text-muted-foreground">{fmtDate(brief.generatedAt)}</span>
          )}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t">
          {/* Portfolio metrics row */}
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/10 overflow-x-auto">
            <MetricPill label="Clients" value={metrics.total} />
            <MetricPill label="Engines Run" value={metrics.withEngines} color="text-blue-600 dark:text-blue-400" />
            <MetricPill label="Active Plays" value={metrics.activePlays} color="text-emerald-600 dark:text-emerald-400" />
            <MetricPill label="Strong" value={metrics.strongCount} color="text-emerald-600 dark:text-emerald-400" />
            <MetricPill label="Stalled" value={metrics.stalledCount} color="text-amber-600 dark:text-amber-400" />
            <MetricPill label="Autopilot" value={metrics.autonomousCount} color="text-purple-600 dark:text-purple-400" />

            <div className="ml-auto shrink-0">
              <Button
                size="sm" variant="outline" className="h-7 px-3 text-xs gap-1.5"
                onClick={handleGenerateBrief} disabled={loading || !hasData}
                data-testid="btn-generate-growth-brief"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {loading ? 'Generating…' : brief ? 'Refresh' : 'Generate Brief'}
              </Button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Clients needing attention */}
            {metrics.needsAttention.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  Needs Growth Attention ({metrics.needsAttention.length})
                </p>
                <div className="rounded-lg border overflow-hidden">
                  {metrics.needsAttention.map(c => (
                    <ClientAttentionRow key={c.id} client={c} />
                  ))}
                </div>
              </div>
            )}

            {/* No data yet */}
            {!hasData && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No clients in the portfolio yet</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded p-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />Analysing portfolio…
              </div>
            )}

            {/* Brief results */}
            {!loading && brief && (
              <>
                {/* Portfolio summary */}
                {brief.portfolioSummary && (
                  <div className="rounded-lg border p-3 bg-indigo-50/50 dark:bg-indigo-950/20">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-400 mb-1">Portfolio Summary</p>
                    <p className="text-xs leading-relaxed text-indigo-900 dark:text-indigo-200">{brief.portfolioSummary}</p>
                  </div>
                )}

                {/* Today's priorities */}
                {brief.todaysPriorities?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Target className="h-3 w-3 text-indigo-500" />
                      Today's Growth Priorities
                    </p>
                    <div className="space-y-2">
                      {brief.todaysPriorities.map((item, i) => (
                        <PriorityItem key={i} item={item} idx={i} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Urgent clients from AI */}
                {brief.urgentClients?.length > 0 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 p-3 bg-amber-50/50 dark:bg-amber-950/20">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2">
                      Flagged by AI
                    </p>
                    <ul className="space-y-1">
                      {brief.urgentClients.map((c, i) => (
                        <li key={i} className="text-xs flex items-start gap-1.5 text-amber-900 dark:text-amber-200">
                          <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Empty prompt */}
            {!loading && !brief && hasData && (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                <Bot className="h-7 w-7 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  Generate to get AI-prioritised growth operator tasks for today across your full client portfolio.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
