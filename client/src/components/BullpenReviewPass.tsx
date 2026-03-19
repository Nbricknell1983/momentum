import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2, Play, RefreshCw, ChevronDown, ChevronUp,
  ShieldCheck, Users, TrendingUp, AlertTriangle, CheckCircle2,
  ArrowRight, Clock,
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

interface ReviewResult {
  id: string;
  reviewType: ReviewType;
  runAt: string;
  summary: string;
  findings: ReviewFinding[];
  itemsCreated: number;
  itemsSkipped: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

const REVIEW_CONFIG: Record<ReviewType, {
  label: string;
  tagline: string;
  owner: string;
  icon: typeof ShieldCheck;
  accent: string;
  cardBorder: string;
  cardBg: string;
  iconBg: string;
  iconColor: string;
}> = {
  operations: {
    label: 'Daily Operations Review',
    tagline: 'Queue state, blockers, governance, system health',
    owner: 'Operations Manager',
    icon: ShieldCheck,
    accent: 'text-violet-700 dark:text-violet-400',
    cardBorder: 'border-violet-200 dark:border-violet-800',
    cardBg: 'bg-violet-50/50 dark:bg-violet-950/20',
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  client_health: {
    label: 'Client Health Review',
    tagline: 'Churn risk, engagement gaps, onboarding, expansion',
    owner: 'Client Growth Specialist',
    icon: Users,
    accent: 'text-emerald-700 dark:text-emerald-400',
    cardBorder: 'border-emerald-200 dark:border-emerald-800',
    cardBg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  pipeline: {
    label: 'Pipeline Review',
    tagline: 'Stuck leads, follow-up gaps, conversion risk',
    owner: 'Sales Specialist',
    icon: TrendingUp,
    accent: 'text-blue-700 dark:text-blue-400',
    cardBorder: 'border-blue-200 dark:border-blue-800',
    cardBg: 'bg-blue-50/50 dark:bg-blue-950/20',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
};

const PRIORITY_STYLES: Record<string, { dot: string; text: string }> = {
  high:   { dot: 'bg-red-500',    text: 'text-red-700 dark:text-red-400' },
  medium: { dot: 'bg-amber-500',  text: 'text-amber-700 dark:text-amber-400' },
  low:    { dot: 'bg-slate-400',  text: 'text-slate-500 dark:text-slate-400' },
};

// ── FindingCard ────────────────────────────────────────────────────────────────

function FindingCard({ finding, index }: { finding: ReviewFinding; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_STYLES[finding.priority] ?? PRIORITY_STYLES.medium;

  return (
    <div className="rounded-md border border-border bg-card">
      <button
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${priority.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">{finding.title}</p>
          {finding.clientName && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{finding.clientName}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2 ml-2">
          {finding.createWorkItem && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400 font-medium uppercase tracking-wide">
              work item
            </span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border/50 pt-2.5">
          <p className="text-sm text-foreground leading-relaxed">{finding.observation}</p>

          <div className="flex items-start gap-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900">
            <ArrowRight className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-500 mb-0.5">Recommended Action</p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">{finding.nextAction}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
              <span className="mr-1 opacity-60 text-[9px]">owner</span>
              {finding.owner}
            </span>
            {finding.supporting?.map(s => (
              <span key={s} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {s}
              </span>
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

  const highCount = latestResult?.findings.filter(f => f.priority === 'high').length ?? 0;
  const mediumCount = latestResult?.findings.filter(f => f.priority === 'medium').length ?? 0;

  return (
    <div className={`rounded-lg border ${latestResult ? cfg.cardBorder : 'border-border'} ${latestResult ? cfg.cardBg : 'bg-card'} overflow-hidden`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
            <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${cfg.accent}`}>{cfg.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{cfg.tagline}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Owner: {cfg.owner}</p>
          </div>
        </div>

        {/* Last run meta */}
        {latestResult && (
          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Last run {formatDistanceToNow(new Date(latestResult.runAt), { addSuffix: true })}</span>
            {latestResult.itemsCreated > 0 && (
              <span className="ml-auto text-violet-600 dark:text-violet-400 font-medium">
                +{latestResult.itemsCreated} work item{latestResult.itemsCreated !== 1 ? 's' : ''} created
              </span>
            )}
          </div>
        )}

        {/* Run button */}
        <Button
          size="sm"
          variant={latestResult ? 'outline' : 'default'}
          className={`mt-3 h-7 text-xs px-3 gap-1.5 w-full ${!latestResult ? 'bg-violet-600 hover:bg-violet-700 text-white border-violet-600' : ''}`}
          onClick={() => onRun(reviewType)}
          disabled={isRunning}
          data-testid={`button-run-review-${reviewType}`}
        >
          {isRunning ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running review…</>
          ) : latestResult ? (
            <><RefreshCw className="h-3.5 w-3.5" /> Re-run Review</>
          ) : (
            <><Play className="h-3.5 w-3.5" /> Run Review</>
          )}
        </Button>
      </div>

      {/* Summary + findings */}
      {latestResult && (
        <>
          <div className="border-t border-border/50 px-4 py-3">
            <p className="text-xs text-foreground leading-relaxed">{latestResult.summary}</p>

            {/* Finding counts */}
            {latestResult.findings.length > 0 && (
              <div className="flex items-center gap-3 mt-2.5">
                {highCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {highCount} high
                  </span>
                )}
                {mediumCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {mediumCount} medium
                  </span>
                )}
                <button
                  className="ml-auto text-[10px] underline underline-offset-2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowFindings(f => !f)}
                  data-testid={`button-toggle-findings-${reviewType}`}
                >
                  {showFindings ? 'Hide' : 'View'} {latestResult.findings.length} finding{latestResult.findings.length !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>

          {/* Findings list */}
          {showFindings && latestResult.findings.length > 0 && (
            <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-2">
              {latestResult.findings.map((f, i) => (
                <FindingCard key={i} finding={f} index={i} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Not yet run placeholder */}
      {!latestResult && !isRunning && (
        <div className="border-t border-border/50 px-4 py-3 text-center">
          <p className="text-[11px] text-muted-foreground">No review run yet. Click Run Review to generate specialist analysis.</p>
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

  const anyResult = Object.keys(merged).length > 0;
  const totalFindings = REVIEW_TYPES.reduce((n, t) => n + (merged[t]?.findings.length ?? 0), 0);
  const highFindings = REVIEW_TYPES.reduce((n, t) => n + (merged[t]?.findings.filter(f => f.priority === 'high').length ?? 0), 0);

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 text-violet-500" />
          Agent Review Passes
          {anyResult && totalFindings > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 text-[10px] font-bold">
              {totalFindings} finding{totalFindings !== 1 ? 's' : ''}
            </span>
          )}
          {highFindings > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 text-[10px] font-bold">
              {highFindings} high
            </span>
          )}
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-xs gap-1.5"
          onClick={() => {
            REVIEW_TYPES.forEach((t, i) => {
              setTimeout(() => handleRun(t), i * 200);
            });
          }}
          disabled={!!runningType}
          data-testid="button-run-all-reviews"
        >
          {runningType ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
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
