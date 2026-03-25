// =============================================================================
// AI SYSTEMS INTEGRATION — PATCH UPDATE SERVICE
// =============================================================================
// Sends approved PATCH updates to AI Systems.
//
// OWNERSHIP RULES (enforced here):
//   Momentum owns:  business, strategy, researchArtifacts, keywords,
//                   targetMarket, onboarding, metadata
//   AI Systems owns: modules (post-activation), capabilities (post-activation),
//                    agents, workflows, publishedUrls, portalUrl
//
// PATCH semantics by domain:
//   business        → merge (update individual fields)
//   gbpData         → merge
//   strategy        → replace artifact (entire sub-object replaced)
//   researchArtifacts → replace artifact
//   keywords        → replace artifact
//   targetMarket    → locations additive union + field merge
//   requestedModules → additive only (can add, cannot remove)
//   onboarding      → merge
//   metadata        → merge
// =============================================================================

import type { Firestore } from 'firebase-admin/firestore';
import { getIntegrationConfig, isIntegrationConfigured, INTEGRATION_PATHS } from './config';
import type { PatchDomain, PatchRequest, PatchTenantResponse, ModuleRequest } from './types';
import { logPatchEvent } from './audit';
import { appendSyncError } from './provisioning';

// ---------------------------------------------------------------------------
// Domains locked to AI Systems (Momentum may not PATCH these)
// ---------------------------------------------------------------------------

const LOCKED_DOMAINS: Set<string> = new Set([
  'capabilities',
  'agents',
  'workflows',
  'publishedUrls',
  'portalUrl',
  'lifecycleState',
]);

// ---------------------------------------------------------------------------
// Patch result
// ---------------------------------------------------------------------------

export interface PatchResult {
  success:      boolean;
  updated?:     string[];
  skipped?:     string[];
  locked?:      string[];
  warnings?:    { field: string; reason: string }[];
  error?:       string;
  httpStatus?:  number;
}

// ---------------------------------------------------------------------------
// Core PATCH sender
// ---------------------------------------------------------------------------

export async function sendTenantPatch(params: {
  db:                     Firestore;
  orgId:                  string;
  clientId:               string;
  tenantId:               string;
  provisioningRequestId:  string;
  domain:                 PatchDomain;
  patchPayload:           PatchRequest;
  userId?:                string;
  attempt?:               number;
}): Promise<PatchResult> {
  const { db, orgId, clientId, tenantId, provisioningRequestId, domain, patchPayload, userId } = params;
  const attempt = params.attempt ?? 1;

  if (!isIntegrationConfigured()) {
    return { success: false, error: 'Integration not configured' };
  }

  // ── Guard: reject locked domains ─────────────────────────────────────────
  if (LOCKED_DOMAINS.has(domain)) {
    return {
      success: false,
      locked:  [domain],
      error:   `Domain "${domain}" is owned by AI Systems and cannot be patched from Momentum.`,
    };
  }

  const cfg = getIntegrationConfig();
  const endpoint = `${cfg.baseUrl}${INTEGRATION_PATHS.updateTenant(tenantId)}`;
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  await logPatchEvent({
    db, orgId, clientId, provisioningRequestId, attempt, userId,
    domain, httpStatus: 0, durationMs: 0, eventType: 'patch_sent',
  });

  let httpStatus = 0;
  let durationMs = 0;

  try {
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type':    'application/json',
        'Authorization':   `Bearer ${cfg.apiKey}`,
        'X-Source-System': 'momentum',
        'X-Schema-Version': '1.0',
      },
      body:   JSON.stringify(patchPayload),
      signal: controller.signal,
    });

    durationMs = Date.now() - start;
    httpStatus = res.status;
    const body: PatchTenantResponse = await res.json().catch(() => ({})) as PatchTenantResponse;

    if (!res.ok) {
      const errMsg = (body as any)?.error || `HTTP ${res.status}`;
      await logPatchEvent({
        db, orgId, clientId, provisioningRequestId, attempt, userId,
        domain, httpStatus, durationMs, eventType: 'patch_rejected',
      });
      await appendSyncError(db, orgId, clientId, {
        occurredAt: new Date().toISOString(),
        action:     'patch',
        httpStatus: res.status,
        message:    errMsg,
        attempt,
      });
      return { success: false, error: errMsg, httpStatus: res.status };
    }

    await logPatchEvent({
      db, orgId, clientId, provisioningRequestId, attempt, userId,
      domain, httpStatus, durationMs, eventType: 'patch_applied',
      updated: body.updated,
      locked:  body.locked,
    });

    return {
      success:   true,
      updated:   body.updated,
      skipped:   body.skipped,
      locked:    body.locked,
      warnings:  body.warnings,
    };
  } catch (err: any) {
    durationMs = Date.now() - start;
    const errMsg = err.message || 'Network error';
    await logPatchEvent({
      db, orgId, clientId, provisioningRequestId, attempt, userId,
      domain, httpStatus: 0, durationMs, eventType: 'patch_rejected',
    });
    await appendSyncError(db, orgId, clientId, {
      occurredAt: new Date().toISOString(),
      action:     'patch',
      httpStatus: 0,
      message:    errMsg,
      attempt,
    });
    return { success: false, error: errMsg, httpStatus: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Typed PATCH builders — one per approved domain
// ---------------------------------------------------------------------------

/** Merge partial business fields (name, phone, email, address etc.) */
export function buildBusinessPatch(
  provisioningReq: PatchRequest['provisioningRequest'],
  fields: Record<string, unknown>
): PatchRequest {
  return { provisioningRequest: provisioningReq, patch: { domain: 'business', merge: fields } };
}

/** Replace entire strategy artifact */
export function buildStrategyPatch(
  provisioningReq: PatchRequest['provisioningRequest'],
  strategy: Record<string, unknown>
): PatchRequest {
  return { provisioningRequest: provisioningReq, patch: { domain: 'strategy', replace: strategy } };
}

/** Replace entire researchArtifacts artifact */
export function buildResearchPatch(
  provisioningReq: PatchRequest['provisioningRequest'],
  artifacts: Record<string, unknown>
): PatchRequest {
  return { provisioningRequest: provisioningReq, patch: { domain: 'researchArtifacts', replace: artifacts } };
}

/** Replace entire keywords artifact */
export function buildKeywordsPatch(
  provisioningReq: PatchRequest['provisioningRequest'],
  keywords: Record<string, unknown>
): PatchRequest {
  return { provisioningRequest: provisioningReq, patch: { domain: 'keywords', replace: keywords } };
}

/** Additive union of locations (merge service areas / priority suburbs) */
export function buildTargetMarketPatch(
  provisioningReq: PatchRequest['provisioningRequest'],
  fields: Record<string, unknown>
): PatchRequest {
  return { provisioningRequest: provisioningReq, patch: { domain: 'targetMarket', merge: fields } };
}

/** Additive module expansion — can add modules, cannot remove */
export function buildModuleAddPatch(
  provisioningReq: PatchRequest['provisioningRequest'],
  modules: Record<string, ModuleRequest>
): PatchRequest {
  return { provisioningRequest: provisioningReq, patch: { domain: 'requestedModules', addModule: modules } };
}

/** Merge onboarding fields */
export function buildOnboardingPatch(
  provisioningReq: PatchRequest['provisioningRequest'],
  fields: Record<string, unknown>
): PatchRequest {
  return { provisioningRequest: provisioningReq, patch: { domain: 'onboarding', merge: fields } };
}
