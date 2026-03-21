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
  Sparkles, Copy, Check, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react';
import { timeAgo } from '@/lib/utils';

type SpecId = 'prep' | 'website' | 'seo' | 'growth' | 'commercial';
type StageStatus = 'pending' | 'running' | 'complete' | 'blocked';

const SPEC = {
  prep:       { name: 'Prep Specialist',        initial: 'P', color: 'bg-blue-500',    ring: 'ring-blue-200 dark:ring-blue-800',   text: 'text-blue-600 dark:text-blue-400',   Icon: Phone      },
  website:    { name: 'Website Specialist',     initial: 'W', color: 'bg-emerald-500', ring: 'ring-emerald-200 dark:ring-emerald-800', text: 'text-emerald-600 dark:text-emerald-400', Icon: Globe  },
  seo:        { name: 'SEO Specialist',         initial: 'S', color: 'bg-violet-500',  ring: 'ring-violet-200 dark:ring-violet-800',  text: 'text-violet-600 dark:text-violet-400',  Icon: Search },
  growth:     { name: 'Growth Analyst',         initial: 'G', color: 'bg-amber-500',   ring: 'ring-amber-200 dark:ring-amber-800',    text: 'text-amber-600 dark:text-amber-400',    Icon: TrendingUp },
  commercial: { name: 'Commercial Intelligence',initial: 'C', color: 'bg-rose-500',    ring: 'ring-rose-200 dark:ring-rose-800',      text: 'text-rose-600 dark:text-rose-400',      Icon: Zap    },
};

// Returns true when a timestamp is older than thresholdMs. Returns false (not stale) when
// the timestamp is missing — we only flag data we know is old, not data we've never seen.
function evidenceIsStale(ts: string | Date | null | undefined, thresholdMs: number): boolean {
  if (!ts) return false;
  const d = new Date(ts as any);
  if (isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > thresholdMs;
}

const OBSERVED_STALE_MS = 86_400_000;   // 24 h  — GBP / crawl data
const SERP_STALE_MS     = 604_800_000;  // 7 days — competitive landscape moves slowly
const AI_STALE_MS       = 172_800_000;  // 48 h  — AI interpretation / next best steps

// ── Small evidence display components ────────────────────────────────────────

function ObservedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
      <CheckCircle2 className="h-2 w-2" /> Observed
    </span>
  );
}

function EstimatedBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40">
      <AlertCircle className="h-2 w-2" /> Estimated
    </span>
  );
}

function AiBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40">
      <Sparkles className="h-2 w-2" /> AI Analysis
    </span>
  );
}

function EvidenceChip({ label, variant = 'neutral' }: { label: string; variant?: 'positive' | 'gap' | 'neutral' | 'info' }) {
  const cls = {
    positive: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
    gap:      'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
    neutral:  'bg-muted text-muted-foreground border-border',
    info:     'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
  }[variant];
  return (
    <span className={`inline-flex items-center text-[9px] font-medium px-1.5 py-0.5 rounded border ${cls} leading-none`}>
      {label}
    </span>
  );
}

function EvidenceSectionHeader({ label, badge, freshness, stale }: { label: string; badge?: React.ReactNode; freshness?: string | null; stale?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 mt-1.5 mb-0.5">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      {badge}
      {freshness && (
        <span className={`text-[8px] ml-auto shrink-0 ${stale ? 'text-amber-500 dark:text-amber-400 font-medium' : 'text-muted-foreground/50'}`}>
          · {freshness}
        </span>
      )}
    </div>
  );
}

function EvidenceChipRow({ chips }: { chips: { label: string; variant?: 'positive' | 'gap' | 'neutral' | 'info' }[] }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c, i) => <EvidenceChip key={i} label={c.label} variant={c.variant} />)}
    </div>
  );
}

