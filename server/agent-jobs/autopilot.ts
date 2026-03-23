/**
 * Autopilot Orchestrator — proactive agent job scanner
 *
 * Scans all active leads and clients, determines which taskTypes are due
 * (TTL expired or never run), and enqueues agent jobs with full
 * idempotency, dependency, back-pressure, and per-org cap guardrails.
 */

import type { Firestore } from 'firebase-admin/firestore';
import {
  createAgentJob,
  findJobByIdempotencyKey,
  listAgentJobs,
} from './firestore-helpers';
import {
  findLatestSuccessfulRun,
  ensureDepsSatisfied,
} from './history';
import { resolveAgentId, makeIdempotencyKey, getDependencies } from './router';
import { TASK_TYPES, TASK_TTL_MS, getTtlMs, DEFAULT_MAX_RETRIES } from './contracts';
import { AutomationRulesSchema, AUTOMATION_RULES_DEFAULTS } from '../../shared/controlPlaneSchemas';
import type { EntityType } from './types';

// ─── Config ────────────────────────────────────────────────────────────────────

export const AUTOPILOT_DEFAULTS = {
  SCAN_LIMIT_PER_ORG: parseInt(process.env.AUTOPILOT_SCAN_LIMIT_PER_ORG || '50', 10),
  GLOBAL_QUEUE_MAX:   parseInt(process.env.AUTOPILOT_GLOBAL_QUEUE_MAX   || '1000', 10),
  ENABLE:             process.env.AUTOPILOT_ENABLE !== 'false',
  ENTITY_PAGE_SIZE:   100,
  QUIET_HOURS_START:  parseInt(process.env.AUTOPILOT_QUIET_START || '22', 10), // 22:00 UTC
  QUIET_HOURS_END:    parseInt(process.env.AUTOPILOT_QUIET_END   || '6',  10), // 06:00 UTC
};

// Default task order: enrichment first, then presence signals, then analysis
const DEFAULT_TASK_SCAN_ORDER = [
  TASK_TYPES.ENRICHMENT,
  TASK_TYPES.WEBSITE_XRAY,
  TASK_TYPES.SERP,
  TASK_TYPES.GBP,
  TASK_TYPES.ADS,
  TASK_TYPES.STRATEGY,
  TASK_TYPES.GROWTH_PRESCRIPTION,
  TASK_TYPES.PREP,
];

export interface AutopilotScanOptions {
  orgId?:      string;      // target a single org
  taskTypes?:  string[];    // filter to specific task types
  limit?:      number;      // override per-org cap
  force?:      boolean;     // bypass TTL guard on enqueued jobs
  entityType?: EntityType;  // scan only 'lead' | 'client'
}

export interface AutopilotScanResult {
  scannedOrgs:      number;
  scannedEntities:  number;
  enqueuedJobs:     number;
  skippedTtl:       number;
  skippedIdempotent:number;
  skippedCap:       number;
  skippedDepsMissing:number;
  enqueuedDeps:     number;
  globalQueueDepth: number;
  backpressure:     boolean;
  byTaskType:       Record<string, number>;
  byOrg:            Record<string, number>;
  durationMs:       number;
}

// ─── Main scanner ───────────────────────────────────────────────────────────────

