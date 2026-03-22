import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ClipboardCheck, Loader2, RefreshCw, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

interface PrepReadinessStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  startedAt?: string;
  completedAt?: string;
  processed?: number;
  skipped?: number;
  total?: number;
  errors?: number;
  errorDetail?: string;
}

export default function BullpenPrepReadiness() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<PrepReadinessStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const fetchStatus = async () => {
    if (!orgId) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/orgs/${orgId}/prep-readiness/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.status === 'running') {
          setRunning(true);
        } else {
          setRunning(false);
        }
      }
    } catch (err) {
      console.error('[PrepReadiness] status fetch error', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [orgId]);

  useEffect(() => {
    if (running) {
      const interval = setInterval(fetchStatus, 5000);
      return () => clearInterval(interval);
    }
  }, [running, orgId]);

  const handleRunNow = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/orgs/${orgId}/prep-readiness/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ force: false }),
      });
      if (res.ok) {
        toast({ title: 'Prep Readiness', description: 'Batch started — packs generating in background.' });
        setRunning(true);
        setTimeout(fetchStatus, 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Error', description: data.error || 'Failed to start prep readiness.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const isRunning = running || status?.status === 'running';
  const lastRun = status?.completedAt || status?.startedAt;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <ClipboardCheck className="h-4 w-4 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Prep Readiness</h3>
            <p className="text-xs text-muted-foreground">
              Auto-generates prep packs for active leads. Runs at 6am &amp; 2pm AEST.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isRunning ? (
            <Badge variant="secondary" className="gap-1 text-blue-600 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running…
            </Badge>
          ) : status?.status === 'done' ? (
            <Badge variant="secondary" className="gap-1 text-green-600 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-3 w-3" />
              Done
            </Badge>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={handleRunNow}
            disabled={loading || isRunning}
            data-testid="button-run-prep-readiness"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Run Now
          </Button>
        </div>
      </div>

      {/* ── Stat grid — 2-col so cells have enough width in the 360px rail ── */}
      {status && (
        <div className="grid grid-cols-2 gap-2.5">
          <StatBox
            label="Processed"
            value={status.processed ?? 0}
            icon={<CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
          />
          <StatBox
            label="Skipped"
            value={status.skipped ?? 0}
            icon={<Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
          />
          <StatBox
            label="Errors"
            value={status.errors ?? 0}
            icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
            alert={(status.errors ?? 0) > 0}
          />
          <StatBox
            label="Last Run"
            value={lastRun ? format(new Date(lastRun), 'dd/MM HH:mm') : 'Never'}
            icon={<Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            isText
          />
        </div>
      )}

      {/* ── Error detail (if server returned one) ── */}
      {status?.errorDetail && (
        <ErrorDetailBlock raw={status.errorDetail} />
      )}
    </div>
  );
}

// ── StatBox ──────────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  icon,
  alert = false,
  isText = false,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  alert?: boolean;
  isText?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 min-w-0 overflow-hidden ${
      alert ? 'border-red-200 dark:border-red-800/40 bg-red-50/30 dark:bg-red-950/10' : 'border-border/40 bg-muted/30'
    }`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-medium min-w-0 overflow-hidden">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      {isText ? (
        // Date / text values — smaller weight, allow wrap
        <span className="text-sm font-semibold tabular-nums leading-tight break-words overflow-hidden">
          {String(value)}
        </span>
      ) : (
        // Numeric values — large bold
        <span className="text-lg font-bold tabular-nums">{value}</span>
      )}
    </div>
  );
}

// ── Error detail block ────────────────────────────────────────────────────────

function ErrorDetailBlock({ raw }: { raw: string }) {
  const [expanded, setExpanded] = useState(false);

  // Produce a short human-readable summary of the raw error
  const summary = (() => {
    const lower = raw.toLowerCase();
    if (lower.includes('permission') || lower.includes('permission_denied')) return 'Permission denied — check Firestore rules';
    if (lower.includes('not found') || lower.includes('not_found'))           return 'Resource not found';
    if (lower.includes('unauthenticated'))                                     return 'Auth error — check token';
    if (lower.includes('quota') || lower.includes('resource_exhausted'))      return 'API quota exceeded';
    if (lower.includes('timeout') || lower.includes('deadline_exceeded'))     return 'Request timed out';
    const first = raw.split(/[.\n]/)[0].trim();
    return first.length > 100 ? first.slice(0, 97) + '…' : first;
  })();

  const hasMore = raw.length > summary.length + 5;

  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50/30 dark:bg-red-950/10 px-3 py-2.5 min-w-0 overflow-hidden">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-red-700 dark:text-red-400">Error detail</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{summary}</p>
          {hasMore && (
            <>
              <button
                className="text-[10px] text-red-400/70 hover:text-red-400 underline mt-0.5 flex items-center gap-0.5 transition-colors"
                onClick={() => setExpanded(v => !v)}
              >
                {expanded ? <><ChevronUp className="h-2.5 w-2.5" /> hide</> : <><ChevronDown className="h-2.5 w-2.5" /> full error</>}
              </button>
              {expanded && (
                <pre className="mt-1.5 text-[10px] text-muted-foreground/70 bg-muted/20 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-28">
                  {raw}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
