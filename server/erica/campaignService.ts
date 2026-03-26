// =============================================================================
// ERICA CAMPAIGN SERVICE — CRUD + CONTROLS
// =============================================================================
// Creates and manages EricaCallingCampaign records in Firestore.
//
// Campaigns are always built from an existing Erica batch.
// Targets are seeded from batch items — never created autonomously.
// =============================================================================

import { v4 as uuid } from 'uuid';
import { firestore } from '../firebase';
import {
  defaultCampaignWindow,
  defaultThrottleRule,
  emptyOutcome,
} from './campaignTypes';
import type {
  EricaCallingCampaign,
  EricaCampaignTargetState,
  CreateCampaignInput,
  UpdateCampaignInput,
  EricaCampaignOutcome,
} from './campaignTypes';

// ---------------------------------------------------------------------------
// Create campaign from existing batch
// ---------------------------------------------------------------------------

export async function createCampaign(input: CreateCampaignInput): Promise<EricaCallingCampaign> {
  const db = firestore;
  if (!db) throw new Error('Firestore not initialised');

  const { orgId, batchId } = input;

  // Verify batch exists
  const batchSnap = await db.collection('orgs').doc(orgId)
    .collection('ericaBatches').doc(batchId).get();
  if (!batchSnap.exists) {
    throw new Error(`Batch ${batchId} not found — campaign must be created from an existing Erica batch`);
  }
  const batch = batchSnap.data()!;

  const campaignId = uuid();
  const now = new Date().toISOString();

  const schedule = {
    window:   input.schedule?.window   ?? defaultCampaignWindow(),
    throttle: input.schedule?.throttle ?? defaultThrottleRule(),
    type:     input.schedule?.type     ?? 'immediate',
    startAt:  input.schedule?.startAt,
    fromDate: input.schedule?.fromDate,
    toDate:   input.schedule?.toDate,
  };

  const campaign: EricaCallingCampaign = {
    campaignId,
    orgId,
    name:         input.name,
    description:  input.description,
    createdAt:    now,
    createdBy:    input.createdBy,
    updatedAt:    now,
    status:       'draft',
    batchId,
    batchName:    batch.name,
    schedule,
    outcome:      emptyOutcome(),
    callsThisHour: 0,
    callsToday:    0,
    hourBucket:    toHourBucket(now),
    dayBucket:     toDayBucket(now),
  };

  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set(campaign);

  // Seed targets from batch items
  await seedTargetsFromBatch(db, orgId, campaignId, batchId);

  // Refresh outcome counts
  const counts = await recomputeOutcome(db, orgId, campaignId);
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set({ outcome: counts, updatedAt: new Date().toISOString() }, { merge: true });

  return { ...campaign, outcome: counts };
}

// ---------------------------------------------------------------------------
// Seed targets from batch items
// ---------------------------------------------------------------------------

async function seedTargetsFromBatch(
  db:         FirebaseFirestore.Firestore,
  orgId:      string,
  campaignId: string,
  batchId:    string,
): Promise<void> {
  const now = new Date().toISOString();

  // Load batch items
  const batchSnap = await db.collection('orgs').doc(orgId)
    .collection('ericaBatches').doc(batchId).get();
  const batchData = batchSnap.data();
  const items: any[] = batchData?.items ?? [];

  if (items.length === 0) {
    // Try subcollection pattern
    const itemsSnap = await db.collection('orgs').doc(orgId)
      .collection('ericaBatches').doc(batchId)
      .collection('items').get();
    items.push(...itemsSnap.docs.map(d => ({ ...d.data(), id: d.id })));
  }

  const targetCol = db.collection('orgs').doc(orgId)
    .collection('ericaCampaignTargets');

  for (const item of items) {
    const targetId = uuid();
    const target: EricaCampaignTargetState = {
      targetId,
      campaignId,
      orgId,
      batchItemId:  item.itemId ?? item.id ?? targetId,
      batchId,
      entityId:     item.entityId ?? '',
      entityType:   item.entityType ?? 'lead',
      entityName:   item.entityName ?? item.name ?? 'Unknown',
      businessName: item.businessName ?? '',
      phone:        item.phone,
      status:       'queued',
      addedAt:      now,
      retryCount:   0,
    };
    await targetCol.doc(targetId).set(target);
  }
}

// ---------------------------------------------------------------------------
// Schedule campaign (draft → scheduled or running)
// ---------------------------------------------------------------------------

