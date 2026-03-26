// =============================================================================
// ERICA CALLING SYSTEM — API ROUTER
// =============================================================================
// Auth-protected routes for the Erica Calling Workspace.
// All routes require Firebase auth via verifyFirebaseToken middleware.
//
// GET  /api/erica/orgs/:orgId/batches
// POST /api/erica/orgs/:orgId/batches
// GET  /api/erica/orgs/:orgId/batches/:batchId
// PATCH /api/erica/orgs/:orgId/batches/:batchId
// POST /api/erica/orgs/:orgId/batches/:batchId/items
// DELETE /api/erica/orgs/:orgId/batches/:batchId/items/:itemId
// POST /api/erica/orgs/:orgId/batches/:batchId/items/:itemId/brief
// POST /api/erica/orgs/:orgId/batches/:batchId/launch
// POST /api/erica/orgs/:orgId/batches/:batchId/pause
// POST /api/erica/orgs/:orgId/batches/:batchId/cancel
// POST /api/erica/orgs/:orgId/batches/:batchId/items/:itemId/skip
// POST /api/erica/orgs/:orgId/batches/:batchId/items/:itemId/result
// GET  /api/erica/orgs/:orgId/results
// =============================================================================

import { Router, Request, Response } from 'express';
import { verifyFirebaseToken } from '../middleware/auth';
import {
  createBatch,
  getBatch,
  listBatches,
  addItemsToBatch,
  removeItemFromBatch,
  reorderBatchItems,
  attachBriefToItem,
  updateBatchStatus,
  updateItemStatus,
  writeCallResult,
  listCallResults,
} from './batchService';
import { launchEricaBatchItem, launchNextBatchItem } from './vapiLaunchService';
import { buildRuntimePacket, DEFAULT_ASSISTANT_PROFILE } from './runtimePacketBuilder';
import type { EricaRuntimeConfig } from './ericaRuntimeTypes';
import { firestore } from '../firebase';
import { getProviderState } from './calendarProvider';
import {
  listConfirmedBookings,
  listBookingRequests,
  listBookingAudit,
  convertBookingRequest,
} from './bookingService';
import { listAvailabilityWindows, checkAvailability } from './availabilityService';
import type {
  EricaBookingSlot,
  CheckAvailabilityToolPayload,
} from './bookingTypes';
import { listConfirmations, getConfirmationForBooking, getChannelProviderState } from './bookingConfirmationService';
import { listReminderSchedules, listReminders, getScheduleForBooking, processDueReminders } from './bookingReminderService';
import { listCommEvents, listStatusHistory } from './bookingStatusService';
import { checkRescheduleAvailability, confirmReschedule, listRescheduleChanges, listAllBookingChanges, listChangeAudit } from './rescheduleService';
import { cancelBooking, listCancellationChanges } from './cancellationService';
import type { RequestRescheduleToolPayload, ConfirmRescheduleToolPayload, RequestCancellationToolPayload } from './bookingChangeTypes';
import {
  createCampaign, getCampaign, listCampaigns, updateCampaign,
  scheduleCampaign, pauseCampaign, resumeCampaign, stopCampaign,
  skipTarget, retryTarget, listCampaignTargets, listCampaignRuns, listCampaignAudit,
} from './campaignService';
import { runCampaignCycle, computeCampaignHealth } from './campaignRunner';

export const ericaRouter = Router();

// All Erica routes require auth
ericaRouter.use(verifyFirebaseToken as any);

// ---------------------------------------------------------------------------
// Batch CRUD
// ---------------------------------------------------------------------------

ericaRouter.get('/orgs/:orgId/batches', async (req: Request, res: Response) => {
  try {
    const batches = await listBatches(req.params.orgId);
    res.json({ batches });
  } catch (err: any) {
    console.error('[erica] listBatches error:', err);
    res.status(500).json({ error: err.message });
  }
});

