// =============================================================================
// ERICA CAMPAIGN RUNNER
// =============================================================================
// Picks the next eligible target from a running campaign and launches the call.
//
// SELECTION CRITERIA (in order):
//   1. Campaign must be 'running'
//   2. Current time must be within calling window
//   3. Throttle limits (hourly + daily) must not be exceeded
//   4. Minimum gap between consecutive calls must be satisfied
//   5. Target must be 'queued' or 'retry_queued'
//   6. Target's batch item must have: phone, brief, policy eligibility
//
// EXECUTION:
//   - Uses existing launchEricaBatchItem (no bypass of existing guardrails)
//   - Updates target status → calling → called/failed
//   - Writes a campaign run record
//   - Updates throttle counters
//   - Triggers outcome refresh
// =============================================================================

import { v4 as uuid } from 'uuid';
import { firestore } from '../firebase';
import { launchEricaBatchItem } from './vapiLaunchService';
import {
  writeCampaignAudit,
  refreshCampaignOutcome,
  toHourBucket,
  toDayBucket,
} from './campaignService';
import type {
  EricaCallingCampaign,
  EricaCampaignTargetState,
  EricaCampaignRun,
  EricaCampaignHealth,
  EricaCampaignHealthFlag,
} from './campaignTypes';

// ---------------------------------------------------------------------------
// Main entry point: run one cycle for a campaign
// ---------------------------------------------------------------------------

export interface CampaignRunResult {
  executed:    boolean;
  outcome:     EricaCampaignRun['outcome'] | 'no_action';
  targetId?:   string;
  targetName?: string;
  callId?:     string;
  reason:      string;
  health:      EricaCampaignHealth;
}

