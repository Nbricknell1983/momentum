import { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { patchLead } from '@/store';
import { Lead } from '@/lib/types';
import { auth } from '@/lib/firebase';
import { updateLeadInFirestore } from '@/lib/firestoreService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import {
  Phone, Globe, Search, TrendingUp, Zap, Loader2,
  CheckCircle2, Clock, AlertCircle, ArrowDown, MessageSquare,
  Sparkles, Copy, Check, ChevronDown, ChevronUp,
} from 'lucide-react';

type SpecId = 'prep' | 'website' | 'seo' | 'growth' | 'commercial';
type StageStatus = 'pending' | 'running' | 'complete' | 'blocked';

const SPEC = {
  prep:       { name: 'Prep Specialist',        initial: 'P', color: 'bg-blue-500',    ring: 'ring-blue-200 dark:ring-blue-800',   text: 'text-blue-600 dark:text-blue-400',   Icon: Phone      },
  website:    { name: 'Website Specialist',     initial: 'W', color: 'bg-emerald-500', ring: 'ring-emerald-200 dark:ring-emerald-800', text: 'text-emerald-600 dark:text-emerald-400', Icon: Globe  },
  seo:        { name: 'SEO Specialist',         initial: 'S', color: 'bg-violet-500',  ring: 'ring-violet-200 dark:ring-violet-800',  text: 'text-violet-600 dark:text-violet-400',  Icon: Search },
  growth:     { name: 'Growth Analyst',         initial: 'G', color: 'bg-amber-500',   ring: 'ring-amber-200 dark:ring-amber-800',    text: 'text-amber-600 dark:text-amber-400',    Icon: TrendingUp },
  commercial: { name: 'Commercial Intelligence',initial: 'C', color: 'bg-rose-500',    ring: 'ring-rose-200 dark:ring-rose-800',      text: 'text-rose-600 dark:text-rose-400',      Icon: Zap    },
};

