import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, updateLead, patchLead } from '@/store';
import {
  Lead,
  Activity,
  SitemapPage,
  CrawledPage,
  CompetitorSiteData,
  STAGE_LABELS,
} from '@/lib/types';
import {
  Heart,
  Globe,
  MapPin,
  Star,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  FileText,
  Zap,
  Users,
  ExternalLink,
  Eye,
  Pencil,
  Check,
  X,
  Loader2,
  Search,
  ScanLine,
  ChevronDown,
  ChevronUp,
  Tag,
  Link2,
  Image,
  Plus,
  Trash2,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { SiFacebook, SiInstagram, SiLinkedin } from 'react-icons/si';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, differenceInDays, isPast, isToday } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { updateLeadInFirestore } from '@/lib/firestoreService';
import { useToast } from '@/hooks/use-toast';

interface DealIntelligencePanelProps {
  lead: Lead;
}

interface HealthSignal {
  label: string;
  positive: boolean;
  weight: number;
}

function computeDealHealth(lead: Lead, activities: Activity[]): {
  score: number;
  level: 'strong' | 'good' | 'fair' | 'at_risk';
  signals: HealthSignal[];
} {
  const leadActivities = activities.filter(a => a.leadId === lead.id);
  const signals: HealthSignal[] = [];
  let score = 50;

  const callCount = leadActivities.filter(a => a.type === 'call').length;
  const emailCount = leadActivities.filter(a => a.type === 'email').length;
  const meetingCount = leadActivities.filter(a => a.type === 'meeting').length;
  const meetingBookedCount = leadActivities.filter(a => a.type === 'meeting_booked').length;
  const totalActivities = leadActivities.length;

  if (totalActivities === 0) {
    signals.push({ label: 'No activity logged yet', positive: false, weight: -20 });
    score -= 20;
  } else if (totalActivities >= 5) {
    signals.push({ label: `${totalActivities} activities logged`, positive: true, weight: 10 });
    score += 10;
  } else {
    signals.push({ label: `${totalActivities} activities logged`, positive: true, weight: 5 });
    score += 5;
  }

  if (meetingBookedCount > 0 || meetingCount > 0) {
    signals.push({ label: 'Meeting booked or held', positive: true, weight: 15 });
    score += 15;
  }

  if (callCount === 0) {
    signals.push({ label: 'No calls made', positive: false, weight: -10 });
    score -= 10;
  } else if (callCount >= 3) {
    signals.push({ label: `${callCount} calls made`, positive: true, weight: 5 });
    score += 5;
  }

  if (lead.nextContactDate) {
    const nextDate = new Date(lead.nextContactDate);
    if (isPast(nextDate) && !isToday(nextDate)) {
      const daysOverdue = differenceInDays(new Date(), nextDate);
      signals.push({ label: `Follow-up ${daysOverdue}d overdue`, positive: false, weight: -15 });
      score -= 15;
    } else {
      signals.push({ label: 'Follow-up scheduled', positive: true, weight: 5 });
      score += 5;
    }
  } else {
    signals.push({ label: 'No next contact scheduled', positive: false, weight: -10 });
    score -= 10;
  }

  const advancedStages = ['discovery', 'proposal', 'negotiation', 'won'];
  if (advancedStages.includes(lead.stage)) {
    signals.push({ label: `Stage: ${STAGE_LABELS[lead.stage]}`, positive: true, weight: 10 });
    score += 10;
  }

  if (lead.conversationStage && lead.conversationStage !== 'not_started' && lead.conversationStage !== 'attempted') {
    signals.push({ label: 'Conversation progressed', positive: true, weight: 5 });
    score += 5;
  }

  if (lead.mrr && lead.mrr > 0) {
    signals.push({ label: `MRR: $${lead.mrr}/mo`, positive: true, weight: 5 });
    score += 5;
  }

  score = Math.max(0, Math.min(100, score));

  const level = score >= 75 ? 'strong' : score >= 55 ? 'good' : score >= 35 ? 'fair' : 'at_risk';

  return { score, level, signals };
}

function generateDealSummary(lead: Lead, activities: Activity[]): string {
  const parts: string[] = [];

  if (lead.companyName) {
    let intro = `${lead.companyName}`;
    if (lead.territory || lead.areaName) {
      intro += ` is located in ${lead.territory || lead.areaName}`;
    }
    if (lead.sourceData?.googleTypes?.[0]) {
      intro += ` and operates in ${lead.sourceData.googleTypes[0]}`;
    }
    parts.push(intro + '.');
  }

  const leadActivities = activities.filter(a => a.leadId === lead.id);
  if (leadActivities.length > 0) {
    const lastActivity = leadActivities.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    const daysAgo = differenceInDays(new Date(), new Date(lastActivity.createdAt));
    if (daysAgo === 0) {
      parts.push(`Last activity was today (${lastActivity.type}).`);
    } else if (daysAgo === 1) {
      parts.push(`Last activity was yesterday (${lastActivity.type}).`);
    } else {
      parts.push(`Last activity was ${daysAgo} days ago (${lastActivity.type}).`);
    }
  } else {
    parts.push('No activity has been logged yet.');
  }

  if (lead.website && !lead.sourceData?.googlePlaceId) {
    parts.push('Has a website but no Google Business Profile on record — potential visibility opportunity.');
  } else if (!lead.website && lead.sourceData?.googlePlaceId) {
    parts.push('Has a Google presence but no website recorded — potential web opportunity.');
  } else if (!lead.website && !lead.sourceData?.googlePlaceId) {
    parts.push('No website or Google presence on record — strong opportunity for a full digital strategy.');
  } else if (lead.sourceData?.googleRating && lead.sourceData.googleRating < 4.0) {
    parts.push(`Google rating of ${lead.sourceData.googleRating} could be improved — reputation management opportunity.`);
  }

  return parts.join(' ');
}