export async function runCampaignCycle(
  orgId:      string,
  campaignId: string,
): Promise<CampaignRunResult> {
  const db  = firestore;
  const now = new Date();

  if (!db) {
    return buildResult(false, 'no_action', 'Firestore not initialised',
      buildHealth(false, ['batch_not_found'], null));
  }

  // ── Load campaign ─────────────────────────────────────────────────────────
  const campaignSnap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId).get();
  if (!campaignSnap.exists) {
    return buildResult(false, 'no_action', `Campaign ${campaignId} not found`,
      buildHealth(false, ['batch_not_found'], null));
  }

  const campaign = campaignSnap.data() as EricaCallingCampaign;

  // ── Status check ──────────────────────────────────────────────────────────
  if (campaign.status !== 'running') {
    return buildResult(false, 'no_action',
      `Campaign is ${campaign.status} — not running`,
      buildHealth(false, [], null));
  }

  // ── Date range check ──────────────────────────────────────────────────────
  const schedule = campaign.schedule;
  if (schedule.type === 'date_range') {
    if (schedule.toDate && now > new Date(schedule.toDate + 'T23:59:59')) {
      await db.collection('orgs').doc(orgId)
        .collection('ericaCampaigns').doc(campaignId)
        .set({ status: 'completed', completedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      return buildResult(false, 'no_action', 'Campaign date range expired — marked completed',
        buildHealth(false, ['schedule_expired'], null));
    }
    if (schedule.fromDate && now < new Date(schedule.fromDate)) {
      return buildResult(false, 'no_action', `Campaign starts ${schedule.fromDate}`,
        buildHealth(false, ['schedule_not_started'], schedule.fromDate));
    }
  }

  if (schedule.type === 'scheduled_start' && schedule.startAt) {
    if (now < new Date(schedule.startAt)) {
      return buildResult(false, 'no_action', `Campaign starts ${schedule.startAt}`,
        buildHealth(false, ['schedule_not_started'], schedule.startAt));
    }
  }

  // ── Calling window check ──────────────────────────────────────────────────
  const windowCheck = isWithinCallingWindow(now, schedule.window);
  if (!windowCheck.allowed) {
    const nextWindow = nextWindowOpen(now, schedule.window);
    return buildResult(false, 'no_action',
      `Outside calling window (${schedule.window.startHour}:${pad(schedule.window.startMinute)}–${schedule.window.endHour}:${pad(schedule.window.endMinute)} ${schedule.window.timezone})`,
      buildHealth(false, ['outside_calling_window'], nextWindow));
  }

  // ── Throttle check — reset buckets if needed ──────────────────────────────
  const nowHourBucket = toHourBucket(now.toISOString());
  const nowDayBucket  = toDayBucket(now.toISOString());

  let callsThisHour = campaign.callsThisHour ?? 0;
  let callsToday    = campaign.callsToday    ?? 0;

  if (campaign.hourBucket !== nowHourBucket) callsThisHour = 0;
  if (campaign.dayBucket  !== nowDayBucket)  callsToday    = 0;

  const throttle = schedule.throttle;

  if (callsThisHour >= throttle.maxCallsPerHour) {
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    return buildResult(false, 'no_action',
      `Hourly limit reached (${throttle.maxCallsPerHour}/hr)`,
      buildHealth(false, ['throttle_limit_reached_hour'], nextHour.toISOString()));
  }

  if (callsToday >= throttle.maxCallsPerDay) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(schedule.window.startHour, schedule.window.startMinute, 0, 0);
    return buildResult(false, 'no_action',
      `Daily limit reached (${throttle.maxCallsPerDay}/day)`,
      buildHealth(false, ['throttle_limit_reached_day'], tomorrow.toISOString()));
  }

  // ── Gap between calls ─────────────────────────────────────────────────────
  if (campaign.lastRunAt) {
    const secsSinceLast = (now.getTime() - new Date(campaign.lastRunAt).getTime()) / 1000;
    if (secsSinceLast < throttle.secondsBetweenCalls) {
      const waitSecs = Math.ceil(throttle.secondsBetweenCalls - secsSinceLast);
      const nextAt   = new Date(now.getTime() + waitSecs * 1000);
      return buildResult(false, 'no_action',
        `Waiting ${waitSecs}s between calls`,
        buildHealth(true, [], nextAt.toISOString()));
    }
  }

  // ── Pick next eligible target ─────────────────────────────────────────────
  const target = await pickNextTarget(db, orgId, campaignId);

  if (!target) {
    // Check if all targets are done
    const allDone = await areAllTargetsDone(db, orgId, campaignId);
    if (allDone) {
      await db.collection('orgs').doc(orgId)
        .collection('ericaCampaigns').doc(campaignId)
        .set({ status: 'completed', completedAt: now.toISOString(), updatedAt: now.toISOString() }, { merge: true });
      return buildResult(false, 'no_action', 'All targets processed — campaign completed',
        buildHealth(false, ['all_targets_called'], null));
    }
    return buildResult(false, 'no_action', 'No eligible targets at this time',
      buildHealth(false, ['no_eligible_targets'], null));
  }

  // ── Mark target as calling ────────────────────────────────────────────────
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignTargets').doc(target.targetId)
    .set({ status: 'calling', calledAt: now.toISOString() }, { merge: true });

  // ── Launch call via existing bridge ──────────────────────────────────────
  const runId = uuid();
  let runRecord: EricaCampaignRun = {
    runId, campaignId, orgId,
    startedAt:   now.toISOString(),
    targetId:    target.targetId,
    targetName:  target.entityName,
    batchItemId: target.batchItemId,
    outcome:     'launched',
  };

  try {
    const launchResult = await launchEricaBatchItem({
      orgId,
      batchId:     target.batchId,
      itemId:      target.batchItemId,
      launchedBy:  `campaign:${campaignId}`,
    });

    if (!launchResult.success) {
      const isPolicy = !!launchResult.blockedReason;
      const reason   = launchResult.blockedReason ?? launchResult.error ?? 'Launch failed';

      await db.collection('orgs').doc(orgId)
        .collection('ericaCampaignTargets').doc(target.targetId)
        .set({
          status:     isPolicy ? 'suppressed' : 'failed',
          failReason: reason,
        }, { merge: true });

      runRecord = {
        ...runRecord,
        endedAt: new Date().toISOString(),
        outcome: isPolicy ? 'suppressed' : 'failed',
        reason,
      };
    } else {
      runRecord = {
        ...runRecord,
        callId:  launchResult.callId,
        outcome: 'launched',
      };

      await db.collection('orgs').doc(orgId)
        .collection('ericaCampaignTargets').doc(target.targetId)
        .set({
          status: 'calling',
          callId: launchResult.callId,
        }, { merge: true });
    }
  } catch (err: any) {
    const failReason = `Unexpected launch error: ${err.message}`;
    await db.collection('orgs').doc(orgId)
      .collection('ericaCampaignTargets').doc(target.targetId)
      .set({ status: 'failed', failReason }, { merge: true });

    runRecord = {
      ...runRecord,
      endedAt: new Date().toISOString(),
      outcome: 'failed',
      reason:  failReason,
    };
  }

  // ── Write run record ──────────────────────────────────────────────────────
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignRuns').doc(runId)
    .set(runRecord);

  // ── Update throttle counters and lastRunAt ────────────────────────────────
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set({
      lastRunAt:     now.toISOString(),
      callsThisHour: callsThisHour + 1,
      callsToday:    callsToday + 1,
      hourBucket:    nowHourBucket,
      dayBucket:     nowDayBucket,
      updatedAt:     now.toISOString(),
    }, { merge: true });

  // ── Refresh outcome counters ──────────────────────────────────────────────
  await refreshCampaignOutcome(db, orgId, campaignId);

  // ── Write audit ───────────────────────────────────────────────────────────
  await writeCampaignAudit(db, orgId, campaignId,
    runRecord.outcome === 'launched' ? 'call_launched' : `call_${runRecord.outcome}`,
    `campaign:${campaignId}`,
    `Target ${target.entityName}: ${runRecord.outcome}${runRecord.reason ? ` — ${runRecord.reason}` : ''}`,
    { targetId: target.targetId, batchItemId: target.batchItemId, callId: runRecord.callId },
  );

  return {
    executed:    runRecord.outcome === 'launched',
    outcome:     runRecord.outcome,
    targetId:    target.targetId,
    targetName:  target.entityName,
    callId:      runRecord.callId,
    reason:      runRecord.reason ?? 'Call launched',
    health:      buildHealth(true, [], null),
  };
}

