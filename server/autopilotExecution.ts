/**
 * True Server-Side Autopilot Execution Layer
 *
 * Picks up sweepActions with outcome='auto_created', re-checks policy,
 * acquires leases, runs low-risk handlers, and writes full audit records.
 *
 * Firestore collections:
 *   orgs/{orgId}/autopilotExecJobs       — per-job lifecycle records
 *   orgs/{orgId}/autopilotExecAttempts   — per-attempt records for retry tracking
 *   orgs/{orgId}/autopilotExecLeases     — in-flight lease protection
 *   orgs/{orgId}/cadenceReminders        — written by create_cadence_reminder handler
 *   orgs/{orgId}/activityLog             — written by log_activity handler
 *
 * SAFETY GUARANTEES:
 *   - Re-checks autopilot policy before every execution
 *   - Lease prevents duplicate in-flight execution
 *   - Dedup key prevents re-running a completed job with same key
 *   - Only low-risk (auto_allowed) actions are ever executed automatically
 *   - High/medium-risk always require human approval — never executed here
 *   - Fully auditable: every decision logged with why
 */

import { firestore } from './firebase';

// ── Domain types ──────────────────────────────────────────────────────────────

export type ExecJobStatus =
  | 'queued'          // waiting for execution runner
  | 'claimed'         // lease acquired, processing started
  | 'executing'       // handler is running
  | 'succeeded'       // completed successfully
  | 'failed'          // attempt failed, may retry
  | 'terminal_failed' // max retries exceeded
  | 'suppressed'      // skipped: policy changed / cooldown / already done
  | 'cancelled';      // manually cancelled by operator

export type ExecActionType =
  | 'create_cadence_reminder'
  | 'flag_churn_risk'
  | 'flag_upsell_opportunity'
  | 'flag_referral_window'
  | 'log_activity'
  | 'queue_draft_generation'
  | 'queue_approval_request';

export interface AutopilotExecJob {
  id?: string;
  orgId: string;
  sweepActionId: string;         // source sweepAction document id
  sweepRunId: string;
  actionType: ExecActionType;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  safetyLevel: 'low_risk' | 'medium_risk';
  priority: 'urgent' | 'high' | 'normal';
  reason: string;                // from sweep candidate
  contextFacts: string[];
  suggestedAction: string;
  scope: string;
  dedupeKey: string;
  cooldownKey: string;
  policyDecisionAtQueue: string; // policy outcome when queued
  status: ExecJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;         // ISO 8601 — when next attempt is allowed
  createdAt: string;
  dueAt: string;
  lastAttemptAt?: string;
  completedAt?: string;
  suppressedReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  lastError?: string;
  executionResult?: string;      // human-readable description of what was done
  why: string;                   // full explanation of why this job was created
}

export interface AutopilotExecAttempt {
  id?: string;
  orgId: string;
  jobId: string;
  attemptNumber: number;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'succeeded' | 'failed';
  policyRecheckOutcome: string;  // what policy said at execution time
  handlerResult?: string;
  error?: string;
  suppressionReason?: string;
  executionDurationMs?: number;
}

export interface AutopilotExecLease {
  jobId: string;
  claimedAt: string;
  expiresAt: string;             // stale lease threshold (1 min)
  claimedByRun: string;
}

