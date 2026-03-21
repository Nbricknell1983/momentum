import type { Firestore } from 'firebase-admin/firestore';
import type { AgentJob } from './types';
import { runOpenClawAgent } from './runner';
import {
  markJobRunning,
  markJobCompleted,
  markJobFailed,
  getAgentJob,
} from './firestore-helpers';

/**
 * Process a single agent job by ID.
 *
 * Flow:
 *   queued → running → completed
 *                    → failed
 *
 * The OpenClaw base URL is loaded from org settings (openclawConfig.baseUrl)
 * so each org's jobs run against their configured OpenClaw instance.
 */
export async function processAgentJob(
  db: Firestore,
  orgId: string,
  jobId: string
): Promise<AgentJob> {
  const job = await getAgentJob(db, orgId, jobId);
  if (!job) throw new Error(`Agent job ${jobId} not found in org ${orgId}`);

  if (job.status !== 'queued') {
    console.warn(`[agent-jobs] Job ${jobId} is already in status '${job.status}' — skipping`);
    return job;
  }

  // ── Load org's OpenClaw base URL from settings ─────────────────────────────
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
  await markJobRunning(db, orgId, jobId);
  console.log(`[agent-jobs] Processing job ${jobId} | agent=${job.agentId} task=${job.taskType}`);

  // ── Build the message from input ────────────────────────────────────────────
  // Serialise the job input as a structured JSON string — agents receive this
  // as their context payload. Agents that understand JSON will parse it;
  // text-only agents receive a readable fallback.
  const message = buildAgentMessage(job);

  // ── Run OpenClaw ────────────────────────────────────────────────────────────
  const result = await runOpenClawAgent(job.agentId, message, openclawBaseUrl);

  // ── Write result back ───────────────────────────────────────────────────────
  if (result.success && result.output) {
    await markJobCompleted(db, orgId, jobId, result.output, result.raw);
    console.log(`[agent-jobs] Job ${jobId} completed via ${result.via}`);
    return { ...job, status: 'completed', output: result.output, raw: result.raw, completedAt: new Date().toISOString() };
  } else {
    const error = result.error || 'Unknown runner error';
    await markJobFailed(db, orgId, jobId, error);
    console.error(`[agent-jobs] Job ${jobId} failed: ${error}`);
    return { ...job, status: 'failed', error, completedAt: new Date().toISOString() };
  }
}

/**
 * Build a structured agent message from the job input.
 * Agents receive task type, context, and the full input payload.
 */
function buildAgentMessage(job: AgentJob): string {
  const lines: string[] = [
    `Task: ${job.taskType}`,
    `Agent: ${job.agentId}`,
    `Org: ${job.orgId}`,
    '',
    'Input:',
    JSON.stringify(job.input, null, 2),
  ];
  return lines.join('\n');
}
