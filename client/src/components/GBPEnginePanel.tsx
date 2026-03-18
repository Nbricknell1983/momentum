import { useState, useCallback } from 'react';
import {
  Star, RefreshCw, Copy, Check, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, Zap, User, Camera, MessageSquare,
  Search as SearchIcon, HelpCircle, CheckCircle2, Clock, TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/contexts/AuthContext';
import { updateClient } from '@/store/index';
import {
  Client, GBPEngineReport, GBPTask, GBPTaskCategory, GradeValue,
} from '@/lib/types';
import { updateClientInFirestore } from '@/lib/firestoreService';
import { format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm'); } catch { return ''; }
}

const OPT_CONFIG: Record<GBPEngineReport['optimizationLabel'], { label: string; color: string; bg: string }> = {
  critical:     { label: 'Critical',    color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-950/30' },
  'needs-work': { label: 'Needs Work',  color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-950/30' },
  good:         { label: 'Good',        color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-950/30' },
  strong:       { label: 'Strong',      color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
};

const GRADE_COLOR: Record<GradeValue, string> = {
  A: 'text-emerald-600 dark:text-emerald-400',
  B: 'text-blue-600 dark:text-blue-400',
  C: 'text-amber-600 dark:text-amber-400',
  D: 'text-orange-600 dark:text-orange-400',
  F: 'text-red-600 dark:text-red-400',
};

const CAT_CONFIG: Record<GBPTaskCategory, { label: string; icon: typeof Star; color: string }> = {
  profile:    { label: 'Profile',    icon: User,          color: 'text-violet-600 dark:text-violet-400' },
  reviews:    { label: 'Reviews',    icon: Star,          color: 'text-amber-600 dark:text-amber-400' },
  posts:      { label: 'Posts',      icon: MessageSquare, color: 'text-blue-600 dark:text-blue-400' },
  photos:     { label: 'Photos',     icon: Camera,        color: 'text-emerald-600 dark:text-emerald-400' },
  'local-seo':{ label: 'Local SEO', icon: SearchIcon,    color: 'text-pink-600 dark:text-pink-400' },
  qa:         { label: 'Q&A',        icon: HelpCircle,    color: 'text-indigo-600 dark:text-indigo-400' },
};

const EFFORT_CONFIG = {
  'quick-win': { label: 'Quick Win', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
  medium:      { label: 'Medium',    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  project:     { label: 'Project',   cls: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400' },
} as const;

const PRIORITY_ICON: Record<1 | 2 | 3, { icon: typeof AlertTriangle; color: string }> = {
  1: { icon: AlertTriangle, color: 'text-red-500' },
  2: { icon: TrendingUp,    color: 'text-amber-500' },
  3: { icon: CheckCircle2,  color: 'text-blue-400' },
};

// ─── Grade pill ───────────────────────────────────────────────────────────────

function GradePill({ label, grade }: { label: string; grade: GradeValue }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-2xl font-bold ${GRADE_COLOR[grade]}`}>{grade}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ─── Task row ─────────────────────────────────────────────────────────────────

function TaskRow({ task }: { task: GBPTask }) {
  const [open, setOpen] = useState(false);
  const cat = CAT_CONFIG[task.category];
  const CatIcon = cat.icon;
  const { icon: PIcon, color: pColor } = PRIORITY_ICON[task.priority];
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        data-testid={`gbp-task-${task.task.slice(0, 20).replace(/\s/g, '-')}`}
      >
        <PIcon className={`h-3.5 w-3.5 shrink-0 ${pColor}`} />
        <CatIcon className={`h-3.5 w-3.5 shrink-0 ${cat.color}`} />
        <span className="flex-1 text-xs font-medium truncate">{task.task}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${EFFORT_CONFIG[task.effort].cls}`}>
          {EFFORT_CONFIG[task.effort].label}
        </span>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t px-3 py-2 space-y-1.5 bg-muted/20">
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Why: </span>{task.reason}</p>
          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Impact: </span>{task.impact}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { client: Client }

export default function GBPEnginePanel({ client }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();

  const report = client.gbpEngine;
  const onboarding = client.clientOnboarding;
  const bp = client.businessProfile;

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        businessName: client.businessName,
        industry: bp?.industry || '',
        location: client.address || '',
        websiteUrl: client.website || '',
        gbpLocationName: client.gbpLocationName || '',
        reviewCount: bp?.reviewCount ?? null,
        rating: bp?.rating ?? null,
        gbpPhotoCount: bp?.gbpPhotoCount ?? null,
        gbpPostsLast30Days: bp?.gbpPostsLast30Days ?? null,
        businessOverview: onboarding?.businessOverview || '',
        keyServices: onboarding?.keyServices || '',
        targetCustomers: onboarding?.targetCustomers || '',
        locations: onboarding?.locations || '',
        keyDifferentiators: onboarding?.keyDifferentiators || '',
        selectedProducts: onboarding?.selectedProducts || [],
      };
      const res = await fetch('/api/ai/client/gbp-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to analyse GBP');
      const data = await res.json();
      const newReport: GBPEngineReport = { ...data, generatedAt: new Date() };
      const updates = { gbpEngine: newReport };
      if (orgId && authReady) {
        await updateClientInFirestore(orgId, client.id, updates).catch(console.error);
      }
      dispatch(updateClient({ id: client.id, updates }));
    } catch (err: any) {
      setError(err.message);
      toast({ title: 'GBP analysis failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [client, bp, onboarding, orgId, authReady, dispatch, toast]);

  const handleCopyQuickWins = useCallback(() => {
    if (!report?.quickWins?.length) return;
    navigator.clipboard.writeText(report.quickWins.map((w, i) => `${i + 1}. ${w}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report]);

  const optCfg = report ? OPT_CONFIG[report.optimizationLabel] : null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="card-gbp-engine">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors"
        data-testid="toggle-gbp-engine"
      >
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">GBP Engine</span>
          {report && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${optCfg?.color} ${optCfg?.bg}`}>
              {report.optimizationScore}/100 · {optCfg?.label}
            </span>
          )}
          {!report && <span className="text-xs text-muted-foreground italic">Not analysed</span>}
        </div>
        <div className="flex items-center gap-2">
          {report && <span className="text-[10px] text-muted-foreground">{fmtDate(report.generatedAt)}</span>}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
            <p className="text-[11px] text-muted-foreground">
              {report ? 'Profile completeness, review strength, and posting consistency' : 'Analyse the GBP to generate a scored optimisation report'}
            </p>
            <div className="flex items-center gap-1.5">
              {report && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleCopyQuickWins} data-testid="btn-copy-gbp-quickwins">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Quick Wins'}
                </Button>
              )}
              <Button
                variant="outline" size="sm" className="h-6 px-2 text-xs gap-1"
                onClick={handleGenerate} disabled={loading}
                data-testid="btn-run-gbp-engine"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {loading ? 'Analysing…' : report ? 'Re-analyse' : 'Run Analysis'}
              </Button>
            </div>
          </div>

          {error && (
            <div className="mx-3 mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Analysing GBP profile…
            </div>
          )}

          {!loading && !report && !error && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center px-4">
              <Star className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No GBP analysis yet</p>
              <p className="text-xs text-muted-foreground">Run an analysis to score profile completeness, review strategy, and posting cadence.</p>
            </div>
          )}

          {!loading && report && (
            <div className="p-3 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">{report.summary}</p>

              {/* Grades */}
              <div className="flex items-center justify-around py-2 border rounded-lg bg-muted/20">
                <GradePill label="Profile" grade={report.profileGrade} />
                <div className="h-8 w-px bg-border" />
                <GradePill label="Reviews" grade={report.reviewGrade} />
                <div className="h-8 w-px bg-border" />
                <GradePill label="Posts" grade={report.postGrade} />
              </div>

              {/* Quick wins */}
              {report.quickWins?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-semibold">Quick Wins</span>
                  </div>
                  <div className="space-y-1.5">
                    {report.quickWins.map((win, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 h-4 w-4 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                        <span className="text-muted-foreground">{win}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action tasks */}
              {report.tasks?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold">Optimisation Tasks</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">P1 = Critical · P2 = Important · P3 = Nice-to-have</span>
                  </div>
                  <div className="space-y-1.5">
                    {report.tasks.map((task, i) => <TaskRow key={i} task={task} />)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
