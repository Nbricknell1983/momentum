import type { Firestore } from 'firebase-admin/firestore';
import type { AgentJob, AgentJobStatus } from './types';
import { DEFAULT_MAX_RETRIES } from './contracts';

const COLLECTION = 'agentJobs';

function jobsCollection(db: Firestore, orgId: string) {
  return db.collection('orgs').doc(orgId).collection(COLLECTION);
}

/** Create a new agent job in 'queued' status. Returns the job ID. */
export async function createAgentJob(
  db: Firestore,
  job: Omit<AgentJob, 'id' | 'status' | 'output' | 'raw' | 'error' | 'startedAt' | 'completedAt'>
): Promise<string> {
  const ref = jobsCollection(db, job.orgId).doc();
  const doc: AgentJob = {
    ...job,
    status:      'queued',
    output:      null,
    raw:         null,
    error:       null,
    retryCount:  job.retryCount  ?? 0,
    maxRetries:  job.maxRetries  ?? DEFAULT_MAX_RETRIES,
    nextAttemptAt: job.nextAttemptAt ?? null,
    force:       job.force       ?? false,
    dependsOn:   job.dependsOn   ?? [],
    entityType:  job.entityType  ?? 'lead',
    entityId:    job.entityId    ?? '',
    version:     job.version     ?? '1.0',
    idempotencyKey: job.idempotencyKey ?? '',
    startedAt:   null,
    completedAt: null,
  };
  await ref.set(doc);
  console.log(`[agent-jobs] Created job ${ref.id} | org=${job.orgId} task=${job.taskType} agent=${job.agentId} idem=${job.idempotencyKey?.slice(0, 8)}…`);
  return ref.id;
}

/** Mark a job as 'running' and record startedAt. */
export async function markJobRunning(
  db: Firestore,
  orgId: string,
  jobId: string
): Promise<void> {
  await jobsCollection(db, orgId).doc(jobId).update({
    status: 'running' as AgentJobStatus,
    startedAt: new Date().toISOString(),
  });
}

/** Mark a job as 'completed' with output payload. */
export async function markJobCompleted(
  db: Firestore,
  orgId: string,
  jobId: string,
  output: Record<string, any>,
  raw: string
): Promise<void> {
  await jobsCollection(db, orgId).doc(jobId).update({
    status: 'completed' as AgentJobStatus,
    output,
    raw,
    completedAt: new Date().toISOString(),
  });
}

/** Mark a job as 'failed' with an error message. */
export async function markJobFailed(
  db: Firestore,
  orgId: string,
  jobId: string,
  error: string
): Promise<void> {
  await jobsCollection(db, orgId).doc(jobId).update({
    status: 'failed' as AgentJobStatus,
    error,
    completedAt: new Date().toISOString(),
  });
}

/** Mark a job as failed due to output validation error. Preserves raw. */
export async function markJobFailedValidation(
  db: Firestore,
  orgId: string,
  jobId: string,
  error: string,
  raw: string
): Promise<void> {
  await jobsCollection(db, orgId).doc(jobId).update({
    status: 'failed_validation' as AgentJobStatus,
    error,
    raw,
    completedAt: new Date().toISOString(),
  });
}

/** Mark a job as skipped (TTL guard or idempotency). */
export async function markJobSkipped(
  db: Firestore,
  orgId: string,
  jobId: string,
  reason: string
): Promise<void> {
  await jobsCollection(db, orgId).doc(jobId).update({
    status: 'skipped' as AgentJobStatus,
    output: { skipped: true, reason },
    completedAt: new Date().toISOString(),
  });
}

/** Mark a job as pending_deps — waiting for prerequisite task types. */
export async function markJobPendingDeps(
  db: Firestore,
  orgId: string,
  jobId: string,
  missingTaskTypes: string[]
): Promise<void> {
  await jobsCollection(db, orgId).doc(jobId).update({
    status: 'pending_deps' as AgentJobStatus,
    error: `Waiting for deps: ${missingTaskTypes.join(', ')}`,
  });
}

/**
 * Schedule a retry: increment retryCount, set nextAttemptAt with exponential backoff.
 * Returns false if maxRetries has been reached (caller should mark_failed instead).
 */
export async function scheduleRetry(
  db: Firestore,
  orgId: string,
  jobId: string,
  currentRetryCount: number,
  maxRetries: number,
  delayMs: number
): Promise<boolean> {
  if (currentRetryCount >= maxRetries) return false;
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  await jobsCollection(db, orgId).doc(jobId).update({
    status:         'queued' as AgentJobStatus,
    retryCount:     currentRetryCount + 1,
    nextAttemptAt,
    startedAt:      null,
    error:          null,
  });
  console.log(`[agent-jobs] Job ${jobId} scheduled for retry #${currentRetryCount + 1} at ${nextAttemptAt}`);
  return true;
}

/** Fetch a single job by ID. */
export async function getAgentJob(
  db: Firestore,
  orgId: string,
  jobId: string
): Promise<AgentJob | null> {
  const snap = await jobsCollection(db, orgId).doc(jobId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as AgentJob;
}

/** Fetch all jobs for an org (most recent first). */
export async function listAgentJobs(
  db: Firestore,
  orgId: string,
  limitCount = 50
): Promise<AgentJob[]> {
  const snap = await jobsCollection(db, orgId)
    .orderBy('createdAt', 'desc')
    .limit(limitCount)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentJob));
}

/** Fetch queued jobs whose nextAttemptAt is in the past (oldest first). */
export async function getQueuedJobs(
  db: Firestore,
  orgId: string,
  limitCount = 10
): Promise<AgentJob[]> {
  const now = new Date().toISOString();
  // Jobs with no nextAttemptAt, or nextAttemptAt <= now
  const snap = await jobsCollection(db, orgId)
    .where('status', 'in', ['queued', 'pending_deps'])
    .orderBy('createdAt', 'asc')
    .limit(limitCount * 3) // over-fetch to allow client-side nextAttemptAt filter
    .get();

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as AgentJob))
    .filter(j => !j.nextAttemptAt || j.nextAttemptAt <= now)
    .slice(0, limitCount);
}

/**
 * Find an existing job by idempotency key.
 * Returns the most recent matching job in queued/running/completed/skipped status.
 * Ignores failed and failed_validation jobs (those should be retriable).
 * Uses only a single-field index on idempotencyKey (auto-created) to avoid
 * requiring a composite index that must be manually provisioned.
 */
export async function findJobByIdempotencyKey(
  db: Firestore,
  orgId: string,
  idempotencyKey: string
): Promise<AgentJob | null> {
  const snap = await jobsCollection(db, orgId)
    .where('idempotencyKey', '==', idempotencyKey)
    .get();

  if (snap.empty) return null;

  const activeStatuses = new Set(['queued', 'running', 'completed', 'skipped', 'pending_deps']);
  const jobs = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as AgentJob))
    .filter(j => activeStatuses.has(j.status))
    .sort((a, b) => ((b as any).createdAt ?? '').localeCompare((a as any).createdAt ?? ''));

  return jobs[0] ?? null;
}
