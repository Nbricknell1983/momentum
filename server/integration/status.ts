// =============================================================================
// AI SYSTEMS INTEGRATION — STATUS POLLING SERVICE
// =============================================================================
// Calls GET /api/integration/tenants/:tenantId/status on AI Systems and
// safely updates Momentum's stored integration state.
// =============================================================================

import type { Firestore } from 'firebase-admin/firestore';
import { getIntegrationConfig, isIntegrationConfigured, INTEGRATION_PATHS } from './config';
import type { TenantStatusResponse, AiSystemsIntegration } from './types';
import { logStatusPoll } from './audit';
import { readIntegrationMapping, writeIntegrationMapping, appendSyncError } from './provisioning';

export interface StatusPollResult {
  success:        boolean;
  lifecycleState?: string;
  portalUrl?:      string | null;
  modules?:        Record<string, { status: string }>;
  activeAgents?:   string[];
  error?:          string;
  httpStatus?:     number;
}

export async function pollTenantStatus(params: {
  db:        Firestore;
  orgId:     string;
  clientId:  string;
  tenantId:  string;
  provisioningRequestId: string;
  attempt?:  number;
}): Promise<StatusPollResult> {
  const { db, orgId, clientId, tenantId, provisioningRequestId } = params;
  const attempt = params.attempt ?? 1;

  if (!isIntegrationConfigured()) {
    return { success: false, error: 'Integration not configured' };
  }

  const cfg = getIntegrationConfig();
  const endpoint = `${cfg.baseUrl}${INTEGRATION_PATHS.tenantStatus(tenantId)}`;
  const start = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  let httpStatus = 0;
  let durationMs = 0;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization':   `Bearer ${cfg.apiKey}`,
        'X-Source-System': 'momentum',
      },
      signal: controller.signal,
    });

    durationMs = Date.now() - start;
    httpStatus = res.status;
    const body: TenantStatusResponse = await res.json().catch(() => ({})) as TenantStatusResponse;

    await logStatusPoll({
      db, orgId, clientId, provisioningRequestId, attempt,
      httpStatus, durationMs,
      lifecycleState: body.lifecycleState,
    });

    if (!res.ok) {
      const errorMsg = (body as any)?.error || `HTTP ${res.status}`;
      await appendSyncError(db, orgId, clientId, {
        occurredAt: new Date().toISOString(),
        action:     'status_poll',
        httpStatus: res.status,
        message:    errorMsg,
        attempt,
      });
      return { success: false, error: errorMsg, httpStatus: res.status };
    }

    // ── Update Momentum's stored integration state ────────────────────────
    const existing = await readIntegrationMapping(db, orgId, clientId);
    const updated: AiSystemsIntegration = {
      ...(existing || {
        tenantId:               tenantId,
        provisioningRequestId:  provisioningRequestId,
        portalUrl:              null,
        provisionedAt:          null,
        syncErrors:             [],
        lastSyncedVersion:      null,
      }),
      lifecycleState:     body.lifecycleState,
      portalUrl:          body.portalUrl || existing?.portalUrl || null,
      lastSyncedAt:       new Date().toISOString(),
      lastSyncedVersion:  cfg.schemaVersion,
    };

    await writeIntegrationMapping(db, orgId, clientId, updated);

    return {
      success:        true,
      lifecycleState: body.lifecycleState,
      portalUrl:      body.portalUrl || null,
      modules:        body.modules,
      activeAgents:   body.activeAgents,
    };
  } catch (err: any) {
    durationMs = Date.now() - start;
    const errorMsg = err.message || 'Network error';
    await logStatusPoll({ db, orgId, clientId, provisioningRequestId, attempt, httpStatus: 0, durationMs });
    await appendSyncError(db, orgId, clientId, {
      occurredAt: new Date().toISOString(),
      action:     'status_poll',
      httpStatus: 0,
      message:    errorMsg,
      attempt,
    });
    return { success: false, error: errorMsg, httpStatus: 0 };
  } finally {
    clearTimeout(timeout);
  }
}
