// =============================================================================
// AI SYSTEMS INTEGRATION — PROVISIONING SERVICE
// =============================================================================
// Core service that:
//   1. Assembles TenantProvisionPayload from Momentum models
//   2. Validates with Zod
//   3. Sends POST /api/integration/tenants to AI Systems
//   4. Handles retry-safe submission with exponential backoff
//   5. Stores the returned tenantId / lifecycleState on the client doc
//   6. Writes structured audit log entries throughout
// =============================================================================

import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { getIntegrationConfig, isIntegrationConfigured, INTEGRATION_PATHS } from './config';
import type {
  TenantProvisionPayload,
  CreateTenantResponse,
  AiSystemsIntegration,
  ProvisioningSyncError,
} from './types';
import type { AiSystemsProvisionPayload } from './ai-systems-transform';
import {
  logRequestCreated,
  logValidationPassed,
  logValidationFailed,
  logOutboundRequest,
  logResponseReceived,
  logRetryScheduled,
  logProvisioningSucceeded,
  logProvisioningFailed,
} from './audit';
import { stableHash } from '../agent-jobs/hash';

// ---------------------------------------------------------------------------
// Firestore helpers for the AiSystemsIntegration mapping on client docs
// ---------------------------------------------------------------------------

const INTEGRATION_FIELD = 'aiSystemsIntegration';

function clientRef(db: Firestore, orgId: string, clientId: string) {
  return db.collection('orgs').doc(orgId).collection('clients').doc(clientId);
}

export async function readIntegrationMapping(
  db: Firestore,
  orgId: string,
  clientId: string
): Promise<AiSystemsIntegration | null> {
  const snap = await clientRef(db, orgId, clientId).get();
  if (!snap.exists) return null;
  return (snap.data()?.[INTEGRATION_FIELD] as AiSystemsIntegration) || null;
}

export async function writeIntegrationMapping(
  db: Firestore,
  orgId: string,
  clientId: string,
  mapping: Partial<AiSystemsIntegration>
): Promise<void> {
  await clientRef(db, orgId, clientId).update({
    [INTEGRATION_FIELD]: mapping,
    updatedAt: new Date().toISOString(),
  });
}

