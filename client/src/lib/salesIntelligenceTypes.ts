// =============================================================================
// MOMENTUM SALES INTELLIGENCE — DOMAIN MODEL
// =============================================================================
// Typed models for the sales intelligence layer.
// These extend the core Lead type with richer analytical structures
// used across the Sales Intelligence UX components.
// =============================================================================

// ---------------------------------------------------------------------------
// Opportunity Assessment
// ---------------------------------------------------------------------------

export type OpportunityTier = 'high_value' | 'strong' | 'moderate' | 'low' | 'marginal';
export type OpportunityDimension = 'visibility' | 'competition' | 'website' | 'gbp' | 'keywords' | 'trust' | 'urgency';

export interface OpportunityDimensionScore {
  dimension:    OpportunityDimension;
  label:        string;
  score:        number;          // 0–100 (gap size = opportunity)
  rationale:    string;
  evidence:     string;
  urgency:      'immediate' | 'near_term' | 'medium_term';
}

export interface OpportunityAssessment {
  overallScore:   number;        // 0–100
  tier:           OpportunityTier;
  headline:       string;
  dimensions:     OpportunityDimensionScore[];
  primaryGap:     string;        // single most impactful gap
  primaryWin:     string;        // single most compelling opportunity
  competitorThreat: 'low' | 'moderate' | 'high' | 'critical';
  timeToValue:    'quick' | 'medium' | 'long';
  generatedFrom:  string[];      // which data sources contributed
}

// ---------------------------------------------------------------------------
// Visibility Gap Summary
// ---------------------------------------------------------------------------

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type GapCategory =
  | 'website_missing'
  | 'website_weak'
  | 'gbp_unclaimed'
  | 'gbp_incomplete'
  | 'no_reviews'
  | 'low_reviews'
  | 'keyword_gap'
  | 'service_page_gap'
  | 'location_gap'
  | 'trust_signal_gap'
  | 'competitor_outranking'
  | 'mobile_gap'
  | 'schema_gap'
  | 'speed_gap'
  | 'social_proof_gap';

export interface VisibilityGap {
  id:           string;
  category:     GapCategory;
  title:        string;
  evidence:     string;        // what we actually found
  impact:       string;        // what it costs them
  fix:          string;        // what the fix looks like
  severity:     GapSeverity;
  isQuickWin:   boolean;
  competitor?:  string;        // competitor doing it right (if applicable)
}

export interface VisibilityGapSummary {
  visibilityScore:  number;    // 0–100 (their current visibility)
  opportunityScore: number;    // 0–100 (gap = opportunity size)
  gaps:             VisibilityGap[];
  topGap:           VisibilityGap | null;
  quickWins:        VisibilityGap[];
  hasWebsite:       boolean;
  hasGBP:           boolean;
  hasReviews:       boolean;
  reviewRating:     number | null;
  reviewCount:      number | null;
  keywordCoverage:  'none' | 'minimal' | 'partial' | 'good';
  trustSignals:     { label: string; present: boolean }[];
}

// ---------------------------------------------------------------------------
// Market Opportunity Summary
// ---------------------------------------------------------------------------

export interface MarketCompetitor {
  name:             string;
  estimatedStrength: 'dominant' | 'strong' | 'moderate' | 'weak';
  advantages:       string[];
  vulnerabilities:  string[];
  gbpRating?:       number;
  reviewCount?:     number;
  hasStrongWebsite: boolean;
}

export interface MarketOpportunitySummary {
  marketSizeContext:  string;    // qualitative market size
  demandSignals:      string[];  // indicators of active demand
  supplyGaps:         string[];  // where competitors are weak
  competitorCount:    number;
  competitors:        MarketCompetitor[];
  marketPosition:     'uncontested' | 'advantaged' | 'competitive' | 'crowded';
  addressableNiche:   string;
  estimatedSearchDemand: 'high' | 'medium' | 'low' | 'unknown';
  urgencyDrivers:     string[];  // seasonal, regulatory, competitive threats
}

// ---------------------------------------------------------------------------
// Sales Next Best Action
// ---------------------------------------------------------------------------

export type NbaSalesCategory =
  | 'open_conversation'
  | 'discovery_question'
  | 'present_evidence'
  | 'handle_objection'
  | 'advance_stage'
  | 'book_meeting'
  | 'send_proposal'
  | 'follow_up'
  | 're_engage'
  | 'close'
  | 'handoff';

