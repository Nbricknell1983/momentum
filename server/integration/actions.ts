// =============================================================================
// AI SYSTEMS INTEGRATION — ADMIN ACTION LAYER
// =============================================================================
// These are the four admin-safe, auditable actions exposed via the router.
// Each action validates preconditions, delegates to the appropriate service,
// and returns a structured result with an audit trail.
// =============================================================================

import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { isIntegrationConfigured, getIntegrationConfig } from './config';
import { provisionTenant, readIntegrationMapping, buildProvisioningRequestBlock } from './provisioning';
import { pollTenantStatus } from './status';
import { sendTenantPatch, buildBusinessPatch, buildStrategyPatch, buildKeywordsPatch, buildTargetMarketPatch, buildModuleAddPatch, buildResearchPatch } from './patch';
import { getRecentProvisioningLog } from './audit';
import {
  mapBusiness,
  mapHandoverSnapshot,
  mapTargetMarket,
  mapStrategy,
  mapResearchArtifacts,
  mapKeywords,
  mapCapabilities,
  mapModules,
  mapAgents,
  mapOnboarding,
  mapMetadata,
} from './mappers';
import type {
  TenantProvisionPayload,
  ConversionArchetype,
  PatchDomain,
  ModuleRequest,
} from './types';
import { INTEGRATION_SCHEMA_VERSION } from './config';
import { toAiSystemsPayload } from './ai-systems-transform';

// ---------------------------------------------------------------------------
// Readiness check — validates data completeness before provisioning
// ---------------------------------------------------------------------------

export interface ReadinessCheck {
  ready:            boolean;
  score:            number;          // 0–100
  missingRequired:  string[];
  warnings:         string[];
  configured:       boolean;
  alreadyProvisioned: boolean;
}

export async function checkProvisioningReadiness(
  db: Firestore,
  orgId: string,
  clientId: string,
  clientDoc: Record<string, any>
): Promise<ReadinessCheck> {
  const configured = isIntegrationConfigured();
  const integration = await readIntegrationMapping(db, orgId, clientId);
  const alreadyProvisioned = !!(integration?.tenantId);

  const missing: string[] = [];
  const warnings: string[] = [];

  if (!clientDoc.legalName && !clientDoc.businessName) missing.push('Business name');
  if (!clientDoc.phone)        missing.push('Business phone');
  if (!clientDoc.address?.suburb && !clientDoc.suburb) missing.push('Business suburb');
  if (!clientDoc.address?.state  && !clientDoc.state)  missing.push('Business state');
  if (!clientDoc.gbpCategory && !clientDoc.businessCategory) warnings.push('Business category missing — will default to industry');
  if (!clientDoc.primaryContact && !clientDoc.contactFirstName) missing.push('Primary contact name');
  if (!clientDoc.primaryContact?.email && !clientDoc.email) missing.push('Contact email');

  const scopeSelection = clientDoc.scopeSelection || {};
  const hasScope = scopeSelection.website || scopeSelection.seo || scopeSelection.gbp || scopeSelection.ads;
  if (!hasScope) missing.push('Scope selection (website/SEO/GBP/ads) — at least one required');

  if (!clientDoc.strategyData && !clientDoc.strategy) warnings.push('No strategy output — AI Systems will start from scratch');
  if (!clientDoc.keywords?.length && !clientDoc.keywordStrategy) warnings.push('No keyword data — keyword strategy will be empty');

  const total = 7;
  const score = Math.round(((total - missing.length) / total) * 100);

  return {
    ready: missing.length === 0 && configured,
    score,
    missingRequired: missing,
    warnings,
    configured,
    alreadyProvisioned,
  };
}

// ---------------------------------------------------------------------------
// ACTION 1 — Create Tenant in AI Systems
// ---------------------------------------------------------------------------

export interface CreateTenantActionResult {
  success:               boolean;
  provisioningRequestId?: string;
  tenantId?:             string;
  lifecycleState?:       string;
  validationErrors?:     unknown[];
  error?:                string;
}

