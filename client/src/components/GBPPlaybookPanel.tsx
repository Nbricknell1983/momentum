import { useState, useCallback } from 'react';
import {
  Zap, ChevronDown, ChevronRight, Sparkles, Loader2, Copy, Check,
  Send, RefreshCw, Globe, Star, MapPin, Camera, Building2, CheckSquare,
  Square, ClipboardList, FileText, BarChart3, AlertCircle, CheckCircle2,
  Target, TrendingUp, Lightbulb, Tag,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Client, GBPPlaybook, GBPKeywordPlan, GBPKeywordCluster } from '@/lib/types';

interface Props {
  client: Client;
  parsedKeywords: Array<{ keyword: string; volume?: number | null; difficulty?: string | null }>;
  onPlaybookUpdate: (patch: Partial<GBPPlaybook>) => void;
}

const CITATIONS = [
  { id: 'yellow_pages', name: 'Yellow Pages', url: 'yellowpages.com.au' },
  { id: 'true_local', name: 'True Local', url: 'truelocal.com.au' },
  { id: 'yelp', name: 'Yelp', url: 'yelp.com.au' },
  { id: 'hotfrog', name: 'Hotfrog', url: 'hotfrog.com.au' },
  { id: 'start_local', name: 'StartLocal', url: 'startlocal.com.au' },
  { id: 'local_search', name: 'LocalSearch', url: 'localsearch.com.au' },
  { id: 'aussie_web', name: 'AussieWeb', url: 'aussieweb.com.au' },
  { id: 'womo', name: 'Word of Mouth (WOMO)', url: 'womo.com.au' },
  { id: 'white_pages', name: 'White Pages', url: 'whitepages.com.au' },
  { id: 'bing_places', name: 'Bing Places', url: 'bing.com/maps' },
  { id: 'apple_maps', name: 'Apple Maps', url: 'maps.apple.com' },
  { id: 'hipages', name: 'HiPages', url: 'hipages.com.au' },
  { id: 'oneflare', name: 'Oneflare', url: 'oneflare.com.au' },
  { id: 'product_review', name: 'ProductReview', url: 'productreview.com.au' },
  { id: 'facebook', name: 'Facebook Business', url: 'facebook.com/business' },
];

const SIGNAL_LABELS: Record<string, string> = {
  category: 'Primary Category',
  description: 'Business Description',
  services: 'GBP Services',
  reviews: 'Review Strategy',
  serviceArea: 'Service Area',
  citations: 'Citation Authority',
  engagement: 'Photos & Engagement',
};

const SIGNAL_ICONS: Record<string, React.ReactNode> = {
  category: <Building2 className="h-3 w-3" />,
  description: <FileText className="h-3 w-3" />,
  services: <ClipboardList className="h-3 w-3" />,
  reviews: <Star className="h-3 w-3" />,
  serviceArea: <MapPin className="h-3 w-3" />,
  citations: <Globe className="h-3 w-3" />,
  engagement: <Camera className="h-3 w-3" />,
};

