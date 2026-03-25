// =============================================================================
// AI SYSTEMS INTEGRATION — ZOD VALIDATION SCHEMAS
// =============================================================================
// These schemas are the authoritative validation layer for the payload contract.
// They mirror types.ts exactly. If one changes, the other must change too.
// =============================================================================

import { z } from 'zod';
import { INTEGRATION_SCHEMA_VERSION } from './config';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const isoDatetime = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
  'Must be ISO 8601 UTC datetime (e.g. 2025-03-25T09:14:00Z)'
);

const isoDate = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Must be ISO date (YYYY-MM-DD)'
);

const sha256Hex = z.string().length(64).regex(/^[a-f0-9]{64}$/, 'Must be a 64-char hex SHA-256 string');

const uuidV4 = z.string().uuid('Must be a UUID v4');

const auState = z.enum(['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']);

const scoreField = z.number().min(0).max(100);

// ---------------------------------------------------------------------------
// A. ProvisioningRequest
// ---------------------------------------------------------------------------

export const ProvisioningRequestSchema = z.object({
  provisioningRequestId: uuidV4,
  sourceSystem:          z.literal('momentum'),
  sourceOrgId:           z.string().min(1),
  sourceClientId:        z.string().min(1),
  requestedAt:           isoDatetime.refine(val => {
    const diff = new Date(val).getTime() - Date.now();
    return diff <= 60_000;   // must not be more than 60s in the future
  }, 'requestedAt must not be more than 60 seconds in the future'),
  requestedBy: z.object({
    userId:       z.string().min(1),
    displayName:  z.string().min(1),
    role:         z.string().min(1),
  }),
  schemaVersion: z.literal(INTEGRATION_SCHEMA_VERSION),
});

// ---------------------------------------------------------------------------
// B. Business
// ---------------------------------------------------------------------------

const PrimaryContactSchema = z.object({
  firstName:  z.string().min(1),
  lastName:   z.string().min(1),
  role:       z.string().min(1),
  phone:      z.string().min(1),
  email:      z.string().email(),
});

const BusinessAddressSchema = z.object({
  street:         z.string().min(1),
  suburb:         z.string().min(1),
  state:          auState,
  postcode:       z.string().regex(/^\d{4}$/, 'Must be 4-digit AU postcode'),
  country:        z.literal('AU'),
  fullFormatted:  z.string().min(1),
});

