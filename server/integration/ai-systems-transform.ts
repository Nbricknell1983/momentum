// =============================================================================
// AI SYSTEMS INTEGRATION — PAYLOAD TRANSFORMER
// =============================================================================
// Transforms Momentum's rich internal payload into the flat format that
// AI Systems expects (as defined in AI Systems' schemas.ts).
//
// Momentum assembles a rich, nested payload using its own mappers.
// AI Systems expects a flat structure with: tenant, capabilities[], modules[],
// agents[], handoverSnapshot?, nextBestActions?, metadata?.
//
// This module bridges the two contracts.
// =============================================================================

import type { TenantProvisionPayload } from './types';

// ---------------------------------------------------------------------------
// AI Systems expected types (mirrors AI Systems schemas.ts)
// ---------------------------------------------------------------------------

export interface AiSystemsTenantData {
  name:             string;
  subdomain:        string;
  category:         AiSystemsCategory;
  contactEmail?:    string;
  contactPhone?:    string;
  businessAddress?: string;
  customDomain?:    string;
  branding?: {
    primaryColor?:    string;
    secondaryColor?:  string;
    logoUrl?:         string;
    tagline?:         string;
  };
}

export interface AiSystemsModuleSpec {
  moduleId:             string;
  requiredCapability?:  string;
  config?:              Record<string, unknown>;
}

export interface AiSystemsAgentSpec {
  agentId:              string;
  requiredCapability?:  string;
  requiredModule?:      string;
}

export interface AiSystemsHandoverSnapshot {
  keywordStrategy?:   string[];
  serviceAreas?:      string[];
  competitorUrls?:    string[];
  targetRankings?:    { keyword: string; targetPosition: number }[];
  notes?:             string;
  attachedAt?:        string;
}

export interface AiSystemsNextBestAction {
  actionId:       string;
  title:          string;
  priority:       'critical' | 'high' | 'medium';
  description:    string;
  linkedModule?:  string;
  linkedKeyword?: string;
}

export interface AiSystemsProvisionPayload {
  schemaVersion:          '1.0';
  provisioningRequestId:  string;
  sourceSystem:           'momentum';
  sourceOrgId:            string;
  sourceClientId:         string;
  tenant:                 AiSystemsTenantData;
  capabilities:           string[];
  modules:                AiSystemsModuleSpec[];
  agents:                 AiSystemsAgentSpec[];
  handoverSnapshot?:      AiSystemsHandoverSnapshot;
  nextBestActions?:       AiSystemsNextBestAction[];
  metadata?:              Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Category mapping — Momentum freeform → AI Systems enum
// ---------------------------------------------------------------------------

const TENANT_CATEGORIES = [
  'plumber', 'electrician', 'mechanic', 'hvac', 'landscaper', 'cleaner',
  'contractor', 'skipbins', 'earthmoving', 'equipmenthire', 'fabrication',
  'financial', 'engineering', 'general',
] as const;

export type AiSystemsCategory = typeof TENANT_CATEGORIES[number];

const CATEGORY_KEYWORDS: Record<AiSystemsCategory, string[]> = {
  plumber:        ['plumb', 'pipe', 'drain', 'gas fit', 'hot water', 'tap', 'toilet', 'leak'],
  electrician:    ['electri', 'spark', 'wiring', 'power', 'lighting', 'switchboard', 'solar'],
  mechanic:       ['mechani', 'auto', 'car', 'vehicle', 'brake', 'engine', 'tyre', 'tire'],
  hvac:           ['hvac', 'air condition', 'heating', 'cooling', 'ventilat', 'refrigerat', 'aircon'],
  landscaper:     ['landscap', 'garden', 'lawn', 'turf', 'paving', 'retaining wall', 'irrigation'],
  cleaner:        ['clean', 'carpet', 'window clean', 'pressure wash', 'janitorial', 'maid'],
  contractor:     ['builder', 'building', 'construct', 'renovation', 'carpent', 'cabinet'],
  skipbins:       ['skip bin', 'waste', 'rubbish', 'bin hire', 'demolition waste'],
  earthmoving:    ['earthmov', 'excavat', 'bobcat', 'grading', 'trenching', 'civil works'],
  equipmenthire:  ['hire', 'rental', 'equipment hire', 'tool hire', 'plant hire'],
  fabrication:    ['fabricat', 'weld', 'steel', 'metal work', 'sheet metal'],
  financial:      ['financ', 'account', 'bookkeep', 'tax', 'mortgage', 'insurance'],
  engineering:    ['engineer', 'structural', 'civil engineer', 'consulting engineer'],
  general:        [],
};

export function mapCategoryToEnum(raw: string): AiSystemsCategory {
  if (!raw) return 'general';
  const lower = raw.toLowerCase();

  // Exact match first
  if (TENANT_CATEGORIES.includes(lower as AiSystemsCategory)) {
    return lower as AiSystemsCategory;
  }

  // Keyword matching
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.length === 0) continue;
    if (keywords.some(kw => lower.includes(kw))) {
      return category as AiSystemsCategory;
    }
  }

  return 'general';
}