// ---------------------------------------------------------------------------
// Compute campaign health snapshot (non-mutating)
// ---------------------------------------------------------------------------

export async function computeCampaignHealth(
  orgId:      string,
  campaignId: string,
): Promise<EricaCampaignHealth> {
  const db  = firestore;
  const now = new Date();

  if (!db) return buildHealth(false, ['batch_not_found'], null);

  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId).get();
  if (!snap.exists) return buildHealth(false, ['batch_not_found'], null);

  const campaign = snap.data() as EricaCallingCampaign;
  const flags: EricaCampaignHealthFlag[] = [];

  if (!isWithinCallingWindow(now, campaign.schedule.window).allowed) {
    flags.push('outside_calling_window');
  }

  const callsThisHour = campaign.hourBucket === toHourBucket(now.toISOString())
    ? campaign.callsThisHour : 0;
  const callsToday = campaign.dayBucket === toDayBucket(now.toISOString())
    ? campaign.callsToday : 0;

  if (callsThisHour >= campaign.schedule.throttle.maxCallsPerHour) {
    flags.push('throttle_limit_reached_hour');
  }
  if (callsToday >= campaign.schedule.throttle.maxCallsPerDay) {
    flags.push('throttle_limit_reached_day');
  }

  const allDone = await areAllTargetsDone(db, orgId, campaignId);
  if (allDone) flags.push('all_targets_called');

  const nextWindow = flags.includes('outside_calling_window')
    ? nextWindowOpen(now, campaign.schedule.window)
    : null;

  return buildHealth(flags.length === 0, flags, nextWindow);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function pickNextTarget(
  db:         FirebaseFirestore.Firestore,
  orgId:      string,
  campaignId: string,
): Promise<EricaCampaignTargetState | null> {
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignTargets')
    .where('campaignId', '==', campaignId)
    .where('status', 'in', ['queued', 'retry_queued'])
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].data() as EricaCampaignTargetState;
}

async function areAllTargetsDone(
  db:         FirebaseFirestore.Firestore,
  orgId:      string,
  campaignId: string,
): Promise<boolean> {
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCampaignTargets')
    .where('campaignId', '==', campaignId)
    .where('status', 'in', ['queued', 'calling', 'retry_queued'])
    .limit(1)
    .get();
  return snap.empty;
}

function isWithinCallingWindow(
  now:    Date,
  window: EricaCallingCampaign['schedule']['window'],
): { allowed: boolean; reason?: string } {
  // Day of week check (in UTC for simplicity; operator sets times in their TZ)
  const day = now.getUTCDay();
  if (!window.allowedDays.includes(day)) {
    return { allowed: false, reason: 'Not an allowed day' };
  }

  // Time check (compare using UTC hours + offset is complex; we use a simple approach:
  // convert current time to the target timezone using Intl)
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: window.timezone,
    hour:     'numeric',
    minute:   'numeric',
    hour12:   false,
  });
  const parts   = formatter.formatToParts(now);
  const hPart   = parts.find(p => p.type === 'hour');
  const mPart   = parts.find(p => p.type === 'minute');
  const h       = parseInt(hPart?.value ?? '0', 10);
  const m       = parseInt(mPart?.value ?? '0', 10);
  const minutes = h * 60 + m;

  const startMin = window.startHour * 60 + window.startMinute;
  const endMin   = window.endHour   * 60 + window.endMinute;

  if (minutes < startMin || minutes >= endMin) {
    return { allowed: false, reason: `Outside hours (${h}:${pad(m)} in ${window.timezone})` };
  }

  return { allowed: true };
}

function nextWindowOpen(now: Date, window: EricaCallingCampaign['schedule']['window']): string {
  // Simple: add hours until we're in the window
  const candidate = new Date(now);
  candidate.setMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 8; i++) {
    candidate.setHours(candidate.getHours() + 1);
    if (isWithinCallingWindow(candidate, window).allowed) {
      return candidate.toISOString();
    }
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function buildHealth(
  healthy:       boolean,
  flags:         EricaCampaignHealthFlag[],
  nextEligible:  string | null,
): EricaCampaignHealth {
  return { healthy, flags, nextEligible, checkedAt: new Date().toISOString() };
}

function buildResult(
  executed: boolean,
  outcome:  CampaignRunResult['outcome'],
  reason:   string,
  health:   EricaCampaignHealth,
): CampaignRunResult {
  return { executed, outcome, reason, health };
}

function pad(n: number): string { return String(n).padStart(2, '0'); }