export const BusinessSchema = z.object({
  legalName:          z.string().min(1),
  tradingName:        z.string().nullable(),
  abn:                z.string().regex(/^\d{11}$/, 'ABN must be 11 digits').nullable().optional(),
  primaryContact:     PrimaryContactSchema,
  phone:              z.string().min(1),
  email:              z.string().email().nullable(),
  website:            z.string().url().nullable().optional(),
  address:            BusinessAddressSchema,
  businessCategory:   z.string().min(1),
  industry:           z.string().min(1),
  serviceModel:       z.enum(['mobile_service', 'fixed_location', 'hybrid', 'digital_only']),
  establishedYear:    z.number().int().min(1800).max(new Date().getFullYear()).nullable().optional(),
  employeeCount:      z.enum(['solo', '2-5', '6-15', '16-50', '51+']).nullable().optional(),
  licenseNumber:      z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// C. HandoverSnapshot
// ---------------------------------------------------------------------------

const MetricTargetSchema = z.object({
  metric:     z.string().min(1),
  target:     z.number(),
  unit:       z.string().min(1),
  direction:  z.enum(['up', 'down']),
});

const BaselineMetricsSchema = z.object({
  gbpRank:                    z.number().int().min(1).max(100).nullable().optional(),
  monthlySearchImpressions:   z.number().int().min(0).nullable().optional(),
  websiteOrganicSessions:     z.number().int().min(0).nullable().optional(),
  reviewCount:                z.number().int().min(0).nullable().optional(),
  reviewRating:               z.number().min(0).max(5).nullable().optional(),
  localPackPresence:          z.boolean(),
  capturedAt:                 isoDatetime,
});

export const HandoverSnapshotSchema = z.object({
  snapshotId: uuidV4,
  sourceLead: z.object({
    leadId:               z.string().min(1),
    leadName:             z.string().min(1),
    leadStage:            z.string().min(1),
    leadAgeInDays:        z.number().int().min(0),
    touchpoints:          z.number().int().min(0),
    leadScore:            scoreField,
    acquisitionChannel:   z.string().nullable().optional(),
  }),
  strategyVersion: z.object({
    versionId:          z.string().min(1),
    generatedAt:        isoDatetime,
    generatorAgentId:   z.string().min(1),
    strategyHash:       sha256Hex,
    isLatest:           z.boolean(),
  }),
  conversionArchetype: z.enum([
    'proof_machine', 'local_anchor', 'authority_expert',
    'value_challenger', 'trust_builder',
  ]),
  initialGamePlan: z.object({
    priorityModules:  z.array(z.enum(['website', 'seo', 'gbp', 'ads'])).min(1),
    firstFocusArea:   z.string().max(200),
    recommendedTimeline: z.object({
      week1:  z.string().max(300),
      month1: z.string().max(300),
      month3: z.string().max(300),
    }),
    keyRisks:           z.array(z.string()).min(1).max(10),
    keyOpportunities:   z.array(z.string()).min(1).max(10),
    competitorContext:  z.string().max(500),
    startingPosition:   z.string().max(500),
  }),
  expectedOutcome: z.object({
    primaryMetric:  z.string().min(1),
    targetsByMonth: z.object({
      month1: z.array(MetricTargetSchema).min(1),
      month3: z.array(MetricTargetSchema).min(1),
      month6: z.array(MetricTargetSchema).min(1),
    }),
    successDefinition:  z.string().max(500),
    baselineMetrics:    BaselineMetricsSchema,
  }),
  confidenceScore: z.object({
    overall:            scoreField,
    dataCompleteness:   scoreField,
    strategyClarity:    scoreField,
    marketOpportunity:  scoreField,
    executionRisk:      scoreField,
    scoringRationale:   z.string().max(500),
  }),
});

// ---------------------------------------------------------------------------
// D. TargetMarket
// ---------------------------------------------------------------------------

const ServiceAreaSchema = z.object({
  name:       z.string().min(1),
  state:      auState,
  postcode:   z.string().regex(/^\d{4}$/).nullable().optional(),
  priority:   z.enum(['primary', 'secondary', 'tertiary']),
});

const TargetServiceSchema = z.object({
  serviceName:      z.string().min(1),
  category:         z.string().min(1),
  isPrimary:        z.boolean(),
  urgencyLevel:     z.enum(['emergency', 'planned', 'routine']),
  averageJobValue:  z.number().positive().nullable().optional(),
});

export const TargetMarketSchema = z.object({
  primaryServiceArea: z.object({
    suburb:   z.string().min(1),
    state:    auState,
    postcode: z.string().regex(/^\d{4}$/),
    coordinates: z.object({
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
    }),
  }),
  serviceAreas:     z.array(ServiceAreaSchema).min(1),
  prioritySuburbs:  z.array(z.string()).min(1).max(20),
  targetServices:   z.array(TargetServiceSchema).min(1),
  radiusKm:         z.number().positive().max(500).nullable().optional(),
  excludedAreas:    z.array(z.string()),
}).superRefine((data, ctx) => {
  const hasPrimary = data.serviceAreas.some(a => a.priority === 'primary');
  if (!hasPrimary) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one serviceArea must have priority: "primary"', path: ['serviceAreas'] });
  }
  const primaryServices = data.targetServices.filter(s => s.isPrimary);
  if (primaryServices.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Exactly one targetService must have isPrimary: true', path: ['targetServices'] });
  }
});

// ---------------------------------------------------------------------------
// E. Strategy
// ---------------------------------------------------------------------------

const StrategyItemSchema = z.object({
  title:    z.string().max(100),
  detail:   z.string().max(500),
  severity: z.enum(['high', 'medium', 'low']),
});

const RecommendationSchema = z.object({
  title:      z.string().max(100),
  rationale:  z.string().max(500),
  module:     z.string().min(1),
  priority:   z.enum(['urgent', 'high', 'medium', 'low']),
  timeframe:  z.enum(['immediate', 'week1', 'month1', 'quarter1']),
});

export const StrategySchema = z.object({
  strategySummary:    z.string().max(1000),
  growthDiagnosis:    z.string().max(2000),
  keyRisks:           z.array(StrategyItemSchema).min(1).max(10),
  keyOpportunities:   z.array(StrategyItemSchema).min(1).max(10),
  startingPosition:   z.string().max(1000),
  recommendations:    z.array(RecommendationSchema).min(1).max(20),
  generatedAt:        isoDatetime,
  generatedByAgentId: z.string().min(1),
  strategyHash:       sha256Hex,
});

// ---------------------------------------------------------------------------
// F. ResearchArtifacts
// ---------------------------------------------------------------------------

const CompetitorSchema = z.object({
  name:               z.string().min(1),
  website:            z.string().url().nullable().optional(),
  gbpRating:          z.number().min(0).max(5).nullable().optional(),
  gbpReviewCount:     z.number().int().min(0).nullable().optional(),
  estimatedStrength:  z.enum(['strong', 'moderate', 'weak']),
  notes:              z.string().max(300),
});

export const ResearchArtifactsSchema = z.object({
  competitorSummary: z.object({
    competitors:        z.array(CompetitorSchema).max(10),
    competitiveGap:     z.string().max(1000),
    marketShareContext: z.string().max(500),
    analysedAt:         isoDatetime,
  }),
  websiteAuditSummary: z.object({
    hasWebsite:       z.boolean(),
    url:              z.string().url().nullable().optional(),
    overallScore:     scoreField.nullable().optional(),
    technicalIssues:  z.array(z.string()),
    conversionIssues: z.array(z.string()),
    strengths:        z.array(z.string()),
    recommendation:   z.string().max(500),
    auditedAt:        isoDatetime.nullable().optional(),
  }).superRefine((d, ctx) => {
    if (d.hasWebsite && !d.url) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'url is required when hasWebsite is true', path: ['url'] });
    }
  }),
  gbpAuditSummary: z.object({
    hasGBP:               z.boolean(),
    placeId:              z.string().nullable().optional(),
    rating:               z.number().min(0).max(5).nullable().optional(),
    reviewCount:          z.number().int().min(0).nullable().optional(),
    primaryCategory:      z.string().nullable().optional(),
    additionalCategories: z.array(z.string()),
    completenessScore:    scoreField.nullable().optional(),
    issues:               z.array(z.string()),
    auditedAt:            isoDatetime.nullable().optional(),
  }).superRefine((d, ctx) => {
    if (d.hasGBP && !d.placeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'placeId is required when hasGBP is true', path: ['placeId'] });
    }
  }),
  keywordResearchSummary: z.object({
    totalKeywordsAnalysed:  z.number().int().min(0),
    topOpportunities:       z.array(z.string()).max(10),
    searchVolumeContext:     z.string().max(500),
    difficultyContext:       z.string().max(500),
    researchedAt:            isoDatetime,
  }),
  marketOpportunityNotes: z.string().max(2000),
});

