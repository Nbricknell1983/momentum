// =============================================================================
// AI SYSTEMS INTEGRATION — TYPESCRIPT TYPE CONTRACT
// =============================================================================
// These types are the authoritative Momentum-side representation of the
// approved TenantProvisionPayload v1.0 contract.
// Do NOT modify field names or shapes without updating schema.ts and the
// payload contract document simultaneously.
// =============================================================================

import type { INTEGRATION_SCHEMA_VERSION } from './config';

// ---------------------------------------------------------------------------
// Primitive enumerations
// ---------------------------------------------------------------------------

export type SchemaVersion = typeof INTEGRATION_SCHEMA_VERSION;

export type ServiceModel =
  | 'mobile_service'
  | 'fixed_location'
  | 'hybrid'
  | 'digital_only';

export type EmployeeRange =
  | 'solo'
  | '2-5'
  | '6-15'
  | '16-50'
  | '51+';

export type ConversionArchetype =
  | 'proof_machine'
  | 'local_anchor'
  | 'authority_expert'
  | 'value_challenger'
  | 'trust_builder';

export type KeywordIntent =
  | 'transactional'
  | 'commercial'
  | 'informational'
  | 'navigational';

export type StrategyPriority = 'urgent' | 'high' | 'medium' | 'low';
export type StrategyTimeframe = 'immediate' | 'week1' | 'month1' | 'quarter1';
export type StrategySeverity = 'high' | 'medium' | 'low';
export type CompetitorStrength = 'strong' | 'moderate' | 'weak';
export type ServiceAreaPriority = 'primary' | 'secondary' | 'tertiary';
export type UrgencyLevel = 'emergency' | 'planned' | 'routine';
export type ModulePriority = 'immediate' | 'week1' | 'month1';
export type AgentMode = 'autopilot' | 'assisted';
export type AgentFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly';
export type BillingCycle = 'monthly' | 'quarterly' | 'annual';
export type MetricDirection = 'up' | 'down';

// ---------------------------------------------------------------------------
// A. ProvisioningRequest
// ---------------------------------------------------------------------------

export interface ProvisioningRequest {
  provisioningRequestId:  string;         // UUID v4 — idempotency key
  sourceSystem:           'momentum';
  sourceOrgId:            string;
  sourceClientId:         string;
  requestedAt:            string;         // ISO 8601 UTC
  requestedBy: {
    userId:               string;
    displayName:          string;
    role:                 string;
  };
  schemaVersion:          SchemaVersion;
}

// ---------------------------------------------------------------------------
// B. Business
// ---------------------------------------------------------------------------

export interface PrimaryContact {
  firstName:    string;
  lastName:     string;
  role:         string;
  phone:        string;
  email:        string;
}

export interface BusinessAddress {
  street:         string;
  suburb:         string;
  state:          string;
  postcode:       string;
  country:        string;
  fullFormatted:  string;
}

export interface Business {
  legalName:          string;
  tradingName:        string | null;
  abn:                string | null;
  primaryContact:     PrimaryContact;
  phone:              string;
  email:              string | null;
  website:            string | null;
  address:            BusinessAddress;
  businessCategory:   string;
  industry:           string;
  serviceModel:       ServiceModel;
  establishedYear:    number | null;
  employeeCount:      EmployeeRange | null;
  licenseNumber:      string | null;
}

// ---------------------------------------------------------------------------
// C. HandoverSnapshot
// ---------------------------------------------------------------------------

export interface MetricTarget {
  metric:     string;
  target:     number;
  unit:       string;
  direction:  MetricDirection;
}

export interface BaselineMetrics {
  gbpRank:                    number | null;
  monthlySearchImpressions:   number | null;
  websiteOrganicSessions:     number | null;
  reviewCount:                number | null;
  reviewRating:               number | null;
  localPackPresence:          boolean;
  capturedAt:                 string;       // ISO 8601
}

