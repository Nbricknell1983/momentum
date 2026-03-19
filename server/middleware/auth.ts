/**
 * Auth & Tenant Verification Middleware
 *
 * Trust model:
 * - User identity comes from Firebase ID token (Authorization: Bearer <token>)
 * - Org membership is verified server-side against Firestore orgs/{orgId}/members/{uid}
 * - orgId from client input is NEVER trusted as authority — only used as a lookup key
 * - manager/admin status is resolved from Firestore member role, not frontend claims
 */

import type { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { firestore, isFirebaseAdminReady } from '../firebase';

// ─── Type augmentation ───────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      firebaseUser?: { uid: string; email?: string };
      orgRole?: string;
      trustedOrgId?: string;
    }
  }
}

// ─── Public paths — no Firebase token required ────────────────────────────────
// These are either OAuth redirects, public report URLs, or external webhooks
// with their own auth mechanism.

const PUBLIC_EXACT: Set<string> = new Set([
  '/api/gbp/callback',          // OAuth redirect — no user session available
  '/api/gbp/credentials-check', // Read-only env var check
  '/api/strategy-reports/check-slug', // Public slug availability check
  '/api/integrations/events',   // Webhook from external client app (pairing-code auth)
  '/api/integrations/pair',     // Device pairing (pre-auth flow)
]);

const PUBLIC_PREFIXES: string[] = [
  '/api/strategy-reports/by-slug/', // Public strategy report URLs
  '/api/reports/by-slug/',          // Public report URLs
];

// OpenClaw action routes have their own shared-secret auth (openclawAuth middleware).
// They must not require a Firebase token.
const OPENCLAW_ACTION_PATHS: Set<string> = new Set([
  '/api/ai/suspects-needing-followup',
  '/api/ai/next-best-action',
  '/api/ai/draft-followup',
  '/api/ai/create-task',
  '/api/ai/log-call-outcome',
  '/api/ai/move-lead-stage',
  '/api/ai/request-appointment-slot',
  '/api/ai/send-approved-sms',
  '/api/ai/send-approved-email',
]);

function isPublicPath(path: string): boolean {
  if (PUBLIC_EXACT.has(path)) return true;
  if (OPENCLAW_ACTION_PATHS.has(path)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  // Public GET for individual reports (not scoped to any org)
  if (/^\/api\/reports\/[^/]+$/.test(path)) return true;
  if (/^\/api\/strategy-reports\/[^/]+$/.test(path)) return true;
  return false;
}

// ─── Phase 2: Firebase token verification ────────────────────────────────────

export async function verifyFirebaseToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isPublicPath(req.path)) return next();

  // ── Internal scheduler bypass ────────────────────────────────────────────
  const schedulerKey = req.headers['x-scheduler-key'];
  if (schedulerKey && process.env.INTERNAL_SCHEDULER_KEY && schedulerKey === process.env.INTERNAL_SCHEDULER_KEY) {
    req.firebaseUser = { uid: 'scheduler-system', email: 'system@scheduler.internal' };
    return next();
  }

  if (!isFirebaseAdminReady()) {
    // Firebase Admin not initialised — fail open in dev if needed, but log it
    console.warn('[auth] Firebase Admin not ready — skipping token verification');
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      detail: 'Missing or malformed Authorization header. Expected: Bearer <Firebase ID token>',
    });
    return;
  }

  const idToken = authHeader.slice(7);
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err: any) {
    res.status(401).json({
      error: 'Unauthorized',
      detail: 'Invalid or expired Firebase ID token',
    });
  }
}

// ─── Phase 3: Org access verification ────────────────────────────────────────
// Resolves orgId from the request (body → query → params), then verifies the
// authenticated user is an active member of that org in Firestore.
// Attaches req.orgRole and req.trustedOrgId on success.

export async function requireOrgAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const firebaseUser = req.firebaseUser;
  if (!firebaseUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const orgId: string | undefined =
    (req.body?.orgId as string | undefined) ||
    (req.query?.orgId as string | undefined) ||
    (req.params?.orgId as string | undefined);

  if (!orgId) {
    res.status(400).json({ error: 'Bad Request', detail: 'orgId is required' });
    return;
  }

  if (!firestore) {
    res.status(503).json({ error: 'Service unavailable — Firestore not ready' });
    return;
  }

  // Scheduler system user bypasses member check
  if (firebaseUser.uid === 'scheduler-system') {
    req.orgRole = 'admin';
    req.trustedOrgId = orgId;
    return next();
  }

  try {
    const memberDoc = await firestore
      .collection('orgs')
      .doc(orgId)
      .collection('members')
      .doc(firebaseUser.uid)
      .get();

    if (!memberDoc.exists || memberDoc.data()?.active !== true) {
      res.status(403).json({
        error: 'Forbidden',
        detail: 'Not an active member of this organisation',
      });
      return;
    }

    req.orgRole = memberDoc.data()?.role as string;
    req.trustedOrgId = orgId;
    next();
  } catch (err: any) {
    console.error('[auth] requireOrgAccess error:', err);
    res.status(500).json({ error: 'Internal error during org access check' });
  }
}

// ─── Phase 4: Manager/admin role enforcement ──────────────────────────────────
// Must run after requireOrgAccess (which populates req.orgRole).

export function requireManager(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const role = req.orgRole;
  if (role !== 'owner' && role !== 'admin') {
    res.status(403).json({
      error: 'Forbidden',
      detail: 'This action requires owner or admin access',
    });
    return;
  }
  next();
}
