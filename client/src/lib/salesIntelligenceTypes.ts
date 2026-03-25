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

// =============================================================================
// SALES EXECUTION LAYER — Extended domain model
// =============================================================================
// Types for: MeetingPrep, FollowUpRecommendation, StageActionPlan,
// PipelineMomentumScore, ObjectionBank, SalesExecutionState
// All are pure-derivation — zero AI calls.
// =============================================================================

// ─── Sales Meeting Prep ───────────────────────────────────────────────────────

export type MeetingType =
  | 'first_call'
  | 'discovery'
  | 'gap_presentation'
  | 'proposal'
  | 'follow_up'
  | 'close'
  | 'check_in';

export interface SalesMeetingPrep {
  meetingType:      MeetingType;
  meetingLabel:     string;
  businessSummary:  string;           // quick 2-sentence brief on the prospect
  currentSituation: string;           // where they are right now
  opportunityAngle: string;           // the specific angle for this meeting
  callObjective:    string;           // the one thing you need to achieve
  openingLine:      string;           // recommended opening
  whatToShow:       string[];         // demos / reports / data to present
  talkingPoints:    string[];         // 3–5 key points to hit
  questions:        SalesNepqQuestion[];
  likelyObjections: ObjectionScript[];
  thingsToAvoid:    string[];         // common rep mistakes at this stage
  idealOutcome:     string;           // what a perfect call looks like
  fallbackOutcome:  string;           // minimum acceptable outcome
  closingQuestion:  string;           // the call-to-action to end with
}

// ─── Follow-up Recommendation ─────────────────────────────────────────────────

export type FollowUpUrgency = 'overdue' | 'today' | 'this_week' | 'next_week' | 'no_action_needed';
export type FollowUpAsset = 'strategy_report' | 'growth_prescription' | 'competitor_data' | 'visibility_gaps' | 'roi_calculator' | 'none';

export interface SalesFollowUpRecommendation {
  urgency:              FollowUpUrgency;
  recommendedByDate:    string;           // ISO 8601 date
  channel:              'call' | 'sms' | 'email' | 'meeting';
  channelRationale:     string;
  focusArea:            string;
  messagingAngle:       string;
  suggestedSubject?:    string;           // for email
  suggestedMessage:     string;
  asset:                FollowUpAsset;
  assetRationale:       string;
  followUpReason:       string;
  nextMilestone:        string;
  doNotDoList:          string[];         // things to avoid in this follow-up
}

// ─── Stage Action Plan ────────────────────────────────────────────────────────

export interface StageAction {
  order:           number;
  action:          string;
  why:             string;
  channel:         string;
  expectedOutcome: string;
  timeframe:       string;
  isComplete:      boolean;
}

export interface StageActionPlan {
  stage:                   string;
  stageLabel:              string;
  objective:               string;
  exitCriteria:            string;
  actions:                 StageAction[];
  blockers:                string[];
  estimatedDaysToAdvance:  number;
  tipForThisStage:         string;
}

// ─── Pipeline Momentum Score ──────────────────────────────────────────────────

export type MomentumTrajectory = 'accelerating' | 'steady' | 'decelerating' | 'stalled' | 'at_risk';
export type MomentumUrgency    = 'critical' | 'high' | 'medium' | 'low';
export type ConversationDepth  = 'none' | 'surface' | 'engaged' | 'deep';

export interface PipelineMomentumScore {
  score:                  number;            // 0–100
  trajectory:             MomentumTrajectory;
  urgency:                MomentumUrgency;
  daysSinceLastContact:   number;
  daysSinceStageAdvance:  number;
  touchpointCount:        number;
  conversationDepth:      ConversationDepth;
  closeReadiness:         number;            // 0–100
  riskFactors:            string[];
  accelerators:           string[];
  nextMilestone:          string;
  estimatedDaysToClose:   number | null;
  stallLabel?:            string;
  urgencyLabel:           string;
}

// ─── Objection Bank ───────────────────────────────────────────────────────────

export interface SalesObjection {
  id:              string;
  objectionText:   string;
  stage:           string[];       // which stages this objection is common at
  frequency:       'very_common' | 'common' | 'occasional';
  realConcern:     string;
  framingTip:      string;
  responseScript:  string;
  bridgeBack:      string;
  doNotSay:        string;
  successSignal:   string;
}

export interface SalesObjectionBank {
  objections:  SalesObjection[];
  stageHints:  Record<string, string>;   // stage → most likely objection
}

// ─── Sales Execution State ────────────────────────────────────────────────────

export interface SalesExecutionState {
  conversationState:    SalesConversationState;
  meetingPrep:          SalesMeetingPrep;
  followUp:             SalesFollowUpRecommendation;
  stageActionPlan:      StageActionPlan;
  momentumScore:        PipelineMomentumScore;
  proposalReadiness:    ProposalReadiness;
  objectionsApplicable: SalesObjection[];
}

// =============================================================================
// DERIVATION FUNCTIONS — Sales Execution Layer
// =============================================================================

// ─── Stage Action Plan ────────────────────────────────────────────────────────