// ---------------------------------------------------------------------------
// G. Keywords
// ---------------------------------------------------------------------------

const KeywordSchema = z.object({
  term:           z.string().min(1),
  monthlyVolume:  z.number().int().min(0).nullable().optional(),
  difficulty:     z.number().min(0).max(100).nullable().optional(),
  cpc:            z.number().min(0).nullable().optional(),
  intent:         z.enum(['transactional', 'commercial', 'informational', 'navigational']),
  isLocal:        z.boolean(),
});

const KeywordClusterSchema = z.object({
  clusterId:        z.string().min(1),
  clusterName:      z.string().min(1),
  intent:           z.enum(['transactional', 'commercial', 'informational', 'navigational']),
  parentCategory:   z.string().min(1),
  targetPage:       z.string().nullable().optional(),
  keywords:         z.array(KeywordSchema).min(1),
  clusterVolume:    z.number().int().min(0).nullable().optional(),
  opportunityScore: scoreField.nullable().optional(),
});

const PriorityKeywordSchema = z.object({
  term:         z.string().min(1),
  reason:       z.string().min(1),
  targetPage:   z.string().min(1),
  currentRank:  z.number().int().min(1).max(100).nullable().optional(),
  targetRank:   z.number().int().min(1).max(20),
});

export const KeywordsSchema = z.object({
  primaryKeywords:          z.array(KeywordSchema).min(1),
  secondaryKeywords:        z.array(KeywordSchema),
  clusters:                 z.array(KeywordClusterSchema).min(1),
  quickWins:                z.array(KeywordSchema),
  priorityKeywordTargets:   z.array(PriorityKeywordSchema).min(1),
  researchedAt:             isoDatetime,
  researchSource:           z.string().min(1),
});

