// =============================================================================
// AI SYSTEMS INTEGRATION — DELIVERY SUMMARY SYNC SERVICE
// =============================================================================
// Fetches live delivery summaries from AI Systems for each provisioned client.
// Caches results in Firestore: orgs/{orgId}/aiSystemsSync/{clientId}
// Runs on schedule and supports manual refresh + AI Systems push.
//
// Summary contract endpoint: GET /api/integration/tenants/{tenantId}/summary
// This endpoint must exist on the AI Systems side to return the full
// AISystemsTenantDeliverySummary payload defined in aiSystemsSyncTypes.ts.
//
// GRACEFUL FALLBACK:
//   - If AI Systems returns 404: tenant not yet active, store null summary
//   - If AI Systems returns 5xx: store error, preserve previous cached data
//   - If integration not configured: skip sync, mark as 'failed'
// =============================================================================

import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID }     from 'crypto';
import { getIntegrationConfig, isIntegrationConfigured, INTEGRATION_PATHS } from './config';
import type {
  AISystemsSyncSnapshot,
  AISystemsSyncRun,
  AISystemsSyncRunError,
  AISystemsTenantDeliverySummary,
  SyncStatus,
} from '../../client/src/lib/aiSystemsSyncTypes';

// Re-export SyncStatus derivation helper
export { deriveSyncStatus } from '../../client/src/lib/aiSystemsSyncTypes';

const SYNC_SCHEMA_VERSION = '1.0';
const STALE_THRESHOLD_MS  = 4  * 60 * 60 * 1000;  // 4 hours

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

function syncRef(db: Firestore, orgId: string, clientId: string) {
  return db.collection('orgs').doc(orgId).collection('aiSystemsSync').doc(clientId);
}

function runRef(db: Firestore, orgId: string, runId: string) {
  return db.collection('orgs').doc(orgId).collection('aiSystemsSyncRuns').doc(runId);
}

export async function readSyncSnapshot(
  db: Firestore,
  orgId: string,
  clientId: string
): Promise<AISystemsSyncSnapshot | null> {
  const snap = await syncRef(db, orgId, clientId).get();
  if (!snap.exists) return null;
  return snap.data() as AISystemsSyncSnapshot;
}

async function writeSyncSnapshot(
  db: Firestore,
  snapshot: AISystemsSyncSnapshot
): Promise<void> {
  await syncRef(db, snapshot.orgId, snapshot.clientId).set(snapshot, { merge: false });
}

async function writeSyncRun(
  db: Firestore,
  run: AISystemsSyncRun
): Promise<void> {
  await runRef(db, run.orgId, run.runId).set(run);
}

// ---------------------------------------------------------------------------
// Derive sync status from snapshot fields
// ---------------------------------------------------------------------------

function computeSyncStatus(
  lastSyncedAt: string | null,
  lastError: string | null
): SyncStatus {
  if (!lastSyncedAt) return lastError ? 'failed' : 'never_synced';
  const age = Date.now() - new Date(lastSyncedAt).getTime();
  if (age < STALE_THRESHOLD_MS)       return 'live';
  if (age < 6 * STALE_THRESHOLD_MS)   return 'stale';
  return 'expired';
}

// ---------------------------------------------------------------------------
// Fetch a single tenant's delivery summary from AI Systems
// ---------------------------------------------------------------------------

export interface FetchSummaryResult {
  success:  boolean;
  summary?: AISystemsTenantDeliverySummary;
  error?:   string;
  httpStatus?: number;
  notProvisioned?: boolean;  // 404 — tenant not active yet
}

