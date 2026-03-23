import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import type { AgentJob, AgentJobStatus, EngineHistoryRecord, EntityType } from './types';

// ─── Entity reference helpers ──────────────────────────────────────────────────

/**
 * Returns a Firestore DocumentReference to the lead or client entity.
 * Throws if the entityType is unsupported.
 */
export function entityRef(
  db: Firestore,
  orgId: string,
  entityType: EntityType,
  entityId: string
): DocumentReference {
  if (entityType === 'lead') {
    return db.collection('orgs').doc(orgId).collection('leads').doc(entityId);
  }
  if (entityType === 'client') {
    return db.collection('orgs').doc(orgId).collection('clients').doc(entityId);
  }
  // 'org' entity — use the org doc itself
  return db.collection('orgs').doc(orgId);
}

// ─── Write engine history record ───────────────────────────────────────────────

/**
 * Dual-write an immutable engine history record.
 *
 * Path: orgs/{orgId}/{leads|clients}/{entityId}/engineHistory/{runId}
 *
 * This is always non-blocking from the caller's perspective — errors are logged
 * but not rethrown, so they never crash the main processing flow.
 */
export async function writeEngineHistory(
  db: Firestore,
  orgId: string,
  entityType: EntityType,
  entityId: string,
  record: EngineHistoryRecord
): Promise<string> {
  try {
    const baseRef = entityRef(db, orgId, entityType, entityId);
    const historyRef = baseRef.collection('engineHistory').doc(record.runId);
    await historyRef.set(record);
    console.log(
      `[engineHistory] Written ${record.taskType} run=${record.runId} entity=${entityType}/${entityId} status=${record.status}`
    );
    return record.runId;
  } catch (err: any) {
    console.error(`[engineHistory] Write failed for ${entityType}/${entityId} task=${record.taskType}:`, err.message);
    return record.runId;
  }
}

// ─── Query latest successful run ───────────────────────────────────────────────

/**
 * Find the most recent successful engine history record for a given task type.
 * Used by TTL guards to determine whether a re-run is needed.
 *
 * Returns null if no successful run exists.
 */
export async function findLatestSuccessfulRun(
  db: Firestore,
  orgId: string,
  entityType: EntityType,
  entityId: string,
  taskType: string
): Promise<EngineHistoryRecord | null> {
  try {
    const baseRef = entityRef(db, orgId, entityType, entityId);
    // Query by taskType only (single-field auto-index — no composite index required),
    // then filter status and sort completedAt in memory to avoid Firestore index errors.
    const snap = await baseRef
      .collection('engineHistory')
      .where('taskType', '==', taskType)
      .limit(50)
      .get();

    if (snap.empty) return null;

    const completed = snap.docs
      .map(d => d.data() as EngineHistoryRecord)
      .filter(r => r.status === 'completed' && !!r.completedAt)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

    return completed[0] ?? null;
  } catch (err: any) {
    console.warn(`[engineHistory] findLatestSuccessfulRun failed:`, err.message);
    return null;
  }
}

// ─── TTL guard ─────────────────────────────────────────────────────────────────

/**
 * Returns true if a re-run should be SKIPPED because a successful run exists
 * within the given TTL window.
 */
export async function isWithinTtl(
  db: Firestore,
  orgId: string,
  entityType: EntityType,
  entityId: string,
  taskType: string,
  ttlMs: number
): Promise<boolean> {
  const latest = await findLatestSuccessfulRun(db, orgId, entityType, entityId, taskType);
  if (!latest?.completedAt) return false;

  const completedAt = new Date(latest.completedAt).getTime();
  const age = Date.now() - completedAt;
  return age < ttlMs;
}

// ─── Dependency satisfaction ───────────────────────────────────────────────────

export interface DepCheckResult {
  satisfied: boolean;
  missingTaskTypes: string[];
}

/**
 * Check whether all required dependency task types have a successful run
 * within the given lookback window (defaults to 24h).
 *
 * If deps are missing, returns the list of task types that need to be queued.
 */
export async function ensureDepsSatisfied(
  db: Firestore,
  orgId: string,
  entityType: EntityType,
  entityId: string,
  dependsOn: string[],
  lookbackMs = 24 * 60 * 60 * 1000
): Promise<DepCheckResult> {
  if (!dependsOn.length) return { satisfied: true, missingTaskTypes: [] };

  const checks = await Promise.all(
    dependsOn.map(async taskType => {
      const ok = await isWithinTtl(db, orgId, entityType, entityId, taskType, lookbackMs);
      return { taskType, ok };
    })
  );

  const missing = checks.filter(c => !c.ok).map(c => c.taskType);
  return { satisfied: missing.length === 0, missingTaskTypes: missing };
}

// ─── Build a history record from a completed job ───────────────────────────────

export function buildHistoryRecord(
  job: AgentJob & { id: string },
  startedAt: string | null,
  completedAt: string,
  status: AgentJobStatus,
  output: Record<string, any> | null,
  raw: string | null,
  error: string | null
): EngineHistoryRecord {
  const started = startedAt ? new Date(startedAt).getTime() : null;
  const completed = new Date(completedAt).getTime();

  return {
    runId:          job.id,
    agentId:        job.agentId,
    taskType:       job.taskType,
    version:        job.version ?? '1.0',
    idempotencyKey: job.idempotencyKey ?? '',
    status,
    input:          job.input,
    output,
    raw,
    error,
    sourceRefs:     [`agentJobs/${job.id}`],
    createdAt:      job.createdAt,
    startedAt,
    completedAt,
    durationMs:     started !== null ? completed - started : null,
  };
}