// ── Existing shared components ────────────────────────────────────────────────

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
    return <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium"><CheckCircle2 className="h-3 w-3" /> Done</span>;
  if (status === 'running')
    return <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium"><Loader2 className="h-3 w-3 animate-spin" /> On it…</span>;
  if (status === 'blocked')
    return <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium"><AlertCircle className="h-3 w-3" /> Needs info</span>;
  return <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium"><Clock className="h-3 w-3" /> Up next</span>;
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

  const [prepRunning, setPrepRunning] = useState(false);
  const [xrayRunning, setXrayRunning] = useState(false);
  const [serpRunning, setSerpRunning] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [evidenceRefreshing, setEvidenceRefreshing] = useState(false);

  const autoPrepFired = useRef(false);
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

  // Evidence bundle — populated by gatherEvidenceBundle on the server
  const eb = (lead as any).evidenceBundle || {};
  const ebWebsite = eb.website || null;   // real crawl data
  const ebGbp     = eb.gbp     || null;   // real GBP data
  const ebSocial  = eb.social  || null;   // detected social profiles

  // Unified sitemap status — /sitemap.xml raw HTTP check OR pages captured by
  // the intentional "Scan now" flow. Either source confirms the site is indexable.
  const hasSitemapData = !!(ebWebsite?.hasSitemap || (lead as any).sitemapPages?.length > 0);
  const sitemapScannedCount = (lead as any).sitemapPages?.length ?? 0;

  // Helper: strip "No sitemap" gap entries when we already know pages exist —
  // prevents a false red warning when /sitemap.xml isn't at the root path but
  // pages were captured via the sitemap scan tool.
  const filterSitemapGaps = (gaps: string[]): string[] =>
    hasSitemapData ? gaps.filter(g => !g.toLowerCase().includes('sitemap')) : gaps;

  // Freshness labels derived from available timestamps — null when no timestamp exists
  const ebFreshness      = timeAgo(eb.gatheredAt);                                          // all observed evidence
  const prepAiFreshness  = timeAgo((lead as any).prepCallPack?.generatedAt);                // prep AI sections
  const aiPlanFreshness  = timeAgo((lead as any).aiGrowthPlan?.generatedAt);                // xray callouts, diag, serp
  const serpFreshness    = timeAgo((lead as any).aiGrowthPlan?.serp?.generatedAt) ?? aiPlanFreshness; // SERP-specific
  const nbsFreshness     = timeAgo((lead as any).nextBestSteps?.generatedAt);               // NBS next moves

  // Staleness flags — drive amber colouring on freshness labels and the refresh action
  const ebIsStale       = evidenceIsStale(eb.gatheredAt, OBSERVED_STALE_MS);
  const prepAiIsStale   = evidenceIsStale((lead as any).prepCallPack?.generatedAt, AI_STALE_MS);
  const aiIsStale       = evidenceIsStale((lead as any).aiGrowthPlan?.generatedAt, AI_STALE_MS);
  const serpIsStaleAge  = evidenceIsStale(
    (lead as any).aiGrowthPlan?.serp?.generatedAt || (lead as any).aiGrowthPlan?.generatedAt,
    SERP_STALE_MS,
  );
  const nbsIsStale      = evidenceIsStale((lead as any).nextBestSteps?.generatedAt, AI_STALE_MS);

  // One-tap refresh — re-gathers all observed evidence (GBP, crawl, social) for this lead.
  // Firestore onSnapshot will update the lead in Redux automatically once the server writes.
  const handleRefreshEvidence = useCallback(async () => {
    if (!orgId || !authReady) return;
    setEvidenceRefreshing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch(`/api/leads/${lead.id}/gather-evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ orgId }),
      });
    } catch { /* silent — onSnapshot delivers the result regardless */ }
    finally { setEvidenceRefreshing(false); }
  }, [orgId, authReady, lead.id]);

  const saveGrowthPlan = useCallback((partialUpdate: Record<string, any>) => {
    if (!orgId || !authReady) return;
    const current = (lead as any).aiGrowthPlan || { generatedAt: new Date() };
    const aiGrowthPlan = { ...current, ...partialUpdate, generatedAt: new Date() };
    updateLeadInFirestore(orgId, lead.id, { aiGrowthPlan } as any, authReady).catch(console.error);
    dispatch(patchLead({ id: lead.id, updates: { aiGrowthPlan } as any }));
  }, [orgId, authReady, lead, dispatch]);

  // Auto-fire Prep Pack on mount — if missing OR stale (>24h)
  useEffect(() => {
    if (!orgId || !authReady || autoPrepFired.current) return;
    if (!businessName) return;
    const pack = (lead as any).prepCallPack;
    const isStale = !pack?.generatedAt || (Date.now() - new Date(pack.generatedAt).getTime() > 86400000);
    const isMissing = !pack?.businessSnapshot;
    if (!isMissing && !isStale) return;
    autoPrepFired.current = true;
    const timer = setTimeout(async () => {
      setPrepRunning(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/leads/${lead.id}/generate-prep-pack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ orgId, force: isStale }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.prepCallPack) {
            dispatch(patchLead({ id: lead.id, updates: { prepCallPack: data.prepCallPack } as any }));
          }
        }
      } catch { /* silent */ } finally {
        setPrepRunning(false);
      }
    }, 8000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, orgId, authReady]);

  // Auto-fire X-Ray if website URL exists and no cached result.
  // websiteUrl is in deps so this re-fires when activePresenceDiscovery
  // discovers and writes lead.website back to Firestore after mount.
  useEffect(() => {
    if (!orgId || !authReady || autoXrayFired.current) return;
    if (hasXray) return;
    if (!websiteUrl) return;
    autoXrayFired.current = true;
    const timer = setTimeout(async () => {
      setXrayRunning(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/ai/growth-plan/website-xray', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          // Pass orgId + leadId so the server writes crawl evidence to evidenceBundle.website
          body: JSON.stringify({ websiteUrl, businessName, location, industry, orgId, leadId: lead.id }),
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
  // websiteUrl deliberately included — re-fires when URL is discovered post-mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, orgId, authReady, websiteUrl]);

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
        // Pass xrayEvidence from evidenceBundle so SERP analysis is grounded in real crawl signals
        const xrayEvidenceForSerp = ebWebsite?.success ? {
          ctaSignals: ebWebsite.ctaSignals,
          serviceKeywords: ebWebsite.serviceKeywords,
          locationKeywords: ebWebsite.locationKeywords,
          hasSchema: ebWebsite.hasSchema,
          wordCount: ebWebsite.wordCount,
        } : null;
        const res = await fetch('/api/ai/growth-plan/serp-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ businessName, websiteUrl, location, industry, xrayEvidence: xrayEvidenceForSerp }),
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

  const anyRunning = prepRunning || xrayRunning || serpRunning || diagRunning;

  // ── Derive statuses and findings ─────────────────────────────────────────

  const prepStatus: StageStatus = hasPrepPack ? 'complete' : prepRunning ? 'running' : 'pending';
  const prepPack = (lead as any).prepCallPack;
  const prepFinding = hasPrepPack
    ? `${prepPack.businessSnapshot?.slice(0, 100)}${(prepPack.businessSnapshot?.length ?? 0) > 100 ? '…' : ''}`
    : undefined;
  const prepAt = prepPack?.generatedAt || null;

  const websiteStatus: StageStatus = hasXray ? 'complete' : xrayRunning ? 'running' : !websiteUrl ? 'blocked' : 'pending';
  const xray = (lead as any).aiGrowthPlan?.xray;
  const xrayFinding: string | undefined = (() => {
    if (!hasXray || !xray) return undefined;
    if (xray.summary) {
      const s = xray.summary as string;
      return s.length > 130 ? s.slice(0, 127) + '…' : s;
    }
    const callouts: any[] = xray.callouts || [];
    const high = callouts.filter((c: any) => c.severity === 'high');
    const top = high[0] || callouts[0];
    if (top) {
      const n = high.length || callouts.length;
      return `${n} issue${n !== 1 ? 's' : ''} flagged — top: ${top.issue}`;
    }
    return `${xray.pageCount || 'Pages'} reviewed — key gaps and opportunities found`;
  })();
  const xrayAt = (lead as any).aiGrowthPlan?.generatedAt || null;

  const seoStatus: StageStatus = hasSerp ? 'complete' : serpRunning ? 'running' : 'pending';
  const serp = (lead as any).aiGrowthPlan?.serp;
  const serpIsEstimated = serp?.estimated !== false; // treat as estimated unless explicitly false
  const serpFinding: string | undefined = (() => {
    if (!hasSerp || !serp) return undefined;
    const kw: string = serp.keyword || '';
    const maps: string = serp.prospectPosition?.mapsPresence || '';
    const organic: string = serp.prospectPosition?.organicPresence || '';
    const topComp: string = serp.competitors?.[0]?.name || '';
    const presence: string[] = [];
    if (maps === 'detected') presence.push('showing in Maps');
    else if (maps === 'not detected') presence.push('not in Maps');
    if (organic === 'detected') presence.push('organic presence found');
    else if (organic === 'not detected') presence.push('no organic visibility');
    const presStr = presence.join(', ');
    const compStr = topComp ? ` — ${topComp} is the one to beat` : '';
    if (kw && presStr) return `"${kw}": ${presStr}${compStr}`;
    return 'Search landscape mapped — visibility gaps and key competitors identified';
  })();

  const growthStatus: StageStatus = hasDiagnosis ? 'complete' : diagRunning ? 'running' : 'pending';
  const diag = (lead as any).aiGrowthPlan?.strategyDiagnosis;
  const growthFinding: string | undefined = (() => {
    if (!hasDiagnosis || !diag) return undefined;
    const score: number | undefined = diag.readinessScore;
    const insight: string = diag.insightSentence || '';
    const truncated = insight.length > 90 ? insight.slice(0, 87) + '…' : insight;
    if (score !== undefined && insight) return `Readiness ${score}/100 — ${truncated}`;
    if (insight) return truncated;
    const pCount = diag.priorities?.length;
    return `Growth readiness scored${pCount ? ` — ${pCount} priorities identified` : ''}`;
  })();

  const commStatus: StageStatus = hasNbs ? 'complete' : 'pending';
  const nbs = (lead as any).nextBestSteps;
  const commFinding: string | undefined = (() => {
    if (!hasNbs || !nbs?.steps?.length) return undefined;
    const steps: any[] = nbs.steps;
    const first = steps[0];
    const label: string = first?.label || first?.action || '';
    const count = steps.length;
    if (label) {
      return count > 1
        ? `Lead with: ${label} — ${count - 1} more action${count - 1 !== 1 ? 's' : ''} ready`
        : label;
    }
    return `${count} next move${count !== 1 ? 's' : ''} lined up for this deal`;
  })();
  const nbsAt = nbs?.generatedAt || null;

  // ── Build expand content for each stage ───────────────────────────────────

  // Stage 1: Prep — GBP evidence + social + AI commercial angle
  const prepExpandContent = hasPrepPack ? (
    <div className="space-y-0.5">
      {/* GBP observed evidence */}
      {ebGbp && (
        <>
          <EvidenceSectionHeader label="Google Business Profile" badge={<ObservedBadge />} freshness={ebFreshness} stale={ebIsStale} />
          <EvidenceChipRow chips={[
            ebGbp.category ? { label: ebGbp.category, variant: 'neutral' } : null,
            ebGbp.rating !== null ? { label: `★ ${ebGbp.rating}/5`, variant: 'positive' } : null,
            ebGbp.reviewCount !== null ? { label: `${ebGbp.reviewCount} reviews`, variant: ebGbp.reviewCount >= 20 ? 'positive' : ebGbp.reviewCount > 0 ? 'gap' : 'gap' } : null,
            ebGbp.isOpen === true ? { label: 'Open now', variant: 'positive' } : ebGbp.isOpen === false ? { label: 'Currently closed', variant: 'neutral' } : null,
            ebGbp.phone ? { label: ebGbp.phone, variant: 'neutral' } : null,
          ].filter(Boolean) as any[]} />
          {ebGbp.editorialSummary && (
            <p className="text-foreground/60 italic mt-0.5">"{ebGbp.editorialSummary.slice(0, 100)}{ebGbp.editorialSummary.length > 100 ? '…' : ''}"</p>
          )}
          {ebGbp.healthNotes?.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-0.5">
              {ebGbp.healthNotes.slice(0, 2).map((n: string, i: number) => (
                <p key={i} className="text-muted-foreground">· {n}</p>
              ))}
            </div>
          )}
        </>
      )}
      {/* Social observed evidence */}
      {ebSocial && (
        <>
          <EvidenceSectionHeader label="Social Profiles" badge={<ObservedBadge />} freshness={ebFreshness} stale={ebIsStale} />
          <EvidenceChipRow chips={[
            ebSocial.facebook?.detected ? { label: 'Facebook', variant: 'positive' } : { label: 'Facebook: not found', variant: 'gap' },
            ebSocial.instagram?.detected ? { label: 'Instagram', variant: 'positive' } : { label: 'Instagram: not found', variant: 'gap' },
            ebSocial.linkedin?.detected ? { label: 'LinkedIn', variant: 'positive' } : null,
            ebSocial.twitter?.detected ? { label: 'Twitter/X', variant: 'positive' } : null,
          ].filter(Boolean) as any[]} />
        </>
      )}
      {/* AI analysis */}
      {prepPack.commercialAngle && (
        <>
          <EvidenceSectionHeader label="Commercial Angle" badge={<AiBadge />} freshness={prepAiFreshness} stale={prepAiIsStale} />
          <div className="flex items-start justify-between gap-1">
            <p className="text-foreground/80 flex-1">{prepPack.commercialAngle}</p>
            <CopyBtn text={prepPack.commercialAngle} />
          </div>
        </>
      )}
      {(prepPack.keyDiscoveryQuestions?.length > 0 || prepPack.discoveryQuestions?.length > 0) && (
        <>
          <EvidenceSectionHeader label="Discovery Questions" badge={<AiBadge />} freshness={prepAiFreshness} stale={prepAiIsStale} />
          <ul className="space-y-0.5">
            {(prepPack.keyDiscoveryQuestions || prepPack.discoveryQuestions || []).slice(0, 3).map((q: string, i: number) => (
              <li key={i} className="text-foreground/70">· {q}</li>
            ))}
          </ul>
        </>
      )}
      {/* Stale observed evidence — show refresh action when evidence is over 24h old */}
      {ebIsStale && (
        <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-border/40">
          <p className="text-[9px] text-amber-600 dark:text-amber-400">
            Observed data is over 24h old
          </p>
          <button
            onClick={handleRefreshEvidence}
            disabled={evidenceRefreshing}
            data-testid="button-refresh-evidence"
            className="flex items-center gap-1 text-[9px] font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 transition-opacity"
          >
            {evidenceRefreshing
              ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Refreshing…</>
              : <><RefreshCw className="h-2.5 w-2.5" /> Refresh now</>}
          </button>
        </div>
      )}
    </div>
  ) : undefined;

  // Stage 2: Website — real crawl evidence + AI callouts
  const websiteExpandContent = hasXray ? (() => {
    // Prefer evidenceBundle.website (saved from gatherEvidenceBundle or X-Ray write-back)
    // Fall back to crawlData from xray result
    const crawl = ebWebsite?.success ? ebWebsite : xray?.crawlData;
    const callouts: any[] = xray?.callouts || [];
    const highCallouts = callouts.filter((c: any) => c.severity === 'high');
    const topCallouts = highCallouts.length ? highCallouts : callouts.slice(0, 3);

    return (
      <div className="space-y-0.5">
        {/* Crawl observed evidence */}
        {crawl && (
          <>
            <EvidenceSectionHeader label="Crawl Evidence" badge={<ObservedBadge />} freshness={ebFreshness} stale={ebIsStale} />
            {crawl.h1s?.length > 0 && (
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[9px] text-muted-foreground shrink-0">H1:</span>
                {crawl.h1s.slice(0, 2).map((h: string, i: number) => (
                  <EvidenceChip key={i} label={`"${h.slice(0, 40)}${h.length > 40 ? '…' : ''}"`} variant="neutral" />
                ))}
              </div>
            )}
            {crawl.ctaSignals?.length > 0 ? (
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[9px] text-muted-foreground shrink-0">CTAs:</span>
                {crawl.ctaSignals.slice(0, 4).map((c: string, i: number) => (
                  <EvidenceChip key={i} label={c} variant="positive" />
                ))}
              </div>
            ) : (
              <EvidenceChip label="No CTAs detected on homepage" variant="gap" />
            )}
            {crawl.trustSignals?.length > 0 && (
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[9px] text-muted-foreground shrink-0">Trust:</span>
                {crawl.trustSignals.slice(0, 3).map((t: string, i: number) => (
                  <EvidenceChip key={i} label={t} variant="positive" />
                ))}
              </div>
            )}
            {filterSitemapGaps(crawl.conversionGaps ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[9px] text-muted-foreground shrink-0">Gaps:</span>
                {filterSitemapGaps(crawl.conversionGaps).slice(0, 3).map((g: string, i: number) => (
                  <EvidenceChip key={i} label={g} variant="gap" />
                ))}
              </div>
            )}
            <EvidenceChipRow chips={[
              crawl.servicePageUrls?.length ? { label: `${crawl.servicePageUrls.length} service page${crawl.servicePageUrls.length !== 1 ? 's' : ''} found`, variant: 'positive' } : { label: 'No service pages', variant: 'gap' },
              crawl.locationPageUrls?.length ? { label: `${crawl.locationPageUrls.length} location page${crawl.locationPageUrls.length !== 1 ? 's' : ''} found`, variant: 'positive' } : { label: 'No location pages', variant: 'gap' },
              crawl.phoneNumbers?.length ? { label: `Phone: ${crawl.phoneNumbers[0]}`, variant: 'positive' } : { label: 'Phone: not visible', variant: 'gap' },
              crawl.hasSchema ? { label: 'Schema ✓', variant: 'positive' } : { label: 'No schema', variant: 'gap' },
              hasSitemapData
                ? { label: crawl.hasSitemap ? 'Sitemap ✓' : `${sitemapScannedCount} pages found`, variant: 'positive' as const }
                : { label: 'No sitemap', variant: 'neutral' as const },
              crawl.hasHttps ? { label: 'HTTPS ✓', variant: 'positive' } : { label: 'Not HTTPS', variant: 'gap' },
            ].filter(Boolean) as any[]} />
          </>
        )}
        {/* AI analysis callouts */}
        {topCallouts.length > 0 && (
          <>
            <EvidenceSectionHeader label="Top Issues" badge={<AiBadge />} freshness={aiPlanFreshness} stale={aiIsStale} />
            {topCallouts.slice(0, 3).map((c: any, i: number) => (
              <div key={i} className="flex items-start gap-1">
                <span className={`shrink-0 text-[8px] font-bold mt-0.5 ${c.severity === 'high' ? 'text-red-500' : c.severity === 'medium' ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {c.severity?.toUpperCase() || '·'}
                </span>
                <p className="text-foreground/70">{c.issue}{c.detail ? ` — ${c.detail.slice(0, 60)}${c.detail.length > 60 ? '…' : ''}` : ''}</p>
              </div>
            ))}
          </>
        )}
      </div>
    );
  })() : undefined;

  // Stage 3: SEO — estimated label prominently + crawl signals
  const seoExpandContent = hasSerp ? (
    <div className="space-y-0.5">
      {/* Estimated SERP analysis */}
      <EvidenceSectionHeader
        label="Search Landscape"
        badge={serpIsEstimated ? <EstimatedBadge /> : <ObservedBadge />}
        freshness={serpFreshness}
        stale={serpIsStaleAge}
      />
      {serpIsEstimated && (
        <p className="text-[9px] text-amber-600 dark:text-amber-400 mb-1">
          Search position data is AI-estimated, not pulled from live search results.
        </p>
      )}
      <EvidenceChipRow chips={[
        serp.keyword ? { label: `Keyword: "${serp.keyword}"`, variant: 'info' } : null,
        serp.prospectPosition?.mapsPresence === 'detected' ? { label: 'In Maps Pack', variant: 'positive' } : serp.prospectPosition?.mapsPresence === 'not detected' ? { label: 'Not in Maps', variant: 'gap' } : null,
        serp.prospectPosition?.organicPresence === 'detected' ? { label: 'Organic presence', variant: 'positive' } : serp.prospectPosition?.organicPresence === 'not detected' ? { label: 'No organic visibility', variant: 'gap' } : null,
        serp.prospectPosition?.relevanceScore !== undefined ? { label: `Relevance: ${serp.prospectPosition.relevanceScore}/100`, variant: 'neutral' } : null,
      ].filter(Boolean) as any[]} />
      {/* Top competitor */}
      {serp.competitors?.length > 0 && (
        <>
          <EvidenceSectionHeader label="Top Competitors" badge={serpIsEstimated ? <EstimatedBadge /> : undefined} freshness={serpFreshness} stale={serpIsStaleAge} />
          {serp.competitors.slice(0, 3).map((c: any, i: number) => (
            <div key={i} className="flex items-start gap-1">
              <span className="text-[9px] font-bold text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
              <p className="text-foreground/70 flex-1">{c.name}{c.strength ? ` — ${c.strength.slice(0, 60)}${c.strength.length > 60 ? '…' : ''}` : ''}</p>
            </div>
          ))}
        </>
      )}
      {/* Observed crawl keyword signals (real) */}
      {(ebWebsite?.serviceKeywords?.length > 0 || ebWebsite?.locationKeywords?.length > 0) && (
        <>
          <EvidenceSectionHeader label="Keyword Signals in Content" badge={<ObservedBadge />} freshness={ebFreshness} stale={ebIsStale} />
          <EvidenceChipRow chips={[
            ...(ebWebsite.serviceKeywords || []).slice(0, 4).map((k: string) => ({ label: k, variant: 'neutral' as const })),
            ...(ebWebsite.locationKeywords || []).slice(0, 3).map((k: string) => ({ label: k, variant: 'info' as const })),
          ]} />
        </>
      )}
      {/* Keyword opportunities */}
      {serp.opportunities?.length > 0 && (
        <>
          <EvidenceSectionHeader label="Keyword Opportunities" badge={serpIsEstimated ? <EstimatedBadge /> : undefined} freshness={serpFreshness} stale={serpIsStaleAge} />
          {serp.opportunities.slice(0, 3).map((o: any, i: number) => (
            <div key={i} className="flex items-start gap-1">
              <EvidenceChip label={o.difficulty || 'medium'} variant={o.difficulty === 'low' ? 'positive' : o.difficulty === 'high' ? 'gap' : 'neutral'} />
              <p className="text-foreground/70 flex-1">{o.keyword}{o.recommendation ? ` — ${o.recommendation.slice(0, 50)}${o.recommendation.length > 50 ? '…' : ''}` : ''}</p>
            </div>
          ))}
        </>
      )}
    </div>
  ) : undefined;

  // Stage 4: Growth — AI readiness + GBP health notes as context
  const growthExpandContent = hasDiagnosis ? (
    <div className="space-y-0.5">
      {diag?.priorities?.length > 0 && (
        <>
          <EvidenceSectionHeader label="Growth Priorities" badge={<AiBadge />} freshness={aiPlanFreshness} stale={aiIsStale} />
          {diag.priorities.slice(0, 3).map((p: any, i: number) => (
            <p key={i} className="text-foreground/70">· {p.priority || p}</p>
          ))}
        </>
      )}
      {ebGbp?.healthNotes?.length > 0 && (
        <>
          <EvidenceSectionHeader label="GBP Health" badge={<ObservedBadge />} freshness={ebFreshness} stale={ebIsStale} />
          <div className="flex flex-wrap gap-1">
            {ebGbp.healthNotes.map((n: string, i: number) => (
              <EvidenceChip key={i} label={n} variant={n.toLowerCase().includes('strong') || n.toLowerCase().includes('good') || n.toLowerCase().includes('excellent') ? 'positive' : n.toLowerCase().includes('low') || n.toLowerCase().includes('below') || n.toLowerCase().includes('risk') ? 'gap' : 'neutral'} />
            ))}
          </div>
        </>
      )}
      {diag?.readinessScore !== undefined && (
        <p className="text-muted-foreground mt-1">Readiness score: {diag.readinessScore}/100</p>
      )}
    </div>
  ) : undefined;

  // Stage 5: Commercial — AI next steps + conversion gap context
  const commExpandContent = hasNbs ? (
    <div className="space-y-0.5">
      <EvidenceSectionHeader label="Next Moves" badge={<AiBadge />} freshness={nbsFreshness} stale={nbsIsStale} />
      {nbs.steps.slice(0, 4).map((s: any, i: number) => (
        <div key={i} className="flex items-start gap-1">
          <span className="text-[9px] font-bold text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
          <p className="text-foreground/70 flex-1">{s.label || s.action || s.title || s}</p>
        </div>
      ))}
      {/* Conversion gaps as context for why these actions matter */}
      {filterSitemapGaps(ebWebsite?.conversionGaps ?? []).length > 0 && (
        <>
          <EvidenceSectionHeader label="Why — Gaps on Their Site" badge={<ObservedBadge />} freshness={ebFreshness} stale={ebIsStale} />
          <EvidenceChipRow chips={filterSitemapGaps(ebWebsite.conversionGaps).slice(0, 4).map((g: string) => ({ label: g, variant: 'gap' as const }))} />
        </>
      )}
    </div>
  ) : undefined;

  // ── Render ────────────────────────────────────────────────────────────────

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
            {anyRunning ? 'Team is on it' : 'Your deal team'}
          </p>
          <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[120px]">{lead.companyName}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Working this deal together</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-0">

          {/* Stage 1: Prep */}
          <StageCard
            specId="prep"
            status={prepStatus}
            task="Pulling together everything we know about this business before the call"
            finding={prepFinding}
            timestamp={prepAt}
            expandable={hasPrepPack}
            expandContent={prepExpandContent}
          />

          {/* Handoff 1→2 */}
          {prepStatus === 'complete' && websiteUrl && (
            <HandoffConnector
              from="prep"
              to="website"
              message="Handing off the site URL — Website Specialist is taking it from here"
            />
          )}

          {/* Stage 2: Website */}
          <StageCard
            specId="website"
            status={websiteStatus}
            task="Reviewing their site — page structure, SEO signals, and conversion gaps"
            finding={xrayFinding}
            timestamp={xrayAt}
            blockedReason="No website URL on this lead — add one and we'll dig straight in"
            expandable={hasXray}
            expandContent={websiteExpandContent}
          />

          {/* Handoff 2→3 */}
          {websiteStatus === 'complete' && (
            <HandoffConnector
              from="website"
              to="seo"
              message="Site review done — passing the search signals across to SEO Specialist"
            />
          )}

          {/* Stage 3: SEO */}
          <StageCard
            specId="seo"
            status={seoStatus}
            task="Checking where they sit in search and how they stack up against competitors"
            finding={serpFinding}
            expandable={hasSerp}
            expandContent={seoExpandContent}
          />

          {/* Handoff 3→4 */}
          {seoStatus === 'complete' && (
            <HandoffConnector
              from="seo"
              to="growth"
              message="Search picture is in — Growth Analyst is building the readiness assessment"
            />
          )}

          {/* Stage 4: Growth Analyst */}
          <StageCard
            specId="growth"
            status={growthStatus}
            task="Pulling the team's findings together into a growth readiness picture"
            finding={growthFinding}
            expandable={hasDiagnosis}
            expandContent={growthExpandContent}
          />

          {/* Handoff 4→5 */}
          {growthStatus === 'complete' && (
            <HandoffConnector
              from="growth"
              to="commercial"
              message="Readiness assessment done — putting together your deal-specific next moves"
            />
          )}

          {/* Stage 5: Commercial Intelligence */}
          <StageCard
            specId="commercial"
            status={commStatus}
            task="Turning the team's findings into your specific next moves for this deal"
            finding={commFinding}
            timestamp={nbsAt}
            expandable={hasNbs}
            expandContent={commExpandContent}
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
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">You shared context with the team</p>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Saved
                    </span>
                  </div>
                  <p className="text-[11px] text-foreground/70 line-clamp-2">{(lead as any).dealContext}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">The team's been updated with your notes</p>
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
            <p className="text-[10px] font-bold text-blue-900 dark:text-blue-200 flex-1">Share context with the team</p>
          </div>
          <Textarea
            value={dealContext}
            onChange={e => setDealContext(e.target.value)}
            placeholder="Goals, objections, budget, timeline, or a question for the team…"
            className="text-xs min-h-[56px] resize-none bg-background/80 border-blue-200 dark:border-blue-800/40"
            data-testid="textarea-feed-deal-context"
          />
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-blue-500/70 dark:text-blue-400/60">Helps the team sharpen their recommendations</p>
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
