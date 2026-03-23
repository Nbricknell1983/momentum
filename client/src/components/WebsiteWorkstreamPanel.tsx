import { useState, useCallback, useRef, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useDispatch } from 'react-redux';
import { updateClient } from '@/store/index';
import { updateClientInFirestore } from '@/lib/firestoreService';
import { EngineHistoryDrawer } from '@/components/EngineHistoryDrawer';
import { format } from 'date-fns';
import {
  RefreshCw, CheckCircle, Download, Globe, FileText, Type,
  Search, Image, Eye, ChevronDown, ChevronRight, AlertCircle,
  Lock, Cpu, ExternalLink, Zap, MonitorPlay, Code2, Map, Rocket,
  Smartphone, Monitor, Shield, AlertTriangle, ArrowRight, Trash2,
  Upload, X, ListChecks, TrendingUp, TrendingDown, BarChart2,
  GitCompare, Minus, Send, Loader2, Copy,
} from 'lucide-react';
import { Hero } from '@/components/sections/Hero';
import { ServicesGrid } from '@/components/sections/ServicesGrid';
import { Trust } from '@/components/sections/Trust';
import { Areas } from '@/components/sections/Areas';
import { FAQ } from '@/components/sections/FAQ';
import { ContactForm } from '@/components/sections/ContactForm';
import { CTABar } from '@/components/sections/CTABar';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CopyVariants {
  concise: string;
  standard: string;
  extended: string;
}

interface BlueprintSection {
  kind: 'Hero' | 'ServicesGrid' | 'ServiceDetail' | 'Trust' | 'Areas' | 'FAQ' | 'ContactForm' | 'CTABar' | 'Testimonial' | 'Gallery' | 'Map';
  props: Record<string, any>;
  copyVariants?: CopyVariants;
}

interface BlueprintPage {
  key: string;
  route: string;
  title: string;
  description: string;
  jsonLd?: object;
  seoMeta: {
    title: string;
    description: string;
    canonical?: string;
    og?: Record<string, any>;
  };
  sections: BlueprintSection[];
  internalLinks?: { label: string; href: string }[];
}

interface BlueprintAsset {
  key: string;
  alt: string;
  suggestedSource?: string;
  placement?: { pageKey: string; sectionKind: string };
}

interface WebsiteBlueprint {
  siteMeta: {
    brand: string;
    uvp: string;
    tone: string;
    primaryCta: string;
    nap: { address: string; phone: string; email?: string };
    license?: string;
    social?: { gbp?: string; fb?: string; ig?: string };
    tracking?: { ga4?: boolean; gtm?: boolean; gsc?: boolean };
  };
  nav: { items: { label: string; href: string }[] };
  footer: { nap: { address: string; phone: string; email?: string }; links: { label: string; href: string }[] };
  pages: BlueprintPage[];
  assets: BlueprintAsset[];
  performance: {
    images: { format: 'webp' | 'avif'; sizes: string[] };
    fonts?: { preloads: string[] };
  };
  generatedAt?: string;
  acceptedVersion?: string;
  userSelections?: Record<string, Record<number, 'concise' | 'standard' | 'extended'>>;
}

interface WebsiteWorkstreamPanelProps {
  client: any;
}

// ─── Section preview renderer ───────────────────────────────────────────────────

function SectionPreview({ section }: { section: BlueprintSection }) {
  switch (section.kind) {
    case 'Hero':        return <Hero {...section.props} />;
    case 'ServicesGrid': return <ServicesGrid {...section.props} />;
    case 'Trust':       return <Trust {...section.props} />;
    case 'Areas':       return <Areas {...section.props} />;
    case 'FAQ':         return <FAQ {...section.props} />;
    case 'ContactForm': return <ContactForm {...section.props} />;
    case 'CTABar':      return <CTABar {...section.props} />;
    default:
      return (
        <div className="bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center text-sm text-gray-500">
          [{section.kind}] section
        </div>
      );
  }
}

// ─── Helper: staleness badge ────────────────────────────────────────────────────

function StaleBadge({ generatedAt }: { generatedAt?: string }) {
  if (!generatedAt) return null;
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  const stale = ageMs > 48 * 60 * 60 * 1000;
  return (
    <Badge variant="outline" className={stale ? 'text-amber-600 border-amber-300' : 'text-green-600 border-green-300'}>
      {stale ? 'Stale' : 'Fresh'} · {format(new Date(generatedAt), 'dd/MM/yyyy')}
    </Badge>
  );
}

// ─── SEO Preserve Tab ─────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  KEEP: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  REBUILD_SAME_URL: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  REDIRECT: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  CONSOLIDATE: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  REVIEW: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
const RISK_COLORS: Record<string, string> = {
  HIGH: 'text-red-600 dark:text-red-400',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
  LOW: 'text-emerald-600 dark:text-emerald-400',
};