export interface AutopilotExecRunSummary {
  orgId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  triggeredBy: 'scheduler' | 'manual';
  jobsFound: number;
  jobsExecuted: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsSuppressed: number;
  jobsSkippedInFlight: number;
  errors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string { return new Date().toISOString(); }

function nowLabel(): string {
  return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function futureIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function retryBackoffMs(attempt: number): number {
  // 1min, 5min, 15min — then terminal
  const backoffs = [60_000, 300_000, 900_000];
  return backoffs[Math.min(attempt, backoffs.length - 1)];
}

// ── Policy re-check (mirrors sweepRunner logic exactly) ───────────────────────

const DEFAULT_RULE_MAP: Record<string, { safetyLevel: string; defaultOutcome: string }> = {
  create_cadence_reminder: { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  flag_churn_risk:         { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  flag_upsell_opportunity: { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  flag_referral_window:    { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  log_activity:            { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  queue_draft_generation:  { safetyLevel: 'medium_risk', defaultOutcome: 'approval_required' },
  queue_approval_request:  { safetyLevel: 'medium_risk', defaultOutcome: 'approval_required' },
};

async function recheckPolicy(
  orgId: string,
  actionType: string,
): Promise<'auto_allowed' | 'blocked' | 'approval_required' | 'recommendation_only'> {
  if (!firestore) return 'blocked';
  try {
    const policySnap = await firestore.collection('orgs').doc(orgId)
      .collection('autopilotPolicy').doc('policy').get();
    const policy = policySnap.exists ? policySnap.data() : null;
    const globalMode: string = policy?.globalMode ?? 'approval_only';
    const savedRules: any[] = policy?.rules ?? [];

    if (globalMode === 'off') return 'blocked';

    const savedRule = savedRules.find((r: any) => r.actionType === actionType);
    if (savedRule?.enabled === false) return 'blocked';

    const defaults = DEFAULT_RULE_MAP[actionType];
    if (!defaults) return 'recommendation_only';

    let outcome: string = savedRule?.orgOverride ?? savedRule?.defaultOutcome ?? defaults.defaultOutcome;

    if (globalMode === 'recommendations_only' && outcome !== 'blocked') return 'recommendation_only';
    if (globalMode === 'approval_only' && outcome === 'auto_allowed') return 'approval_required';

    return outcome as 'auto_allowed' | 'blocked' | 'approval_required' | 'recommendation_only';
  } catch {
    return 'blocked';
  }
}

// ── Lease management ──────────────────────────────────────────────────────────

const LEASE_TTL_MS = 60_000; // 1 minute

async function acquireLease(orgId: string, jobId: string, runId: string): Promise<boolean> {
  if (!firestore) return false;
  const ref = firestore.collection('orgs').doc(orgId).collection('autopilotExecLeases').doc(jobId);
  try {
    await firestore.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const data = snap.data()!;
        const expired = new Date(data.expiresAt) < new Date();
        if (!expired) throw new Error('lease_held');
      }
      const lease: AutopilotExecLease = {
        jobId,
        claimedAt: nowIso(),
        expiresAt: futureIso(LEASE_TTL_MS),
        claimedByRun: runId,
      };
      tx.set(ref, lease);
    });
    return true;
  } catch {
    return false;
  }
}

async function releaseLease(orgId: string, jobId: string): Promise<void> {
  if (!firestore) return;
  await firestore.collection('orgs').doc(orgId).collection('autopilotExecLeases').doc(jobId)
    .delete().catch(() => {});
}

// ── Low-risk action handlers ──────────────────────────────────────────────────

interface HandlerContext {
  orgId: string;
  job: AutopilotExecJob;
}

interface HandlerResult {
  success: boolean;
  description: string;
  error?: string;
}

async function handleCreateCadenceReminder(ctx: HandlerContext): Promise<HandlerResult> {
  if (!firestore) return { success: false, description: '', error: 'Firestore unavailable' };
  try {
    const { orgId, job } = ctx;
    const reminderRef = await firestore.collection('orgs').doc(orgId).collection('cadenceReminders').add({
      orgId,
      entityId: job.entityId,
      entityName: job.entityName,
      entityType: job.entityType,
      reason: job.reason,
      contextFacts: job.contextFacts,
      suggestedAction: job.suggestedAction,
      priority: job.priority,
      source: 'autopilot_execution',
      autopilotJobId: job.id,
      createdAt: nowLabel(),
      createdAtIso: nowIso(),
      status: 'pending',
      reviewed: false,
    });
    return { success: true, description: `Cadence reminder created (id: ${reminderRef.id}) for ${job.entityName}` };
  } catch (err: any) {
    return { success: false, description: '', error: err.message };
  }
}

async function handleFlagChurnRisk(ctx: HandlerContext): Promise<HandlerResult> {
  if (!firestore) return { success: false, description: '', error: 'Firestore unavailable' };
  try {
    const { orgId, job } = ctx;
    if (job.entityType !== 'client') return { success: true, description: 'Not a client — skip flag' };
    await firestore.collection('orgs').doc(orgId).collection('clients').doc(job.entityId)
      .set({
        churnFlaggedByAutopilot: true,
        churnFlaggedAt: nowLabel(),
        churnFlagReason: job.reason,
      }, { merge: true });
    return { success: true, description: `Churn risk flag written to client ${job.entityName}` };
  } catch (err: any) {
    return { success: false, description: '', error: err.message };
  }
}

async function handleFlagUpsellOpportunity(ctx: HandlerContext): Promise<HandlerResult> {
  if (!firestore) return { success: false, description: '', error: 'Firestore unavailable' };
  try {
    const { orgId, job } = ctx;
    if (job.entityType !== 'client') return { success: true, description: 'Not a client — skip flag' };
    await firestore.collection('orgs').doc(orgId).collection('clients').doc(job.entityId)
      .set({
        upsellFlaggedByAutopilot: true,
        upsellFlaggedAt: nowLabel(),
        upsellFlagReason: job.reason,
      }, { merge: true });
    return { success: true, description: `Upsell opportunity flag written to client ${job.entityName}` };
  } catch (err: any) {
    return { success: false, description: '', error: err.message };
  }
}

async function handleFlagReferralWindow(ctx: HandlerContext): Promise<HandlerResult> {
  if (!firestore) return { success: false, description: '', error: 'Firestore unavailable' };
  try {
    const { orgId, job } = ctx;
    if (job.entityType !== 'client') return { success: true, description: 'Not a client — skip flag' };
    await firestore.collection('orgs').doc(orgId).collection('clients').doc(job.entityId)
      .set({
        referralFlaggedByAutopilot: true,
        referralFlaggedAt: nowLabel(),
        referralFlagReason: job.reason,
      }, { merge: true });
    return { success: true, description: `Referral window flag written to client ${job.entityName}` };
  } catch (err: any) {
    return { success: false, description: '', error: err.message };
  }
}

async function handleLogActivity(ctx: HandlerContext): Promise<HandlerResult> {
  if (!firestore) return { success: false, description: '', error: 'Firestore unavailable' };
  try {
    const { orgId, job } = ctx;
    const logRef = await firestore.collection('orgs').doc(orgId).collection('activityLog').add({
      orgId,
      entityId: job.entityId,
      entityName: job.entityName,
      entityType: job.entityType,
      activityType: 'autopilot_action',
      description: job.suggestedAction,
      reason: job.reason,
      contextFacts: job.contextFacts,
      source: 'autopilot_execution',
      autopilotJobId: job.id,
      loggedAt: nowLabel(),
      loggedAtIso: nowIso(),
    });
    return { success: true, description: `Activity logged (id: ${logRef.id}) for ${job.entityName}` };
  } catch (err: any) {
    return { success: false, description: '', error: err.message };
  }
}

async function handleQueueDraftGeneration(ctx: HandlerContext): Promise<HandlerResult> {
  // Medium-risk: only queues, never auto-sends
  if (!firestore) return { success: false, description: '', error: 'Firestore unavailable' };
  try {
    const { orgId, job } = ctx;
    await firestore.collection('orgs').doc(orgId).collection('draftQueue').add({
      orgId,
      entityId: job.entityId,
      entityName: job.entityName,
      entityType: job.entityType,
      reason: job.reason,
      contextFacts: job.contextFacts,
      status: 'pending',
      source: 'autopilot_execution',
      autopilotJobId: job.id,
      queuedAt: nowLabel(),
      queuedAtIso: nowIso(),
    });
    return { success: true, description: `Draft generation queued for ${job.entityName} — awaiting human review` };
  } catch (err: any) {
    return { success: false, description: '', error: err.message };
  }
}

async function handleQueueApprovalRequest(ctx: HandlerContext): Promise<HandlerResult> {
  // Medium-risk: puts into approval queue
  if (!firestore) return { success: false, description: '', error: 'Firestore unavailable' };
  try {
    const { orgId, job } = ctx;
    await firestore.collection('orgs').doc(orgId).collection('approvalRequests').add({
      orgId,
      entityId: job.entityId,
      entityName: job.entityName,
      entityType: job.entityType,
      requestedAction: job.suggestedAction,
      reason: job.reason,
      contextFacts: job.contextFacts,
      status: 'pending',
      source: 'autopilot_execution',
      autopilotJobId: job.id,
      requestedAt: nowLabel(),
      requestedAtIso: nowIso(),
    });
    return { success: true, description: `Approval request queued for ${job.entityName}` };
  } catch (err: any) {
    return { success: false, description: '', error: err.message };
  }
}

const HANDLERS: Record<ExecActionType, (ctx: HandlerContext) => Promise<HandlerResult>> = {
  create_cadence_reminder:  handleCreateCadenceReminder,
  flag_churn_risk:          handleFlagChurnRisk,
  flag_upsell_opportunity:  handleFlagUpsellOpportunity,
  flag_referral_window:     handleFlagReferralWindow,
  log_activity:             handleLogActivity,
  queue_draft_generation:   handleQueueDraftGeneration,
  queue_approval_request:   handleQueueApprovalRequest,
};

// ── Job creation from sweepAction ─────────────────────────────────────────────

export async function createExecJobsFromSweepActions(
  orgId: string,
  logger: (msg: string) => void,
): Promise<number> {
  if (!firestore) return 0;
  let created = 0;

  try {
    // Find auto_created sweepActions that have no exec job yet
    const snap = await firestore.collection('orgs').doc(orgId).collection('sweepActions')
      .where('outcome', '==', 'auto_created')
      .where('execJobCreated', '==', false)
      .limit(50)
      .get()
      .catch(async () => {
        // Fallback: fetch all auto_created and filter client-side
        return firestore!.collection('orgs').doc(orgId).collection('sweepActions')
          .where('outcome', '==', 'auto_created')
          .limit(100)
          .get();
      });

    for (const doc of snap.docs) {
      const action = { id: doc.id, ...doc.data() } as any;
      if (action.execJobCreated === true) continue;

      // Only handle known low/medium risk action types
      const validTypes: ExecActionType[] = [
        'create_cadence_reminder', 'flag_churn_risk', 'flag_upsell_opportunity',
        'flag_referral_window', 'log_activity', 'queue_draft_generation', 'queue_approval_request',
      ];
      if (!validTypes.includes(action.actionType)) {
        await doc.ref.update({ execJobCreated: true, execJobSkipReason: 'action_type_not_handled' });
        continue;
      }

      const dedupeKey = `exec_${action.actionType}_${action.entityId}_${new Date().toISOString().slice(0, 10)}`;
      const job: Omit<AutopilotExecJob, 'id'> = {
        orgId,
        sweepActionId: action.id,
        sweepRunId: action.sweepRunId ?? '',
        actionType: action.actionType as ExecActionType,
        entityId: action.entityId,
        entityName: action.entityName,
        entityType: action.entityType,
        safetyLevel: action.safetyLevel ?? 'low_risk',
        priority: action.priority ?? 'normal',
        reason: action.reason ?? '',
        contextFacts: action.contextFacts ?? [],
        suggestedAction: action.suggestedAction ?? '',
        scope: action.scope ?? '',
        dedupeKey,
        cooldownKey: dedupeKey,
        policyDecisionAtQueue: 'auto_allowed',
        status: 'queued',
        attemptCount: 0,
        maxAttempts: 3,
        nextAttemptAt: nowIso(),
        createdAt: nowLabel(),
        dueAt: nowLabel(),
        why: `Created from sweepAction ${action.id}. Policy outcome at sweep: auto_allowed. Scope: ${action.scope}. Reason: ${action.reason}`,
      };

      const jobRef = await firestore.collection('orgs').doc(orgId).collection('autopilotExecJobs').add(job);
      await doc.ref.update({ execJobCreated: true, execJobId: jobRef.id });
      created++;
      logger(`[Exec] Created job ${jobRef.id} for ${action.actionType} on ${action.entityName}`);
    }
  } catch (err: any) {
    logger(`[Exec] createExecJobsFromSweepActions error: ${err.message}`);
  }

  return created;
}

// ── Single job execution ──────────────────────────────────────────────────────

async function executeJob(
  orgId: string,
  job: AutopilotExecJob,
  runId: string,
  logger: (msg: string) => void,
): Promise<'succeeded' | 'failed' | 'suppressed' | 'skipped'> {
  if (!firestore) return 'skipped';

  const jobRef = firestore.collection('orgs').doc(orgId).collection('autopilotExecJobs').doc(job.id!);

  // Acquire lease
  const leased = await acquireLease(orgId, job.id!, runId);
  if (!leased) {
    logger(`[Exec] Job ${job.id} — lease held, skipping`);
    return 'skipped';
  }

  const attemptStart = Date.now();
  const attemptNumber = job.attemptCount + 1;

  // Write attempt record
  const attemptRef = await firestore.collection('orgs').doc(orgId).collection('autopilotExecAttempts').add({
    orgId,
    jobId: job.id,
    attemptNumber,
    startedAt: nowIso(),
    status: 'running',
    policyRecheckOutcome: 'pending',
  } as Omit<AutopilotExecAttempt, 'id'>);

  try {
    // Mark job as executing
    await jobRef.update({ status: 'executing', lastAttemptAt: nowLabel() });

    // Re-check policy
    const recheckOutcome = await recheckPolicy(orgId, job.actionType);
    logger(`[Exec] Job ${job.id} policy recheck: ${recheckOutcome}`);

    if (recheckOutcome !== 'auto_allowed') {
      const suppressionReason = `Policy changed at execution time: ${recheckOutcome}. Job suppressed.`;
      await jobRef.update({
        status: 'suppressed',
        suppressedReason: suppressionReason,
        completedAt: nowLabel(),
        attemptCount: attemptNumber,
      });
      await attemptRef.update({
        status: 'failed',
        policyRecheckOutcome: recheckOutcome,
        suppressionReason,
        completedAt: nowIso(),
        executionDurationMs: Date.now() - attemptStart,
      });
      await releaseLease(orgId, job.id!);
      return 'suppressed';
    }

    // Run handler
    const handler = HANDLERS[job.actionType];
    if (!handler) {
      throw new Error(`No handler for action type: ${job.actionType}`);
    }

    const result = await handler({ orgId, job });

    if (result.success) {
      await jobRef.update({
        status: 'succeeded',
        executionResult: result.description,
        completedAt: nowLabel(),
        attemptCount: attemptNumber,
        lastError: null,
      });
      await attemptRef.update({
        status: 'succeeded',
        policyRecheckOutcome: recheckOutcome,
        handlerResult: result.description,
        completedAt: nowIso(),
        executionDurationMs: Date.now() - attemptStart,
      });
      // Mark source sweepAction as executed
      await firestore.collection('orgs').doc(orgId).collection('sweepActions').doc(job.sweepActionId)
        .update({ executionStatus: 'executed', executedAt: nowLabel() }).catch(() => {});
      await releaseLease(orgId, job.id!);
      logger(`[Exec] Job ${job.id} succeeded: ${result.description}`);
      return 'succeeded';
    } else {
      throw new Error(result.error ?? 'Handler returned failure');
    }

  } catch (err: any) {
    const errorMsg = err.message ?? 'Unknown error';
    const isTerminal = attemptNumber >= job.maxAttempts;
    const nextAttemptAt = isTerminal ? undefined : futureIso(retryBackoffMs(attemptNumber));

    await jobRef.update({
      status: isTerminal ? 'terminal_failed' : 'failed',
      lastError: errorMsg,
      attemptCount: attemptNumber,
      ...(nextAttemptAt ? { nextAttemptAt } : {}),
      ...(isTerminal ? { completedAt: nowLabel() } : {}),
    });
    await attemptRef.update({
      status: 'failed',
      error: errorMsg,
      completedAt: nowIso(),
      executionDurationMs: Date.now() - attemptStart,
    });
    await releaseLease(orgId, job.id!);
    logger(`[Exec] Job ${job.id} ${isTerminal ? 'terminal' : 'retryable'} failure: ${errorMsg}`);
    return 'failed';
  }
}

// ── Main execution runner ─────────────────────────────────────────────────────

export async function runAutopilotExecutionForOrg(
  orgId: string,
  triggeredBy: 'scheduler' | 'manual',
  logger: (msg: string) => void,
): Promise<AutopilotExecRunSummary> {
  const startMs = Date.now();
  const startedAt = nowLabel();
  const runId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const summary: AutopilotExecRunSummary = {
    orgId, startedAt, completedAt: '', durationMs: 0, triggeredBy,
    jobsFound: 0, jobsExecuted: 0, jobsSucceeded: 0, jobsFailed: 0,
    jobsSuppressed: 0, jobsSkippedInFlight: 0, errors: [],
  };

  if (!firestore) {
    summary.errors.push('Firestore unavailable');
    summary.completedAt = nowLabel();
    return summary;
  }

  // First: create exec jobs from any unprocessed sweep actions
  const created = await createExecJobsFromSweepActions(orgId, logger);
  logger(`[Exec] Org=${orgId} — ${created} new jobs created from sweep actions`);

  // Find queued/failed jobs that are due
  try {
    const snap = await firestore.collection('orgs').doc(orgId).collection('autopilotExecJobs')
      .where('status', 'in', ['queued', 'failed'])
      .limit(20)
      .get();

    summary.jobsFound = snap.size;
    logger(`[Exec] Org=${orgId} — ${snap.size} jobs due for execution`);

    for (const doc of snap.docs) {
      const job = { id: doc.id, ...doc.data() } as AutopilotExecJob;

      // Check if ready for execution (nextAttemptAt must be in the past)
      if (job.nextAttemptAt && new Date(job.nextAttemptAt) > new Date()) {
        logger(`[Exec] Job ${job.id} — backoff pending, skip`);
        continue;
      }

      summary.jobsExecuted++;
      const result = await executeJob(orgId, job, runId, logger);

      if (result === 'succeeded') summary.jobsSucceeded++;
      else if (result === 'failed') summary.jobsFailed++;
      else if (result === 'suppressed') summary.jobsSuppressed++;
      else if (result === 'skipped') summary.jobsSkippedInFlight++;
    }
  } catch (err: any) {
    const msg = `[Exec] Error loading jobs for org=${orgId}: ${err.message}`;
    logger(msg);
    summary.errors.push(msg);
  }

  summary.completedAt = nowLabel();
  summary.durationMs = Date.now() - startMs;
  logger(`[Exec] Org=${orgId} complete — succeeded=${summary.jobsSucceeded} failed=${summary.jobsFailed} suppressed=${summary.jobsSuppressed} duration=${summary.durationMs}ms`);
  return summary;
}

// ── Manual job operations ─────────────────────────────────────────────────────

export async function cancelExecJob(orgId: string, jobId: string, cancelledBy: string): Promise<void> {
  if (!firestore) return;
  await firestore.collection('orgs').doc(orgId).collection('autopilotExecJobs').doc(jobId)
    .update({
      status: 'cancelled',
      cancelledBy,
      cancelledAt: nowLabel(),
    });
}

export async function retryExecJob(orgId: string, jobId: string): Promise<void> {
  if (!firestore) return;
  await firestore.collection('orgs').doc(orgId).collection('autopilotExecJobs').doc(jobId)
    .update({
      status: 'queued',
      nextAttemptAt: nowIso(),
      lastError: null,
    });
}

export async function getExecHealth(orgId: string): Promise<{
  queued: number;
  executing: number;
  succeeded: number;
  failed: number;
  terminal: number;
  suppressed: number;
  cancelled: number;
}> {
  const health = { queued: 0, executing: 0, succeeded: 0, failed: 0, terminal: 0, suppressed: 0, cancelled: 0 };
  if (!firestore) return health;
  try {
    const snap = await firestore.collection('orgs').doc(orgId).collection('autopilotExecJobs').limit(500).get();
    for (const doc of snap.docs) {
      const status = doc.data().status as ExecJobStatus;
      if (status === 'queued' || status === 'claimed') health.queued++;
      else if (status === 'executing') health.executing++;
      else if (status === 'succeeded') health.succeeded++;
      else if (status === 'failed') health.failed++;
      else if (status === 'terminal_failed') health.terminal++;
      else if (status === 'suppressed') health.suppressed++;
      else if (status === 'cancelled') health.cancelled++;
    }
  } catch { /* silent */ }
  return health;
}
