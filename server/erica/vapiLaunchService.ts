// =============================================================================
// ERICA CALLING SYSTEM — VAPI LAUNCH SERVICE
// =============================================================================
// Launches individual Erica calls from batch items via the Vapi REST API.
//
// Responsibilities:
// - Validate batch item is launchable (brief ready, phone present, not blocked)
// - Build the Vapi outbound payload from EricaCallBrief
// - Call Vapi REST API to initiate the call
// - Store launch state on the batch item
// - Mark the batch item as 'calling'
// - Handle Vapi errors gracefully
//
// Does NOT decide who to call — that is always done by the human launching
// the batch from the Erica Workspace.
// =============================================================================

import { randomUUID } from 'crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { getVapiConfig, isVapiConfigured, VAPI_PATHS } from '../vapi/config';
import { firestore } from '../firebase';
import { getBatch, updateItemStatus, attachBriefToItem } from './batchService';
import { buildEricaVapiPayloadWithOrg } from './vapiPayloadBuilder';
import type { EricaCallBatch, EricaCallBatchItem } from '../../client/src/lib/ericaTypes';

// ---------------------------------------------------------------------------
// Launch result
// ---------------------------------------------------------------------------

export interface EricaLaunchResult {
  success:         boolean;
  momentumCallId?: string;
  vapiCallId?:     string;
  error?:          string;
  blockedReason?:  string;
  notConfigured?:  boolean;
}

// ---------------------------------------------------------------------------
// Validate a batch item is safe to call
// ---------------------------------------------------------------------------