function scoreColor(score: number) {
  if (score >= 75) return 'text-green-600 dark:text-green-400';
  if (score >= 45) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBg(score: number) {
  if (score >= 75) return 'bg-green-500';
  if (score >= 45) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function GBPPlaybookPanel({ client, parsedKeywords, onPlaybookUpdate }: Props) {
  const { toast } = useToast();
  const playbook: GBPPlaybook = client.gbpPlaybook || {};
  const keywords = parsedKeywords.map(k => k.keyword);

  const [openSection, setOpenSection] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Audit
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<{ total: number; breakdown: Record<string, number>; topGaps: string[] } | null>(
    playbook.auditScore != null ? { total: playbook.auditScore, breakdown: playbook.auditBreakdown || {}, topGaps: [] } : null
  );

  // Description
  const [descText, setDescText] = useState(playbook.description || '');
  const [descLoading, setDescLoading] = useState(false);
  const [descPublishing, setDescPublishing] = useState(false);
  const [descPublished, setDescPublished] = useState(false);

  // Services
  const [services, setServices] = useState<string[]>(playbook.services || []);
  const [servicesLoading, setServicesLoading] = useState(false);

  // Review Template
  const [reviewTemplate, setReviewTemplate] = useState<{ sms?: string; email?: string; exampleReview?: string } | null>(
    playbook.reviewTemplate ? { sms: playbook.reviewTemplate } : null
  );
  const [reviewLoading, setReviewLoading] = useState(false);

  // Service Area
  const [suburbs, setSuburbs] = useState<string[]>(playbook.serviceAreaSuburbs || []);
  const [suburbsLoading, setSuburbsLoading] = useState(false);

  // Citations
  const [citations, setCitations] = useState<Record<string, boolean>>(playbook.citationChecklist || {});

  // Photo Strategy
  const [photoFilenames, setPhotoFilenames] = useState<string[]>(playbook.photoFilenames || []);
  const [photoGuide, setPhotoGuide] = useState<string[]>(playbook.photoShootingGuide || []);
  const [photoLoading, setPhotoLoading] = useState(false);

  // Keyword Intelligence Plan
  const [kwPlan, setKwPlan] = useState<GBPKeywordPlan | null>(playbook.keywordPlan || null);
  const [kwPlanLoading, setKwPlanLoading] = useState(false);
  const [kwOpenCluster, setKwOpenCluster] = useState<number | null>(null);

  const savePlaybook = useCallback(async (patch: Partial<GBPPlaybook>) => {
    onPlaybookUpdate(patch);
    try {
      await fetch(`/api/clients/${client.id}/gbp-playbook`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: client.orgId, patch }),
      });
    } catch { /* silent */ }
  }, [client.id, client.orgId, onPlaybookUpdate]);

  const handleKwPlan = async () => {
    if (parsedKeywords.length === 0) { toast({ title: 'No keywords', description: 'Upload a keyword file in SEO Inputs first.', variant: 'destructive' }); return; }
    setKwPlanLoading(true);
    try {
      const resp = await fetch('/api/clients/ai/gbp-keyword-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: client.businessName,
          address: client.address,
          industry: client.clientOnboarding?.businessOverview || '',
          keywords: parsedKeywords.map(k => ({ keyword: k.keyword, volume: k.volume ?? undefined, difficulty: k.difficulty ?? undefined })),
        }),
      });
      if (!resp.ok) throw new Error('Failed');
      const data: GBPKeywordPlan = await resp.json();
      setKwPlan(data);
      setKwOpenCluster(0);
      await savePlaybook({ keywordPlan: data });
    } catch (err: any) {
      toast({ title: 'Keyword analysis failed', description: err.message, variant: 'destructive' });
    } finally { setKwPlanLoading(false); }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const handleAudit = async () => {
    setAuditLoading(true);
    try {
      const resp = await fetch('/api/clients/ai/gbp-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: client.businessName,
          hasDescription: !!descText,
          servicesCount: services.length,
          reviewCount: 0,
          hasCitations: Object.values(citations).some(Boolean),
          serviceAreaCount: suburbs.length,
          hasPhotos: false,
          hasWeeklyPosts: false,
          categorySet: !!playbook.categoryPrimary,
        }),
      });
      if (!resp.ok) throw new Error('Audit failed');
      const data = await resp.json();
      setAuditResult(data);
      await savePlaybook({ auditScore: data.total, auditBreakdown: data.breakdown });
    } catch (err: any) {
      toast({ title: 'Audit failed', description: err.message, variant: 'destructive' });
    } finally { setAuditLoading(false); }
  };

  const handleDraftDescription = async () => {
    setDescLoading(true);
    try {
      const resp = await fetch('/api/clients/ai/gbp-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: client.businessName,
          address: client.address,
          keywords,
          services: services.length ? services : undefined,
          targetLocations: suburbs.length ? suburbs.slice(0, 5) : undefined,
        }),
      });
      if (!resp.ok) throw new Error('Draft failed');
      const { text } = await resp.json();
      setDescText(text);
      setDescPublished(false);
      await savePlaybook({ description: text });
    } catch (err: any) {
      toast({ title: 'Could not draft description', description: err.message, variant: 'destructive' });
    } finally { setDescLoading(false); }
  };

  const handlePublishDescription = async () => {
    if (!descText || !client.gbpLocationName) {
      toast({ title: 'No GBP location linked', description: 'Link a GBP location to this client first.', variant: 'destructive' });
      return;
    }
    setDescPublishing(true);
    try {
      const resp = await fetch('/api/gbp/update-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: client.orgId, locationName: client.gbpLocationName, description: descText }),
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Publish failed'); }
      setDescPublished(true);
      await savePlaybook({ description: descText, descriptionPublishedAt: new Date().toISOString() });
      toast({ title: 'Description updated!', description: 'Your GBP business description is now live.' });
    } catch (err: any) {
      toast({ title: 'Publish failed', description: err.message, variant: 'destructive' });
    } finally { setDescPublishing(false); }
  };

  const handleGenerateServices = async () => {
    setServicesLoading(true);
    try {
      const industry = client.clientOnboarding?.keyServices || 'local services';
      const resp = await fetch('/api/clients/ai/gbp-services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: client.businessName, industry, keywords }),
      });
      if (!resp.ok) throw new Error('Failed');
      const { services: list } = await resp.json();
      setServices(list || []);
      await savePlaybook({ services: list });
    } catch (err: any) {
      toast({ title: 'Could not generate services', description: err.message, variant: 'destructive' });
    } finally { setServicesLoading(false); }
  };

  const handleGenerateReviewTemplate = async () => {
    setReviewLoading(true);
    try {
      const resp = await fetch('/api/clients/ai/review-request-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: client.businessName,
          primaryService: keywords[0] || 'our services',
          primaryLocation: suburbs[0] || client.address || '',
          keywords: keywords.slice(0, 5),
        }),
      });
      if (!resp.ok) throw new Error('Failed');
      const data = await resp.json();
      setReviewTemplate(data);
      await savePlaybook({ reviewTemplate: data.sms });
    } catch (err: any) {
      toast({ title: 'Could not generate template', description: err.message, variant: 'destructive' });
    } finally { setReviewLoading(false); }
  };

  const handleGenerateSuburbs = async () => {
    setSuburbsLoading(true);
    try {
      const resp = await fetch('/api/clients/ai/service-area-suburbs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: client.businessName, address: client.address, keywords, existingSuburbs: suburbs }),
      });
      if (!resp.ok) throw new Error('Failed');
      const { suburbs: list } = await resp.json();
      setSuburbs(list || []);
      await savePlaybook({ serviceAreaSuburbs: list });
    } catch (err: any) {
      toast({ title: 'Could not generate suburbs', description: err.message, variant: 'destructive' });
    } finally { setSuburbsLoading(false); }
  };

  const handleGeneratePhotoStrategy = async () => {
    setPhotoLoading(true);
    try {
      const resp = await fetch('/api/clients/ai/photo-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: client.businessName,
          industry: client.clientOnboarding?.keyServices || 'local services',
          keywords,
          primaryLocation: suburbs[0] || client.address || '',
        }),
      });
      if (!resp.ok) throw new Error('Failed');
      const { filenames, shootingGuide } = await resp.json();
      setPhotoFilenames(filenames || []);
      setPhotoGuide(shootingGuide || []);
      await savePlaybook({ photoFilenames: filenames, photoShootingGuide: shootingGuide });
    } catch (err: any) {
      toast({ title: 'Could not generate photo strategy', description: err.message, variant: 'destructive' });
    } finally { setPhotoLoading(false); }
  };

  const handleCitationToggle = async (id: string) => {
    const next = { ...citations, [id]: !citations[id] };
    setCitations(next);
    await savePlaybook({ citationChecklist: next });
  };

  const citationsDone = Object.values(citations).filter(Boolean).length;
  const totalCitations = CITATIONS.length;

  const toggle = (section: string) => setOpenSection(prev => prev === section ? null : section);

  const SignalCard = ({
    id, title, icon, score, children,
  }: { id: string; title: string; icon: React.ReactNode; score?: number; children: React.ReactNode }) => {
    const isOpen = openSection === id;
    const hasScore = score != null;
    return (
      <div className="border rounded-lg overflow-hidden">
        <button
          onClick={() => toggle(id)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
          data-testid={`gbp-signal-${id}`}
        >
          <span className="text-muted-foreground">{icon}</span>
          <span className="flex-1 text-xs font-medium">{title}</span>
          {hasScore && (
            <span className={`text-[11px] font-semibold ${scoreColor(score)}`}>{score}/100</span>
          )}
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {isOpen && <div className="border-t px-3 py-2.5 space-y-2.5">{children}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Audit Score Banner */}
      <div className="rounded-lg border bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
            <p className="text-xs font-semibold text-violet-800 dark:text-violet-300">GBP Optimisation Score</p>
          </div>
          <button
            onClick={handleAudit}
            disabled={auditLoading}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
            data-testid="btn-gbp-audit"
          >
            {auditLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Analysing…</> : <><Sparkles className="h-3 w-3" /> {auditResult ? 'Re-audit' : 'Run Audit'}</>}
          </button>
        </div>

        {!auditResult && !auditLoading && (
          <p className="text-[11px] text-violet-700/70 dark:text-violet-400/70">
            Run an AI audit to score your GBP across all 7 ranking signals and see exactly what's missing.
          </p>
        )}

        {auditLoading && (
          <div className="flex items-center gap-2 text-[11px] text-violet-700/70 dark:text-violet-400/70">
            <Loader2 className="h-3 w-3 animate-spin" /> Scoring across 7 ranking signals…
          </div>
        )}

        {auditResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold tabular-nums ${scoreColor(auditResult.total)}`}>{auditResult.total}</span>
              <span className="text-[11px] text-muted-foreground">/100</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${scoreBg(auditResult.total)}`} style={{ width: `${auditResult.total}%` }} />
              </div>
            </div>
            {auditResult.breakdown && Object.keys(auditResult.breakdown).length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {Object.entries(auditResult.breakdown).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${scoreBg(val as number)}`} />
                    <span className="text-[10px] text-muted-foreground flex-1 truncate">{SIGNAL_LABELS[key] || key}</span>
                    <span className={`text-[10px] font-medium ${scoreColor(val as number)}`}>{val as number}</span>
                  </div>
                ))}
              </div>
            )}
            {auditResult.topGaps?.length > 0 && (
              <div className="space-y-1 pt-1 border-t">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Top gaps to fix</p>
                {auditResult.topGaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-1 text-[11px]">
                    <AlertCircle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-foreground/70">{gap}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Keyword Intelligence Plan ── */}
      <div className="rounded-lg border bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">Keyword Intelligence Plan</p>
            {parsedKeywords.length > 0 && (
              <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full px-1.5 py-0.5">{parsedKeywords.length} keywords</span>
            )}
          </div>
          <button
            onClick={handleKwPlan}
            disabled={kwPlanLoading || parsedKeywords.length === 0}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
            data-testid="btn-gbp-keyword-plan"
          >
            {kwPlanLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Analysing…</> : <><Sparkles className="h-3 w-3" /> {kwPlan ? 'Re-analyse' : 'Analyse Keywords'}</>}
          </button>
        </div>

        {!kwPlan && !kwPlanLoading && (
          <div className="px-3 pb-2.5">
            <p className="text-[11px] text-indigo-700/70 dark:text-indigo-400/70">
              AI maps your {parsedKeywords.length > 0 ? `${parsedKeywords.length} tracked keywords` : 'keyword list'} to the 7 GBP signals — showing exactly which keywords to target where and what to do first.
            </p>
          </div>
        )}

        {kwPlanLoading && (
          <div className="px-3 pb-2.5 flex items-center gap-2 text-[11px] text-indigo-700/70 dark:text-indigo-400/70">
            <Loader2 className="h-3 w-3 animate-spin" /> Mapping keywords across GBP signals…
          </div>
        )}

        {kwPlan && !kwPlanLoading && (
          <div className="border-t">
            {/* Summary */}
            <div className="px-3 py-2 bg-indigo-50/50 dark:bg-indigo-950/10 border-b">
              <p className="text-[11px] text-indigo-900/80 dark:text-indigo-300/80 leading-relaxed">{kwPlan.summary}</p>
            </div>

            {/* Top Keywords */}
            {kwPlan.topKeywords?.length > 0 && (
              <div className="px-3 py-2 border-b">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Target className="h-3 w-3" /> Top Priority Keywords
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {kwPlan.topKeywords.map((kw, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-indigo-600 text-white rounded-full px-2.5 py-0.5 font-medium">
                      <span className="opacity-70">#{i + 1}</span> {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Wins */}
            {kwPlan.quickWins?.length > 0 && (
              <div className="px-3 py-2 border-b">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3 text-amber-500" /> Quick Wins This Week
                </p>
                <div className="space-y-1">
                  {kwPlan.quickWins.map((win, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px]">
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-foreground/80">{win}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Keyword Clusters */}
            {kwPlan.clusters?.length > 0 && (
              <div className="divide-y">
                {kwPlan.clusters.map((cluster, idx) => {
                  const isOpen = kwOpenCluster === idx;
                  const priorityColor = cluster.priority === 'high' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : cluster.priority === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
                  return (
                    <div key={idx}>
                      <button
                        onClick={() => setKwOpenCluster(isOpen ? null : idx)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                        data-testid={`gbp-kwcluster-${idx}`}
                      >
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${priorityColor}`}>{cluster.priority}</span>
                        <span className="flex-1 text-[11px] font-medium truncate">{cluster.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{cluster.keywords?.length || 0} keywords</span>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      </button>

                      {isOpen && (
                        <div className="px-3 pb-3 space-y-2 bg-muted/10">
                          <p className="text-[11px] text-muted-foreground italic">{cluster.strategy}</p>
                          <div className="space-y-1.5">
                            {cluster.keywords?.map((kw, ki) => (
                              <div key={ki} className="rounded-md border bg-background p-2 space-y-1">
                                <div className="flex items-center gap-2">
                                  <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-[11px] font-semibold flex-1">{kw.keyword}</span>
                                  {kw.volume != null && kw.volume > 0 && (
                                    <span className="text-[10px] text-muted-foreground">{kw.volume.toLocaleString()} vol</span>
                                  )}
                                </div>
                                {kw.signals?.length > 0 && (
                                  <div className="flex flex-wrap gap-1 pl-5">
                                    {kw.signals.map((sig, si) => (
                                      <span key={si} className="text-[9px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded px-1.5 py-0.5">{SIGNAL_LABELS[sig] || sig}</span>
                                    ))}
                                  </div>
                                )}
                                {kw.action && (
                                  <p className="text-[10px] text-foreground/70 pl-5 leading-snug">{kw.action}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {kwPlan.generatedAt && (
              <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
                Last analysed: {new Date(kwPlan.generatedAt).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Signal 1: Primary Category */}
      <SignalCard id="category" title="1. Primary Category" icon={SIGNAL_ICONS.category} score={auditResult?.breakdown?.category}>
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            The single biggest ranking factor. Your primary category must match the main keyword you want to rank for. Competitors in the 3-pack almost always share the same primary category.
          </p>
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-2">
            <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium mb-1">Action required — in GBP dashboard:</p>
            <ol className="space-y-0.5 text-[11px] text-amber-700/80 dark:text-amber-400/80 list-decimal list-inside">
              <li>Search your top keyword in incognito</li>
              <li>Check the primary category of all 3 top results</li>
              <li>Match the most common one as your primary category</li>
              <li>Add 3–4 secondary categories for keyword variations</li>
            </ol>
          </div>
          {keywords.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Suggested category alignment from your keywords:</p>
              <div className="flex flex-wrap gap-1">
                {keywords.slice(0, 6).map((kw, i) => (
                  <span key={i} className="text-[10px] bg-muted rounded px-1.5 py-0.5">{kw}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground block mb-1">Note your selected category:</label>
            <input
              type="text"
              value={playbook.categoryPrimary || ''}
              onChange={e => savePlaybook({ categoryPrimary: e.target.value })}
              placeholder="e.g. Crane Service"
              className="w-full text-[11px] rounded border border-border bg-muted/40 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
              data-testid="input-gbp-category"
            />
          </div>
        </div>
      </SignalCard>

      {/* Signal 2: Business Description */}
      <SignalCard id="description" title="2. Business Description" icon={SIGNAL_ICONS.description} score={auditResult?.breakdown?.description}>
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">AI writes a keyword-rich description with service + location signals, then publishes directly to your GBP.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDraftDescription}
              disabled={descLoading}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 border border-violet-300 dark:border-violet-700 rounded px-2 py-1 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
              data-testid="btn-draft-description"
            >
              {descLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Drafting…</> : <><Sparkles className="h-3 w-3" /> {descText ? 'Redraft' : 'Draft Description'}</>}
            </button>
            {descText && (
              <button
                onClick={() => copyToClipboard(descText, 'desc')}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {copied === 'desc' ? <><Check className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            )}
          </div>
          {descText && (
            <div className="space-y-1.5">
              <textarea
                value={descText}
                onChange={e => { setDescText(e.target.value); setDescPublished(false); }}
                rows={4}
                maxLength={750}
                className="w-full text-[11px] rounded border border-border bg-muted/40 px-2 py-1.5 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                data-testid="textarea-description"
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{descText.length}/750</span>
                <div className="flex-1" />
                {descPublished ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle2 className="h-3 w-3" /> Published to GBP
                  </span>
                ) : (
                  <button
                    onClick={handlePublishDescription}
                    disabled={descPublishing || !client.gbpLocationName}
                    title={!client.gbpLocationName ? 'Link a GBP location to this client first' : ''}
                    className="inline-flex items-center gap-1 text-[10px] font-medium bg-green-600 hover:bg-green-700 text-white rounded px-2 py-0.5 disabled:opacity-50 transition-colors"
                    data-testid="btn-publish-description"
                  >
                    {descPublishing ? <><Loader2 className="h-3 w-3 animate-spin" /> Publishing…</> : <><Send className="h-3 w-3" /> Publish to GBP</>}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </SignalCard>

      {/* Signal 3: GBP Services */}
      <SignalCard id="services" title="3. GBP Services" icon={SIGNAL_ICONS.services} score={auditResult?.breakdown?.services}>
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Winning listings have 15–25 services. Each acts as an additional keyword trigger. AI generates a full list from your keywords.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateServices}
              disabled={servicesLoading}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 border border-violet-300 dark:border-violet-700 rounded px-2 py-1 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
              data-testid="btn-generate-services"
            >
              {servicesLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</> : <><Sparkles className="h-3 w-3" /> {services.length ? 'Regenerate' : 'Generate Services List'}</>}
            </button>
            {services.length > 0 && (
              <button
                onClick={() => copyToClipboard(services.join('\n'), 'services')}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {copied === 'services' ? <><Check className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy all</>}
              </button>
            )}
          </div>
          {services.length > 0 && (
            <div>
              <div className="flex flex-wrap gap-1">
                {services.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-muted rounded px-1.5 py-0.5">
                    {s}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">Add each of these in your GBP dashboard under Products & Services.</p>
            </div>
          )}
        </div>
      </SignalCard>

      {/* Signal 4: Review Strategy */}
      <SignalCard id="reviews" title="4. Review Strategy" icon={SIGNAL_ICONS.reviews} score={auditResult?.breakdown?.reviews}>
        <div className="space-y-2">
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2 text-[11px] text-blue-800 dark:text-blue-300">
            <p className="font-medium mb-1">Review velocity goal: 2–4 reviews per month</p>
            <p className="text-blue-700/80 dark:text-blue-400/80">Google analyses review count, frequency, and keywords inside reviews. One review per completed job is the ideal cadence.</p>
          </div>
          <button
            onClick={handleGenerateReviewTemplate}
            disabled={reviewLoading}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 border border-violet-300 dark:border-violet-700 rounded px-2 py-1 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
            data-testid="btn-generate-review-template"
          >
            {reviewLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</> : <><Sparkles className="h-3 w-3" /> {reviewTemplate ? 'Regenerate' : 'Generate Review Request'}</>}
          </button>
          {reviewTemplate && (
            <div className="space-y-2">
              {reviewTemplate.sms && (
                <div className="rounded-md border p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">SMS Template</p>
                    <button onClick={() => copyToClipboard(reviewTemplate.sms!, 'sms')} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                      {copied === 'sms' ? <><Check className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed bg-muted/40 rounded p-1.5">{reviewTemplate.sms}</p>
                  <p className="text-[10px] text-muted-foreground">{reviewTemplate.sms.length}/160 chars</p>
                </div>
              )}
              {reviewTemplate.email && (
                <div className="rounded-md border p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Email Version</p>
                    <button onClick={() => copyToClipboard(reviewTemplate.email!, 'email')} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                      {copied === 'email' ? <><Check className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed bg-muted/40 rounded p-1.5">{reviewTemplate.email}</p>
                </div>
              )}
              {reviewTemplate.exampleReview && (
                <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 p-2">
                  <p className="text-[10px] font-semibold text-green-700 dark:text-green-400 mb-1">Example of an ideal review to aim for:</p>
                  <p className="text-[11px] italic text-green-800/80 dark:text-green-300/80">"{reviewTemplate.exampleReview}"</p>
                </div>
              )}
            </div>
          )}
        </div>
      </SignalCard>

      {/* Signal 5: Service Area */}
      <SignalCard id="serviceArea" title="5. Service Area Suburbs" icon={SIGNAL_ICONS.serviceArea} score={auditResult?.breakdown?.serviceArea}>
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Add 20–30 suburbs in GBP to trigger "near me" searches across your entire service area.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateSuburbs}
              disabled={suburbsLoading}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 border border-violet-300 dark:border-violet-700 rounded px-2 py-1 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
              data-testid="btn-generate-suburbs"
            >
              {suburbsLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</> : <><Sparkles className="h-3 w-3" /> {suburbs.length ? 'Regenerate' : 'Generate Suburb List'}</>}
            </button>
            {suburbs.length > 0 && (
              <button
                onClick={() => copyToClipboard(suburbs.join(', '), 'suburbs')}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {copied === 'suburbs' ? <><Check className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy all</>}
              </button>
            )}
          </div>
          {suburbs.length > 0 && (
            <div>
              <div className="flex flex-wrap gap-1">
                {suburbs.map((s, i) => (
                  <span key={i} className="text-[10px] bg-muted rounded px-1.5 py-0.5">{s}</span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">{suburbs.length} suburbs generated. Paste these into GBP → Info → Service Area.</p>
            </div>
          )}
        </div>
      </SignalCard>

      {/* Signal 6: Citations */}
      <SignalCard id="citations" title="6. Citation Authority" icon={SIGNAL_ICONS.citations} score={auditResult?.breakdown?.citations}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">Track which directories your business is listed in. NAP (Name, Address, Phone) must match exactly on every listing.</p>
            <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">{citationsDone}/{totalCitations}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${(citationsDone / totalCitations) * 100}%` }} />
          </div>
          <div className="space-y-1.5">
            {CITATIONS.map(c => (
              <button
                key={c.id}
                onClick={() => handleCitationToggle(c.id)}
                className="w-full flex items-center gap-2 text-[11px] hover:bg-muted/30 rounded px-1 py-0.5 transition-colors text-left"
                data-testid={`citation-${c.id}`}
              >
                {citations[c.id]
                  ? <CheckSquare className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                  : <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className={citations[c.id] ? 'line-through text-muted-foreground' : ''}>{c.name}</span>
                <span className="text-muted-foreground ml-auto text-[10px]">{c.url}</span>
              </button>
            ))}
          </div>
        </div>
      </SignalCard>

      {/* Signal 7: Photos & Engagement */}
      <SignalCard id="engagement" title="7. Photos & Engagement" icon={SIGNAL_ICONS.engagement} score={auditResult?.breakdown?.engagement}>
        <div className="space-y-2">
          <div className="rounded-md bg-muted/50 p-2 text-[11px] space-y-1">
            <p className="font-medium">Target: 100+ photos on your GBP</p>
            <p className="text-muted-foreground">Businesses with more photos rank higher. Upload photos with geo-targeted filenames so Google reads location signals from the file names.</p>
          </div>
          <button
            onClick={handleGeneratePhotoStrategy}
            disabled={photoLoading}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400 border border-violet-300 dark:border-violet-700 rounded px-2 py-1 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
            data-testid="btn-generate-photo-strategy"
          >
            {photoLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</> : <><Sparkles className="h-3 w-3" /> {photoFilenames.length ? 'Regenerate' : 'Generate Photo Strategy'}</>}
          </button>
          {photoFilenames.length > 0 && (
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Geo-targeted filenames to use</p>
                  <button onClick={() => copyToClipboard(photoFilenames.join('\n'), 'filenames')} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                    {copied === 'filenames' ? <><Check className="h-3 w-3 text-green-500" /> Copied</> : <><Copy className="h-3 w-3" /> Copy all</>}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {photoFilenames.map((f, i) => (
                    <span key={i} className="text-[10px] font-mono bg-muted rounded px-1.5 py-0.5">{f}</span>
                  ))}
                </div>
              </div>
              {photoGuide.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Shooting guide</p>
                  <ul className="space-y-1">
                    {photoGuide.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px]">
                        <Camera className="h-3 w-3 text-violet-500 shrink-0 mt-0.5" />
                        <span className="text-foreground/80">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </SignalCard>
    </div>
  );
}