// ---------------------------------------------------------------------------
// Subdomain generation
// ---------------------------------------------------------------------------

export function generateSubdomain(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/['']/g, '')              // Remove apostrophes
    .replace(/&/g, 'and')              // Replace & with 'and'
    .replace(/[^a-z0-9]+/g, '-')       // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')           // Trim leading/trailing hyphens
    .replace(/-{2,}/g, '-')            // Collapse multiple hyphens
    .slice(0, 63)                      // Max length
    || 'tenant';                       // Fallback
}

// ---------------------------------------------------------------------------
// Capability conversion — boolean object → string array
// ---------------------------------------------------------------------------
// AI Systems uses capability strings that map to its module system.
// These are the capabilities AI Systems understands (from its modules.ts):
//   seo, gbp, crm, booking, sms, invoicing, website

function capabilitiesToArray(caps: TenantProvisionPayload['requestedCapabilities']): string[] {
  const result: string[] = [];
  if (caps.website)        result.push('website');
  if (caps.localSEO)       result.push('seo');
  if (caps.gbpManagement)  result.push('gbp');
  if (caps.adsStrategy)    result.push('ads');
  if (caps.customerPortal) result.push('portal');
  if (caps.agentAutopilot) result.push('autopilot');
  return result;
}

// ---------------------------------------------------------------------------
// Module conversion — object → ModuleSpec[]
// ---------------------------------------------------------------------------
// Maps Momentum's module keys to AI Systems' moduleId values.

const MODULE_ID_MAP: Record<string, { moduleId: string; requiredCapability: string }> = {
  website:  { moduleId: 'website',           requiredCapability: 'website' },
  seo:      { moduleId: 'seo_autopilot',     requiredCapability: 'seo' },
  gbp:      { moduleId: 'gbp_growth_engine', requiredCapability: 'gbp' },
  ads:      { moduleId: 'ads_strategy',      requiredCapability: 'ads' },
};