export async function actionCreateTenant(params: {
  db:           Firestore;
  orgId:        string;
  clientId:     string;
  clientDoc:    Record<string, any>;
  leadDoc:      Record<string, any>;
  strategyDoc:  Record<string, any>;
  researchDoc:  Record<string, any>;
  keywordDoc:   Record<string, any>;
  scoringDoc:   Record<string, any>;
  archetype:    ConversionArchetype;
  scopeSelection: { website: boolean; seo: boolean; gbp: boolean; ads: boolean; portal: boolean; autopilot: boolean };
  planTier:     string;
  userId:       string;
  displayName:  string;
  userEmail:    string;
  role:         string;
  handoverNotes?: string;
  expectedStartDate?: string;
}): Promise<CreateTenantActionResult> {
  const {
    db, orgId, clientId, clientDoc, leadDoc, strategyDoc,
    researchDoc, keywordDoc, scoringDoc, archetype, scopeSelection,
    planTier, userId, displayName, userEmail, role,
    handoverNotes, expectedStartDate,
  } = params;

  // ── Build provisioningRequest block ───────────────────────────────────────
  const provisioningRequest = buildProvisioningRequestBlock({
    orgId, clientId, userId, displayName, role,
    schemaVersion: INTEGRATION_SCHEMA_VERSION,
  });

  // ── Assemble full payload via mappers ─────────────────────────────────────
  const capabilities = mapCapabilities(scopeSelection);
  const modules      = mapModules(scopeSelection);
  const agents       = mapAgents(modules, scopeSelection.autopilot);

  // ── Assemble rich internal payload (Momentum's own format) ────────────────
  const internalPayload: TenantProvisionPayload = {
    provisioningRequest,
    business:             mapBusiness(clientDoc),
    handoverSnapshot:     mapHandoverSnapshot({
      snapshotId: randomUUID(),
      leadDoc,
      strategyDoc,
      scoringDoc,
      archetype,
    }),
    targetMarket:         mapTargetMarket(clientDoc),
    strategy:             mapStrategy(strategyDoc),
    researchArtifacts:    mapResearchArtifacts(clientDoc, researchDoc),
    keywords:             mapKeywords(keywordDoc),
    requestedCapabilities: capabilities,
    requestedModules:     modules,
    requestedAgents:      agents,
    onboarding:           mapOnboarding({
      planTier,
      agreedScope: Object.entries(scopeSelection)
        .filter(([, v]) => v)
        .map(([k]) => k),
      handoverNotes,
      expectedStartDate,
      portal:     scopeSelection.portal,
      sendInvite: scopeSelection.portal,
      inviteEmail: clientDoc.primaryContact?.email || clientDoc.email || null,
    }),
    metadata:             mapMetadata({ clientDoc, userId, displayName, userEmail }),
  };

  // ── Transform to AI Systems' expected flat format ───────────────────────
  const aiSystemsPayload = toAiSystemsPayload(internalPayload);

  const result = await provisionTenant({ db, orgId, clientId, internalPayload, aiSystemsPayload, userId });

  // ── Trigger AI Systems startup after successful provisioning ────────────
  if (result.success && result.tenantId && isIntegrationConfigured()) {
    try {
      const cfg = getIntegrationConfig();
      const startupUrl = `${cfg.baseUrl}/api/startup/tenants/${result.tenantId}/run`;
      await fetch(startupUrl, {
        method:  'POST',
        headers: {
          'Authorization':    `Bearer ${cfg.apiKey}`,
          'Content-Type':     'application/json',
          'X-Source-System':  'momentum',
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      // Startup trigger failure is non-fatal — can be retried via status refresh
    }
  }

  return {
    success:               result.success,
    provisioningRequestId: result.provisioningRequestId,
    tenantId:              result.tenantId,
    lifecycleState:        result.lifecycleState,
    validationErrors:      result.validationErrors,
    error:                 result.error,
  };
}

// ---------------------------------------------------------------------------
// ACTION 2 — Retry Provisioning
// ---------------------------------------------------------------------------

export async function actionRetryProvisioning(params: {
  db:        Firestore;
  orgId:     string;
  clientId:  string;
  clientDoc: Record<string, any>;
  leadDoc:   Record<string, any>;
  strategyDoc: Record<string, any>;
  researchDoc: Record<string, any>;
  keywordDoc:  Record<string, any>;
  scoringDoc:  Record<string, any>;
  archetype:   ConversionArchetype;
  scopeSelection: { website: boolean; seo: boolean; gbp: boolean; ads: boolean; portal: boolean; autopilot: boolean };
  planTier:    string;
  userId:      string;
  displayName: string;
  userEmail:   string;
  role:        string;
}): Promise<CreateTenantActionResult> {
  // Retry uses a fresh provisioningRequestId but same data
  return actionCreateTenant(params);
}

// ---------------------------------------------------------------------------
// ACTION 3 — Refresh Provisioning Status
// ---------------------------------------------------------------------------

export interface RefreshStatusResult {
  success:          boolean;
  lifecycleState?:  string;
  portalUrl?:       string | null;
  capabilities?:    string[];
  modules?:         string[];
  activeAgents?:    string[];
  activeWorkflows?: { workflowType: string; status: string; scheduledAt: string }[];
  error?:           string;
}

export async function actionRefreshStatus(params: {
  db:       Firestore;
  orgId:    string;
  clientId: string;
}): Promise<RefreshStatusResult> {
  const { db, orgId, clientId } = params;

  const integration = await readIntegrationMapping(db, orgId, clientId);
  if (!integration?.tenantId) {
    return { success: false, error: 'No tenant found — provision first' };
  }

  const result = await pollTenantStatus({
    db, orgId, clientId,
    tenantId:              integration.tenantId,
    provisioningRequestId: integration.provisioningRequestId,
  });

  return result;
}

// ---------------------------------------------------------------------------
// ACTION 4 — Send PATCH Update
// ---------------------------------------------------------------------------

export interface PatchActionResult {
  success:   boolean;
  updated?:  string[];
  skipped?:  string[];
  locked?:   string[];
  warnings?: { field: string; reason: string }[];
  error?:    string;
}

export async function actionSendPatch(params: {
  db:       Firestore;
  orgId:    string;
  clientId: string;
  domain:   PatchDomain;
  data:     Record<string, unknown>;
  userId?:  string;
}): Promise<PatchActionResult> {
  const { db, orgId, clientId, domain, data, userId } = params;

  const integration = await readIntegrationMapping(db, orgId, clientId);
  if (!integration?.tenantId) {
    return { success: false, error: 'No tenant found — provision first' };
  }

  const patchRequestId = randomUUID();

  let patchPayload;
  switch (domain) {
    case 'business':          patchPayload = buildBusinessPatch(patchRequestId, data); break;
    case 'strategy':          patchPayload = buildStrategyPatch(patchRequestId, data); break;
    case 'researchArtifacts': patchPayload = buildResearchPatch(patchRequestId, data); break;
    case 'keywords':          patchPayload = buildKeywordsPatch(patchRequestId, data); break;
    case 'targetMarket':      patchPayload = buildTargetMarketPatch(patchRequestId, data); break;
    case 'requestedModules':  patchPayload = buildModuleAddPatch(patchRequestId, data as Record<string, ModuleRequest>); break;
    default:
      return { success: false, error: `Unknown patch domain: ${domain}` };
  }

  if (!patchPayload) {
    return { success: false, error: `No patch builder for domain: ${domain}` };
  }

  const result = await sendTenantPatch({
    db, orgId, clientId,
    tenantId:              integration.tenantId,
    provisioningRequestId: integration.provisioningRequestId,
    domain,
    patchPayload,
    userId,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Read provisioning log for UI
// ---------------------------------------------------------------------------

export async function getProvisioningLog(
  db: Firestore,
  orgId: string,
  clientId: string
) {
  return getRecentProvisioningLog(db, orgId, clientId);
}
