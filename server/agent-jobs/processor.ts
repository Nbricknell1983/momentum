import type { Firestore } from 'firebase-admin/firestore';
import type { AgentJob } from './types';
import { runOpenClawAgent } from './runner';
import {
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  markJobFailedValidation,
  markJobSkipped,
  markJobPendingDeps,
  scheduleRetry,
  getAgentJob,
  createAgentJob,
} from './firestore-helpers';
import {
  writeEngineHistory,
  buildHistoryRecord,
  isWithinTtl,
  ensureDepsSatisfied,
} from './history';
import {
  getTtlMs,
  retryDelayMs,
  validateInput,
  validateOutput,
} from './contracts';
import { resolveAgentId, makeIdempotencyKey } from './router';
import { findJobByIdempotencyKey } from './firestore-helpers';

const CONTRACT_VERSION = '1.0';

/**
 * Process a single agent job by ID.
 *
 * Full flow:
 *   1. Load job — skip if already processed
 *   2. Validate input against Zod schema
 *   3. Check nextAttemptAt — skip if too early
 *   4. TTL guard — skip if force=false and recent successful run exists
 *   5. Dependency check — set pending_deps and enqueue missing deps
 *   6. Mark running
 *   7. Run OpenClaw agent
 *   8. Validate output
 *   9. Dual-write: engineHistory + entity snapshot update
 *  10. Mark completed / schedule retry / mark failed
 */
