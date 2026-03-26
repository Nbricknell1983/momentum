// =============================================================================
// ERICA CAMPAIGN SCHEDULER
// =============================================================================
// Background process that runs every 60 seconds and checks whether any
// running Erica campaign has work to do.
//
// For each campaign in 'running' or 'scheduled' state:
//   1. Check if it should now be running (scheduled_start / date_range)
//   2. If running, execute one campaign cycle (pick next target + launch)
//   3. Update campaign health snapshot
//
// This scheduler never creates targets, bypasses briefs, or overrides policy.
// It is the equivalent of a cron that calls runCampaignCycle() for each
// eligible campaign once per interval.
//
// SAFETY: If Erica cannot find a valid target or the window is closed,
// runCampaignCycle() does nothing. The scheduler is harmless to run frequently.
// =============================================================================

import { firestore } from '../firebase';
import { runCampaignCycle, computeCampaignHealth } from './campaignRunner';
import type { EricaCallingCampaign } from './campaignTypes';

const CHECK_INTERVAL_MS = 60 * 1000; // every 60 seconds
let schedulerHandle: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// After a FAILED_PRECONDITION (missing index), suppress collection-group queries
// until the app restarts — they will start working once the index is built in Firebase console.
let collectionGroupDisabled = false;

// ---------------------------------------------------------------------------
// Start the campaign scheduler
// ---------------------------------------------------------------------------

export function startCampaignScheduler(): void {
  if (schedulerHandle) return;

  console.log('[campaign-scheduler] Campaign scheduler started (60s interval)');
  schedulerHandle = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await checkAllCampaigns();
    } catch (err: any) {
      console.error('[campaign-scheduler] Unexpected error:', err.message);
    } finally {
      isRunning = false;
    }
  }, CHECK_INTERVAL_MS);
}

export function stopCampaignScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
    console.log('[campaign-scheduler] Stopped');
  }
}

// ---------------------------------------------------------------------------
// Internal: scan all orgs for running/scheduled campaigns
// ---------------------------------------------------------------------------

async function checkAllCampaigns(): Promise<void> {
  const db = firestore;
  if (!db) return;

  if (collectionGroupDisabled) {
    // Index not built yet — skip silently until app is restarted after index creation
    return;
  }

  try {
    const snap = await db.collectionGroup('ericaCampaigns')
      .where('status', 'in', ['running', 'scheduled'])
      .get();

    if (snap.empty) return;

    const campaigns = snap.docs.map(d => ({ ...d.data() } as EricaCallingCampaign));

    for (const campaign of campaigns) {
      try {
        await processCampaign(campaign);
      } catch (err: any) {
        console.warn(`[campaign-scheduler] Error processing campaign ${campaign.campaignId}:`, err.message);
      }
    }
  } catch (err: any) {
    // FAILED_PRECONDITION (code 9) = Firestore index not yet created.
    // Suppress until restart — log once clearly.
    const isMissingIndex = err.code === 9 || String(err.message).includes('FAILED_PRECONDITION');
    if (isMissingIndex) {
      collectionGroupDisabled = true;
      console.warn(
        '[campaign-scheduler] Firestore index required for automated campaign scheduling. ' +
        'Go to Firebase Console → Firestore → Indexes and create a collection group index on ' +
        `\`ericaCampaigns\` with field \`status\` (ascending). ` +
        'Campaigns can still be triggered manually via the Campaigns tab. ' +
        'Automatic scheduling will resume after the index is built and the server is restarted.'
      );
    } else {
      console.warn('[campaign-scheduler] Query failed:', err.message);
    }
  }
}

async function processCampaign(campaign: EricaCallingCampaign): Promise<void> {
  const { orgId, campaignId } = campaign;
  const db = firestore;
  if (!db) return;

  // If scheduled, check if start time has been reached
  if (campaign.status === 'scheduled') {
    const schedule = campaign.schedule;
    const now      = new Date();
    let shouldStart = false;

    if (schedule.type === 'immediate') {
      shouldStart = true;
    } else if (schedule.type === 'scheduled_start' && schedule.startAt) {
      shouldStart = new Date(schedule.startAt) <= now;
    } else if (schedule.type === 'date_range' && schedule.fromDate) {
      shouldStart = new Date(schedule.fromDate) <= now;
    }

    if (!shouldStart) {
      return;
    }

    // Transition to running
    await db.collection('orgs').doc(orgId)
      .collection('ericaCampaigns').doc(campaignId)
      .set({
        status:    'running',
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }, { merge: true });
    console.log(`[campaign-scheduler] Campaign ${campaignId} transitioned to running`);
  }

  // Run one cycle
  const result = await runCampaignCycle(orgId, campaignId);

  if (result.executed) {
    console.log(`[campaign-scheduler] Campaign ${campaignId}: launched call to ${result.targetName ?? 'unknown'}`);
  }

  // Update health snapshot on the campaign doc
  const health = await computeCampaignHealth(orgId, campaignId);
  await db.collection('orgs').doc(orgId)
    .collection('ericaCampaigns').doc(campaignId)
    .set({ health, updatedAt: new Date().toISOString() }, { merge: true });
}
