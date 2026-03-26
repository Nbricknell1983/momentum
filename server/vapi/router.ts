// =============================================================================
// MOMENTUM VAPI — API ROUTER
// =============================================================================
// All auth-protected Vapi management routes.
// Mounted at /api/vapi in routes.ts (under verifyFirebaseToken middleware).
//
// Final URL paths:
//   GET  /api/vapi/health                          — config check
//   GET  /api/vapi/orgs/:orgId/config              — read org config
//   POST /api/vapi/orgs/:orgId/config              — save org config
//   POST /api/vapi/orgs/:orgId/calls/outbound      — trigger outbound call
//   GET  /api/vapi/orgs/:orgId/calls               — list recent calls
//   GET  /api/vapi/orgs/:orgId/calls/:callId       — single call detail
// =============================================================================

import { Router }              from 'express';
import type { Request, Response } from 'express';
import { requireOrgAccess, requireManager } from '../middleware/auth';
import { firestore }           from '../firebase';
import { isVapiConfigured, MISSING_VAPI_SETUP, getVapiConfig } from './config';
import { createOutboundCall, listRecentCalls } from './callService';

export const vapiRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/vapi/health
// ---------------------------------------------------------------------------

vapiRouter.get('/health', requireManager, async (_req: Request, res: Response) => {
  const cfg = getVapiConfig();
  return res.json({
    configured:        isVapiConfigured(),
    apiKeySet:         !!cfg.apiKey,
    phoneNumberIdSet:  !!cfg.phoneNumberId,
    webhookSecuredSet: !!cfg.webhookSecret,
    missingSections:   MISSING_VAPI_SETUP
      .filter(m => m.required && !process.env[m.envVar])
      .map(m => m.envVar),
    missingSetup: MISSING_VAPI_SETUP,
  });
});

// ---------------------------------------------------------------------------
// GET /api/vapi/orgs/:orgId/config
// ---------------------------------------------------------------------------

vapiRouter.get('/orgs/:orgId/config', requireOrgAccess, async (req: Request, res: Response) => {
  const { orgId } = req.params;
  try {
    const snap = await firestore!.collection('orgs').doc(orgId)
      .collection('vapiConfig').doc('default').get();
    if (!snap.exists) {
      return res.json({
        orgId,
        vapiEnabled:    false,
        policyMode:     'approval_only',
        assistants:     [],
        enabledIntents: [],
        calendarIntegrationConfigured: false,
      });
    }
    return res.json({ id: snap.id, ...snap.data() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/vapi/orgs/:orgId/config
// ---------------------------------------------------------------------------

vapiRouter.post('/orgs/:orgId/config', requireOrgAccess, requireManager, async (req: Request, res: Response) => {
  const { orgId } = req.params;
  const uid       = (req as any).user?.uid ?? 'unknown';
  const body      = req.body as Record<string, unknown>;

  const allowed = ['vapiEnabled', 'policyMode', 'assistants', 'enabledIntents',
    'calendarIntegrationConfigured', 'escalationEmail', 'complianceNotes'];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }
  update.updatedAt = new Date().toISOString();
  update.updatedBy = uid;

  try {
    await firestore!.collection('orgs').doc(orgId)
      .collection('vapiConfig').doc('default').set(update, { merge: true });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/vapi/orgs/:orgId/calls/outbound
// ---------------------------------------------------------------------------

vapiRouter.post('/orgs/:orgId/calls/outbound', requireOrgAccess, async (req: Request, res: Response) => {
  const { orgId } = req.params;
  const uid       = (req as any).user?.uid ?? 'unknown';
  const { intent, entityType, entityId, entityName, phoneNumber, assistantId, metadata } = req.body;

  if (!intent || !entityType || !entityId || !phoneNumber || !assistantId) {
    return res.status(400).json({
      error: 'intent, entityType, entityId, phoneNumber, and assistantId are required',
    });
  }

  const result = await createOutboundCall({
    db: firestore! as any,
    orgId, initiatedBy: uid,
    intent, entityType, entityId, entityName, phoneNumber, assistantId, metadata,
  });

  if (!result.success) {
    const statusCode = result.notConfigured ? 503 : 500;
    return res.status(statusCode).json({
      error: result.error,
      notConfigured: result.notConfigured ?? false,
      callId: result.callId ?? null,
    });
  }

  return res.json({ callId: result.callId, vapiCallId: result.vapiCallId });
});

// ---------------------------------------------------------------------------
// GET /api/vapi/orgs/:orgId/calls
// ---------------------------------------------------------------------------

vapiRouter.get('/orgs/:orgId/calls', requireOrgAccess, async (req: Request, res: Response) => {
  const { orgId }  = req.params;
  const limitRaw   = parseInt(String(req.query.limit ?? '50'), 10);
  const limit      = Math.min(isNaN(limitRaw) ? 50 : limitRaw, 200);
  const calls      = await listRecentCalls({ db: firestore! as any, orgId, limit });
  return res.json({ calls });
});

// ---------------------------------------------------------------------------
// GET /api/vapi/orgs/:orgId/calls/:callId
// ---------------------------------------------------------------------------

vapiRouter.get('/orgs/:orgId/calls/:callId', requireOrgAccess, async (req: Request, res: Response) => {
  const { orgId, callId } = req.params;
  try {
    const snap = await firestore!.collection('orgs').doc(orgId)
      .collection('vapiCalls').doc(callId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Call not found' });
    return res.json({ id: snap.id, ...snap.data() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
