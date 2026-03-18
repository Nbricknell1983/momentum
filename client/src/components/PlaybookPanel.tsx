import { useState, useCallback } from 'react';
import {
  BookOpen, ChevronDown, ChevronUp, Star, Search, Globe, BarChart3,
  Layers, Play, CheckCircle2, Clock, TrendingUp, AlertTriangle,
  Pause, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/contexts/AuthContext';
import { updateClient } from '@/store/index';
import { Client, GrowthPlay, AppliedPlay, GrowthPlayAction } from '@/lib/types';
import { addClientAIAction, updateClientInFirestore } from '@/lib/firestoreService';
import { format } from 'date-fns';

// ─── Predefined Play Library ──────────────────────────────────────────────────

const PLAY_LIBRARY: GrowthPlay[] = [
  {
    id: 'review-velocity-sprint',
    name: 'Review Velocity Sprint',
    category: 'gbp',
    tagline: '30-day push to 20+ reviews',
    description: 'A focused 30-day campaign to dramatically grow Google review count, increase rating, and establish a consistent review response habit.',
    estimatedDuration: '30 days',
    prerequisites: ['Google Business Profile exists'],
    expectedOutcomes: ['10+ new reviews', 'Improved star rating', 'Higher local pack visibility'],
    actions: [
      { engine: 'gbp', action: 'Set up automated review request sequence for recent customers', reason: 'Consistent review requests are the #1 driver of review growth' },
      { engine: 'gbp', action: 'Respond to all existing unanswered reviews (positive and negative)', reason: 'Response rate signals active management to Google' },
      { engine: 'gbp', action: 'Create a QR code review card for in-person or invoice delivery', reason: 'Physical touchpoints convert satisfied customers to reviewers' },
      { engine: 'system', action: 'Add review link to email signature and follow-up messages', reason: 'Every customer interaction is a review opportunity' },
    ],
  },
  {
    id: 'gbp-domination-play',
    name: 'GBP Domination Play',
    category: 'gbp',
    tagline: 'Full profile optimisation in 14 days',
    description: 'A systematic audit and optimisation of every GBP field, category, service, and attribute to maximise local search visibility.',
    estimatedDuration: '14 days',
    prerequisites: ['GBP Engine report run'],
    expectedOutcomes: ['Higher profile completeness score', 'Improved category relevance', 'More discovery impressions'],
    actions: [
      { engine: 'gbp', action: 'Optimise business description with primary keyword and location signals', reason: 'Description is indexed by Google and influences relevance' },
      { engine: 'gbp', action: 'Add all secondary categories relevant to services offered', reason: 'Secondary categories expand search query coverage significantly' },
      { engine: 'gbp', action: 'Complete all service listings with descriptions and prices', reason: 'Service completeness increases conversion from profile views' },
      { engine: 'gbp', action: 'Upload 20+ photos including team, premises, and work examples', reason: 'Photo volume correlates with maps pack visibility' },
      { engine: 'gbp', action: 'Set up weekly GBP post schedule (offers, updates, events)', reason: 'Regular posts signal active business to Google algorithm' },
    ],
  },
  {
    id: 'local-seo-foundation',
    name: 'Local SEO Foundation',
    category: 'seo',
    tagline: 'Build the page structure that ranks',
    description: 'Create the core service and location page architecture that Google needs to understand and rank this business for local searches.',
    estimatedDuration: '60 days',
    prerequisites: ['SEO Engine report run'],
    expectedOutcomes: ['5-10 new ranking opportunities', 'Improved organic visibility', 'More local keyword coverage'],
    actions: [
      { engine: 'seo', action: 'Create dedicated service pages for each core service with optimised content', reason: 'Dedicated service pages are required to rank for specific service keywords' },
      { engine: 'seo', action: 'Build location landing pages for each service area / suburb combination', reason: 'Location pages are the primary driver of local organic rankings' },
      { engine: 'seo', action: 'Optimise all meta titles and descriptions with primary keywords', reason: 'Meta data directly influences click-through rate from search results' },
      { engine: 'seo', action: 'Add LocalBusiness schema markup to homepage and location pages', reason: 'Schema markup helps Google understand business context' },
      { engine: 'seo', action: 'Build internal linking structure between service and location pages', reason: 'Internal links distribute page authority and improve crawlability' },
    ],
  },
  {
    id: 'website-conversion-fix',
    name: 'Website Conversion Fix',
    category: 'website',
    tagline: 'Fix the top 3 leaks losing leads',
    description: 'Target the highest-impact conversion issues on the website — CTA visibility, phone accessibility, and trust signals — to immediately improve lead capture rate.',
    estimatedDuration: '7-14 days',
    prerequisites: ['Website Engine report run'],
    expectedOutcomes: ['Higher contact form submissions', 'More phone calls from website', 'Improved conversion rate'],
    actions: [
      { engine: 'website', action: 'Add click-to-call phone button above the fold on mobile', reason: 'Mobile visitors convert most via phone — this must be immediately visible' },
      { engine: 'website', action: 'Rewrite primary CTA copy to be outcome-focused (not "Contact Us")', reason: 'Specific CTAs convert 2-3x better than generic ones' },
      { engine: 'website', action: 'Add customer testimonials and star rating to homepage hero section', reason: 'Social proof at the decision point reduces friction' },
      { engine: 'website', action: 'Create a dedicated thank-you page with next steps after form submission', reason: 'Thank-you pages enable conversion tracking and reduce dropout' },
    ],
  },
  {
    id: 'maps-pack-breakthrough',
    name: 'Maps Pack Breakthrough',
    category: 'multi',
    tagline: 'Target 3-pack position for primary keyword',
    description: 'A combined GBP + SEO campaign specifically targeting a top-3 maps pack position for the most valuable local keyword.',
    estimatedDuration: '90 days',
    prerequisites: ['GBP Engine report run', 'SEO Engine report run'],
    expectedOutcomes: ['Top-3 maps pack position', 'Significant increase in GBP views', 'More direct calls from Google Maps'],
    actions: [
      { engine: 'gbp', action: 'Optimise GBP primary category and description for target keyword', reason: 'Primary category and keyword alignment is the top maps pack ranking factor' },
      { engine: 'seo', action: 'Create primary landing page targeting the maps pack keyword', reason: 'Website authority for the keyword boosts GBP relevance' },
      { engine: 'gbp', action: 'Build 20+ new reviews mentioning the target service and location', reason: 'Review velocity and keyword mentions are key proximity + relevance signals' },
      { engine: 'seo', action: 'Build local citation consistency across top 10 Australian directories', reason: 'Citation NAP consistency is a core local SEO ranking signal' },
      { engine: 'gbp', action: 'Publish weekly posts targeting the primary keyword phrase', reason: 'Post activity signals relevance to Google for that keyword' },
    ],
  },
  {
    id: 'paid-search-launch',
    name: 'Paid Search Launch',
    category: 'ads',
    tagline: 'First Google Ads campaign live in 30 days',
    description: 'Set up the foundations for a profitable Google Ads campaign: conversion tracking, campaign structure, keyword groups, and negative keyword list.',
    estimatedDuration: '30 days',
    prerequisites: ['Ads Engine report run', 'Website exists'],
    expectedOutcomes: ['First paid leads within 7 days of launch', 'Conversion tracking active', 'Optimised campaign structure'],
    actions: [
      { engine: 'ads', action: 'Install Google Ads conversion tracking on contact form and phone', reason: 'Conversion data is required for Smart Bidding to work effectively' },
      { engine: 'ads', action: 'Build Search campaigns for primary service keywords', reason: 'Search campaigns target high-intent buyers actively searching now' },
      { engine: 'ads', action: 'Build comprehensive negative keyword list from SEO research', reason: 'Negatives prevent budget waste on irrelevant searches' },
      { engine: 'ads', action: 'Create dedicated landing pages for each campaign ad group', reason: 'Matching landing pages to ad intent improves Quality Score and conversion rate' },
      { engine: 'ads', action: 'Set up remarketing audience for website visitors', reason: 'Remarketing converts warm traffic at a fraction of cold traffic cost' },
    ],
  },
  {
    id: 'content-authority-build',
    name: 'Content Authority Build',
    category: 'seo',
    tagline: '90-day content plan for organic authority',
    description: 'A structured 90-day content creation programme — FAQ pages, how-to guides, and service posts — to build topical authority and long-tail organic traffic.',
    estimatedDuration: '90 days',
    prerequisites: ['SEO Engine report run'],
    expectedOutcomes: ['10+ new organic ranking keywords', 'Increased domain authority', 'More long-tail search visibility'],
    actions: [
      { engine: 'seo', action: 'Create a comprehensive FAQ page targeting common customer questions', reason: 'FAQ pages capture long-tail queries and earn featured snippets' },
      { engine: 'seo', action: 'Publish 2 service-specific blog posts per month for 90 days', reason: 'Consistent content signals topical authority to Google' },
      { engine: 'seo', action: 'Build industry-specific how-to guides for the top 3 services', reason: 'Guides attract backlinks and establish the brand as an authority' },
      { engine: 'seo', action: 'Add a "Resources" section to the website with content hub structure', reason: 'Content hubs improve internal linking and signal expertise depth' },
    ],
  },
  {
    id: 'trust-signal-sprint',
    name: 'Trust Signal Sprint',
    category: 'multi',
    tagline: 'Add social proof across all channels in 14 days',
    description: 'A 14-day sprint to add testimonials, case studies, and review embeds across the website and GBP profile, improving conversion across all channels.',
    estimatedDuration: '14 days',
    prerequisites: ['Website Engine report run'],
    expectedOutcomes: ['Higher website conversion rate', 'Stronger first impression', 'More confident buyer decisions'],
    actions: [
      { engine: 'website', action: 'Add a testimonials section with 5+ real client quotes and photos', reason: 'Social proof from similar customers reduces purchase hesitation' },
      { engine: 'website', action: 'Create 1-2 case study pages showing before/after results', reason: 'Case studies are the highest-converting trust content for service businesses' },
      { engine: 'gbp', action: 'Embed Google Reviews widget on the homepage using review schema', reason: 'Embedded reviews reinforce trust and improve schema markup' },
      { engine: 'website', action: 'Add credibility badges (years in business, certifications, associations)', reason: 'Credentials reduce risk perception for first-time buyers' },
    ],
  },
];

// ─── Config ───────────────────────────────────────────────────────────────────

const CAT_CONFIG: Record<GrowthPlay['category'], { label: string; icon: typeof Star; color: string; bg: string }> = {
  gbp:     { label: 'GBP',     icon: Star,    color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
  seo:     { label: 'SEO',     icon: Search,  color: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-950/30' },
  website: { label: 'Website', icon: Globe,   color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  ads:     { label: 'Ads',     icon: BarChart3,color: 'text-orange-600 dark:text-orange-400',bg: 'bg-orange-50 dark:bg-orange-950/30' },
  multi:   { label: 'Multi',   icon: Layers,  color: 'text-emerald-600 dark:text-emerald-400',bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
};

const PLAY_STATUS_CONFIG: Record<AppliedPlay['status'], { label: string; icon: typeof CheckCircle2; cls: string }> = {
  active:   { label: 'Active',   icon: Play,        cls: 'text-emerald-600 dark:text-emerald-400' },
  complete: { label: 'Complete', icon: CheckCircle2, cls: 'text-blue-600 dark:text-blue-400' },
  paused:   { label: 'Paused',   icon: Pause,        cls: 'text-amber-600 dark:text-amber-400' },
};

function fmtDate(d?: Date | string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yyyy'); } catch { return ''; }
}

// ─── Prerequisite check ───────────────────────────────────────────────────────

function checkPrerequisite(prereq: string, client: Client): boolean {
  const p = prereq.toLowerCase();
  if (p.includes('gbp engine')) return !!client.gbpEngine;
  if (p.includes('seo engine')) return !!client.seoEngine;
  if (p.includes('website engine')) return !!client.websiteEngine;
  if (p.includes('ads engine')) return !!client.adsEngine;
  if (p.includes('google business')) return !!(client.businessProfile?.reviewCount != null || client.gbpLocationName);
  if (p.includes('website exists')) return !!(client.website || client.clientOnboarding?.currentWebsiteUrl);
  return true;
}

// ─── Play card ────────────────────────────────────────────────────────────────

interface PlayCardProps {
  play: GrowthPlay;
  client: Client;
  applied: AppliedPlay | null;
  applying: boolean;
  onApply: (play: GrowthPlay) => void;
  onToggleStatus: (playId: string, status: AppliedPlay['status']) => void;
}

function PlayCard({ play, client, applied, applying, onApply, onToggleStatus }: PlayCardProps) {
  const [open, setOpen] = useState(false);
  const cat = CAT_CONFIG[play.category];
  const CatIcon = cat.icon;

  const prereqsMet = play.prerequisites.map(p => ({ text: p, met: checkPrerequisite(p, client) }));
  const allMet = prereqsMet.every(p => p.met);
  const statusCfg = applied ? PLAY_STATUS_CONFIG[applied.status] : null;
  const StatusIcon = statusCfg?.icon;

  return (
    <div className={`border rounded-lg overflow-hidden ${applied ? 'border-emerald-200 dark:border-emerald-800' : ''}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
        data-testid={`playbook-play-${play.id}`}
      >
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cat.color} ${cat.bg} shrink-0`}>
          {cat.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{play.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{play.tagline}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {applied && StatusIcon && (
            <StatusIcon className={`h-3.5 w-3.5 ${statusCfg?.cls}`} />
          )}
          <span className="text-[10px] text-muted-foreground">{play.estimatedDuration}</span>
          {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t px-3 py-2.5 space-y-3 bg-muted/10">
          <p className="text-xs text-muted-foreground leading-relaxed">{play.description}</p>

          {/* Prerequisites */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Prerequisites</p>
            <div className="space-y-1">
              {prereqsMet.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  {p.met
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                    : <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                  <span className={p.met ? 'text-foreground' : 'text-muted-foreground'}>{p.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Expected outcomes */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Expected Outcomes</p>
            <ul className="space-y-0.5">
              {play.expectedOutcomes.map((o, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0" />
                  {o}
                </li>
              ))}
            </ul>
          </div>

          {/* Actions to queue */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Actions ({play.actions.length}) — will be queued in AI Actions feed
            </p>
            <ul className="space-y-1">
              {play.actions.map((a, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="mt-1 h-1 w-1 rounded-full bg-current shrink-0 opacity-50" />
                  {a.action}
                </li>
              ))}
            </ul>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            {!applied ? (
              <Button
                size="sm" className="h-7 px-3 text-xs gap-1.5"
                disabled={applying || !allMet}
                onClick={() => onApply(play)}
                data-testid={`btn-apply-play-${play.id}`}
              >
                {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                {applying ? 'Applying…' : 'Apply Play'}
              </Button>
            ) : (
              <>
                {applied.status === 'active' && (
                  <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={() => onToggleStatus(play.id, 'paused')}>
                    Pause Play
                  </Button>
                )}
                {applied.status === 'paused' && (
                  <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={() => onToggleStatus(play.id, 'active')}>
                    Resume Play
                  </Button>
                )}
                {applied.status !== 'complete' && (
                  <Button variant="ghost" size="sm" className="h-7 px-3 text-xs" onClick={() => onToggleStatus(play.id, 'complete')}>
                    Mark Complete
                  </Button>
                )}
                {applied.appliedAt && (
                  <span className="text-[10px] text-muted-foreground ml-auto">Applied {fmtDate(applied.appliedAt)}</span>
                )}
              </>
            )}
            {!allMet && !applied && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 ml-1">
                Run missing engine reports first
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type CategoryFilter = 'all' | GrowthPlay['category'];

interface Props { client: Client }

export default function PlaybookPanel({ client }: Props) {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [applying, setApplying] = useState<string | null>(null);
  const { toast } = useToast();
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();

  const appliedPlays = client.appliedPlays || [];
  const activeCount = appliedPlays.filter(p => p.status === 'active').length;

  const filtered = filter === 'all' ? PLAY_LIBRARY : PLAY_LIBRARY.filter(p => p.category === filter);

  const handleApply = useCallback(async (play: GrowthPlay) => {
    if (!orgId || !authReady) return;
    setApplying(play.id);
    try {
      const queuedIds: string[] = [];
      for (const action of play.actions) {
        const id = await addClientAIAction(orgId, client.id, {
          engine: action.engine,
          action: action.action,
          reason: `[${play.name}] ${action.reason}`,
          status: 'queued',
          createdAt: new Date(),
        }, authReady);
        queuedIds.push(id);
      }
      const newPlay: AppliedPlay = {
        playId: play.id,
        appliedAt: new Date(),
        status: 'active',
        queuedActionIds: queuedIds,
      };
      const existing = client.appliedPlays || [];
      const updates = { appliedPlays: [...existing, newPlay] };
      await updateClientInFirestore(orgId, client.id, updates).catch(console.error);
      dispatch(updateClient({ id: client.id, updates }));
      toast({ title: `"${play.name}" applied`, description: `${play.actions.length} actions queued in the AI Actions feed` });
    } catch (err: any) {
      toast({ title: 'Failed to apply play', description: err.message, variant: 'destructive' });
    } finally {
      setApplying(null);
    }
  }, [orgId, authReady, client, dispatch, toast]);

  const handleToggleStatus = useCallback(async (playId: string, newStatus: AppliedPlay['status']) => {
    if (!orgId || !authReady) return;
    const existing = client.appliedPlays || [];
    const updates = {
      appliedPlays: existing.map(p => p.playId === playId ? { ...p, status: newStatus } : p),
    };
    dispatch(updateClient({ id: client.id, updates }));
    updateClientInFirestore(orgId, client.id, updates).catch(console.error);
  }, [orgId, authReady, client, dispatch]);

  const FILTERS: { value: CategoryFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'gbp', label: 'GBP' },
    { value: 'seo', label: 'SEO' },
    { value: 'website', label: 'Website' },
    { value: 'ads', label: 'Ads' },
    { value: 'multi', label: 'Multi' },
  ];

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="card-playbook-panel">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors"
        data-testid="toggle-playbook-panel"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold">Growth Playbook</span>
          {activeCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
              {activeCount} active {activeCount === 1 ? 'play' : 'plays'}
            </span>
          )}
          {activeCount === 0 && (
            <span className="text-xs text-muted-foreground italic">{PLAY_LIBRARY.length} plays available</span>
          )}
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t">
          {/* Filter row */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/20 overflow-x-auto">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                  filter === f.value
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                data-testid={`playbook-filter-${f.value}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Play list */}
          <div className="p-3 space-y-2">
            {filtered.map(play => (
              <PlayCard
                key={play.id}
                play={play}
                client={client}
                applied={appliedPlays.find(p => p.playId === play.id) || null}
                applying={applying === play.id}
                onApply={handleApply}
                onToggleStatus={handleToggleStatus}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
