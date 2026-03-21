import type { Firestore } from 'firebase-admin/firestore';
import type { AgentJob, AgentJobStatus } from './types';

const COLLECTION = 'agentJobs';

/**
 * Firestore path: orgs/{orgId}/agentJobs/{jobId}
 */
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
    status: 'queued',
    output: null,
    raw: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };
  await ref.set(doc);
  console.log(`[agent-jobs] Created job ${ref.id} | org=${job.orgId} task=${job.taskType} agent=${job.agentId}`);
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

/** Fetch queued jobs (oldest first, for fair processing order). */
export async function getQueuedJobs(
  db: Firestore,
  orgId: string,
  limitCount = 10
): Promise<AgentJob[]> {
  const snap = await jobsCollection(db, orgId)
    .where('status', '==', 'queued')
    .orderBy('createdAt', 'asc')
    .limit(limitCount)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AgentJob));
}