// ---------------------------------------------------------------------------
// H. RequestedCapabilities
// ---------------------------------------------------------------------------

export const RequestedCapabilitiesSchema = z.object({
  website:        z.boolean(),
  localSEO:       z.boolean(),
  gbpManagement:  z.boolean(),
  adsStrategy:    z.boolean(),
  customerPortal: z.boolean(),
  agentAutopilot: z.boolean(),
}).superRefine((caps, ctx) => {
  if (caps.agentAutopilot) {
    const hasActiveModule = caps.website || caps.localSEO || caps.gbpManagement || caps.adsStrategy;
    if (!hasActiveModule) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'agentAutopilot requires at least one module capability to be true' });
    }
  }
});

// ---------------------------------------------------------------------------
// I. RequestedModules
// ---------------------------------------------------------------------------

const ModuleRequestSchema = z.object({
  activate: z.literal(true),
  priority: z.enum(['immediate', 'week1', 'month1']),
  notes:    z.string().nullable().optional(),
});

export const RequestedModulesSchema = z.object({
  website:  ModuleRequestSchema.nullable(),
  seo:      ModuleRequestSchema.nullable(),
  gbp:      ModuleRequestSchema.nullable(),
  ads:      ModuleRequestSchema.nullable(),
}).superRefine((mods, ctx) => {
  const hasAtLeastOne = Object.values(mods).some(m => m !== null);
  if (!hasAtLeastOne) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one module must be non-null' });
  }
});

// ---------------------------------------------------------------------------
// J. RequestedAgents
// ---------------------------------------------------------------------------

const AgentScheduleSchema = z.object({
  frequency:          z.enum(['daily', 'weekly', 'fortnightly', 'monthly']),
  preferredDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  preferredHourUTC:   z.number().int().min(0).max(23).nullable().optional(),
});

const AgentRequestSchema = z.object({
  activate:     z.literal(true),
  mode:         z.enum(['autopilot', 'assisted']),
  scheduleHint: AgentScheduleSchema,
});

export const RequestedAgentsSchema = z.object({
  onboarding_agent: AgentRequestSchema.nullable(),
  seo_agent:        AgentRequestSchema.nullable(),
  gbp_agent:        AgentRequestSchema.nullable(),
  content_agent:    AgentRequestSchema.nullable(),
  telemetry_agent:  AgentRequestSchema.nullable(),
});

// ---------------------------------------------------------------------------
// K. Onboarding
// ---------------------------------------------------------------------------