export interface HandoverSnapshot {
  snapshotId:   string;   // UUID v4
  sourceLead: {
    leadId:               string;
    leadName:             string;
    leadStage:            string;
    leadAgeInDays:        number;
    touchpoints:          number;
    leadScore:            number;           // 0–100
    acquisitionChannel:   string | null;
  };
  strategyVersion: {
    versionId:          string;
    generatedAt:        string;             // ISO 8601
    generatorAgentId:   string;
    strategyHash:       string;             // SHA-256 hex, 64 chars
    isLatest:           boolean;
  };
  conversionArchetype:  ConversionArchetype;
  initialGamePlan: {
    priorityModules:      string[];         // min 1
    firstFocusArea:       string;
    recommendedTimeline: {
      week1:  string;
      month1: string;
      month3: string;
    };
    keyRisks:             string[];         // min 1
    keyOpportunities:     string[];         // min 1
    competitorContext:    string;
    startingPosition:     string;
  };
  expectedOutcome: {
    primaryMetric:    string;
    targetsByMonth: {
      month1:   MetricTarget[];
      month3:   MetricTarget[];
      month6:   MetricTarget[];
    };
    successDefinition:  string;
    baselineMetrics:    BaselineMetrics;
  };
  confidenceScore: {
    overall:            number;  // 0–100
    dataCompleteness:   number;
    strategyClarity:    number;
    marketOpportunity:  number;
    executionRisk:      number;
    scoringRationale:   string;
  };
}

// ---------------------------------------------------------------------------
// D. TargetMarket
// ---------------------------------------------------------------------------

export interface ServiceArea {
  name:       string;
  state:      string;
  postcode:   string | null;
  priority:   ServiceAreaPriority;
}

export interface TargetService {
  serviceName:      string;
  category:         string;
  isPrimary:        boolean;
  urgencyLevel:     UrgencyLevel;
  averageJobValue:  number | null;
}

export interface TargetMarket {
  primaryServiceArea: {
    suburb:   string;
    state:    string;
    postcode: string;
    coordinates: {
      lat: number | null;
      lng: number | null;
    };
  };
  serviceAreas:     ServiceArea[];     // min 1
  prioritySuburbs:  string[];          // min 1
  targetServices:   TargetService[];   // min 1; exactly 1 isPrimary: true
  radiusKm:         number | null;
  excludedAreas:    string[];
}

// ---------------------------------------------------------------------------
// E. Strategy
// ---------------------------------------------------------------------------

export interface StrategyItem {
  title:    string;
  detail:   string;
  severity: StrategySeverity;
}

export interface Recommendation {
  title:      string;
  rationale:  string;
  module:     string;
  priority:   StrategyPriority;
  timeframe:  StrategyTimeframe;
}

export interface Strategy {
  strategySummary:      string;
  growthDiagnosis:      string;
  keyRisks:             StrategyItem[];       // min 1
  keyOpportunities:     StrategyItem[];       // min 1
  startingPosition:     string;
  recommendations:      Recommendation[];     // min 1
  generatedAt:          string;               // ISO 8601
  generatedByAgentId:   string;
  strategyHash:         string;               // SHA-256 hex
}

// ---------------------------------------------------------------------------
// F. ResearchArtifacts
// ---------------------------------------------------------------------------

export interface Competitor {
  name:               string;
  website:            string | null;
  gbpRating:          number | null;
  gbpReviewCount:     number | null;
  estimatedStrength:  CompetitorStrength;
  notes:              string;
}

export interface ResearchArtifacts {
  competitorSummary: {
    competitors:        Competitor[];     // min 0, max 10
    competitiveGap:     string;
    marketShareContext: string;
    analysedAt:         string;           // ISO 8601
  };
  websiteAuditSummary: {
    hasWebsite:         boolean;
    url:                string | null;
    overallScore:       number | null;    // 0–100
    technicalIssues:    string[];
    conversionIssues:   string[];
    strengths:          string[];
    recommendation:     string;
    auditedAt:          string | null;
  };
  gbpAuditSummary: {
    hasGBP:                 boolean;
    placeId:                string | null;
    rating:                 number | null;   // 0.0–5.0
    reviewCount:            number | null;
    primaryCategory:        string | null;
    additionalCategories:   string[];
    completenessScore:      number | null;   // 0–100
    issues:                 string[];
    auditedAt:              string | null;
  };
  keywordResearchSummary: {
    totalKeywordsAnalysed:  number;
    topOpportunities:       string[];
    searchVolumeContext:     string;
    difficultyContext:       string;
    researchedAt:            string;         // ISO 8601
  };
  marketOpportunityNotes:   string;
}

// ---------------------------------------------------------------------------
// G. Keywords
// ---------------------------------------------------------------------------

