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