export async function processAgentJob(
  db: Firestore,
  orgId: string,
  jobId: string
): Promise<AgentJob> {
  const job = await getAgentJob(db, orgId, jobId);
  if (!job) throw new Error(`Agent job ${jobId} not found in org ${orgId}`);

  // ── Already processed ──────────────────────────────────────────────────────
  if (job.status !== 'queued' && job.status !== 'pending_deps') {
    console.log(`[agent-jobs] Job ${jobId} already in status '${job.status}' — skipping`);
    return job;
  }

  // ── nextAttemptAt guard (retry backoff) ────────────────────────────────────
  if (job.nextAttemptAt && job.nextAttemptAt > new Date().toISOString()) {
    console.log(`[agent-jobs] Job ${jobId} not ready until ${job.nextAttemptAt} — skipping`);
    return job;
  }

  const entityType = job.entityType ?? 'lead';
  const entityId   = job.entityId   ?? '';
  const taskType   = job.taskType;
  const ttlMs      = getTtlMs(taskType);

  // ── Input validation ────────────────────────────────────────────────────────
  const inputError = validateInput(taskType, job.input);
  if (inputError) {
    console.warn(`[agent-jobs] Job ${jobId} input validation failed: ${inputError}`);
    await markJobFailed(db, orgId, jobId, `Input validation failed: ${inputError}`);
    return { ...job, status: 'failed', error: `Input validation failed: ${inputError}`, completedAt: new Date().toISOString() };
  }

  // ── TTL guard ───────────────────────────────────────────────────────────────
  if (!job.force) {
    const withinTtl = await isWithinTtl(db, orgId, entityType, entityId, taskType, ttlMs);
    if (withinTtl) {
      console.log(`[agent-jobs] Job ${jobId} skipped — within TTL (${ttlMs / 3600000}h)`);
      await markJobSkipped(db, orgId, jobId, 'ttl');
      return { ...job, status: 'skipped', output: { skipped: true, reason: 'ttl' }, completedAt: new Date().toISOString() };
    }
  }

  // ── Dependency check ────────────────────────────────────────────────────────
  const depTaskTypes = (job.dependsOn ?? []).map(d => d.taskType);
  if (depTaskTypes.length > 0) {
    const depResult = await ensureDepsSatisfied(db, orgId, entityType, entityId, depTaskTypes);
    if (!depResult.satisfied) {
      console.log(`[agent-jobs] Job ${jobId} pending deps: ${depResult.missingTaskTypes.join(', ')}`);
      await markJobPendingDeps(db, orgId, jobId, depResult.missingTaskTypes);

      // Enqueue missing dependency jobs (idempotent — duplicate keys are detected)
      for (const depTaskType of depResult.missingTaskTypes) {
        await enqueueDepJob(db, orgId, job, depTaskType);
      }

      return { ...job, status: 'pending_deps' };
    }
  }

  // ── Load OpenClaw config ────────────────────────────────────────────────────
  let openclawBaseUrl: string | null = null;
  try {
    const configSnap = await db
      .collection('orgs').doc(orgId)
      .collection('settings').doc('openclawConfig')
      .get();
    openclawBaseUrl = configSnap.data()?.baseUrl || null;
  } catch (e: any) {
    console.warn(`[agent-jobs] Could not load openclawConfig for org ${orgId}: ${e.message}`);
  }

  // ── Mark running ────────────────────────────────────────────────────────────
  const startedAt = new Date().toISOString();
  await markJobRunning(db, orgId, jobId);
  console.log(`[agent-jobs] Processing job ${jobId} | agent=${job.agentId} task=${taskType} retry=${job.retryCount ?? 0}`);

  // ── Build agent message ─────────────────────────────────────────────────────
  const message = buildAgentMessage(job);

  // ── Run OpenClaw ────────────────────────────────────────────────────────────
  const runResult = await runOpenClawAgent(job.agentId, message, openclawBaseUrl);
  const completedAt = new Date().toISOString();

  // ── Failure path ─────────────────────────────────────────────────────────────
  if (!runResult.success || !runResult.output) {
    const error = runResult.error || 'Unknown runner error';
    const retryCount  = job.retryCount  ?? 0;
    const maxRetries  = job.maxRetries  ?? 3;

    // Write failure to engineHistory
    const historyRecord = buildHistoryRecord(
      { ...job, id: jobId },
      startedAt,
      completedAt,
      'failed',
      null,
      runResult.raw,
      error
    );
    await writeEngineHistory(db, orgId, entityType, entityId, historyRecord).catch(() => {});

    // Schedule retry or mark permanently failed
    const delayMs = retryDelayMs(retryCount);
    const willRetry = await scheduleRetry(db, orgId, jobId, retryCount, maxRetries, delayMs);
    if (!willRetry) {
      await markJobFailed(db, orgId, jobId, error);
      console.error(`[agent-jobs] Job ${jobId} permanently failed after ${retryCount} retries: ${error}`);
      return { ...job, status: 'failed', error, completedAt };
    }

    console.warn(`[agent-jobs] Job ${jobId} failed (retry ${retryCount + 1}/${maxRetries} in ${delayMs / 1000}s): ${error}`);
    return { ...job, status: 'queued', retryCount: retryCount + 1 };
  }

  // ── Output validation ───────────────────────────────────────────────────────
  const outputError = validateOutput(taskType, runResult.output);
  if (outputError) {
    console.warn(`[agent-jobs] Job ${jobId} output validation failed: ${outputError}`);

    const historyRecord = buildHistoryRecord(
      { ...job, id: jobId },
      startedAt,
      completedAt,
      'failed_validation',
      runResult.output,
      runResult.raw,
      `Output validation failed: ${outputError}`
    );
    await writeEngineHistory(db, orgId, entityType, entityId, historyRecord).catch(() => {});
    await markJobFailedValidation(db, orgId, jobId, `Output validation failed: ${outputError}`, runResult.raw);

    return {
      ...job,
      status: 'failed_validation',
      error: `Output validation failed: ${outputError}`,
      raw: runResult.raw,
      completedAt,
    };
  }

  // ── Success path — dual-write ───────────────────────────────────────────────
  await markJobCompleted(db, orgId, jobId, runResult.output, runResult.raw);

  const historyRecord = buildHistoryRecord(
    { ...job, id: jobId },
    startedAt,
    completedAt,
    'completed',
    runResult.output,
    runResult.raw,
    null
  );
  // Non-blocking — never crash the main flow
  writeEngineHistory(db, orgId, entityType, entityId, historyRecord).catch(() => {});

  // Update the entity snapshot field (e.g., client.websiteEngine)
  updateEntitySnapshot(db, orgId, entityType, entityId, taskType, runResult.output, completedAt).catch(() => {});

  console.log(`[agent-jobs] Job ${jobId} completed via ${runResult.via}`);
  return {
    ...job,
    id: jobId,
    status: 'completed',
    output: runResult.output,
    raw: runResult.raw,
    startedAt,
    completedAt,
  };
}