function modulesToSpecArray(mods: TenantProvisionPayload['requestedModules']): AiSystemsModuleSpec[] {
  const result: AiSystemsModuleSpec[] = [];
  for (const [key, value] of Object.entries(mods)) {
    if (value === null) continue;
    const mapping = MODULE_ID_MAP[key];
    if (!mapping) continue;
    result.push({
      moduleId:           mapping.moduleId,
      requiredCapability: mapping.requiredCapability,
      config: {
        priority: value.priority,
        notes:    value.notes,
      },
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Agent conversion — object → AgentSpec[]
// ---------------------------------------------------------------------------
// Maps Momentum's agent keys to AI Systems' agentId values.

const AGENT_ID_MAP: Record<string, { agentId: string; requiredCapability?: string; requiredModule?: string }> = {
  onboarding_agent: { agentId: 'onboarding_agent' },
  seo_agent:        { agentId: 'seo_content_agent',     requiredCapability: 'seo', requiredModule: 'seo_autopilot' },
  gbp_agent:        { agentId: 'gbp_post_agent',        requiredCapability: 'gbp', requiredModule: 'gbp_growth_engine' },
  content_agent:    { agentId: 'review_reply_agent',     requiredCapability: 'gbp', requiredModule: 'review_manager' },
  telemetry_agent:  { agentId: 'telemetry_agent' },
};

function agentsToSpecArray(agents: TenantProvisionPayload['requestedAgents']): AiSystemsAgentSpec[] {
  const result: AiSystemsAgentSpec[] = [];
  for (const [key, value] of Object.entries(agents)) {
    if (value === null) continue;
    const mapping = AGENT_ID_MAP[key];
    if (!mapping) continue;
    result.push({
      agentId:            mapping.agentId,
      requiredCapability: mapping.requiredCapability,
      requiredModule:     mapping.requiredModule,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Handover snapshot conversion — rich → simple
// ---------------------------------------------------------------------------

function toAiSystemsHandover(payload: TenantProvisionPayload): AiSystemsHandoverSnapshot {
  const { keywords, targetMarket, researchArtifacts, strategy, handoverSnapshot } = payload;

  // Extract keyword terms
  const keywordStrategy = [
    ...keywords.primaryKeywords.map(k => k.term),
    ...keywords.priorityKeywordTargets.map(k => k.term),
  ].filter(Boolean).slice(0, 200);

  // Extract service areas
  const serviceAreas = [
    ...targetMarket.serviceAreas.map(a => a.name),
    ...targetMarket.prioritySuburbs,
  ].filter(Boolean).slice(0, 100);

  // Extract competitor URLs
  const competitorUrls = researchArtifacts.competitorSummary.competitors
    .map(c => c.website)
    .filter((url): url is string => !!url)
    .slice(0, 20);

  // Extract target rankings from priority keywords
  const targetRankings = keywords.priorityKeywordTargets
    .filter(k => k.term && k.targetRank)
    .map(k => ({
      keyword:        k.term,
      targetPosition: k.targetRank,
    }))
    .slice(0, 100);

  // Build notes from strategy summary
  const notesParts = [
    strategy.strategySummary && `Strategy: ${strategy.strategySummary}`,
    strategy.growthDiagnosis && `Diagnosis: ${strategy.growthDiagnosis}`,
    handoverSnapshot.initialGamePlan.firstFocusArea && `Focus: ${handoverSnapshot.initialGamePlan.firstFocusArea}`,
    handoverSnapshot.initialGamePlan.startingPosition && `Position: ${handoverSnapshot.initialGamePlan.startingPosition}`,
  ].filter(Boolean);
  const notes = notesParts.join('\n\n').slice(0, 5000) || undefined;

  return {
    keywordStrategy:  keywordStrategy.length > 0 ? keywordStrategy : undefined,
    serviceAreas:     serviceAreas.length > 0 ? serviceAreas : undefined,
    competitorUrls:   competitorUrls.length > 0 ? competitorUrls : undefined,
    targetRankings:   targetRankings.length > 0 ? targetRankings : undefined,
    notes,
    attachedAt:       new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Next Best Actions — derive from strategy recommendations
// ---------------------------------------------------------------------------

function toNextBestActions(payload: TenantProvisionPayload): AiSystemsNextBestAction[] | undefined {
  const { strategy, requestedModules } = payload;
  if (!strategy.recommendations || strategy.recommendations.length === 0) return undefined;

  return strategy.recommendations.slice(0, 50).map((rec, i) => ({
    actionId:     `momentum-rec-${i + 1}`,
    title:        rec.title,
    priority:     rec.priority === 'urgent' ? 'critical' as const
                : rec.priority === 'high'   ? 'high' as const
                :                             'medium' as const,
    description:  rec.rationale,
    linkedModule: rec.module !== 'general' ? rec.module : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

export function toAiSystemsPayload(
  internalPayload: TenantProvisionPayload
): AiSystemsProvisionPayload {
  const { provisioningRequest, business, requestedCapabilities, requestedModules, requestedAgents, metadata } = internalPayload;

  return {
    schemaVersion:          '1.0',
    provisioningRequestId:  provisioningRequest.provisioningRequestId,
    sourceSystem:           'momentum',
    sourceOrgId:            provisioningRequest.sourceOrgId,
    sourceClientId:         provisioningRequest.sourceClientId,

    tenant: {
      name:             business.legalName || business.tradingName || 'Unknown Business',
      subdomain:        generateSubdomain(business.legalName || business.tradingName || ''),
      category:         mapCategoryToEnum(business.businessCategory),
      contactEmail:     business.primaryContact.email || business.email || undefined,
      contactPhone:     business.primaryContact.phone || business.phone || undefined,
      businessAddress:  business.address.fullFormatted || undefined,
      branding:         undefined,  // AI Systems applies defaults
    },

    capabilities: capabilitiesToArray(requestedCapabilities),
    modules:      modulesToSpecArray(requestedModules),
    agents:       agentsToSpecArray(requestedAgents),

    handoverSnapshot: toAiSystemsHandover(internalPayload),
    nextBestActions:  toNextBestActions(internalPayload),

    metadata: {
      tags:           metadata.tags,
      salesOwner:     metadata.salesOwner,
      closeDate:      metadata.closeDate,
      contractValue:  metadata.contractValue,
      billingCycle:   metadata.billingCycle,
      sourceCampaign: metadata.sourceCampaign,
    },
  };
}