function getNextBestAction(lead: Lead, activities: Activity[]): { action: string; urgency: 'high' | 'medium' | 'low'; icon: typeof Phone } {
  const leadActivities = activities.filter(a => a.leadId === lead.id);
  const callCount = leadActivities.filter(a => a.type === 'call').length;
  const meetingBooked = leadActivities.filter(a => a.type === 'meeting_booked').length;

  if (leadActivities.length === 0) {
    return { action: 'Log your first contact attempt to get this deal moving', urgency: 'high', icon: Phone };
  }

  if (lead.nextContactDate) {
    const nextDate = new Date(lead.nextContactDate);
    if (isPast(nextDate) && !isToday(nextDate)) {
      return { action: 'Follow-up is overdue — call today before the lead goes cold', urgency: 'high', icon: Phone };
    }
  }

  if (!lead.nextContactDate) {
    return { action: 'Set a next contact date to keep momentum', urgency: 'medium', icon: Calendar };
  }

  if (callCount > 0 && meetingBooked === 0) {
    return { action: 'Book a discovery meeting to advance this deal', urgency: 'medium', icon: Calendar };
  }

  if (!lead.aiCallPrep) {
    return { action: 'Generate call prep to go in prepared', urgency: 'low', icon: FileText };
  }

  if (!lead.aiFollowUp && leadActivities.length >= 2) {
    return { action: 'Draft a follow-up to keep engagement high', urgency: 'low', icon: Mail };
  }

  return { action: 'Continue building the relationship — log your next activity', urgency: 'low', icon: MessageSquare };
}

const HEALTH_COLORS = {
  strong: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800',
  good: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800',
  fair: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800',
  at_risk: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800',
};

const HEALTH_LABELS = {
  strong: 'Strong',
  good: 'Good',
  fair: 'Fair',
  at_risk: 'At Risk',
};

const URGENCY_COLORS = {
  high: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300',
  medium: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300',
  low: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300',
};