export async function fetchTenantDeliverySummary(tenantId: string): Promise<FetchSummaryResult> {
  if (!isIntegrationConfigured()) {
    return { success: false, error: 'AI Systems integration not configured' };
  }

  const cfg = getIntegrationConfig();
  const endpoint = `${cfg.baseUrl}${INTEGRATION_PATHS.tenantSummary(tenantId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization':   `Bearer ${cfg.apiKey}`,
        'X-Source-System': 'momentum',
        'Content-Type':    'application/json',
      },
      signal: controller.signal,
    });

    if (res.status === 404) {
      return { success: false, notProvisioned: true, httpStatus: 404,
               error: 'Tenant not yet provisioned in AI Systems' };
    }

    const body = await res.json().catch(() => ({})) as Record<string, any>;

    if (!res.ok) {
      const msg = body?.error || body?.message || `HTTP ${res.status}`;
      return { success: false, error: msg, httpStatus: res.status };
    }

    return {
      success:  true,
      summary:  body as AISystemsTenantDeliverySummary,
      httpStatus: res.status,
    };
  } catch (err: any) {
    const msg = err.name === 'AbortError'
      ? `Request timed out after ${cfg.requestTimeoutMs}ms`
      : err.message || 'Network error';
    return { success: false, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Sync a single client
// ---------------------------------------------------------------------------

export interface SyncClientResult {
  clientId:   string;
  tenantId?:  string;
  success:    boolean;
  skipped?:   boolean;     // no tenantId yet
  error?:     string;
  cached?:    boolean;     // error but previous data preserved
}

export async function syncClientDeliverySummary(params: {
  db:       Firestore;
  orgId:    string;
  clientId: string;
  tenantId: string;
}): Promise<SyncClientResult> {
  const { db, orgId, clientId, tenantId } = params;
  const now = new Date().toISOString();

  // Read existing snapshot for merge-safe updates
  const existing = await readSyncSnapshot(db, orgId, clientId);

  const result = await fetchTenantDeliverySummary(tenantId);

  if (result.success && result.summary) {
    const snapshot: AISystemsSyncSnapshot = {
      orgId,
      clientId,
      tenantId,
      syncStatus:      'live',
      lastSyncedAt:    now,
      lastAttemptedAt: now,
      lastError:       null,
      syncCount:       (existing?.syncCount ?? 0) + 1,
      errorCount:      existing?.errorCount ?? 0,
      summary:         result.summary,
      syncMethod:      'pull',
      schemaVersion:   SYNC_SCHEMA_VERSION,
    };
    await writeSyncSnapshot(db, snapshot);
    return { clientId, tenantId, success: true };
  }

  // Failure path — preserve previous summary data
  const status = result.notProvisioned ? 'never_synced' : computeSyncStatus(
    existing?.lastSyncedAt ?? null,
    result.error ?? null
  );
  const snapshot: AISystemsSyncSnapshot = {
    orgId,
    clientId,
    tenantId,
    syncStatus:      result.notProvisioned ? 'never_synced' : (existing?.lastSyncedAt ? status : 'failed'),
    lastSyncedAt:    existing?.lastSyncedAt ?? null,
    lastAttemptedAt: now,
    lastError:       result.error ?? 'Unknown error',
    syncCount:       existing?.syncCount ?? 0,
    errorCount:      (existing?.errorCount ?? 0) + 1,
    summary:         existing?.summary ?? null,
    syncMethod:      existing?.syncMethod ?? null,
    schemaVersion:   SYNC_SCHEMA_VERSION,
  };
  await writeSyncSnapshot(db, snapshot);

  return {
    clientId,
    tenantId,
    success: false,
    cached:  !!existing?.summary,
    error:   result.error,
  };
}

// ---------------------------------------------------------------------------
// Sync all clients in an org that have a tenantId
// ---------------------------------------------------------------------------

export interface SyncOrgResult {
  run:  AISystemsSyncRun;
  log:  string[];
}

export async function syncAllOrgClients(params: {
  db:          Firestore;
  orgId:       string;
  triggeredBy: 'scheduler' | 'manual';
}): Promise<SyncOrgResult> {
  const { db, orgId, triggeredBy } = params;
  const runId    = randomUUID();
  const startedAt = new Date().toISOString();
  const log: string[] = [];

  log.push(`[${startedAt}] Starting AI Systems delivery sync for org ${orgId}`);
  log.push(`Triggered by: ${triggeredBy}`);

  if (!isIntegrationConfigured()) {
    log.push('AI Systems integration not configured — skipping sync');
    const run: AISystemsSyncRun = {
      runId, orgId, triggeredBy, startedAt,
      completedAt: new Date().toISOString(),
      durationMs: 0,
      clientsAttempted: 0, clientsSucceeded: 0,
      clientsFailed: 0, clientsSkipped: 0, errors: [],
    };
    await writeSyncRun(db, run);
    return { run, log };
  }

  // Fetch all clients with a tenantId
  let clientsAttempted = 0, clientsSucceeded = 0, clientsFailed = 0, clientsSkipped = 0;
  const errors: AISystemsSyncRunError[] = [];

  let clientDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  try {
    const snap = await db.collection('orgs').doc(orgId).collection('clients').get();
    clientDocs = snap.docs;
    log.push(`Found ${clientDocs.length} client(s) in org`);
  } catch (err: any) {
    log.push(`Failed to read clients: ${err.message}`);
  }

  for (const doc of clientDocs) {
    const data = doc.data() as Record<string, any>;
    const tenantId: string | undefined =
      data?.aiSystemsIntegration?.tenantId ??
      data?.onboardingState?.provisioning?.tenantId ??
      data?.tenantId;

    if (!tenantId) {
      clientsSkipped++;
      continue;
    }

    clientsAttempted++;
    log.push(`  Syncing client ${doc.id} (tenant: ${tenantId})...`);

    try {
      const res = await syncClientDeliverySummary({
        db, orgId, clientId: doc.id, tenantId
      });
      if (res.success) {
        clientsSucceeded++;
        log.push(`  ✓ ${doc.id} synced`);
      } else {
        clientsFailed++;
        const msg = res.error ?? 'Unknown';
        log.push(`  ✗ ${doc.id} failed: ${msg}${res.cached ? ' (cached data preserved)' : ''}`);
        errors.push({ clientId: doc.id, tenantId, error: msg });
      }
    } catch (err: any) {
      clientsFailed++;
      const msg = err.message ?? 'Unhandled error';
      log.push(`  ✗ ${doc.id} threw: ${msg}`);
      errors.push({ clientId: doc.id, tenantId, error: msg });
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs  = Date.now() - new Date(startedAt).getTime();

  log.push(`\nSync complete — ${clientsSucceeded}/${clientsAttempted} succeeded, ${clientsSkipped} skipped (no tenant), ${durationMs}ms`);

  const run: AISystemsSyncRun = {
    runId, orgId, triggeredBy, startedAt, completedAt, durationMs,
    clientsAttempted, clientsSucceeded, clientsFailed, clientsSkipped, errors,
  };
  await writeSyncRun(db, run);
  return { run, log };
}

// ---------------------------------------------------------------------------
// Receive a summary pushed by AI Systems (push path)
// ---------------------------------------------------------------------------

export async function receivePushedSummary(params: {
  db:      Firestore;
  orgId:   string;
  clientId: string;
  summary: AISystemsTenantDeliverySummary;
}): Promise<void> {
  const { db, orgId, clientId, summary } = params;
  const existing = await readSyncSnapshot(db, orgId, clientId);
  const now = new Date().toISOString();

  const snapshot: AISystemsSyncSnapshot = {
    orgId,
    clientId,
    tenantId:        summary.tenantId,
    syncStatus:      'live',
    lastSyncedAt:    now,
    lastAttemptedAt: now,
    lastError:       null,
    syncCount:       (existing?.syncCount ?? 0) + 1,
    errorCount:      existing?.errorCount ?? 0,
    summary,
    syncMethod:      'push',
    schemaVersion:   SYNC_SCHEMA_VERSION,
  };
  await writeSyncSnapshot(db, snapshot);
}

// ---------------------------------------------------------------------------
// Compute org-level sync health from stored snapshots
// ---------------------------------------------------------------------------

export async function computeOrgSyncHealth(params: {
  db:    Firestore;
  orgId: string;
}): Promise<{
  configured:      boolean;
  totalClients:    number;
  liveSynced:      number;
  staleSynced:     number;
  expiredSynced:   number;
  failedSyncs:     number;
  neverSynced:     number;
  skippedNoTenant: number;
  lastRunAt:       string | null;
  lastRunSummary?: AISystemsSyncRun;
}> {
  const { db, orgId } = params;
  const configured = isIntegrationConfigured();

  // Count all clients
  let totalClients = 0, skippedNoTenant = 0;
  try {
    const snap = await db.collection('orgs').doc(orgId).collection('clients').get();
    totalClients = snap.size;
    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, any>;
      const t = d?.aiSystemsIntegration?.tenantId ?? d?.onboardingState?.provisioning?.tenantId ?? d?.tenantId;
      if (!t) skippedNoTenant++;
    }
  } catch { /* ignore */ }

  // Count sync snapshots
  let liveSynced = 0, staleSynced = 0, expiredSynced = 0, failedSyncs = 0, neverSynced = 0;
  try {
    const syncs = await db.collection('orgs').doc(orgId).collection('aiSystemsSync').get();
    for (const doc of syncs.docs) {
      const s = doc.data() as AISystemsSyncSnapshot;
      const status = computeSyncStatus(s.lastSyncedAt, s.lastError);
      if (status === 'live')         liveSynced++;
      else if (status === 'stale')   staleSynced++;
      else if (status === 'expired') expiredSynced++;
      else if (status === 'failed')  failedSyncs++;
      else                           neverSynced++;
    }
  } catch { /* ignore */ }

  // Last run
  let lastRunAt: string | null = null;
  let lastRunSummary: AISystemsSyncRun | undefined;
  try {
    const runs = await db.collection('orgs').doc(orgId).collection('aiSystemsSyncRuns')
      .orderBy('startedAt', 'desc').limit(1).get();
    if (!runs.empty) {
      lastRunSummary = runs.docs[0].data() as AISystemsSyncRun;
      lastRunAt = lastRunSummary.startedAt;
    }
  } catch { /* ignore */ }

  return {
    configured, totalClients,
    liveSynced, staleSynced, expiredSynced,
    failedSyncs, neverSynced, skippedNoTenant,
    lastRunAt, lastRunSummary,
  };
}
