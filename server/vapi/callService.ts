// =============================================================================
// MOMENTUM VAPI — OUTBOUND CALL SERVICE
// =============================================================================
// Creates outbound calls via Vapi REST API and tracks them in Firestore.
// Collection: orgs/{orgId}/vapiCalls/{callId}
// =============================================================================

import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID }     from 'crypto';
import { getVapiConfig, isVapiConfigured, VAPI_PATHS } from './config';

// ---------------------------------------------------------------------------
// Create outbound call
// ---------------------------------------------------------------------------

export interface OutboundCallParams {
  db:           Firestore;
  orgId:        string;
  initiatedBy:  string;           // userId
  intent:       string;
  entityType:   'lead' | 'client';
  entityId:     string;
  entityName?:  string;
  phoneNumber:  string;
  assistantId:  string;           // Vapi assistant ID
  metadata?:    Record<string, unknown>;
}

export interface OutboundCallResult {
  success:    boolean;
  callId?:    string;             // Momentum callId (Firestore doc ID)
  vapiCallId?: string;            // Vapi's internal call ID
  error?:     string;
  notConfigured?: boolean;
}

export async function createOutboundCall(params: OutboundCallParams): Promise<OutboundCallResult> {
  const { db, orgId, initiatedBy, intent, entityType, entityId, entityName, phoneNumber, assistantId, metadata } = params;

  if (!isVapiConfigured()) {
    return {
      success: false,
      notConfigured: true,
      error: 'Vapi not configured. Set VAPI_API_KEY and VAPI_PHONE_NUMBER_ID environment secrets.',
    };
  }

  const cfg      = getVapiConfig();
  const callId   = randomUUID();
  const initiatedAt = new Date().toISOString();

  // Write the call record to Firestore first (so it's trackable even if Vapi fails)
  const callRef = db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId);
  await callRef.set({
    callId,
    orgId,
    intent,
    policyMode:    'approval_only',
    entityType,
    entityId,
    entityName:    entityName ?? null,
    phoneNumber,
    assistantId,
    status:        'initiated',
    initiatedAt,
    initiatedBy,
    toolCallCount: 0,
    toolCallLog:   [],
    objections:    [],
    approvalRequired: false,
    metadata:      metadata ?? {},
  });

  // Call Vapi REST API
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  try {
    const payload = {
      phoneNumberId: cfg.phoneNumberId,
      assistantId,
      customer: {
        number: phoneNumber,
        name:   entityName ?? undefined,
      },
      metadata: {
        momentumCallId: callId,
        orgId,
        intent,
        entityType,
        entityId,
        ...metadata,
      },
    };

    const res = await fetch(`${cfg.apiBase}${VAPI_PATHS.calls}`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type':  'application/json',
      },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });

    const body = await res.json().catch(() => ({})) as Record<string, any>;

    if (!res.ok) {
      const errMsg = body?.message || body?.error || `HTTP ${res.status}`;
      await callRef.update({ status: 'failed', failedAt: new Date().toISOString(), failReason: errMsg });
      return { success: false, callId, error: errMsg };
    }

    const vapiCallId: string = body.id ?? body.callId;
    await callRef.update({ vapiCallId, status: 'ringing' });

    return { success: true, callId, vapiCallId };

  } catch (err: any) {
    const errMsg = err.name === 'AbortError' ? 'Request timed out' : (err.message || 'Network error');
    await callRef.update({ status: 'failed', failedAt: new Date().toISOString(), failReason: errMsg });
    return { success: false, callId, error: errMsg };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Update call status from Vapi webhook
// ---------------------------------------------------------------------------

export async function updateCallStatus(params: {
  db:         Firestore;
  orgId:      string;
  callId:     string;
  status:     string;
  durationSeconds?: number;
  endedAt?:   string;
  summary?:   string;
  transcript?: string;
}): Promise<void> {
  const { db, orgId, callId, status, durationSeconds, endedAt, summary, transcript } = params;
  try {
    await db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId).set({
      status,
      durationSeconds:  durationSeconds ?? null,
      endedAt:          endedAt ?? null,
      callSummary:      summary ?? null,
      callTranscript:   transcript ?? null,
      lastUpdatedAt:    new Date().toISOString(),
    }, { merge: true });
  } catch { /* ignore update failures */ }
}

// ---------------------------------------------------------------------------
// List recent calls for an org
// ---------------------------------------------------------------------------

export async function listRecentCalls(params: {
  db:    Firestore;
  orgId: string;
  limit?: number;
}): Promise<unknown[]> {
  const { db, orgId, limit = 50 } = params;
  try {
    const snap = await db.collection('orgs').doc(orgId).collection('vapiCalls')
      .orderBy('initiatedAt', 'desc').limit(limit).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}