export default function DealIntelligencePanel({ lead }: DealIntelligencePanelProps) {
  const activities = useSelector((state: RootState) => state.app.activities);
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [newCompetitor, setNewCompetitor] = useState('');
  const [competitorSitemapLoading, setCompetitorSitemapLoading] = useState<Record<string, boolean>>({});
  const [competitorDeepCrawling, setCompetitorDeepCrawling] = useState<Record<string, boolean>>({});
  const [screenshotCacheBust, setScreenshotCacheBust] = useState<number>(Date.now());
  const [screenshotLoaded, setScreenshotLoaded] = useState(false);
  const [screenshotError, setScreenshotError] = useState(false);
  const [screenshotExpanded, setScreenshotExpanded] = useState(true);
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);
  const prevWebsite = useRef<string | undefined>(undefined);

  // Auto-reset screenshot state when website changes
  useEffect(() => {
    if (lead.website !== prevWebsite.current) {
      prevWebsite.current = lead.website;
      setScreenshotLoaded(false);
      setScreenshotError(false);
      setScreenshotCacheBust(Date.now());
      setScreenshotExpanded(true);
    }
  }, [lead.website]);

  const saveCompetitorDomains = useCallback(async (domains: string[]) => {
    if (!orgId || !authReady) return;
    const updates: Partial<Lead> = { competitorDomains: domains, updatedAt: new Date() };
    dispatch(patchLead({ id: lead.id, updates }));
    await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
  }, [dispatch, lead.id, orgId, authReady]);

  const addCompetitor = useCallback(() => {
    const raw = newCompetitor.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!raw) return;
    const existing = lead.competitorDomains || [];
    if (existing.includes(raw)) { setNewCompetitor(''); return; }
    const updated = [...existing, raw];
    saveCompetitorDomains(updated);
    setNewCompetitor('');
    toast({ title: 'Competitor saved', description: raw });
  }, [newCompetitor, lead.competitorDomains, saveCompetitorDomains, toast]);

  const removeCompetitor = useCallback((domain: string) => {
    const updated = (lead.competitorDomains || []).filter(d => d !== domain);
    saveCompetitorDomains(updated);
  }, [lead.competitorDomains, saveCompetitorDomains]);

  const handleCompetitorSitemapScan = useCallback(async (domain: string) => {
    if (!orgId || !authReady) return;
    setCompetitorSitemapLoading(p => ({ ...p, [domain]: true }));
    try {
      const sitemapUrl = `https://${domain}/sitemap.xml`;
      const res = await fetch(`/api/sitemap?url=${encodeURIComponent(sitemapUrl)}`);
      if (!res.ok) throw new Error('Sitemap fetch failed');
      const data = await res.json();
      const existing = lead.competitorData || {};
      const updated = { ...existing, [domain]: { ...(existing[domain] || {}), sitemapPages: data.pages, sitemapFetchedAt: new Date() } };
      const updates: Partial<Lead> = { competitorData: updated, updatedAt: new Date() };
      dispatch(patchLead({ id: lead.id, updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
      toast({ title: 'Sitemap scanned', description: `${data.pages?.length ?? 0} pages found on ${domain}` });
    } catch {
      toast({ title: 'Scan failed', description: `Could not fetch sitemap for ${domain}`, variant: 'destructive' });
    } finally {
      setCompetitorSitemapLoading(p => ({ ...p, [domain]: false }));
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleCompetitorDeepCrawl = useCallback(async (domain: string) => {
    if (!orgId || !authReady) return;
    const sitemapPages = lead.competitorData?.[domain]?.sitemapPages;
    if (!sitemapPages?.length) {
      toast({ title: 'Scan sitemap first', description: 'Run the sitemap scan before deep crawling', variant: 'destructive' });
      return;
    }
    setCompetitorDeepCrawling(p => ({ ...p, [domain]: true }));
    try {
      const urls = sitemapPages.map((p: SitemapPage) => p.url);
      const res = await fetch('/api/crawl-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, domain }),
      });
      if (!res.ok) throw new Error('Crawl failed');
      const data = await res.json();
      const existing = lead.competitorData || {};
      const updated = { ...existing, [domain]: { ...(existing[domain] || {}), crawledPages: data.crawledPages, crawledAt: new Date() } };
      const updates: Partial<Lead> = { competitorData: updated, updatedAt: new Date() };
      dispatch(patchLead({ id: lead.id, updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
      const success = data.crawledPages.filter((p: any) => !p.error).length;
      toast({ title: 'Deep crawl complete', description: `SEO signals extracted from ${success} pages on ${domain}` });
    } catch {
      toast({ title: 'Crawl failed', description: `Could not crawl ${domain}`, variant: 'destructive' });
    } finally {
      setCompetitorDeepCrawling(p => ({ ...p, [domain]: false }));
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const health = useMemo(() => computeDealHealth(lead, activities), [lead, activities]);
  const summary = useMemo(() => generateDealSummary(lead, activities), [lead, activities]);
  const nextAction = useMemo(() => getNextBestAction(lead, activities), [lead, activities]);

  const handleGBPLookup = useCallback(async (placeId: string) => {
    if (!placeId.trim() || !orgId || !authReady) return;
    try {
      const res = await fetch(`/api/google-places/details/${placeId.trim()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch GBP data');
      }
      const data = await res.json();
      const sourceData: any = {
        ...(lead.sourceData || { source: 'manual' }),
        googlePlaceId: data.placeId || placeId.trim(),
        googleRating: data.rating ?? lead.sourceData?.googleRating,
        googleReviewCount: data.reviewCount ?? lead.sourceData?.googleReviewCount,
        googleTypes: data.types || lead.sourceData?.googleTypes,
        googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${data.placeId || placeId.trim()}`,
        category: data.primaryType || lead.sourceData?.category,
      };
      const leadUpdates: Partial<Lead> = {
        sourceData,
        address: lead.address || data.address || undefined,
        phone: lead.phone || data.phone || undefined,
        website: lead.website || data.website || undefined,
        industry: data.primaryType || lead.industry || undefined,
        updatedAt: new Date(),
      };
      dispatch(patchLead({ id: lead.id, updates: leadUpdates }));
      await updateLeadInFirestore(orgId, lead.id, leadUpdates, authReady);
      toast({
        title: 'GBP Data Loaded',
        description: `${data.reviewCount || 0} reviews · ${data.rating || 'No'} rating · ${data.primaryType || 'Business'}`,
      });
    } catch (err: any) {
      toast({ title: 'Lookup Failed', description: err.message || 'Could not fetch Google Business data', variant: 'destructive' });
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleSitemapFetch = useCallback(async (sitemapUrl: string) => {
    if (!sitemapUrl.trim() || !orgId || !authReady) return;
    try {
      const res = await fetch(`/api/sitemap?url=${encodeURIComponent(sitemapUrl.trim())}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch sitemap');
      }
      const data = await res.json();
      const updates: Partial<Lead> = {
        sitemapUrl: sitemapUrl.trim(),
        sitemapPages: data.pages,
        sitemapFetchedAt: new Date(),
        updatedAt: new Date(),
      };
      dispatch(patchLead({ id: lead.id, updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady);
      toast({
        title: 'Sitemap Captured',
        description: `Found ${data.totalPages} page${data.totalPages !== 1 ? 's' : ''} across ${Object.keys(data.sections || {}).length} section${Object.keys(data.sections || {}).length !== 1 ? 's' : ''}`,
      });
    } catch (err: any) {
      toast({ title: 'Sitemap Failed', description: err.message || 'Could not fetch sitemap', variant: 'destructive' });
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleCrawlPages = useCallback(async () => {
    const pages = lead.sitemapPages;
    if (!pages?.length || !orgId || !authReady) return;
    const urls = pages.map(p => p.url);
    const domain = (() => {
      try { return lead.website ? new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`).hostname : undefined; } catch { return undefined; }
    })();
    try {
      const res = await fetch('/api/crawl-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, domain }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Crawl failed');
      }
      const data = await res.json();
      const updates: Partial<Lead> = {
        crawledPages: data.crawledPages,
        crawledAt: new Date(),
        updatedAt: new Date(),
      };
      dispatch(patchLead({ id: lead.id, updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady);
      const success = data.crawledPages.filter((p: any) => !p.error).length;
      toast({
        title: 'Pages Analysed',
        description: `Extracted SEO signals from ${success} of ${data.crawledPages.length} pages`,
      });
    } catch (err: any) {
      toast({ title: 'Crawl Failed', description: err.message || 'Could not crawl pages', variant: 'destructive' });
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleUpdatePresenceField = useCallback((field: keyof Lead, value: string) => {
    dispatch(updateLead({ ...lead, [field]: value || undefined, updatedAt: new Date() }));
    if (orgId && authReady) {
      if (debounceRef.current[field]) clearTimeout(debounceRef.current[field]);
      debounceRef.current[field] = setTimeout(() => {
        updateLeadInFirestore(orgId, lead.id, { [field]: value || null, updatedAt: new Date() }, authReady)
          .catch(err => console.error(`[DealIntelligencePanel] Failed to save ${field}:`, err));
        delete debounceRef.current[field];
      }, 800);
    }
  }, [dispatch, lead, orgId, authReady]);

  return (
    <div className="p-4 space-y-4" data-testid="deal-intelligence-panel">
      <div className="flex items-center gap-2 mb-1">
        <Eye className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold tracking-tight">Deal Intelligence</h3>
      </div>

      <div className={`rounded-lg border p-3 ${HEALTH_COLORS[health.level]}`} data-testid="card-deal-health">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">Deal Health</span>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold">{health.score}</span>
            <span className="text-xs font-medium">/100</span>
            <Badge variant="outline" className="text-[10px] ml-1 border-current">{HEALTH_LABELS[health.level]}</Badge>
          </div>
        </div>
        <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full mb-2">
          <div
            className="h-full rounded-full bg-current transition-all"
            style={{ width: `${health.score}%` }}
          />
        </div>
        <div className="space-y-0.5">
          {health.signals.slice(0, 4).map((signal, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              {signal.positive ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 opacity-70" />
              ) : (
                <AlertTriangle className="h-3 w-3 shrink-0 opacity-70" />
              )}
              <span>{signal.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3" data-testid="card-deal-summary">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Deal Summary</span>
        </div>
        {summary ? (
          <p className="text-sm text-foreground leading-relaxed">{summary}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Not enough information yet. Log a conversation or generate call prep to build a richer summary.</p>
        )}
      </div>

      <div className="rounded-lg border bg-card p-3" data-testid="card-online-presence">
        <div className="flex items-center gap-1.5 mb-2">
          <Globe className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Online Presence</span>
        </div>
        <div className="space-y-1">
          <EditablePresenceRow
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Industry"
            value={lead.industry || ''}
            placeholder="e.g. Plumbing, Dental, Café"
            onSave={(v) => handleUpdatePresenceField('industry', v)}
          />
          <EditablePresenceRow
            icon={<Globe className="h-3.5 w-3.5" />}
            label="Website"
            value={lead.website || ''}
            placeholder="https://example.com.au"
            link={lead.website}
            onSave={(v) => handleUpdatePresenceField('website', v)}
          />
          <GBPLookupRow
            lead={lead}
            onLookup={handleGBPLookup}
          />
          <EditablePresenceRow
            icon={<SiFacebook className="h-3 w-3" />}
            label="Facebook"
            value={lead.facebookUrl || ''}
            placeholder="https://facebook.com/page"
            link={lead.facebookUrl}
            onSave={(v) => handleUpdatePresenceField('facebookUrl', v)}
          />
          <EditablePresenceRow
            icon={<SiInstagram className="h-3 w-3" />}
            label="Instagram"
            value={lead.instagramUrl || ''}
            placeholder="https://instagram.com/handle"
            link={lead.instagramUrl}
            onSave={(v) => handleUpdatePresenceField('instagramUrl', v)}
          />
          <EditablePresenceRow
            icon={<SiLinkedin className="h-3 w-3" />}
            label="LinkedIn"
            value={lead.linkedinUrl || ''}
            placeholder="https://linkedin.com/company/..."
            link={lead.linkedinUrl}
            onSave={(v) => handleUpdatePresenceField('linkedinUrl', v)}
          />
          <SitemapRow lead={lead} onFetch={handleSitemapFetch} onCrawl={handleCrawlPages} />
        </div>

        {/* Website screenshot preview */}
        {lead.website && (() => {
          const websiteUrl = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
          const thumbUrl = `https://image.thum.io/get/width/800/crop/420/url/${websiteUrl}?cb=${screenshotCacheBust}`;
          const fullUrl = `https://image.thum.io/get/width/1400/url/${websiteUrl}?cb=${screenshotCacheBust}`;
          return (
            <>
              <div className="mt-2.5 rounded-md overflow-hidden border" data-testid="card-website-screenshot">
                {/* Header bar */}
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/40 border-b">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
                    <Image className="h-2.5 w-2.5" /> Website Preview
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-2.5 w-2.5" /> Visit
                    </a>
                    <button
                      onClick={() => {
                        setScreenshotLoaded(false);
                        setScreenshotError(false);
                        setScreenshotCacheBust(Date.now());
                      }}
                      title="Refresh screenshot"
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      data-testid="button-refresh-screenshot"
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                    </button>
                    <button
                      onClick={() => setScreenshotExpanded(e => !e)}
                      title={screenshotExpanded ? 'Collapse' : 'Expand'}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      data-testid="button-toggle-screenshot"
                    >
                      {screenshotExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {/* Collapsible thumbnail — click to open modal */}
                {screenshotExpanded && (
                  !screenshotError ? (
                    <div
                      className="relative bg-muted/10 cursor-zoom-in group"
                      onClick={() => screenshotLoaded && setScreenshotModalOpen(true)}
                      data-testid="button-open-screenshot-modal"
                    >
                      {!screenshotLoaded && (
                        <div className="flex items-center justify-center h-32 bg-muted/20">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      <img
                        src={thumbUrl}
                        alt={`Screenshot of ${lead.companyName} website`}
                        className={`w-full object-cover object-top transition-opacity duration-300 ${screenshotLoaded ? 'opacity-100' : 'opacity-0 h-32'}`}
                        style={{ maxHeight: '180px' }}
                        onLoad={() => setScreenshotLoaded(true)}
                        onError={() => { setScreenshotError(true); setScreenshotLoaded(true); }}
                        data-testid="img-website-screenshot"
                      />
                      {screenshotLoaded && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1">
                            <Eye className="h-3 w-3" /> Click to view full page
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-14 flex items-center justify-center bg-muted/20">
                      <p className="text-[10px] text-muted-foreground">Could not load preview — check the URL is correct</p>
                    </div>
                  )
                )}
              </div>

              {/* Full-page modal */}
              <Dialog open={screenshotModalOpen} onOpenChange={setScreenshotModalOpen}>
                <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
                  <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b bg-muted/40 space-y-0">
                    <DialogTitle className="text-sm font-medium flex items-center gap-2">
                      <Image className="h-3.5 w-3.5" />
                      {lead.companyName} — Website Preview
                    </DialogTitle>
                    <div className="flex items-center gap-3">
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Visit site
                      </a>
                    </div>
                  </DialogHeader>
                  <div className="overflow-y-auto max-h-[80vh]">
                    <img
                      src={fullUrl}
                      alt={`Full screenshot of ${lead.companyName} website`}
                      className="w-full"
                      data-testid="img-website-screenshot-modal"
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </>
          );
        })()}
      </div>

      <div className="rounded-lg border bg-card p-3 space-y-3" data-testid="card-competitor-snapshot">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Competitor Tracking</span>
          {(lead.competitorDomains?.length ?? 0) > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
              {lead.competitorDomains!.length} tracked
            </Badge>
          )}
        </div>

        {/* Add competitor input */}
        <div className="flex gap-1.5">
          <Input
            value={newCompetitor}
            onChange={e => setNewCompetitor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor(); } }}
            placeholder="e.g. besa.au or https://competitor.com"
            className="h-7 text-xs flex-1"
            data-testid="input-new-competitor"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={addCompetitor}
            disabled={!newCompetitor.trim()}
            className="h-7 w-7 p-0 shrink-0"
            data-testid="button-add-competitor"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Saved competitor domains */}
        {(lead.competitorDomains?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {lead.competitorDomains!.map(domain => (
              <CompetitorCard
                key={domain}
                domain={domain}
                siteData={lead.competitorData?.[domain]}
                sitemapLoading={!!competitorSitemapLoading[domain]}
                deepCrawling={!!competitorDeepCrawling[domain]}
                onScanSitemap={() => handleCompetitorSitemapScan(domain)}
                onDeepCrawl={() => handleCompetitorDeepCrawl(domain)}
                onRemove={() => removeCompetitor(domain)}
              />
            ))}
            {/* AI analysis insights if available */}
            {(lead.aiGrowthPlan?.competitor as any)?.insights?.length > 0 && (
              <div className="rounded border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 px-2.5 py-1.5">
                <div className="flex items-center gap-1 mb-1">
                  <BarChart3 className="h-3 w-3 text-amber-600" />
                  <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">AI Gap Insights</span>
                </div>
                {(lead.aiGrowthPlan.competitor as any).insights.slice(0, 2).map((insight: string, i: number) => (
                  <p key={i} className="text-[11px] text-muted-foreground">{insight}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Add competitor domains above to track and analyse them against this lead.</p>
        )}
      </div>

      <div className={`rounded-lg border p-3 ${URGENCY_COLORS[nextAction.urgency]}`} data-testid="card-next-best-action">
        <div className="flex items-center gap-1.5 mb-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">Next Best Action</span>
        </div>
        <div className="flex items-center gap-2">
          <nextAction.icon className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium">{nextAction.action}</p>
        </div>
      </div>
    </div>
  );
}

function PresenceRow({ icon, label, value, fallback, link }: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  fallback?: string;
  link?: string;
}) {
  const displayValue = value || fallback || 'Unknown';
  const hasValue = !!value;

  return (
    <div className="flex items-center gap-2 text-sm py-0.5">
      <span className={`shrink-0 ${hasValue ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {icon}
      </span>
      <span className="text-muted-foreground text-xs w-[76px] shrink-0">{label}</span>
      <span className={`truncate text-xs ${hasValue ? 'text-foreground' : 'text-muted-foreground italic'}`}>
        {link && hasValue ? (
          <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
            {displayValue} <ExternalLink className="h-2.5 w-2.5 inline" />
          </a>
        ) : displayValue}
      </span>
    </div>
  );
}

function EditablePresenceRow({ icon, label, value, placeholder, link, onSave }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder?: string;
  link?: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasValue = !!value;

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="shrink-0 text-amber-600">{icon}</span>
        <span className="text-muted-foreground text-xs w-[76px] shrink-0">{label}</span>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-6 text-xs px-1.5 flex-1 min-w-0"
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); commit(); }}
            className="shrink-0 p-0.5 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancel(); }}
            className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
      onClick={startEditing}
    >
      <span className={`shrink-0 ${hasValue ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {icon}
      </span>
      <span className="text-muted-foreground text-xs w-[76px] shrink-0">{label}</span>
      <span className={`truncate text-xs flex-1 ${hasValue ? 'text-foreground' : 'text-muted-foreground italic'}`}>
        {hasValue ? (
          link ? (
            <a
              href={link.startsWith('http') ? link : `https://${link}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline inline-flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {value} <ExternalLink className="h-2.5 w-2.5 inline" />
            </a>
          ) : value
        ) : (placeholder ? `Add ${label.toLowerCase()}…` : 'Not recorded')}
      </span>
      <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
    </div>
  );
}

interface GBPSearchResult {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number;
  phone: string | null;
  website: string | null;
}

function GBPLookupRow({ lead, onLookup }: { lead: Lead; onLookup: (placeId: string) => Promise<void> }) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GBPSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectLoading, setSelectLoading] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Auto-loaded suggestions (shown inline without entering search mode)
  const [suggestions, setSuggestions] = useState<GBPSearchResult[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  const autoSearched = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasGBP = !!lead.sourceData?.googlePlaceId;
  const reviewCount = lead.sourceData?.googleReviewCount;
  const rating = lead.sourceData?.googleRating;
  const mapsUrl = lead.sourceData?.googleMapsUrl;

  // Auto-search on mount when no GBP linked and lead has a company name
  useEffect(() => {
    if (hasGBP || autoSearched.current || !lead.companyName?.trim()) return;
    autoSearched.current = true;
    setSuggestLoading(true);
    fetch(`/api/google-places/find?query=${encodeURIComponent(lead.companyName.trim())}`)
      .then(r => r.json())
      .then(data => { if (data.results?.length) setSuggestions(data.results.slice(0, 3)); })
      .catch(() => {})
      .finally(() => setSuggestLoading(false));
  }, [hasGBP, lead.companyName]);

  const openSearch = () => {
    setQuery(lead.companyName || '');
    setResults([]);
    setSearchError(null);
    setSearching(true);
    setSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeSearch = () => {
    setSearching(false);
    setResults([]);
    setQuery('');
    setSearchError(null);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setResults([]);
    try {
      const res = await fetch(`/api/google-places/find?query=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.results || []);
      if ((data.results || []).length === 0) setSearchError('No businesses found — try adding a suburb or state.');
    } catch (e: any) {
      setSearchError(e.message || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelect = async (placeId: string) => {
    setSelectLoading(placeId);
    try {
      await onLookup(placeId);
      closeSearch();
      setSuggestions([]);
    } finally {
      setSelectLoading(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') closeSearch();
  };

  if (searching) {
    return (
      <div className="space-y-1.5 py-0.5">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-amber-600"><MapPin className="h-3.5 w-3.5" /></span>
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Business name + suburb…"
            className="h-6 text-xs px-1.5 flex-1"
            disabled={searchLoading}
          />
          <Button
            size="sm"
            className="h-6 px-2 text-xs shrink-0"
            onClick={handleSearch}
            disabled={searchLoading || !query.trim()}
          >
            {searchLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          </Button>
          <button onClick={closeSearch} className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-muted">
            <X className="h-3 w-3" />
          </button>
        </div>
        {searchError && (
          <p className="text-[10px] text-destructive pl-5">{searchError}</p>
        )}
        {results.length > 0 && (
          <div className="border rounded bg-background shadow-sm overflow-hidden ml-5">
            {results.map(r => (
              <button
                key={r.placeId}
                onClick={() => handleSelect(r.placeId)}
                disabled={!!selectLoading}
                className="w-full text-left px-2 py-1.5 hover:bg-muted/60 border-b last:border-b-0 transition-colors disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{r.name}</span>
                  {selectLoading === r.placeId
                    ? <Loader2 className="h-3 w-3 animate-spin shrink-0 text-violet-600" />
                    : r.rating != null && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {r.rating}★ · {r.reviewCount}
                      </span>
                    )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{r.address}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
        onClick={openSearch}
      >
        <span className={`shrink-0 ${hasGBP ? 'text-green-600 dark:text-green-400' : suggestLoading ? 'text-amber-500' : 'text-muted-foreground'}`}>
          {suggestLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
        </span>
        <span className="text-muted-foreground text-xs w-[76px] shrink-0">Google Business</span>
        <span className={`truncate text-xs flex-1 ${hasGBP ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {hasGBP ? (
            mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                Profile linked <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : 'Profile linked'
          ) : suggestLoading ? 'Searching…' : suggestions.length > 0 ? 'Select a match below' : 'Search business name…'}
        </span>
        <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
      </div>

      {/* Auto-loaded suggestions panel */}
      {!hasGBP && !suggestDismissed && suggestions.length > 0 && (
        <div className="ml-5 space-y-0.5">
          <p className="text-[10px] text-muted-foreground mb-1">Is this the right business?</p>
          <div className="border rounded bg-background shadow-sm overflow-hidden">
            {suggestions.map(r => (
              <button
                key={r.placeId}
                onClick={() => handleSelect(r.placeId)}
                disabled={!!selectLoading}
                className="w-full text-left px-2 py-1.5 hover:bg-muted/60 border-b last:border-b-0 transition-colors disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{r.name}</span>
                  {selectLoading === r.placeId
                    ? <Loader2 className="h-3 w-3 animate-spin shrink-0 text-violet-600" />
                    : r.rating != null && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{r.rating}★ · {r.reviewCount}</span>
                    )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{r.address}</p>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <button onClick={openSearch} className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline">
              Not right? Search manually
            </button>
            <button onClick={() => setSuggestDismissed(true)} className="text-[10px] text-muted-foreground hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {hasGBP && (
        <div
          className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
          onClick={openSearch}
        >
          <span className={`shrink-0 ${reviewCount != null ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
            <Star className="h-3.5 w-3.5" />
          </span>
          <span className="text-muted-foreground text-xs w-[76px] shrink-0">Reviews</span>
          <span className={`truncate text-xs flex-1 ${reviewCount != null ? 'text-foreground' : 'text-muted-foreground italic'}`}>
            {reviewCount != null ? `${reviewCount} reviews · ${rating ?? 'N/A'}★` : 'No review data'}
          </span>
          <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
        </div>
      )}
      {!hasGBP && suggestions.length === 0 && !suggestLoading && (
        <div className="flex items-center gap-2 py-0.5">
          <span className="shrink-0 text-muted-foreground"><Star className="h-3.5 w-3.5" /></span>
          <span className="text-muted-foreground text-xs w-[76px] shrink-0">Reviews</span>
          <span className="truncate text-xs text-muted-foreground italic">No review data</span>
        </div>
      )}
    </>
  );
}

function CompetitorCard({
  domain, siteData, sitemapLoading, deepCrawling, onScanSitemap, onDeepCrawl, onRemove,
}: {
  domain: string;
  siteData?: CompetitorSiteData;
  sitemapLoading: boolean;
  deepCrawling: boolean;
  onScanSitemap: () => void;
  onDeepCrawl: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [screenshotLoaded, setScreenshotLoaded] = useState(false);
  const [screenshotError, setScreenshotError] = useState(false);
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);
  const [sitemapExpanded, setSitemapExpanded] = useState(false);
  const [crawlSectionExpanded, setCrawlSectionExpanded] = useState(false);
  const [crawlPageExpanded, setCrawlPageExpanded] = useState<number | null>(null);

  const websiteUrl = `https://${domain}`;
  const thumbUrl = `https://image.thum.io/get/width/800/crop/420/url/${websiteUrl}`;
  const fullUrl = `https://image.thum.io/get/width/1400/url/${websiteUrl}`;
  const pages = siteData?.sitemapPages || [];
  const crawledPages = siteData?.crawledPages || [];
  const successCrawls = crawledPages.filter(p => !p.error);

  return (
    <div className="rounded border bg-muted/20 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/40">
        <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium truncate flex-1 hover:underline"
        >
          {domain}
        </a>
        {pages.length > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">{pages.length} pages</span>
        )}
        {crawledPages.length > 0 && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0">· {successCrawls.length} crawled</span>
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          title={expanded ? 'Collapse' : 'Expand analysis'}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 ml-1"
          data-testid={`button-expand-competitor-${domain}`}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <button
          onClick={onRemove}
          title="Remove"
          className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
          data-testid={`button-remove-competitor-${domain}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Expanded analysis body */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-2 space-y-2.5">

          {/* Screenshot thumbnail */}
          <div className="rounded overflow-hidden border">
            <div className="flex items-center justify-between px-2 py-1 bg-muted/30 border-b">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                <Image className="h-2.5 w-2.5" /> Website Preview
              </span>
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                <ExternalLink className="h-2.5 w-2.5" /> Visit
              </a>
            </div>
            {!screenshotError ? (
              <div className="relative bg-muted/10 cursor-zoom-in group"
                onClick={() => screenshotLoaded && setScreenshotModalOpen(true)}>
                {!screenshotLoaded && (
                  <div className="flex items-center justify-center h-24 bg-muted/20">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                <img
                  src={thumbUrl}
                  alt={`Screenshot of ${domain}`}
                  className={`w-full object-cover object-top transition-opacity duration-300 ${screenshotLoaded ? 'opacity-100' : 'opacity-0 h-24'}`}
                  style={{ maxHeight: '140px' }}
                  onLoad={() => setScreenshotLoaded(true)}
                  onError={() => { setScreenshotError(true); setScreenshotLoaded(true); }}
                />
                {screenshotLoaded && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Click to view full page
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-10 flex items-center justify-center bg-muted/20">
                <p className="text-[10px] text-muted-foreground">Preview unavailable</p>
              </div>
            )}
          </div>

          {/* Screenshot modal */}
          <Dialog open={screenshotModalOpen} onOpenChange={setScreenshotModalOpen}>
            <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
              <DialogHeader className="flex flex-row items-center justify-between px-4 py-3 border-b bg-muted/40 space-y-0">
                <DialogTitle className="text-sm font-medium flex items-center gap-2">
                  <Image className="h-3.5 w-3.5" /> {domain}
                </DialogTitle>
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Visit site
                </a>
              </DialogHeader>
              <div className="overflow-y-auto max-h-[80vh]">
                <img src={fullUrl} alt={`Full screenshot of ${domain}`} className="w-full" />
              </div>
            </DialogContent>
          </Dialog>

          {/* Sitemap section */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className={`h-3 w-3 shrink-0 ${pages.length > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
              <span className={`text-[11px] flex-1 ${pages.length > 0 ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {pages.length > 0
                  ? `${pages.length} pages in sitemap`
                  : 'Sitemap not scanned'}
              </span>
              <button
                onClick={onScanSitemap}
                disabled={sitemapLoading}
                className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50 flex items-center gap-0.5"
                data-testid={`button-scan-sitemap-${domain}`}
              >
                {sitemapLoading ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Scanning…</> : pages.length > 0 ? 'Refresh' : 'Scan now'}
              </button>
            </div>
            {pages.length > 0 && (
              <>
                <button
                  onClick={() => setSitemapExpanded(e => !e)}
                  className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 ml-4"
                >
                  {sitemapExpanded ? 'Hide pages' : `View ${pages.length} pages`}
                  {siteData?.sitemapFetchedAt && (
                    <span className="text-muted-foreground">· {format(new Date(siteData.sitemapFetchedAt), 'dd/MM/yy')}</span>
                  )}
                </button>
                {sitemapExpanded && (
                  <div className="ml-4 bg-muted/40 rounded border p-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                    {pages.slice(0, 30).map((p, i) => (
                      <div key={i} className="text-[10px] text-foreground/70 truncate">
                        {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </div>
                    ))}
                    {pages.length > 30 && <p className="text-[9px] text-muted-foreground">+{pages.length - 30} more</p>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Deep crawl section */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ScanLine className={`h-3 w-3 shrink-0 ${crawledPages.length > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`} />
              <span className={`text-[11px] flex-1 ${crawledPages.length > 0 ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {crawledPages.length > 0
                  ? `${successCrawls.length} pages analysed · SEO signals extracted`
                  : pages.length > 0 ? 'Deep crawl not yet run' : 'Scan sitemap first'}
              </span>
              {pages.length > 0 && (
                <button
                  onClick={onDeepCrawl}
                  disabled={deepCrawling || sitemapLoading}
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50 flex items-center gap-0.5"
                  data-testid={`button-deep-crawl-${domain}`}
                >
                  {deepCrawling ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Crawling…</> : crawledPages.length > 0 ? 'Re-crawl' : 'Crawl pages'}
                </button>
              )}
            </div>
            {crawledPages.length > 0 && (
              <>
                <button
                  onClick={() => setCrawlSectionExpanded(e => !e)}
                  className="w-full flex items-center justify-between text-[9px] text-muted-foreground hover:text-foreground transition-colors ml-4"
                  style={{ width: 'calc(100% - 1rem)' }}
                >
                  <span>{siteData?.crawledAt ? `Analysed ${format(new Date(siteData.crawledAt), 'dd/MM/yy HH:mm')}` : 'Analysed'}</span>
                  <span className="flex items-center gap-0.5">
                    {crawlSectionExpanded ? <><ChevronUp className="h-2.5 w-2.5" /> Hide</> : <><ChevronDown className="h-2.5 w-2.5" /> Show pages</>}
                  </span>
                </button>
                {crawlSectionExpanded && (
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {crawledPages.map((cp, idx) => {
                      const path = (() => { try { return new URL(cp.url).pathname || '/'; } catch { return cp.url; } })();
                      const isOpen = crawlPageExpanded === idx;
                      return (
                        <div key={idx} className="rounded border bg-muted/30 overflow-hidden">
                          <button
                            onClick={() => setCrawlPageExpanded(isOpen ? null : idx)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/60 transition-colors"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cp.error ? 'bg-red-400' : 'bg-emerald-400'}`} />
                            <span className="text-[10px] text-foreground/80 truncate flex-1">{path}</span>
                            {isOpen ? <ChevronUp className="h-2.5 w-2.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
                          </button>
                          {isOpen && (
                            <div className="px-2 pb-2 space-y-1.5 text-[10px]">
                              {cp.error ? <p className="text-red-500">{cp.error}</p> : (
                                <>
                                  {cp.title && <div><p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Title</p><p className="text-foreground/90">{cp.title}</p></div>}
                                  {cp.metaDescription && <div><p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Meta</p><p className="text-foreground/70">{cp.metaDescription}</p></div>}
                                  {cp.h1 && <div><p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H1</p><p className="text-foreground/90 font-medium">{cp.h1}</p></div>}
                                  {cp.h2s && cp.h2s.length > 0 && (
                                    <div>
                                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H2 Headings</p>
                                      <ul className="space-y-0.5">{cp.h2s.map((h, i) => <li key={i} className="text-foreground/70">· {h}</li>)}</ul>
                                    </div>
                                  )}
                                  {cp.bodyText && <div><p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Body Snippet</p><p className="text-foreground/60 line-clamp-3">{cp.bodyText}</p></div>}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SitemapRow({ lead, onFetch, onCrawl }: { lead: Lead; onFetch: (url: string) => Promise<void>; onCrawl: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [crawlExpanded, setCrawlExpanded] = useState<number | null>(null);
  const [crawlSectionExpanded, setCrawlSectionExpanded] = useState(false);

  const hasSitemap = (lead.sitemapPages?.length ?? 0) > 0;
  const pages = lead.sitemapPages || [];
  const fetchedAt = lead.sitemapFetchedAt;
  const crawledPages = lead.crawledPages || [];
  const crawledAt = lead.crawledAt;
  const hasCrawl = crawledPages.length > 0;

  const derivedSitemapUrl = (() => {
    const w = lead.website?.trim();
    if (!w) return null;
    try {
      const base = new URL(w.startsWith('http') ? w : `https://${w}`);
      return `${base.origin}/sitemap.xml`;
    } catch { return null; }
  })();

  const handleFetch = async () => {
    if (!derivedSitemapUrl) return;
    setLoading(true);
    try { await onFetch(derivedSitemapUrl); } finally { setLoading(false); }
  };

  const handleCrawl = async () => {
    setCrawling(true);
    try { await onCrawl(); } finally { setCrawling(false); }
  };

  const sections = pages.reduce<Record<string, SitemapPage[]>>((acc, p) => {
    try {
      const parts = new URL(p.url).pathname.split('/').filter(Boolean);
      const section = parts.length > 0 ? `/${parts[0]}` : '/';
      if (!acc[section]) acc[section] = [];
      acc[section].push(p);
    } catch { /* skip */ }
    return acc;
  }, {});

  const successCrawls = crawledPages.filter(p => !p.error);

  return (
    <div className="space-y-1">
      {/* Sitemap row */}
      <div className="flex items-center gap-2 py-0.5">
        <span className={`shrink-0 ${hasSitemap ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
          <FileText className="h-3.5 w-3.5" />
        </span>
        <span className="text-muted-foreground text-xs w-[76px] shrink-0">Sitemap</span>
        <span className={`truncate text-xs flex-1 ${hasSitemap ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {hasSitemap ? `${pages.length} pages captured` : derivedSitemapUrl ? 'Not yet scanned' : 'Add a website first'}
        </span>
        {derivedSitemapUrl && (
          <button
            onClick={handleFetch}
            disabled={loading || crawling}
            className="shrink-0 flex items-center gap-0.5 text-[10px] text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Scanning…</>
              : hasSitemap ? 'Refresh' : 'Scan now'}
          </button>
        )}
      </div>

      {hasSitemap && (
        <div className="ml-[calc(1rem+0.5rem+76px+0.5rem)] space-y-1">
          {/* Pages list toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
          >
            {expanded ? 'Hide pages' : `View ${pages.length} pages`}
            {fetchedAt && <span className="text-muted-foreground">· {format(new Date(fetchedAt), 'dd/MM/yy')}</span>}
          </button>

          {expanded && (
            <div className="bg-muted/40 rounded border p-2 space-y-2 max-h-40 overflow-y-auto">
              {Object.entries(sections).slice(0, 20).map(([section, sectionPages]) => (
                <div key={section}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                    {section} <span className="font-normal normal-case">({sectionPages.length})</span>
                  </p>
                  {sectionPages.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center gap-1 py-0.5">
                      <span className="text-[10px] text-foreground/70 truncate flex-1">
                        {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </span>
                      {p.lastmod && (
                        <span className="text-[9px] text-muted-foreground shrink-0">{p.lastmod.slice(0, 10)}</span>
                      )}
                    </div>
                  ))}
                  {sectionPages.length > 5 && (
                    <p className="text-[9px] text-muted-foreground">+{sectionPages.length - 5} more</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Deep Crawl row */}
          <div className="flex items-center gap-2 pt-0.5">
            <ScanLine className={`h-3 w-3 shrink-0 ${hasCrawl ? 'text-emerald-500' : 'text-muted-foreground'}`} />
            <span className={`text-[10px] flex-1 ${hasCrawl ? 'text-foreground' : 'text-muted-foreground italic'}`}>
              {hasCrawl
                ? `${successCrawls.length} pages analysed · SEO signals extracted`
                : 'Deep crawl not yet run'}
            </span>
            <button
              onClick={handleCrawl}
              disabled={crawling || loading}
              data-testid="button-crawl-pages"
              className="shrink-0 flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
            >
              {crawling
                ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Crawling…</>
                : hasCrawl ? 'Re-crawl' : 'Crawl pages'}
            </button>
          </div>

          {/* Crawled pages results */}
          {hasCrawl && (
            <div className="space-y-1 mt-1">
              <button
                onClick={() => setCrawlSectionExpanded(e => !e)}
                className="w-full flex items-center justify-between text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-toggle-crawl-pages"
              >
                <span>{crawledAt ? `Analysed ${format(new Date(crawledAt), 'dd/MM/yy HH:mm')}` : 'Pages analysed'}</span>
                <span className="flex items-center gap-0.5 text-[9px]">
                  {crawlSectionExpanded ? <><ChevronUp className="h-2.5 w-2.5" /> Hide</> : <><ChevronDown className="h-2.5 w-2.5" /> Show pages</>}
                </span>
              </button>
              {crawlSectionExpanded && (<div className="space-y-1 max-h-80 overflow-y-auto">
                {crawledPages.map((cp, idx) => {
                  const path = (() => { try { return new URL(cp.url).pathname || '/'; } catch { return cp.url; } })();
                  const isOpen = crawlExpanded === idx;
                  return (
                    <div key={idx} className="rounded border bg-muted/30 overflow-hidden">
                      <button
                        onClick={() => setCrawlExpanded(isOpen ? null : idx)}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/60 transition-colors"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cp.error ? 'bg-red-400' : 'bg-emerald-400'}`} />
                        <span className="text-[10px] text-foreground/80 truncate flex-1">{path}</span>
                        {isOpen ? <ChevronUp className="h-2.5 w-2.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-2 pb-2 space-y-1.5 text-[10px]">
                          {cp.error ? (
                            <p className="text-red-500">{cp.error}</p>
                          ) : (
                            <>
                              {cp.title && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Title</p>
                                  <p className="text-foreground/90">{cp.title}</p>
                                </div>
                              )}
                              {cp.metaDescription && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Meta Description</p>
                                  <p className="text-foreground/70">{cp.metaDescription}</p>
                                </div>
                              )}
                              {cp.h1 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H1</p>
                                  <p className="text-foreground/90 font-medium">{cp.h1}</p>
                                </div>
                              )}
                              {cp.h2s && cp.h2s.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H2 Headings</p>
                                  <ul className="space-y-0.5">
                                    {cp.h2s.map((h, i) => <li key={i} className="text-foreground/70">· {h}</li>)}
                                  </ul>
                                </div>
                              )}
                              {cp.h3s && cp.h3s.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H3 Headings</p>
                                  <ul className="space-y-0.5">
                                    {cp.h3s.map((h, i) => <li key={i} className="text-foreground/70">· {h}</li>)}
                                  </ul>
                                </div>
                              )}
                              {cp.bodyText && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Body Text Snippet</p>
                                  <p className="text-foreground/60 line-clamp-3">{cp.bodyText}</p>
                                </div>
                              )}
                              {cp.imageAlts && cp.imageAlts.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-0.5"><Image className="h-2.5 w-2.5" /> Image Alt Tags</p>
                                  <ul className="space-y-0.5">
                                    {cp.imageAlts.slice(0, 5).map((a, i) => <li key={i} className="text-foreground/70">· {a}</li>)}
                                  </ul>
                                </div>
                              )}
                              {cp.schemaTypes && cp.schemaTypes.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-0.5"><Tag className="h-2.5 w-2.5" /> Schema Types</p>
                                  <div className="flex flex-wrap gap-1">
                                    {cp.schemaTypes.map((s, i) => (
                                      <span key={i} className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded px-1 py-0.5 text-[9px]">{s}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {cp.internalLinks && cp.internalLinks.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-0.5"><Link2 className="h-2.5 w-2.5" /> Internal Links ({cp.internalLinks.length})</p>
                                  <ul className="space-y-0.5">
                                    {cp.internalLinks.slice(0, 6).map((l, i) => <li key={i} className="text-foreground/60 truncate">· {l}</li>)}
                                    {cp.internalLinks.length > 6 && <li className="text-muted-foreground">+{cp.internalLinks.length - 6} more</li>}
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
