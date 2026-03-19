import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow, format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Loader2, RefreshCw, ChevronDown, ChevronUp,
  ShieldCheck, Users, TrendingUp, AlertTriangle, CheckCircle2,
  ArrowRight, Clock, Eye, Briefcase, Zap, AlertCircle, Activity,
  Package, Ban, Timer,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReviewType = 'operations' | 'client_health' | 'pipeline';

interface ReviewFinding {
  title: string;
  observation: string;
  priority: 'high' | 'medium' | 'low';
  owner: string;
  supporting: string[];
  nextAction: string;
  createWorkItem: boolean;
  sourceSignal: string;
  clientId?: string;
  clientName?: string;
}

interface ReviewScope {
  workItemsReviewed?: number;
  openItems?: number;
  blocked?: number;
  awaitingReview?: number;
  escalated?: number;
  ocStatus?: string;
  gbpStatus?: string;
  clientsReviewed?: number;
  atRisk?: number;
  noRecentContact?: number;
  leadsReviewed?: number;
  stalled?: number;
  overdueFollowUps?: number;
}

interface ReviewResult {
  id: string;
  reviewType: ReviewType;
  runAt: string;
  summary: string;
  findings: ReviewFinding[];
  itemsCreated: number;
  itemsSkipped: number;
  scope?: ReviewScope | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

const REVIEW_CONFIG: Record<ReviewType, {
  label: string;
  tagline: string;
  owner: string;
  icon: typeof ShieldCheck;
  dot: string;
  border: string;
  headerBg: string;
  sectionBg: string;
  accentText: string;
  accentBg: string;
  iconBg: string;
  iconColor: string;
}> = {
  operations: {
    label: 'Operations Review',
    tagline: 'Queue state · blockers · governance · system health',
    owner: 'Operations Manager',
    icon: ShieldCheck,
    dot: 'bg-violet-500',
    border: 'border-violet-200 dark:border-violet-800',
    headerBg: 'bg-violet-50 dark:bg-violet-950/30',
    sectionBg: 'bg-violet-50/40 dark:bg-violet-950/10',
    accentText: 'text-violet-700 dark:text-violet-300',
    accentBg: 'bg-violet-100 dark:bg-violet-900/40',
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  client_health: {
    label: 'Client Health Review',
    tagline: 'Churn risk · engagement gaps · onboarding · expansion',
    owner: 'Client Growth Specialist',
    icon: Users,
    dot: 'bg-emerald-500',
    border: 'border-emerald-200 dark:border-emerald-800',
    headerBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    sectionBg: 'bg-emerald-50/40 dark:bg-emerald-950/10',
    accentText: 'text-emerald-700 dark:text-emerald-300',
    accentBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  pipeline: {
    label: 'Pipeline Review',
    tagline: 'Stuck leads · follow-up gaps · conversion risk',
    owner: 'Sales Specialist',
    icon: TrendingUp,
    dot: 'bg-blue-500',
    border: 'border-blue-200 dark:border-blue-800',
    headerBg: 'bg-blue-50 dark:bg-blue-950/30',
    sectionBg: 'bg-blue-50/40 dark:bg-blue-950/10',
    accentText: 'text-blue-700 dark:text-blue-300',
    accentBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
};

// ── Scope description builders ────────────────────────────────────────────────

function buildScopeLabel(type: ReviewType, scope?: ReviewScope | null, findings?: ReviewFinding[]): string {
  if (!scope) {
    const count = findings?.length ?? 0;
    if (count > 0) return `${count} finding${count !== 1 ? 's' : ''} from last review`;
    return 'Review completed';
  }
  if (type === 'operations') {
    const parts: string[] = [];
    if (scope.workItemsReviewed != null) parts.push(`${scope.workItemsReviewed} work items`);
    if (scope.blocked) parts.push(`${scope.blocked} blocked`);
    if (scope.escalated) parts.push(`${scope.escalated} escalated`);
    if (scope.awaitingReview) parts.push(`${scope.awaitingReview} awaiting review`);
    return parts.join(' · ') || 'Work queue reviewed';
  }
  if (type === 'client_health') {
    const parts: string[] = [];
    if (scope.clientsReviewed != null) parts.push(`${scope.clientsReviewed} clients`);
    if (scope.atRisk) parts.push(`${scope.atRisk} at risk`);
    if (scope.noRecentContact) parts.push(`${scope.noRecentContact} no recent contact`);
    return parts.join(' · ') || 'Client portfolio reviewed';
  }
  if (type === 'pipeline') {
    const parts: string[] = [];
    if (scope.leadsReviewed != null) parts.push(`${scope.leadsReviewed} leads`);
    if (scope.stalled) parts.push(`${scope.stalled} stalled`);
    if (scope.overdueFollowUps) parts.push(`${scope.overdueFollowUps} overdue follow-ups`);
    return parts.join(' · ') || 'Pipeline reviewed';
  }
  return 'Review completed';
}

// ── FindingCard ────────────────────────────────────────────────────────────────

function FindingCard({ finding, index }: { finding: ReviewFinding; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const dotColor = finding.priority === 'high' ? 'bg-red-500' : finding.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-400';
  const textColor = finding.priority === 'high' ? 'text-red-700 dark:text-red-400' : finding.priority === 'medium' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500';

  return (
    <div className="rounded border border-border bg-background">
      <button
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground leading-snug">{finding.title}</p>
          {finding.clientName && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{finding.clientName}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5 ml-2">
          <span className={`text-[9px] font-bold uppercase ${textColor}`}>{finding.priority}</span>
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2.5">
          <p className="text-xs text-muted-foreground leading-relaxed">{finding.observation}</p>
          <div className="flex items-start gap-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900">
            <ArrowRight className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-600 mb-0.5">Recommended Action</p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">{finding.nextAction}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
              {finding.owner}
            </span>
            {finding.supporting?.map(s => (
              <span key={s} className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-muted text-muted-foreground">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ReviewCard ────────────────────────────────────────────────────────────────

function ReviewCard({
  reviewType,
  latestResult,
  onRun,
  isRunning,
}: {
  reviewType: ReviewType;
  latestResult?: ReviewResult;
  onRun: (type: ReviewType) => void;
  isRunning: boolean;
}) {
  const [showFindings, setShowFindings] = useState(false);
  const cfg = REVIEW_CONFIG[reviewType];
  const Icon = cfg.icon;

  const findings = latestResult?.findings ?? [];
  const highFindings = findings.filter(f => f.priority === 'high');
  const mediumFindings = findings.filter(f => f.priority === 'medium');
  const topFinding = highFindings[0] ?? mediumFindings[0] ?? null;
  const runAt = latestResult ? new Date(latestResult.runAt) : null;

  return (
    <div className={`rounded-xl border overflow-hidden ${latestResult ? cfg.border : 'border-border'}`}>

      {/* ── Header ── */}
      <div className={`px-4 py-3 flex items-center gap-3 ${latestResult ? cfg.headerBg : 'bg-muted/30'}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
          <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-bold ${latestResult ? cfg.accentText : 'text-foreground'}`}>{cfg.label}</p>
            {latestResult ? (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${cfg.dot}`} />
                {formatDistanceToNow(runAt!, { addSuffix: true })}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                Not yet run
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{cfg.tagline}</p>
        </div>
        <button
          onClick={() => onRun(reviewType)}
          disabled={isRunning}
          className={`h-7 w-7 flex items-center justify-center rounded-md border transition-colors ${
            isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50'
          } bg-background border-border text-muted-foreground hover:text-foreground`}
          title="Re-run review"
          data-testid={`button-run-review-${reviewType}`}
        >
          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* ── Never-run state ── */}
      {!latestResult && !isRunning && (
        <div className="px-4 py-5 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This review runs automatically as part of the Daily Brief cadence. Once run, it will show what {cfg.owner} reviewed, what was found, what work was created, and what needs attention.
          </p>
          <Button
            size="sm"
            onClick={() => onRun(reviewType)}
            className={`h-7 text-xs px-3 gap-1.5`}
            data-testid={`button-run-review-${reviewType}-empty`}
          >
            <Activity className="h-3.5 w-3.5" /> Run Now
          </Button>
        </div>
      )}

      {isRunning && !latestResult && (
        <div className="px-4 py-5 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Running review — analysing {reviewType === 'operations' ? 'work queue and system state' : reviewType === 'client_health' ? 'client portfolio' : 'active pipeline'}…
        </div>
      )}

      {/* ── Active result ── */}
      {latestResult && (
        <div className="divide-y divide-border/50">

          {/* Reviewed */}
          <div className={`px-4 py-2.5 flex items-center gap-2 ${cfg.sectionBg}`}>
            <Eye className={`h-3.5 w-3.5 shrink-0 ${cfg.iconColor}`} />
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mr-1">Reviewed</span>
            <span className="text-xs font-medium">{buildScopeLabel(reviewType, latestResult.scope, findings)}</span>
          </div>

          {/* Found */}
          <div className="px-4 py-2.5 flex items-center gap-3">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mr-1">Found</span>
            {highFindings.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {highFindings.length} high-priority
              </span>
            )}
            {mediumFindings.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {mediumFindings.length} medium
              </span>
            )}
            {findings.length === 0 && (
              <span className="text-xs text-muted-foreground">No findings — all clear</span>
            )}
          </div>

          {/* Summary */}
          {latestResult.summary && (
            <div className="px-4 py-3">
              <p className="text-xs text-foreground leading-relaxed">{latestResult.summary}</p>
            </div>
          )}

          {/* Created / Waiting */}
          {(latestResult.itemsCreated > 0 || latestResult.itemsSkipped > 0) && (
            <div className="px-4 py-2.5 flex items-center gap-4">
              {latestResult.itemsCreated > 0 && (
                <div className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Created</span>
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${cfg.accentBg} ${cfg.accentText}`}>
                    {latestResult.itemsCreated} work item{latestResult.itemsCreated !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {latestResult.itemsSkipped > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {latestResult.itemsSkipped} duplicate{latestResult.itemsSkipped !== 1 ? 's' : ''} skipped
                </span>
              )}
            </div>
          )}

          {/* Top recommended action */}
          {topFinding && (
            <div className="px-4 py-3 flex items-start gap-2 bg-amber-50/60 dark:bg-amber-950/20">
              <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 mr-2">Next</span>
                <span className="text-xs text-foreground font-medium">{topFinding.nextAction || topFinding.title}</span>
                {topFinding.clientName && (
                  <span className="text-[10px] text-muted-foreground ml-1">— {topFinding.clientName}</span>
                )}
              </div>
            </div>
          )}

          {/* Findings expander */}
          {findings.length > 0 && (
            <>
              <button
                className="w-full px-4 py-2 flex items-center gap-2 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setShowFindings(f => !f)}
                data-testid={`button-toggle-findings-${reviewType}`}
              >
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showFindings ? 'rotate-180' : ''}`} />
                <span className="text-[10px] text-muted-foreground font-medium">
                  {showFindings ? 'Hide' : 'View'} all {findings.length} finding{findings.length !== 1 ? 's' : ''}
                </span>
                {runAt && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {format(runAt, 'dd/MM/yyyy HH:mm')}
                  </span>
                )}
              </button>
              {showFindings && (
                <div className="px-4 pb-4 pt-2 space-y-1.5">
                  {findings.map((f, i) => (
                    <FindingCard key={i} finding={f} index={i} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BullpenReviewPass() {
  const { orgId } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [runningType, setRunningType] = useState<ReviewType | null>(null);
  const [localResults, setLocalResults] = useState<Partial<Record<ReviewType, ReviewResult>>>({});

  const { data: passesData } = useQuery<{ reviews: Record<ReviewType, ReviewResult> }>({
    queryKey: ['/api/bullpen/review-passes', orgId],
    queryFn: async () => {
      const r = await apiRequest('GET', `/api/bullpen/review-passes?orgId=${orgId}`);
      return r.json();
    },
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const runMutation = useMutation({
    mutationFn: async (reviewType: ReviewType) => {
      const r = await apiRequest('POST', '/api/bullpen/review-pass', { orgId, reviewType });
      return r.json() as Promise<ReviewResult>;
    },
    onSuccess: (result) => {
      setLocalResults(prev => ({ ...prev, [result.reviewType]: result }));
      qc.invalidateQueries({ queryKey: ['/api/bullpen/review-passes', orgId] });
      qc.invalidateQueries({ queryKey: ['/api/bullpen/work-items', orgId] });
      setRunningType(null);
      const hiCount = result.findings.filter(f => f.priority === 'high').length;
      toast({
        title: `${REVIEW_CONFIG[result.reviewType].label} complete`,
        description: `${result.findings.length} finding${result.findings.length !== 1 ? 's' : ''} · ${result.itemsCreated} work item${result.itemsCreated !== 1 ? 's' : ''} created${hiCount > 0 ? ` · ${hiCount} high priority` : ''}`,
      });
    },
    onError: (e: Error) => {
      toast({ title: 'Review failed', description: e.message, variant: 'destructive' });
      setRunningType(null);
    },
  });

  function handleRun(reviewType: ReviewType) {
    setRunningType(reviewType);
    runMutation.mutate(reviewType);
  }

  const serverReviews = passesData?.reviews ?? {};
  const merged: Partial<Record<ReviewType, ReviewResult>> = { ...serverReviews, ...localResults };

  const REVIEW_TYPES: ReviewType[] = ['operations', 'client_health', 'pipeline'];

  const totalFindings = REVIEW_TYPES.reduce((n, t) => n + (merged[t]?.findings.length ?? 0), 0);
  const highFindings  = REVIEW_TYPES.reduce((n, t) => n + (merged[t]?.findings.filter(f => f.priority === 'high').length ?? 0), 0);
  const totalCreated  = REVIEW_TYPES.reduce((n, t) => n + (merged[t]?.itemsCreated ?? 0), 0);
  const anyResult     = REVIEW_TYPES.some(t => !!merged[t]);

  const mostRecent = REVIEW_TYPES
    .filter(t => !!merged[t])
    .sort((a, b) => new Date(merged[b]!.runAt).getTime() - new Date(merged[a]!.runAt).getTime())[0];

  return (
    <div>
      {/* ── Section header ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-violet-500" />
            Workforce Reviews
          </h2>
          {anyResult && (
            <div className="flex items-center gap-2">
              {totalFindings > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold">
                  {totalFindings} finding{totalFindings !== 1 ? 's' : ''}
                </span>
              )}
              {highFindings > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 text-[10px] font-bold">
                  {highFindings} high
                </span>
              )}
              {totalCreated > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] font-bold">
                  +{totalCreated} work items
                </span>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs gap-1.5"
          onClick={() => {
            REVIEW_TYPES.forEach((t, i) => setTimeout(() => handleRun(t), i * 300));
          }}
          disabled={!!runningType}
          data-testid="button-run-all-reviews"
        >
          {runningType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {runningType ? 'Running…' : 'Run All'}
        </Button>
      </div>

      <div className="space-y-3">
        {REVIEW_TYPES.map(type => (
          <ReviewCard
            key={type}
            reviewType={type}
            latestResult={merged[type]}
            onRun={handleRun}
            isRunning={runningType === type}
          />
        ))}
      </div>
    </div>
  );
}
