// =============================================================================
// ERICA CALLING SYSTEM — BATCH SERVICE (SERVER-SIDE)
// =============================================================================
// Manages EricaCallBatch lifecycle in Firestore.
// Handles: create, update, item management, validation, Vapi call launch.
//
// Firestore paths:
//   orgs/{orgId}/ericaBatches/{batchId}
//   orgs/{orgId}/ericaBriefs/{briefId}
//   orgs/{orgId}/ericaCallResults/{resultId}
// =============================================================================

import { firestore } from '../firebase';
import { v4 as uuid } from 'uuid';
import type {
  EricaCallBatch,
  EricaCallBatchItem,
  EricaCallResult,
  EricaCallBatchStatus,
  EricaCallItemStatus,
  EricaCallTarget,
  EricaCallContext,
} from '../../client/src/lib/ericaTypes';

const db = firestore;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function batchRef(orgId: string, batchId: string) {
  return db!.collection('orgs').doc(orgId).collection('ericaBatches').doc(batchId);
}

function briefRef(orgId: string, briefId: string) {
  return db!.collection('orgs').doc(orgId).collection('ericaBriefs').doc(briefId);
}

function resultRef(orgId: string, resultId: string) {
  return db!.collection('orgs').doc(orgId).collection('ericaCallResults').doc(resultId);
}

// ---------------------------------------------------------------------------
// Create a new empty batch
// ---------------------------------------------------------------------------

export async function createBatch(params: {
  orgId:       string;
  name:        string;
  description?: string;
  createdBy:   string;
}): Promise<EricaCallBatch> {
  if (!db) throw new Error('Firestore not initialised');

  const batchId = uuid();
  const now     = new Date().toISOString();

  const batch: EricaCallBatch = {
    batchId,
    orgId:          params.orgId,
    name:           params.name,
    description:    params.description,
    status:         'draft',
    items:          [],
    totalTargets:   0,
    completedCalls: 0,
    bookedCalls:    0,
    failedCalls:    0,
    skippedCalls:   0,
    createdBy:      params.createdBy,
    createdAt:      now,
    lastActiveAt:   now,
  };

  await batchRef(params.orgId, batchId).set(batch);
  return batch;
}

// ---------------------------------------------------------------------------
// Get a batch
// ---------------------------------------------------------------------------

export async function getBatch(orgId: string, batchId: string): Promise<EricaCallBatch | null> {
  if (!db) throw new Error('Firestore not initialised');
  const snap = await batchRef(orgId, batchId).get();
  if (!snap.exists) return null;
  return snap.data() as EricaCallBatch;
}

// ---------------------------------------------------------------------------
// List batches for org
// ---------------------------------------------------------------------------

export async function listBatches(orgId: string): Promise<EricaCallBatch[]> {
  if (!db) throw new Error('Firestore not initialised');
  const snap = await db.collection('orgs').doc(orgId).collection('ericaBatches')
    .orderBy('createdAt', 'desc').limit(50).get();
  return snap.docs.map(d => d.data() as EricaCallBatch);
}

// ---------------------------------------------------------------------------
// Add items to a batch
// ---------------------------------------------------------------------------

export async function addItemsToBatch(params: {
  orgId:   string;
  batchId: string;
  targets: Array<{ target: EricaCallTarget; context: EricaCallContext }>;
}): Promise<EricaCallBatchItem[]> {
  if (!db) throw new Error('Firestore not initialised');

  const snap = await batchRef(params.orgId, params.batchId).get();
  if (!snap.exists) throw new Error('Batch not found');

  const existing = (snap.data() as EricaCallBatch).items ?? [];
  const now      = new Date().toISOString();

  const newItems: EricaCallBatchItem[] = params.targets.map((t, idx) => ({
    itemId:      uuid(),
    batchId:     params.batchId,
    target:      t.target,
    context:     t.context,
    status:      'pending' as EricaCallItemStatus,
    priority:    existing.length + idx + 1,
    briefStatus: 'not_generated' as const,
    addedAt:     now,
    warnings:    [],
  }));

  const allItems = [...existing, ...newItems];

  await batchRef(params.orgId, params.batchId).update({
    items:        allItems,
    totalTargets: allItems.length,
    lastActiveAt: now,
  });

  return newItems;
}

// ---------------------------------------------------------------------------
// Remove an item from a batch
// ---------------------------------------------------------------------------

