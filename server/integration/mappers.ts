// =============================================================================
// AI SYSTEMS INTEGRATION — MOMENTUM MODEL → PAYLOAD MAPPERS
// =============================================================================
// These functions translate Momentum's internal Firestore document shapes
// into the approved TenantProvisionPayload contract fields.
//
// IMPORTANT: If the Momentum internal model changes, update mappers here.
// Never change the output types — those are locked by the approved contract.
// =============================================================================

import type {
  Business,
  HandoverSnapshot,
  TargetMarket,
  Strategy,
  ResearchArtifacts,
  Keywords,
  RequestedCapabilities,
  RequestedModules,
  RequestedAgents,
  Onboarding,
  PayloadMetadata,
  ConversionArchetype,
  ServiceModel,
  EmployeeRange,
  KeywordIntent,
  ModulePriority,
} from './types';

// ---------------------------------------------------------------------------
// Business mapper
// ---------------------------------------------------------------------------
// Maps Momentum's client/lead business fields to Business contract

export function mapBusiness(clientDoc: Record<string, any>): Business {
  const addr = clientDoc.address || {};
  const contact = clientDoc.primaryContact || {};

  return {
    legalName:        clientDoc.legalName || clientDoc.businessName || '',
    tradingName:      clientDoc.tradingName || null,
    abn:              clientDoc.abn || null,
    primaryContact: {
      firstName:  contact.firstName || clientDoc.contactFirstName || '',
      lastName:   contact.lastName  || clientDoc.contactLastName  || '',
      role:       contact.role      || 'Owner',
      phone:      contact.phone     || clientDoc.phone            || '',
      email:      contact.email     || clientDoc.email            || '',
    },
    phone:          clientDoc.phone    || '',
    email:          clientDoc.email    || null,
    website:        clientDoc.website  || null,
    address: {
      street:         addr.street       || '',
      suburb:         addr.suburb       || clientDoc.suburb || '',
      state:          addr.state        || clientDoc.state  || '',
      postcode:       addr.postcode     || clientDoc.postcode || '',
      country:        'AU',
      fullFormatted:  addr.fullFormatted
        || [addr.street, addr.suburb, addr.state, addr.postcode].filter(Boolean).join(', ')
        || '',
    },
    businessCategory:   clientDoc.gbpCategory  || clientDoc.businessCategory || '',
    industry:           clientDoc.industry      || 'Trades & Services',
    serviceModel:       (clientDoc.serviceModel as ServiceModel) || 'mobile_service',
    establishedYear:    clientDoc.establishedYear   || null,
    employeeCount:      (clientDoc.employeeCount as EmployeeRange) || null,
    licenseNumber:      clientDoc.licenseNumber || null,
  };
}

// ---------------------------------------------------------------------------
// HandoverSnapshot mapper
// ---------------------------------------------------------------------------
// Reads from Momentum's lead + strategy + scoring data