export const OnboardingSchema = z.object({
  planTier:               z.string().min(1),
  portalAccessRequested:  z.boolean(),
  sendInviteEmail:        z.boolean(),
  inviteEmail:            z.string().email().nullable().optional(),
  handoverNotes:          z.string().nullable().optional(),
  internalReferenceId:    z.string().nullable().optional(),
  agreedServiceScope:     z.array(z.string()).min(1),
  expectedStartDate:      isoDate.nullable().optional().refine(val => {
    if (!val) return true;
    return new Date(val) >= new Date(new Date().toISOString().slice(0, 10));
  }, 'expectedStartDate must not be in the past'),
}).superRefine((d, ctx) => {
  if (d.sendInviteEmail && !d.portalAccessRequested) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sendInviteEmail requires portalAccessRequested to be true', path: ['sendInviteEmail'] });
  }
});

// ---------------------------------------------------------------------------
// L. PayloadMetadata
// ---------------------------------------------------------------------------

export const PayloadMetadataSchema = z.object({
  tags:           z.array(z.string().max(50)).max(20),
  sourceCampaign: z.string().nullable().optional(),
  salesOwner: z.object({
    userId:       z.string().min(1),
    displayName:  z.string().min(1),
    email:        z.string().email(),
  }),
  closeDate:          isoDate,
  contractValue:      z.number().positive().nullable().optional(),
  billingCycle:       z.enum(['monthly', 'quarterly', 'annual']).nullable().optional(),
  internalReferences: z.record(z.string()).default({}),
});

// ---------------------------------------------------------------------------
// Root TenantProvisionPayload schema
// ---------------------------------------------------------------------------

export const TenantProvisionPayloadSchema = z.object({
  provisioningRequest:    ProvisioningRequestSchema,
  business:               BusinessSchema,
  handoverSnapshot:       HandoverSnapshotSchema,
  targetMarket:           TargetMarketSchema,
  strategy:               StrategySchema,
  researchArtifacts:      ResearchArtifactsSchema,
  keywords:               KeywordsSchema,
  requestedCapabilities:  RequestedCapabilitiesSchema,
  requestedModules:       RequestedModulesSchema,
  requestedAgents:        RequestedAgentsSchema,
  onboarding:             OnboardingSchema,
  metadata:               PayloadMetadataSchema,
}).superRefine((payload, ctx) => {
  const { requestedCapabilities: caps, requestedModules: mods, requestedAgents: agents, onboarding } = payload;

  // Module ↔ capability cross-validation
  if (mods.website && !caps.website) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'website module requires website capability', path: ['requestedModules', 'website'] });
  if (mods.seo && !caps.localSEO) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'seo module requires localSEO capability', path: ['requestedModules', 'seo'] });
  if (mods.gbp && !caps.gbpManagement) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'gbp module requires gbpManagement capability', path: ['requestedModules', 'gbp'] });
  if (mods.ads && !caps.adsStrategy) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ads module requires adsStrategy capability', path: ['requestedModules', 'ads'] });

  // Agent ↔ module cross-validation
  if (agents.seo_agent && !mods.seo) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'seo_agent requires seo module', path: ['requestedAgents', 'seo_agent'] });
  if (agents.gbp_agent && !mods.gbp) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'gbp_agent requires gbp module', path: ['requestedAgents', 'gbp_agent'] });
  if (agents.content_agent && !mods.seo && !mods.gbp) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'content_agent requires at least one of seo or gbp module', path: ['requestedAgents', 'content_agent'] });

  // Portal ↔ onboarding
  if (caps.customerPortal && !onboarding.portalAccessRequested) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'customerPortal capability requires portalAccessRequested', path: ['onboarding', 'portalAccessRequested'] });
});

export type TenantProvisionPayloadInput = z.input<typeof TenantProvisionPayloadSchema>;
export type TenantProvisionPayloadOutput = z.output<typeof TenantProvisionPayloadSchema>;