const STAGE_ACTION_PLANS: Record<string, Omit<StageActionPlan, 'stage' | 'blockers'>> = {
  suspect: {
    stageLabel: 'Suspect',
    objective: 'Verify the business is a viable opportunity and get them engaged',
    exitCriteria: 'First conversation booked or permission granted to follow up',
    estimatedDaysToAdvance: 3,
    tipForThisStage: 'Don\'t present yet — the goal is to open the door and book a real conversation.',
    actions: [
      { order: 1, action: 'Review all evidence gathered (website, GBP, reviews, competitors)', why: 'You need to know their situation before you can have a credible conversation', channel: 'internal', expectedOutcome: 'Clear picture of their digital gaps', timeframe: 'Before calling', isComplete: false },
      { order: 2, action: 'Craft a personalised opening hook using their specific gap', why: 'Generic outreach gets ignored — specificity creates curiosity', channel: 'internal', expectedOutcome: 'Opening line ready to deploy', timeframe: 'Before calling', isComplete: false },
      { order: 3, action: 'Make initial outreach call — 2-minute pattern interrupt', why: 'Phone is the highest-response channel for cold outreach to tradies and local businesses', channel: 'call', expectedOutcome: 'Conversation booked or permission to follow up', timeframe: 'Today', isComplete: false },
      { order: 4, action: 'Follow up with targeted SMS if no answer', why: 'Decision makers miss calls — a personal SMS with a specific hook gets read', channel: 'sms', expectedOutcome: 'Text reply or call back', timeframe: 'Same day as call attempt', isComplete: false },
    ],
  },
  contacted: {
    stageLabel: 'Contacted',
    objective: 'Convert the connection into a proper discovery conversation',
    exitCriteria: 'Discovery call booked in the calendar',
    estimatedDaysToAdvance: 5,
    tipForThisStage: 'Your job is not to sell yet — it\'s to earn the right to understand their situation.',
    actions: [
      { order: 1, action: 'Send a value-first follow-up after initial contact', why: 'Give them something useful — a piece of data about their market or visibility before asking for more time', channel: 'email', expectedOutcome: 'Opens the door to a deeper conversation', timeframe: 'Within 24 hours of first contact', isComplete: false },
      { order: 2, action: 'Book a proper 20-minute discovery call', why: 'You need dedicated time — side conversations don\'t advance deals', channel: 'call', expectedOutcome: 'Calendar invite sent and accepted', timeframe: 'Within 48 hours', isComplete: false },
      { order: 3, action: 'Prepare the visibility gap data for the discovery call', why: 'Coming in with their data creates instant credibility', channel: 'internal', expectedOutcome: 'Ready to present 2–3 specific findings', timeframe: 'Before the call', isComplete: false },
    ],
  },
  engaged: {
    stageLabel: 'Engaged',
    objective: 'Run a high-quality discovery to surface pain, urgency, and commitment',
    exitCriteria: 'Pain acknowledged, opportunity shown, next step agreed',
    estimatedDaysToAdvance: 7,
    tipForThisStage: 'Listen more than you talk. Get them to describe the problem in their own words.',
    actions: [
      { order: 1, action: 'Open with a situation question — not a pitch', why: 'Let them talk first. You\'re diagnosing, not prescribing.', channel: 'call', expectedOutcome: 'You understand how they currently get leads', timeframe: 'Start of discovery call', isComplete: false },
      { order: 2, action: 'Present the 2–3 most critical digital gaps with evidence', why: 'Showing them their own data is more persuasive than any pitch', channel: 'meeting', expectedOutcome: 'They acknowledge the gap and express concern', timeframe: 'Mid discovery call', isComplete: false },
      { order: 3, action: 'Ask the consequence question — quantify the cost of inaction', why: 'Gap awareness without urgency doesn\'t close deals', channel: 'call', expectedOutcome: 'They put a number (revenue or time) on the problem', timeframe: 'After gap presentation', isComplete: false },
      { order: 4, action: 'Agree on a clear next step before hanging up', why: 'Open-ended next steps die in people\'s inboxes', channel: 'call', expectedOutcome: 'Specific time booked or proposal requested', timeframe: 'End of call', isComplete: false },
    ],
  },
  qualified: {
    stageLabel: 'Qualified',
    objective: 'Build and present a compelling tailored proposal',
    exitCriteria: 'Proposal presented and verbal intent confirmed',
    estimatedDaysToAdvance: 7,
    tipForThisStage: 'Don\'t over-complicate the proposal. Lead with the outcome, not the features.',
    actions: [
      { order: 1, action: 'Generate the strategy report and lock it', why: 'The strategy report gives you credibility and a shareable anchor for the conversation', channel: 'internal', expectedOutcome: 'Strategy report ready to share', timeframe: 'Within 24 hours of qualifying', isComplete: false },
      { order: 2, action: 'Customise the investment options to their situation', why: 'Generic pricing gets compared. Tailored pricing gets accepted.', channel: 'internal', expectedOutcome: 'Two investment tiers ready to present', timeframe: 'Before proposal meeting', isComplete: false },
      { order: 3, action: 'Present the proposal in a live conversation (not email)', why: 'Emailed proposals have a 30% close rate vs 70%+ for presented proposals', channel: 'meeting', expectedOutcome: 'Verbal intent or clear objections raised', timeframe: 'Within 48 hours of qualifying', isComplete: false },
      { order: 4, action: 'Handle objections in real time and agree on next step', why: 'Objections are buying signals — address them directly', channel: 'meeting', expectedOutcome: 'Next step agreed (signature, think-about it, or clear objection raised)', timeframe: 'During proposal meeting', isComplete: false },
    ],
  },
  proposal: {
    stageLabel: 'Proposal Presented',
    objective: 'Advance from proposal to verbal commitment',
    exitCriteria: 'Verbal commit received or contract signed',
    estimatedDaysToAdvance: 5,
    tipForThisStage: 'Follow up the same day. The longer you wait, the colder it gets.',
    actions: [
      { order: 1, action: 'Send the proposal summary email within 2 hours of the call', why: 'Strike while the iron is hot — summarise what was discussed and the proposed investment', channel: 'email', expectedOutcome: 'Email sent with clear next step and deadline', timeframe: 'Within 2 hours of meeting', isComplete: false },
      { order: 2, action: 'Follow up by phone within 24 hours', why: 'Most decisions happen in the 24 hours after a proposal — be present', channel: 'call', expectedOutcome: 'Decision or known objection', timeframe: 'Next business day', isComplete: false },
      { order: 3, action: 'Address any outstanding objections with evidence', why: 'They are almost saying yes — help them get over the line', channel: 'call', expectedOutcome: 'Objection resolved or referred to next level', timeframe: 'If objections raised', isComplete: false },
      { order: 4, action: 'Create urgency with a specific reason to decide now', why: 'Decisions without deadlines never happen', channel: 'call', expectedOutcome: 'Decision made or timeline committed', timeframe: 'By day 5 after proposal', isComplete: false },
    ],
  },
  verbal_commit: {
    stageLabel: 'Verbal Commit',
    objective: 'Convert verbal commitment to signed agreement and deposit',
    exitCriteria: 'Agreement signed and onboarding initiated',
    estimatedDaysToAdvance: 3,
    tipForThisStage: 'Don\'t celebrate yet — it\'s not done until it\'s signed. Make the paperwork as easy as possible.',
    actions: [
      { order: 1, action: 'Send the service agreement within the hour of verbal commit', why: 'Momentum is everything — every hour of delay increases the chance of them rethinking', channel: 'email', expectedOutcome: 'Agreement sent and confirmed received', timeframe: 'Within 1 hour of verbal commit', isComplete: false },
      { order: 2, action: 'Confirm the onboarding process and set expectations', why: 'Buyers need to know what happens next to feel confident', channel: 'call', expectedOutcome: 'They understand what starting looks like', timeframe: 'Same day as agreement', isComplete: false },
      { order: 3, action: 'Begin onboarding capture in the Onboarding tab', why: 'Capturing the onboarding data now ensures smooth delivery hand-off', channel: 'internal', expectedOutcome: 'Onboarding form at least 80% complete', timeframe: 'Within 24 hours of signing', isComplete: false },
    ],
  },
};

