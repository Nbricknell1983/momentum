// =============================================================================
// AI SYSTEMS INTEGRATION — EXPRESS ROUTER
// =============================================================================
// All routes require:
//   - verifyFirebaseToken (global middleware)
//   - requireOrgAccess    (orgId resolution + membership check)
//   - requireManager      (owner or admin role only)
//
// All routes are prefixed at /api/integration when mounted in routes.ts
// =============================================================================

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireOrgAccess, requireManager } from '../middleware/auth';
import { firestore, isFirebaseAdminReady } from '../firebase';
import { isIntegrationConfigured, REQUIRED_ENV_VARS, OPTIONAL_ENV_VARS } from './config';
import {
  checkProvisioningReadiness,
  actionCreateTenant,
  actionRetryProvisioning,
  actionRefreshStatus,
  actionSendPatch,
  getProvisioningLog,
} from './actions';
import { readIntegrationMapping } from './provisioning';
import type { ConversionArchetype, PatchDomain } from './types';

const router = Router();

// ── All integration routes require org membership + manager role ────────────
router.use(requireOrgAccess, requireManager);

// ---------------------------------------------------------------------------
// GET /api/integration/config
// Returns integration configuration status (no secrets exposed)
// ---------------------------------------------------------------------------

router.get('/config', (_req: Request, res: Response) => {
  res.json({
    configured: isIntegrationConfigured(),
    requiredEnvVars: REQUIRED_ENV_VARS.map(v => ({
      name:        v.name,
      description: v.description,
      set:         !!process.env[v.name],
    })),
    optionalEnvVars: OPTIONAL_ENV_VARS.map(v => ({
      name:        v.name,
      description: v.description,
      set:         !!process.env[v.name],
      default:     v.default,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /api/integration/clients/:clientId/readiness
// Returns provisioning readiness check for a specific client
// ---------------------------------------------------------------------------

router.get('/clients/:clientId/readiness', async (req: Request, res: Response) => {
  if (!isFirebaseAdminReady() || !firestore) {
    return res.status(503).json({ error: 'Firestore not ready' });
  }

  const { clientId } = req.params;
  const orgId = req.trustedOrgId!;

  try {
    const clientSnap = await firestore
      .collection('orgs').doc(orgId)
      .collection('clients').doc(clientId)
      .get();

    if (!clientSnap.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const clientDoc = { id: clientSnap.id, ...clientSnap.data() } as Record<string, any>;
    const readiness = await checkProvisioningReadiness(firestore, orgId, clientId, clientDoc);
    const integration = await readIntegrationMapping(firestore, orgId, clientId);

    res.json({ readiness, integration });
  } catch (err: any) {
    console.error('[integration] readiness check error:', err);
    res.status(500).json({ error: err.message || 'Readiness check failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/integration/clients/:clientId/status
// Returns current integration state + mapping
// ---------------------------------------------------------------------------

router.get('/clients/:clientId/status', async (req: Request, res: Response) => {
  if (!isFirebaseAdminReady() || !firestore) {
    return res.status(503).json({ error: 'Firestore not ready' });
  }

  const { clientId } = req.params;
  const orgId = req.trustedOrgId!;

  try {
    const integration = await readIntegrationMapping(firestore, orgId, clientId);
    const log = await getProvisioningLog(firestore, orgId, clientId);

    res.json({
      configured:  isIntegrationConfigured(),
      integration: integration || null,
      recentLog:   log.slice(0, 10),
    });
  } catch (err: any) {
    console.error('[integration] status fetch error:', err);
    res.status(500).json({ error: err.message || 'Status fetch failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/integration/clients/:clientId/provision
// Create tenant in AI Systems (admin action 1)
// ---------------------------------------------------------------------------

router.post('/clients/:clientId/provision', async (req: Request, res: Response) => {
  if (!isFirebaseAdminReady() || !firestore) {
    return res.status(503).json({ error: 'Firestore not ready' });
  }

  const { clientId } = req.params;
  const orgId  = req.trustedOrgId!;
  const userId = req.firebaseUser?.uid    || 'unknown';
  const email  = req.firebaseUser?.email  || '';

  const {
    archetype       = 'local_anchor',
    scopeSelection  = {},
    planTier        = 'growth',
    displayName     = 'Momentum Admin',
    handoverNotes,
    expectedStartDate,
    leadId,
  } = req.body;

  if (!isIntegrationConfigured()) {
    return res.status(503).json({
      error: 'AI Systems integration is not configured. Contact your administrator to add AI_SYSTEMS_BASE_URL and AI_SYSTEMS_API_KEY.',
    });
  }

  try {
    const db = firestore;

    // Load client doc
    const clientSnap = await db.collection('orgs').doc(orgId).collection('clients').doc(clientId).get();
    if (!clientSnap.exists) return res.status(404).json({ error: 'Client not found' });
    const clientDoc = { id: clientSnap.id, ...clientSnap.data() } as Record<string, any>;

    // Load lead doc (optional — uses clientDoc as fallback)
    let leadDoc: Record<string, any> = { id: clientId, ...clientDoc };
    if (leadId) {
      const leadSnap = await db.collection('orgs').doc(orgId).collection('leads').doc(leadId).get();
      if (leadSnap.exists) leadDoc = { id: leadSnap.id, ...leadSnap.data() };
    }

    // Load strategy output (latest from engineHistory or top-level)
    const strategyDoc: Record<string, any> = clientDoc.strategy || clientDoc.strategyData || {};

    // Load research/enrichment data
    const researchDoc: Record<string, any> = clientDoc.researchData || clientDoc.intelligence || {};

    // Load keyword strategy
    const keywordDoc: Record<string, any> = clientDoc.keywordStrategy || clientDoc.keywords || {};

    // Load scoring / confidence data
    const scoringDoc: Record<string, any> = clientDoc.confidenceScore || clientDoc.scoring || {};

    const result = await actionCreateTenant({
      db, orgId, clientId,
      clientDoc, leadDoc, strategyDoc, researchDoc, keywordDoc, scoringDoc,
      archetype:      archetype as ConversionArchetype,
      scopeSelection: {
        website:   !!scopeSelection.website,
        seo:       !!scopeSelection.seo,
        gbp:       !!scopeSelection.gbp,
        ads:       !!scopeSelection.ads,
        portal:    !!scopeSelection.portal,
        autopilot: !!scopeSelection.autopilot,
      },
      planTier,
      userId,
      displayName,
      userEmail:    email,
      role:         req.orgRole || 'admin',
      handoverNotes,
      expectedStartDate,
    });

    if (!result.success && result.validationErrors?.length) {
      return res.status(422).json({
        error:            'Payload validation failed',
        validationErrors: result.validationErrors,
      });
    }

    if (!result.success) {
      return res.status(502).json({ error: result.error });
    }

    res.json({
      success:               true,
      tenantId:              result.tenantId,
      provisioningRequestId: result.provisioningRequestId,
      lifecycleState:        result.lifecycleState,
    });
  } catch (err: any) {
    console.error('[integration] provision error:', err);
    res.status(500).json({ error: err.message || 'Provisioning failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/integration/clients/:clientId/retry
// Retry provisioning (admin action 2) — same as provision but fresh requestId
// ---------------------------------------------------------------------------

router.post('/clients/:clientId/retry', async (req: Request, res: Response) => {
  if (!isFirebaseAdminReady() || !firestore) {
    return res.status(503).json({ error: 'Firestore not ready' });
  }

  const { clientId } = req.params;
  const orgId  = req.trustedOrgId!;
  const userId = req.firebaseUser?.uid    || 'unknown';
  const email  = req.firebaseUser?.email  || '';

  const {
    archetype       = 'local_anchor',
    scopeSelection  = {},
    planTier        = 'growth',
    displayName     = 'Momentum Admin',
    handoverNotes,
    expectedStartDate,
    leadId,
  } = req.body;

  if (!isIntegrationConfigured()) {
    return res.status(503).json({ error: 'AI Systems integration is not configured.' });
  }

  try {
    const db = firestore;
    const clientSnap = await db.collection('orgs').doc(orgId).collection('clients').doc(clientId).get();
    if (!clientSnap.exists) return res.status(404).json({ error: 'Client not found' });
    const clientDoc = { id: clientSnap.id, ...clientSnap.data() } as Record<string, any>;

    let leadDoc: Record<string, any> = { id: clientId, ...clientDoc };
    if (leadId) {
      const leadSnap = await db.collection('orgs').doc(orgId).collection('leads').doc(leadId).get();
      if (leadSnap.exists) leadDoc = { id: leadSnap.id, ...leadSnap.data() };
    }

    const strategyDoc  = clientDoc.strategy     || clientDoc.strategyData || {};
    const researchDoc  = clientDoc.researchData  || clientDoc.intelligence || {};
    const keywordDoc   = clientDoc.keywordStrategy || clientDoc.keywords   || {};
    const scoringDoc   = clientDoc.confidenceScore || clientDoc.scoring    || {};

    const result = await actionRetryProvisioning({
      db, orgId, clientId,
      clientDoc, leadDoc, strategyDoc, researchDoc, keywordDoc, scoringDoc,
      archetype: archetype as ConversionArchetype,
      scopeSelection: {
        website:   !!scopeSelection.website,
        seo:       !!scopeSelection.seo,
        gbp:       !!scopeSelection.gbp,
        ads:       !!scopeSelection.ads,
        portal:    !!scopeSelection.portal,
        autopilot: !!scopeSelection.autopilot,
      },
      planTier,
      userId,
      displayName,
      userEmail:  email,
      role:       req.orgRole || 'admin',
    });

    if (!result.success) return res.status(502).json({ error: result.error });
    res.json({ success: true, tenantId: result.tenantId, lifecycleState: result.lifecycleState });
  } catch (err: any) {
    console.error('[integration] retry error:', err);
    res.status(500).json({ error: err.message || 'Retry failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/integration/clients/:clientId/refresh
// Refresh status from AI Systems (admin action 3)
// ---------------------------------------------------------------------------

router.post('/clients/:clientId/refresh', async (req: Request, res: Response) => {
  if (!isFirebaseAdminReady() || !firestore) {
    return res.status(503).json({ error: 'Firestore not ready' });
  }

  const { clientId } = req.params;
  const orgId = req.trustedOrgId!;

  try {
    const result = await actionRefreshStatus({ db: firestore, orgId, clientId });
    if (!result.success) {
      return res.status(result.error?.includes('No tenant') ? 409 : 502).json({ error: result.error });
    }
    res.json(result);
  } catch (err: any) {
    console.error('[integration] refresh error:', err);
    res.status(500).json({ error: err.message || 'Status refresh failed' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/integration/clients/:clientId/patch
// Send PATCH update (admin action 4)
// Body: { domain: PatchDomain, data: Record<string, unknown> }
// ---------------------------------------------------------------------------

router.post('/clients/:clientId/patch', async (req: Request, res: Response) => {
  if (!isFirebaseAdminReady() || !firestore) {
    return res.status(503).json({ error: 'Firestore not ready' });
  }

  const { clientId } = req.params;
  const orgId  = req.trustedOrgId!;
  const userId = req.firebaseUser?.uid;

  const { domain, data } = req.body as { domain: PatchDomain; data: Record<string, unknown> };

  if (!domain || !data) {
    return res.status(400).json({ error: 'domain and data are required' });
  }

  const ALLOWED_DOMAINS: PatchDomain[] = [
    'business', 'strategy', 'researchArtifacts', 'keywords',
    'targetMarket', 'requestedModules', 'onboarding', 'metadata',
  ];

  if (!ALLOWED_DOMAINS.includes(domain)) {
    return res.status(400).json({
      error:   `Invalid domain "${domain}"`,
      allowed: ALLOWED_DOMAINS,
    });
  }

  try {
    const result = await actionSendPatch({ db: firestore, orgId, clientId, domain, data, userId });

    if (!result.success) {
      const statusCode = result.locked?.length ? 403 : 502;
      return res.status(statusCode).json({ error: result.error, locked: result.locked });
    }

    res.json(result);
  } catch (err: any) {
    console.error('[integration] patch error:', err);
    res.status(500).json({ error: err.message || 'Patch failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/integration/clients/:clientId/log
// Fetch provisioning audit log (UI display)
// ---------------------------------------------------------------------------

router.get('/clients/:clientId/log', async (req: Request, res: Response) => {
  if (!isFirebaseAdminReady() || !firestore) {
    return res.status(503).json({ error: 'Firestore not ready' });
  }

  const { clientId } = req.params;
  const orgId = req.trustedOrgId!;

  try {
    const log = await getProvisioningLog(firestore, orgId, clientId);
    res.json({ log });
  } catch (err: any) {
    console.error('[integration] log fetch error:', err);
    res.status(500).json({ error: err.message || 'Log fetch failed' });
  }
});

export { router as integrationRouter };