function validateForLaunch(item: EricaCallBatchItem): { valid: boolean; reason?: string } {
  if (item.status === 'blocked')    return { valid: false, reason: item.blockedReason ?? 'Item is blocked' };
  if (item.status === 'calling')    return { valid: false, reason: 'Call already in progress' };
  if (item.status === 'completed')  return { valid: false, reason: 'Call already completed' };
  if (item.status === 'skipped')    return { valid: false, reason: 'Item was skipped' };
  if (item.briefStatus !== 'ready') return { valid: false, reason: 'Call brief not ready — generate brief before launching' };
  if (!item.brief)                  return { valid: false, reason: 'No call brief attached' };
  const phone = item.target.phone ?? item.brief?.phone;
  if (!phone)                       return { valid: false, reason: 'No phone number — cannot dial without a phone number' };
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Get the assistant ID for this batch item
// ---------------------------------------------------------------------------

async function resolveAssistantId(db: Firestore, orgId: string, item: EricaCallBatchItem): Promise<string | null> {
  // Check batch-level override first
  // Then check org Vapi config for a matching intent
  try {
    const configSnap = await db.collection('orgs').doc(orgId)
      .collection('vapiConfig').doc('default').get();
    const config = configSnap.data();
    if (!config) return null;

    const intent = item.context?.callIntent;
    const match  = (config.assistants ?? []).find(
      (a: any) => a.intentId === intent && a.enabled
    );
    if (match?.assistantId) return match.assistantId;

    // Fallback: any enabled assistant
    const fallback = (config.assistants ?? []).find((a: any) => a.enabled);
    return fallback?.assistantId ?? config.defaultAssistantId ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core launch function — launch one batch item
// ---------------------------------------------------------------------------

export async function launchEricaBatchItem(params: {
  orgId:       string;
  batchId:     string;
  itemId:      string;
  launchedBy:  string;
}): Promise<EricaLaunchResult> {
  const { orgId, batchId, itemId, launchedBy } = params;
  const db = firestore;

  if (!db) return { success: false, error: 'Firestore not initialised' };

  // ── Config check ─────────────────────────────────────────────────────────
  if (!isVapiConfigured()) {
    return {
      success: false,
      notConfigured: true,
      error: 'Vapi not configured. Set VAPI_API_KEY and VAPI_PHONE_NUMBER_ID in Replit Secrets.',
    };
  }

  // ── Load batch and item ───────────────────────────────────────────────────
  const batch = await getBatch(orgId, batchId);
  if (!batch) return { success: false, error: 'Batch not found' };

  const item = (batch.items ?? []).find((i: EricaCallBatchItem) => i.itemId === itemId);
  if (!item) return { success: false, error: 'Batch item not found' };

  // ── Validate ──────────────────────────────────────────────────────────────
  const validation = validateForLaunch(item);
  if (!validation.valid) {
    return { success: false, blockedReason: validation.reason, error: validation.reason };
  }

  // ── Resolve assistant ─────────────────────────────────────────────────────
  const assistantId = await resolveAssistantId(db, orgId, item);
  if (!assistantId) {
    return {
      success: false,
      error: 'No Vapi assistant configured for this call intent. Configure an assistant in the Vapi Workspace.',
    };
  }

  const cfg            = getVapiConfig();
  const momentumCallId = randomUUID();
  const brief          = item.brief!;

  // ── Build Vapi payload ────────────────────────────────────────────────────
  let payload: Record<string, any>;
  try {
    payload = buildEricaVapiPayloadWithOrg({
      momentumCallId,
      batchId,
      batchItemId: itemId,
      assistantId,
      orgId,
      brief,
    });
  } catch (err: any) {
    return { success: false, error: `Payload build failed: ${err.message}` };
  }

  // ── Write launch record to Firestore (before calling Vapi) ───────────────
  const callRef = db.collection('orgs').doc(orgId).collection('vapiCalls').doc(momentumCallId);
  await callRef.set({
    callId:        momentumCallId,
    orgId,
    batchId,
    batchItemId:   itemId,
    briefId:       brief.briefId,
    intent:        item.context?.callIntent,
    entityType:    item.target.entityType,
    entityId:      item.target.entityId,
    entityName:    item.target.entityName,
    businessName:  item.target.businessName,
    phoneNumber:   brief.phone,
    assistantId,
    status:        'launching',
    launchedAt:    new Date().toISOString(),
    launchedBy,
    policyMode:    'approval_only',
    toolCallCount: 0,
    toolCallLog:   [],
    objections:    [],
    approvalRequired: false,
    metadata:      payload.metadata,
  });

  // ── Mark batch item as launching ──────────────────────────────────────────
  await updateItemStatus({
    orgId, batchId, itemId,
    status:    'calling',
    callId:    momentumCallId,
  });

  // ── Hit Vapi REST API ─────────────────────────────────────────────────────
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), cfg.requestTimeoutMs ?? 15000);

  try {
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
      const errMsg = body?.message ?? body?.error ?? `HTTP ${res.status}`;
      await callRef.update({ status: 'failed', failedAt: new Date().toISOString(), failReason: errMsg });
      await updateItemStatus({ orgId, batchId, itemId, status: 'failed' });
      return { success: false, momentumCallId, error: errMsg };
    }

    const vapiCallId: string = body.id ?? body.callId;
    await callRef.update({ vapiCallId, status: 'ringing' });

    // Store vapiCallId on batch item for webhook reconciliation
    await updateItemStatus({ orgId, batchId, itemId, status: 'calling', callId: momentumCallId, vapiCallId });

    console.log(`[erica-launch] Call launched: momentumCallId=${momentumCallId} vapiCallId=${vapiCallId} target=${item.target.businessName}`);
    return { success: true, momentumCallId, vapiCallId };

  } catch (err: any) {
    const errMsg = err.name === 'AbortError' ? 'Vapi request timed out' : (err.message ?? 'Network error');
    await callRef.update({ status: 'failed', failedAt: new Date().toISOString(), failReason: errMsg });
    await updateItemStatus({ orgId, batchId, itemId, status: 'failed' });
    return { success: false, momentumCallId, error: errMsg };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Launch the next eligible item in a batch
// ---------------------------------------------------------------------------

export async function launchNextBatchItem(params: {
  orgId:      string;
  batchId:    string;
  launchedBy: string;
}): Promise<{ launched: boolean; result?: EricaLaunchResult; itemId?: string; done?: boolean }> {
  const db = firestore;
  if (!db) return { launched: false };

  const batch = await getBatch(params.orgId, params.batchId);
  if (!batch) return { launched: false };

  // Find the next pending item by priority
  const next = (batch.items ?? [])
    .filter((i: EricaCallBatchItem) => i.status === 'brief_ready' || i.status === 'pending')
    .sort((a: EricaCallBatchItem, b: EricaCallBatchItem) => a.priority - b.priority)[0];

  if (!next) {
    // All items done — mark batch complete
    await db.collection('orgs').doc(params.orgId).collection('ericaBatches').doc(params.batchId)
      .update({ status: 'completed', completedAt: new Date().toISOString() });
    return { launched: false, done: true };
  }

  const result = await launchEricaBatchItem({
    orgId:      params.orgId,
    batchId:    params.batchId,
    itemId:     next.itemId,
    launchedBy: params.launchedBy,
  });

  return { launched: result.success, result, itemId: next.itemId };
}