export interface Keyword {
  term:           string;
  monthlyVolume:  number | null;
  difficulty:     number | null;    // 0–100
  cpc:            number | null;    // AUD
  intent:         KeywordIntent;
  isLocal:        boolean;
}

export interface KeywordCluster {
  clusterId:        string;
  clusterName:      string;
  intent:           KeywordIntent;
  parentCategory:   string;
  targetPage:       string | null;
  keywords:         Keyword[];        // min 1
  clusterVolume:    number | null;
  opportunityScore: number | null;    // 0–100
}

export interface PriorityKeyword {
  term:         string;
  reason:       string;
  targetPage:   string;
  currentRank:  number | null;
  targetRank:   number;               // 1–20
}

export interface Keywords {
  primaryKeywords:          Keyword[];           // min 1
  secondaryKeywords:        Keyword[];
  clusters:                 KeywordCluster[];    // min 1
  quickWins:                Keyword[];
  priorityKeywordTargets:   PriorityKeyword[];   // min 1
  researchedAt:             string;              // ISO 8601
  researchSource:           string;
}

// ---------------------------------------------------------------------------
// H. RequestedCapabilities
// ---------------------------------------------------------------------------

export interface RequestedCapabilities {
  website:          boolean;
  localSEO:         boolean;
  gbpManagement:    boolean;
  adsStrategy:      boolean;
  customerPortal:   boolean;
  agentAutopilot:   boolean;
}

// ---------------------------------------------------------------------------
// I. RequestedModules
// ---------------------------------------------------------------------------

export interface ModuleRequest {
  activate: true;
  priority: ModulePriority;
  notes:    string | null;
}

export interface RequestedModules {
  website:  ModuleRequest | null;
  seo:      ModuleRequest | null;
  gbp:      ModuleRequest | null;
  ads:      ModuleRequest | null;
}

// ---------------------------------------------------------------------------
// J. RequestedAgents
// ---------------------------------------------------------------------------

export interface AgentSchedule {
  frequency:          AgentFrequency;
  preferredDayOfWeek: number | null;  // 0=Sun…6=Sat
  preferredHourUTC:   number | null;  // 0–23
}

export interface AgentRequest {
  activate:     true;
  mode:         AgentMode;
  scheduleHint: AgentSchedule;
}

export interface RequestedAgents {
  onboarding_agent: AgentRequest | null;
  seo_agent:        AgentRequest | null;
  gbp_agent:        AgentRequest | null;
  content_agent:    AgentRequest | null;
  telemetry_agent:  AgentRequest | null;
}

// ---------------------------------------------------------------------------
// K. Onboarding
// ---------------------------------------------------------------------------