export interface SalesNepqQuestion {
  type:     'situation' | 'problem' | 'consequence' | 'solution' | 'commitment';
  question: string;
  purpose:  string;           // why this question matters here
}

export interface ObjectionScript {
  objection:    string;
  realConcern:  string;
  response:     string;
  bridgeBack:   string;       // question to get back on track
}

export interface SalesNextBestAction {
  id:             string;
  category:       NbaSalesCategory;
  priority:       'must_do' | 'high' | 'medium';
  action:         string;     // the specific action to take
  why:            string;     // why this action matters now
  channel:        'call' | 'sms' | 'email' | 'meeting' | 'in_person';
  timeframe:      string;     // e.g. "today", "within 24hrs", "this week"
  script?:        string;     // suggested opening line or message
  nepqQuestions:  SalesNepqQuestion[];
  objectionPrep?: ObjectionScript[];
  successSignal:  string;     // what a good outcome looks like
  stageAdvance?:  string;     // what stage it should move to on success
}

// ---------------------------------------------------------------------------
// Sales Conversation State
// ---------------------------------------------------------------------------

export interface ConversationMilestone {
  label:      string;
  achieved:   boolean;
  achievedAt?: string;        // ISO date
}

export interface SalesConversationState {
  currentStage:     string;
  stageIndex:       number;   // 0-based
  totalStages:      number;
  nextStage:        string;
  milestones:       ConversationMilestone[];
  stallRisk:        'none' | 'low' | 'medium' | 'high';
  stallReason?:     string;
  daysSinceContact: number;
  totalTouchpoints: number;
  conversationQuality: 'unstarted' | 'early' | 'engaged' | 'advanced' | 'ready_to_close';
  momentum:         'building' | 'stalled' | 'at_risk' | 'strong';
}

// ---------------------------------------------------------------------------
// Proposal Readiness
// ---------------------------------------------------------------------------

export interface ReadinessCheckItem {
  id:           string;
  label:        string;
  description:  string;
  status:       'complete' | 'partial' | 'missing' | 'not_required';
  weight:       number;       // 1–5 (importance)
  blocker:      boolean;      // if true, prevents close/provision
  action?:      string;       // what to do to fix it
}

