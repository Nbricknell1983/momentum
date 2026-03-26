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