export async function runAutopilotScan(
  db: Firestore,
  options: AutopilotScanOptions = {}
): Promise<AutopilotScanResult> {
  const startedAt = Date.now();
  const result: AutopilotScanResult = {
    scannedOrgs:       0,
    scannedEntities:   0,
    enqueuedJobs:      0,
    skippedTtl:        0,
    skippedIdempotent: 0,
    skippedCap:        0,
    skippedDepsMissing:0,
    enqueuedDeps:      0,
    globalQueueDepth:  0,
    backpressure:      false,
    byTaskType:        {},
    byOrg:             {},
    durationMs:        0,
  };

  if (!AUTOPILOT_DEFAULTS.ENABLE) {
    console.log('[autopilot] AUTOPILOT_ENABLE=false — scan skipped');
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  if (isQuietHours()) {
    console.log('[autopilot] Quiet hours — scan skipped');
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  // ── Global queue depth check ───────────────────────────────────────────────
  const globalDepth = await getGlobalQueueDepth(db, options.orgId);
  result.globalQueueDepth = globalDepth;

  if (globalDepth >= AUTOPILOT_DEFAULTS.GLOBAL_QUEUE_MAX) {
    console.warn(`[autopilot] Back-pressure: global queue depth ${globalDepth} >= ${AUTOPILOT_DEFAULTS.GLOBAL_QUEUE_MAX}`);
    result.backpressure = true;
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  const taskTypes = options.taskTypes?.length
    ? options.taskTypes
    : DEFAULT_TASK_SCAN_ORDER;

  const scanEntities = options.entityType
    ? [options.entityType === 'client' ? 'clients' : 'leads']
    : ['leads', 'clients'];

  // ── Org iteration ──────────────────────────────────────────────────────────
  let orgsSnap;
  if (options.orgId) {
    const orgDoc = await db.collection('orgs').doc(options.orgId).get();
    orgsSnap = orgDoc.exists ? [orgDoc] : [];
  } else {
    const snap = await db.collection('orgs').get();
    orgsSnap = snap.docs;
  }

  for (const orgDoc of orgsSnap) {
    const orgId = orgDoc.id;
    const orgData = orgDoc.data() || {};
    if (orgData.suspended || orgData.autopilotDisabled) continue;

    // ── Read org-level autopilot overrides from Firestore ─────────────────────
    let orgRules = AUTOMATION_RULES_DEFAULTS;
    try {
      const rulesSnap = await db
        .collection('orgs').doc(orgId)
        .collection('settings').doc('automationRules')
        .get();
      if (rulesSnap.exists) {
        const parsed = AutomationRulesSchema.safeParse(rulesSnap.data());
        if (parsed.success) orgRules = parsed.data;
      }
    } catch (e) {
      console.warn(`[autopilot] Failed to read org rules for ${orgId}, using defaults:`, e);
    }

    // Org-level autopilot kill-switch
    if (orgRules.autopilotEnabled === false) {
      console.log(`[autopilot] Org ${orgId} has autopilotEnabled=false — skipping`);
      continue;
    }

    // Org-level quiet hours (use org setting, fall back to env defaults)
    const orgQuietStart = parseInt((orgRules.quietHoursUtc?.start ?? `${AUTOPILOT_DEFAULTS.QUIET_HOURS_START}:00`).split(':')[0], 10);
    const orgQuietEnd   = parseInt((orgRules.quietHoursUtc?.end   ?? `${AUTOPILOT_DEFAULTS.QUIET_HOURS_END}:00`).split(':')[0], 10);
    if (isQuietHoursRange(orgQuietStart, orgQuietEnd)) {
      console.log(`[autopilot] Org ${orgId} quiet hours (${orgRules.quietHoursUtc?.start}–${orgRules.quietHoursUtc?.end} UTC) — skipping`);
      continue;
    }

    result.scannedOrgs++;
    result.byOrg[orgId] = 0;

    // Cap: org setting overrides env, options.limit overrides all
    const perOrgCap = options.limit ?? orgRules.perDayCap ?? AUTOPILOT_DEFAULTS.SCAN_LIMIT_PER_ORG;

    // Task type filtering from org rules
    let orgTaskTypes = taskTypes;
    if (orgRules.taskTypeAllow && orgRules.taskTypeAllow.length > 0) {
      orgTaskTypes = taskTypes.filter(t => orgRules.taskTypeAllow!.includes(t));
    } else if (orgRules.taskTypeDeny && orgRules.taskTypeDeny.length > 0) {
      orgTaskTypes = taskTypes.filter(t => !orgRules.taskTypeDeny!.includes(t));
    }

    let orgEnqueued = 0;

    for (const collectionName of scanEntities) {
      const entityType: EntityType = collectionName === 'clients' ? 'client' : 'lead';

      // Paginate through entities
      let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
      let pageHasMore = true;

      while (pageHasMore) {
        let query = db
          .collection('orgs').doc(orgId)
          .collection(collectionName)
          .orderBy('createdAt', 'asc')
          .limit(AUTOPILOT_DEFAULTS.ENTITY_PAGE_SIZE);

        if (lastDoc) query = query.startAfter(lastDoc);

        const page = await query.get();
        if (page.empty) break;
        pageHasMore = page.size === AUTOPILOT_DEFAULTS.ENTITY_PAGE_SIZE;
        lastDoc = page.docs[page.docs.length - 1];

        for (const entityDoc of page.docs) {
          const entityId = entityDoc.id;
          const entityData = entityDoc.data() || {};
          result.scannedEntities++;

          // Skip deleted / inactive entities
          if (entityData.deleted || entityData.status === 'archived') continue;

          // ── Per-entity TTL evaluation ──────────────────────────────────────
          for (const taskType of orgTaskTypes) {
            if (orgEnqueued >= perOrgCap) {
              result.skippedCap++;
              continue;
            }

            // Check global back-pressure periodically
            if (result.enqueuedJobs > 0 && result.enqueuedJobs % 25 === 0) {
              const currentDepth = await getGlobalQueueDepth(db, options.orgId);
              if (currentDepth >= AUTOPILOT_DEFAULTS.GLOBAL_QUEUE_MAX) {
                result.backpressure = true;
                console.warn(`[autopilot] Back-pressure hit mid-scan at depth ${currentDepth}`);
                result.durationMs = Date.now() - startedAt;
                return result;
              }
            }

            // Build input for this task type + entity
            const input = buildEntityInput(orgId, entityType, entityId, entityData, taskType);
            if (!input) continue; // entity lacks required fields for this task

            // Compute idempotency key
            const idempotencyKey = makeIdempotencyKey({ taskType, entityType, entityId, input });

            // Idempotency check — skip if already queued/running/completed within TTL
            const existing = await findJobByIdempotencyKey(db, orgId, idempotencyKey);
            if (existing && !options.force) {
              result.skippedIdempotent++;
              continue;
            }

            // TTL guard — skip if successful run is still fresh
            if (!options.force) {
              const ttlMs = getTtlMs(taskType);
              const latest = await findLatestSuccessfulRun(db, orgId, entityType, entityId, taskType);
              if (latest?.completedAt) {
                const age = Date.now() - new Date(latest.completedAt).getTime();
                if (age < ttlMs) {
                  result.skippedTtl++;
                  continue;
                }
              }
            }

            // Dependency check — enqueue missing deps first
            const depTaskTypes = getDependencies(taskType);
            if (depTaskTypes.length > 0) {
              const depCheck = await ensureDepsSatisfied(db, orgId, entityType, entityId, depTaskTypes);
              if (!depCheck.satisfied) {
                // Enqueue each missing dep (idempotent)
                for (const depTaskType of depCheck.missingTaskTypes) {
                  const depInput = buildEntityInput(orgId, entityType, entityId, entityData, depTaskType);
                  if (!depInput) continue;
                  const depKey = makeIdempotencyKey({ taskType: depTaskType, entityType, entityId, input: depInput });
                  const depExisting = await findJobByIdempotencyKey(db, orgId, depKey);
                  if (depExisting) continue;

                  await createAgentJob(db, {
                    orgId,
                    taskType:       depTaskType,
                    agentId:        resolveAgentId(depTaskType),
                    entityType,
                    entityId,
                    version:        '1.0',
                    idempotencyKey: depKey,
                    input:          depInput,
                    force:          false,
                    dependsOn:      [],
                    retryCount:     0,
                    maxRetries:     DEFAULT_MAX_RETRIES,
                    nextAttemptAt:  null,
                    createdAt:      new Date().toISOString(),
                  });
                  result.enqueuedDeps++;
                  orgEnqueued++;
                }
                result.skippedDepsMissing++;
                continue;
              }
            }

            // ── Enqueue the job ──────────────────────────────────────────────
            await createAgentJob(db, {
              orgId,
              taskType,
              agentId:        resolveAgentId(taskType),
              entityType,
              entityId,
              version:        '1.0',
              idempotencyKey,
              input,
              force:          options.force ?? false,
              dependsOn:      getDependencies(taskType).map(t => ({ taskType: t })),
              retryCount:     0,
              maxRetries:     DEFAULT_MAX_RETRIES,
              nextAttemptAt:  null,
              createdAt:      new Date().toISOString(),
            });

            result.enqueuedJobs++;
            orgEnqueued++;
            result.byOrg[orgId] = (result.byOrg[orgId] || 0) + 1;
            result.byTaskType[taskType] = (result.byTaskType[taskType] || 0) + 1;

            console.log(`[autopilot] Enqueued ${taskType} for ${entityType}/${entityId} in org ${orgId}`);
          }
        }
      }
    }
  }

  result.durationMs = Date.now() - startedAt;
  console.log(`[autopilot] Scan complete: ${result.enqueuedJobs} enqueued, ${result.skippedTtl} ttl-skipped, ${result.skippedIdempotent} idempotent, ${result.scannedEntities} entities in ${result.durationMs}ms`);
  return result;
}

// ─── Health stats ──────────────────────────────────────────────────────────────

export interface QueueHealthStats {
  queued:       number;
  running:      number;
  failed24h:    number;
  ttlSkips24h:  number;
  deadLetter:   number;
  byTaskType:   Record<string, { queued: number; running: number; failed24h: number; skipped24h: number }>;
  alertFlags:   string[];
}

export async function getQueueHealthStats(
  db: Firestore,
  orgId: string
): Promise<QueueHealthStats> {
  const jobsCol = db.collection('orgs').doc(orgId).collection('agentJobs');
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [queuedSnap, runningSnap, failed24Snap, skippedSnap, deadLetterSnap] = await Promise.all([
    jobsCol.where('status', '==', 'queued').count().get(),
    jobsCol.where('status', '==', 'running').count().get(),
    jobsCol.where('status', 'in', ['failed', 'failed_validation'])
           .where('completedAt', '>=', since24h).count().get(),
    jobsCol.where('status', '==', 'skipped')
           .where('completedAt', '>=', since24h).count().get(),
    db.collection('orgs').doc(orgId).collection('agentJobs_deadletter').count().get(),
  ]);

  const stats: QueueHealthStats = {
    queued:      queuedSnap.data().count,
    running:     runningSnap.data().count,
    failed24h:   failed24Snap.data().count,
    ttlSkips24h: skippedSnap.data().count,
    deadLetter:  deadLetterSnap.data().count,
    byTaskType:  {},
    alertFlags:  [],
  };

  // Per-task breakdown
  const taskTypes = Object.values(TASK_TYPES) as string[];
  await Promise.all(taskTypes.map(async taskType => {
    const [tQueued, tRunning, tFailed, tSkipped] = await Promise.all([
      jobsCol.where('taskType', '==', taskType).where('status', '==', 'queued').count().get(),
      jobsCol.where('taskType', '==', taskType).where('status', '==', 'running').count().get(),
      jobsCol.where('taskType', '==', taskType).where('status', 'in', ['failed', 'failed_validation']).where('completedAt', '>=', since24h).count().get(),
      jobsCol.where('taskType', '==', taskType).where('status', '==', 'skipped').where('completedAt', '>=', since24h).count().get(),
    ]);
    stats.byTaskType[taskType] = {
      queued:     tQueued.data().count,
      running:    tRunning.data().count,
      failed24h:  tFailed.data().count,
      skipped24h: tSkipped.data().count,
    };
  }));

  // Alert flag detection
  if (stats.failed24h > 10) {
    stats.alertFlags.push(`HIGH_FAILURE_RATE: ${stats.failed24h} failures in last 24h`);
  }
  if (stats.deadLetter > 0) {
    stats.alertFlags.push(`DEAD_LETTER: ${stats.deadLetter} jobs in dead-letter queue`);
  }
  if (stats.running > 20) {
    stats.alertFlags.push(`HIGH_CONCURRENCY: ${stats.running} jobs currently running`);
  }

  // Stale running jobs (started > 30 min ago)
  const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const staleSnap = await jobsCol
    .where('status', '==', 'running')
    .where('startedAt', '<', staleThreshold)
    .count().get();
  const staleCount = staleSnap.data().count;
  if (staleCount > 0) {
    stats.alertFlags.push(`STALE_RUNNING: ${staleCount} jobs stuck running >30m`);
  }

  return stats;
}

// ─── Dead-letter operations ────────────────────────────────────────────────────

export async function moveToDeadLetter(
  db: Firestore,
  orgId: string,
  jobId: string,
  job: Record<string, any>
): Promise<void> {
  const dlRef = db.collection('orgs').doc(orgId).collection('agentJobs_deadletter').doc(jobId);
  await dlRef.set({
    ...job,
    deadLetteredAt: new Date().toISOString(),
    originalJobId:  jobId,
  });
  // Optionally delete from main queue to keep it lean
  await db.collection('orgs').doc(orgId).collection('agentJobs').doc(jobId).delete();
  console.log(`[autopilot] Job ${jobId} moved to dead-letter queue`);
}

export async function reviveFromDeadLetter(
  db: Firestore,
  orgId: string,
  jobId: string
): Promise<string | null> {
  const dlRef = db.collection('orgs').doc(orgId).collection('agentJobs_deadletter').doc(jobId);
  const snap  = await dlRef.get();
  if (!snap.exists) return null;

  const job = snap.data()!;
  const newJobRef = db.collection('orgs').doc(orgId).collection('agentJobs').doc();

  await newJobRef.set({
    ...job,
    id:            newJobRef.id,
    status:        'queued',
    retryCount:    0,
    error:         null,
    startedAt:     null,
    completedAt:   null,
    nextAttemptAt: null,
    revivedFrom:   jobId,
    revivedAt:     new Date().toISOString(),
  });

  // Remove from dead-letter
  await dlRef.delete();
  console.log(`[autopilot] Job ${jobId} revived as ${newJobRef.id}`);
  return newJobRef.id;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true during configured UTC quiet hours (using global env defaults). */
function isQuietHours(): boolean {
  const hour = new Date().getUTCHours();
  const { QUIET_HOURS_START, QUIET_HOURS_END } = AUTOPILOT_DEFAULTS;
  return isQuietHoursRange(QUIET_HOURS_START, QUIET_HOURS_END);
}

/** Returns true if current UTC hour falls within the given quiet window (supports wraparound). */
function isQuietHoursRange(start: number, end: number): boolean {
  const hour = new Date().getUTCHours();
  if (start > end) {
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

/** Count total queued + running jobs across all orgs (or a single org). */
async function getGlobalQueueDepth(db: Firestore, orgId?: string): Promise<number> {
  try {
    if (orgId) {
      const snap = await db
        .collection('orgs').doc(orgId)
        .collection('agentJobs')
        .where('status', 'in', ['queued', 'running'])
        .count().get();
      return snap.data().count;
    }

    // Cross-org via collection group query
    const snap = await db
      .collectionGroup('agentJobs')
      .where('status', 'in', ['queued', 'running'])
      .count().get();
    return snap.data().count;
  } catch {
    return 0;
  }
}

/**
 * Build the input payload for a given entity + taskType.
 * Returns null if the entity lacks the required fields (e.g. no website for xray).
 */
function buildEntityInput(
  orgId: string,
  entityType: EntityType,
  entityId: string,
  data: Record<string, any>,
  taskType: string
): Record<string, any> | null {
  const website = data.website || data.websiteUrl
    || data.sourceIntelligence?.website
    || data.businessProfile?.websiteUrl;

  const businessName = data.businessName || data.name || data.companyName || '';
  const location     = data.city || data.location || data.suburb || '';
  const industry     = data.industry || data.category || '';

  // Reject tasks that need a website but entity has none
  if ([TASK_TYPES.WEBSITE_XRAY].includes(taskType) && !website) return null;

  const base = { orgId, entityId, entityType, businessName, website, location, industry };

  switch (taskType) {
    case TASK_TYPES.WEBSITE_XRAY:
      return { ...base, websiteUrl: website };
    case TASK_TYPES.SERP:
      return { ...base, keywords: data.targetKeywords || [] };
    case TASK_TYPES.GBP:
      return { ...base, gbpLink: data.gbpLink || data.businessProfile?.mapsUrl || null };
    case TASK_TYPES.ADS:
      return { ...base };
    case TASK_TYPES.STRATEGY:
      return { ...base, keywordNotes: data.keywordNotes || '' };
    case TASK_TYPES.GROWTH_PRESCRIPTION:
      return { ...base };
    case TASK_TYPES.PREP:
      return { ...base };
    case TASK_TYPES.ENRICHMENT:
      return { ...base };
    default:
      return { ...base };
  }
}