export interface ProposalReadiness {
  score:          number;     // 0–100
  ready:          boolean;    // all blockers resolved
  blockers:       ReadinessCheckItem[];
  items:          ReadinessCheckItem[];
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Handoff Readiness
// ---------------------------------------------------------------------------

export interface HandoffReadiness {
  score:              number;
  ready:              boolean;
  scopeSelected:      boolean;
  strategyComplete:   boolean;
  notesComplete:      boolean;
  dataComplete:       boolean;
  integrationReady:   boolean;
  blockers:           ReadinessCheckItem[];
  items:              ReadinessCheckItem[];
  suggestedArchetype: string;
  suggestedModules:   { module: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Provisioning Readiness (sales-side view)
// ---------------------------------------------------------------------------

export interface ProvisioningReadiness {
  configured:     boolean;
  alreadyProvisioned: boolean;
  tenantId?:      string;
  lifecycleState?: string;
  portalUrl?:     string | null;
  missingFields:  string[];
  readinessScore: number;
  ready:          boolean;
}

// ---------------------------------------------------------------------------
// Derived helpers — compute these from Lead data on the fly
// ---------------------------------------------------------------------------

import type { Lead } from './types';

export function deriveVisibilityGapSummary(lead: Lead): VisibilityGapSummary {
  const prepPack = (lead.prepCallPack || {}) as Record<string, any>;
  const facts = prepPack.facts || {};
  const aiGaps: any[] = lead.aiCallPrepOutput?.gaps || [];
  const diagGaps = lead.aiGrowthPlan?.strategyDiagnosis?.gaps || [];

  const gaps: VisibilityGap[] = [];
  let idCounter = 0;
  const makeId = () => `gap-${++idCounter}`;

  const website = lead.website || facts.website;
  const hasWebsite = !!website;
  const hasGBP = !!(lead.sourceData?.googlePlaceId || facts.gbp !== 'No GBP found');
  const reviewCount = lead.sourceData?.googleReviewCount ?? null;
  const reviewRating = lead.sourceData?.googleRating ?? null;
  const hasReviews = (reviewCount ?? 0) > 0;

  // Website gaps
  if (!hasWebsite) {
    gaps.push({ id: makeId(), category: 'website_missing', severity: 'critical', isQuickWin: false,
      title: 'No website found', evidence: 'No active website detected',
      impact: 'Invisible to high-intent Google searchers. Missing the majority of their addressable market.',
      fix: 'Build a conversion-optimised local service website as the first priority' });
  } else {
    const crawledPages = lead.crawledPages || [];
    const sitemapPages = lead.sitemapPages || [];
    if (crawledPages.length === 0 && sitemapPages.length === 0) {
      gaps.push({ id: makeId(), category: 'website_weak', severity: 'high', isQuickWin: false,
        title: 'Website not indexed properly', evidence: 'Could not detect any indexed pages',
        impact: 'Google may not be crawling or ranking their site',
        fix: 'Full SEO audit and sitemap submission needed' });
    }
    const hasServicePages = sitemapPages.some(p => /service|offering|what-we-do/i.test(p.url));
    if (!hasServicePages && sitemapPages.length > 0) {
      gaps.push({ id: makeId(), category: 'service_page_gap', severity: 'high', isQuickWin: false,
        title: 'No dedicated service pages', evidence: `${sitemapPages.length} pages found — none appear to be service pages`,
        impact: 'Not ranking for service-specific searches. Competitors with service pages win.',
        fix: 'Create dedicated pages for each core service with local keyword targeting' });
    }
  }

  // GBP gaps
  if (!hasGBP) {
    gaps.push({ id: makeId(), category: 'gbp_unclaimed', severity: 'critical', isQuickWin: true,
      title: 'Google Business Profile not claimed', evidence: 'No GBP listing detected',
      impact: 'Not appearing in Google Maps, Local Pack, or "near me" searches. Competitors take all local traffic.',
      fix: 'Claim and optimise Google Business Profile immediately — highest ROI action available' });
  } else if (!hasReviews) {
    gaps.push({ id: makeId(), category: 'no_reviews', severity: 'high', isQuickWin: true,
      title: 'No Google reviews', evidence: '0 reviews on Google Business Profile',
      impact: 'Trust is zero. 88% of buyers read reviews before choosing a local service provider.',
      fix: 'Implement a structured review acquisition process starting immediately' });
  } else if ((reviewCount ?? 0) < 10 || (reviewRating ?? 0) < 4.0) {
    gaps.push({ id: makeId(), category: 'low_reviews', severity: 'medium', isQuickWin: true,
      title: `Low review volume or rating`,
      evidence: `${reviewCount || 0} reviews, ${reviewRating?.toFixed(1) || '—'} stars`,
      impact: 'Loses customers to competitors with more social proof',
      fix: 'Systematic review acquisition through post-job follow-up process' });
  }

  // Keyword gaps
  const ahrefs = lead.ahrefsData;
  if (!ahrefs || (ahrefs.organicKeywords ?? 0) < 5) {
    gaps.push({ id: makeId(), category: 'keyword_gap', severity: 'high', isQuickWin: false,
      title: 'No keyword visibility', evidence: ahrefs ? `Only ${ahrefs.organicKeywords || 0} keywords ranked` : 'No keyword data available',
      impact: 'Not appearing in Google for any service-relevant searches',
      fix: 'Build keyword-targeted service and location pages backed by an SEO strategy' });
  }

  // Add AI-generated gaps
  for (const gap of aiGaps.slice(0, 5)) {
    const severity = (gap.severity === 'high' ? 'critical' : gap.severity || 'medium') as GapSeverity;
    gaps.push({ id: makeId(), category: 'trust_signal_gap', severity,
      isQuickWin: severity !== 'critical',
      title: gap.title || gap.area || 'Gap detected',
      evidence: gap.evidence || '',
      impact: gap.impact || '',
      fix: gap.fix || 'Address this gap as part of the growth strategy' });
  }

  // Strategy diagnosis gaps
  for (const gap of diagGaps.slice(0, 3)) {
    if (gaps.some(g => g.title.toLowerCase().includes((gap.title || '').toLowerCase().slice(0, 20)))) continue;
    gaps.push({ id: makeId(), category: 'trust_signal_gap',
      severity: (gap.severity || 'medium') as GapSeverity,
      isQuickWin: false,
      title: gap.title || 'Strategic gap',
      evidence: gap.evidence || '',
      impact: gap.impact || '',
      fix: 'Address as part of the digital growth strategy' });
  }

  const sorted = [...gaps].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  const kwdCount = ahrefs?.organicKeywords ?? 0;
  const keywordCoverage = kwdCount === 0 ? 'none' : kwdCount < 10 ? 'minimal' : kwdCount < 50 ? 'partial' : 'good';

  const criticalCount = sorted.filter(g => g.severity === 'critical').length;
  const highCount = sorted.filter(g => g.severity === 'high').length;
  const rawVis = Math.max(0, 100 - criticalCount * 25 - highCount * 12 - sorted.filter(g => g.severity === 'medium').length * 5);
  const visibilityScore = Math.min(rawVis, hasWebsite && hasGBP && hasReviews ? 65 : 40);
  const opportunityScore = Math.min(100, 100 - visibilityScore + (criticalCount * 5));

  const trustSignals = [
    { label: 'Google Business Profile', present: hasGBP },
    { label: 'Active website', present: hasWebsite },
    { label: 'Google reviews', present: hasReviews },
    { label: 'Rated 4★+', present: (reviewRating ?? 0) >= 4.0 },
    { label: '10+ reviews', present: (reviewCount ?? 0) >= 10 },
    { label: 'Social presence', present: !!(lead.facebookUrl || lead.instagramUrl) },
    { label: 'Service pages', present: (lead.sitemapPages || []).some(p => /service/i.test(p.url)) },
    { label: 'Keyword visibility', present: (ahrefs?.organicKeywords ?? 0) >= 10 },
  ];

  return {
    visibilityScore,
    opportunityScore,
    gaps: sorted,
    topGap: sorted[0] || null,
    quickWins: sorted.filter(g => g.isQuickWin).slice(0, 3),
    hasWebsite,
    hasGBP,
    hasReviews,
    reviewRating,
    reviewCount,
    keywordCoverage,
    trustSignals,
  };
}

export function deriveOpportunityAssessment(lead: Lead): OpportunityAssessment {
  const gaps = deriveVisibilityGapSummary(lead);
  const diag = lead.aiGrowthPlan?.strategyDiagnosis;
  const prescription = lead.growthPrescription;

  const dimensions: OpportunityDimensionScore[] = [
    {
      dimension: 'visibility',
      label: 'Digital Visibility',
      score: gaps.opportunityScore,
      rationale: `Visibility score: ${gaps.visibilityScore}/100 — gap represents opportunity`,
      evidence: `${gaps.gaps.filter(g => g.severity === 'critical').length} critical gaps identified`,
      urgency: gaps.gaps.some(g => g.severity === 'critical') ? 'immediate' : 'near_term',
    },
    {
      dimension: 'website',
      label: 'Website Opportunity',
      score: gaps.hasWebsite ? (diag?.subscores?.serviceClarityScore ? 100 - diag.subscores.serviceClarityScore : 50) : 90,
      rationale: gaps.hasWebsite ? 'Existing site has gaps to fix' : 'No website — maximum opportunity',
      evidence: gaps.hasWebsite ? `${lead.sitemapPages?.length || 0} pages found` : 'No active website detected',
      urgency: gaps.hasWebsite ? 'near_term' : 'immediate',
    },
    {
      dimension: 'gbp',
      label: 'GBP Opportunity',
      score: gaps.hasGBP ? (gaps.hasReviews ? 40 : 70) : 95,
      rationale: gaps.hasGBP ? (gaps.hasReviews ? 'GBP present with reviews' : 'GBP present but needs reviews') : 'No GBP — critical opportunity',
      evidence: gaps.hasGBP ? `${gaps.reviewCount || 0} reviews, ${gaps.reviewRating?.toFixed(1) || '—'} stars` : 'No GBP listing',
      urgency: gaps.hasGBP ? 'near_term' : 'immediate',
    },
    {
      dimension: 'keywords',
      label: 'Search Visibility',
      score: gaps.keywordCoverage === 'none' ? 90 : gaps.keywordCoverage === 'minimal' ? 70 : gaps.keywordCoverage === 'partial' ? 45 : 20,
      rationale: `Keyword coverage: ${gaps.keywordCoverage}`,
      evidence: lead.ahrefsData ? `${lead.ahrefsData.organicKeywords || 0} keywords ranked` : 'No keyword data',
      urgency: gaps.keywordCoverage === 'none' ? 'immediate' : 'near_term',
    },
    {
      dimension: 'trust',
      label: 'Trust Signals',
      score: Math.max(0, 100 - (gaps.trustSignals.filter(t => t.present).length / gaps.trustSignals.length) * 100),
      rationale: `${gaps.trustSignals.filter(t => t.present).length}/${gaps.trustSignals.length} trust signals present`,
      evidence: gaps.trustSignals.filter(t => !t.present).map(t => t.label).join(', '),
      urgency: 'near_term',
    },
  ];

  const avg = dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
  const tier: OpportunityTier = avg >= 80 ? 'high_value' : avg >= 65 ? 'strong' : avg >= 45 ? 'moderate' : avg >= 25 ? 'low' : 'marginal';

  const topDim = [...dimensions].sort((a, b) => b.score - a.score)[0];

  return {
    overallScore: Math.round(avg),
    tier,
    headline: prescription?.businessDiagnosis?.slice(0, 120) || `${lead.companyName} has significant untapped digital opportunity`,
    dimensions,
    primaryGap: gaps.topGap?.title || topDim.label,
    primaryWin: gaps.quickWins[0]?.title || 'GBP optimisation for immediate local visibility',
    competitorThreat: 'moderate',
    timeToValue: gaps.quickWins.length > 0 ? 'quick' : 'medium',
    generatedFrom: ['visibility_analysis', diag ? 'strategy_diagnosis' : '', prescription ? 'growth_prescription' : ''].filter(Boolean),
  };
}

export function deriveSalesConversationState(lead: Lead, activities: any[]): SalesConversationState {
  const STAGE_ORDER = ['suspect', 'contacted', 'engaged', 'qualified', 'discovery', 'proposal', 'verbal_commit', 'won'];
  const stageIndex = STAGE_ORDER.indexOf(lead.stage);
  const CONV_ORDER = ['not_started', 'attempted', 'connected', 'discovery', 'qualified', 'objection', 'proposal', 'booked'];
  const convIndex = CONV_ORDER.indexOf(lead.conversationStage || 'not_started');

  const lastActivity = activities.filter(a => a.leadId === lead.id).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const daysSince = lastActivity ? Math.round((Date.now() - new Date(lastActivity.createdAt).getTime()) / 86_400_000) : 999;

  const milestones: ConversationMilestone[] = [
    { label: 'First contact made', achieved: convIndex >= 1 },
    { label: 'Connected with decision maker', achieved: convIndex >= 2 },
    { label: 'Discovery conversation held', achieved: convIndex >= 3 },
    { label: 'Qualified as opportunity', achieved: convIndex >= 4 },
    { label: 'Proposal presented', achieved: convIndex >= 6 },
    { label: 'Committed to next step', achieved: convIndex >= 7 },
  ];

  const stallRisk = daysSince > 14 ? 'high' : daysSince > 7 ? 'medium' : daysSince > 3 ? 'low' : 'none';
  const momentum = stallRisk === 'high' ? 'at_risk' : stallRisk === 'medium' ? 'stalled' : stageIndex >= 4 ? 'strong' : 'building';
  const convQuality = convIndex === 0 ? 'unstarted' : convIndex < 3 ? 'early' : convIndex < 5 ? 'engaged' : convIndex < 7 ? 'advanced' : 'ready_to_close';

  return {
    currentStage: lead.stage,
    stageIndex,
    totalStages: STAGE_ORDER.length,
    nextStage: STAGE_ORDER[stageIndex + 1] || 'won',
    milestones,
    stallRisk,
    stallReason: stallRisk !== 'none' ? `No contact in ${daysSince} days` : undefined,
    daysSinceContact: daysSince,
    totalTouchpoints: (lead.conversationCount || 0) + (lead.attemptCount || 0),
    conversationQuality: convQuality,
    momentum,
  };
}

export function deriveProposalReadiness(lead: Lead): ProposalReadiness {
  const items: ReadinessCheckItem[] = [
    {
      id: 'discovery',
      label: 'Discovery conversation held',
      description: 'Had a proper discovery call to understand their situation',
      status: (lead.conversationStage && ['discovery', 'qualified', 'objection', 'proposal', 'booked'].includes(lead.conversationStage)) ? 'complete' : 'missing',
      weight: 5,
      blocker: true,
      action: 'Book and hold a discovery conversation before proposing',
    },
    {
      id: 'strategy_notes',
      label: 'Strategy intelligence captured',
      description: 'Business overview, ideal customer, services, and goals documented',
      status: lead.strategyIntelligence?.businessOverview ? 'complete' : lead.notes ? 'partial' : 'missing',
      weight: 4,
      blocker: false,
      action: 'Fill in strategy intelligence fields in the lead profile',
    },
    {
      id: 'visibility_data',
      label: 'Visibility data collected',
      description: 'Website, GBP, and online presence analysed',
      status: lead.aiCallPrepOutput ? 'complete' : lead.website ? 'partial' : 'missing',
      weight: 4,
      blocker: false,
      action: 'Run the evidence gathering on this lead',
    },
    {
      id: 'growth_prescription',
      label: 'Growth prescription generated',
      description: 'AI analysis of what they need and why',
      status: lead.growthPrescription ? 'complete' : 'missing',
      weight: 5,
      blocker: true,
      action: 'Generate the growth prescription from the Deal Intelligence panel',
    },
    {
      id: 'competitor_data',
      label: 'Competitor context gathered',
      description: 'At least one competitor analysed',
      status: Object.keys(lead.competitorData || {}).length > 0 ? 'complete' : 'missing',
      weight: 3,
      blocker: false,
      action: 'Add and analyse 1–2 competitors to strengthen the conversation',
    },
    {
      id: 'investment_options',
      label: 'Investment options prepared',
      description: 'Pricing and investment tiers ready to present',
      status: lead.growthPrescription?.investmentOptions?.length ? 'complete' : 'missing',
      weight: 5,
      blocker: true,
      action: 'Generate growth prescription which includes investment options',
    },
    {
      id: 'follow_up_script',
      label: 'Follow-up messaging ready',
      description: 'Email and SMS follow-up prepared',
      status: lead.aiFollowUp ? 'complete' : 'missing',
      weight: 2,
      blocker: false,
      action: 'Generate AI follow-up from the AI Sales Engine',
    },
  ];

  const completed = items.filter(i => i.status === 'complete');
  const partial = items.filter(i => i.status === 'partial');
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  const completedWeight = completed.reduce((s, i) => s + i.weight, 0) + partial.reduce((s, i) => s + Math.round(i.weight * 0.5), 0);
  const score = Math.round((completedWeight / totalWeight) * 100);
  const blockers = items.filter(i => i.blocker && i.status !== 'complete');
  const ready = blockers.length === 0 && score >= 60;

  return {
    score,
    ready,
    blockers,
    items,
    recommendation: ready
      ? 'This lead is ready for a proposal conversation.'
      : `Complete ${blockers.length} blocker${blockers.length !== 1 ? 's' : ''} before presenting a proposal.`,
  };
}

export function deriveHandoffReadiness(lead: Lead): HandoffReadiness {
  const proposal = deriveProposalReadiness(lead);
  const items: ReadinessCheckItem[] = [
    ...proposal.items.map(i => ({ ...i, id: `p_${i.id}` })),
    {
      id: 'scope_selected',
      label: 'Scope confirmed (website/SEO/GBP/ads)',
      description: 'Client has agreed to the scope of engagement',
      status: lead.stage === 'won' || lead.stage === 'verbal_commit' ? 'partial' : 'missing',
      weight: 5,
      blocker: true,
      action: 'Confirm scope selection through the handoff readiness panel',
    },
    {
      id: 'handover_notes',
      label: 'Handover notes written',
      description: 'Context notes for the delivery team',
      status: lead.strategyIntelligence?.discoveryNotes ? 'complete' : 'missing',
      weight: 3,
      blocker: false,
      action: 'Write handover notes in the strategy intelligence section',
    },
  ];

  const blockers = items.filter(i => i.blocker && i.status !== 'complete');
  const completedWeight = items.filter(i => i.status === 'complete').reduce((s, i) => s + i.weight, 0)
    + items.filter(i => i.status === 'partial').reduce((s, i) => s + Math.round(i.weight * 0.5), 0);
  const score = Math.round((completedWeight / items.reduce((s, i) => s + i.weight, 0)) * 100);

  const prescription = lead.growthPrescription;
  const suggestedModules = prescription?.recommendedStack?.map(r => ({ module: r.product, reason: r.reason })) || [
    { module: 'gbp', reason: 'Highest immediate ROI for local service businesses' },
    { module: 'website', reason: 'Essential conversion and visibility foundation' },
  ];

  const archetype = prescription?.urgencyLevel === 'high' ? 'local_anchor'
    : (lead.sourceData?.googleReviewCount ?? 0) < 5 ? 'trust_builder'
    : lead.website ? 'authority_expert'
    : 'local_anchor';

  return {
    score,
    ready: blockers.length === 0,
    scopeSelected: lead.stage === 'won',
    strategyComplete: !!lead.growthPrescription,
    notesComplete: !!lead.strategyIntelligence?.discoveryNotes,
    dataComplete: !!lead.aiCallPrepOutput,
    integrationReady: false,
    blockers,
    items,
    suggestedArchetype: archetype,
    suggestedModules,
  };
}