export interface Onboarding {
  planTier:               string;
  portalAccessRequested:  boolean;
  sendInviteEmail:        boolean;
  inviteEmail:            string | null;
  handoverNotes:          string | null;
  internalReferenceId:    string | null;
  agreedServiceScope:     string[];       // min 1
  expectedStartDate:      string | null;  // ISO date YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// L. PayloadMetadata
// ---------------------------------------------------------------------------

export interface PayloadMetadata {
  tags:           string[];
  sourceCampaign: string | null;
  salesOwner: {
    userId:       string;
    displayName:  string;
    email:        string;
  };
  closeDate:            string;           // ISO date YYYY-MM-DD
  contractValue:        number | null;
  billingCycle:         BillingCycle | null;
  internalReferences:   Record<string, string>;
}

// ---------------------------------------------------------------------------
// Root payload
// ---------------------------------------------------------------------------

export interface TenantProvisionPayload {
  provisioningRequest:    ProvisioningRequest;
  business:               Business;
  handoverSnapshot:       HandoverSnapshot;
  targetMarket:           TargetMarket;
  strategy:               Strategy;
  researchArtifacts:      ResearchArtifacts;
  keywords:               Keywords;
  requestedCapabilities:  RequestedCapabilities;
  requestedModules:       RequestedModules;
  requestedAgents:        RequestedAgents;
  onboarding:             Onboarding;
  metadata:               PayloadMetadata;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type TenantLifecycleState =
  | 'received'
  | 'validated'
  | 'tenant_created'
  | 'modules_configured'
  | 'workflows_queued'
  | 'ready_for_onboarding'
  | 'active'
  | 'failed';

export interface CreateTenantResponse {
  tenantId:               string;
  provisioningRequestId:  string;
  sourceClientId:         string;
  lifecycleState:         TenantLifecycleState;
  createdAt:              string;
  estimatedReadyAt:       string;
  statusPollUrl:          string;
  artifactsQueued:        string[];
  idempotent?:            boolean;
  message?:               string;
}

export interface TenantStatusModule {
  status: 'inactive' | 'configuring' | 'active' | 'paused';
}

export interface TenantStatusWorkflow {
  workflowId:   string;
  type:         string;
  status:       'pending' | 'running' | 'complete' | 'failed' | 'cancelled';
}

export interface TenantStatusResponse {
  tenantId:               string;
  provisioningRequestId:  string;
  sourceClientId:         string;
  lifecycleState:         TenantLifecycleState;
  lifecycleHistory:       { state: TenantLifecycleState; at: string }[];
  capabilities:           Record<string, boolean>;
  modules:                Record<string, TenantStatusModule>;
  activeAgents:           string[];
  pendingWorkflows:       TenantStatusWorkflow[];
  portalUrl:              string | null;
  inviteSent:             boolean;
  inviteSentAt:           string | null;
  lastUpdated:            string;
}

export interface PatchTenantResponse {
  tenantId:             string;
  patchAppliedAt:       string;
  updated:              string[];
  skipped:              string[];
  locked:               string[];
  artifactsCreated:     string[];
  artifactsSuperseded:  string[];
  warnings?:            { field: string; reason: string }[];
}

export interface ValidationErrorResponse {
  error:                  string;
  provisioningRequestId?: string;
  fields?:                { path: string; rule: string; message: string }[];
  supported?:             string[];
  received?:              string;
}

// ---------------------------------------------------------------------------
// Momentum-side mapping model (stored on client doc)
// ---------------------------------------------------------------------------

export interface AiSystemsIntegration {
  tenantId:               string;
  provisioningRequestId:  string;
  lifecycleState:         TenantLifecycleState;
  portalUrl:              string | null;
  provisionedAt:          string | null;         // ISO 8601
  lastSyncedAt:           string | null;
  lastSyncedVersion:      string | null;
  syncErrors:             ProvisioningSyncError[];
}

export interface ProvisioningSyncError {
  occurredAt:   string;                           // ISO 8601
  action:       'provision' | 'status_poll' | 'patch';
  httpStatus:   number | null;
  message:      string;
  attempt:      number;
}

// ---------------------------------------------------------------------------
// Provisioning log record (stored in Firestore audit subcollection)
// ---------------------------------------------------------------------------

export type ProvisioningLogEventType =
  | 'request_created'
  | 'payload_validation_passed'
  | 'payload_validation_failed'
  | 'outbound_request_sent'
  | 'response_received'
  | 'response_error'
  | 'retry_scheduled'
  | 'provisioning_succeeded'
  | 'provisioning_failed'
  | 'status_poll_sent'
  | 'status_poll_received'
  | 'patch_sent'
  | 'patch_applied'
  | 'patch_rejected';

export interface ProvisioningLogEntry {
  id?:                    string;
  orgId:                  string;
  clientId:               string;
  provisioningRequestId:  string;
  eventType:              ProvisioningLogEventType;
  eventAt:                string;                   // ISO 8601
  actor: {
    system:    'momentum';
    userId?:   string;
  };
  attempt:                number;
  httpStatus?:            number;
  durationMs?:            number;
  detail:                 Record<string, unknown>;
  error?:                 string;
}

// ---------------------------------------------------------------------------
// PATCH payload shapes (Momentum → AI Systems)
// ---------------------------------------------------------------------------

export type PatchDomain =
  | 'business'
  | 'strategy'
  | 'researchArtifacts'
  | 'keywords'
  | 'targetMarket'
  | 'requestedModules'
  | 'onboarding'
  | 'metadata';

export interface PatchRequest {
  provisioningRequest:  Omit<ProvisioningRequest, 'schemaVersion'> & { schemaVersion: SchemaVersion };
  patch: {
    domain:   PatchDomain;
    merge?:   Record<string, unknown>;       // for merge-semantic domains
    replace?: Record<string, unknown>;       // for replace-semantic domains
    addModule?: Record<string, ModuleRequest>;  // for additive module expansion
    requiredCapabilityUpdate?: Partial<RequestedCapabilities>;
  };
}