export function mapHandoverSnapshot(params: {
  snapshotId:     string;
  leadDoc:        Record<string, any>;
  strategyDoc:    Record<string, any>;
  scoringDoc:     Record<string, any>;
  archetype:      ConversionArchetype;
}): HandoverSnapshot {
  const { snapshotId, leadDoc, strategyDoc, scoringDoc, archetype } = params;
  const now = new Date().toISOString();

  return {
    snapshotId,
    sourceLead: {
      leadId:             leadDoc.id           || '',
      leadName:           leadDoc.businessName || leadDoc.name || '',
      leadStage:          leadDoc.stage        || 'Won',
      leadAgeInDays:      Math.max(0, Math.round(
        (Date.now() - new Date(leadDoc.createdAt || now).getTime()) / 86_400_000
      )),
      touchpoints:        leadDoc.touchpoints  || leadDoc.activityCount || 0,
      leadScore:          leadDoc.momentumScore || leadDoc.score || 0,
      acquisitionChannel: leadDoc.source       || null,
    },
    strategyVersion: {
      versionId:          strategyDoc.id        || 'v1',
      generatedAt:        strategyDoc.createdAt  || now,
      generatorAgentId:   strategyDoc.agentId    || 'strategy-specialist',
      strategyHash:       strategyDoc.strategyHash || '0'.repeat(64),
      isLatest:           true,
    },
    conversionArchetype: archetype,
    initialGamePlan: {
      priorityModules:  strategyDoc.priorityModules  || ['gbp'],
      firstFocusArea:   strategyDoc.firstFocusArea   || strategyDoc.strategySummary?.slice(0, 200) || '',
      recommendedTimeline: {
        week1:  strategyDoc.timeline?.week1  || '',
        month1: strategyDoc.timeline?.month1 || '',
        month3: strategyDoc.timeline?.month3 || '',
      },
      keyRisks:         strategyDoc.keyRisks        || ['No key risks identified'],
      keyOpportunities: strategyDoc.keyOpportunities || ['No opportunities identified'],
      competitorContext: strategyDoc.competitorContext || '',
      startingPosition:  strategyDoc.startingPosition  || '',
    },
    expectedOutcome: {
      primaryMetric:    scoringDoc.primaryMetric  || strategyDoc.primaryMetric || '',
      targetsByMonth: {
        month1: scoringDoc.month1Targets || [{ metric: 'gbp_rank', target: 5, unit: 'rank', direction: 'down' }],
        month3: scoringDoc.month3Targets || [{ metric: 'gbp_rank', target: 3, unit: 'rank', direction: 'down' }],
        month6: scoringDoc.month6Targets || [{ metric: 'gbp_rank', target: 1, unit: 'rank', direction: 'down' }],
      },
      successDefinition:  scoringDoc.successDefinition  || '',
      baselineMetrics: {
        gbpRank:                    leadDoc.gbpRank                  || null,
        monthlySearchImpressions:   leadDoc.monthlyImpressions       || null,
        websiteOrganicSessions:     leadDoc.organicSessions          || null,
        reviewCount:                leadDoc.reviewCount              || null,
        reviewRating:               leadDoc.rating                   || null,
        localPackPresence:          leadDoc.localPackPresence        ?? false,
        capturedAt:                 leadDoc.researchedAt             || now,
      },
    },
    confidenceScore: {
      overall:            scoringDoc.confidenceScore   || scoringDoc.overall     || 50,
      dataCompleteness:   scoringDoc.dataCompleteness  || 50,
      strategyClarity:    scoringDoc.strategyClarity   || 50,
      marketOpportunity:  scoringDoc.marketOpportunity || 50,
      executionRisk:      scoringDoc.executionRisk     || 50,
      scoringRationale:   scoringDoc.scoringRationale  || '',
    },
  };
}

// ---------------------------------------------------------------------------
// TargetMarket mapper
// ---------------------------------------------------------------------------

export function mapTargetMarket(clientDoc: Record<string, any>): TargetMarket {
  const primarySuburb = clientDoc.suburb || clientDoc.address?.suburb || '';
  const primaryState  = clientDoc.state  || clientDoc.address?.state  || '';
  const primaryPostcode = clientDoc.postcode || clientDoc.address?.postcode || '';

  const rawAreas: string[] = clientDoc.serviceAreas || clientDoc.targetLocations || [];
  const serviceAreas = rawAreas.map((name, i) => ({
    name,
    state:    primaryState,
    postcode: null,
    priority: (i === 0 ? 'primary' : i < 3 ? 'secondary' : 'tertiary') as 'primary' | 'secondary' | 'tertiary',
  }));

  if (serviceAreas.length === 0) {
    serviceAreas.push({ name: primarySuburb, state: primaryState, postcode: primaryPostcode, priority: 'primary' });
  }

  const rawServices: any[] = clientDoc.targetServices || clientDoc.services || [];
  const targetServices = rawServices.length > 0
    ? rawServices.map((s: any, i: number) => ({
        serviceName:      typeof s === 'string' ? s : s.name || s.serviceName || '',
        category:         s.category || 'General',
        isPrimary:        i === 0,
        urgencyLevel:     (s.urgencyLevel || 'routine') as 'emergency' | 'planned' | 'routine',
        averageJobValue:  s.avgJobValue || s.averageJobValue || null,
      }))
    : [{
        serviceName:      clientDoc.businessCategory || 'General Service',
        category:         clientDoc.industry         || 'Services',
        isPrimary:        true,
        urgencyLevel:     'routine' as const,
        averageJobValue:  null,
      }];

  return {
    primaryServiceArea: {
      suburb:   primarySuburb,
      state:    primaryState,
      postcode: primaryPostcode,
      coordinates: {
        lat: clientDoc.lat || null,
        lng: clientDoc.lng || null,
      },
    },
    serviceAreas,
    prioritySuburbs: rawAreas.slice(0, 20).length > 0 ? rawAreas.slice(0, 20) : [primarySuburb],
    targetServices,
    radiusKm:     clientDoc.radiusKm     || null,
    excludedAreas: clientDoc.excludedAreas || [],
  };
}

