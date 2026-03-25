// =============================================================================
// AI SYSTEMS INTEGRATION — PROVISIONING AUDIT LOG
// =============================================================================
// Writes immutable audit entries to Firestore.
// Path: orgs/{orgId}/clients/{clientId}/provisioningLog/{logId}
// =============================================================================

import type { Firestore } from 'firebase-admin/firestore';
import type { ProvisioningLogEntry, ProvisioningLogEventType } from './types';

const COLLECTION = 'provisioningLog';

function logCollection(db: Firestore, orgId: string, clientId: string) {
  return db
    .collection('orgs').doc(orgId)
    .collection('clients').doc(clientId)
    .collection(COLLECTION);
}

// ---------------------------------------------------------------------------
// Write a single audit log entry
// ---------------------------------------------------------------------------

export async function writeProvisioningLog(
  db: Firestore,
  entry: Omit<ProvisioningLogEntry, 'id'>
): Promise<string> {
  const ref = logCollection(db, entry.orgId, entry.clientId).doc();
  await ref.set({
    ...entry,
    eventAt: entry.eventAt || new Date().toISOString(),
  });
  return ref.id;
}

// ---------------------------------------------------------------------------
// Convenience builders — one per event type
// ---------------------------------------------------------------------------

interface BaseLogParams {
  db:                     Firestore;
  orgId:                  string;
  clientId:               string;
  provisioningRequestId:  string;
  attempt:                number;
  userId?:                string;
}

export async function logRequestCreated(
  params: BaseLogParams & { payloadHash: string }
): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              'request_created',
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum', userId: params.userId },
    attempt:                params.attempt,
    detail:                 { payloadHash: params.payloadHash },
  });
}

export async function logValidationPassed(params: BaseLogParams): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              'payload_validation_passed',
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum', userId: params.userId },
    attempt:                params.attempt,
    detail:                 {},
  });
}

export async function logValidationFailed(
  params: BaseLogParams & { errors: unknown[] }
): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              'payload_validation_failed',
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum', userId: params.userId },
    attempt:                params.attempt,
    detail:                 { errors: params.errors },
    error:                  'Zod validation failed',
  });
}

export async function logOutboundRequest(
  params: BaseLogParams & { endpoint: string }
): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              'outbound_request_sent',
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum', userId: params.userId },
    attempt:                params.attempt,
    detail:                 { endpoint: params.endpoint },
  });
}

export async function logResponseReceived(
  params: BaseLogParams & {
    httpStatus:   number;
    durationMs:   number;
    tenantId?:    string;
    lifecycleState?: string;
  }
): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              params.httpStatus < 400 ? 'response_received' : 'response_error',
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum', userId: params.userId },
    attempt:                params.attempt,
    httpStatus:             params.httpStatus,
    durationMs:             params.durationMs,
    detail: {
      tenantId:       params.tenantId,
      lifecycleState: params.lifecycleState,
    },
    error: params.httpStatus >= 400 ? `HTTP ${params.httpStatus}` : undefined,
  });
}

export async function logRetryScheduled(
  params: BaseLogParams & { nextAttemptAt: string; delayMs: number; reason: string }
): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              'retry_scheduled',
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum', userId: params.userId },
    attempt:                params.attempt,
    detail: {
      nextAttemptAt:  params.nextAttemptAt,
      delayMs:        params.delayMs,
      reason:         params.reason,
    },
  });
}

export async function logProvisioningSucceeded(
  params: BaseLogParams & { tenantId: string; portalUrl: string | null }
): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              'provisioning_succeeded',
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum', userId: params.userId },
    attempt:                params.attempt,
    detail:                 { tenantId: params.tenantId, portalUrl: params.portalUrl },
  });
}

export async function logProvisioningFailed(
  params: BaseLogParams & { reason: string; finalAttempt: boolean }
): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              'provisioning_failed',
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum', userId: params.userId },
    attempt:                params.attempt,
    detail:                 { finalAttempt: params.finalAttempt },
    error:                  params.reason,
  });
}

export async function logStatusPoll(
  params: BaseLogParams & {
    httpStatus:     number;
    durationMs:     number;
    lifecycleState?: string;
  }
): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              params.httpStatus < 400 ? 'status_poll_received' : 'response_error',
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum' },
    attempt:                params.attempt,
    httpStatus:             params.httpStatus,
    durationMs:             params.durationMs,
    detail:                 { lifecycleState: params.lifecycleState },
    error:                  params.httpStatus >= 400 ? `HTTP ${params.httpStatus}` : undefined,
  });
}

export async function logPatchEvent(
  params: BaseLogParams & {
    domain:       string;
    httpStatus:   number;
    durationMs:   number;
    updated?:     string[];
    locked?:      string[];
    eventType:    Extract<ProvisioningLogEventType, 'patch_sent' | 'patch_applied' | 'patch_rejected'>;
  }
): Promise<void> {
  await writeProvisioningLog(params.db, {
    orgId:                  params.orgId,
    clientId:               params.clientId,
    provisioningRequestId:  params.provisioningRequestId,
    eventType:              params.eventType,
    eventAt:                new Date().toISOString(),
    actor:                  { system: 'momentum', userId: params.userId },
    attempt:                params.attempt,
    httpStatus:             params.httpStatus,
    durationMs:             params.durationMs,
    detail: {
      domain:   params.domain,
      updated:  params.updated,
      locked:   params.locked,
    },
  });
}

// ---------------------------------------------------------------------------
// Read recent log entries for a client (for UI display)
// ---------------------------------------------------------------------------

export async function getRecentProvisioningLog(
  db: Firestore,
  orgId: string,
  clientId: string,
  limit = 20
): Promise<ProvisioningLogEntry[]> {
  const snap = await logCollection(db, orgId, clientId)
    .orderBy('eventAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ProvisioningLogEntry));
}
