import { useState, useCallback, useRef } from 'react';
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
  Smartphone, Monitor,
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

// ─── Main panel ────────────────────────────────────────────────────────────────

export default function WebsiteWorkstreamPanel({ client }: WebsiteWorkstreamPanelProps) {
  const { orgId, authReady, token } = useAuth() as any;
  const dispatch = useDispatch();
  const { toast } = useToast();

  const blueprint: WebsiteBlueprint | null = client.websiteWorkstream?.currentDraft ?? null;
  const isLocked  = !!client.websiteWorkstream?.acceptedVersion;
  const runId     = client.websiteWorkstream?.acceptedVersion ?? null;

  const [open, setOpen]             = useState(true);
  const [loading, setLoading]       = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>({});
  const [activePage, setActivePage]       = useState<string | null>(null);
  const [nudge, setNudge]           = useState('');
  const [showNudge, setShowNudge]   = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [generatingSite, setGeneratingSite] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const generatedSite = client.websiteWorkstream?.generatedSite;
  const siteReady = generatedSite?.status === 'ready' && generatedSite?.pages;
  const sitePageSlugs: string[] = siteReady ? Object.keys(generatedSite.pages) : [];
  const activePreviewSlug = previewSlug || sitePageSlugs[0] || null;

  // ── Enqueue / regenerate ─────────────────────────────────────────────────────

  const handleRun = useCallback(async (force = false) => {
    if (!orgId || !authReady) return;
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

      toast({ title: force ? 'Blueprint regeneration queued' : 'Blueprint generation queued', description: 'This may take a minute or two.' });
      setNudge('');
      setShowNudge(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orgId, authReady, token, client, nudge, toast]);

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
    if (!orgId || !authReady || !blueprint) return;
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
          {/* Toolbar */}
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
              {blueprint ? 'Refresh' : 'Generate Blueprint'}
            </Button>

            {blueprint && (
              <>
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
                  disabled={generatingSite || !blueprint}
                  data-testid="btn-generate-site"
                >
                  {generatingSite
                    ? <><Cpu className="h-3.5 w-3.5 animate-spin" /> Building…</>
                    : <><Zap className="h-3.5 w-3.5" /> {siteReady ? 'Rebuild Site' : 'Build Site'}</>
                  }
                </Button>
              </>
            )}
          </div>

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

          {/* Empty state */}
          {!blueprint && !loading && (
            <div className="text-center py-10 text-gray-500">
              <Globe className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">No blueprint yet</div>
              <div className="text-xs text-gray-400">Generate a Website Blueprint to build out page structure, copy, SEO, and assets.</div>
            </div>
          )}

          {loading && !blueprint && (
            <div className="text-center py-10 text-gray-400">
              <Cpu className="h-7 w-7 mx-auto mb-3 animate-spin text-blue-400" />
              <div className="text-sm">Generating blueprint…</div>
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
                <TabsTrigger value="assets"  className="text-xs h-7 gap-1" data-testid="tab-workstream-assets"><Image className="h-3 w-3" />Assets</TabsTrigger>
                <TabsTrigger value="preview" className="text-xs h-7 gap-1" data-testid="tab-workstream-preview"><Eye className="h-3 w-3" />Preview</TabsTrigger>
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
                {blueprint.pages.map(page => (
                  <Section key={page.key} title={page.title}>
                    <div className="space-y-2 text-sm">
                      <SeoRow label="Title"       value={page.seoMeta.title} />
                      <SeoRow label="Description" value={page.seoMeta.description} />
                      {page.seoMeta.canonical && <SeoRow label="Canonical" value={page.seoMeta.canonical} />}
                      {page.jsonLd && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">JSON-LD</div>
                          <pre className="text-xs bg-gray-50 dark:bg-gray-800 p-2 rounded-lg overflow-x-auto text-gray-700 dark:text-gray-300 max-h-40">
                            {JSON.stringify(page.jsonLd, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </Section>
                ))}
              </TabsContent>

              {/* ── ASSETS ── */}
              <TabsContent value="assets" className="space-y-2">
                <div className="text-xs text-gray-500 mb-2">{blueprint.assets.length} asset{blueprint.assets.length !== 1 ? 's' : ''} required</div>
                {blueprint.assets.length === 0 ? (
                  <div className="text-sm text-gray-500 italic">No assets specified</div>
                ) : (
                  blueprint.assets.map((asset, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg" data-testid={`asset-row-${i}`}>
                      <Image className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{asset.key}</div>
                        <div className="text-xs text-gray-500">{asset.alt}</div>
                        {asset.suggestedSource && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{asset.suggestedSource}</div>
                        )}
                        {asset.placement && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {asset.placement.pageKey} → {asset.placement.sectionKind}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 shrink-0">
                        To source
                      </Badge>
                    </div>
                  ))
                )}

                <Section title="Performance">
                  <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                    <div><span className="font-medium">Image format:</span> {blueprint.performance.images.format}</div>
                    <div><span className="font-medium">Sizes:</span> {blueprint.performance.images.sizes.join(', ')}</div>
                    {blueprint.performance.fonts?.preloads?.length > 0 && (
                      <div><span className="font-medium">Font preloads:</span> {blueprint.performance.fonts.preloads.join(', ')}</div>
                    )}
                  </div>
                </Section>
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
            </Tabs>
          )}
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