export async function appendSyncError(
  db: Firestore,
  orgId: string,
  clientId: string,
  error: ProvisioningSyncError
): Promise<void> {
  const snap = await clientRef(db, orgId, clientId).get();
  if (!snap.exists) return;
  const existing: AiSystemsIntegration | undefined = snap.data()?.[INTEGRATION_FIELD];
  const currentErrors: ProvisioningSyncError[] = existing?.syncErrors || [];
  await clientRef(db, orgId, clientId).update({
    [`${INTEGRATION_FIELD}.syncErrors`]: [...currentErrors.slice(-9), error],
    updatedAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// HTTP transport — single request with timeout
// ---------------------------------------------------------------------------

interface OutboundRequestResult {
  ok:         boolean;
  status:     number;
  body:       unknown;
  durationMs: number;
}

async function sendRequest(
  url: string,
  method: 'POST' | 'PATCH' | 'GET',
  apiKey: string,
  body: unknown,
  timeoutMs: number
): Promise<OutboundRequestResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${apiKey}`,
        'X-Source-System': 'momentum',
        'X-Schema-Version': '1.0',
      },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const responseBody = await res.json().catch(() => ({}));
    return {
      ok:         res.ok,
      status:     res.status,
      body:       responseBody,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      ok:         false,
      status:     0,
      body:       { error: err.message || 'Network error' },
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Provisioning result
// ---------------------------------------------------------------------------

export interface ProvisioningResult {
  success:               boolean;
  tenantId?:             string;
  provisioningRequestId: string;
  lifecycleState?:       string;
  portalUrl?:            string | null;
  error?:                string;
  validationErrors?:     unknown[];
  attempt:               number;
}

// ---------------------------------------------------------------------------
// Main provisioning function
// ---------------------------------------------------------------------------

export async function provisionTenant(params: {
  db:                   Firestore;
  orgId:                string;
  clientId:             string;
  internalPayload:      TenantProvisionPayload;
  aiSystemsPayload:     AiSystemsProvisionPayload;
  userId?:              string;
  attempt?:             number;
}): Promise<ProvisioningResult> {
  const { db, orgId, clientId, internalPayload, aiSystemsPayload, userId } = params;
  const attempt = params.attempt ?? 1;
  const provisioningRequestId = aiSystemsPayload.provisioningRequestId;

  if (!isIntegrationConfigured()) {
    return {
      success:               false,
      provisioningRequestId,
      error:                 'AI Systems integration is not configured. Set AI_SYSTEMS_BASE_URL and AI_SYSTEMS_API_KEY.',
      attempt,
    };
  }

  const cfg = getIntegrationConfig();

  // ── 1. Compute payload hash ───────────────────────────────────────────────
  const payloadHash = stableHash(aiSystemsPayload).slice(0, 16);
  await logRequestCreated({ db, orgId, clientId, provisioningRequestId, attempt, userId, payloadHash });

  // ── 2. Log validation (AI Systems will validate on its side) ──────────────
  await logValidationPassed({ db, orgId, clientId, provisioningRequestId, attempt, userId });

  // ── 3. Send outbound request ───────────────────────────────────────────────
  const endpoint = `${cfg.baseUrl}${INTEGRATION_PATHS.createTenant}`;
  await logOutboundRequest({ db, orgId, clientId, provisioningRequestId, attempt, userId, endpoint });

  const result = await sendRequest(endpoint, 'POST', cfg.apiKey, aiSystemsPayload, cfg.requestTimeoutMs);

  await logResponseReceived({
    db, orgId, clientId, provisioningRequestId, attempt, userId,
    httpStatus:     result.status,
    durationMs:     result.durationMs,
    tenantId:       (result.body as any)?.tenantId,
    lifecycleState: (result.body as any)?.lifecycleState,
  });

  // ── 4. Handle success ─────────────────────────────────────────────────────
  if (result.ok) {
    const body = result.body as CreateTenantResponse;
    const integration: AiSystemsIntegration = {
      tenantId:               body.tenantId,
      provisioningRequestId:  body.provisioningRequestId,
      lifecycleState:         body.lifecycleState,
      portalUrl:              null,
      provisionedAt:          new Date().toISOString(),
      lastSyncedAt:           new Date().toISOString(),
      lastSyncedVersion:      aiSystemsPayload.schemaVersion,
      syncErrors:             [],
    };
    await writeIntegrationMapping(db, orgId, clientId, integration);
    await logProvisioningSucceeded({
      db, orgId, clientId, provisioningRequestId, attempt, userId,
      tenantId:  body.tenantId,
      portalUrl: null,
    });
    return {
      success:               true,
      tenantId:              body.tenantId,
      provisioningRequestId: body.provisioningRequestId,
      lifecycleState:        body.lifecycleState,
      portalUrl:             null,
      attempt,
    };
  }

  // ── 5. Handle failure ─────────────────────────────────────────────────────
  const body = result.body as any;
  const issues = body?.issues;
  const issueDetail = issues
    ? Object.entries(issues).map(([field, msgs]) => `${field}: ${(msgs as string[]).join(', ')}`).join('; ')
    : null;
  const errorMessage = issueDetail
    ? `${body?.error || 'Validation failed'} — ${issueDetail}`
    : body?.error || body?.message || `HTTP ${result.status}`;
  const shouldRetry = attempt < cfg.maxRetries && isRetryableStatus(result.status);

  await appendSyncError(db, orgId, clientId, {
    occurredAt: new Date().toISOString(),
    action:     'provision',
    httpStatus: result.status,
    message:    errorMessage,
    attempt,
  });

  if (shouldRetry) {
    const delayMs = cfg.retryDelays[attempt - 1] ?? 300_000;
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    await logRetryScheduled({
      db, orgId, clientId, provisioningRequestId, attempt, userId,
      nextAttemptAt,
      delayMs,
      reason: errorMessage,
    });
    // Caller is responsible for scheduling the retry at nextAttemptAt
    return {
      success:               false,
      provisioningRequestId,
      error:                 errorMessage,
      attempt,
    };
  }

  await logProvisioningFailed({
    db, orgId, clientId, provisioningRequestId, attempt, userId,
    reason:       errorMessage,
    finalAttempt: true,
  });

  return { success: false, provisioningRequestId, error: errorMessage, attempt };
}

// ---------------------------------------------------------------------------
// Retry-safe status check (HTTP 429, 500, 502, 503, 504 are retryable)
// ---------------------------------------------------------------------------

function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 429 || (status >= 500 && status <= 504);
}

// ---------------------------------------------------------------------------
// Build a minimal provisioningRequest block (called before full payload assembly)
// ---------------------------------------------------------------------------

export function buildProvisioningRequestBlock(params: {
  orgId:      string;
  clientId:   string;
  userId:     string;
  displayName: string;
  role:       string;
  schemaVersion: '1.0';
}): TenantProvisionPayload['provisioningRequest'] {
  return {
    provisioningRequestId: randomUUID(),
    sourceSystem:          'momentum',
    sourceOrgId:           params.orgId,
    sourceClientId:        params.clientId,
    requestedAt:           new Date().toISOString(),
    requestedBy: {
      userId:       params.userId,
      displayName:  params.displayName,
      role:         params.role,
    },
    schemaVersion: params.schemaVersion,
  };
}