// ---------------------------------------------------------------------------
// Strategy mapper
// ---------------------------------------------------------------------------

export function mapStrategy(strategyDoc: Record<string, any>): Strategy {
  const now = new Date().toISOString();
  return {
    strategySummary:    strategyDoc.strategySummary || strategyDoc.summary     || '',
    growthDiagnosis:    strategyDoc.growthDiagnosis || strategyDoc.diagnosis   || '',
    keyRisks:           (strategyDoc.keyRisks || []).map((r: any) =>
      typeof r === 'string' ? { title: r, detail: r, severity: 'medium' as const } : r
    ),
    keyOpportunities:   (strategyDoc.keyOpportunities || []).map((o: any) =>
      typeof o === 'string' ? { title: o, detail: o, severity: 'medium' as const } : o
    ),
    startingPosition:   strategyDoc.startingPosition || '',
    recommendations:    (strategyDoc.recommendations || []).map((rec: any) =>
      typeof rec === 'string'
        ? { title: rec, rationale: rec, module: 'general', priority: 'medium' as const, timeframe: 'month1' as const }
        : rec
    ),
    generatedAt:        strategyDoc.createdAt || strategyDoc.generatedAt || now,
    generatedByAgentId: strategyDoc.agentId   || 'strategy-specialist',
    strategyHash:       strategyDoc.strategyHash || '0'.repeat(64),
  };
}

// ---------------------------------------------------------------------------
// ResearchArtifacts mapper
// ---------------------------------------------------------------------------

export function mapResearchArtifacts(
  clientDoc: Record<string, any>,
  researchDoc: Record<string, any> = {}
): ResearchArtifacts {
  const now = new Date().toISOString();
  const gbp = clientDoc.gbpData || researchDoc.gbpData || {};
  const website = researchDoc.websiteAudit || clientDoc.websiteAudit || {};
  const competitors: any[] = researchDoc.competitors || clientDoc.competitors || [];

  return {
    competitorSummary: {
      competitors: competitors.slice(0, 10).map((c: any) => ({
        name:               c.name              || '',
        website:            c.website           || null,
        gbpRating:          c.rating            || null,
        gbpReviewCount:     c.reviewCount       || null,
        estimatedStrength:  c.strength          || 'moderate',
        notes:              c.notes             || '',
      })),
      competitiveGap:     researchDoc.competitiveGap     || '',
      marketShareContext:  researchDoc.marketShareContext || '',
      analysedAt:         researchDoc.analysedAt         || now,
    },
    websiteAuditSummary: {
      hasWebsite:       !!(clientDoc.website || website.url),
      url:              clientDoc.website || website.url || null,
      overallScore:     website.score     || null,
      technicalIssues:  website.technicalIssues  || [],
      conversionIssues: website.conversionIssues || [],
      strengths:        website.strengths        || [],
      recommendation:   website.recommendation   || '',
      auditedAt:        website.auditedAt        || null,
    },
    gbpAuditSummary: {
      hasGBP:               !!(gbp.placeId),
      placeId:              gbp.placeId         || null,
      rating:               gbp.rating          || clientDoc.rating     || null,
      reviewCount:          gbp.reviewCount     || clientDoc.reviewCount || null,
      primaryCategory:      gbp.primaryCategory || clientDoc.gbpCategory || null,
      additionalCategories: gbp.additionalCategories || [],
      completenessScore:    gbp.completenessScore    || null,
      issues:               gbp.issues               || [],
      auditedAt:            gbp.auditedAt            || null,
    },
    keywordResearchSummary: {
      totalKeywordsAnalysed:  researchDoc.totalKeywords    || 0,
      topOpportunities:       researchDoc.topOpportunities || [],
      searchVolumeContext:     researchDoc.searchVolumeContext || '',
      difficultyContext:       researchDoc.difficultyContext  || '',
      researchedAt:            researchDoc.researchedAt       || now,
    },
    marketOpportunityNotes: researchDoc.marketOpportunityNotes || researchDoc.marketContext || '',
  };
}

