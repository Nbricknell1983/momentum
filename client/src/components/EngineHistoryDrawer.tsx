import { useState, useEffect } from 'react';
import { X, History, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { db, collection, getDocs } from '@/lib/firebase';
import { EngineType, isOutputStale } from '@/lib/engineOutputService';
import { format, formatDistanceToNow } from 'date-fns';

function fmtDate(d?: Date | string | null): string {
  if (!d) return '—';
  try { return format(new Date(d as string | Date), 'dd/MM/yyyy HH:mm'); } catch { return '—'; }
}

function fmtAge(d?: Date | string | null): string {
  if (!d) return '';
  try { return formatDistanceToNow(new Date(d as string | Date), { addSuffix: true }); } catch { return ''; }
}

function extractRunSummary(run: Record<string, any>): string | null {
  if (run.healthScore != null) return `${run.healthScore}/100${run.healthLabel ? ` · ${run.healthLabel}` : ''}`;
  if (run.visibilityScore != null) return `${run.visibilityScore}/100${run.visibilityLabel ? ` · ${run.visibilityLabel}` : ''}`;
  if (run.optimizationScore != null) return `${run.optimizationScore}/100${run.optimizationLabel ? ` · ${run.optimizationLabel}` : ''}`;
  if (run.readinessScore != null) return `${run.readinessScore}/100${run.readinessLabel ? ` · ${run.readinessLabel}` : ''}`;
  if (run.momentumStatus) return String(run.momentumStatus).replace(/_/g, ' ');
  if (run.urgencyLevel) {
    const stackLen = Array.isArray(run.recommendedStack) ? run.recommendedStack.length : 0;
    return `${stackLen} channel stack · ${run.urgencyLevel}`;
  }
  return null;
}

const ENGINE_LABELS: Record<EngineType, string> = {
  websiteEngine: 'Website Engine',
  seoEngine: 'SEO Engine',
  gbpEngine: 'GBP Engine',
  adsEngine: 'Ads Engine',
  learningInsight: 'Learning Insights',
  growthPrescription: 'Growth Prescription',
};

interface HistoryRun {
  runId: string;
  engineType?: string;
  generatedAt?: Date | string;
  modelUsed?: string;
  [key: string]: any;
}

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: string;
  entityCollection: 'clients' | 'leads';
  entityId: string;
  engineType: EngineType;
}

export function EngineHistoryDrawer({ open, onClose, orgId, entityCollection, entityId, engineType }: Props) {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orgId || !entityId) return;
    setLoading(true);
    setError(null);
    getDocs(collection(db, 'orgs', orgId, entityCollection, entityId, 'engineHistory'))
      .then(snapshot => {
        const docs: HistoryRun[] = snapshot.docs
          .map(d => ({ runId: d.id, ...d.data() } as HistoryRun))
          .filter(r => !r.engineType || r.engineType === engineType)
          .sort((a, b) => {
            const ta = a.generatedAt ? new Date(a.generatedAt as string | Date).getTime() : 0;
            const tb = b.generatedAt ? new Date(b.generatedAt as string | Date).getTime() : 0;
            return tb - ta;
          });
        setRuns(docs);
      })
      .catch(err => setError((err as Error).message || 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [open, orgId, entityCollection, entityId, engineType]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed right-0 top-0 h-full w-80 bg-background border-l shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Previous Runs</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="btn-close-history-drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 py-2 border-b bg-muted/20">
          <p className="text-xs text-muted-foreground">{ENGINE_LABELS[engineType]}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading history…
            </div>
          )}
          {error && (
            <div className="mx-4 mt-4 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
          {!loading && !error && runs.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-xs text-muted-foreground">
              <Clock className="h-8 w-8 opacity-30" />
              <p className="font-medium">No runs recorded yet</p>
              <p>Run the engine to start building history.</p>
            </div>
          )}
          {!loading && runs.length > 0 && (
            <div className="divide-y">
              {runs.map((run, i) => {
                const stale = isOutputStale(run.generatedAt as Date | string | undefined, engineType);
                const summary = extractRunSummary(run);
                return (
                  <div key={run.runId} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {i === 0 && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                          Latest
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        stale
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      }`}>
                        {stale ? 'Stale' : 'Fresh'}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-foreground">{fmtDate(run.generatedAt)}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtAge(run.generatedAt)}</p>
                    {summary && (
                      <p className="text-xs text-muted-foreground mt-1 capitalize">{summary}</p>
                    )}
                    {run.modelUsed && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{run.modelUsed}</p>
                    )}
                    <p className="text-[9px] text-muted-foreground/30 mt-1 font-mono truncate">{run.runId}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
