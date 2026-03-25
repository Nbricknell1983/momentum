/**
 * Strategy Presentation Adapter
 *
 * Pure transformation layer: maps Lead intelligence data (from Firestore / Redux)
 * into a client-safe StrategyDocument + StrategyDiagnosis that feeds into
 * the existing StrategyReportPage.
 *
 * Zero AI calls — derived entirely from already-computed intelligence fields
 * on the Lead document (growthPrescription, strategyDiagnosis, aiGrowthPlan,
 * aiCallPrepOutput, prepCallPack, ahrefsData, competitorData, crawledPages, etc.)
 */

import type {
  StrategyDocument,
  StrategyDiagnosis,
  DigitalVisibilityTriangle,
  DiscoveryPathStage,
  IntentGap,
  BuyerRealityGap,
  MarketOpportunity,
  SearchEngineView,
  GrowthPillar,
  ProjectedOutcome,
  KPI,
  GrowthPhase,
  CostOfInaction,
  MomentumMoment,
  InsightSnapshot,
  ScopeFraming,
  StrategyConfidence,
  ConfidenceLevel,
  PresentationRoadmap,
  PresentationConfidenceBlock,
} from './strategyPresentationTypes';

// ─── Input: what we read off the Lead document ────────────────────────────────

export interface LeadIntelligenceInput {
  // Core lead fields
  businessName: string;
  industry?: string;
  suburb?: string;
  city?: string;
  stateRegion?: string;
  website?: string;

  // AI output fields on the lead
  growthPrescription?: any;
  strategyDiagnosis?: any;
  aiGrowthPlan?: any;
  aiCallPrepOutput?: any;
  prepCallPack?: any;
  ahrefsData?: any;
  competitorData?: any;
  crawledPages?: any[];
  sitemapPages?: any[];
  aiInsights?: any;
  strategyIntelligence?: any;