export function deriveStageActionPlan(lead: Lead): StageActionPlan {
  const stage = lead.stage || 'suspect';
  const plan = STAGE_ACTION_PLANS[stage] || STAGE_ACTION_PLANS.suspect;

  const blockers: string[] = [];
  if (stage === 'qualified' && !lead.growthPrescription) blockers.push('Generate growth prescription before building the proposal');
  if (stage === 'proposal' && !lead.aiCallPrepOutput) blockers.push('Run evidence gathering to strengthen the proposal');
  if (stage === 'verbal_commit' && !lead.onboardingState) blockers.push('Begin onboarding capture before handoff');

  return { stage, ...plan, blockers };
}

// ─── Meeting Prep ─────────────────────────────────────────────────────────────

const MEETING_TYPE_FOR_STAGE: Record<string, MeetingType> = {
  suspect: 'first_call', contacted: 'first_call', engaged: 'discovery',
  qualified: 'gap_presentation', discovery: 'gap_presentation',
  proposal: 'proposal', verbal_commit: 'close', won: 'check_in',
};

const MEETING_LABELS: Record<MeetingType, string> = {
  first_call: 'First Call / Pattern Interrupt',
  discovery: 'Discovery Conversation',
  gap_presentation: 'Gap Presentation & Qualification',
  proposal: 'Proposal Meeting',
  follow_up: 'Follow-up Call',
  close: 'Close / Commitment Conversation',
  check_in: 'Check-in / Upsell Conversation',
};

