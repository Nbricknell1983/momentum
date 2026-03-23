import { useState, useCallback } from 'react';
import {
  Search, RefreshCw, Copy, Check, ChevronDown, ChevronUp,
  Loader2, AlertTriangle, Zap, Target, FileText, MapPin,
  HelpCircle, PenSquare, History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/contexts/AuthContext';
import { updateClient } from '@/store/index';
import {
  Client, SEOEngineReport, ContentGap, ContentGapType, SEOUrgency,
} from '@/lib/types';
import { updateClientInFirestore } from '@/lib/firestoreService';
import { generateRunId, enrichWithMeta, persistEngineHistory, isOutputStale } from '@/lib/engineOutputService';
import { EngineHistoryDrawer } from '@/components/EngineHistoryDrawer';
import { format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: Date | string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yyyy HH:mm'); } catch { return ''; }
}

const GAP_TYPE_CONFIG: Record<ContentGapType, { label: string; icon: typeof FileText; color: string }> = {
  'service-page':  { label: 'Service Page',  icon: Target,     color: 'text-violet-600 dark:text-violet-400' },
  'location-page': { label: 'Location Page', icon: MapPin,     color: 'text-blue-600 dark:text-blue-400' },
  'faq-page':      { label: 'FAQ Page',      icon: HelpCircle, color: 'text-amber-600 dark:text-amber-400' },
  'blog-post':     { label: 'Blog Post',     icon: PenSquare,  color: 'text-emerald-600 dark:text-emerald-400' },
};

const URGENCY_CONFIG: Record<SEOUrgency, { label: string; cls: string }> = {
  high:   { label: 'High',   cls: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
  medium: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' },
  low:    { label: 'Low',    cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
};

const VISIBILITY_COLOR = (score: number) =>
  score >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
  score >= 40 ? 'text-amber-600 dark:text-amber-400' :
  'text-red-600 dark:text-red-400';

const MONTH_COLORS = ['bg-blue-50 dark:bg-blue-950/30', 'bg-violet-50 dark:bg-violet-950/30', 'bg-emerald-50 dark:bg-emerald-950/30'];

// ─── Content Gap Row ──────────────────────────────────────────────────────────

function GapRow({ gap }: { gap: ContentGap }) {
  const [open, setOpen] = useState(false);
  const cfg = GAP_TYPE_CONFIG[gap.type];
  const Icon = cfg.icon;
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        data-testid={`seo-gap-${gap.title.slice(0, 20).replace(/\s/g, '-')}`}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
        <span className="flex-1 text-xs font-medium truncate">{gap.title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${URGENCY_CONFIG[gap.urgency].cls}`}>
          {URGENCY_CONFIG[gap.urgency].label}
        </span>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t px-3 py-2 space-y-1.5 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Target keyword: </span>
            <span className="font-mono">{gap.targetKeyword}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Monthly searches: </span>{gap.estimatedMonthlySearches}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Why: </span>{gap.rationale}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { client: Client }

export default function SEOEnginePanel({ client }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { toast } = useToast();
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();

  const report = client.seoEngine;
  const onboarding = client.clientOnboarding;

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        businessName: client.businessName,
        industry: client.businessProfile?.industry || '',
        websiteUrl: client.website || onboarding?.currentWebsiteUrl || '',
        businessOverview: onboarding?.businessOverview || '',
        targetCustomers: onboarding?.targetCustomers || '',
        keyServices: onboarding?.keyServices || '',
        businessGoals: onboarding?.businessGoals || '',
        locations: onboarding?.locations || '',
        seoServices: onboarding?.seoServices || '',
        seoLocations: onboarding?.seoLocations || '',
        seoObjective: onboarding?.seoObjective || '',
        manualKeywordNotes: onboarding?.manualKeywordNotes || '',
        competitorKeywordNotes: onboarding?.competitorKeywordNotes || '',
        keywordSummary: onboarding?.keywordSummary || '',
        websitePageCount: onboarding?.websitePageCount || null,
        selectedProducts: onboarding?.selectedProducts || [],
      };
      const res = await fetch('/api/ai/client/seo-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to generate SEO plan');
      const data = await res.json();
      const runId = generateRunId();
      const report: SEOEngineReport = enrichWithMeta(data, 'seoEngine', runId) as SEOEngineReport;
      const updates = { seoEngine: report };
      if (orgId && authReady) {
        await updateClientInFirestore(orgId, client.id, updates).catch(console.error);
        await persistEngineHistory(orgId, 'clients', client.id, runId, { ...report, clientId: client.id, orgId });
      }
      dispatch(updateClient({ ...client, ...updates }));
    } catch (err: any) {
      setError(err.message);
      toast({ title: 'SEO plan failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [client, onboarding, orgId, authReady, dispatch, toast]);

  const handleCopyKeywords = useCallback(() => {
    if (!report?.keywordTargets?.length) return;
    navigator.clipboard.writeText(report.keywordTargets.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report]);

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="card-seo-engine">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
        data-testid="toggle-seo-engine"
      >
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-semibold">SEO Engine</span>
          {report && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${VISIBILITY_COLOR(report.visibilityScore)} bg-muted/40`}>
              {report.visibilityScore}/100 · {report.visibilityLabel}
            </span>
          )}
          {report && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isOutputStale(report.generatedAt, 'seoEngine') ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'}`}>
              {isOutputStale(report.generatedAt, 'seoEngine') ? 'Stale' : 'Fresh'}
            </span>
          )}
          {!report && (
            <span className="text-xs text-muted-foreground italic">Not generated</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <button
              onClick={(e) => { e.stopPropagation(); setHistoryOpen(true); }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              data-testid="btn-history-seo-engine"
            >
              <History className="h-3 w-3" />
              Runs
            </button>
          )}
          {report && (
            <span className="text-[10px] text-muted-foreground">{fmtDate(report.generatedAt)}</span>
          )}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </div>

      {open && (
        <div className="border-t">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
            <p className="text-[11px] text-muted-foreground">
              {report ? 'Keyword targets, content gaps, and 3-month roadmap' : 'Generate an AI-powered SEO intelligence plan for this client'}
            </p>
            <div className="flex items-center gap-1.5">
              {report && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={handleCopyKeywords} data-testid="btn-copy-seo-keywords">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Keywords'}
                </Button>
              )}
              <Button
                variant="outline" size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={handleGenerate} disabled={loading}
                data-testid="btn-run-seo-engine"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {loading ? 'Generating…' : report ? 'Regenerate' : 'Generate Plan'}
              </Button>
            </div>
          </div>

          {error && (
            <div className="mx-3 mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building SEO intelligence plan…
            </div>
          )}

          {!loading && !report && !error && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center px-4">
              <Search className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No SEO plan yet</p>
              <p className="text-xs text-muted-foreground">Generate a plan to surface keyword targets, content gaps, and a 3-month build roadmap.</p>
            </div>
          )}

          {!loading && report && (
            <div className="p-3 space-y-4">
              {/* Summary */}
              <p className="text-xs text-muted-foreground leading-relaxed">{report.summary}</p>

              {/* Keyword targets */}
              {report.keywordTargets?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Target className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-xs font-semibold">Keyword Targets</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {report.keywordTargets.map((kw, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400 font-medium">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Content gaps */}
              {report.contentGaps?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-semibold">Content Gaps</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {report.contentGaps.filter(g => g.urgency === 'high').length} high urgency
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {report.contentGaps.map((gap, i) => (
                      <GapRow key={i} gap={gap} />
                    ))}
                  </div>
                </div>
              )}

              {/* 3-Month Roadmap */}
              {report.monthlyPlan?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Search className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-xs font-semibold">3-Month Roadmap</span>
                  </div>
                  <div className="space-y-2">
                    {report.monthlyPlan.map((month) => (
                      <div key={month.month} className={`rounded-md p-2.5 ${MONTH_COLORS[(month.month - 1) % MONTH_COLORS.length]}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-semibold">Month {month.month}</span>
                          <span className="text-[10px] text-muted-foreground italic">— {month.focus}</span>
                        </div>
                        <ul className="space-y-1">
                          {month.actions.map((action, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <span className="mt-1 h-1 w-1 rounded-full bg-current shrink-0 opacity-60" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <EngineHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        orgId={orgId || ''}
        entityCollection="clients"
        entityId={client.id}
        engineType="seoEngine"
      />
    </div>
  );
}