  // Sales context
  pipelineStage?: string;
  estimatedValue?: number;
  currency?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeStr(val: any, fallback = ''): string {
  if (typeof val === 'string') return val.trim();
  if (val != null) return String(val).trim();
  return fallback;
}

function safeNum(val: any, fallback = 0): number {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function safeArr<T>(val: any): T[] {
  return Array.isArray(val) ? val : [];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function scoreLabel(n: number): 'strong' | 'partial' | 'weak' {
  if (n >= 65) return 'strong';
  if (n >= 40) return 'partial';
  return 'weak';
}

function confidenceLevel(dataPointCount: number): ConfidenceLevel {
  if (dataPointCount >= 5) return 'High';
  if (dataPointCount >= 2) return 'Medium';
  return 'Low';
}

// ─── Confidence derivation ────────────────────────────────────────────────────

function deriveStrategyConfidence(inp: LeadIntelligenceInput): StrategyConfidence {
  const observed: string[] = [];
  const estimated: string[] = [];

  if (inp.crawledPages?.length) observed.push('Website crawl data');
  if (inp.sitemapPages?.length) observed.push('Sitemap page list');
  if (inp.ahrefsData?.keywords?.length) observed.push('Ahrefs keyword data');
  if (inp.competitorData?.competitors?.length) observed.push('Competitor analysis');
  if (inp.prepCallPack?.gbpData) observed.push('Google Business Profile data');

  if (!inp.ahrefsData?.keywords?.length) estimated.push('Keyword volumes (estimated from category benchmarks)');
  if (!inp.competitorData?.competitors?.length) estimated.push('Competitor positions (estimated from industry data)');
  if (!inp.crawledPages?.length) estimated.push('Site page distribution (estimated)');

  const level = confidenceLevel(observed.length);

  const explanations: Record<ConfidenceLevel, string> = {
    High: `This strategy is built from ${observed.length} observed data sources including live website, keyword, and GBP data. Estimates are clearly labelled.`,
    Medium: `This strategy combines observed data with strategic estimates. ${observed.length > 0 ? `Confirmed: ${observed.join(', ')}.` : ''} Precision will improve after onboarding integrations are connected.`,
    Low: 'This strategy is based on industry benchmarks and category analysis. Once onboarding integrations are connected, all estimates will be replaced with live data.',
  };

  return {
    level,
    explanation: explanations[level],
    observedDataSources: observed,
    estimatedDataSources: estimated,
  };
}

// ─── Strategy Diagnosis ───────────────────────────────────────────────────────

export function deriveStrategyDiagnosis(inp: LeadIntelligenceInput): StrategyDiagnosis {
  const sd = inp.strategyDiagnosis || {};
  const gp = inp.growthPrescription || {};
  const pp = inp.prepCallPack || {};
  const acp = inp.aiCallPrepOutput || {};

  // Subscores — prefer real values from strategyDiagnosis, otherwise derive
  const subscores = sd.subscores || {};
  const serviceClarityScore  = clamp(safeNum(subscores.serviceClarityScore, 40), 0, 100);
  const locationRelevanceScore = clamp(safeNum(subscores.locationRelevanceScore, 35), 0, 100);
  const contentCoverageScore = clamp(safeNum(subscores.contentCoverageScore, 30), 0, 100);
  const gbpAlignmentScore    = clamp(safeNum(subscores.gbpAlignmentScore, 40), 0, 100);
  const authorityScore       = clamp(safeNum(subscores.authorityScore, 25), 0, 100);

  const readinessScore = sd.readinessScore
    ? clamp(safeNum(sd.readinessScore), 0, 100)
    : Math.round((serviceClarityScore + locationRelevanceScore + contentCoverageScore + gbpAlignmentScore + authorityScore) / 5);

  // Gaps
  const rawGaps: any[] = safeArr(sd.gaps || gp.keyGaps || acp.gaps);
  const gaps = rawGaps.slice(0, 5).map((g: any) => ({
    title: typeof g === 'string' ? g : safeStr(g.title || g.gap || g.name, 'Visibility gap'),
  }));
  if (gaps.length === 0) {
    gaps.push(
      { title: 'Limited local search coverage' },
      { title: 'Google Business Profile not fully optimised' },
      { title: 'Low service-page depth for buyer intent' },
    );
  }

  // Priorities
  const rawPriorities: any[] = safeArr(sd.priorities || gp.keyPriorities || gp.immediateActions);
  const priorities: string[] = rawPriorities.slice(0, 4).map((p: any) =>
    typeof p === 'string' ? p : safeStr(p.title || p.action || p.priority, '')
  ).filter(Boolean);
  if (priorities.length === 0) {
    priorities.push('Improve local search visibility', 'Optimise Google Business Profile', 'Expand service content coverage');
  }

  // Growth potential
  const growthData = sd.growthPotential || gp.growthPotential || {};
  const forecastBand = growthData.forecastBand || {};
  const growthPotential = {
    summary: safeStr(growthData.summary, `${inp.businessName} has meaningful untapped search demand in this market.`),
    forecastBand: {
      additionalImpressions: safeStr(forecastBand.additionalImpressions, '+2,000–5,000/mo'),
      additionalVisitors:    safeStr(forecastBand.additionalVisitors, '+150–400/mo'),
      additionalEnquiries:   safeStr(forecastBand.additionalEnquiries, '+8–25/mo'),
    },
  };

  const insightSentence = safeStr(
    sd.insightSentence || gp.insightSentence,
    `${inp.businessName} has a ${readinessScore < 45 ? 'significant' : 'clear'} opportunity to capture more local search demand.`
  );

  const currentPosition = safeStr(
    sd.currentPosition || gp.currentPosition || pp.currentPosition,
    `${inp.businessName} is currently not ranking for its highest-value search terms.`
  );

  return {
    readinessScore,
    insightSentence,
    subscores: { serviceClarityScore, locationRelevanceScore, contentCoverageScore, gbpAlignmentScore, authorityScore },
    gaps,
    priorities,
    growthPotential,
    currentPosition,
  };
}

// ─── Digital Visibility Triangle ─────────────────────────────────────────────

function deriveVisibilityTriangle(inp: LeadIntelligenceInput): DigitalVisibilityTriangle {
  const sd = inp.strategyDiagnosis || {};
  const dvt = sd.digitalVisibilityTriangle || {};
  const sub = sd.subscores || {};

  const relevanceScore = clamp(
    dvt.relevance?.score ?? Math.round((safeNum(sub.serviceClarityScore, 40) + safeNum(sub.contentCoverageScore, 30)) / 2),
    0, 100
  );
  const authorityScore = clamp(dvt.authority?.score ?? safeNum(sub.authorityScore, 25), 0, 100);
  const trustScore = clamp(
    dvt.trust?.score ?? Math.round((safeNum(sub.gbpAlignmentScore, 40) + safeNum(sub.authorityScore, 25)) / 2),
    0, 100
  );

  const name = inp.businessName;
  return {
    relevance: {
      score: relevanceScore,
      evidence: dvt.relevance?.evidence || `${name}'s website content coverage and service-page depth determine relevance score.`,
      interpretation: dvt.relevance?.interpretation || (
        relevanceScore < 45
          ? `Search engines cannot clearly identify all services ${name} offers — limiting impression volume.`
          : `${name} has reasonable service relevance signals but location coverage could be strengthened.`
      ),
    },
    authority: {
      score: authorityScore,
      evidence: dvt.authority?.evidence || `Domain authority, backlink profile, and citation consistency determine this score.`,
      interpretation: dvt.authority?.interpretation || (
        authorityScore < 45
          ? `${name}'s digital authority is low relative to local competitors — making it difficult to outrank established players.`
          : `${name} has a reasonable authority baseline but link building would accelerate ranking growth.`
      ),
    },
    trust: {
      score: trustScore,
      evidence: dvt.trust?.evidence || `Review volume, GBP completeness, and brand consistency signals inform this score.`,
      interpretation: dvt.trust?.interpretation || (
        trustScore < 45
          ? `Trust signals are thin — buyers researching ${name} may not find enough social proof to convert.`
          : `${name} has a decent trust foundation; systematic review growth would unlock higher conversion rates.`
      ),
    },
  };
}

// ─── Discovery Path ───────────────────────────────────────────────────────────

function deriveDiscoveryPath(inp: LeadIntelligenceInput): DiscoveryPathStage[] {
  const sd = inp.strategyDiagnosis || {};
  const existing: any[] = safeArr(sd.discoveryPath);
  if (existing.length >= 3) {
    return existing.map((s: any) => ({
      stage: safeStr(s.stage),
      strength: s.strength || scoreLabel(safeNum(s.score, 35)),
      issue: safeStr(s.issue),
      impact: safeStr(s.impact),
    }));
  }

  const sub = sd.subscores || {};
  const svc = safeNum(sub.serviceClarityScore, 40);
  const loc = safeNum(sub.locationRelevanceScore, 35);
  const gbp = safeNum(sub.gbpAlignmentScore, 40);
  const auth = safeNum(sub.authorityScore, 25);
  const name = inp.businessName;

  return [
    {
      stage: 'Awareness — Search Impression',
      strength: scoreLabel(Math.round((svc + loc) / 2)),
      issue: svc < 50 ? `Limited service-specific pages mean ${name} misses many buyer search queries.` : `${name} appears for core terms but lacks depth across long-tail buyer searches.`,
      impact: 'Fewer impressions means fewer opportunities to enter the buyer\'s journey at all.',
    },
    {
      stage: 'Consideration — Click & Trust',
      strength: scoreLabel(Math.round((auth + gbp) / 2)),
      issue: auth < 45 ? `Low domain authority limits click-through — buyers see stronger competitors ranked higher.` : `Trust signals on the site need strengthening to convert clicks into enquiry intent.`,
      impact: 'Buyers click on businesses they trust most — poor authority means lost clicks to competitors.',
    },
    {
      stage: 'Local Discovery — Google Maps & GBP',
      strength: scoreLabel(gbp),
      issue: gbp < 50 ? `Google Business Profile is incomplete or under-optimised, reducing local map pack visibility.` : `GBP is present but review volume and post activity could be strengthened.`,
      impact: 'Map pack visibility is critical for local buyer intent — absent here means invisible to nearby searchers.',
    },
    {
      stage: 'Conversion — Enquiry & Contact',
      strength: scoreLabel(Math.round((svc + gbp) / 2)),
      issue: 'Website pages lack strong conversion signals — calls-to-action are not prominent and trust proof is limited.',
      impact: 'Visitors arrive but don\'t enquire — each unconverted visit is a wasted opportunity.',
    },
  ];
}

// ─── Intent Gaps ─────────────────────────────────────────────────────────────

function deriveIntentGaps(inp: LeadIntelligenceInput): IntentGap[] {
  const sd = inp.strategyDiagnosis || {};
  const acp = inp.aiCallPrepOutput || {};
  const existing: any[] = safeArr(sd.intentGaps || acp.intentGaps);

  if (existing.length >= 3) {
    return existing.slice(0, 6).map((g: any) => ({
      category: safeStr(g.category || g.intent),
      coverage: g.coverage || 'missing',
      evidence: safeStr(g.evidence),
      suggestedMove: safeStr(g.suggestedMove || g.recommendation),
    }));
  }

  return [
    {
      category: 'High commercial intent (ready to buy)',
      coverage: 'partial',
      evidence: 'Some service pages exist but they don\'t target the specific buying phrases customers use when they\'re ready to hire.',
      suggestedMove: 'Create dedicated service landing pages targeting "hire + [service] + [location]" queries.',
    },
    {
      category: 'Local area intent (suburb-specific)',
      coverage: 'missing',
      evidence: 'No location-specific pages targeting nearby suburbs or service areas beyond the main location.',
      suggestedMove: 'Build local service pages for top 3–5 suburbs in the service area with localised content.',
    },
    {
      category: 'Problem-aware (research stage)',
      coverage: 'missing',
      evidence: 'No blog or educational content addressing the problems customers search when beginning their research journey.',
      suggestedMove: 'Develop 3–4 cornerstone articles addressing the most common buyer questions in this category.',
    },
    {
      category: 'Trust & comparison (shortlisting stage)',
      coverage: 'partial',
      evidence: 'Limited social proof, case studies, or "why choose us" content to help buyers on the shortlist.',
      suggestedMove: 'Add testimonials, before/after case studies, and a clear differentiator section.',
    },
  ];
}

// ─── Buyer Reality Gap ───────────────────────────────────────────────────────

function deriveBuyerRealityGap(inp: LeadIntelligenceInput): BuyerRealityGap {
  const sd = inp.strategyDiagnosis || {};
  const acp = inp.aiCallPrepOutput || {};
  const existing = sd.buyerRealityGap || acp.buyerRealityGap;
  const name = inp.businessName;

  if (existing?.points?.length) {
    return {
      summary: safeStr(existing.summary),
      points: safeArr(existing.points).slice(0, 5).map((p: any) => ({
        buyerExpects: safeStr(p.buyerExpects || p.expect),
        currentReality: safeStr(p.currentReality || p.reality),
        severity: p.severity || 'moderate',
      })),
    };
  }

  return {
    summary: `What ${name}'s buyers expect to find online doesn't match what they currently encounter. Closing this gap is the fastest route to more enquiries.`,
    points: [
      {
        buyerExpects: 'A website clearly listing all services with pricing guidance or project examples',
        currentReality: 'Generic homepage with limited service detail and no social proof visible above the fold',
        severity: 'critical',
      },
      {
        buyerExpects: 'A Google Business Profile with recent reviews, photos, and correct business hours',
        currentReality: 'GBP exists but has limited reviews and out-of-date or incomplete information',
        severity: 'moderate',
      },
      {
        buyerExpects: 'Easy to find for their specific suburb or service area',
        currentReality: 'Not appearing in local search results for nearby suburbs',
        severity: 'critical',
      },
    ],
  };
}

// ─── Market Opportunity ───────────────────────────────────────────────────────

function deriveMarketOpportunity(inp: LeadIntelligenceInput): MarketOpportunity {
  const gp = inp.growthPrescription || {};
  const acp = inp.aiCallPrepOutput || {};
  const ahref = inp.ahrefsData || {};
  const sd = inp.strategyDiagnosis || {};

  const mo = sd.marketOpportunity || gp.marketOpportunity || acp.marketOpportunity || {};
  const totalSearches = safeNum(mo.totalMonthlySearches || ahref.totalMonthlySearches, 0);

  // Build keyword list from Ahrefs data
  const rawKeywords: any[] = safeArr(ahref.keywords || mo.keywords || []);
  const keywords = rawKeywords.slice(0, 15).map((kw: any) => ({
    keyword: safeStr(kw.keyword || kw.term),
    monthlySearches: safeNum(kw.volume || kw.monthlySearches, 0),
    currentRank: safeStr(kw.position != null ? (kw.position === 0 ? 'Not ranking' : `#${kw.position}`) : kw.currentRank, 'Not ranking'),
    difficulty: kw.difficulty != null ? safeNum(kw.difficulty) : null,
    opportunity: kw.opportunity || (safeNum(kw.volume, 0) > 200 && safeNum(kw.position, 100) > 10 ? 'high' : safeNum(kw.volume, 0) > 50 ? 'medium' : 'low'),
  }));

  return {
    summary: safeStr(
      mo.summary,
      `There is significant search demand in this market that ${inp.businessName} is not currently capturing.`
    ),
    totalMonthlySearches: totalSearches || 1200,
    currentCapture: safeStr(mo.currentCapture, totalSearches ? `~${Math.round(totalSearches * 0.01)}%` : '<1%'),
    potentialCapture: safeStr(mo.potentialCapture, '3–8%'),
    keyInsight: safeStr(
      mo.keyInsight,
      `Buyers are actively searching for these services right now — the opportunity is real and recurring.`
    ),
    keywords,
  };
}

// ─── Search Engine View ───────────────────────────────────────────────────────

function deriveSearchEngineView(inp: LeadIntelligenceInput): SearchEngineView {
  const pages: any[] = safeArr(inp.crawledPages || inp.sitemapPages);
  if (pages.length === 0) {
    return { totalPages: 0, servicePages: 0, locationPages: 0, portfolioPages: 0, otherPages: 0 };
  }

  let servicePages = 0; let locationPages = 0; let portfolioPages = 0;
  for (const p of pages) {
    const url = safeStr(p.url || p.loc || p.path || '').toLowerCase();
    const type = safeStr(p.pageType || p.type || '').toLowerCase();
    if (type === 'service' || url.includes('/service') || url.includes('/what-we-do')) servicePages++;
    else if (type === 'location' || url.includes('/area') || url.includes('/suburb') || url.includes('/location')) locationPages++;
    else if (type === 'portfolio' || url.includes('/project') || url.includes('/gallery') || url.includes('/work')) portfolioPages++;
  }
  const otherPages = Math.max(0, pages.length - servicePages - locationPages - portfolioPages);
  return { totalPages: pages.length, servicePages, locationPages, portfolioPages, otherPages };
}

// ─── Growth Pillars ───────────────────────────────────────────────────────────

function deriveGrowthPillars(inp: LeadIntelligenceInput): GrowthPillar[] {
  const gp = inp.growthPrescription || {};
  const sd = inp.strategyDiagnosis || {};

  const rawStack: any[] = safeArr(gp.recommendedStack || gp.pillars || sd.recommendedStack || []);
  if (rawStack.length >= 2) {
    return rawStack.slice(0, 4).map((s: any) => ({
      pillar: safeStr(s.service || s.pillar || s.title || s.name),
      focus: safeStr(s.focus || s.description || s.rationale),
      timeline: safeStr(s.timeline || s.timeframe, '3–6 months'),
      roi: safeStr(s.roi || s.expectedOutcome || s.impact, 'Increased enquiry volume'),
    }));
  }

  // Default pillars based on lead's recommended services
  const pillars: GrowthPillar[] = [];
  const services: string[] = safeArr(gp.services || sd.services || []);

  const pillarMap: Record<string, GrowthPillar> = {
    Website: {
      pillar: 'Website',
      focus: 'New conversion-focused website with service pages, trust signals, and clear calls to action',
      timeline: '6–8 weeks',
      roi: 'Improved conversion rate — more visitors become enquiries',
    },
    SEO: {
      pillar: 'SEO',
      focus: 'Local search optimisation targeting high-intent buyer keywords in the service area',
      timeline: '3–6 months to meaningful rankings',
      roi: 'Compounding organic traffic growth and reduced reliance on paid advertising',
    },
    'Google Business Profile': {
      pillar: 'Google Business Profile',
      focus: 'Complete GBP optimisation — categories, photos, posts, reviews, Q&A',
      timeline: '4–8 weeks to full optimisation',
      roi: 'Local map pack visibility drives calls and directions directly from Google',
    },
    'Google Ads': {
      pillar: 'Google Ads',
      focus: 'Targeted paid campaigns for high-value service terms while organic rankings grow',
      timeline: 'Immediate lead flow from day one',
      roi: 'Predictable lead volume with measurable cost per acquisition',
    },
  };

  for (const svc of services) {
    const match = Object.keys(pillarMap).find(k => svc.toLowerCase().includes(k.toLowerCase()));
    if (match && pillarMap[match]) { pillars.push(pillarMap[match]); delete pillarMap[match]; }
  }

  // Fill to 3 minimum
  if (pillars.length < 3) {
    for (const p of Object.values(pillarMap)) {
      pillars.push(p);
      if (pillars.length >= 3) break;
    }
  }
  return pillars.slice(0, 4);
}

// ─── Projected Outcomes ───────────────────────────────────────────────────────

function deriveProjectedOutcomes(inp: LeadIntelligenceInput): ProjectedOutcome[] {
  const gp = inp.growthPrescription || {};
  const raw: any[] = safeArr(gp.projectedOutcomes || gp.outcomes || []);

  if (raw.length >= 2) {
    return raw.slice(0, 4).map((o: any) => ({
      month: safeStr(o.month || o.timeframe, '6 months'),
      estimatedLeads: safeStr(o.estimatedLeads || o.leads || o.enquiries, '5–15/mo'),
      rankingKeywords: o.rankingKeywords != null ? safeNum(o.rankingKeywords) : null,
      confidence: o.confidence || 'medium',
      scenarioCaveat: safeStr(o.scenarioCaveat || o.caveat, ''),
    }));
  }

  return [
    { month: '3 months', estimatedLeads: '2–8/mo', rankingKeywords: 8, confidence: 'medium', scenarioCaveat: 'Early rankings begin appearing; GBP visibility improves.' },
    { month: '6 months', estimatedLeads: '5–15/mo', rankingKeywords: 20, confidence: 'medium', scenarioCaveat: 'Core service terms entering page 1; enquiry momentum building.' },
    { month: '12 months', estimatedLeads: '12–30/mo', rankingKeywords: 40, confidence: 'medium', scenarioCaveat: 'Established local authority; compounding organic growth.' },
  ];
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

function deriveKPIs(inp: LeadIntelligenceInput): KPI[] {
  const gp = inp.growthPrescription || {};
  const raw: any[] = safeArr(gp.kpis || []);

  if (raw.length >= 3) {
    return raw.slice(0, 6).map((k: any) => ({
      metric: safeStr(k.metric),
      baseline: safeStr(k.baseline || k.current, 'Baseline TBC'),
      target12Month: safeStr(k.target12Month || k.target, 'To be set after audit'),
      dataQuality: k.dataQuality || 'estimated',
    }));
  }

  return [
    { metric: 'Organic search impressions (monthly)', baseline: 'Current baseline', target12Month: '+150–300%', dataQuality: 'estimated' },
    { metric: 'Organic click-throughs (monthly)', baseline: 'Current baseline', target12Month: '+200%', dataQuality: 'estimated' },
    { metric: 'Google Maps views (monthly)', baseline: 'Current GBP baseline', target12Month: '+80–150%', dataQuality: 'estimated' },
    { metric: 'Monthly enquiries from digital', baseline: 'Current estimate', target12Month: '+10–25/mo additional', dataQuality: 'estimated' },
    { metric: 'Top 3 keyword rankings (page 1)', baseline: '0', target12Month: '8–15 terms', dataQuality: 'projected' },
  ];
}

// ─── Growth Phases ────────────────────────────────────────────────────────────

function deriveGrowthPhases(inp: LeadIntelligenceInput): GrowthPhase[] {
  const gp = inp.growthPrescription || {};
  const raw: any[] = safeArr(gp.growthPhases || gp.phases || []);

  if (raw.length >= 2) {
    return raw.slice(0, 4).map((p: any) => ({
      phase: safeStr(p.phase || p.name),
      focus: safeStr(p.focus || p.description),
      milestone: safeStr(p.milestone || p.outcome),
      timeline: safeStr(p.timeline || p.timeframe, ''),
    }));
  }

  return [
    {
      phase: 'Foundation',
      focus: 'Establish all digital assets — website, GBP, tracking, and core content — with conversion-first structure.',
      milestone: 'All digital foundations set; Google starts indexing new content.',
      timeline: 'Weeks 1–8',
    },
    {
      phase: 'Visibility Growth',
      focus: 'Build keyword rankings, GBP authority, and local signals across the service area.',
      milestone: 'Core service terms on page 1; map pack impressions climbing.',
      timeline: 'Months 2–5',
    },
    {
      phase: 'Momentum',
      focus: 'Expand content coverage, increase backlinks, and amplify the highest-converting pages.',
      milestone: 'Consistent page 1 rankings; monthly enquiry volume meeting targets.',
      timeline: 'Months 5–9',
    },
    {
      phase: 'Optimise & Scale',
      focus: 'Refine based on performance data — double down on what works, identify new opportunities.',
      milestone: 'Compounding growth; system running on autopilot with minimal intervention needed.',
      timeline: 'Months 9–12+',
    },
  ];
}

// ─── Cost of Inaction ─────────────────────────────────────────────────────────

function deriveCostOfInaction(inp: LeadIntelligenceInput): CostOfInaction {
  const gp = inp.growthPrescription || {};
  const sd = inp.strategyDiagnosis || {};
  const existing = gp.costOfInaction || sd.costOfInaction;
  const name = inp.businessName;
  const est = inp.estimatedValue || 5000;

  if (existing?.headline) {
    return {
      headline: safeStr(existing.headline),
      body: safeStr(existing.body || existing.description),
      metrics: safeArr(existing.metrics).slice(0, 3),
    };
  }

  return {
    headline: 'Every month without this is a month your competitors consolidate their advantage',
    body: `While ${name} waits, competitors who have invested in digital visibility are compounding their advantage. Search rankings are not a one-time result — they reward consistent investment. The businesses ranking on page 1 today started building that authority months or years ago.`,
    metrics: [
      { label: 'Est. missed monthly enquiries', value: '10–25' },
      { label: 'Est. missed annual revenue', value: `$${(est * 12).toLocaleString()}–$${(est * 24).toLocaleString()}` },
      { label: 'Competitor gap growing each month', value: '30–60 days of compounding authority' },
    ],
  };
}

// ─── Momentum Moment ─────────────────────────────────────────────────────────

function deriveMomentumMoment(inp: LeadIntelligenceInput): MomentumMoment {
  const gp = inp.growthPrescription || {};
  const sd = inp.strategyDiagnosis || {};
  const existing = gp.momentumMoment || sd.momentumMoment;
  const name = inp.businessName;

  if (existing?.headline) {
    return {
      headline: safeStr(existing.headline),
      body: safeStr(existing.body),
      urgency: existing.urgency || 'high',
    };
  }

  return {
    headline: `The right moment for ${name} is now`,
    body: `Search demand in this category is active and growing. Businesses that act decisively on digital visibility in the next 90 days will be the ones capturing that demand at the 12-month mark. Waiting means starting from behind — starting now means being ahead.`,
    urgency: 'high',
  };
}

// ─── Insight Snapshots ────────────────────────────────────────────────────────

function deriveInsightSnapshots(inp: LeadIntelligenceInput): InsightSnapshot[] {
  const gp = inp.growthPrescription || {};
  const pp = inp.prepCallPack || {};
  const raw: any[] = safeArr(gp.insightSnapshots || pp.insightSnapshots || []);

  if (raw.length >= 2) {
    return raw.slice(0, 3).map((s: any) => ({
      headline: safeStr(s.headline),
      metric: safeStr(s.metric),
      explanation: safeStr(s.explanation),
    }));
  }

  const ahref = inp.ahrefsData || {};
  const totalSearches = safeNum(ahref.totalMonthlySearches, 1200);

  return [
    {
      headline: 'Monthly search demand',
      metric: `${totalSearches.toLocaleString()}+`,
      explanation: `Estimated monthly searches for services like ${inp.businessName || 'this business'} in this area. This is the pool of potential buyers searching right now.`,
    },
    {
      headline: 'Current digital capture rate',
      metric: '<1%',
      explanation: 'Estimated share of that search demand currently reaching this business. The gap between this and the potential represents untapped revenue.',
    },
    {
      headline: 'Addressable opportunity',
      metric: '3–8% capture',
      explanation: 'A realistic 12-month target. At 3% capture of a 1,200/mo market, that\'s 36 additional visitors per month — each a potential enquiry.',
    },
  ];
}

// ─── Scope Framing ────────────────────────────────────────────────────────────

function deriveScopeFraming(inp: LeadIntelligenceInput): ScopeFraming {
  const gp = inp.growthPrescription || {};
  const existing = gp.scopeFraming;

  if (existing?.headline) {
    return {
      headline: safeStr(existing.headline),
      leadText: safeStr(existing.leadText),
      ctaText: safeStr(existing.ctaText, 'Accept selected services'),
    };
  }

  return {
    headline: 'Choose where to start',
    leadText: 'Select the services you want to move forward with. Your account manager will be in touch within one business day to begin the process.',
    ctaText: 'Accept and proceed',
  };
}

// ─── One-Sentence Strategy ────────────────────────────────────────────────────

function deriveOneSentenceStrategy(inp: LeadIntelligenceInput): string {
  const gp = inp.growthPrescription || {};
  const sd = inp.strategyDiagnosis || {};
  const existing = gp.oneSentenceStrategy || sd.oneSentenceStrategy;
  if (existing) return safeStr(existing);

  const location = inp.suburb || inp.city || inp.stateRegion || 'this area';
  const industry = inp.industry || 'their industry';
  return `Build ${inp.businessName}'s dominant digital presence in ${location} by establishing strong search visibility, local authority, and a conversion-ready website that turns buyer intent into consistent enquiries.`;
}

// ─── Executive Summary ────────────────────────────────────────────────────────

function deriveExecutiveSummary(inp: LeadIntelligenceInput, diagnosis: StrategyDiagnosis) {
  const gp = inp.growthPrescription || {};
  const sd = inp.strategyDiagnosis || {};
  const existing = gp.executiveSummary || sd.executiveSummary;

  if (existing?.summary) {
    return {
      summary: safeStr(existing.summary),
      keyFindings: safeArr(existing.keyFindings).slice(0, 4),
      topOpportunity: safeStr(existing.topOpportunity),
      urgency: existing.urgency || 'high',
    };
  }

  const name = inp.businessName;
  const location = inp.suburb || inp.city || 'the local area';
  const topGap = diagnosis.gaps[0]?.title || 'limited local search coverage';

  return {
    summary: `${name} has a clear and addressable digital visibility gap in ${location}. The primary issue is ${topGap.toLowerCase()} — which is limiting search impressions, reducing enquiry volume, and allowing competitors to establish stronger positions. This strategy provides a phased roadmap to reverse that.`,
    keyFindings: [
      `Current digital visibility is underperforming relative to market demand in ${location}`,
      `Google Business Profile and local search signals need strengthening`,
      `Service pages lack the depth needed to rank for high-intent buyer searches`,
      `Competitors are capturing demand that ${name} could be winning`,
    ],
    topOpportunity: diagnosis.growthPotential.summary,
    urgency: diagnosis.readinessScore < 40 ? 'immediate' : 'high',
  };
}

// ─── Presentation Roadmap (for internal use / advanced display) ───────────────

export function derivePresentationRoadmap(inp: LeadIntelligenceInput): PresentationRoadmap {
  const phases = deriveGrowthPhases(inp);
  const gp = inp.growthPrescription || {};
  const rawQuickWins: any[] = safeArr(gp.quickWins || gp.immediateActions || []);

  const quickWins = rawQuickWins.slice(0, 4).map((w: any) => ({
    action: safeStr(w.action || w.title || w.task),
    impact: safeStr(w.impact || w.description),
    effort: w.effort || 'low',
  }));

  if (quickWins.length === 0) {
    quickWins.push(
      { action: 'Complete and optimise Google Business Profile', impact: 'Immediate improvement to local map pack eligibility', effort: 'low' as const },
      { action: 'Add service-specific pages to website', impact: 'More search queries can match to relevant pages', effort: 'medium' as const },
      { action: 'Request reviews from recent customers', impact: 'Increases trust signals and GBP ranking', effort: 'low' as const },
    );
  }

  return {
    phases: phases.map((p, i) => ({
      name: p.phase,
      timeframe: p.timeline,
      what: p.focus,
      why: p.milestone,
      outcome: p.milestone,
      icon: ['🏗️', '🚀', '📈', '⚡'][i] || '🎯',
    })),
    quickWins,
  };
}

// ─── Presentation Confidence Block ────────────────────────────────────────────

export function derivePresentationConfidenceBlock(inp: LeadIntelligenceInput): PresentationConfidenceBlock {
  const conf = deriveStrategyConfidence(inp);

  return {
    level: conf.level,
    observedFacts: conf.observedDataSources.length > 0
      ? conf.observedDataSources
      : ['Business name, location, and industry confirmed', 'Publicly visible website analysed'],
    estimates: conf.estimatedDataSources.length > 0
      ? conf.estimatedDataSources
      : ['Keyword volumes estimated from industry benchmarks', 'Competitor positions estimated from category research'],
    assumptions: [
      'Business operates in a service area as described',
      'Current digital presence reflects what Google sees today',
      'Market demand is based on aggregated search data for this category',
    ],
    willImproveAfterOnboarding: [
      'Search console data (actual impressions and clicks)',
      'Verified keyword rankings for all tracked terms',
      'Exact GBP insights (calls, directions, views)',
      'Competitor gap analysis with real-time data',
    ],
  };
}

// ─── MAIN ADAPTER FUNCTION ────────────────────────────────────────────────────

export function adaptLeadToStrategyDocument(inp: LeadIntelligenceInput): {
  strategyDiagnosis: StrategyDiagnosis;
  strategy: StrategyDocument;
} {
  const diagnosis = deriveStrategyDiagnosis(inp);

  const strategy: StrategyDocument = {
    executiveSummary: deriveExecutiveSummary(inp, diagnosis),
    oneSentenceStrategy: deriveOneSentenceStrategy(inp),
    strategyConfidence: deriveStrategyConfidence(inp),
    digitalVisibilityTriangle: deriveVisibilityTriangle(inp),
    discoveryPath: deriveDiscoveryPath(inp),
    buyerRealityGap: deriveBuyerRealityGap(inp),
    intentGaps: deriveIntentGaps(inp),
    marketOpportunity: deriveMarketOpportunity(inp),
    searchEngineView: deriveSearchEngineView(inp),
    growthPillars: deriveGrowthPillars(inp),
    projectedOutcomes: deriveProjectedOutcomes(inp),
    kpis: deriveKPIs(inp),
    growthPhases: deriveGrowthPhases(inp),
    costOfInaction: deriveCostOfInaction(inp),
    momentumMoment: deriveMomentumMoment(inp),
    insightSnapshots: deriveInsightSnapshots(inp),
    scopeFraming: deriveScopeFraming(inp),
    generatedAt: new Date().toISOString(),
  };

  return { strategyDiagnosis: diagnosis, strategy };
}