export function deriveMeetingPrep(lead: Lead): SalesMeetingPrep {
  const stage = lead.stage || 'suspect';
  const convStage = lead.conversationStage || 'not_started';
  const meetingType = MEETING_TYPE_FOR_STAGE[stage] || 'discovery';
  const name = lead.companyName || lead.name || 'the business';
  const industry = lead.sourceData?.industry || lead.strategyIntelligence?.industry || 'local services';
  const topGap = lead.aiCallPrepOutput?.gaps?.[0];
  const salesHook = lead.aiCallPrepOutput?.salesHook || '';
  const diagnosis = lead.growthPrescription?.businessDiagnosis || '';
  const reviewCount = lead.sourceData?.googleReviewCount ?? 0;
  const hasWebsite = !!lead.website;
  const hasGBP = !!lead.sourceData?.googlePlaceId;

  // Business summary
  const businessSummary = diagnosis
    ? `${name} is a ${industry} business. ${diagnosis.slice(0, 180)}`
    : `${name} is a ${industry} business${hasWebsite ? ' with an existing website' : ' with no website'}${hasGBP ? ', a Google Business Profile' : ', and no Google Business Profile'}.`;

  // Current situation
  const currentSituation = [
    hasWebsite ? `Has a website (${lead.website})` : 'No active website',
    hasGBP ? `GBP: ${reviewCount} reviews` : 'No Google Business Profile',
    lead.ahrefsData ? `${lead.ahrefsData.organicKeywords || 0} keywords ranked` : 'No keyword data',
    lead.stage ? `Currently at ${lead.stage} stage` : '',
  ].filter(Boolean).join(' · ');

  // Opportunity angle
  const opportunityAngle = salesHook || (topGap
    ? `The biggest gap is ${topGap.title} — ${topGap.impact}`
    : `${name} has significant untapped digital visibility — competitors are winning the searches they should be ranking for.`);

  // What to show based on stage
  const whatToShow: string[] = [];
  if (lead.aiCallPrepOutput) whatToShow.push('Visibility gap analysis (key findings)');
  if (lead.growthPrescription) whatToShow.push('Growth prescription and recommended stack');
  if (lead.strategyReportId) whatToShow.push('Strategy report — shareable link');
  if (lead.competitorData && Object.keys(lead.competitorData).length > 0) whatToShow.push('Competitor comparison');
  if (lead.ahrefsData) whatToShow.push('Keyword and traffic data');
  if (whatToShow.length === 0) whatToShow.push('Business website review', 'Google search presence check');

  // Talking points
  const talkingPoints: string[] = [];
  if (topGap) talkingPoints.push(`Most critical gap: ${topGap.title} — ${topGap.impact}`);
  if (!hasWebsite) talkingPoints.push('No website = invisible to high-intent Google searchers right now');
  if (!hasGBP) talkingPoints.push('No Google Business Profile = missing from all local map searches');
  if (reviewCount < 10) talkingPoints.push(`Only ${reviewCount} reviews — competitors with more reviews win by default`);
  if (lead.growthPrescription?.recommendedStack?.length) {
    talkingPoints.push(`Recommended starting point: ${lead.growthPrescription.recommendedStack[0]?.product || 'GBP + Website'}`);
  }
  talkingPoints.push('We work exclusively with local service businesses — this is all we do');

  // NEPQ questions by meeting type
  const questions: SalesNepqQuestion[] = [];
  if (meetingType === 'first_call' || meetingType === 'discovery') {
    questions.push(
      { type: 'situation', question: 'How are most of your new customers finding you right now — is it mainly word of mouth, or are you seeing some online enquiries?', purpose: 'Understand their current lead flow before presenting anything' },
      { type: 'situation', question: 'When you Google your own business, how do you feel about what comes up?', purpose: 'Surface dissatisfaction without confrontation' },
      { type: 'problem', question: 'What\'s the single biggest challenge you\'re running into with getting consistent new work right now?', purpose: 'Get them to name the pain in their own words' },
      { type: 'consequence', question: 'If things stay exactly as they are for the next 12 months, what does that mean for where you want the business to be?', purpose: 'Create urgency around inaction' },
      { type: 'solution', question: 'If we could get you a consistent stream of quality online enquiries every month, what would that change for you?', purpose: 'Get them to paint the picture of success' },
    );
  } else if (meetingType === 'gap_presentation') {
    questions.push(
      { type: 'consequence', question: `When you look at this gap — [${topGap?.title || 'your online visibility'}] — how many leads do you think you\'re missing every month because of it?`, purpose: 'Quantify the impact in their language' },
      { type: 'consequence', question: 'Your main competitor is showing up for searches you should be winning — how does that sit with you from a business perspective?', purpose: 'Create competitive urgency using their own market' },
      { type: 'solution', question: 'If we closed this gap in the next 90 days, what would that mean for your pipeline?', purpose: 'Get them to own the outcome' },
      { type: 'commitment', question: 'On a scale of 1–10, how important is solving this to you right now?', purpose: 'Gauge commitment level before proposing investment' },
    );
  } else if (meetingType === 'proposal') {
    questions.push(
      { type: 'commitment', question: 'Based on what we\'ve discussed — which of the two investment options feels right for where you are now?', purpose: 'Advance to a decision without pressuring' },
      { type: 'commitment', question: 'What would need to be true for you to feel completely confident moving forward?', purpose: 'Surface any remaining objections gently' },
      { type: 'commitment', question: 'If we were to kick off in the next couple of weeks, what does your decision process look like?', purpose: 'Understand who else is involved in the decision' },
    );
  } else if (meetingType === 'close') {
    questions.push(
      { type: 'commitment', question: 'You\'ve seen the plan — does this feel like the right direction for the business?', purpose: 'Confirm alignment before asking for commitment' },
      { type: 'commitment', question: 'Is there anything we haven\'t covered that you\'d want to understand before moving forward?', purpose: 'Flush out remaining objections' },
      { type: 'commitment', question: 'What would it take to get started this week?', purpose: 'Direct close question' },
    );
  }

  // Likely objections by stage
  const likelyObjections: ObjectionScript[] = (lead.aiObjectionResponses || []).slice(0, 2).map(o => ({
    objection: o.objection,
    realConcern: o.realConcern,
    response: o.response,
    bridgeBack: o.regainControlQuestion,
  }));

  // Stage-specific defaults if no AI objections
  if (likelyObjections.length === 0) {
    if (['qualified', 'proposal'].includes(stage)) {
      likelyObjections.push({
        objection: 'It\'s a bit more than I was expecting to spend',
        realConcern: 'They are not yet convinced the ROI justifies the investment',
        response: 'I totally understand — can I ask, what would it be worth to you if we doubled your online enquiries in the next 6 months? That\'s the outcome we\'re working toward. The investment only needs to deliver one or two extra jobs a month to pay for itself.',
        bridgeBack: 'Setting investment aside for a moment — does the strategy itself feel right for where you want to take the business?',
      });
    }
    likelyObjections.push({
      objection: 'I need to think about it',
      realConcern: 'Something hasn\'t been resolved — either value, trust, or timing',
      response: 'Of course — this is an important decision. Can I ask what the one or two things are that you want to think through? I want to make sure you have everything you need to feel confident.',
      bridgeBack: 'Is it more about the investment, the timing, or wanting to understand the process better?',
    });
  }

  // Things to avoid
  const thingsToAvoid = [
    'Don\'t pitch features — talk about outcomes',
    'Don\'t accept "I\'ll think about it" without understanding what specifically',
    'Don\'t leave without a specific next step booked',
    meetingType === 'first_call' ? 'Don\'t present pricing on the first call' : '',
    meetingType === 'discovery' ? 'Don\'t talk more than 30% of the time' : '',
  ].filter(Boolean);

  // Call objective and outcomes
  const OBJECTIVES: Record<MeetingType, string> = {
    first_call: 'Book a proper 20-minute discovery conversation',
    discovery: 'Uncover their biggest pain and get them to acknowledge the gap',
    gap_presentation: 'Get a commitment to see the proposal',
    proposal: 'Verbal commitment to move forward',
    follow_up: 'Re-open the conversation and advance the stage',
    close: 'Signed agreement and first invoice issued',
    check_in: 'Identify upsell opportunity or collect a referral',
  };

  const FALLBACKS: Record<MeetingType, string> = {
    first_call: 'Permission to follow up with specific information',
    discovery: 'Agreement to review a gap analysis together',
    gap_presentation: 'Agreement to review a proposal by a specific date',
    proposal: 'Understanding of what it would take to get to yes',
    follow_up: 'Any response that moves the conversation forward',
    close: 'Agreement to a specific decision timeline',
    check_in: 'Any information about what\'s going well or not',
  };

  const CLOSING_QUESTIONS: Record<MeetingType, string> = {
    first_call: '"Would it be worth spending 20 minutes going through what I found? I think it will be useful regardless of whether you work with us."',
    discovery: '"Based on what we\'ve discussed — is this something you\'d want to address in the next 90 days, or is the timing not right?"',
    gap_presentation: '"I\'d love to put together a specific plan for you. Can we book 30 minutes this week to go through it?"',
    proposal: '"I\'m confident this is the right move for your business. Can we get the paperwork sorted this week?"',
    follow_up: '"Is there a better time to have a proper conversation about this?"',
    close: '"Let\'s get started — are you happy for me to send the agreement through today?"',
    check_in: '"Is there anyone else in your network who might benefit from what we\'ve done together?"',
  };

  return {
    meetingType,
    meetingLabel: MEETING_LABELS[meetingType],
    businessSummary,
    currentSituation,
    opportunityAngle,
    callObjective: OBJECTIVES[meetingType],
    openingLine: salesHook || `"Hi [Name], I had a look at [specific thing about their business] and noticed something I thought was worth a quick conversation. Have you got 2 minutes?"`,
    whatToShow,
    talkingPoints,
    questions,
    likelyObjections,
    thingsToAvoid,
    idealOutcome: OBJECTIVES[meetingType],
    fallbackOutcome: FALLBACKS[meetingType],
    closingQuestion: CLOSING_QUESTIONS[meetingType],
  };
}