function SpecAvatar({ id, pulse }: { id: SpecId; pulse?: boolean }) {
  const s = SPEC[id];
  return (
    <div className={`relative w-7 h-7 rounded-full ${s.color} flex items-center justify-center shrink-0 ring-2 ${s.ring}`}>
      <s.Icon className="h-3.5 w-3.5 text-white" />
      {pulse && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: StageStatus }) {
  if (status === 'complete')
    return <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium"><CheckCircle2 className="h-3 w-3" /> Complete</span>;
  if (status === 'running')
    return <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium"><Loader2 className="h-3 w-3 animate-spin" /> Working…</span>;
  if (status === 'blocked')
    return <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium"><AlertCircle className="h-3 w-3" /> Blocked</span>;
  return <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium"><Clock className="h-3 w-3" /> Queued</span>;
}

function HandoffConnector({ from, to, message }: { from: SpecId; to: SpecId; message: string }) {
  return (
    <div className="flex items-stretch gap-3 py-1 ml-3.5">
      <div className="flex flex-col items-center">
        <div className="w-px flex-1 bg-border" />
        <ArrowDown className="h-3 w-3 text-muted-foreground my-0.5 shrink-0" />
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="flex-1 py-1.5">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <span className={`font-semibold ${SPEC[from].text}`}>{SPEC[from].name}</span>
          {' → '}
          <span className={`font-semibold ${SPEC[to].text}`}>{SPEC[to].name}</span>
        </p>
        <p className="text-[10px] text-muted-foreground/80 mt-0.5">{message}</p>
      </div>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="h-5 px-1.5 rounded text-[9px] flex items-center gap-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied ? <><Check className="h-2.5 w-2.5" /> Copied</> : <><Copy className="h-2.5 w-2.5" /> Copy</>}
    </button>
  );
}

interface StageCardProps {
  specId: SpecId;
  status: StageStatus;
  task: string;
  finding?: string;
  timestamp?: Date | string | null;
  blockedReason?: string;
  expandable?: boolean;
  expandContent?: React.ReactNode;
}

function StageCard({ specId, status, task, finding, timestamp, blockedReason, expandable, expandContent }: StageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const spec = SPEC[specId];
  const dim = status === 'pending' || status === 'blocked';

  return (
    <div className={`flex gap-3 ${dim ? 'opacity-50' : ''} transition-opacity`} data-testid={`feed-stage-${specId}`}>
      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
        <SpecAvatar id={specId} pulse={status === 'running'} />
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className={`text-[11px] font-bold ${spec.text}`}>{spec.name}</p>
          <StatusBadge status={status} />
        </div>
        {timestamp && status === 'complete' && (
          <p className="text-[9px] text-muted-foreground mb-1">
            {format(new Date(timestamp), 'dd/MM/yyyy HH:mm')}
          </p>
        )}
        {status === 'pending' && (
          <p className="text-[11px] text-muted-foreground">{task}</p>
        )}
        {status === 'running' && (
          <p className="text-[11px] text-foreground/70">{task}</p>
        )}
        {status === 'blocked' && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">{blockedReason || task}</p>
        )}
        {status === 'complete' && finding && (
          <div className="space-y-1">
            <p className="text-[11px] text-foreground/80 leading-relaxed">{finding}</p>
            {expandable && expandContent && (
              <>
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expanded ? <><ChevronUp className="h-3 w-3" /> Less detail</> : <><ChevronDown className="h-3 w-3" /> More detail</>}
                </button>
                {expanded && (
                  <div className="rounded-md border bg-muted/30 p-2 text-[10px] space-y-1">
                    {expandContent}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface DealLiveActivityFeedProps {
  lead: Lead;
}

export default function DealLiveActivityFeed({ lead }: DealLiveActivityFeedProps) {
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();

  const [xrayRunning, setXrayRunning] = useState(false);
  const [serpRunning, setSerpRunning] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);

  const autoXrayFired = useRef(false);
  const autoSerpFired = useRef(false);
  const autoDiagFired = useRef(false);

  const [dealContext, setDealContext] = useState((lead as any).dealContext || '');
  const [contextSaving, setContextSaving] = useState(false);

  const websiteUrl = lead.website || '';
  const businessName = lead.companyName || '';
  const location = lead.territory || lead.areaName || '';
  const industry = lead.industry || '';

  const hasPrepPack = !!(lead as any).prepCallPack?.businessSnapshot;
  const hasXray = !!(lead as any).aiGrowthPlan?.xray;
  const hasSerp = !!(lead as any).aiGrowthPlan?.serp;
  const hasDiagnosis = !!(lead as any).aiGrowthPlan?.strategyDiagnosis;
  const hasNbs = !!((lead as any).nextBestSteps?.steps?.length > 0);
  const hasDealContext = !!((lead as any).dealContext);

  const saveGrowthPlan = useCallback((partialUpdate: Record<string, any>) => {
    if (!orgId || !authReady) return;
    const current = (lead as any).aiGrowthPlan || { generatedAt: new Date() };
    const aiGrowthPlan = { ...current, ...partialUpdate, generatedAt: new Date() };
    updateLeadInFirestore(orgId, lead.id, { aiGrowthPlan } as any, authReady).catch(console.error);
    dispatch(patchLead({ id: lead.id, updates: { aiGrowthPlan } as any }));
  }, [orgId, authReady, lead, dispatch]);

  // Auto-fire X-Ray if website URL exists and no cached result
  useEffect(() => {
    if (!orgId || !authReady || autoXrayFired.current) return;
    if (hasXray) return;
    if (!websiteUrl) return;
    autoXrayFired.current = true;
    const timer = setTimeout(async () => {
      setXrayRunning(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/ai/growth-plan/xray', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ websiteUrl, businessName, location, industry }),
        });
        if (res.ok) {
          const data = await res.json();
          saveGrowthPlan({ xray: data });
        }
      } catch { /* silent */ } finally {
        setXrayRunning(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, orgId, authReady]);

  // Auto-fire SERP if business name exists and no cached result
  useEffect(() => {
    if (!orgId || !authReady || autoSerpFired.current) return;
    if (hasSerp) return;
    if (!businessName) return;
    autoSerpFired.current = true;
    const timer = setTimeout(async () => {
      setSerpRunning(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/ai/growth-plan/serp-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ businessName, websiteUrl, location, industry }),
        });
        if (res.ok) {
          const data = await res.json();
          saveGrowthPlan({ serp: data });
        }
      } catch { /* silent */ } finally {
        setSerpRunning(false);
      }
    }, 1500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, orgId, authReady]);

  // Auto-fire strategy diagnosis when X-Ray + SERP are both done (or at least one, with a timeout)
  const xrayDone = hasXray || (!xrayRunning && autoXrayFired.current);
  const serpDone = hasSerp || (!serpRunning && autoSerpFired.current);

  useEffect(() => {
    if (!orgId || !authReady || autoDiagFired.current) return;
    if (hasDiagnosis) return;
    if (!businessName) return;
    if (!xrayDone || !serpDone) return;
    autoDiagFired.current = true;
    const timer = setTimeout(async () => {
      setDiagRunning(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const xrayData = (lead as any).aiGrowthPlan?.xray || null;
        const serpData = (lead as any).aiGrowthPlan?.serp || null;
        const res = await fetch('/api/ai/growth-plan/strategy-diagnosis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ businessName, websiteUrl, location, industry, xrayData, serpData }),
        });
        if (res.ok) {
          const data = await res.json();
          saveGrowthPlan({ strategyDiagnosis: data });
        }
      } catch { /* silent */ } finally {
        setDiagRunning(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, orgId, authReady, xrayDone, serpDone]);

  const handleSaveContext = useCallback(async () => {
    if (!orgId || !authReady || !dealContext.trim()) return;
    setContextSaving(true);
    const updates: Partial<Lead> = { dealContext, updatedAt: new Date() } as any;
    await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
    dispatch(patchLead({ id: lead.id, updates: updates as any }));
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/leads/${lead.id}/next-best-steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ orgId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.steps) dispatch(patchLead({ id: lead.id, updates: { nextBestSteps: data } as any }));
      }
    } catch { /* silent */ }
    setContextSaving(false);
  }, [orgId, authReady, dealContext, lead.id, dispatch]);

  const anyRunning = xrayRunning || serpRunning || diagRunning;

  // Derive statuses
  const prepStatus: StageStatus = hasPrepPack ? 'complete' : 'pending';
  const prepPack = (lead as any).prepCallPack;
  const prepFinding = hasPrepPack
    ? `${prepPack.businessSnapshot?.slice(0, 100)}${(prepPack.businessSnapshot?.length ?? 0) > 100 ? '…' : ''}`
    : undefined;
  const prepAt = prepPack?.generatedAt || null;

  const websiteStatus: StageStatus = hasXray ? 'complete' : xrayRunning ? 'running' : !websiteUrl ? 'blocked' : 'pending';
  const xray = (lead as any).aiGrowthPlan?.xray;
  const xrayFinding = hasXray
    ? xray?.humanView?.headline || `${xray?.pageCount ?? ''} pages audited — conversion signals extracted`
    : undefined;
  const xrayAt = (lead as any).aiGrowthPlan?.generatedAt || null;

  const seoStatus: StageStatus = hasSerp ? 'complete' : serpRunning ? 'running' : 'pending';
  const serpFinding = hasSerp ? 'Keyword landscape and competitor signals captured' : undefined;

  const growthStatus: StageStatus = hasDiagnosis ? 'complete' : diagRunning ? 'running' : 'pending';
  const diag = (lead as any).aiGrowthPlan?.strategyDiagnosis;
  const growthFinding = hasDiagnosis && diag
    ? `Readiness ${diag.readinessScore}/100 — ${diag.insightSentence?.slice(0, 80)}${(diag.insightSentence?.length ?? 0) > 80 ? '…' : ''}`
    : undefined;

  const commStatus: StageStatus = hasNbs ? 'complete' : 'pending';
  const nbs = (lead as any).nextBestSteps;
  const commFinding = hasNbs ? `${nbs.steps.length} action${nbs.steps.length !== 1 ? 's' : ''} sequenced for this deal` : undefined;
  const nbsAt = nbs?.generatedAt || null;

  return (
    <div className="flex flex-col h-full bg-background" data-testid="deal-live-activity-feed">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          {anyRunning ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          )}
          <p className="text-xs font-bold text-foreground">
            {anyRunning ? 'Specialists Working' : 'Specialist Team'}
          </p>
          <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[120px]">{lead.companyName}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Deal-scoped intelligence only</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-0">

          {/* Stage 1: Prep */}
          <StageCard
            specId="prep"
            status={prepStatus}
            task="Building call prep pack from business intelligence"
            finding={prepFinding}
            timestamp={prepAt}
            expandable={hasPrepPack}
            expandContent={hasPrepPack ? (
              <div className="space-y-1.5">
                {prepPack.commercialAngle && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Commercial Angle</p>
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-foreground/80 flex-1">{prepPack.commercialAngle}</p>
                      <CopyBtn text={prepPack.commercialAngle} />
                    </div>
                  </div>
                )}
                {prepPack.keyDiscoveryQuestions?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Discovery Questions</p>
                    <ul className="space-y-0.5">
                      {prepPack.keyDiscoveryQuestions.slice(0, 3).map((q: string, i: number) => (
                        <li key={i} className="text-foreground/70">· {q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : undefined}
          />

          {/* Handoff 1→2 */}
          {prepStatus === 'complete' && websiteUrl && (
            <HandoffConnector
              from="prep"
              to="website"
              message="Site URL passed for structural analysis and SEO signal extraction"
            />
          )}

          {/* Stage 2: Website */}
          <StageCard
            specId="website"
            status={websiteStatus}
            task="Running X-Ray — auditing pages, SEO signals, conversion friction"
            finding={xrayFinding}
            timestamp={xrayAt}
            blockedReason="No website URL on this lead — add one to unlock X-Ray"
            expandable={hasXray}
            expandContent={hasXray && xray?.gaps ? (
              <div className="space-y-1">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Top Gaps</p>
                {xray.gaps.slice(0, 3).map((g: any, i: number) => (
                  <p key={i} className="text-foreground/70">· {g.gap || g}</p>
                ))}
              </div>
            ) : undefined}
          />

          {/* Handoff 2→3 */}
          {websiteStatus === 'complete' && (
            <HandoffConnector
              from="website"
              to="seo"
              message="Site structure and page data passed for keyword and SERP analysis"
            />
          )}

          {/* Stage 3: SEO */}
          <StageCard
            specId="seo"
            status={seoStatus}
            task="Mapping keyword landscape, SERP position, and competitor visibility"
            finding={serpFinding}
          />

          {/* Handoff 3→4 */}
          {seoStatus === 'complete' && (
            <HandoffConnector
              from="seo"
              to="growth"
              message="Search data passed to Growth Analyst for readiness assessment"
            />
          )}

          {/* Stage 4: Growth Analyst */}
          <StageCard
            specId="growth"
            status={growthStatus}
            task="Running readiness assessment — scoring digital visibility and growth gaps"
            finding={growthFinding}
            expandable={hasDiagnosis}
            expandContent={hasDiagnosis && diag?.priorities?.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Growth Priorities</p>
                {diag.priorities.slice(0, 3).map((p: any, i: number) => (
                  <p key={i} className="text-foreground/70">· {p.priority || p}</p>
                ))}
              </div>
            ) : undefined}
          />

          {/* Handoff 4→5 */}
          {growthStatus === 'complete' && (
            <HandoffConnector
              from="growth"
              to="commercial"
              message="Readiness findings passed — sequencing deal-specific next actions"
            />
          )}

          {/* Stage 5: Commercial Intelligence */}
          <StageCard
            specId="commercial"
            status={commStatus}
            task="Translating specialist findings into deal-specific next actions"
            finding={commFinding}
            timestamp={nbsAt}
            expandable={hasNbs}
            expandContent={hasNbs && nbs?.steps?.length > 0 ? (
              <div className="space-y-1">
                {nbs.steps.slice(0, 3).map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
                    <p className="text-foreground/70">{s.action || s.title || s}</p>
                  </div>
                ))}
              </div>
            ) : undefined}
          />

          {/* Context event — shown if deal context has been added */}
          {hasDealContext && (
            <>
              <div className="h-3" />
              <div className="flex gap-3" data-testid="feed-context-event">
                <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 ring-2 ring-slate-200 dark:ring-slate-700">
                  <MessageSquare className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="flex-1 min-w-0 pb-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Deal Context Added</p>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Saved
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground/70 line-clamp-2">{(lead as any).dealContext}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Intelligence refreshed across all specialists</p>
                </div>
              </div>
            </>
          )}

          <div className="h-4" />
        </div>
      </ScrollArea>

      {/* Context Input */}
      <div className="shrink-0 border-t p-3">
        <div className="rounded-lg border border-blue-200 dark:border-blue-800/40 bg-blue-50/40 dark:bg-blue-950/10 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3 text-blue-500 shrink-0" />
            <p className="text-[10px] font-bold text-blue-900 dark:text-blue-200 flex-1">Add context for this deal</p>
          </div>
          <Textarea
            value={dealContext}
            onChange={e => setDealContext(e.target.value)}
            placeholder="Goals, objections, budget, timeline, or a question for the team…"
            className="text-xs min-h-[56px] resize-none bg-background/80 border-blue-200 dark:border-blue-800/40"
            data-testid="textarea-feed-deal-context"
          />
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-blue-500/70 dark:text-blue-400/60">Refines next best steps and strategy</p>
            <Button
              size="sm"
              onClick={handleSaveContext}
              disabled={contextSaving || !dealContext.trim()}
              className="h-6 text-[10px] px-2.5 gap-1"
              data-testid="button-save-feed-context"
            >
              {contextSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {contextSaving ? 'Updating…' : 'Save & Refresh'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