ericaRouter.post('/orgs/:orgId/batches', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const user  = (req as any).user;
    const batch = await createBatch({
      orgId:       req.params.orgId,
      name,
      description,
      createdBy:   user?.uid ?? 'unknown',
    });
    res.status(201).json({ batch });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

ericaRouter.get('/orgs/:orgId/batches/:batchId', async (req: Request, res: Response) => {
  try {
    const batch = await getBatch(req.params.orgId, req.params.batchId);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json({ batch });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

ericaRouter.patch('/orgs/:orgId/batches/:batchId', async (req: Request, res: Response) => {
  try {
    const { status, orderedItemIds, ...extra } = req.body;
    if (status) await updateBatchStatus(req.params.orgId, req.params.batchId, status, extra);
    if (orderedItemIds) await reorderBatchItems(req.params.orgId, req.params.batchId, orderedItemIds);
    const batch = await getBatch(req.params.orgId, req.params.batchId);
    res.json({ batch });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Item management
// ---------------------------------------------------------------------------

ericaRouter.post('/orgs/:orgId/batches/:batchId/items', async (req: Request, res: Response) => {
  try {
    const { targets } = req.body;
    if (!Array.isArray(targets) || targets.length === 0)
      return res.status(400).json({ error: 'targets array is required' });
    const items = await addItemsToBatch({
      orgId:   req.params.orgId,
      batchId: req.params.batchId,
      targets,
    });
    res.status(201).json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

ericaRouter.delete('/orgs/:orgId/batches/:batchId/items/:itemId', async (req: Request, res: Response) => {
  try {
    await removeItemFromBatch(req.params.orgId, req.params.batchId, req.params.itemId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Brief generation (server triggers generation, returns brief for attachment)
// ---------------------------------------------------------------------------

ericaRouter.post('/orgs/:orgId/batches/:batchId/items/:itemId/brief', async (req: Request, res: Response) => {
  try {
    const { brief } = req.body;
    if (!brief) return res.status(400).json({ error: 'brief is required' });
    await attachBriefToItem({
      orgId:   req.params.orgId,
      batchId: req.params.batchId,
      itemId:  req.params.itemId,
      brief,
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Batch control: launch / pause / cancel
// ---------------------------------------------------------------------------

ericaRouter.post('/orgs/:orgId/batches/:batchId/launch', async (req: Request, res: Response) => {
  try {
    const batch = await getBatch(req.params.orgId, req.params.batchId);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    // Guardrail: only launch from ready/paused state
    if (!['ready', 'paused', 'draft'].includes(batch.status)) {
      return res.status(400).json({ error: `Cannot launch batch in status: ${batch.status}` });
    }

    // Guardrail: at least one ready item with a phone number
    const launchable = batch.items.filter(
      i => i.briefStatus === 'ready' && (i.target.phone ?? i.brief?.phone)
    );
    if (launchable.length === 0) {
      return res.status(400).json({ error: 'No callable items — ensure all items have a brief and phone number' });
    }

    await updateBatchStatus(req.params.orgId, req.params.batchId, 'active', {
      launchedAt:    new Date().toISOString(),
      currentItemId: launchable[0].itemId,
    });

    const updated = await getBatch(req.params.orgId, req.params.batchId);
    res.json({ batch: updated, launchableCount: launchable.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

ericaRouter.post('/orgs/:orgId/batches/:batchId/pause', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    await updateBatchStatus(req.params.orgId, req.params.batchId, 'paused', { pausedReason: reason ?? 'Paused by operator' });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

ericaRouter.post('/orgs/:orgId/batches/:batchId/cancel', async (req: Request, res: Response) => {
  try {
    await updateBatchStatus(req.params.orgId, req.params.batchId, 'cancelled');
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Item-level controls: skip / result
// ---------------------------------------------------------------------------

ericaRouter.post('/orgs/:orgId/batches/:batchId/items/:itemId/skip', async (req: Request, res: Response) => {
  try {
    await updateItemStatus({
      orgId:   req.params.orgId,
      batchId: req.params.batchId,
      itemId:  req.params.itemId,
      status:  'skipped',
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

ericaRouter.post('/orgs/:orgId/batches/:batchId/items/:itemId/result', async (req: Request, res: Response) => {
  try {
    const { result } = req.body;
    if (!result) return res.status(400).json({ error: 'result is required' });
    await writeCallResult({
      orgId:   req.params.orgId,
      batchId: req.params.batchId,
      itemId:  req.params.itemId,
      result,
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Results reporting
// ---------------------------------------------------------------------------

ericaRouter.get('/orgs/:orgId/results', async (req: Request, res: Response) => {
  try {
    const results = await listCallResults(req.params.orgId);
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// ERICA VAPI EXECUTION — Item-level call launch
// POST /api/erica/orgs/:orgId/batches/:batchId/items/:itemId/launch-call
// ---------------------------------------------------------------------------

ericaRouter.post('/orgs/:orgId/batches/:batchId/items/:itemId/launch-call', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await launchEricaBatchItem({
      orgId:      req.params.orgId,
      batchId:    req.params.batchId,
      itemId:     req.params.itemId,
      launchedBy: user?.uid ?? 'unknown',
    });

    if (!result.success) {
      return res.status(result.notConfigured ? 503 : 400).json({
        error:         result.error,
        blockedReason: result.blockedReason,
        notConfigured: result.notConfigured ?? false,
      });
    }

    res.json({
      success:        true,
      momentumCallId: result.momentumCallId,
      vapiCallId:     result.vapiCallId,
    });
  } catch (err: any) {
    console.error('[erica-router] launch-call error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Launch the next eligible item in the batch
// POST /api/erica/orgs/:orgId/batches/:batchId/launch-next
// ---------------------------------------------------------------------------

ericaRouter.post('/orgs/:orgId/batches/:batchId/launch-next', async (req: Request, res: Response) => {
  try {
    const user   = (req as any).user;
    const result = await launchNextBatchItem({
      orgId:      req.params.orgId,
      batchId:    req.params.batchId,
      launchedBy: user?.uid ?? 'unknown',
    });

    if (result.done) {
      return res.json({ done: true, message: 'All batch items have been processed' });
    }
    if (!result.launched) {
      return res.status(400).json({ error: result.result?.error ?? 'No eligible items to launch' });
    }

    res.json({
      launched:       true,
      itemId:         result.itemId,
      momentumCallId: result.result?.momentumCallId,
      vapiCallId:     result.result?.vapiCallId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Live call state — fetch vapiCalls for an org (Erica execution workspace)
// GET /api/erica/orgs/:orgId/calls
// ---------------------------------------------------------------------------

ericaRouter.get('/orgs/:orgId/calls', async (req: Request, res: Response) => {
  try {
    const db = firestore;
    if (!db) return res.status(500).json({ error: 'Firestore not initialised' });
    const limit = parseInt(req.query.limit as string ?? '50');
    const snap = await db.collection('orgs').doc(req.params.orgId)
      .collection('vapiCalls')
      .orderBy('launchedAt', 'desc')
      .limit(Math.min(limit, 100))
      .get();
    const calls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ calls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Event audit log — inspection / debugging
// GET /api/erica/orgs/:orgId/events
// ---------------------------------------------------------------------------

ericaRouter.get('/orgs/:orgId/events', async (req: Request, res: Response) => {
  try {
    const db = firestore;
    if (!db) return res.status(500).json({ error: 'Firestore not initialised' });
    const snap = await db.collection('orgs').doc(req.params.orgId)
      .collection('ericaEventAudit')
      .orderBy('receivedAt', 'desc')
      .limit(100)
      .get();
    const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Brief inspection — fetch full brief for a call
// GET /api/erica/orgs/:orgId/briefs/:briefId
// ---------------------------------------------------------------------------

ericaRouter.get('/orgs/:orgId/briefs/:briefId', async (req: Request, res: Response) => {
  try {
    const db = firestore;
    if (!db) return res.status(500).json({ error: 'Firestore not initialised' });
    const snap = await db.collection('orgs').doc(req.params.orgId)
      .collection('ericaBriefs').doc(req.params.briefId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Brief not found' });
    res.json({ brief: snap.data() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================================
// RUNTIME CONFIG — org-level Erica behaviour settings
// ===========================================================================

// GET  /api/erica/orgs/:orgId/runtime-config
ericaRouter.get('/orgs/:orgId/runtime-config', async (req: Request, res: Response) => {
  try {
    const db = firestore;
    if (!db) return res.status(500).json({ error: 'Firestore not initialised' });
    const snap = await db.collection('orgs').doc(req.params.orgId)
      .collection('ericaConfig').doc('runtime').get();

    const defaults: Partial<EricaRuntimeConfig> = {
      objectionHandlingMode:  'non_pushy',
      closeAggressiveness:    'standard',
      genericFallbackAllowed: false,
      assistantProfile:       DEFAULT_ASSISTANT_PROFILE,
      safetyToggles: {
        requireBriefBeforeLaunch: true,
        blockCallWithoutPhone:    true,
        blockCallWithoutBrief:    true,
      },
    };

    res.json({ config: snap.exists ? { ...defaults, ...snap.data() } : defaults });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/erica/orgs/:orgId/runtime-config
ericaRouter.patch('/orgs/:orgId/runtime-config', async (req: Request, res: Response) => {
  try {
    const db   = firestore;
    if (!db) return res.status(500).json({ error: 'Firestore not initialised' });
    const user = (req as any).user;

    const allowedKeys: (keyof EricaRuntimeConfig)[] = [
      'objectionHandlingMode', 'closeAggressiveness', 'genericFallbackAllowed',
      'assistantProfile', 'openingStyleOverrides', 'safetyToggles',
    ];

    const updates: Record<string, any> = { updatedAt: new Date().toISOString(), updatedBy: user?.uid ?? 'unknown' };
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    await db.collection('orgs').doc(req.params.orgId)
      .collection('ericaConfig').doc('runtime')
      .set(updates, { merge: true });

    res.json({ ok: true, updates });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===========================================================================
// RUNTIME PACKET PREVIEW — build the runtime packet for a brief on-demand
// (used by the Inspect tab in EricaWorkspace for operator inspection)
// ===========================================================================

// POST /api/erica/orgs/:orgId/briefs/:briefId/preview-packet
ericaRouter.post('/orgs/:orgId/briefs/:briefId/preview-packet', async (req: Request, res: Response) => {
  try {
    const db = firestore;
    if (!db) return res.status(500).json({ error: 'Firestore not initialised' });

    // Load brief
    const briefSnap = await db.collection('orgs').doc(req.params.orgId)
      .collection('ericaBriefs').doc(req.params.briefId).get();
    if (!briefSnap.exists) return res.status(404).json({ error: 'Brief not found' });

    // Load runtime config
    const cfgSnap = await db.collection('orgs').doc(req.params.orgId)
      .collection('ericaConfig').doc('runtime').get();
    const runtimeConfig: Partial<EricaRuntimeConfig> = cfgSnap.exists ? cfgSnap.data() as any : {};

    const brief = briefSnap.data() as any;
    const packet = buildRuntimePacket(brief, runtimeConfig);

    // Store the packet for later inspection
    await db.collection('orgs').doc(req.params.orgId)
      .collection('ericaRuntimePackets').doc(packet.packetId)
      .set({ ...packet, storedAt: new Date().toISOString(), previewOnly: true });

    res.json({ packet });
  } catch (err: any) {
    console.error('[erica-router] preview-packet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/runtime-packets
ericaRouter.get('/orgs/:orgId/runtime-packets', async (req: Request, res: Response) => {
  try {
    const db = firestore;
    if (!db) return res.status(500).json({ error: 'Firestore not initialised' });
    const snap = await db.collection('orgs').doc(req.params.orgId)
      .collection('ericaRuntimePackets')
      .orderBy('generatedAt', 'desc')
      .limit(20)
      .get();
    const packets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ packets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// BOOKING ENDPOINTS
// =============================================================================

// GET /api/erica/orgs/:orgId/bookings/provider-state
ericaRouter.get('/orgs/:orgId/bookings/provider-state', async (_req: Request, res: Response) => {
  try {
    const state = getProviderState();
    res.json({ providerState: state });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/bookings
ericaRouter.get('/orgs/:orgId/bookings', async (req: Request, res: Response) => {
  try {
    const bookings = await listConfirmedBookings(req.params.orgId, Number(req.query.limit ?? 50));
    res.json({ bookings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/booking-requests
ericaRouter.get('/orgs/:orgId/booking-requests', async (req: Request, res: Response) => {
  try {
    const requests = await listBookingRequests(req.params.orgId, Number(req.query.limit ?? 50));
    res.json({ requests });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/availability-windows
ericaRouter.get('/orgs/:orgId/availability-windows', async (req: Request, res: Response) => {
  try {
    const windows = await listAvailabilityWindows(req.params.orgId, Number(req.query.limit ?? 20));
    res.json({ windows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/booking-audit
ericaRouter.get('/orgs/:orgId/booking-audit', async (req: Request, res: Response) => {
  try {
    const entries = await listBookingAudit(req.params.orgId, Number(req.query.limit ?? 100));
    res.json({ entries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/erica/orgs/:orgId/booking-requests/:requestId/convert
ericaRouter.post('/orgs/:orgId/booking-requests/:requestId/convert', async (req: Request, res: Response) => {
  try {
    const { slot, format, performedBy } = req.body;
    if (!slot || !format) return res.status(400).json({ error: 'slot and format required' });
    const outcome = await convertBookingRequest(
      req.params.orgId,
      req.params.requestId,
      slot as EricaBookingSlot,
      format,
      performedBy ?? 'operator',
    );
    res.json({ outcome });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/erica/orgs/:orgId/bookings/check-availability
ericaRouter.post('/orgs/:orgId/bookings/check-availability', async (req: Request, res: Response) => {
  try {
    const payload: CheckAvailabilityToolPayload = {
      entityId:        req.body.entityId ?? '',
      entityType:      req.body.entityType ?? 'lead',
      callId:          req.body.callId,
      durationMinutes: Number(req.body.durationMinutes ?? 30),
      preferenceTime:  req.body.preferenceTime ?? 'any',
      timezone:        req.body.timezone ?? 'Australia/Sydney',
      lookAheadDays:   Number(req.body.lookAheadDays ?? 7),
    };
    const result = await checkAvailability(req.params.orgId, payload);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// CONFIRMATION + REMINDER COMMUNICATION ENDPOINTS
// =============================================================================

// GET /api/erica/orgs/:orgId/comm/channel-state
ericaRouter.get('/orgs/:orgId/comm/channel-state', async (_req: Request, res: Response) => {
  try {
    res.json({ channelState: getChannelProviderState() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/comm/confirmations
ericaRouter.get('/orgs/:orgId/comm/confirmations', async (req: Request, res: Response) => {
  try {
    const items = await listConfirmations(req.params.orgId, Number(req.query.limit ?? 50));
    res.json({ confirmations: items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/comm/confirmations/booking/:bookingId
ericaRouter.get('/orgs/:orgId/comm/confirmations/booking/:bookingId', async (req: Request, res: Response) => {
  try {
    const confirmation = await getConfirmationForBooking(req.params.orgId, req.params.bookingId);
    res.json({ confirmation });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/comm/reminders
ericaRouter.get('/orgs/:orgId/comm/reminders', async (req: Request, res: Response) => {
  try {
    const reminders = await listReminders(req.params.orgId, Number(req.query.limit ?? 50));
    res.json({ reminders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/comm/reminder-schedules
ericaRouter.get('/orgs/:orgId/comm/reminder-schedules', async (req: Request, res: Response) => {
  try {
    const schedules = await listReminderSchedules(req.params.orgId, Number(req.query.limit ?? 20));
    res.json({ schedules });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/comm/reminder-schedules/booking/:bookingId
ericaRouter.get('/orgs/:orgId/comm/reminder-schedules/booking/:bookingId', async (req: Request, res: Response) => {
  try {
    const schedule = await getScheduleForBooking(req.params.orgId, req.params.bookingId);
    res.json({ schedule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/comm/events
ericaRouter.get('/orgs/:orgId/comm/events', async (req: Request, res: Response) => {
  try {
    const events = await listCommEvents(req.params.orgId, Number(req.query.limit ?? 100));
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/comm/status-history
ericaRouter.get('/orgs/:orgId/comm/status-history', async (req: Request, res: Response) => {
  try {
    const history = await listStatusHistory(req.params.orgId, Number(req.query.limit ?? 100));
    res.json({ history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/erica/orgs/:orgId/comm/process-due-reminders
// Trigger: scheduler or manual operator action
ericaRouter.post('/orgs/:orgId/comm/process-due-reminders', async (req: Request, res: Response) => {
  try {
    const result = await processDueReminders(req.params.orgId);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// RESCHEDULE + CANCEL ENDPOINTS
// =============================================================================

// GET /api/erica/orgs/:orgId/booking-changes
ericaRouter.get('/orgs/:orgId/booking-changes', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const changes = await listAllBookingChanges(req.params.orgId, 100);
    res.json({ changes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/booking-changes/reschedule
ericaRouter.get('/orgs/:orgId/booking-changes/reschedule', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const changes = await listRescheduleChanges(req.params.orgId, 100);
    res.json({ changes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/booking-changes/cancellation
ericaRouter.get('/orgs/:orgId/booking-changes/cancellation', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const changes = await listCancellationChanges(req.params.orgId, 100);
    res.json({ changes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/erica/orgs/:orgId/booking-changes/audit
ericaRouter.get('/orgs/:orgId/booking-changes/audit', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const entries = await listChangeAudit(req.params.orgId, 200);
    res.json({ entries });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/erica/orgs/:orgId/bookings/:bookingId/check-reschedule
ericaRouter.post('/orgs/:orgId/bookings/:bookingId/check-reschedule', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const { orgId, bookingId } = req.params;
    const body = req.body;
    const payload: RequestRescheduleToolPayload = {
      bookingId,
      entityId:        body.entityId ?? '',
      entityType:      body.entityType ?? 'lead',
      reason:          body.reason ?? 'operator_requested',
      reasonNote:      body.reasonNote,
      preferenceTime:  body.preferenceTime ?? 'any',
      timezone:        body.timezone ?? 'Australia/Sydney',
      lookAheadDays:   Number(body.lookAheadDays ?? 7),
      durationMinutes: Number(body.durationMinutes ?? 30),
    };
    const outcome = await checkRescheduleAvailability(orgId, payload, body.performedBy ?? 'operator');
    res.json({ outcome });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/erica/orgs/:orgId/bookings/:bookingId/confirm-reschedule
ericaRouter.post('/orgs/:orgId/bookings/:bookingId/confirm-reschedule', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const { orgId, bookingId } = req.params;
    const body = req.body;
    if (!body.changeId || !body.slotId || !body.windowId) {
      return res.status(400).json({ error: 'changeId, slotId, and windowId are required' });
    }
    const payload: ConfirmRescheduleToolPayload = {
      changeId:  body.changeId,
      bookingId,
      slotId:    body.slotId,
      windowId:  body.windowId,
    };
    const outcome = await confirmReschedule(orgId, payload, body.performedBy ?? 'operator');
    res.json({ outcome });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/erica/orgs/:orgId/bookings/:bookingId/cancel
ericaRouter.post('/orgs/:orgId/bookings/:bookingId/cancel', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const { orgId, bookingId } = req.params;
    const body = req.body;
    const payload: RequestCancellationToolPayload = {
      bookingId,
      entityId:   body.entityId ?? '',
      entityType: body.entityType ?? 'lead',
      reason:     body.reason ?? 'operator_requested',
      reasonNote: body.reasonNote,
    };
    const outcome = await cancelBooking(orgId, payload, body.performedBy ?? 'operator');
    res.json({ outcome });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// CAMPAIGN ENDPOINTS
// =============================================================================

// GET  /api/erica/orgs/:orgId/campaigns
ericaRouter.get('/orgs/:orgId/campaigns', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const campaigns = await listCampaigns(req.params.orgId, 100);
    res.json({ campaigns });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET  /api/erica/orgs/:orgId/campaigns/:campaignId
ericaRouter.get('/orgs/:orgId/campaigns/:campaignId', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const campaign = await getCampaign(req.params.orgId, req.params.campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ campaign });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/erica/orgs/:orgId/campaigns
ericaRouter.post('/orgs/:orgId/campaigns', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body.batchId) return res.status(400).json({ error: 'batchId is required' });
    const campaign = await createCampaign({
      orgId:       req.params.orgId,
      name:        body.name ?? `Campaign ${new Date().toLocaleDateString('en-AU')}`,
      description: body.description,
      batchId:     body.batchId,
      schedule:    body.schedule ?? {},
      createdBy:   body.createdBy ?? 'operator',
    });
    res.json({ campaign });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/erica/orgs/:orgId/campaigns/:campaignId
ericaRouter.patch('/orgs/:orgId/campaigns/:campaignId', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    await updateCampaign(req.params.orgId, req.params.campaignId, req.body, req.body.updatedBy ?? 'operator');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/erica/orgs/:orgId/campaigns/:campaignId/schedule
ericaRouter.post('/orgs/:orgId/campaigns/:campaignId/schedule', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    await scheduleCampaign(req.params.orgId, req.params.campaignId, req.body.performedBy ?? 'operator');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/erica/orgs/:orgId/campaigns/:campaignId/pause
ericaRouter.post('/orgs/:orgId/campaigns/:campaignId/pause', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    await pauseCampaign(req.params.orgId, req.params.campaignId, req.body.reason ?? 'Operator paused', req.body.performedBy ?? 'operator');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/erica/orgs/:orgId/campaigns/:campaignId/resume
ericaRouter.post('/orgs/:orgId/campaigns/:campaignId/resume', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    await resumeCampaign(req.params.orgId, req.params.campaignId, req.body.performedBy ?? 'operator');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/erica/orgs/:orgId/campaigns/:campaignId/stop
ericaRouter.post('/orgs/:orgId/campaigns/:campaignId/stop', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    await stopCampaign(req.params.orgId, req.params.campaignId, req.body.performedBy ?? 'operator');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/erica/orgs/:orgId/campaigns/:campaignId/run-cycle
ericaRouter.post('/orgs/:orgId/campaigns/:campaignId/run-cycle', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const result = await runCampaignCycle(req.params.orgId, req.params.campaignId);
    res.json({ result });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET  /api/erica/orgs/:orgId/campaigns/:campaignId/health
ericaRouter.get('/orgs/:orgId/campaigns/:campaignId/health', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const health = await computeCampaignHealth(req.params.orgId, req.params.campaignId);
    res.json({ health });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET  /api/erica/orgs/:orgId/campaigns/:campaignId/targets
ericaRouter.get('/orgs/:orgId/campaigns/:campaignId/targets', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const targets = await listCampaignTargets(req.params.orgId, req.params.campaignId);
    res.json({ targets });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/erica/orgs/:orgId/campaigns/:campaignId/targets/:targetId/skip
ericaRouter.post('/orgs/:orgId/campaigns/:campaignId/targets/:targetId/skip', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    await skipTarget(req.params.orgId, req.params.campaignId, req.params.targetId,
      req.body.reason ?? 'Operator skipped', req.body.performedBy ?? 'operator');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/erica/orgs/:orgId/campaigns/:campaignId/targets/:targetId/retry
ericaRouter.post('/orgs/:orgId/campaigns/:campaignId/targets/:targetId/retry', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    await retryTarget(req.params.orgId, req.params.campaignId, req.params.targetId, req.body.performedBy ?? 'operator');
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET  /api/erica/orgs/:orgId/campaigns/:campaignId/runs
ericaRouter.get('/orgs/:orgId/campaigns/:campaignId/runs', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const runs = await listCampaignRuns(req.params.orgId, req.params.campaignId, 100);
    res.json({ runs });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET  /api/erica/orgs/:orgId/campaigns/:campaignId/audit
ericaRouter.get('/orgs/:orgId/campaigns/:campaignId/audit', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const entries = await listCampaignAudit(req.params.orgId, req.params.campaignId, 200);
    res.json({ entries });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