// ─── Follow-up Recommendation ─────────────────────────────────────────────────

export function deriveFollowUpRecommendation(lead: Lead, activities: any[]): SalesFollowUpRecommendation {
  const stage = lead.stage || 'suspect';
  const convStage = lead.conversationStage || 'not_started';

  const lastActivity = activities.filter(a => a.leadId === lead.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const daysSince = lastActivity ? Math.round((Date.now() - new Date(lastActivity.createdAt).getTime()) / 86_400_000) : 999;

  const hasStrategyReport = !!lead.strategyReportId;
  const hasGrowthPrescription = !!lead.growthPrescription;
  const hasAiFollowUp = !!lead.aiFollowUp;
  const name = lead.companyName || lead.name || 'them';

  // Choose best asset
  let asset: FollowUpAsset = 'none';
  let assetRationale = 'No specific asset available — focus on re-opening the conversation';

  if (hasStrategyReport && ['proposal', 'verbal_commit', 'qualified'].includes(stage)) {
    asset = 'strategy_report';
    assetRationale = 'The strategy report gives them something concrete to review and share internally — reference it directly';
  } else if (hasGrowthPrescription && ['qualified', 'discovery', 'engaged'].includes(stage)) {
    asset = 'growth_prescription';
    assetRationale = 'Share the growth prescription to advance the discovery conversation — it shows specificity';
  } else if (lead.aiCallPrepOutput?.gaps?.length) {
    asset = 'visibility_gaps';
    assetRationale = 'The visibility gap data is your most powerful re-engagement tool — lead with one specific finding';
  } else if (lead.competitorData && Object.keys(lead.competitorData).length > 0) {
    asset = 'competitor_data';
    assetRationale = 'Competitor intelligence creates urgency — mention something specific a competitor is doing that they should know about';
  }

  // Urgency
  let urgency: FollowUpUrgency;
  if (daysSince > 14 && !['won', 'lost'].includes(stage)) urgency = 'overdue';
  else if (daysSince > 7 && !['won', 'lost'].includes(stage)) urgency = 'today';
  else if (daysSince > 3 && ['proposal', 'verbal_commit'].includes(stage)) urgency = 'today';
  else if (daysSince > 3) urgency = 'this_week';
  else if (['won', 'lost'].includes(stage)) urgency = 'no_action_needed';
  else urgency = 'next_week';

  // Channel recommendation
  let channel: SalesFollowUpRecommendation['channel'] = 'email';
  let channelRationale = 'Email is appropriate for a considered follow-up at this stage';
  if (daysSince > 14) {
    channel = 'call';
    channelRationale = 'This deal needs a direct call — email won\'t cut through after this long';
  } else if (daysSince > 7) {
    channel = 'sms';
    channelRationale = 'SMS is more personal and harder to ignore than email after a week of silence';
  } else if (['proposal', 'verbal_commit'].includes(stage)) {
    channel = 'call';
    channelRationale = 'Proposal-stage follow-ups need a real conversation — email stalls decisions';
  }

  // Focus area by stage + conv stage
  const focusAreas: Record<string, string> = {
    suspect: 'Opening the door to a conversation',
    contacted: 'Booking the discovery conversation',
    engaged: 'Advancing from initial interest to a proper discovery',
    qualified: 'Presenting the growth proposal',
    discovery: 'Clarifying their situation and booking the presentation',
    proposal: 'Advancing from proposal to verbal commitment',
    verbal_commit: 'Getting the agreement signed',
    won: 'Onboarding and relationship building',
  };
  const focusArea = focusAreas[stage] || 'Moving the conversation forward';

  // Message framing
  let messagingAngle = '';
  let suggestedMessage = '';
  let suggestedSubject: string | undefined;
  let doNotDoList: string[] = ['Don\'t lead with an apology for following up', 'Don\'t just say "checking in"'];

  if (urgency === 'overdue') {
    messagingAngle = 'Re-ignition with a new hook — don\'t acknowledge the gap, just re-open';
    suggestedSubject = `Something I noticed about ${name}`;
    suggestedMessage = hasAiFollowUp
      ? lead.aiFollowUp.sms || `Hi [Name], I had a thought about something specific to your business that I think you\'d find useful. Worth a quick call?`
      : `Hi [Name], I was reviewing your Google presence again and noticed something new that I thought was worth flagging — nothing urgent but potentially useful. Happy to jump on a call if it\'s helpful?`;
    doNotDoList.push('Don\'t mention how long it\'s been since you spoke', 'Don\'t ask if they\'ve made a decision — re-open instead');
  } else if (['proposal', 'verbal_commit'].includes(stage)) {
    messagingAngle = 'Decision facilitation — help them get across the line';
    suggestedSubject = `Re: Your digital growth plan — next steps for ${name}`;
    suggestedMessage = hasAiFollowUp
      ? lead.aiFollowUp.email || ''
      : `Hi [Name], I wanted to follow up on the plan we went through. Have you had a chance to review it? I\'m happy to answer any questions or talk through anything before you make a decision. Would it be easier to jump on a quick call?`;
    doNotDoList.push('Don\'t lower the price without asking what\'s holding them back first');
  } else {
    messagingAngle = 'Value-first re-engagement — give them something specific before asking for anything';
    suggestedSubject = `Quick insight about ${name}\'s online presence`;
    suggestedMessage = hasAiFollowUp
      ? lead.aiFollowUp.email || ''
      : `Hi [Name], I was looking at your online presence and noticed [specific insight]. I have a couple of thoughts about what this means for your business — would it be worth a quick conversation this week?`;
  }

  // Next milestone
  const milestones: Record<string, string> = {
    suspect: 'First conversation booked',
    contacted: 'Discovery call held',
    engaged: 'Proposal meeting booked',
    qualified: 'Proposal presented',
    discovery: 'Qualification confirmed and proposal booked',
    proposal: 'Verbal commitment received',
    verbal_commit: 'Agreement signed',
    won: 'Onboarding complete',
  };
  const nextMilestone = milestones[stage] || 'Next stage reached';

  // Recommended date
  const daysToAdd = urgency === 'overdue' ? 0 : urgency === 'today' ? 0 : urgency === 'this_week' ? 2 : 5;
  const recommendedByDate = new Date(Date.now() + daysToAdd * 86_400_000).toISOString();

  return {
    urgency,
    recommendedByDate,
    channel,
    channelRationale,
    focusArea,
    messagingAngle,
    suggestedSubject,
    suggestedMessage,
    asset,
    assetRationale,
    followUpReason: `${daysSince} days since last contact — ${stage} stage`,
    nextMilestone,
    doNotDoList,
  };
}

// ─── Pipeline Momentum Score ──────────────────────────────────────────────────

export function derivePipelineMomentumScore(lead: Lead, activities: any[]): PipelineMomentumScore {
  const STAGE_ORDER = ['suspect', 'contacted', 'engaged', 'qualified', 'discovery', 'proposal', 'verbal_commit', 'won'];
  const stageIdx = STAGE_ORDER.indexOf(lead.stage || 'suspect');

  const lastActivity = activities.filter(a => a.leadId === lead.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const daysSince = lastActivity ? Math.round((Date.now() - new Date(lastActivity.createdAt).getTime()) / 86_400_000) : 999;

  // Days since stage changed — approximate from activities of type 'stage_change'
  const stageActivity = activities.filter(a => a.leadId === lead.id && a.type === 'stage_change')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const daysSinceStageAdvance = stageActivity
    ? Math.round((Date.now() - new Date(stageActivity.createdAt).getTime()) / 86_400_000)
    : daysSince;

  const touchpointCount = (lead.conversationCount || 0) + (lead.attemptCount || 0);
  const convStage = lead.conversationStage || 'not_started';
  const CONV_ORDER = ['not_started', 'attempted', 'connected', 'discovery', 'qualified', 'objection', 'proposal', 'booked'];
  const convIdx = CONV_ORDER.indexOf(convStage);
  const conversationDepth: ConversationDepth =
    convIdx === 0 ? 'none' : convIdx < 3 ? 'surface' : convIdx < 5 ? 'engaged' : 'deep';

  // Risk factors
  const riskFactors: string[] = [];
  if (daysSince > 14) riskFactors.push(`No contact in ${daysSince} days — deal going cold`);
  if (daysSince > 7 && daysSince <= 14) riskFactors.push(`${daysSince} days without contact — needs attention`);
  if (conversationDepth === 'none') riskFactors.push('No meaningful conversation held yet');
  if (stageIdx < 3 && daysSinceStageAdvance > 14) riskFactors.push('Stage has not advanced in 2 weeks');
  if (!lead.growthPrescription && stageIdx >= 3) riskFactors.push('No growth prescription — missing key proposal ingredient');
  if (!lead.aiCallPrepOutput && stageIdx >= 2) riskFactors.push('No visibility analysis — weakens the conversation');
  const reviewCount = lead.sourceData?.googleReviewCount ?? 0;
  if (reviewCount === 0) riskFactors.push('No reviews — creates trust objection risk');

  // Accelerators
  const accelerators: string[] = [];
  if (lead.aiCallPrepOutput) accelerators.push('Visibility gap data ready to present');
  if (lead.growthPrescription) accelerators.push('Growth prescription available — strong proposal foundation');
  if (lead.strategyReportId) accelerators.push('Strategy report generated and shareable');
  if (lead.competitorData && Object.keys(lead.competitorData).length > 0) accelerators.push('Competitor intelligence ready to deploy');
  if (daysSince <= 2) accelerators.push('Recent contact — momentum is fresh');
  if (conversationDepth === 'deep') accelerators.push('Deep conversation engagement — close is achievable');

  // Score calculation
  let score = 50;
  score += stageIdx * 6;                           // 0–48 points for stage
  score -= Math.min(daysSince, 20) * 1.5;          // -0 to -30 for recency
  score += Math.min(touchpointCount, 10) * 1;       // up to +10 for touchpoints
  score += conversationDepth === 'deep' ? 15 : conversationDepth === 'engaged' ? 8 : conversationDepth === 'surface' ? 3 : 0;
  score -= riskFactors.length * 5;
  score += accelerators.length * 4;
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Trajectory
  let trajectory: MomentumTrajectory;
  if (daysSince > 14) trajectory = 'at_risk';
  else if (daysSince > 7) trajectory = 'stalled';
  else if (stageIdx >= 4 && daysSince <= 3) trajectory = 'accelerating';
  else if (stageIdx >= 2 && daysSince <= 5) trajectory = 'steady';
  else trajectory = 'decelerating';

  // Urgency
  let urgency: MomentumUrgency;
  if (daysSince > 14 && !['won', 'lost'].includes(lead.stage || '')) urgency = 'critical';
  else if (daysSince > 7 || (stageIdx >= 4 && daysSince > 3)) urgency = 'high';
  else if (daysSince > 3) urgency = 'medium';
  else urgency = 'low';

  // Close readiness — how ready are they to close right now
  const closeReadiness = Math.round(
    (stageIdx / (STAGE_ORDER.length - 1)) * 50
    + (conversationDepth === 'deep' ? 25 : conversationDepth === 'engaged' ? 15 : 5)
    + (lead.growthPrescription ? 15 : 0)
    + (lead.strategyReportId ? 10 : 0)
  );

  // Next milestone
  const MILESTONES: Record<string, string> = {
    suspect: 'First conversation', contacted: 'Discovery call booked',
    engaged: 'Gap presentation delivered', qualified: 'Proposal presented',
    discovery: 'Qualification complete', proposal: 'Verbal commitment',
    verbal_commit: 'Agreement signed', won: 'Provisioning triggered',
  };
  const nextMilestone = MILESTONES[lead.stage || 'suspect'] || 'Next stage';

  // Estimated days to close
  const remainingStages = STAGE_ORDER.length - 1 - stageIdx;
  const estimatedDaysToClose = remainingStages > 0 ? remainingStages * 7 : null;

  const urgencyLabels: Record<MomentumUrgency, string> = {
    critical: 'Act today — deal at risk',
    high: 'Follow up this week',
    medium: 'Keep momentum going',
    low: 'On track',
  };

  return {
    score,
    trajectory,
    urgency,
    daysSinceLastContact: daysSince,
    daysSinceStageAdvance,
    touchpointCount,
    conversationDepth,
    closeReadiness: Math.min(100, closeReadiness),
    riskFactors,
    accelerators,
    nextMilestone,
    estimatedDaysToClose,
    stallLabel: daysSince > 7 ? `${daysSince}d stalled` : undefined,
    urgencyLabel: urgencyLabels[urgency],
  };
}

// ─── Objection Bank (static, stage-aware) ────────────────────────────────────

export const OBJECTION_BANK: SalesObjection[] = [
  {
    id: 'too-expensive',
    objectionText: "It's a bit more than I was expecting / I can't justify that spend right now",
    stage: ['qualified', 'proposal', 'verbal_commit'],
    frequency: 'very_common',
    realConcern: 'They are not yet convinced the outcome justifies the investment, or they have budget constraints they haven\'t disclosed',
    framingTip: 'Don\'t defend the price — return to the value. Ask what it would be worth to them if the outcome is achieved.',
    responseScript: `"I completely understand — this is a real investment. Can I ask you something? If we delivered the outcome we\'ve been talking about — let\'s say consistent quality enquiries every month — what would one or two extra jobs a month be worth to your business over a year? [Pause] The investment only needs to deliver that to pay for itself multiple times over. Does the outcome feel right, even if the number feels big?"`,
    bridgeBack: 'Setting the investment aside for a moment — does the strategy itself feel like the right direction?',
    doNotSay: 'Don\'t say "we can do it cheaper" or immediately offer a discount',
    successSignal: 'They shift from price to talking about the outcome or ask about payment terms',
  },
  {
    id: 'need-to-think',
    objectionText: "I need to think about it / let me sit on it for a bit",
    stage: ['qualified', 'proposal', 'verbal_commit'],
    frequency: 'very_common',
    realConcern: 'Something is unresolved — either value, trust, timing, or there is another decision-maker involved',
    framingTip: 'Never accept this without understanding what specifically needs to be thought through.',
    responseScript: `"Of course — this is an important decision and I respect that. Can I ask, what\'s the one or two things you want to think through? I want to make sure you have everything you need to feel confident. Is it more about the investment, the timing, or wanting to understand the process better?"`,
    bridgeBack: 'What would it take for you to feel completely comfortable moving forward?',
    doNotSay: 'Don\'t say "sure, I\'ll follow up next week" and leave it at that',
    successSignal: 'They name a specific concern you can address',
  },
  {
    id: 'already-have-provider',
    objectionText: "We already have someone doing our website / digital marketing",
    stage: ['suspect', 'contacted', 'engaged', 'qualified'],
    frequency: 'very_common',
    realConcern: 'They are comfortable with the status quo — or they are loyal to a current provider',
    framingTip: 'Don\'t attack the current provider. Ask a question that makes them evaluate the results, not the relationship.',
    responseScript: `"That\'s great — what results have you been getting from them? [Listen] I ask because the businesses I work with who were in a similar situation found there was often a gap between the effort going in and the leads coming out. I\'m not suggesting anything is wrong — but would it be worth a second look, just to confirm things are tracking the way they should?"`,
    bridgeBack: 'If the results are there, I\'d say stick with what\'s working. What are the results like?',
    doNotSay: 'Don\'t immediately criticise the current provider or claim you\'re better',
    successSignal: 'They admit they aren\'t sure about the results, or invite you to show them something',
  },
  {
    id: 'not-ready-yet',
    objectionText: "We\'re not ready yet / maybe in a few months",
    stage: ['suspect', 'contacted', 'engaged'],
    frequency: 'common',
    realConcern: 'They don\'t see the urgency — or there is a genuine internal event (busy season, staff changes, etc.)',
    framingTip: 'Find out what "ready" means to them — and explore what happens if they wait.',
    responseScript: `"Totally get it — what does \'ready\' look like for you? [Listen] The reason I ask is that the businesses I see who wait 3–6 months typically find their competitors have advanced in that time — and they\'re playing catch-up rather than leading. What\'s the one thing you\'d want to have in place before moving forward?"`,
    bridgeBack: 'If timing is the main thing, what would need to change for you to feel ready?',
    doNotSay: 'Don\'t accept "a few months" without a specific reason and a specific date',
    successSignal: 'They give you a specific reason or a specific date — now you have something concrete to work with',
  },
  {
    id: 'bad-experience',
    objectionText: "We\'ve had a bad experience with a digital agency before",
    stage: ['suspect', 'contacted', 'engaged', 'qualified'],
    frequency: 'common',
    realConcern: 'Trust has been broken. They associate agencies with overpromising and underdelivering.',
    framingTip: 'Don\'t be defensive. Acknowledge it fully and differentiate through specificity, not promises.',
    responseScript: `"I\'m really sorry to hear that — unfortunately it\'s more common than it should be in this industry. Can I ask what happened? [Listen] I\'d never ask you to take my word for it — everything I do is transparent, measurable, and tied to outcomes you can see. What would you need to see to feel confident this would be different?"`,
    bridgeBack: 'What would a provider need to show you, specifically, for you to feel safe giving it another go?',
    doNotSay: 'Don\'t immediately say "we\'re different" — show it, don\'t tell it',
    successSignal: 'They start describing what they\'d want to see — now you can deliver against that specific picture',
  },
  {
    id: 'dont-see-value',
    objectionText: "I\'m not sure it would work for my industry / my customers don\'t use Google",
    stage: ['suspect', 'contacted', 'engaged'],
    frequency: 'occasional',
    realConcern: 'They haven\'t been shown evidence that this works in their context — or they genuinely don\'t believe in digital',
    framingTip: 'Use data, not opinions. Show them what their competitors are doing and the search demand that exists.',
    responseScript: `"I hear that — it\'s actually a pretty common concern. Can I show you something? [Pull up the data] These are the searches happening in your area right now for [their service]. Your competitor [name] is showing up for all of these. You\'re not appearing for any of them. These are real customers looking for exactly what you offer. The question isn\'t whether they\'re searching — it\'s whether they find you or someone else."`,
    bridgeBack: 'If I could show you that customers are searching for your exact services in your area, would that change the picture?',
    doNotSay: 'Don\'t get into a debate about whether Google works — pivot to evidence',
    successSignal: 'They engage with the data and start asking questions about it',
  },
  {
    id: 'need-partner-approval',
    objectionText: "I need to talk to my partner / accountant / business partner first",
    stage: ['qualified', 'proposal', 'verbal_commit'],
    frequency: 'common',
    realConcern: 'They are not the sole decision maker — or they are using this as a delay tactic',
    framingTip: 'Get the third party involved as quickly as possible — don\'t let the conversation go cold waiting.',
    responseScript: `"Absolutely — this is a business decision and it makes sense to have everyone on the same page. Can I ask — does your [partner/accountant] typically want to be involved in decisions like this, or is it more of a heads-up? [Listen] Would it be helpful if I put together a simple summary they could review? Or even better, could we find 15 minutes where I could walk them through it directly?"`,
    bridgeBack: 'Can we schedule a call with them included so I can answer any questions directly?',
    doNotSay: 'Don\'t just say "sure, let me know what they say" — you\'ll lose the deal',
    successSignal: 'They either agree to a three-way call or give you a specific date the decision will be made',
  },
  {
    id: 'already-busy',
    objectionText: "We\'re already flat out / don\'t need more work right now",
    stage: ['suspect', 'contacted', 'engaged'],
    frequency: 'occasional',
    realConcern: 'They are currently cash-flow positive but potentially at capacity risk, seasonality concern, or don\'t have systems to scale',
    framingTip: 'Shift the conversation from volume to quality — and plant the seed about what happens when the busy period ends.',
    responseScript: `"That\'s actually the best time to build a digital foundation — it means you can be selective about the work you take and charge accordingly. The businesses who invest when they\'re busy are the ones who stay busy. When things slow down — and they always do — the ones who built their online presence in the good times are the ones who come out ahead. When do things typically quiet down for you?"`,
    bridgeBack: 'What happens to your pipeline in 3–4 months when this busy period ends?',
    doNotSay: 'Don\'t drop it — this objection often means they have money to invest',
    successSignal: 'They acknowledge a quieter period coming up — now you have a natural timeline',
  },
];

export function deriveApplicableObjections(lead: Lead): SalesObjection[] {
  const stage = lead.stage || 'suspect';
  return OBJECTION_BANK.filter(o => o.stage.includes(stage));
}