export async function scheduleCampaign(
  orgId:       string,
  campaignId:  string,
  performedBy: string,
): Promise<void> {
  const db = firestore;
  if (!db) throw new Error('Firestore not initialised');

  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId).get();
  if (!snap.exists) throw new Error(`Campaign ${campaignId} not found`);

  const campaign = snap.data() as EricaCallingCampaign;
  if (!['draft', 'paused'].includes(campaign.status)) {
    throw new Error(`Campaign is ${campaign.status} — cannot schedule`);
  }

  const schedule = campaign.schedule;
  const now = new Date();
  let newStatus: EricaCallingCampaign['status'] = 'scheduled';
  let startAt: string | undefined;

  if (schedule.type === 'immediate') {
    newStatus = 'running';
    startAt = now.toISOString();
  } else if (schedule.type === 'scheduled_start' && schedule.startAt) {
    if (new Date(schedule.startAt) <= now) {
      newStatus = 'running';
      startAt = now.toISOString();
    } else {
      startAt = schedule.startAt;
    }
  } else if (schedule.type === 'date_range' && schedule.fromDate) {
    const from = new Date(schedule.fromDate);
    if (from <= now) {
      newStatus = 'running';
      startAt = now.toISOString();
    } else {
      startAt = from.toISOString();
    }
  }

  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set({
      status:    newStatus,
      startedAt: startAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    }, { merge: true });

  await writeCampaignAudit(db, orgId, campaignId, 'scheduled', performedBy,
    `Campaign ${newStatus === 'running' ? 'started immediately' : `scheduled for ${startAt}`}`);
}

// ---------------------------------------------------------------------------
// Pause campaign
// ---------------------------------------------------------------------------

export async function pauseCampaign(
  orgId:       string,
  campaignId:  string,
  reason:      string,
  performedBy: string,
): Promise<void> {
  const db = firestore;
  if (!db) throw new Error('Firestore not initialised');

  const now = new Date().toISOString();
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set({
      status: 'paused',
      pauseState: { pausedAt: now, pausedBy: performedBy, pauseReason: reason },
      updatedAt: now,
    }, { merge: true });

  await writeCampaignAudit(db, orgId, campaignId, 'paused', performedBy, `Paused: ${reason}`);
}

// ---------------------------------------------------------------------------
// Resume campaign
// ---------------------------------------------------------------------------

export async function resumeCampaign(
  orgId:       string,
  campaignId:  string,
  performedBy: string,
): Promise<void> {
  const db = firestore;
  if (!db) throw new Error('Firestore not initialised');

  const now = new Date().toISOString();
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set({
      status:     'running',
      pauseState: null,
      updatedAt:  now,
    }, { merge: true });

  await writeCampaignAudit(db, orgId, campaignId, 'resumed', performedBy, 'Campaign resumed by operator');
}

// ---------------------------------------------------------------------------
// Stop / cancel campaign
// ---------------------------------------------------------------------------

export async function stopCampaign(
  orgId:       string,
  campaignId:  string,
  performedBy: string,
): Promise<void> {
  const db = firestore;
  if (!db) throw new Error('Firestore not initialised');

  const now = new Date().toISOString();
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set({
      status:      'cancelled',
      cancelledAt: now,
      updatedAt:   now,
    }, { merge: true });

  await writeCampaignAudit(db, orgId, campaignId, 'cancelled', performedBy, 'Campaign stopped by operator');
}

// ---------------------------------------------------------------------------
// Skip a target
// ---------------------------------------------------------------------------

export async function skipTarget(
  orgId:       string,
  campaignId:  string,
  targetId:    string,
  reason:      string,
  performedBy: string,
): Promise<void> {
  const db = firestore;
  if (!db) throw new Error('Firestore not initialised');

  const now = new Date().toISOString();
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignTargets').doc(targetId)
    .set({ status: 'skipped', skipReason: reason, updatedAt: now }, { merge: true });

  await refreshCampaignOutcome(db, orgId, campaignId);
  await writeCampaignAudit(db, orgId, campaignId, 'target_skipped', performedBy,
    `Target ${targetId} skipped: ${reason}`);
}

// ---------------------------------------------------------------------------
// Retry a failed target
// ---------------------------------------------------------------------------

export async function retryTarget(
  orgId:       string,
  campaignId:  string,
  targetId:    string,
  performedBy: string,
): Promise<void> {
  const db = firestore;
  if (!db) throw new Error('Firestore not initialised');

  const now = new Date().toISOString();
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignTargets').doc(targetId).get();
  if (!snap.exists) throw new Error(`Target ${targetId} not found`);

  const t = snap.data() as EricaCampaignTargetState;
  await snap.ref.set({
    status:      'retry_queued',
    retryCount:  (t.retryCount ?? 0) + 1,
    lastRetryAt: now,
    failReason:  null,
  }, { merge: true });

  await refreshCampaignOutcome(db, orgId, campaignId);
  await writeCampaignAudit(db, orgId, campaignId, 'target_retry_queued', performedBy,
    `Target ${targetId} queued for retry`);
}