// ---------------------------------------------------------------------------
// Keywords mapper
// ---------------------------------------------------------------------------

export function mapKeywords(keywordDoc: Record<string, any>): Keywords {
  const now = new Date().toISOString();
  const raw = keywordDoc.keywords || [];

  const toKeyword = (k: any) => ({
    term:           k.term || k.keyword || '',
    monthlyVolume:  k.volume || k.monthlyVolume || null,
    difficulty:     k.difficulty || null,
    cpc:            k.cpc || null,
    intent:         (k.intent || 'transactional') as KeywordIntent,
    isLocal:        k.isLocal ?? true,
  });

  const clusters = (keywordDoc.clusters || []).map((c: any) => ({
    clusterId:        c.id || c.clusterId || `cluster-${Math.random().toString(36).slice(2, 8)}`,
    clusterName:      c.name || c.clusterName || '',
    intent:           (c.intent || 'transactional') as KeywordIntent,
    parentCategory:   c.category || c.parentCategory || '',
    targetPage:       c.targetPage || null,
    keywords:         (c.keywords || []).map(toKeyword),
    clusterVolume:    c.volume || null,
    opportunityScore: c.opportunityScore || null,
  }));

  const priority = (keywordDoc.priorityKeywordTargets || keywordDoc.primaryKeywords || [])
    .slice(0, 10)
    .map((k: any) => ({
      term:         typeof k === 'string' ? k : k.term || '',
      reason:       k.reason    || 'High intent, high value keyword',
      targetPage:   k.targetPage || '/',
      currentRank:  k.currentRank || null,
      targetRank:   k.targetRank  || 3,
    }));

  return {
    primaryKeywords:         raw.filter((k: any) => k.isPrimary).map(toKeyword).slice(0, 20),
    secondaryKeywords:       raw.filter((k: any) => !k.isPrimary).map(toKeyword).slice(0, 50),
    clusters:                clusters.length > 0 ? clusters : [{
      clusterId: 'general', clusterName: 'General', intent: 'transactional', parentCategory: 'General',
      targetPage: null, keywords: raw.slice(0, 5).map(toKeyword), clusterVolume: null, opportunityScore: null,
    }],
    quickWins: raw.filter((k: any) => (k.difficulty || 100) <= 20 && (k.volume || 0) >= 50).map(toKeyword),
    priorityKeywordTargets:  priority.length > 0 ? priority : [{
      term: raw[0]?.term || '', reason: 'Primary keyword target', targetPage: '/', currentRank: null, targetRank: 3,
    }],
    researchedAt:   keywordDoc.researchedAt || now,
    researchSource: keywordDoc.researchSource || 'serpapi',
  };
}

// ---------------------------------------------------------------------------
// Capabilities mapper
// ---------------------------------------------------------------------------
// Derived from the scope selected at conversion time

export function mapCapabilities(scopeSelection: {
  website:        boolean;
  seo:            boolean;
  gbp:            boolean;
  ads:            boolean;
  portal:         boolean;
  autopilot:      boolean;
}): RequestedCapabilities {
  return {
    website:        scopeSelection.website,
    localSEO:       scopeSelection.seo,
    gbpManagement:  scopeSelection.gbp,
    adsStrategy:    scopeSelection.ads,
    customerPortal: scopeSelection.portal,
    agentAutopilot: scopeSelection.autopilot,
  };
}

