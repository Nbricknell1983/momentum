import { useState, useCallback, useEffect } from 'react';
import {
  Brain, RefreshCw, ChevronDown, ChevronUp, Loader2, AlertTriangle,
  TrendingUp, TrendingDown, Minus, CheckCircle2, XCircle, Zap, Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/contexts/AuthContext';
import { updateClient } from '@/store/index';
import { Client, LearningInsight, MomentumStatus, AIAction } from '@/lib/types';
import { updateClientInFirestore, fetchClientAIActions } from '@/lib/firestoreService';
import { generateRunId, enrichWithMeta, persistEngineHistory } from '@/lib/engineOutputService';
import { format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm'); } catch { return ''; }
}

const MOMENTUM_CONFIG: Record<MomentumStatus, { label: string; icon: typeof TrendingUp; color: string; bg: string }> = {
  'not-started': { label: 'Not Started', icon: Minus,       color: 'text-muted-foreground',              bg: 'bg-muted/30' },
  building:      { label: 'Building',    icon: TrendingUp,  color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-950/30' },
  strong:        { label: 'Strong',      icon: TrendingUp,  color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  stalled:       { label: 'Stalled',     icon: TrendingDown,color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30' },
};

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center py-2 rounded-lg border bg-muted/20">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Engine completeness check ────────────────────────────────────────────────

function EngineStatus({ client }: { client: Client }) {
  const engines = [
    { label: 'Website', done: !!client.websiteEngine },
    { label: 'SEO',     done: !!client.seoEngine },
    { label: 'GBP',     done: !!client.gbpEngine },
    { label: 'Ads',     done: !!client.adsEngine },
  ];
  return (
    <div className="flex items-center gap-3">
      {engines.map(e => (
        <div key={e.label} className="flex items-center gap-1 text-xs">
          {e.done
            ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            : <Minus className="h-3 w-3 text-muted-foreground/50" />}
          <span className={e.done ? 'text-foreground' : 'text-muted-foreground'}>{e.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { client: Client }

export default function LearningInsightsPanel({ client }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<AIAction[]>([]);
  const { toast } = useToast();
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();

  const insight = client.learningInsight;

  // Load AI action history for this client
  useEffect(() => {
    if (!orgId || !authReady) return;
    fetchClientAIActions(orgId, client.id, authReady, 50)
      .then(setActions)
      .catch(console.error);
  }, [orgId, authReady, client.id]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const approved = actions.filter(a => a.status === 'approved' || a.status === 'running').length;
      const rejected = actions.filter(a => a.status === 'rejected').length;
      const done = actions.filter(a => a.status === 'done').length;

      const engineSummary = {
        website: client.websiteEngine ? `Health: ${client.websiteEngine.healthScore}/100 (${client.websiteEngine.healthLabel})` : 'Not run',
        seo: client.seoEngine ? `Visibility: ${client.seoEngine.visibilityScore}/100` : 'Not run',
        gbp: client.gbpEngine ? `Optimization: ${client.gbpEngine.optimizationScore}/100 (${client.gbpEngine.optimizationLabel})` : 'Not run',
        ads: client.adsEngine ? `Readiness: ${client.adsEngine.readinessScore}/100 (${client.adsEngine.readinessLabel})` : 'Not run',
      };

      const appliedPlayNames = (client.appliedPlays || []).map(p => {
        const play = p.playId.replace(/-/g, ' ');
        return `${play} (${p.status})`;
      });

      const payload = {
        businessName: client.businessName,
        industry: client.businessProfile?.industry || '',
        automationMode: client.automationMode || 'assisted',
        totalActions: actions.length,
        approvedActions: approved,
        rejectedActions: rejected,
        completedActions: done,
        queuedActions: actions.filter(a => a.status === 'queued').length,
        recentActions: actions.slice(0, 10).map(a => `[${a.engine}] ${a.action} → ${a.status}`),
        engineSummary,
        intelligenceScore: client.intelligenceScore || null,
        appliedPlays: appliedPlayNames,
        channelStatus: client.channelStatus || {},
      };

      const res = await fetch('/api/ai/client/learning-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to generate learning insights');
      const data = await res.json();
      const runId = generateRunId();
      const newInsight: LearningInsight = enrichWithMeta(
        { ...data, approvedActions: approved, rejectedActions: rejected, completedActions: done },
        'learningInsight',
        runId
      ) as LearningInsight;
      const updates = { learningInsight: newInsight };
      if (orgId && authReady) {
        await updateClientInFirestore(orgId, client.id, updates).catch(console.error);
        await persistEngineHistory(orgId, 'clients', client.id, runId, { ...newInsight, clientId: client.id, orgId });
      }
      dispatch(updateClient({ id: client.id, updates }));
    } catch (err: any) {
      setError(err.message);
      toast({ title: 'Insight generation failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [client, actions, orgId, authReady, dispatch, toast]);

  const momentumCfg = insight ? MOMENTUM_CONFIG[insight.momentumStatus] : null;
  const MomentumIcon = momentumCfg?.icon;

  const enginesRun = [client.websiteEngine, client.seoEngine, client.gbpEngine, client.adsEngine].filter(Boolean).length;

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="card-learning-insights">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors"
        data-testid="toggle-learning-insights"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-pink-600 dark:text-pink-400" />
          <span className="text-sm font-semibold">Learning Insights</span>
          {insight && momentumCfg && MomentumIcon && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${momentumCfg.color} ${momentumCfg.bg}`}>
              <MomentumIcon className="inline h-3 w-3 mr-1" />
              {momentumCfg.label}
            </span>
          )}
          {!insight && (
            <span className="text-xs text-muted-foreground italic">{enginesRun}/4 engines run</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {insight && <span className="text-[10px] text-muted-foreground">{fmtDate(insight.generatedAt)}</span>}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <EngineStatus client={client} />
            </div>
            <Button
              variant="outline" size="sm" className="h-6 px-2 text-xs gap-1"
              onClick={handleGenerate} disabled={loading}
              data-testid="btn-generate-learning-insights"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {loading ? 'Analysing…' : insight ? 'Refresh' : 'Generate'}
            </Button>
          </div>

          {error && (
            <div className="mx-3 mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Analysing growth patterns…
            </div>
          )}

          {!loading && !insight && !error && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center px-4">
              <Brain className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No insights yet</p>
              <p className="text-xs text-muted-foreground">
                Generate to get an AI analysis of what's working, what's stalled, and the next best move for this client.
              </p>
              {enginesRun < 2 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Run at least 2 engine reports for richer analysis
                </p>
              )}
            </div>
          )}

          {!loading && insight && (
            <div className="p-3 space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <StatPill
                  label="Actions Done"
                  value={insight.completedActions}
                  color="text-emerald-600 dark:text-emerald-400"
                />
                <StatPill
                  label="Approved"
                  value={insight.approvedActions}
                  color="text-blue-600 dark:text-blue-400"
                />
                <StatPill
                  label="Rejected"
                  value={insight.rejectedActions}
                  color="text-red-500"
                />
              </div>

              {/* Overall assessment */}
              <div className="rounded-lg border p-3 space-y-1 bg-muted/20">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Overall Assessment</p>
                <p className="text-xs leading-relaxed">{insight.overallAssessment}</p>
              </div>

              {/* What's working / what's weak */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Top Channel</p>
                  </div>
                  <p className="text-xs font-medium">{insight.topPerformingChannel}</p>
                </div>
                <div className="rounded border p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Weakest Area</p>
                  </div>
                  <p className="text-xs font-medium">{insight.weakestArea}</p>
                </div>
              </div>

              {/* Next best move */}
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 p-3 space-y-1 bg-blue-50 dark:bg-blue-950/20">
                <div className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Next Best Move</p>
                </div>
                <p className="text-xs leading-relaxed text-blue-900 dark:text-blue-200">{insight.nextBestMove}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