// ─── Enqueue a missing dependency job ─────────────────────────────────────────

async function enqueueDepJob(
  db: Firestore,
  orgId: string,
  parentJob: AgentJob,
  depTaskType: string
): Promise<void> {
  const depIdempotencyKey = makeIdempotencyKey({
    taskType:   depTaskType,
    entityType: parentJob.entityType ?? 'lead',
    entityId:   parentJob.entityId ?? '',
    input:      parentJob.input,
  });

  // Check idempotency — don't create if already queued/running/completed
  const existing = await findJobByIdempotencyKey(db, orgId, depIdempotencyKey);
  if (existing) {
    console.log(`[agent-jobs] Dep job ${depTaskType} already exists (${existing.id}) — skipping enqueue`);
    return;
  }

  const agentId = resolveAgentId(depTaskType);
  await createAgentJob(db, {
    orgId,
    taskType:       depTaskType,
    agentId,
    entityType:     parentJob.entityType ?? 'lead',
    entityId:       parentJob.entityId ?? '',
    version:        CONTRACT_VERSION,
    idempotencyKey: depIdempotencyKey,
    input:          parentJob.input,
    force:          false,
    dependsOn:      [],
    retryCount:     0,
    maxRetries:     parentJob.maxRetries ?? 3,
    nextAttemptAt:  null,
    createdAt:      new Date().toISOString(),
  });

  console.log(`[agent-jobs] Enqueued dep job ${depTaskType} for parent ${parentJob.id}`);
}

// ─── Update entity snapshot field ──────────────────────────────────────────────
// After a successful run, update the denormalised snapshot on the entity doc
// so the UI reads from a single consistent location.

const TASK_SNAPSHOT_FIELD: Record<string, string> = {
  website_xray:        'websiteEngine',
  serp:                'seoEngine',
  gbp:                 'gbpEngine',
  ads:                 'adsEngine',
  strategy:            'strategyDiagnosis',
  growth_prescription: 'growthPrescription',
  prep:                'prepCallPack',
  enrichment:          'enrichmentData',
  website_workstream:  'websiteWorkstream',
  // legacy aliases
  website:             'websiteEngine',
  seo:                 'seoEngine',
};

async function updateEntitySnapshot(
  db: Firestore,
  orgId: string,
  entityType: string,
  entityId: string,
  taskType: string,
  output: Record<string, any>,
  generatedAt: string
): Promise<void> {
  const field = TASK_SNAPSHOT_FIELD[taskType];
  if (!field || !entityId) return;

  const collectionName = entityType === 'client' ? 'clients' : 'leads';
  const ref = db.collection('orgs').doc(orgId).collection(collectionName).doc(entityId);

  await ref.set(
    { [field]: { ...output, generatedAt, snapshot: true } },
    { merge: true }
  );
  console.log(`[agent-jobs] Updated ${collectionName}/${entityId}.${field} snapshot`);
}

// ─── Build agent message ───────────────────────────────────────────────────────

function buildAgentMessage(job: AgentJob): string {
  return [
    `Task: ${job.taskType}`,
    `Agent: ${job.agentId}`,
    `Org: ${job.orgId}`,
    `Entity: ${job.entityType}/${job.entityId}`,
    `Version: ${job.version ?? '1.0'}`,
    '',
    'Input:',
    JSON.stringify(job.input, null, 2),
  ].join('\n');
}