// ---------------------------------------------------------------------------
// Update campaign schedule/name/description
// ---------------------------------------------------------------------------

export async function updateCampaign(
  orgId:       string,
  campaignId:  string,
  updates:     UpdateCampaignInput,
  performedBy: string,
): Promise<void> {
  const db = firestore;
  if (!db) throw new Error('Firestore not initialised');

  const now = new Date().toISOString();
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set({ ...updates, updatedAt: now }, { merge: true });

  await writeCampaignAudit(db, orgId, campaignId, 'updated', performedBy, `Campaign settings updated`);
}

// ---------------------------------------------------------------------------
// List campaigns
// ---------------------------------------------------------------------------

export async function listCampaigns(orgId: string, limit = 50): Promise<EricaCallingCampaign[]> {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ ...d.data() } as EricaCallingCampaign));
}

export async function getCampaign(orgId: string, campaignId: string): Promise<EricaCallingCampaign | null> {
  const db = firestore;
  if (!db) return null;
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId).get();
  if (!snap.exists) return null;
  return snap.data() as EricaCallingCampaign;
}

// ---------------------------------------------------------------------------
// List targets for a campaign
// ---------------------------------------------------------------------------

export async function listCampaignTargets(orgId: string, campaignId: string): Promise<EricaCampaignTargetState[]> {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignTargets')
    .where('campaignId', '==', campaignId)
    .get();
  return snap.docs.map(d => ({ ...d.data() } as EricaCampaignTargetState));
}

// ---------------------------------------------------------------------------
// List campaign run records
// ---------------------------------------------------------------------------

export async function listCampaignRuns(orgId: string, campaignId: string, limit = 50) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignRuns')
    .where('campaignId', '==', campaignId)
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ ...d.data() }));
}

// ---------------------------------------------------------------------------
// List campaign audit
// ---------------------------------------------------------------------------

export async function listCampaignAudit(orgId: string, campaignId: string, limit = 100) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignAudit')
    .where('campaignId', '==', campaignId)
    .orderBy('at', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ ...d.data() }));
}

// ---------------------------------------------------------------------------
// Refresh outcome counters from target states
// ---------------------------------------------------------------------------

export async function refreshCampaignOutcome(
  db:         FirebaseFirestore.Firestore,
  orgId:      string,
  campaignId: string,
): Promise<void> {
  const counts = await recomputeOutcome(db, orgId, campaignId);
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set({ outcome: counts, updatedAt: new Date().toISOString() }, { merge: true });
}

async function recomputeOutcome(
  db:         FirebaseFirestore.Firestore,
  orgId:      string,
  campaignId: string,
): Promise<EricaCampaignOutcome> {
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignTargets')
    .where('campaignId', '==', campaignId)
    .get();

  const targets = snap.docs.map(d => d.data());
  const total   = targets.length;

  let queued = 0, calling = 0, called = 0, booked = 0,
      failed = 0, skipped = 0, suppressed = 0, retryQueued = 0;

  for (const t of targets) {
    switch (t.status) {
      case 'queued':       queued++;      break;
      case 'calling':      calling++;     break;
      case 'called':       called++;      break;
      case 'booked':       booked++;      break;
      case 'failed':       failed++;      break;
      case 'skipped':      skipped++;     break;
      case 'suppressed':   suppressed++;  break;
      case 'retry_queued': retryQueued++; break;
    }
  }

  const contacted    = called + booked;
  const bookingRate  = total > 0 ? booked / total : 0;
  const contactRate  = total > 0 ? contacted / total : 0;

  return {
    total, queued, calling, called, booked,
    noAnswer:       0,
    failed, skipped, suppressed, retryQueued,
    followUpNeeded: 0,
    bookingRate, contactRate,
  };
}

// ---------------------------------------------------------------------------
// Shared: write campaign audit event
// ---------------------------------------------------------------------------

export async function writeCampaignAudit(
  db:         FirebaseFirestore.Firestore,
  orgId:      string,
  campaignId: string,
  eventType:  string,
  performedBy: string,
  note:       string,
  metadata?:  Record<string, any>,
): Promise<void> {
  try {
    const auditId = uuid();
    await db.collection('orgs').doc(orgId)
      .collection('ericaCampaignAudit').doc(auditId)
      .set({ auditId, campaignId, orgId, eventType, note, metadata, performedBy, at: new Date().toISOString() });
  } catch (err: any) {
    console.warn('[campaign] Audit write failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toHourBucket(iso: string): string {
  return iso.slice(0, 13); // e.g. "2026-03-26T09"
}

export function toDayBucket(iso: string): string {
  return iso.slice(0, 10); // e.g. "2026-03-26"
}