// ---------------------------------------------------------------------------
// Modules mapper
// ---------------------------------------------------------------------------

export function mapModules(
  scopeSelection: { website: boolean; seo: boolean; gbp: boolean; ads: boolean },
  priorityHints: { website?: ModulePriority; seo?: ModulePriority; gbp?: ModulePriority; ads?: ModulePriority } = {}
): RequestedModules {
  const make = (active: boolean, defaultPriority: ModulePriority, hint?: ModulePriority) =>
    active ? { activate: true as const, priority: hint || defaultPriority, notes: null } : null;

  return {
    website:  make(scopeSelection.website, 'week1',     priorityHints.website),
    seo:      make(scopeSelection.seo,     'month1',    priorityHints.seo),
    gbp:      make(scopeSelection.gbp,     'immediate', priorityHints.gbp),
    ads:      make(scopeSelection.ads,     'month1',    priorityHints.ads),
  };
}

// ---------------------------------------------------------------------------
// Agents mapper
// ---------------------------------------------------------------------------
// Derives agent requests from active modules + autopilot capability

export function mapAgents(
  modules: RequestedModules,
  autopilot: boolean
): RequestedAgents {
  const mode = autopilot ? 'autopilot' as const : 'assisted' as const;
  const weekly = { frequency: 'weekly' as const, preferredDayOfWeek: null, preferredHourUTC: 22 };
  const daily  = { frequency: 'daily'  as const, preferredDayOfWeek: null, preferredHourUTC: 22 };
  const fortnightly = { frequency: 'fortnightly' as const, preferredDayOfWeek: null, preferredHourUTC: 22 };

  const hasAnything = Object.values(modules).some(m => m !== null);

  return {
    onboarding_agent: hasAnything
      ? { activate: true, mode, scheduleHint: daily }
      : null,
    seo_agent: modules.seo
      ? { activate: true, mode, scheduleHint: weekly }
      : null,
    gbp_agent: modules.gbp
      ? { activate: true, mode, scheduleHint: weekly }
      : null,
    content_agent: (modules.seo || modules.gbp)
      ? { activate: true, mode: 'assisted', scheduleHint: fortnightly }
      : null,
    telemetry_agent: hasAnything
      ? { activate: true, mode, scheduleHint: weekly }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Onboarding mapper
// ---------------------------------------------------------------------------

export function mapOnboarding(params: {
  planTier:           string;
  agreedScope:        string[];
  handoverNotes?:     string | null;
  internalRef?:       string | null;
  expectedStartDate?: string | null;
  portal:             boolean;
  sendInvite:         boolean;
  inviteEmail?:       string | null;
}): Onboarding {
  return {
    planTier:               params.planTier || 'growth',
    portalAccessRequested:  params.portal,
    sendInviteEmail:        params.sendInvite,
    inviteEmail:            params.inviteEmail || null,
    handoverNotes:          params.handoverNotes || null,
    internalReferenceId:    params.internalRef || null,
    agreedServiceScope:     params.agreedScope.length > 0 ? params.agreedScope : ['General service delivery'],
    expectedStartDate:      params.expectedStartDate || null,
  };
}

// ---------------------------------------------------------------------------
// Metadata mapper
// ---------------------------------------------------------------------------

export function mapMetadata(params: {
  clientDoc:    Record<string, any>;
  userId:       string;
  displayName:  string;
  userEmail:    string;
  tags?:        string[];
}): PayloadMetadata {
  const { clientDoc } = params;
  return {
    tags:             params.tags || [],
    sourceCampaign:   clientDoc.campaign || clientDoc.source || null,
    salesOwner: {
      userId:       params.userId,
      displayName:  params.displayName,
      email:        params.userEmail,
    },
    closeDate:          clientDoc.closedAt
      ? clientDoc.closedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    contractValue:      clientDoc.contractValue  || null,
    billingCycle:       clientDoc.billingCycle   || null,
    internalReferences: clientDoc.internalRefs   || {},
  };
}