function SeoPreserveTab({
  client, orgId, token, blueprint, toast,
}: {
  client: any; orgId: string | null; token: string | null; blueprint: any; toast: any;
}) {
  const [analysing, setAnalysing] = useState(false);
  const [detectingDoorway, setDetectingDoorway] = useState(false);
  const [auditingTech, setAuditingTech] = useState(false);
  const [buildingLinkMap, setBuildingLinkMap] = useState(false);
  const [sitemapUrl, setSitemapUrl] = useState(client.website || client.sourceIntelligence?.website || '');
  const [manualUrls, setManualUrls] = useState('');
  const [ahrefsCsv, setAhrefsCsv] = useState('');
  const [sourceTab, setSourceTab] = useState<'manual' | 'sitemap' | 'ahrefs'>('sitemap');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [editingRedirect, setEditingRedirect] = useState<string | null>(null);
  const [redirectTarget, setRedirectTarget] = useState('');
  const [savingRedirect, setSavingRedirect] = useState(false);
  const ahrefsInputRef = useRef<HTMLInputElement | null>(null);

  const preservation = client.websiteWorkstream?.seoPreservation;
  const pages: Record<string, any> = preservation?.pages || {};
  const redirectMap: Record<string, string> = preservation?.redirectMap || {};
  const defensiveMode = preservation?.defensiveMode ?? true;
  const gbpAlignment = preservation?.gbpAlignment;
  const analysedAt = preservation?.analysedAt;

  const allPages = Object.entries(pages);
  const filteredPages = riskFilter === 'ALL' ? allPages : allPages.filter(([, p]) => p.riskLevel === riskFilter);
  const highRisk = allPages.filter(([, p]) => p.riskLevel === 'HIGH');
  const needsRedirect = allPages.filter(([, p]) => p.recommendedAction === 'REDIRECT' || p.recommendedAction === 'CONSOLIDATE');
  const missingRedirects = needsRedirect.filter(([slug]) => !redirectMap[slug] || redirectMap[slug] === '/');

  const handleAnalyse = async () => {
    if (!orgId || !token) return;
    if (!manualUrls && !sitemapUrl && !ahrefsCsv) {
      toast({ title: 'No data provided', description: 'Add URLs, a sitemap URL, or upload an Ahrefs CSV.', variant: 'destructive' });
      return;
    }
    setAnalysing(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/analyse-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId, manualUrls, sitemapUrl: sourceTab === 'sitemap' ? sitemapUrl : '', ahrefsCsv: sourceTab === 'ahrefs' ? ahrefsCsv : '' }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Analysis failed'); }
      const data = await res.json();
      toast({ title: 'URL analysis complete', description: `${data.pageCount} pages classified — review the table below.` });
    } catch (e: any) {
      toast({ title: 'Analysis failed', description: e.message, variant: 'destructive' });
    } finally {
      setAnalysing(false);
    }
  };

  const handleSaveRedirect = async (slug: string) => {
    if (!orgId || !token || !redirectTarget.trim()) return;
    setSavingRedirect(true);
    try {
      await fetch(`/api/clients/${client.id}/seo-preservation/redirect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId, fromSlug: slug, toPath: redirectTarget.trim() }),
      });
      setEditingRedirect(null);
      setRedirectTarget('');
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingRedirect(false);
    }
  };

  const handleDeleteRedirect = async (slug: string) => {
    if (!orgId || !token) return;
    try {
      await fetch(`/api/clients/${client.id}/seo-preservation/redirect/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleUpdateAction = async (slug: string, field: string, value: string) => {
    if (!orgId || !token) return;
    const existing = pages[slug] || {};
    try {
      await fetch(`/api/clients/${client.id}/seo-preservation/page`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId, slug, updates: { ...existing, [field]: value } }),
      });
    } catch (e: any) {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleDetectDoorway = async () => {
    if (!orgId || !token) return;
    setDetectingDoorway(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/detect-doorway-pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Detection failed'); }
      const data = await res.json();
      if (data.findings?.length === 0) {
        toast({ title: 'All clear', description: 'No doorway page or thin content issues detected.' });
      } else {
        toast({ title: `${data.findings.length} issue${data.findings.length !== 1 ? 's' : ''} found`, description: data.summary, variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Detection failed', description: e.message, variant: 'destructive' });
    } finally {
      setDetectingDoorway(false);
    }
  };

  const handleTechAudit = async () => {
    if (!orgId || !token) return;
    setAuditingTech(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/tech-seo-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Audit failed'); }
      const data = await res.json();
      const variant = data.launchBlocked ? 'destructive' : undefined;
      toast({ title: data.launchBlocked ? 'Launch blocked' : `Audit complete — ${data.passRate}% pass rate`, description: data.launchBlockReason || data.summary, variant });
    } catch (e: any) {
      toast({ title: 'Audit failed', description: e.message, variant: 'destructive' });
    } finally {
      setAuditingTech(false);
    }
  };

  const handleBuildLinkMap = async () => {
    if (!orgId || !token) return;
    setBuildingLinkMap(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/build-link-map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Link map failed'); }
      const data = await res.json();
      toast({
        title: data.orphans?.length > 0 ? `${data.orphans.length} orphan page${data.orphans.length !== 1 ? 's' : ''} found` : 'Link map built',
        description: data.summary,
        variant: data.orphans?.length > 0 ? 'destructive' : undefined,
      });
    } catch (e: any) {
      toast({ title: 'Link map failed', description: e.message, variant: 'destructive' });
    } finally {
      setBuildingLinkMap(false);
    }
  };

  const readAhrefsFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setAhrefsCsv(e.target?.result as string || '');
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">

      {/* Defensive Mode Banner */}
      {defensiveMode && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
          <Shield className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Defensive Rebuild Mode</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">No Google Search Console or Analytics data detected. The AI will take a conservative approach — preserving more URLs and raising caution flags. Connect GSC/GA for more precise recommendations.</p>
          </div>
        </div>
      )}

      {/* URL Ingestion */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">URL Discovery</p>
            <p className="text-xs text-gray-500 mt-0.5">Import the existing site's URLs before rebuilding so the AI can protect what's working.</p>
          </div>
          {analysedAt && (
            <Badge className="text-[10px] bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 shrink-0">
              Last run {format(new Date(analysedAt), 'dd/MM/yyyy')}
            </Badge>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* Source selector */}
          <div className="flex gap-1 border border-gray-200 dark:border-gray-700 rounded-lg p-0.5 bg-gray-50 dark:bg-gray-900 w-fit">
            {(['sitemap', 'manual', 'ahrefs'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSourceTab(tab)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${sourceTab === tab ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                {tab === 'sitemap' ? '🗺 Sitemap URL' : tab === 'manual' ? '✏️ Manual URLs' : '📊 Ahrefs Export'}
              </button>
            ))}
          </div>

          {sourceTab === 'sitemap' && (
            <div className="space-y-2">
              <label className="text-xs text-gray-500">Sitemap URL (e.g. https://example.com.au/sitemap.xml)</label>
              <input
                type="url"
                value={sitemapUrl}
                onChange={e => setSitemapUrl(e.target.value)}
                placeholder="https://yourclientsite.com.au/sitemap.xml"
                className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="input-sitemap-url"
              />
              <p className="text-[11px] text-gray-400">The system will fetch and parse all URLs from the sitemap, then crawl any linked sitemaps.</p>
            </div>
          )}

          {sourceTab === 'manual' && (
            <div className="space-y-2">
              <label className="text-xs text-gray-500">Paste full URLs (one per line)</label>
              <textarea
                value={manualUrls}
                onChange={e => setManualUrls(e.target.value)}
                rows={6}
                placeholder="https://example.com.au/&#10;https://example.com.au/services/plumbing&#10;https://example.com.au/contact"
                className="w-full text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                data-testid="input-manual-urls"
              />
            </div>
          )}

          {sourceTab === 'ahrefs' && (
            <div className="space-y-2">
              <label className="text-xs text-gray-500">Upload Ahrefs Top Pages or Site Explorer export (CSV)</label>
              <div
                className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => ahrefsInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readAhrefsFile(f); }}
                data-testid="drop-ahrefs-csv"
              >
                <input ref={ahrefsInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) readAhrefsFile(f); e.target.value = ''; }} />
                {ahrefsCsv ? (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-2">
                    <CheckCircle className="h-4 w-4" /> CSV loaded — {ahrefsCsv.split('\n').length - 1} rows
                    <button className="ml-2 text-gray-400 hover:text-red-500" onClick={e => { e.stopPropagation(); setAhrefsCsv(''); }}><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-7 w-7 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Drop Ahrefs CSV here or click to browse</p>
                    <p className="text-[11px] text-gray-400 mt-1">Export from Ahrefs → Site Explorer → Top Pages → Export</p>
                  </>
                )}
              </div>
              <p className="text-[11px] text-gray-400">Coming soon: Google Search Console and Google Analytics imports</p>
            </div>
          )}

          {/* Also always show manual textarea as supplement */}
          {sourceTab !== 'manual' && (
            <details className="text-xs text-gray-500 cursor-pointer">
              <summary className="hover:text-gray-700 dark:hover:text-gray-300">+ Add manual URLs as well</summary>
              <textarea
                value={manualUrls}
                onChange={e => setManualUrls(e.target.value)}
                rows={4}
                placeholder="https://example.com.au/page-1&#10;https://example.com.au/page-2"
                className="mt-2 w-full text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </details>
          )}

          <Button
            size="sm"
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleAnalyse}
            disabled={analysing}
            data-testid="btn-analyse-urls"
          >
            {analysing
              ? <><Cpu className="h-3.5 w-3.5 animate-spin" /> Analysing URLs…</>
              : <><Shield className="h-3.5 w-3.5" /> {preservation ? 'Re-run Analysis' : 'Analyse & Classify URLs'}</>
            }
          </Button>
          {analysing && <p className="text-[11px] text-amber-600 dark:text-amber-400">Fetching sitemap and classifying pages with AI — this takes 20–60 seconds…</p>}
        </div>
      </div>

      {/* Results only shown once analysis has run */}
      {preservation && (
        <>
          {/* High risk alert */}
          {highRisk.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-800 dark:text-red-200">{highRisk.length} HIGH RISK page{highRisk.length !== 1 ? 's' : ''} detected</p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">These pages carry significant ranking, backlink, or conversion value. Changing their URLs without 301 redirects will damage organic performance.</p>
              </div>
            </div>
          )}

          {/* Summary row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Total pages', value: allPages.length, color: 'text-gray-700 dark:text-gray-300' },
              { label: 'High risk', value: highRisk.length, color: highRisk.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500' },
              { label: 'Need redirect', value: needsRedirect.length, color: needsRedirect.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500' },
              { label: 'Missing dest.', value: missingRedirects.length, color: missingRedirects.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Protected Pages Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Protected Pages</p>
              <div className="flex gap-1">
                {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRiskFilter(r)}
                    className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${riskFilter === r ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-500 hover:border-blue-400'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
                <span>URL / Keyword</span>
                <span>Type</span>
                <span>Risk</span>
                <span>Action</span>
              </div>
              {filteredPages.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">No pages at this risk level.</div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
                  {filteredPages.map(([slug, page]) => (
                    <div key={slug} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-3 py-2.5 items-start hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors" data-testid={`preserve-row-${slug}`}>
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-blue-600 dark:text-blue-400 truncate">/{slug || ''}</p>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">{page.targetKeyword}</p>
                        {page.notes && <p className="text-[11px] text-gray-400 mt-0.5 italic leading-tight">{page.notes}</p>}
                      </div>
                      <span className="text-[11px] text-gray-600 dark:text-gray-400 capitalize mt-0.5">{(page.pageType || '').replace(/_/g, ' ')}</span>
                      <span className={`text-[11px] font-semibold mt-0.5 ${RISK_COLORS[page.riskLevel] || 'text-gray-500'}`}>{page.riskLevel}</span>
                      <select
                        value={page.recommendedAction || 'REVIEW'}
                        onChange={e => handleUpdateAction(slug, 'recommendedAction', e.target.value)}
                        className={`text-[11px] font-medium rounded px-1.5 py-0.5 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 ${ACTION_COLORS[page.recommendedAction] || ACTION_COLORS.REVIEW}`}
                        data-testid={`action-select-${slug}`}
                      >
                        {['KEEP', 'REBUILD_SAME_URL', 'REDIRECT', 'CONSOLIDATE', 'REVIEW'].map(a => (
                          <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Redirect Map */}
          {needsRedirect.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">301 Redirect Map</p>
                {missingRedirects.length > 0 && (
                  <Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {missingRedirects.length} destination{missingRedirects.length !== 1 ? 's' : ''} need setting
                  </Badge>
                )}
              </div>
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="grid grid-cols-[2fr_16px_2fr_auto] gap-2 items-center px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <span>From (old URL)</span><span></span><span>To (new path)</span><span></span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {needsRedirect.map(([slug, page]) => {
                    const dest = redirectMap[slug];
                    const isEditing = editingRedirect === slug;
                    return (
                      <div key={slug} className="grid grid-cols-[2fr_16px_2fr_auto] gap-2 items-center px-3 py-2.5" data-testid={`redirect-row-${slug}`}>
                        <div>
                          <p className="text-xs font-mono text-blue-600 dark:text-blue-400">/{slug}</p>
                          <p className="text-[11px] text-gray-400">{page.targetKeyword}</p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        {isEditing ? (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={redirectTarget}
                              onChange={e => setRedirectTarget(e.target.value)}
                              placeholder="/new-page-url"
                              autoFocus
                              className="flex-1 text-xs border border-blue-400 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none"
                            />
                            <button onClick={() => handleSaveRedirect(slug)} disabled={savingRedirect} className="text-[11px] bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700">
                              {savingRedirect ? '…' : 'Save'}
                            </button>
                            <button onClick={() => { setEditingRedirect(null); setRedirectTarget(''); }} className="text-[11px] text-gray-400 hover:text-gray-700 px-1">✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingRedirect(slug); setRedirectTarget(dest || '/'); }}
                            className={`text-xs text-left w-full rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${dest && dest !== '/' ? 'text-gray-900 dark:text-white font-mono' : 'text-amber-500 italic'}`}
                            data-testid={`redirect-dest-${slug}`}
                          >
                            {dest && dest !== '/' ? dest : '⚠ Set destination →'}
                          </button>
                        )}
                        <button onClick={() => handleDeleteRedirect(slug)} className="text-gray-300 hover:text-red-500 transition-colors p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[11px] text-gray-400">These 301 redirects must be configured on your web host or CDN before DNS cutover.</p>
            </div>
          )}

          {/* GBP Alignment Panel */}
          {gbpAlignment && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">GBP Alignment</p>
                </div>
                <div className={`text-2xl font-bold ${gbpAlignment.score >= 80 ? 'text-emerald-600' : gbpAlignment.score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                  {gbpAlignment.score}%
                </div>
              </div>
              <div className="p-4 space-y-3">
                {/* Score bar */}
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${gbpAlignment.score >= 80 ? 'bg-emerald-500' : gbpAlignment.score >= 50 ? 'bg-amber-400' : 'bg-red-500'}`}
                    style={{ width: `${gbpAlignment.score}%` }}
                  />
                </div>
                {/* Checks */}
                <div className="space-y-1.5">
                  {(gbpAlignment.checks || []).map((check: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      {check.pass
                        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        : <X className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                      }
                      <span className={check.pass ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'}>{check.label}</span>
                    </div>
                  ))}
                </div>
                {/* Gaps */}
                {gbpAlignment.gaps?.length > 0 && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">GBP Services without matching pages:</p>
                    <div className="flex flex-wrap gap-1">
                      {gbpAlignment.gaps.map((g: string, i: number) => (
                        <span key={i} className="text-[11px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Doorway Page Detection (Stage 2) ── */}
      {(() => {
        const localPageCount = Object.keys(client.websiteWorkstream?.generatedSite?.localPages || {}).length;
        const doorway = client.websiteWorkstream?.seoPreservation?.doorwayDetection;
        const ISSUE_COLORS: Record<string, string> = {
          THIN_CONTENT: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          DOORWAY_RISK: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
          DUPLICATION_RISK: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
          KEYWORD_STUFFING: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
        };
        const SEV_COLOR: Record<string, string> = { HIGH: 'text-red-600 dark:text-red-400', MEDIUM: 'text-amber-600 dark:text-amber-400', LOW: 'text-gray-500' };

        return (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Local Page Quality Check</p>
                  <p className="text-xs text-gray-500 mt-0.5">Detects thin content, doorway pages, and duplication risks across your generated local pages.</p>
                </div>
              </div>
              {doorway && (
                <Badge className={`text-[10px] shrink-0 ${doorway.riskLevel === 'HIGH' ? 'bg-red-100 text-red-700' : doorway.riskLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : doorway.riskLevel === 'NONE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  {doorway.riskLevel === 'NONE' ? '✓ All clear' : `${doorway.riskLevel} risk`}
                </Badge>
              )}
            </div>
            <div className="p-4 space-y-3">
              {localPageCount === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No local pages generated yet. Build local pages in the Local tab first.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{localPageCount} local page{localPageCount !== 1 ? 's' : ''} ready to analyse</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 h-7 text-xs"
                      onClick={handleDetectDoorway}
                      disabled={detectingDoorway}
                      data-testid="btn-detect-doorway"
                    >
                      {detectingDoorway
                        ? <><Cpu className="h-3 w-3 animate-spin" /> Scanning…</>
                        : <><ListChecks className="h-3 w-3" /> {doorway ? 'Re-run Check' : 'Run Quality Check'}</>
                      }
                    </Button>
                  </div>

                  {doorway && (
                    <div className="space-y-3">
                      {/* Summary */}
                      <p className="text-xs text-gray-600 dark:text-gray-400 italic">{doorway.summary}</p>

                      {/* Findings table */}
                      {doorway.findings?.length > 0 ? (
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          <div className="grid grid-cols-[2fr_2fr_1fr] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
                            <span>Page</span><span>Issues</span><span>Severity</span>
                          </div>
                          <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
                            {doorway.findings.map((f: any, i: number) => (
                              <div key={i} className="grid grid-cols-[2fr_2fr_1fr] gap-2 px-3 py-2.5 items-start" data-testid={`doorway-row-${f.slug}`}>
                                <div>
                                  <p className="text-xs font-mono text-blue-600 dark:text-blue-400 truncate">/{f.slug}</p>
                                  {f.wordCount > 0 && <p className="text-[11px] text-gray-400">{f.wordCount} words</p>}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {(f.issues || []).map((issue: string) => (
                                    <span key={issue} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ISSUE_COLORS[issue] || 'bg-gray-100 text-gray-600'}`}>{issue.replace(/_/g, ' ')}</span>
                                  ))}
                                  {f.fix && <p className="text-[11px] text-gray-400 mt-1 w-full">{f.fix}</p>}
                                </div>
                                <span className={`text-[11px] font-semibold mt-0.5 ${SEV_COLOR[f.severity] || 'text-gray-500'}`}>{f.severity}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle className="h-4 w-4" /> All local pages passed quality checks — no issues found.
                        </div>
                      )}

                      {/* Strategic recommendations */}
                      {doorway.recommendations?.length > 0 && (
                        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3 py-2.5 space-y-1.5">
                          <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">Strategic Recommendations</p>
                          {doorway.recommendations.map((r: string, i: number) => (
                            <div key={i} className="flex items-start gap-1.5 text-[11px] text-blue-600 dark:text-blue-400">
                              <span className="text-blue-400 shrink-0 mt-0.5">→</span>
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {doorway.analysedAt && (
                        <p className="text-[11px] text-gray-400">Last checked {format(new Date(doorway.analysedAt), 'dd/MM/yyyy HH:mm')}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Technical SEO Audit + Pre-Launch Gate (Stage 3) ── */}
      {(() => {
        const mainPageCount = Object.keys(client.websiteWorkstream?.generatedSite?.pages || {}).length;
        const localPageCount = Object.keys(client.websiteWorkstream?.generatedSite?.localPages || {}).length;
        const totalPageCount = mainPageCount + localPageCount;
        const techAudit = client.websiteWorkstream?.seoPreservation?.techAudit;
        const ISSUE_LABEL: Record<string, string> = {
          MISSING_TITLE: 'Missing title',
          TITLE_TOO_SHORT: 'Title < 30 chars',
          TITLE_TOO_LONG: 'Title > 60 chars',
          MISSING_META_DESC: 'Missing meta description',
          META_DESC_TOO_SHORT: 'Description < 70 chars',
          META_DESC_TOO_LONG: 'Description > 160 chars',
          MISSING_H1: 'No H1 tag',
          MULTIPLE_H1: 'Multiple H1 tags',
          MISSING_CANONICAL: 'No canonical tag',
          MISSING_SCHEMA: 'No JSON-LD schema',
          MISSING_VIEWPORT: 'No viewport meta',
          MISSING_OG_TAGS: 'No Open Graph tags',
        };
        const CRITICAL = new Set(['MISSING_TITLE', 'MISSING_META_DESC', 'MISSING_H1', 'MISSING_VIEWPORT']);

        return (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Technical SEO Audit</p>
                  <p className="text-xs text-gray-500 mt-0.5">Scans all generated pages for meta tags, H1, canonical, schema, and Open Graph compliance.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {techAudit && (
                  <Badge className={`text-[10px] shrink-0 ${techAudit.launchBlocked ? 'bg-red-100 text-red-700' : techAudit.passRate >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {techAudit.launchBlocked ? '🚫 Launch blocked' : `${techAudit.passRate}% pass`}
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-4 space-y-3">
              {totalPageCount === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No pages generated yet. Build pages in the Pages or Local tab first.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{totalPageCount} page{totalPageCount !== 1 ? 's' : ''} ready to audit ({mainPageCount} main + {localPageCount} local)</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 h-7 text-xs"
                      onClick={handleTechAudit}
                      disabled={auditingTech}
                      data-testid="btn-tech-audit"
                    >
                      {auditingTech
                        ? <><Cpu className="h-3 w-3 animate-spin" /> Auditing…</>
                        : <><TrendingUp className="h-3 w-3" /> {techAudit ? 'Re-run Audit' : 'Run Technical Audit'}</>
                      }
                    </Button>
                  </div>

                  {techAudit && (
                    <div className="space-y-3">
                      {/* Pre-launch gate */}
                      {techAudit.launchBlocked && (
                        <div className="flex items-start gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3">
                          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-red-800 dark:text-red-200">Pre-Launch Gate: BLOCKED</p>
                            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{techAudit.launchBlockReason}</p>
                            {techAudit.blockingRedirects?.length > 0 && (
                              <div className="mt-2 space-y-0.5">
                                {techAudit.blockingRedirects.map((r: any, i: number) => (
                                  <p key={i} className="text-[11px] text-red-600 dark:text-red-400 font-mono">/{r.slug} — {r.keyword}</p>
                                ))}
                              </div>
                            )}
                            <p className="text-[11px] text-red-500 mt-1.5">Fix these issues in the Preserve tab, then re-run the audit.</p>
                          </div>
                        </div>
                      )}

                      {!techAudit.launchBlocked && (
                        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle className="h-4 w-4" /> Pre-launch gate: CLEAR — {techAudit.summary}
                        </div>
                      )}

                      {/* Metrics row */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Avg SEO score', value: `${techAudit.avgScore}%`, color: techAudit.avgScore >= 80 ? 'text-emerald-600' : techAudit.avgScore >= 60 ? 'text-amber-500' : 'text-red-500' },
                          { label: 'Fully passing', value: `${Math.round((techAudit.passRate / 100) * (techAudit.pages?.length || 0))} / ${techAudit.pages?.length || 0}`, color: 'text-gray-700 dark:text-gray-300' },
                          { label: 'Critical issues', value: techAudit.criticalIssues, color: techAudit.criticalIssues > 0 ? 'text-red-600' : 'text-emerald-600' },
                        ].map(m => (
                          <div key={m.label} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-center">
                            <div className={`text-base font-bold ${m.color}`}>{m.value}</div>
                            <div className="text-[11px] text-gray-500">{m.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Per-page results */}
                      {(techAudit.pages || []).filter((p: any) => p.issues?.length > 0).length > 0 && (
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                          <div className="grid grid-cols-[2fr_3fr_1fr] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
                            <span>Page</span><span>Issues</span><span>Score</span>
                          </div>
                          <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-72 overflow-y-auto">
                            {(techAudit.pages || []).filter((p: any) => p.issues?.length > 0).map((p: any) => (
                              <div key={p.slug} className="grid grid-cols-[2fr_3fr_1fr] gap-2 px-3 py-2.5 items-start" data-testid={`tech-audit-row-${p.slug}`}>
                                <div>
                                  <p className="text-xs font-mono text-blue-600 dark:text-blue-400 truncate">/{p.slug}</p>
                                  <Badge className="text-[10px] mt-0.5 bg-gray-100 text-gray-500 dark:bg-gray-800">{p.source}</Badge>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {(p.issues || []).map((issue: string) => (
                                    <span key={issue} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CRITICAL.has(issue) ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                                      {ISSUE_LABEL[issue] || issue}
                                    </span>
                                  ))}
                                </div>
                                <div className={`text-xs font-bold mt-0.5 ${p.score >= 80 ? 'text-emerald-600' : p.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{p.score}%</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {techAudit.analysedAt && (
                        <p className="text-[11px] text-gray-400">Audited {format(new Date(techAudit.analysedAt), 'dd/MM/yyyy HH:mm')}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Internal Link Map (Stage 4) ── */}
      {(() => {
        const totalPageCount = Object.keys(client.websiteWorkstream?.generatedSite?.pages || {}).length + Object.keys(client.websiteWorkstream?.generatedSite?.localPages || {}).length;
        const linkMap = client.websiteWorkstream?.seoPreservation?.linkMap;

        return (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Internal Link Map</p>
                  <p className="text-xs text-gray-500 mt-0.5">Detects orphan pages, weak linking, and generates AI recommendations to strengthen link equity.</p>
                </div>
              </div>
              {linkMap && (
                <Badge className={`text-[10px] shrink-0 ${linkMap.orphans?.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {linkMap.orphans?.length > 0 ? `${linkMap.orphans.length} orphan${linkMap.orphans.length !== 1 ? 's' : ''}` : '✓ No orphans'}
                </Badge>
              )}
            </div>
            <div className="p-4 space-y-3">
              {totalPageCount === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No pages generated yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{totalPageCount} page{totalPageCount !== 1 ? 's' : ''} to map</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 h-7 text-xs"
                      onClick={handleBuildLinkMap}
                      disabled={buildingLinkMap}
                      data-testid="btn-build-link-map"
                    >
                      {buildingLinkMap
                        ? <><Cpu className="h-3 w-3 animate-spin" /> Mapping…</>
                        : <><ArrowRight className="h-3 w-3" /> {linkMap ? 'Re-build Map' : 'Build Link Map'}</>
                      }
                    </Button>
                  </div>

                  {linkMap && (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-600 dark:text-gray-400 italic">{linkMap.summary}</p>

                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Total links', value: linkMap.totalLinks || 0, color: 'text-gray-700 dark:text-gray-300' },
                          { label: 'Orphan pages', value: linkMap.orphans?.length || 0, color: linkMap.orphans?.length > 0 ? 'text-amber-600' : 'text-emerald-600' },
                          { label: 'Weakly linked', value: linkMap.weak?.length || 0, color: linkMap.weak?.length > 0 ? 'text-amber-500' : 'text-emerald-600' },
                        ].map(m => (
                          <div key={m.label} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-center">
                            <div className={`text-base font-bold ${m.color}`}>{m.value}</div>
                            <div className="text-[11px] text-gray-500">{m.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Orphan page list */}
                      {linkMap.orphans?.length > 0 && (
                        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2.5 space-y-1.5">
                          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">Orphan Pages (no inbound links)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {linkMap.orphans.map((slug: string) => (
                              <span key={slug} className="text-[11px] font-mono bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">/{slug}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI Link Recommendations */}
                      {linkMap.recommendations?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">AI Link Recommendations</p>
                          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <div className="grid grid-cols-[2fr_2fr_2fr] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700">
                              <span>From page</span><span>Link to</span><span>Anchor text / reason</span>
                            </div>
                            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-48 overflow-y-auto">
                              {linkMap.recommendations.map((r: any, i: number) => (
                                <div key={i} className="grid grid-cols-[2fr_2fr_2fr] gap-2 px-3 py-2 items-start text-xs">
                                  <span className="font-mono text-blue-600 dark:text-blue-400 truncate">/{r.fromSlug}</span>
                                  <span className="font-mono text-emerald-600 dark:text-emerald-400 truncate">/{r.toSlug}</span>
                                  <div>
                                    <p className="text-gray-700 dark:text-gray-300 font-medium">"{r.anchorText}"</p>
                                    <p className="text-[11px] text-gray-400">{r.reason}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-400">Add these links manually in the Pages tab by editing page content, or request an AI content revision.</p>
                        </div>
                      )}

                      {linkMap.analysedAt && (
                        <p className="text-[11px] text-gray-400">Mapped {format(new Date(linkMap.analysedAt), 'dd/MM/yyyy HH:mm')}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {!preservation && !analysing && (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center space-y-3">
          <Shield className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto" />
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No preservation analysis yet</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">Import the existing site's URLs above so the AI can identify high-value pages, assess risk, and create a redirect map before any rebuild begins.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Asset Upload Tab ──────────────────────────────────────────────────────────

function AssetUploadTab({
  client, orgId, token, blueprint, toast,
}: {
  client: any; orgId: string | null; token: string | null; blueprint: WebsiteBlueprint | null; toast: any;
}) {
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const uploadedAssets: Record<string, any> = client.websiteWorkstream?.assets || {};
  const gallery: any[] = uploadedAssets._gallery || [];
  const uploadedCount = Object.keys(uploadedAssets).filter(k => k !== '_gallery').length;
  const totalSlots = blueprint?.assets?.length || 0;

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleUpload = async (file: File, assetKey: string, isGallery = false) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Images only', description: 'Please upload an image file (JPG, PNG, WebP, GIF).', variant: 'destructive' });
      return;
    }
    const key = isGallery ? '_gallery' : assetKey;
    setUploading(prev => ({ ...prev, [key]: true }));
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch(`/api/clients/${client.id}/upload-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId, assetKey, dataUrl, fileName: file.name, mimeType: file.type, isGallery }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      toast({ title: isGallery ? 'Added to gallery' : 'Asset uploaded', description: file.name });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleRemove = async (assetKey: string) => {
    setUploading(prev => ({ ...prev, [assetKey]: true }));
    try {
      await fetch(`/api/clients/${client.id}/upload-asset/${encodeURIComponent(assetKey)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      toast({ title: 'Asset removed' });
    } catch (e: any) {
      toast({ title: 'Remove failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(prev => ({ ...prev, [assetKey]: false }));
    }
  };

  const handleRemoveGallery = async (index: number) => {
    setUploading(prev => ({ ...prev, [`_gallery_${index}`]: true }));
    try {
      await fetch(`/api/clients/${client.id}/upload-gallery/${index}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      toast({ title: 'Removed from gallery' });
    } catch (e: any) {
      toast({ title: 'Remove failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(prev => ({ ...prev, [`_gallery_${index}`]: false }));
    }
  };

  const onDrop = (e: React.DragEvent, assetKey: string, isGallery = false) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file, assetKey, isGallery);
  };

  return (
    <div className="space-y-5">
      {/* Header summary */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Media Assets</p>
          <p className="text-xs text-gray-500 mt-0.5">Upload images for each asset slot defined in the Blueprint, plus any additional photos for the gallery.</p>
        </div>
        <Badge className={`text-[11px] ${uploadedCount === totalSlots && totalSlots > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {uploadedCount}/{totalSlots} uploaded
        </Badge>
      </div>

      {/* Blueprint asset slots */}
      {(!blueprint?.assets || blueprint.assets.length === 0) ? (
        <div className="text-sm text-gray-400 italic">No asset slots defined in blueprint yet.</div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Blueprint Slots</div>
          {blueprint.assets.map((asset, i) => {
            const uploaded = uploadedAssets[asset.key];
            const isUploading = uploading[asset.key];
            const isDragTarget = dragOver === asset.key;
            return (
              <div
                key={asset.key}
                className={`border rounded-xl overflow-hidden transition-all ${isDragTarget ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-200 dark:border-gray-700'}`}
                data-testid={`asset-slot-${asset.key}`}
                onDragOver={e => { e.preventDefault(); setDragOver(asset.key); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => onDrop(e, asset.key)}
              >
                <div className="flex items-start gap-3 p-3">
                  {/* Thumbnail or placeholder */}
                  <div className="shrink-0 w-16 h-16 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                    {uploaded?.dataUrl ? (
                      <img src={uploaded.dataUrl} alt={asset.alt} className="w-full h-full object-cover" />
                    ) : (
                      <Image className="h-6 w-6 text-gray-300" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{asset.key}</span>
                      {uploaded ? (
                        <Badge className="text-[10px] h-4 px-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 shrink-0">
                          <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Uploaded
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-amber-600 border-amber-300 shrink-0">To source</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 leading-tight">{asset.alt}</p>
                    {asset.suggestedSource && (
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">💡 {asset.suggestedSource}</p>
                    )}
                    {asset.placement && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{asset.placement.pageKey} → {asset.placement.sectionKind}</p>
                    )}
                    {uploaded?.fileName && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">📎 {uploaded.fileName} · {uploaded.uploadedAt ? format(new Date(uploaded.uploadedAt), 'dd/MM/yyyy') : ''}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 shrink-0">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={el => { fileInputRefs.current[asset.key] = el; }}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file, asset.key);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => fileInputRefs.current[asset.key]?.click()}
                      disabled={isUploading}
                      data-testid={`btn-upload-asset-${asset.key}`}
                    >
                      {isUploading ? <Cpu className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {uploaded ? 'Replace' : 'Upload'}
                    </Button>
                    {uploaded && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleRemove(asset.key)}
                        disabled={isUploading}
                        data-testid={`btn-remove-asset-${asset.key}`}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>

                {/* Drag hint */}
                {isDragTarget && (
                  <div className="py-2 text-center text-xs text-blue-600 font-medium border-t border-blue-200 bg-blue-50 dark:bg-blue-950/30">
                    Drop image here
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Performance spec */}
      {blueprint?.performance && (
        <Section title="Performance Spec">
          <div className="space-y-1 text-xs text-gray-700 dark:text-gray-300">
            <div><span className="font-medium">Format:</span> {blueprint.performance.images.format}</div>
            <div><span className="font-medium">Sizes:</span> {blueprint.performance.images.sizes.join(', ')}</div>
            {blueprint.performance.fonts?.preloads?.length > 0 && (
              <div><span className="font-medium">Font preloads:</span> {blueprint.performance.fonts.preloads.join(', ')}</div>
            )}
          </div>
        </Section>
      )}

      {/* Gallery — freeform uploads */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Additional Media Gallery</div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploading['_gallery']}
            data-testid="btn-add-gallery-image"
          >
            {uploading['_gallery'] ? <Cpu className="h-3 w-3 animate-spin" /> : <Image className="h-3 w-3" />}
            Add Image
          </Button>
        </div>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          ref={galleryInputRef}
          onChange={async e => {
            const files = Array.from(e.target.files || []);
            for (const file of files) await handleUpload(file, '_gallery', true);
            e.target.value = '';
          }}
        />

        {gallery.length === 0 ? (
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${dragOver === '_gallery' ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-200 dark:border-gray-700'}`}
            onDragOver={e => { e.preventDefault(); setDragOver('_gallery'); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => onDrop(e, '_gallery', true)}
          >
            <Image className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-500">Drag photos here or click <strong>Add Image</strong></p>
            <p className="text-[11px] text-gray-400 mt-1">Hero photos, team shots, work examples — max 5 MB each</p>
          </div>
        ) : (
          <div
            className={`grid grid-cols-3 gap-2 p-3 border-2 border-dashed rounded-xl transition-all ${dragOver === '_gallery' ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-200 dark:border-gray-700'}`}
            onDragOver={e => { e.preventDefault(); setDragOver('_gallery'); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => onDrop(e, '_gallery', true)}
          >
            {gallery.map((img, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 aspect-square bg-gray-50" data-testid={`gallery-img-${idx}`}>
                <img src={img.dataUrl} alt={img.fileName} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onClick={() => handleRemoveGallery(idx)}
                    disabled={uploading[`_gallery_${idx}`]}
                    className="text-white text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
                    data-testid={`btn-remove-gallery-${idx}`}
                  >
                    {uploading[`_gallery_${idx}`] ? '…' : 'Remove'}
                  </button>
                </div>
                <p className="absolute bottom-0 left-0 right-0 text-[10px] text-white bg-black/60 px-1.5 py-0.5 truncate">{img.fileName}</p>
              </div>
            ))}
            {/* Drop target at end */}
            <div className="aspect-square border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => galleryInputRef.current?.click()}>
              <Image className="h-5 w-5 text-gray-300" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SEO Compare Tab ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: any }> = {
  PRESERVED: { label: 'Preserved', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', icon: CheckCircle },
  IMPROVED:  { label: 'Improved',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', icon: TrendingUp },
  NEW:       { label: 'New',       cls: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300', icon: Zap },
  REDIRECTED:{ label: 'Redirected',cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', icon: ArrowRight },
  AT_RISK:   { label: 'At Risk',   cls: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300', icon: AlertTriangle },
};

function SeoCompareTab({
  client, orgId, token, toast,
}: {
  client: any; orgId: string | null; token: string | null; toast: any;
}) {
  const [crawling, setCrawling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showCurrentSnapshot, setShowCurrentSnapshot] = useState(false);
  const [showNewSnapshot, setShowNewSnapshot] = useState(false);

  const ww = client.websiteWorkstream || {};
  const crawl = ww.currentSiteCrawl;
  const comparison = ww.seoComparison;
  const techAudit = ww.seoPreservation?.techAudit;
  const generatedSite = ww.generatedSite;
  const hasGeneratedSite = !!(generatedSite?.pages && Object.keys(generatedSite.pages).length > 0);

  const handleCrawl = async () => {
    if (!orgId || !token) return;
    setCrawling(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/crawl-existing-site`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Crawl failed'); }
      const data = await res.json();
      toast({ title: `Existing site crawled`, description: `${data.totalPages} pages captured from ${data.domain}` });
    } catch (e: any) {
      toast({ title: 'Crawl failed', description: e.message, variant: 'destructive' });
    } finally {
      setCrawling(false);
    }
  };

  const handleGenerateComparison = async () => {
    if (!orgId || !token) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/generate-seo-comparison`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Comparison failed'); }
      const data = await res.json();
      toast({ title: 'SEO Comparison complete', description: `Confidence: ${data.confidenceScore}% · Risk: ${data.riskScore}%` });
    } catch (e: any) {
      toast({ title: 'Comparison failed', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const filteredPages = (comparison?.pageComparisons || []).filter((p: any) =>
    statusFilter === 'ALL' || p.status === statusFilter
  );

  const confidenceColor = !comparison ? 'text-gray-400' :
    comparison.confidenceScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
    comparison.confidenceScore >= 60 ? 'text-amber-500' : 'text-red-500';

  const riskColor = !comparison ? 'text-gray-400' :
    comparison.riskScore <= 20 ? 'text-emerald-600 dark:text-emerald-400' :
    comparison.riskScore <= 45 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="space-y-5">

      {/* Step 1: Crawl existing site */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold ${crawl ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'}`}>1</div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Capture Current Site SEO</p>
            {crawl && <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded">{crawl.totalPages} pages crawled</span>}
          </div>
          <Button
            size="sm"
            variant={crawl ? 'outline' : 'default'}
            className={`h-7 text-xs gap-1.5 ${!crawl ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
            onClick={handleCrawl}
            disabled={crawling}
            data-testid="btn-crawl-existing-site"
          >
            {crawling ? <><Cpu className="h-3 w-3 animate-spin" /> Crawling…</> : <><RefreshCw className="h-3 w-3" />{crawl ? 'Re-crawl' : 'Crawl Existing Site'}</>}
          </Button>
        </div>
        {crawl && (
          <div className="px-4 py-3 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Pages found', value: crawl.totalPages, color: 'text-gray-700 dark:text-gray-300' },
                { label: 'With title', value: `${crawl.pagesWithTitle}/${crawl.totalPages}`, color: crawl.pagesWithTitle === crawl.totalPages ? 'text-emerald-600' : 'text-amber-500' },
                { label: 'With meta', value: `${crawl.pagesWithMeta}/${crawl.totalPages}`, color: crawl.pagesWithMeta === crawl.totalPages ? 'text-emerald-600' : 'text-amber-500' },
                { label: 'Schema', value: `${crawl.schemaCount}/${crawl.totalPages}`, color: crawl.schemaCount > 0 ? 'text-blue-600' : 'text-red-500' },
              ].map(s => (
                <div key={s.label} className="border border-gray-100 dark:border-gray-800 rounded-lg p-2 text-center">
                  <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {crawl.hasSitemap ? <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">✓ Sitemap found</span> : <span className="text-[11px] bg-red-100 text-red-600 px-2 py-0.5 rounded">✗ No sitemap detected</span>}
              {crawl.hasRobots ? <span className="text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">✓ robots.txt found</span> : <span className="text-[11px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded">⚠ No robots.txt</span>}
              <span className="text-[11px] text-gray-400">Last crawled {format(new Date(crawl.crawledAt), 'dd/MM/yyyy HH:mm')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Generate comparison */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold ${comparison ? 'bg-emerald-500 text-white' : crawl && hasGeneratedSite ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Generate SEO Comparison</p>
            {comparison && (
              <span className="text-[10px] text-gray-400">Last run {format(new Date(comparison.generatedAt), 'dd/MM/yyyy HH:mm')}</span>
            )}
          </div>
          <Button
            size="sm"
            className={`h-7 text-xs gap-1.5 ${comparison ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
            variant={comparison ? 'outline' : 'default'}
            onClick={handleGenerateComparison}
            disabled={generating || (!crawl && !ww.seoPreservation) || !hasGeneratedSite}
            data-testid="btn-generate-seo-comparison"
          >
            {generating ? <><Cpu className="h-3 w-3 animate-spin" /> Comparing…</> : <><GitCompare className="h-3 w-3" />{comparison ? 'Re-compare' : 'Run Comparison'}</>}
          </Button>
        </div>
        {!hasGeneratedSite && (
          <div className="px-4 py-2">
            <p className="text-[11px] text-amber-600 dark:text-amber-400">Build the site first (Pages tab → Build Site) before running a comparison.</p>
          </div>
        )}
      </div>

      {/* Comparison results */}
      {comparison && (
        <div className="space-y-4">

          {/* Score strip */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`border rounded-xl p-4 text-center space-y-1 ${comparison.confidenceScore >= 80 ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : comparison.confidenceScore >= 60 ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'}`}>
              <div className="flex items-center justify-center gap-1.5">
                <TrendingUp className={`h-4 w-4 ${confidenceColor}`} />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">SEO Confidence</span>
              </div>
              <div className={`text-3xl font-black ${confidenceColor}`}>{comparison.confidenceScore}%</div>
              <Badge className={`text-[10px] ${comparison.confidenceScore >= 80 ? 'bg-emerald-100 text-emerald-700' : comparison.confidenceScore >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{comparison.confidenceLabel}</Badge>
              <p className="text-[11px] text-gray-500">How safe it is to launch</p>
            </div>
            <div className={`border rounded-xl p-4 text-center space-y-1 ${comparison.riskScore <= 20 ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : comparison.riskScore <= 45 ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20'}`}>
              <div className="flex items-center justify-center gap-1.5">
                <AlertTriangle className={`h-4 w-4 ${riskColor}`} />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">SEO Risk</span>
              </div>
              <div className={`text-3xl font-black ${riskColor}`}>{comparison.riskScore}%</div>
              <Badge className={`text-[10px] ${comparison.riskScore <= 20 ? 'bg-emerald-100 text-emerald-700' : comparison.riskScore <= 45 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{comparison.riskLabel}</Badge>
              <p className="text-[11px] text-gray-500">Probability of ranking loss</p>
            </div>
          </div>

          {/* Launch gate */}
          {comparison.launchReady ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5">
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">SEO launch gate CLEAR — safe to proceed</p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-2.5">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-800 dark:text-red-200">SEO launch gate: NOT READY</p>
                {comparison.riskWarnings?.map((w: string, i: number) => (
                  <p key={i} className="text-[11px] text-red-700 dark:text-red-300 mt-0.5">• {w}</p>
                ))}
              </div>
            </div>
          )}

          {/* Status distribution */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Page Status Distribution</p>
            <div className="grid grid-cols-5 gap-1.5">
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const count = comparison.statusCounts?.[key] || 0;
                const Icon = cfg.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(statusFilter === key ? 'ALL' : key)}
                    className={`rounded-lg p-2.5 text-center border transition-all ${statusFilter === key ? `${cfg.cls} border-current` : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                    data-testid={`filter-status-${key}`}
                  >
                    <Icon className="h-3.5 w-3.5 mx-auto mb-1" />
                    <div className="text-base font-bold">{count}</div>
                    <div className="text-[10px] leading-tight">{cfg.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Before vs After site-level stats */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Site-Level Comparison</p>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {[
                { label: 'Total pages', old: comparison.oldStats?.pageCount, nw: comparison.newStats?.pageCount },
                { label: 'Service pages', old: comparison.oldStats?.servicePageCount, nw: comparison.newStats?.servicePageCount },
                { label: 'Local/Location pages', old: comparison.oldStats?.locationPageCount, nw: comparison.newStats?.locationPageCount },
                { label: 'Pages with schema', old: comparison.oldStats?.pagesWithSchema, nw: comparison.newStats?.pagesWithSchema },
                { label: 'Pages with title tag', old: comparison.oldStats?.pagesWithTitle, nw: comparison.newStats?.pagesWithTitle },
                { label: 'Pages with meta desc', old: comparison.oldStats?.pagesWithMeta, nw: comparison.newStats?.pagesWithMeta },
              ].map(row => {
                const improved = row.nw > row.old;
                const same = row.nw === row.old;
                return (
                  <div key={row.label} className="grid grid-cols-[2fr_1fr_1fr_1fr] px-4 py-2 items-center">
                    <span className="text-xs text-gray-700 dark:text-gray-300">{row.label}</span>
                    <span className="text-xs text-center text-gray-500">{row.old ?? '–'}</span>
                    <span className="text-xs text-center font-semibold text-gray-900 dark:text-white">{row.nw ?? '–'}</span>
                    <span className="text-center">
                      {!row.old && !row.nw ? <Minus className="h-3 w-3 text-gray-400 mx-auto" /> :
                        improved ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500 mx-auto" /> :
                        same ? <Minus className="h-3 w-3 text-gray-400 mx-auto" /> :
                        <TrendingDown className="h-3.5 w-3.5 text-red-500 mx-auto" />
                      }
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] px-4 py-1 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              <span>Metric</span><span className="text-center">Before</span><span className="text-center">After</span><span className="text-center">Trend</span>
            </div>
          </div>

          {/* GBP alignment before/after */}
          {comparison.gbpBefore && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">GBP Alignment Score</p>
              </div>
              <div className="px-4 py-3 grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-black text-gray-500">{comparison.gbpBefore.score}%</div>
                  <div className="text-[11px] text-gray-500">Current site alignment</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-black text-emerald-600">{comparison.gbpAfter?.score}%</div>
                  <div className="text-[11px] text-gray-500">Estimated after new site</div>
                  {comparison.gbpAfter?.note && <div className="text-[10px] text-gray-400 mt-0.5">{comparison.gbpAfter.note}</div>}
                </div>
              </div>
              {comparison.gbpBefore.gaps?.length > 0 && (
                <div className="px-4 pb-3 space-y-1 border-t border-gray-100 dark:border-gray-800 pt-2">
                  <p className="text-[11px] font-semibold text-gray-500 mb-1">Alignment gaps (before):</p>
                  {comparison.gbpBefore.gaps.slice(0, 5).map((g: string, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{g}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Page comparison table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Page-by-Page Comparison ({filteredPages.length}{statusFilter !== 'ALL' ? ` ${statusFilter}` : ''})
              </p>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`text-[11px] text-gray-400 hover:text-gray-600 transition-colors ${statusFilter === 'ALL' ? 'hidden' : ''}`}
              >
                Clear filter
              </button>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1.5fr_1fr_3fr_3fr] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                <span>Status</span><span>Risk</span><span>Old page</span><span>New page</span>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-800/50 max-h-80 overflow-y-auto">
                {filteredPages.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">No pages match the selected filter</div>
                ) : filteredPages.map((p: any, i: number) => {
                  const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.AT_RISK;
                  const Icon = cfg.icon;
                  const riskCls = p.riskLevel === 'HIGH' ? 'text-red-600' : p.riskLevel === 'MEDIUM' ? 'text-amber-500' : 'text-gray-400';
                  return (
                    <div key={i} className="grid grid-cols-[1.5fr_1fr_3fr_3fr] gap-2 px-3 py-2.5 items-start hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors" data-testid={`compare-row-${i}`}>
                      <div>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.cls}`}>
                          <Icon className="h-2.5 w-2.5" />{cfg.label}
                        </span>
                      </div>
                      <span className={`text-[11px] font-semibold ${riskCls}`}>{p.riskLevel || '–'}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono text-blue-600 dark:text-blue-400 truncate">/{p.slug || ''}</p>
                        {p.oldTitle && <p className="text-[10px] text-gray-500 truncate">{p.oldTitle}</p>}
                      </div>
                      <div className="min-w-0">
                        {p.newSlug ? (
                          <>
                            <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 truncate">/{p.newSlug}</p>
                            {p.newTitle && <p className="text-[10px] text-gray-500 truncate">{p.newTitle}</p>}
                          </>
                        ) : (
                          <p className="text-[10px] text-red-500 italic">Not mapped</p>
                        )}
                        {p.changeNotes?.length > 0 && (
                          <p className="text-[10px] text-gray-400 truncate">{p.changeNotes.join(' · ')}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Current site snapshot (collapsible) */}
          {crawl && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/20 bg-gray-50 dark:bg-gray-800/40 transition-colors"
                onClick={() => setShowCurrentSnapshot(p => !p)}
                data-testid="btn-toggle-current-snapshot"
              >
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Current Site Snapshot ({crawl.totalPages} pages)</p>
                {showCurrentSnapshot ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              </button>
              {showCurrentSnapshot && (
                <div className="border-t">
                  <div className="grid grid-cols-[3fr_2fr_2fr_1fr] gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/30 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    <span>URL</span><span>Title</span><span>H1</span><span>Schema</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-800/50 max-h-64 overflow-y-auto">
                    {(crawl.pages || []).map((p: any, i: number) => (
                      <div key={i} className="grid grid-cols-[3fr_2fr_2fr_1fr] gap-2 px-3 py-2 items-start hover:bg-gray-50 dark:hover:bg-gray-800/20" data-testid={`current-page-${i}`}>
                        <p className="text-[11px] font-mono text-blue-600 dark:text-blue-400 truncate" title={p.url}>{p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</p>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate" title={p.title || ''}>{p.title || <span className="text-red-400 italic">Missing</span>}</p>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate" title={p.h1 || ''}>{p.h1 || <span className="text-amber-500 italic">None</span>}</p>
                        <span>{p.hasSchema ? <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">✓</span> : <span className="text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded">–</span>}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* New site snapshot (collapsible) */}
          {techAudit?.pages?.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/20 bg-emerald-50 dark:bg-emerald-950/10 transition-colors"
                onClick={() => setShowNewSnapshot(p => !p)}
                data-testid="btn-toggle-new-snapshot"
              >
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">New Site SEO Snapshot ({techAudit.pages.length} pages)</p>
                {showNewSnapshot ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              </button>
              {showNewSnapshot && (
                <div className="border-t">
                  <div className="grid grid-cols-[2fr_2fr_2fr_1fr_1fr] gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-950/10 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    <span>Slug</span><span>Title</span><span>H1</span><span>Score</span><span>Schema</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-800/50 max-h-64 overflow-y-auto">
                    {(techAudit.pages || []).map((p: any, i: number) => (
                      <div key={i} className="grid grid-cols-[2fr_2fr_2fr_1fr_1fr] gap-2 px-3 py-2 items-start hover:bg-gray-50 dark:hover:bg-gray-800/20" data-testid={`new-page-${i}`}>
                        <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 truncate">/{p.slug}</p>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate" title={p.title || ''}>{p.title || <span className="text-red-400 italic">Missing</span>}</p>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate" title={p.h1 || ''}>{p.h1 || <span className="text-amber-500 italic">None</span>}</p>
                        <span className={`text-xs font-bold ${p.score >= 80 ? 'text-emerald-600' : p.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{p.score}%</span>
                        <span>{!p.issues?.includes('no-schema') && p.score > 0 ? <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">✓</span> : <span className="text-[10px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded">–</span>}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* No comparison yet */}
      {!comparison && crawl && hasGeneratedSite && (
        <div className="py-6 text-center space-y-2">
          <BarChart2 className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto" />
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Ready to compare</p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto">Current site crawled and new site built. Run the comparison to see before/after analysis, confidence scoring, and risk warnings.</p>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleGenerateComparison} disabled={generating}>
            {generating ? <Cpu className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />}
            Run SEO Comparison
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Launch Tab ────────────────────────────────────────────────────────────────

function LaunchTab({
  client, orgId, token, generatedSite, blueprint, toast,
}: {
  client: any; orgId: string | null; token: string | null; generatedSite: any; blueprint: any; toast: any;
}) {
  const [domain, setDomain] = useState<string>(client.websiteWorkstream?.customDomain || '');
  const [savingDomain, setSavingDomain] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copiedStep, setCopiedStep] = useState<string | null>(null);
  const [hostingPlatform, setHostingPlatform] = useState<'netlify' | 'firebase' | 'cpanel'>('netlify');

  const sitePages = generatedSite?.pages ? Object.keys(generatedSite.pages) : [];
  const localPages = generatedSite?.localPages ? Object.keys(generatedSite.localPages) : [];
  const uploadedAssets = client.websiteWorkstream?.assets || {};
  const assetSlots = blueprint?.assets || [];
  const uploadedSlotCount = assetSlots.filter((a: any) => uploadedAssets[a.key]?.dataUrl).length;
  const hasSitemap = !!generatedSite?.sitemap;
  const hasRobots = !!generatedSite?.robotsTxt;
  const savedDomain = client.websiteWorkstream?.customDomain || '';

  const copyVal = (val: string, key: string) => {
    navigator.clipboard.writeText(val).then(() => {
      setCopiedStep(key);
      setTimeout(() => setCopiedStep(null), 2000);
    });
  };

  const saveDomain = async () => {
    if (!orgId || !token) return;
    setSavingDomain(true);
    try {
      await fetch(`/api/clients/${client.id}/set-custom-domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId, customDomain: domain }),
      });
      toast({ title: 'Domain saved', description: domain });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingDomain(false);
    }
  };

  const downloadZip = async () => {
    if (!orgId) return;
    setDownloading(true);
    try {
      const url = `/api/clients/${client.id}/export-site.zip?orgId=${orgId}`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(client.businessName || 'website').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-website.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: 'ZIP downloaded', description: `${sitePages.length + localPages.length} pages included` });
    } catch (e: any) {
      toast({ title: 'Download failed', description: e.message, variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const seoPreservation = client.websiteWorkstream?.seoPreservation;
  const highRiskUnresolved = seoPreservation
    ? Object.entries(seoPreservation.pages || {}).filter(([slug, p]: any) =>
        p.riskLevel === 'HIGH' && (p.recommendedAction === 'REDIRECT' || p.recommendedAction === 'CONSOLIDATE') &&
        (!seoPreservation.redirectMap?.[slug] || seoPreservation.redirectMap?.[slug] === '/')
      ).length
    : 0;
  const gbpScore = seoPreservation?.gbpAlignment?.score ?? null;

  // Readiness checks
  const checks = [
    { id: 'blueprint', label: 'Website Blueprint generated', done: !!blueprint, required: true },
    { id: 'pages', label: `Main pages built (${sitePages.length} page${sitePages.length !== 1 ? 's' : ''})`, done: sitePages.length > 0, required: true },
    { id: 'preservation', label: `SEO preservation analysis run${seoPreservation ? ` (${Object.keys(seoPreservation.pages || {}).length} pages)` : ''}`, done: !!seoPreservation, required: false },
    { id: 'redirects', label: `High-risk redirects mapped${highRiskUnresolved > 0 ? ` (${highRiskUnresolved} still need a destination)` : ''}`, done: highRiskUnresolved === 0, required: false },
    { id: 'gbp', label: `GBP alignment${gbpScore !== null ? ` (${gbpScore}%)` : ' — run Preserve analysis'}`, done: gbpScore !== null && gbpScore >= 70, required: false },
    { id: 'sitemap', label: 'Sitemap.xml generated', done: hasSitemap, required: false },
    { id: 'robots', label: 'Robots.txt generated', done: hasRobots, required: false },
    { id: 'local', label: `Local SEO pages built (${localPages.length} page${localPages.length !== 1 ? 's' : ''})`, done: localPages.length > 0, required: false },
    { id: 'assets', label: `Assets uploaded (${uploadedSlotCount}/${assetSlots.length} slots)`, done: assetSlots.length === 0 || uploadedSlotCount === assetSlots.length, required: false },
    { id: 'domain', label: 'Custom domain set', done: !!savedDomain, required: false },
  ];
  const requiredDone = checks.filter(c => c.required).every(c => c.done);
  const totalDone = checks.filter(c => c.done).length;
  const score = Math.round((totalDone / checks.length) * 100);

  const techAudit = seoPreservation?.techAudit;
  const launchBlocked = techAudit?.launchBlocked && (techAudit.blockingRedirects?.length > 0 || techAudit.criticalIssues > 0);

  return (
    <div className="space-y-6">

      {/* Pre-launch gate banner */}
      {launchBlocked && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3.5">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">Pre-Launch Gate: BLOCKED</p>
            <p className="text-xs text-red-700 dark:text-red-300">{techAudit.launchBlockReason}</p>
            {techAudit.blockingRedirects?.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {techAudit.blockingRedirects.map((r: any, i: number) => (
                  <p key={i} className="text-[11px] text-red-600 dark:text-red-400 font-mono">/{r.slug} — {r.keyword}</p>
                ))}
              </div>
            )}
            <p className="text-[11px] text-red-500 mt-1">Fix these in the Preserve tab → re-run the Technical Audit → return here to launch.</p>
          </div>
        </div>
      )}

      {/* Readiness score */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Launch Readiness</p>
            <p className="text-xs text-gray-500">{totalDone} of {checks.length} checks passing</p>
          </div>
          <div className={`text-2xl font-bold ${score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-500' : 'text-gray-400'}`}>
            {score}%
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-400' : 'bg-gray-300'}`}
            style={{ width: `${score}%` }}
          />
        </div>
        {/* Checklist */}
        <div className="space-y-1.5 pt-1">
          {checks.map(check => (
            <div key={check.id} className="flex items-center gap-2 text-xs" data-testid={`launch-check-${check.id}`}>
              {check.done
                ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                : <div className={`h-3.5 w-3.5 rounded-full border-2 shrink-0 ${check.required ? 'border-red-400' : 'border-gray-300'}`} />
              }
              <span className={check.done ? 'text-gray-700 dark:text-gray-300' : check.required ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400'}>
                {check.label}
                {check.required && !check.done && ' *'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Custom domain */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom Domain</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder="yourdomain.com.au"
            className="flex-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="input-custom-domain"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={saveDomain}
            disabled={savingDomain || domain === savedDomain}
            className="shrink-0"
            data-testid="btn-save-domain"
          >
            {savingDomain ? <Cpu className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
          </Button>
        </div>
        {savedDomain && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">✓ Saved: {savedDomain}</p>
        )}
      </div>

      {/* Download ZIP */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Download Package</p>
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Site ZIP Archive</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Includes {sitePages.length} main page{sitePages.length !== 1 ? 's' : ''}
              {localPages.length > 0 ? `, ${localPages.length} local page${localPages.length !== 1 ? 's' : ''}` : ''}
              {hasSitemap ? ', sitemap.xml' : ''}
              {hasRobots ? ', robots.txt' : ''}
              {uploadedSlotCount > 0 ? `, ${uploadedSlotCount} asset${uploadedSlotCount !== 1 ? 's' : ''}` : ''}
              {' + README'}
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            onClick={downloadZip}
            disabled={downloading || !requiredDone}
            data-testid="btn-download-zip"
          >
            {downloading
              ? <><Cpu className="h-3.5 w-3.5 animate-spin" /> Packaging…</>
              : <><Download className="h-3.5 w-3.5" /> Download ZIP</>
            }
          </Button>
        </div>
        {!requiredDone && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">Complete the required checks above to enable download.</p>
        )}
      </div>

      {/* Hosting Platform + DNS Setup */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hosting &amp; DNS Setup</p>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {(['netlify', 'firebase', 'cpanel'] as const).map(p => (
              <button
                key={p}
                onClick={() => setHostingPlatform(p)}
                data-testid={`btn-platform-${p}`}
                className={`text-[11px] font-medium px-3 py-1 rounded-md transition-all ${hostingPlatform === p ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                {p === 'netlify' ? 'Netlify' : p === 'firebase' ? 'Firebase' : 'cPanel'}
              </button>
            ))}
          </div>
        </div>

        {hostingPlatform === 'netlify' && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
            {[
              { step: '1', color: 'blue', title: 'Create a free Netlify account', detail: 'Go to netlify.com → Sign up. No credit card needed.', copy: 'https://netlify.com' },
              { step: '2', color: 'blue', title: 'Deploy via ZIP upload', detail: 'Netlify Dashboard → Sites → Add new site → Deploy manually. Drag and drop your downloaded ZIP file.', copy: null },
              { step: '3', color: 'blue', title: 'Add your custom domain', detail: `Netlify → Site settings → Domain management → Add a domain → Enter: ${savedDomain || 'yourdomain.com.au'}`, copy: savedDomain || null },
              { step: '4', color: 'blue', title: 'Log in to your domain registrar', detail: 'GoDaddy, Namecheap, Crazy Domains, VentraIP, etc. Go to DNS / Zone management.', copy: null },
              { step: '5', color: 'blue', title: 'Add DNS records for Netlify', detail: 'Type: CNAME | Name: www | Value: [your-site].netlify.app | TTL: 3600\nType: A | Name: @ | Value: 75.2.60.5 | TTL: 3600', copy: null },
              { step: '6', color: 'blue', title: 'Wait for DNS propagation', detail: 'DNS changes take 24–48 hours. Netlify will auto-provision a free SSL certificate once verified.', copy: null },
            ].map(item => (
              <div key={item.step} className="flex items-start gap-3 px-4 py-3">
                <span className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{item.step}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{item.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 whitespace-pre-line">{item.detail}</p>
                </div>
                {item.copy && (
                  <button onClick={() => copyVal(item.copy!, `dns-${item.step}`)} className="text-[11px] flex items-center gap-1 text-gray-400 hover:text-blue-600 shrink-0" data-testid={`btn-copy-dns-${item.step}`}>
                    {copiedStep === `dns-${item.step}` ? <><CheckCircle className="h-3 w-3 text-emerald-500" /> Copied</> : <><Download className="h-3 w-3" /> Copy</>}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {hostingPlatform === 'firebase' && (
          <div className="space-y-2">
            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40 rounded-lg px-4 py-2.5">
              <p className="text-[11px] text-orange-700 dark:text-orange-400">Firebase Hosting requires two DNS TXT records — one to verify domain ownership for Firebase, and one for Google Search Console. Add both at the same time.</p>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
              {[
                { step: '1', title: 'Go to Firebase Console → Hosting', detail: 'console.firebase.google.com → your project → Hosting. Click "Add custom domain".', copy: 'https://console.firebase.google.com' },
                { step: '2', title: 'Enter your domain', detail: `Type: ${savedDomain || 'yourdomain.com.au'} and click Continue. Firebase will show you a TXT record to add.`, copy: savedDomain || null },
                { step: '3', title: 'Step 1 — Prepare domain (TXT verification)', detail: 'Firebase shows: Type: TXT | Domain name: your domain | Value: hosting-site=[your-project-id]\nLog in to your domain registrar (GoDaddy, Namecheap, etc.) and add this TXT record exactly as shown.', copy: null },
                { step: '4', title: 'Click "Verify" in Firebase', detail: 'Back in Firebase, click Verify. Firebase will check for the TXT record. If DNS hasn\'t propagated yet, wait a few hours and try again.', copy: null },
                { step: '5', title: 'Step 2 — Firebase mints your SSL certificate', detail: 'Once verified, Firebase automatically provisions a free SSL certificate. This typically takes 5–30 minutes.', copy: null },
                { step: '6', title: 'Step 3 — Direct to hosting (CNAME/A record)', detail: `Firebase will show you final DNS records:\nType: A | Name: @ | Value: 151.101.1.195\nType: CNAME | Name: www | Value: ${savedDomain ? savedDomain.replace(/^www\./, '') : 'yourdomain.com.au'}\nAdd these in your DNS registrar and wait 24–48 hours.`, copy: null },
              ].map(item => (
                <div key={item.step} className="flex items-start gap-3 px-4 py-3">
                  <span className="h-5 w-5 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{item.step}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{item.title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 whitespace-pre-line">{item.detail}</p>
                  </div>
                  {item.copy && (
                    <button onClick={() => copyVal(item.copy!, `dns-${item.step}`)} className="text-[11px] flex items-center gap-1 text-gray-400 hover:text-orange-600 shrink-0" data-testid={`btn-copy-dns-${item.step}`}>
                      {copiedStep === `dns-${item.step}` ? <><CheckCircle className="h-3 w-3 text-emerald-500" /> Copied</> : <><Download className="h-3 w-3" /> Copy</>}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hostingPlatform === 'cpanel' && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
            {[
              { step: '1', title: 'Log in to cPanel / WHM', detail: 'Access your hosting control panel at yourdomain.com.au/cpanel or via your host\'s dashboard.', copy: null },
              { step: '2', title: 'Upload site files via File Manager', detail: 'Go to File Manager → public_html. Extract your ZIP contents here. The index.html file must sit directly inside public_html.', copy: null },
              { step: '3', title: 'Point your domain to the hosting server', detail: 'In your domain registrar, go to DNS / Zone management. Update Nameservers to your host\'s nameservers (e.g. ns1.yourhostingcompany.com). Or add:\nType: A | Name: @ | Value: [your server IP] | TTL: 3600\nType: CNAME | Name: www | Value: @ | TTL: 3600', copy: null },
              { step: '4', title: 'Enable free SSL (Let\'s Encrypt)', detail: 'cPanel → SSL/TLS → Let\'s Encrypt SSL. Select your domain and click Issue. Wait 5–10 minutes.', copy: null },
              { step: '5', title: 'Force HTTPS redirect', detail: 'cPanel → Domains → your domain → Force HTTPS Redirect toggle. This ensures all http:// traffic goes to https://.', copy: null },
              { step: '6', title: 'Wait for propagation', detail: 'DNS changes take 24–48 hours to propagate globally. Use whatsmydns.net to check progress.', copy: 'https://www.whatsmydns.net' },
            ].map(item => (
              <div key={item.step} className="flex items-start gap-3 px-4 py-3">
                <span className="h-5 w-5 rounded-full bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{item.step}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{item.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 whitespace-pre-line">{item.detail}</p>
                </div>
                {item.copy && (
                  <button onClick={() => copyVal(item.copy!, `dns-${item.step}`)} className="text-[11px] flex items-center gap-1 text-gray-400 hover:text-purple-600 shrink-0" data-testid={`btn-copy-dns-${item.step}`}>
                    {copiedStep === `dns-${item.step}` ? <><CheckCircle className="h-3 w-3 text-emerald-500" /> Copied</> : <><Download className="h-3 w-3" /> Copy</>}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Google Search Console */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Google Search Console</p>
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-lg px-4 py-2.5 mb-2">
          <p className="text-[11px] text-blue-700 dark:text-blue-400">Choose <strong>Domain property</strong> (covers http + https + www + non-www) rather than URL prefix if possible. Both need a TXT record for verification.</p>
        </div>
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
          {[
            { step: '1', title: 'Go to Google Search Console', detail: 'Open search.google.com/search-console and sign in with a Google account.', copy: 'https://search.google.com/search-console' },
            { step: '2', title: 'Add a new property', detail: `Click "+ Add property" → choose "Domain" → enter: ${savedDomain || 'yourdomain.com.au'} (without https://). Or choose "URL prefix" and enter: https://${savedDomain || 'yourdomain.com.au'}`, copy: savedDomain || null },
            { step: '3', title: 'Select DNS TXT record verification', detail: 'In the verification dialog, select record type: TXT (recommended). Google will display a unique TXT value like:\ngoogle-site-verification=xxxxxxxxxxxx\nCopy this value exactly — it\'s unique to your property.', copy: null },
            { step: '4', title: 'Add the TXT record to your DNS', detail: 'Log in to your domain registrar → DNS / Zone management → Add record:\nType: TXT | Name: @ (or leave blank) | Value: google-site-verification=xxxx | TTL: 3600', copy: null },
            { step: '5', title: 'Click "Verify" in Search Console', detail: 'Return to Search Console and click Verify. If DNS hasn\'t propagated yet, click "Verify Later" — you can come back after a few hours. DNS changes can take up to 24 hours.', copy: null },
            { step: '6', title: 'Submit your sitemap', detail: `In Search Console → Sitemaps → New sitemap. Enter: ${savedDomain ? `https://${savedDomain}/sitemap.xml` : 'https://yourdomain.com.au/sitemap.xml'}`, copy: savedDomain ? `https://${savedDomain}/sitemap.xml` : null },
            { step: '7', title: 'Request indexing of key pages', detail: `In the URL Inspection tool, enter: https://${savedDomain || 'yourdomain.com.au'} → "Request indexing". Repeat for your top 3–5 pages.`, copy: null },
          ].map(item => (
            <div key={item.step} className="flex items-start gap-3 px-4 py-3">
              <span className="h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{item.step}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{item.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 whitespace-pre-line break-all">{item.detail}</p>
              </div>
              {item.copy && (
                <button onClick={() => copyVal(item.copy!, `gsc-${item.step}`)} className="text-[11px] flex items-center gap-1 text-gray-400 hover:text-emerald-600 shrink-0" data-testid={`btn-copy-gsc-${item.step}`}>
                  {copiedStep === `gsc-${item.step}` ? <><CheckCircle className="h-3 w-3 text-emerald-500" /> Copied</> : <><Download className="h-3 w-3" /> Copy</>}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Post-launch checklist */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Post-Launch Checklist</p>
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
          {[
            'Confirm site loads at https:// (SSL active)',
            'Test site on mobile — all pages look correct',
            'Check all contact forms submit and deliver',
            'Verify all phone number links are clickable (tel:)',
            'Submit sitemap in Google Search Console',
            'Set up Google Analytics 4 on all pages',
            'Create / update Google Business Profile with new website URL',
            'Ping Google: fetch & index the homepage in Search Console',
            'Schedule first GBP post linking back to a key service page',
            'Set a 90-day reminder to review rankings and refresh content',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
              <div className="h-3.5 w-3.5 rounded border border-gray-300 shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────────

export default function WebsiteWorkstreamPanel({ client }: WebsiteWorkstreamPanelProps) {
  const { orgId, authReady } = useAuth() as any;
  const dispatch = useDispatch();
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const unsub = auth.onIdTokenChanged(async (user) => {
      if (user) {
        const t = await user.getIdToken();
        setToken(t);
      } else {
        setToken(null);
      }
    });
    return unsub;
  }, []);

  const blueprint: WebsiteBlueprint | null = client.websiteWorkstream?.currentDraft ?? null;
  const isLocked  = !!client.websiteWorkstream?.acceptedVersion;
  const runId     = client.websiteWorkstream?.acceptedVersion ?? null;

  const [open, setOpen]             = useState(true);
  const [loading, setLoading]       = useState(false);

  // autoTriggered ref — guards the auto-generate effect below (placed after handleRun)
  const autoTriggered = useRef(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>({});
  const [activePage, setActivePage]       = useState<string | null>(null);
  const [nudge, setNudge]           = useState('');
  const [showNudge, setShowNudge]   = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [generatingSite, setGeneratingSite] = useState(false);
  const [generatingLocal, setGeneratingLocal] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [localPreviewSlug, setLocalPreviewSlug] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [sitemapOpen, setSitemapOpen] = useState(false);
  const [robotsOpen, setRobotsOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState<Record<string, boolean>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // ── Website Chat state ──────────────────────────────────────────────────────
  interface ChatMessage { role: 'user' | 'assistant'; content: string; ts: number; images?: string[]; }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatImages, setChatImages] = useState<{ dataUrl: string; name: string }[]>([]);
  const [chatPreviewSlug, setChatPreviewSlug] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const ahrefsFileInputRef = useRef<HTMLInputElement>(null);
  const [ahrefsUploading, setAhrefsUploading] = useState(false);

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }, []);

  const handleChatFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setChatImages(prev => [...prev, { dataUrl: reader.result as string, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const sendChat = useCallback(async (userMsg?: string) => {
    const msg = (userMsg ?? chatInput).trim();
    if ((!msg && chatImages.length === 0) || chatLoading) return;
    const images = chatImages.map(i => i.dataUrl);
    const userEntry: ChatMessage = { role: 'user', content: msg || '(image)', ts: Date.now(), images: images.length ? images : undefined };
    setChatMessages(prev => [...prev, userEntry]);
    setChatInput('');
    setChatImages([]);
    setChatLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/clients/${client.id}/website-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ orgId, message: msg || 'Analyse this image and help me incorporate it into the website.', images, history: chatMessages.slice(-20) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message, ts: Date.now() }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, ts: Date.now() }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [chatInput, chatImages, chatLoading, chatMessages, client.id, orgId]);

  // ── Enqueue / regenerate — declared here so handleAhrefsUpload and auto-trigger can reference it ──
  const handleRun = useCallback(async (force = false) => {
    if (!orgId || !authReady || !token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/agent-jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          taskType:   'website_workstream',
          entityType: 'client',
          entityId:   client.id,
          orgId,
          force,
          input: {
            orgId,
            clientId:        client.id,
            entityId:        client.id,
            entityType:      'client',
            businessName:    client.businessName,
            brand:           client.businessName,
            website:         client.website || client.clientOnboarding?.currentWebsiteUrl || '',
            location:        client.city || client.location || '',
            industry:        client.industry || '',
            ...(nudge ? { promptNudge: nudge } : {}),
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to queue job');
      }

      const { jobId } = await res.json();

      if (jobId) {
        fetch(`/api/agent-jobs/${jobId}/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ orgId }),
        }).catch(() => {/* fire-and-forget */});
      }

      toast({ title: force ? 'Rebuilding site plan…' : 'Building site plan from intelligence…', description: 'Pulling from GBP services, service areas and keyword data. The plan tab will update automatically.' });
      setNudge('');
      setShowNudge(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orgId, authReady, token, client, nudge, toast]);

  const parseAhrefsBuffer = (raw: ArrayBuffer): { keyword: string; volume: number; difficulty: number | null; cpc: number | null; parentKeyword: string | null; country: string }[] => {
    let text = '';
    const buf = new Uint8Array(raw);
    if (buf[0] === 0xFF && buf[1] === 0xFE) {
      const u16 = new Uint16Array(raw.slice(2));
      text = String.fromCharCode(...Array.from(u16));
    } else {
      text = new TextDecoder('utf-8').decode(raw);
    }
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const header = lines[0].split('\t').map(h => h.replace(/"/g, '').trim().toLowerCase());
    const kwIdx = header.findIndex(h => h === 'keyword');
    const volIdx = header.findIndex(h => h === 'volume');
    const diffIdx = header.findIndex(h => h === 'difficulty');
    const cpcIdx = header.findIndex(h => h === 'cpc');
    const parentIdx = header.findIndex(h => h === 'parent keyword');
    const countryIdx = header.findIndex(h => h === 'country');
    if (kwIdx === -1) return [];
    return lines.slice(1).map(line => {
      const cols = line.split('\t').map(c => c.replace(/^"|"$/g, '').trim());
      const kw = cols[kwIdx]?.toLowerCase().trim() || '';
      if (!kw) return null;
      const vol = parseInt(cols[volIdx] || '0', 10) || 0;
      const diffStr = cols[diffIdx]?.trim();
      const diff = diffStr ? parseInt(diffStr, 10) : null;
      const cpcStr = cols[cpcIdx]?.trim();
      const cpc = cpcStr ? parseFloat(cpcStr) : null;
      return { keyword: kw, volume: vol, difficulty: isNaN(diff!) ? null : diff, cpc: isNaN(cpc!) ? null : cpc, parentKeyword: cols[parentIdx]?.toLowerCase().trim() || null, country: cols[countryIdx] || 'au' };
    }).filter(Boolean) as any[];
  };

  const handleAhrefsUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setAhrefsUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const keywords = parseAhrefsBuffer(buf);
      if (keywords.length === 0) {
        toast({ title: 'No keywords found', description: 'Expected Ahrefs CSV with Keyword and Volume columns (tab-separated).', variant: 'destructive' });
        return;
      }
      const res = await fetch(`/api/clients/${client.id}/import-keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ orgId, keywords }),
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const count = data.count || keywords.length;
      toast({ title: `${count} keywords imported`, description: 'Rebuilding your site plan with keyword data…' });
      // Rebuild the site plan with the new keyword intelligence
      autoTriggered.current = false;
      setTimeout(() => handleRun(true), 800);
    } catch (err: any) {
      toast({ title: 'Keyword upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setAhrefsUploading(false);
      if (ahrefsFileInputRef.current) ahrefsFileInputRef.current.value = '';
    }
  }, [token, orgId, client.id, handleRun, toast]);

  const CHAT_QUICK_ACTIONS: { label: string; action?: string; run?: boolean }[] = [
    { label: 'Write homepage copy', action: 'Write homepage copy with headline, hero text, supporting points and CTA — based on the site plan' },
    { label: 'Write all service page copy', action: 'Write SEO-optimised copy for every service page in the site plan — include benefits, process and CTA for each' },
    { label: 'Write location page copy', action: 'Write location-specific landing page copy for every service area in the site plan' },
    { label: 'Generate meta titles & descriptions', action: 'Generate optimised meta titles and descriptions for every page in the site plan' },
    { label: 'Create LocalBusiness schema', action: 'Generate complete LocalBusiness schema markup including all services, service areas and review signals' },
    { label: 'Write FAQ content', action: 'Write FAQ content targeting the most common local search queries for each service' },
    { label: 'Create About Us page', action: 'Write a compelling About Us page for a local trade business — include origin story, values and local trust signals' },
    { label: 'Write Google review request emails', action: 'Write 3 review request email templates for getting more 5-star Google reviews' },
    { label: 'Rebuild site plan', run: true },
  ];

  function renderChatContent(text: string) {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('### ')) return <h3 key={i} className="font-semibold text-sm mt-3 mb-1 text-gray-900 dark:text-white">{line.slice(4)}</h3>;
      if (line.startsWith('## ')) return <h2 key={i} className="font-bold text-sm mt-4 mb-1 text-gray-900 dark:text-white">{line.slice(3)}</h2>;
      if (line.startsWith('# ')) return <h1 key={i} className="font-bold text-base mt-4 mb-1 text-gray-900 dark:text-white">{line.slice(2)}</h1>;
      if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 text-xs text-gray-700 dark:text-gray-300 list-disc">{line.slice(2)}</li>;
      if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-xs text-gray-800 dark:text-gray-200 mt-1">{line.slice(2, -2)}</p>;
      if (line.trim() === '') return <div key={i} className="h-2" />;
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j} className="font-semibold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
      );
    });
  }

  const generatedSite = client.websiteWorkstream?.generatedSite;
  const siteReady = generatedSite?.status === 'ready' && generatedSite?.pages;
  const sitePageSlugs: string[] = siteReady ? Object.keys(generatedSite.pages) : [];
  const activePreviewSlug = previewSlug || sitePageSlugs[0] || null;
  const localPages = generatedSite?.localPages || {};
  const localPageSlugs: string[] = Object.keys(localPages);
  const localPagesReady = generatedSite?.localPagesStatus === 'ready' && localPageSlugs.length > 0;
  const localGenerating = generatedSite?.localPagesStatus === 'generating' || generatingLocal;
  const activeLocalSlug = localPreviewSlug || localPageSlugs[0] || null;

  // ── Enqueue / regenerate ─────────────────────────────────────────────────────

  // Auto-trigger site plan generation on first open — fires for any real client with no existing blueprint
  useEffect(() => {
    if (autoTriggered.current) return;
    if (!token || !authReady) return;
    if (blueprint || loading) return;
    // Any client with a name is enough — the server reads GBP + crawl + keyword intelligence
    if (!client.businessName) return;
    autoTriggered.current = true;
    handleRun(false);
  }, [token, authReady, blueprint, loading, handleRun, client]);

  // ── Accept plan ──────────────────────────────────────────────────────────────

  const handleAccept = useCallback(async () => {
    if (!orgId || !authReady || !blueprint) return;
    const versionId = `accepted-${Date.now()}`;
    const updates = {
      websiteWorkstream: {
        ...client.websiteWorkstream,
        acceptedVersion: versionId,
      },
    };
    try {
      await updateClientInFirestore(orgId, client.id, updates);
      dispatch(updateClient({ id: client.id, updates }));
      toast({ title: 'Plan accepted', description: 'Blueprint version locked.' });
    } catch {
      toast({ title: 'Error saving', variant: 'destructive' });
    }
  }, [orgId, authReady, blueprint, client, dispatch, toast]);

  // ── Save copy selection ───────────────────────────────────────────────────────

  const handleCopySelect = useCallback(async (
    pageKey: string,
    sectionIdx: number,
    variant: 'concise' | 'standard' | 'extended'
  ) => {
    if (!orgId || !authReady) return;
    const prev = client.websiteWorkstream?.userSelections ?? {};
    const pageSels = prev[pageKey] ?? {};
    const updated = { ...prev, [pageKey]: { ...pageSels, [sectionIdx]: variant } };
    const updates = { websiteWorkstream: { ...client.websiteWorkstream, userSelections: updated } };
    await updateClientInFirestore(orgId, client.id, updates).catch(console.error);
    dispatch(updateClient({ id: client.id, updates }));
  }, [orgId, authReady, client, dispatch]);

  // ── Export blueprint JSON ─────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (!blueprint) return;
    setExporting(true);
    try {
      const exportPayload = {
        siteMeta:    blueprint.siteMeta,
        nav:         blueprint.nav,
        footer:      blueprint.footer,
        pages:       blueprint.pages.map(page => ({
          ...page,
          sections: page.sections.map((s, si) => {
            const sel = blueprint.userSelections?.[page.key]?.[si];
            const selectedCopy = sel && s.copyVariants ? s.copyVariants[sel] : undefined;
            return { ...s, selectedCopy };
          }),
        })),
        assets:      blueprint.assets,
        performance: blueprint.performance,
        exportedAt:  new Date().toISOString(),
        client:      client.businessName,
      };

      const json = JSON.stringify(exportPayload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${client.businessName.replace(/\s+/g, '-').toLowerCase()}-website-blueprint.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Blueprint exported', description: 'JSON scaffold downloaded.' });
    } catch (e: any) {
      toast({ title: 'Export error', description: e.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }, [blueprint, client, toast]);

  // ── Generate real HTML site ──────────────────────────────────────────────────

  const handleGenerateSite = useCallback(async () => {
    if (!orgId || !authReady || !blueprint || !token) return;
    setGeneratingSite(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/generate-site`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Generation failed');
      }
      const data = await res.json();
      toast({
        title: 'Site generated',
        description: `${data.pageCount} pages built — switch to the Preview tab to see them live.`,
      });
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
    } finally {
      setGeneratingSite(false);
    }
  }, [orgId, authReady, blueprint, client, token, toast]);

  // ── Generate local SEO pages ──────────────────────────────────────────────────

  const handleGenerateLocalPages = useCallback(async () => {
    if (!orgId || !authReady || !blueprint || !token) return;
    setGeneratingLocal(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/generate-local-pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      const data = await res.json();
      toast({
        title: 'Local pages generated',
        description: `${data.pageCount} local SEO pages built — switch to the Local Pages tab to review them.`,
      });
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
    } finally {
      setGeneratingLocal(false);
    }
  }, [orgId, authReady, blueprint, client, token, toast]);

  // ─────────────────────────────────────────────────────────────────────────────

  const currentPage = blueprint?.pages.find(p => p.key === activePage) ?? blueprint?.pages[0] ?? null;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900 mb-4">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
        data-testid="website-workstream-panel-toggle"
      >
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Website Workstream</span>
          {isLocked && (
            <Badge className="bg-green-100 text-green-700 text-xs gap-1 border-green-300">
              <Lock className="h-2.5 w-2.5" /> Accepted
            </Badge>
          )}
          {blueprint && !isLocked && (
            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Draft</Badge>
          )}
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {blueprint && <StaleBadge generatedAt={blueprint.generatedAt} />}
          <Button
            variant="ghost" size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setHistoryOpen(true)}
            data-testid="btn-website-workstream-history"
          >
            History
          </Button>
          {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </div>
      </div>

      {open && (
        <div className="p-4">
          {/* Toolbar — only shown once a blueprint exists */}
          {blueprint && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleRun(false)}
                disabled={loading}
                data-testid="btn-website-workstream-run"
              >
                <Cpu className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh Blueprint
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowNudge(s => !s)}
                data-testid="btn-website-workstream-nudge"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>

              {!isLocked && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleAccept}
                  data-testid="btn-website-workstream-accept"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Accept Plan
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={handleExport}
                disabled={exporting}
                data-testid="btn-website-workstream-export"
              >
                <Download className="h-3.5 w-3.5" />
                Export ZIP
              </Button>

              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleGenerateSite}
                disabled={generatingSite}
                data-testid="btn-generate-site"
              >
                {generatingSite
                  ? <><Cpu className="h-3.5 w-3.5 animate-spin" /> Building…</>
                  : <><Zap className="h-3.5 w-3.5" /> {siteReady ? 'Rebuild Site' : 'Build Site'}</>
                }
              </Button>
            </div>
          )}

          {/* Nudge input */}
          {showNudge && (
            <div className="mb-4 flex gap-2">
              <input
                value={nudge}
                onChange={e => setNudge(e.target.value)}
                placeholder="Optional direction (e.g. 'focus more on emergency callouts')"
                className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="input-website-workstream-nudge"
              />
              <Button
                size="sm"
                className="h-9 text-xs"
                onClick={() => handleRun(true)}
                disabled={loading}
                data-testid="btn-website-workstream-regen-confirm"
              >
                Run
              </Button>
            </div>
          )}

          {/* Loading indicator (blueprint generating) */}
          {loading && !blueprint && (
            <div className="flex items-center gap-2 mb-2 text-xs text-blue-600 dark:text-blue-400">
              <Cpu className="h-3.5 w-3.5 animate-spin" />
              Generating blueprint…
            </div>
          )}

          {/* Tabs */}
          {blueprint && (
            <Tabs defaultValue="plan" className="w-full">
              <TabsList className="h-8 text-xs mb-4 flex gap-0.5">
                <TabsTrigger value="plan"    className="text-xs h-7 gap-1" data-testid="tab-workstream-plan"><FileText className="h-3 w-3" />Plan</TabsTrigger>
                <TabsTrigger value="pages"   className="text-xs h-7 gap-1" data-testid="tab-workstream-pages"><Globe className="h-3 w-3" />Pages</TabsTrigger>
                <TabsTrigger value="copy"    className="text-xs h-7 gap-1" data-testid="tab-workstream-copy"><Type className="h-3 w-3" />Copy</TabsTrigger>
                <TabsTrigger value="seo"     className="text-xs h-7 gap-1" data-testid="tab-workstream-seo"><Search className="h-3 w-3" />SEO</TabsTrigger>
                <TabsTrigger value="preserve" className="text-xs h-7 gap-1" data-testid="tab-workstream-preserve">
                  <Shield className="h-3 w-3" />Preserve
                  {client.websiteWorkstream?.seoPreservation?.highRiskCount > 0 && (
                    <Badge className="h-4 px-1 py-0 text-[10px] bg-red-100 text-red-700 ml-0.5">{client.websiteWorkstream.seoPreservation.highRiskCount}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="local"   className="text-xs h-7 gap-1" data-testid="tab-workstream-local">
                  <Map className="h-3 w-3" />Local
                  {localPagesReady && <Badge className="h-4 px-1 py-0 text-[10px] bg-emerald-100 text-emerald-700 ml-0.5">{localPageSlugs.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="assets"  className="text-xs h-7 gap-1" data-testid="tab-workstream-assets"><Image className="h-3 w-3" />Assets</TabsTrigger>
                <TabsTrigger value="compare" className="text-xs h-7 gap-1" data-testid="tab-workstream-compare">
                  <GitCompare className="h-3 w-3" />Compare
                  {client.websiteWorkstream?.seoComparison?.riskScore > 45 && (
                    <Badge className="h-4 px-1 py-0 text-[10px] bg-red-100 text-red-700 ml-0.5">!</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="preview" className="text-xs h-7 gap-1" data-testid="tab-workstream-preview"><Eye className="h-3 w-3" />Preview</TabsTrigger>
                <TabsTrigger value="launch"  className="text-xs h-7 gap-1" data-testid="tab-workstream-launch"><Rocket className="h-3 w-3" />Launch</TabsTrigger>
              </TabsList>

              {/* ── PLAN ── */}
              <TabsContent value="plan" className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <InfoCard label="Brand"       value={blueprint.siteMeta.brand} />
                  <InfoCard label="UVP"         value={blueprint.siteMeta.uvp} />
                  <InfoCard label="Tone"        value={blueprint.siteMeta.tone} />
                  <InfoCard label="Primary CTA" value={blueprint.siteMeta.primaryCta} />
                </div>

                <Section title="NAP">
                  <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                    <div><span className="font-medium">Address:</span> {blueprint.siteMeta.nap.address}</div>
                    <div><span className="font-medium">Phone:</span> {blueprint.siteMeta.nap.phone}</div>
                    {blueprint.siteMeta.nap.email && <div><span className="font-medium">Email:</span> {blueprint.siteMeta.nap.email}</div>}
                  </div>
                </Section>

                <Section title="Navigation">
                  <div className="flex flex-wrap gap-2">
                    {blueprint.nav.items.map((item, i) => (
                      <span key={i} className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded font-medium">
                        {item.label}
                      </span>
                    ))}
                  </div>
                </Section>

                <Section title="Site Structure">
                  <div className="space-y-1.5">
                    {blueprint.pages.map(page => (
                      <div key={page.key} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">{page.title}</span>
                          <span className="text-gray-400 ml-2 text-xs">{page.route}</span>
                        </div>
                        <span className="text-xs text-gray-400">{page.sections.length} sections</span>
                      </div>
                    ))}
                  </div>
                </Section>

                {blueprint.siteMeta.social && (
                  <Section title="Social Profiles">
                    <div className="flex flex-wrap gap-2">
                      {blueprint.siteMeta.social.gbp && <SocialChip label="GBP" url={blueprint.siteMeta.social.gbp} />}
                      {blueprint.siteMeta.social.fb  && <SocialChip label="Facebook" url={blueprint.siteMeta.social.fb} />}
                      {blueprint.siteMeta.social.ig  && <SocialChip label="Instagram" url={blueprint.siteMeta.social.ig} />}
                    </div>
                  </Section>
                )}

                {blueprint.siteMeta.tracking && (
                  <Section title="Tracking">
                    <div className="flex gap-2 flex-wrap">
                      {blueprint.siteMeta.tracking.ga4 && <TrackBadge label="GA4" />}
                      {blueprint.siteMeta.tracking.gtm && <TrackBadge label="GTM" />}
                      {blueprint.siteMeta.tracking.gsc && <TrackBadge label="GSC" />}
                    </div>
                  </Section>
                )}
              </TabsContent>

              {/* ── PAGES ── */}
              <TabsContent value="pages" className="space-y-3">
                {blueprint.pages.map(page => (
                  <div key={page.key} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => setExpandedPages(p => ({ ...p, [page.key]: !p[page.key] }))}
                      data-testid={`page-toggle-${page.key}`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{page.title}</div>
                        <div className="text-xs text-gray-500">{page.route} · {page.sections.length} sections</div>
                      </div>
                      {expandedPages[page.key]
                        ? <ChevronDown className="h-4 w-4 text-gray-400" />
                        : <ChevronRight className="h-4 w-4 text-gray-400" />
                      }
                    </button>

                    {expandedPages[page.key] && (
                      <div className="p-4 space-y-3">
                        <p className="text-xs text-gray-600 dark:text-gray-400">{page.description}</p>
                        <div className="space-y-2">
                          {page.sections.map((section, si) => (
                            <div key={si} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-5 text-center">{si + 1}</span>
                              <Badge variant="outline" className="text-xs">{section.kind}</Badge>
                              {section.copyVariants && (
                                <span className="text-xs text-blue-500 ml-auto">Has copy variants</span>
                              )}
                            </div>
                          ))}
                        </div>
                        {page.internalLinks && page.internalLinks.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-gray-500 mb-1">Internal links</div>
                            <div className="flex flex-wrap gap-1">
                              {page.internalLinks.map((link, i) => (
                                <span key={i} className="text-xs text-blue-600 dark:text-blue-400 underline">{link.label}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </TabsContent>

              {/* ── COPY ── */}
              <TabsContent value="copy" className="space-y-4">
                <div className="text-xs text-gray-500 mb-2">Select a copy length per section. Your selections are saved automatically.</div>
                {blueprint.pages.map(page => {
                  const sectionsWithCopy = page.sections.filter(s => s.copyVariants);
                  if (sectionsWithCopy.length === 0) return null;
                  return (
                    <Section key={page.key} title={page.title}>
                      <div className="space-y-4">
                        {page.sections.map((section, si) => {
                          if (!section.copyVariants) return null;
                          const selected = blueprint.userSelections?.[page.key]?.[si] ?? 'standard';
                          return (
                            <div key={si} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                              <div className="flex items-center gap-2 mb-3">
                                <Badge variant="outline" className="text-xs">{section.kind}</Badge>
                                <span className="text-xs text-gray-500">Section {si + 1}</span>
                              </div>
                              <div className="flex gap-2 mb-3">
                                {(['concise', 'standard', 'extended'] as const).map(v => (
                                  <button
                                    key={v}
                                    onClick={() => handleCopySelect(page.key, si, v)}
                                    className={`text-xs px-2 py-1 rounded-md border transition-colors capitalize ${
                                      selected === v
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-blue-400'
                                    }`}
                                    data-testid={`copy-variant-${page.key}-${si}-${v}`}
                                  >
                                    {v}
                                  </button>
                                ))}
                              </div>
                              <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 leading-relaxed">
                                {section.copyVariants[selected]}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Section>
                  );
                })}
              </TabsContent>

              {/* ── SEO ── */}
              <TabsContent value="seo" className="space-y-4">

                {/* ── Page meta audit ── */}
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Page Meta Audit</div>
                {blueprint.pages.map(page => (
                  <Section key={page.key} title={page.title}>
                    <div className="space-y-2 text-sm">
                      <SeoRow label="Title"       value={page.seoMeta.title} />
                      <SeoRow label="Description" value={page.seoMeta.description} />
                      {page.seoMeta.canonical && <SeoRow label="Canonical" value={page.seoMeta.canonical} />}
                      {/* title length indicator */}
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-gray-400">Title length:</span>
                        <span className={page.seoMeta.title.length > 60 ? 'text-amber-600 font-medium' : page.seoMeta.title.length < 30 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                          {page.seoMeta.title.length} chars {page.seoMeta.title.length > 60 ? '⚠ too long' : page.seoMeta.title.length < 30 ? '⚠ too short' : '✓ good'}
                        </span>
                        <span className="text-gray-400 ml-2">Desc length:</span>
                        <span className={page.seoMeta.description.length > 160 ? 'text-amber-600 font-medium' : page.seoMeta.description.length < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                          {page.seoMeta.description.length} chars {page.seoMeta.description.length > 160 ? '⚠ too long' : page.seoMeta.description.length < 70 ? '⚠ too short' : '✓ good'}
                        </span>
                      </div>
                    </div>
                  </Section>
                ))}

                {/* ── Schema Markup ── */}
                {blueprint.pages.some(p => p.jsonLd) && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => setSchemaOpen(prev => ({ ...prev, _main: !prev['_main'] }))}
                      data-testid="btn-schema-expand"
                    >
                      <span className="flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-violet-500" />
                        Schema Markup (JSON-LD)
                        <Badge className="text-[10px] h-4 px-1.5 bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">{blueprint.pages.filter(p => p.jsonLd).length} pages</Badge>
                      </span>
                      {schemaOpen['_main'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    </button>
                    {schemaOpen['_main'] && (
                      <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                        {blueprint.pages.filter(p => p.jsonLd).map(page => {
                          const schemaJson = JSON.stringify(page.jsonLd, null, 2);
                          const schemaKey = `schema-${page.key}`;
                          return (
                            <div key={page.key} className="p-4 space-y-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{page.title}</span>
                                <button
                                  onClick={() => copyToClipboard(schemaJson, schemaKey)}
                                  className="text-[11px] flex items-center gap-1 text-gray-400 hover:text-gray-700 transition-colors"
                                  data-testid={`btn-copy-schema-${page.key}`}
                                >
                                  {copiedKey === schemaKey ? <><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Copied</> : <><Download className="h-3.5 w-3.5" /> Copy</>}
                                </button>
                              </div>
                              {/* @type badge */}
                              {(page.jsonLd as any)?.['@type'] && (
                                <Badge className="text-[10px] h-4 px-1.5 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300 mb-1">@type: {(page.jsonLd as any)['@type']}</Badge>
                              )}
                              <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto text-gray-700 dark:text-gray-300 max-h-48 leading-relaxed">
                                {schemaJson}
                              </pre>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Sitemap.xml ── */}
                {generatedSite?.sitemap && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => setSitemapOpen(v => !v)}
                      data-testid="btn-sitemap-expand"
                    >
                      <span className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-blue-500" />
                        sitemap.xml
                        <Badge className="text-[10px] h-4 px-1.5 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">
                          {(generatedSite.sitemap.match(/<url>/g) || []).length} URLs
                        </Badge>
                      </span>
                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/clients/${client.id}/sitemap.xml?orgId=${orgId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-[11px] text-blue-500 hover:text-blue-700 flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> Open
                        </a>
                        {sitemapOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      </div>
                    </button>
                    {sitemapOpen && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-gray-500">Generated {generatedSite.generatedAt ? format(new Date(generatedSite.generatedAt), 'dd/MM/yyyy') : ''}</span>
                          <button
                            onClick={() => copyToClipboard(generatedSite.sitemap, 'sitemap')}
                            className="text-[11px] flex items-center gap-1 text-gray-400 hover:text-gray-700 transition-colors"
                            data-testid="btn-copy-sitemap"
                          >
                            {copiedKey === 'sitemap' ? <><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Copied</> : <><Download className="h-3.5 w-3.5" /> Copy XML</>}
                          </button>
                        </div>
                        <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto text-gray-700 dark:text-gray-300 max-h-64 leading-relaxed whitespace-pre-wrap">
                          {generatedSite.sitemap}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Robots.txt ── */}
                {generatedSite?.robotsTxt && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => setRobotsOpen(v => !v)}
                      data-testid="btn-robots-expand"
                    >
                      <span className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-gray-500" />
                        robots.txt
                      </span>
                      {robotsOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    </button>
                    {robotsOpen && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-2">
                        <div className="flex justify-end">
                          <button
                            onClick={() => copyToClipboard(generatedSite.robotsTxt, 'robots')}
                            className="text-[11px] flex items-center gap-1 text-gray-400 hover:text-gray-700 transition-colors"
                            data-testid="btn-copy-robots"
                          >
                            {copiedKey === 'robots' ? <><CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> Copied</> : <><Download className="h-3.5 w-3.5" /> Copy</>}
                          </button>
                        </div>
                        <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto text-gray-700 dark:text-gray-300 max-h-48 leading-relaxed">
                          {generatedSite.robotsTxt}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {!generatedSite?.sitemap && !generatedSite?.robotsTxt && (
                  <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
                    <p className="text-xs text-gray-400">Sitemap and robots.txt are generated when you build the site in the Preview tab.</p>
                  </div>
                )}

              </TabsContent>

              {/* ── SEO PRESERVE ── */}
              <TabsContent value="preserve" className="space-y-4">
                <SeoPreserveTab
                  client={client}
                  orgId={orgId}
                  token={token}
                  blueprint={blueprint}
                  toast={toast}
                />
              </TabsContent>

              {/* ── LOCAL SEO PAGES ── */}
              <TabsContent value="local" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Local SEO Pages</p>
                    <p className="text-xs text-gray-500 mt-0.5">Service pages, location pages, and high-value service+location combinations for local search.</p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                    onClick={handleGenerateLocalPages}
                    disabled={localGenerating || !blueprint}
                    data-testid="btn-generate-local-pages"
                  >
                    {localGenerating
                      ? <><Cpu className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                      : <><Map className="h-3.5 w-3.5" /> {localPagesReady ? 'Regenerate' : 'Generate Local Pages'}</>
                    }
                  </Button>
                </div>

                {localGenerating && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 text-center space-y-2">
                    <Cpu className="h-6 w-6 text-amber-500 mx-auto animate-spin" />
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Building local SEO pages…</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">AI is planning service + location pages and generating HTML for each. This takes 3–5 minutes.</p>
                  </div>
                )}

                {!localPagesReady && !localGenerating && (
                  <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center space-y-3">
                    <Map className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto" />
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No local pages yet</p>
                      <p className="text-xs text-gray-500 max-w-sm mx-auto">The AI will analyse this business, identify the right service + location combinations, and generate a full set of unique, substantive local SEO pages.</p>
                    </div>
                    {!blueprint && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Generate the Website Blueprint first to enable local page generation.</p>
                    )}
                  </div>
                )}

                {localPagesReady && (
                  <>
                    {/* Page type legend */}
                    <div className="flex items-center gap-3 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> Service page</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Location page</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500 inline-block" /> Service+Location</span>
                    </div>

                    {/* Page list */}
                    <div className="grid gap-2">
                      {localPageSlugs.map(slug => {
                        const page = localPages[slug];
                        const typeColor = page.pageType === 'service'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                          : page.pageType === 'location'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300';
                        const isActive = activeLocalSlug === slug;
                        return (
                          <div
                            key={slug}
                            onClick={() => setLocalPreviewSlug(slug)}
                            className={`border rounded-lg p-3 cursor-pointer transition-all ${isActive ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'}`}
                            data-testid={`local-page-card-${slug}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${typeColor}`}>{page.pageType}</span>
                                  <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{page.title}</span>
                                </div>
                                <p className="text-[11px] text-blue-600 dark:text-blue-400 font-mono">/{slug}</p>
                                {page.targetKeyword && (
                                  <p className="text-[11px] text-gray-500 mt-0.5">🎯 {page.targetKeyword}</p>
                                )}
                                {page.rationale && (
                                  <p className="text-[11px] text-gray-400 mt-0.5 italic">{page.rationale}</p>
                                )}
                              </div>
                              <a
                                href={`/api/clients/${client.id}/local-preview/${slug}?orgId=${orgId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="shrink-0 p-1.5 rounded border border-gray-200 text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors"
                                title="Open in new tab"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Preview pane */}
                    {activeLocalSlug && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            Preview: {localPages[activeLocalSlug]?.title}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setPreviewMode('desktop')}
                              className={`p-1.5 rounded border transition-colors ${previewMode === 'desktop' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-gray-200 text-gray-400'}`}
                            >
                              <Monitor className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setPreviewMode('mobile')}
                              className={`p-1.5 rounded border transition-colors ${previewMode === 'mobile' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-gray-200 text-gray-400'}`}
                            >
                              <Smartphone className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className={`rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-100 dark:bg-gray-800 flex justify-center ${previewMode === 'mobile' ? 'p-4' : ''}`}>
                          <iframe
                            key={`local-${activeLocalSlug}-${previewMode}`}
                            src={`/api/clients/${client.id}/local-preview/${activeLocalSlug}?orgId=${orgId}`}
                            className={`rounded-lg shadow transition-all ${previewMode === 'mobile' ? 'w-[390px] h-[844px] border border-gray-200' : 'w-full h-[600px] border-0'}`}
                            title={`Local preview: ${activeLocalSlug}`}
                            sandbox="allow-same-origin allow-scripts allow-forms"
                            data-testid="local-preview-iframe"
                          />
                        </div>
                        <p className="text-[11px] text-gray-400">
                          Generated {generatedSite.localPagesGeneratedAt ? format(new Date(generatedSite.localPagesGeneratedAt), 'dd/MM/yyyy HH:mm') : '—'} · {localPageSlugs.length} pages · Sitemap updated
                        </p>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ── ASSETS ── */}
              <TabsContent value="assets" className="space-y-4">
                <AssetUploadTab
                  client={client}
                  orgId={orgId}
                  token={token}
                  blueprint={blueprint}
                  toast={toast}
                />
              </TabsContent>

              {/* ── COMPARE ── */}
              <TabsContent value="compare" className="space-y-4">
                <SeoCompareTab
                  client={client}
                  orgId={orgId}
                  token={token}
                  toast={toast}
                />
              </TabsContent>

              {/* ── PREVIEW ── */}
              <TabsContent value="preview" className="space-y-3">
                {!siteReady ? (
                  <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center space-y-4">
                    <MonitorPlay className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto" />
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site not yet built</p>
                      <p className="text-xs text-gray-500">Click <strong>Build Site</strong> above to generate real HTML pages and preview them live here.</p>
                    </div>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={handleGenerateSite}
                      disabled={generatingSite || !blueprint}
                      data-testid="btn-generate-site-preview"
                    >
                      {generatingSite
                        ? <><Cpu className="h-3.5 w-3.5 animate-spin" /> Building pages…</>
                        : <><Zap className="h-3.5 w-3.5" /> Build Site Now</>
                      }
                    </Button>
                    {generatingSite && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Generating HTML for each page — this takes 1–3 minutes…
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Controls */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs text-gray-500 mr-1">Page:</span>
                        {sitePageSlugs.map(slug => {
                          const pageData = generatedSite.pages[slug];
                          return (
                            <button
                              key={slug}
                              onClick={() => setPreviewSlug(slug)}
                              className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                                activePreviewSlug === slug
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-blue-400'
                              }`}
                              data-testid={`preview-slug-${slug}`}
                            >
                              {pageData?.title || slug}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setPreviewMode('desktop')}
                          className={`p-1.5 rounded border transition-colors ${previewMode === 'desktop' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                          title="Desktop"
                        >
                          <Monitor className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setPreviewMode('mobile')}
                          className={`p-1.5 rounded border transition-colors ${previewMode === 'mobile' ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-gray-200 text-gray-400 hover:text-gray-600'}`}
                          title="Mobile"
                        >
                          <Smartphone className="h-3.5 w-3.5" />
                        </button>
                        {activePreviewSlug && (
                          <a
                            href={`/api/clients/${client.id}/site-preview/${activePreviewSlug}?orgId=${orgId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Open in new tab"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* iframe */}
                    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-100 dark:bg-gray-800 flex justify-center ${previewMode === 'mobile' ? 'p-4' : ''}`}>
                      {activePreviewSlug && (
                        <iframe
                          ref={iframeRef}
                          key={`${activePreviewSlug}-${previewMode}`}
                          src={`/api/clients/${client.id}/site-preview/${activePreviewSlug}?orgId=${orgId}`}
                          className={`rounded-lg shadow-lg transition-all ${
                            previewMode === 'mobile'
                              ? 'w-[390px] h-[844px] border border-gray-200'
                              : 'w-full h-[700px] border-0'
                          }`}
                          title={`Preview: ${activePreviewSlug}`}
                          data-testid="site-preview-iframe"
                          sandbox="allow-same-origin allow-scripts allow-forms"
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span>Generated {generatedSite.generatedAt ? format(new Date(generatedSite.generatedAt), 'dd/MM/yyyy HH:mm') : '—'} · {sitePageSlugs.length} pages</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[11px] gap-1 text-gray-400 hover:text-blue-600 px-2"
                        onClick={handleGenerateSite}
                        disabled={generatingSite}
                      >
                        <RefreshCw className="h-3 w-3" /> Rebuild
                      </Button>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ── LAUNCH ── */}
              <TabsContent value="launch" className="space-y-4">
                <LaunchTab
                  client={client}
                  orgId={orgId}
                  token={token}
                  generatedSite={generatedSite}
                  blueprint={blueprint}
                  toast={toast}
                />
              </TabsContent>

            </Tabs>
          )}

          {/* ── SEO WEBSITE MACHINE — Split Pane ── */}
          <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>

            {/* ── LEFT: Chat panel ── */}
            <div className="flex flex-col bg-white dark:bg-gray-950" style={{ width: '52%', borderRight: '1px solid #e5e7eb' }}>
              {/* Chat header */}
              <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-semibold text-white">SEO Website Machine</span>
                  <span className="text-[10px] text-blue-200 hidden sm:inline">· GPT-4o · {client.businessName}</span>
                </div>
                {chatMessages.length > 0 && (
                  <button onClick={() => setChatMessages([])} className="text-[10px] text-blue-200 hover:text-white" data-testid="button-chat-clear">
                    Clear
                  </button>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 dark:bg-gray-900">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${loading ? 'bg-blue-600' : 'bg-blue-100 dark:bg-blue-900/40'}`}>
                      <Globe className={`h-5 w-5 ${loading ? 'text-white animate-pulse' : 'text-blue-600 dark:text-blue-400'}`} />
                    </div>
                    {loading ? (
                      <>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">Building your site plan…</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-[260px]">
                          Pulling from your client intelligence — GBP services, service areas, existing site data, and keyword targets.
                        </p>
                        <div className="flex gap-1 justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">SEO Website Machine</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 max-w-[260px]">
                          Your site plan will be built automatically from your GBP services, service areas and keyword data. Upload Ahrefs keywords below to get started.
                        </p>
                        <div className="flex flex-col gap-1.5 w-full max-w-[280px]">
                          {CHAT_QUICK_ACTIONS.slice(0, 5).map((item) => (
                            <button
                              key={item.label}
                              onClick={() => item.run ? handleRun(false) : sendChat(item.action!)}
                              disabled={item.run ? loading : chatLoading}
                              className={`text-left text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
                                item.run
                                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 font-medium'
                                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
                              }`}
                              data-testid={`button-quick-${item.label.slice(0, 20)}`}
                            >
                              {item.run && <Cpu className={`inline h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />}
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                            <Globe className="h-3 w-3 text-white" />
                          </div>
                        )}
                        <div className={`max-w-[85%] rounded-xl px-3 py-2 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm'}`}>
                          {msg.images?.map((img, j) => (
                            <img key={j} src={img} alt="upload" className="max-h-32 rounded mb-1 object-cover" />
                          ))}
                          {msg.role === 'user' ? (
                            <p className="text-xs text-white leading-relaxed">{msg.content}</p>
                          ) : (
                            <div className="space-y-0.5">{renderChatContent(msg.content)}</div>
                          )}
                          {msg.role === 'assistant' && (
                            <button
                              onClick={() => navigator.clipboard.writeText(msg.content)}
                              className="mt-1.5 text-[9px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
                              data-testid={`button-copy-${i}`}
                            >
                              <Copy className="h-2.5 w-2.5" /> Copy
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                          <Globe className="h-3 w-3 text-white" />
                        </div>
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-sm">
                          <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </>
                )}
              </div>

              {/* Attached image previews */}
              {chatImages.length > 0 && (
                <div className="px-3 py-2 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex gap-2 flex-wrap shrink-0">
                  {chatImages.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img.dataUrl} alt={img.name} className="h-12 w-12 object-cover rounded-md border border-gray-200 dark:border-gray-600" />
                      <button
                        onClick={() => setChatImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center"
                        data-testid={`button-remove-image-${i}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick actions bar */}
              {chatMessages.length > 0 && (
                <div className="px-3 py-1.5 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex gap-1.5 overflow-x-auto shrink-0">
                  {CHAT_QUICK_ACTIONS.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => item.run ? handleRun(false) : sendChat(item.action!)}
                      disabled={item.run ? loading : chatLoading}
                      className={`text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap transition-colors disabled:opacity-40 shrink-0 ${
                        item.run
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 hover:bg-blue-200'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-blue-50 hover:text-blue-600'
                      }`}
                      data-testid={`button-qa-${item.label.slice(0, 12)}`}
                    >
                      {item.run && <Cpu className={`inline h-2.5 w-2.5 mr-1 ${loading ? 'animate-spin' : ''}`} />}
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="px-3 py-2.5 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shrink-0">
                <div className="flex gap-2 items-end">
                  <input
                    ref={chatFileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleChatFileSelect}
                    data-testid="input-chat-file"
                  />
                  <input
                    ref={ahrefsFileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={handleAhrefsUpload}
                    data-testid="input-ahrefs-file"
                  />
                  <button
                    onClick={() => chatFileInputRef.current?.click()}
                    className="p-2 rounded-md border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-blue-500 hover:border-blue-400 transition-colors shrink-0"
                    title="Attach photo or video"
                    data-testid="button-chat-attach"
                  >
                    <Image className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => ahrefsFileInputRef.current?.click()}
                    disabled={ahrefsUploading}
                    className="p-2 rounded-md border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-green-600 hover:border-green-400 transition-colors shrink-0 disabled:opacity-40"
                    title="Upload Ahrefs keyword CSV — site plan rebuilds automatically"
                    data-testid="button-ahrefs-upload"
                  >
                    {ahrefsUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart2 className="h-4 w-4" />}
                  </button>
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
                    }}
                    placeholder={`Type anything about ${client.businessName}'s website…`}
                    rows={2}
                    className="flex-1 text-xs resize-none rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
                    data-testid="input-chat-message"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={() => sendChat()}
                    disabled={chatLoading || (!chatInput.trim() && chatImages.length === 0)}
                    className="p-2.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                    data-testid="button-chat-send"
                  >
                    {chatLoading ? <Loader2 className="h-4 w-4 text-white animate-spin" /> : <Send className="h-4 w-4 text-white" />}
                  </button>
                </div>
                <p className="text-[9px] text-gray-400 mt-1">Enter to send · Shift+Enter for new line · 📎 attach photos · <span className="text-green-600">📊 upload Ahrefs CSV</span></p>
              </div>
            </div>

            {/* ── RIGHT: Live Preview pane ── */}
            <div className="flex flex-col bg-gray-100 dark:bg-gray-900" style={{ width: '48%' }}>
              {/* Preview header */}
              <div className="flex items-center justify-between px-3 py-2 bg-gray-800 dark:bg-gray-950 border-b border-gray-700 shrink-0">
                <div className="flex items-center gap-2">
                  <Monitor className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-[11px] font-medium text-gray-300">Live Preview</span>
                </div>
                {siteReady && sitePageSlugs.length > 0 && (
                  <select
                    value={chatPreviewSlug || sitePageSlugs[0]}
                    onChange={(e) => setChatPreviewSlug(e.target.value)}
                    className="text-[10px] bg-gray-700 text-gray-200 rounded px-1.5 py-0.5 border border-gray-600 outline-none"
                    data-testid="select-preview-page"
                  >
                    {sitePageSlugs.map(slug => (
                      <option key={slug} value={slug}>{slug === 'home' ? 'Homepage' : slug}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Preview content */}
              <div className="flex-1 overflow-hidden">
                {siteReady ? (
                  <iframe
                    src={`/api/clients/${client.id}/site-preview/${chatPreviewSlug || sitePageSlugs[0]}?orgId=${orgId}`}
                    className="w-full h-full border-0"
                    title="Website preview"
                    data-testid="iframe-site-preview"
                  />
                ) : blueprint ? (
                  <div className="h-full overflow-y-auto bg-white dark:bg-gray-800">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20">
                      <p className="text-[11px] text-yellow-700 dark:text-yellow-300 font-medium">Blueprint preview — generate the site to see the live version</p>
                    </div>
                    {blueprint.pages?.[0]?.sections?.map((section: any, i: number) => (
                      <SectionPreview key={i} section={section} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${loading ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-700'}`}>
                      {loading
                        ? <Cpu className="h-6 w-6 text-blue-500 animate-spin" />
                        : <Monitor className="h-6 w-6 text-gray-400" />
                      }
                    </div>
                    {loading ? (
                      <>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Building site plan…</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[220px]">
                          Reading your GBP services, service areas and site intelligence. This takes 1–2 minutes.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Site plan will appear here</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 max-w-[220px]">
                          Your plan is built automatically from GBP services and service areas. Upload Ahrefs keywords to enrich it.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <EngineHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        orgId={orgId || ''}
        entityCollection="clients"
        entityId={client.id}
        engineType="websiteWorkstream"
      />
    </div>
  );
}

// ─── Small helper components ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
      <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{title}</div>
      {children}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</div>
      <div className="text-sm font-medium text-gray-900 dark:text-white">{value || '—'}</div>
    </div>
  );
}

function SeoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-sm text-gray-800 dark:text-gray-200">{value}</div>
    </div>
  );
}

function SocialChip({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
    >
      {label}
      <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}

function TrackBadge({ label }: { label: string }) {
  return (
    <span className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700 px-2 py-0.5 rounded font-medium">
      {label}
    </span>
  );
}