export async function removeItemFromBatch(orgId: string, batchId: string, itemId: string): Promise<void> {
  if (!db) throw new Error('Firestore not initialised');
  const snap = await batchRef(orgId, batchId).get();
  if (!snap.exists) return;

  const data   = snap.data() as EricaCallBatch;
  const items  = (data.items ?? []).filter((i: EricaCallBatchItem) => i.itemId !== itemId);

  await batchRef(orgId, batchId).update({
    items,
    totalTargets: items.length,
    lastActiveAt: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Reorder items in a batch
// ---------------------------------------------------------------------------

export async function reorderBatchItems(orgId: string, batchId: string, orderedItemIds: string[]): Promise<void> {
  if (!db) throw new Error('Firestore not initialised');
  const snap = await batchRef(orgId, batchId).get();
  if (!snap.exists) return;

  const data = snap.data() as EricaCallBatch;
  const map  = new Map((data.items ?? []).map((i: EricaCallBatchItem) => [i.itemId, i]));

  const reordered = orderedItemIds
    .map((id, idx) => {
      const item = map.get(id);
      return item ? { ...item, priority: idx + 1 } : null;
    })
    .filter(Boolean) as EricaCallBatchItem[];

  await batchRef(orgId, batchId).update({ items: reordered });
}

// ---------------------------------------------------------------------------
// Attach a generated brief to a batch item
// ---------------------------------------------------------------------------

export async function attachBriefToItem(params: {
  orgId:    string;
  batchId:  string;
  itemId:   string;
  brief:    Record<string, any>;
}): Promise<void> {
  if (!db) throw new Error('Firestore not initialised');

  const snap = await batchRef(params.orgId, params.batchId).get();
  if (!snap.exists) return;

  const data  = snap.data() as EricaCallBatch;
  const items = (data.items ?? []).map((item: EricaCallBatchItem) => {
    if (item.itemId !== params.itemId) return item;
    return { ...item, brief: params.brief, briefStatus: 'ready', status: 'brief_ready' };
  });

  await batchRef(params.orgId, params.batchId).update({
    items,
    lastActiveAt: new Date().toISOString(),
  });

  // Also store separately for inspection
  if (params.brief.briefId) {
    await briefRef(params.orgId, params.brief.briefId).set(params.brief);
  }
}

// ---------------------------------------------------------------------------
// Update batch status
// ---------------------------------------------------------------------------

export async function updateBatchStatus(
  orgId:   string,
  batchId: string,
  status:  EricaCallBatchStatus,
  extra:   Record<string, any> = {},
): Promise<void> {
  if (!db) throw new Error('Firestore not initialised');
  const update: Record<string, any> = { status, lastActiveAt: new Date().toISOString(), ...extra };
  if (status === 'active' && !extra.launchedAt) update.launchedAt = new Date().toISOString();
  if (status === 'completed') update.completedAt = new Date().toISOString();
  await batchRef(orgId, batchId).update(update);
}

// ---------------------------------------------------------------------------
// Update a single batch item status
// ---------------------------------------------------------------------------

export async function updateItemStatus(params: {
  orgId:         string;
  batchId:       string;
  itemId:        string;
  status:        EricaCallItemStatus;
  callId?:       string;
  vapiCallId?:   string;
  completedAt?:  string;
}): Promise<void> {
  if (!db) throw new Error('Firestore not initialised');

  const snap = await batchRef(params.orgId, params.batchId).get();
  if (!snap.exists) return;

  const data  = snap.data() as EricaCallBatch;
  const items = (data.items ?? []).map((item: EricaCallBatchItem) => {
    if (item.itemId !== params.itemId) return item;
    return {
      ...item,
      status:       params.status,
      callId:       params.callId ?? item.callId,
      vapiCallId:   params.vapiCallId ?? item.vapiCallId,
      calledAt:     params.status === 'calling'   ? new Date().toISOString() : item.calledAt,
      completedAt:  params.status === 'completed' ? (params.completedAt ?? new Date().toISOString()) : item.completedAt,
    };
  });

  // Recompute counters
  const completed = items.filter((i: EricaCallBatchItem) => i.status === 'completed').length;
  const skipped   = items.filter((i: EricaCallBatchItem) => i.status === 'skipped').length;
  const failed    = items.filter((i: EricaCallBatchItem) => i.status === 'failed').length;
  const booked    = (data.items ?? []).filter((i: EricaCallBatchItem) => i.result?.booked).length;

  await batchRef(params.orgId, params.batchId).update({
    items,
    completedCalls: completed,
    skippedCalls:   skipped,
    failedCalls:    failed,
    bookedCalls:    booked,
    lastActiveAt:   new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Write call result back to batch item
// ---------------------------------------------------------------------------

export async function writeCallResult(params: {
  orgId:    string;
  batchId:  string;
  itemId:   string;
  result:   EricaCallResult;
}): Promise<void> {
  if (!db) throw new Error('Firestore not initialised');

  const snap = await batchRef(params.orgId, params.batchId).get();
  if (!snap.exists) return;

  const data  = snap.data() as EricaCallBatch;
  const items = (data.items ?? []).map((item: EricaCallBatchItem) => {
    if (item.itemId !== params.itemId) return item;
    return { ...item, result: params.result, status: 'completed' as EricaCallItemStatus, completedAt: new Date().toISOString() };
  });

  const booked = items.filter((i: EricaCallBatchItem) => i.result?.booked).length;

  await batchRef(params.orgId, params.batchId).update({
    items,
    bookedCalls:  booked,
    lastActiveAt: new Date().toISOString(),
  });

  // Store result as its own document for reporting
  await resultRef(params.orgId, params.result.resultId).set(params.result);
}

// ---------------------------------------------------------------------------
// Get all results for org (for workspace reporting)
// ---------------------------------------------------------------------------

export async function listCallResults(orgId: string, limit = 50): Promise<EricaCallResult[]> {
  if (!db) throw new Error('Firestore not initialised');
  const snap = await db.collection('orgs').doc(orgId).collection('ericaCallResults')
    .orderBy('recordedAt', 'desc').limit(limit).get();
  return snap.docs.map(d => d.data() as EricaCallResult);
}
