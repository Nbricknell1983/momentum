/**
 * Sweep Runner — Background Automation Engine
 *
 * Runs recurring sweeps across leads and clients for each org.
 * Applies the autopilot policy engine to classify candidate actions.
 * Writes results to Firestore with full deduplication and audit trail.
 *
 * Collections written:
 *   orgs/{orgId}/sweepRuns          — run history
 *   orgs/{orgId}/sweepActions       — created/queued actions
 *   orgs/{orgId}/sweepSuppressions  — deduplicated/blocked records
 *   orgs/{orgId}/sweepDedupeKeys    — deduplication state
 */

import { firestore } from './firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

type SweepScope = 'cadence' | 'churn_risk' | 'referral_window' | 'expansion' | 'lead_inactivity';

type SafetyLevel = 'low_risk' | 'medium_risk' | 'high_risk';

type PolicyOutcome = 'auto_allowed' | 'approval_required' | 'recommendation_only' | 'blocked';

interface SweepCandidate {
  actionType: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  safetyLevel: SafetyLevel;
  scope: SweepScope;
  reason: string;
  contextFacts: string[];
  priority: 'urgent' | 'high' | 'normal';
  suggestedAction: string;
  dedupeWindowDays: number;       // how many days before this same action can re-fire
  escalationContext?: Record<string, string | number>;
}

export interface SweepRunRecord {
  orgId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: 'complete' | 'error';
  scopesSwept: SweepScope[];
  triggeredBy: 'scheduler' | 'manual';
  policyMode: string;
  candidateCount: number;
  actionCreatedCount: number;
  approvalRequestedCount: number;
  recommendationCount: number;
  suppressedDupeCount: number;
  blockedCount: number;
  errorCount: number;
  error?: string;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function nowIso(): string { return new Date().toISOString(); }

function nowLabel(): string {
  return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function dayKey(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / 86_400_000);
}

// ── Inline policy evaluator ───────────────────────────────────────────────────
// Mirrors the client-side autopilotEngine without importing client modules.

const DEFAULT_RULE_MAP: Record<string, { safetyLevel: SafetyLevel; defaultOutcome: PolicyOutcome }> = {
  create_cadence_reminder: { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  flag_churn_risk:         { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  flag_upsell_opportunity: { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  flag_referral_window:    { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  log_activity:            { safetyLevel: 'low_risk', defaultOutcome: 'auto_allowed' },
  generate_draft:          { safetyLevel: 'medium_risk', defaultOutcome: 'approval_required' },
  queue_communication:     { safetyLevel: 'medium_risk', defaultOutcome: 'approval_required' },
  update_lead_stage:       { safetyLevel: 'medium_risk', defaultOutcome: 'recommendation_only' },
  send_communication:      { safetyLevel: 'high_risk', defaultOutcome: 'approval_required' },
  create_referral_ask:     { safetyLevel: 'high_risk', defaultOutcome: 'approval_required' },
  request_expansion:       { safetyLevel: 'high_risk', defaultOutcome: 'recommendation_only' },
  send_portal_digest:      { safetyLevel: 'high_risk', defaultOutcome: 'approval_required' },
};

function resolvePolicy(
  actionType: string,
  globalMode: string,
  savedRules: any[],
  escalationCtx?: Record<string, string | number>,
): PolicyOutcome {
  if (globalMode === 'off') return 'blocked';

  const savedRule = savedRules.find((r: any) => r.actionType === actionType);
  if (savedRule && savedRule.enabled === false) return 'blocked';

  const defaults = DEFAULT_RULE_MAP[actionType];
  if (!defaults) return 'recommendation_only';

  let outcome: PolicyOutcome = savedRule?.orgOverride ?? savedRule?.defaultOutcome ?? defaults.defaultOutcome;

  // Escalation check
  if (savedRule?.escalationConditions?.length && savedRule?.escalatedOutcome && escalationCtx) {
    const escalated = savedRule.escalationConditions.some((c: any) => {
      const val = escalationCtx[c.field];
      if (val === undefined) return false;
      switch (c.operator) {
        case 'eq': return val === c.value;
        case 'ne': return val !== c.value;
        case 'gte': return Number(val) >= Number(c.value);
        case 'lte': return Number(val) <= Number(c.value);
        case 'gt': return Number(val) > Number(c.value);
        case 'lt': return Number(val) < Number(c.value);
        default: return false;
      }
    });
    if (escalated) outcome = savedRule.escalatedOutcome;
  }

  // Global mode overrides
  if (globalMode === 'recommendations_only' && outcome !== 'blocked') return 'recommendation_only';
  if (globalMode === 'approval_only' && outcome === 'auto_allowed') return 'approval_required';

  return outcome;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

async function isDeduped(
  orgId: string,
  dedupeKey: string,
): Promise<boolean> {
  if (!firestore) return false;
  const ref = firestore.collection('orgs').doc(orgId).collection('sweepDedupeKeys').doc(dedupeKey);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data()!;
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
    await ref.delete().catch(() => {});
    return false;
  }
  return true;
}

async function recordDedupeKey(
  orgId: string,
  dedupeKey: string,
  windowDays: number,
): Promise<void> {
  if (!firestore) return;
  const expiresAt = new Date(Date.now() + windowDays * 86_400_000).toISOString();
  await firestore.collection('orgs').doc(orgId).collection('sweepDedupeKeys').doc(dedupeKey).set({
    expiresAt,
    createdAt: nowIso(),
  });
}

// ── Candidate derivation ──────────────────────────────────────────────────────

function deriveLeadCandidates(leads: any[]): SweepCandidate[] {
  const candidates: SweepCandidate[] = [];
  const now = Date.now();

  for (const lead of leads) {
    if (lead.stage === 'closed_won' || lead.stage === 'closed_lost') continue;

    const lastContact = lead.lastContactDate ? new Date(lead.lastContactDate.toDate?.() ?? lead.lastContactDate) : null;
    const daysSince = lastContact ? Math.floor((now - lastContact.getTime()) / 86_400_000) : 999;
    const inactiveThreshold = lead.stage === 'proposal' ? 3 : lead.stage === 'discovery' ? 7 : 14;

    if (daysSince >= inactiveThreshold) {
      const priority: 'urgent' | 'high' | 'normal' = daysSince >= inactiveThreshold * 3 ? 'urgent' : daysSince >= inactiveThreshold * 1.5 ? 'high' : 'normal';
      candidates.push({
        actionType: 'create_cadence_reminder',
        entityId: lead.id,
        entityName: lead.businessName ?? lead.contactName ?? 'Unknown Lead',
        entityType: 'lead',
        safetyLevel: 'low_risk',
        scope: 'lead_inactivity',
        reason: `Lead inactive for ${daysSince} days at ${lead.stage ?? 'unknown'} stage`,
        contextFacts: [
          `Stage: ${lead.stage ?? 'unknown'}`,
          `Days since contact: ${daysSince}`,
          `Inactivity threshold: ${inactiveThreshold} days`,
        ],
        priority,
        suggestedAction: `Follow up with ${lead.businessName ?? lead.contactName} — ${daysSince} days since last contact`,
        dedupeWindowDays: 1,
      });
    }
  }
  return candidates;
}

function deriveClientCandidates(clients: any[]): SweepCandidate[] {
  const candidates: SweepCandidate[] = [];
  const now = Date.now();

  for (const client of clients) {
    if (client.archived) continue;

    const churnRisk = typeof client.churnRiskScore === 'number' ? client.churnRiskScore : 0;
    const healthStatus = client.healthStatus ?? 'amber';
    const deliveryStatus = client.deliveryStatus ?? 'onboarding';
    const upsellReadiness = client.upsellReadiness ?? 'not_ready';
    const lastContact = client.lastContactDate
      ? new Date(client.lastContactDate.toDate?.() ?? client.lastContactDate)
      : null;
    const daysSince = lastContact ? Math.floor((now - lastContact.getTime()) / 86_400_000) : 999;
    const cadenceDays = client.preferredContactCadenceDays ?? 14;
    const name = client.businessName ?? client.contactName ?? 'Unknown Client';

    // 1. Cadence overdue
    if (daysSince > cadenceDays) {
      const priority: 'urgent' | 'high' | 'normal' = daysSince > cadenceDays * 2 ? 'urgent' : 'high';
      candidates.push({
        actionType: 'create_cadence_reminder',
        entityId: client.id,
        entityName: name,
        entityType: 'client',
        safetyLevel: 'low_risk',
        scope: 'cadence',
        reason: `Overdue for contact — ${daysSince} days since last touch (cadence: ${cadenceDays}d)`,
        contextFacts: [`Days since contact: ${daysSince}`, `Cadence: ${cadenceDays}d`, `Health: ${healthStatus}`],
        priority,
        suggestedAction: `Schedule a check-in call with ${name}`,
        dedupeWindowDays: 1,
      });
    }

    // 2. Churn risk
    if (churnRisk >= 0.5) {
      const priority: 'urgent' | 'high' | 'normal' = churnRisk >= 0.75 ? 'urgent' : 'high';
      candidates.push({
        actionType: 'flag_churn_risk',
        entityId: client.id,
        entityName: name,
        entityType: 'client',
        safetyLevel: 'low_risk',
        scope: 'churn_risk',
        reason: `Churn risk at ${Math.round(churnRisk * 100)}% — threshold exceeded`,
        contextFacts: [
          `Churn risk: ${Math.round(churnRisk * 100)}%`,
          `Health: ${healthStatus}`,
          `Delivery: ${deliveryStatus}`,
        ],
        priority,
        suggestedAction: `Review ${name} account health and schedule an intervention`,
        dedupeWindowDays: 3,
        escalationContext: {
          health_status: healthStatus,
          churn_risk: churnRisk,
          delivery_status: deliveryStatus,
        },
      });
    }

    // 3. Referral window
    if (
      healthStatus === 'green' &&
      (deliveryStatus === 'active' || deliveryStatus === 'complete') &&
      churnRisk < 0.3 &&
      daysSince <= 90
    ) {
      const channelStatus = client.channelStatus ?? {};
      const liveCount = [channelStatus.website, channelStatus.seo, channelStatus.gbp, channelStatus.googleAds]
        .filter(s => s === 'live').length;

      if (liveCount >= 1 || deliveryStatus === 'complete') {
        candidates.push({
          actionType: 'flag_referral_window',
          entityId: client.id,
          entityName: name,
          entityType: 'client',
          safetyLevel: 'low_risk',
          scope: 'referral_window',
          reason: `Referral conditions met — green health, ${liveCount} live channels, delivery ${deliveryStatus}`,
          contextFacts: [
            `Health: ${healthStatus}`,
            `Delivery: ${deliveryStatus}`,
            `Live channels: ${liveCount}`,
            `Churn risk: ${Math.round(churnRisk * 100)}%`,
          ],
          priority: 'normal',
          suggestedAction: `Open referral engine for ${name} — timing conditions are right`,
          dedupeWindowDays: 7,
        });
      }
    }

    // 4. Expansion opportunity
    if ((upsellReadiness === 'hot' || upsellReadiness === 'ready') && healthStatus !== 'red') {
      candidates.push({
        actionType: 'flag_upsell_opportunity',
        entityId: client.id,
        entityName: name,
        entityType: 'client',
        safetyLevel: 'low_risk',
        scope: 'expansion',
        reason: `Expansion readiness: ${upsellReadiness} — account primed for growth conversation`,
        contextFacts: [
          `Upsell readiness: ${upsellReadiness}`,
          `Health: ${healthStatus}`,
          `Delivery: ${deliveryStatus}`,
        ],
        priority: upsellReadiness === 'hot' ? 'high' : 'normal',
        suggestedAction: `Review expansion opportunities for ${name} in the Expansion Engine`,
        dedupeWindowDays: 7,
      });
    }
  }

  return candidates;
}

// ── Write action record ───────────────────────────────────────────────────────

type SweepActionOutcome = 'auto_created' | 'approval_queued' | 'recommendation' | 'suppressed_dedupe' | 'blocked_policy';

async function writeAction(
  orgId: string,
  runId: string,
  candidate: SweepCandidate,
  policyOutcome: PolicyOutcome,
): Promise<SweepActionOutcome> {
  if (!firestore) return 'blocked_policy';

  const outcomeMap: Record<PolicyOutcome, SweepActionOutcome> = {
    auto_allowed: 'auto_created',
    approval_required: 'approval_queued',
    recommendation_only: 'recommendation',
    blocked: 'blocked_policy',
  };

  const recordOutcome = outcomeMap[policyOutcome];

  await firestore.collection('orgs').doc(orgId).collection('sweepActions').add({
    orgId,
    sweepRunId: runId,
    scope: candidate.scope,
    actionType: candidate.actionType,
    entityId: candidate.entityId,
    entityName: candidate.entityName,
    entityType: candidate.entityType,
    safetyLevel: candidate.safetyLevel,
    outcome: recordOutcome,
    reason: candidate.reason,
    contextFacts: candidate.contextFacts,
    suggestedAction: candidate.suggestedAction,
    priority: candidate.priority,
    policyOutcome,
    createdAt: nowLabel(),
    reviewed: false,
  });

  return recordOutcome;
}

async function writeSuppression(
  orgId: string,
  runId: string,
  candidate: SweepCandidate,
  dedupeKey: string,
  detail: string,
): Promise<void> {
  if (!firestore) return;
  await firestore.collection('orgs').doc(orgId).collection('sweepSuppressions').add({
    orgId,
    sweepRunId: runId,
    dedupeKey,
    actionType: candidate.actionType,
    entityId: candidate.entityId,
    entityName: candidate.entityName,
    scope: candidate.scope,
    suppressionReason: 'dedupe_cooldown',
    suppressionDetail: detail,
    suppressedAt: nowLabel(),
  });
}

// ── Main sweep orchestrator ───────────────────────────────────────────────────

export async function runSweepForOrg(
  orgId: string,
  triggeredBy: 'scheduler' | 'manual',
  logger: (msg: string) => void,
): Promise<SweepRunRecord> {
  const startMs = Date.now();
  const startedAt = nowLabel();

  const emptyRecord: SweepRunRecord = {
    orgId, startedAt, completedAt: nowLabel(), durationMs: 0, status: 'error',
    scopesSwept: [], triggeredBy, policyMode: 'unknown',
    candidateCount: 0, actionCreatedCount: 0, approvalRequestedCount: 0,
    recommendationCount: 0, suppressedDupeCount: 0, blockedCount: 0, errorCount: 1,
  };

  if (!firestore) {
    emptyRecord.error = 'Firestore not available';
    return emptyRecord;
  }

  let runDocRef: FirebaseFirestore.DocumentReference | null = null;

  try {
    // Write in-progress record
    runDocRef = await firestore.collection('orgs').doc(orgId).collection('sweepRuns').add({
      ...emptyRecord,
      status: 'running',
      startedAt,
    });
    const runId = runDocRef.id;

    // ── Load autopilot policy ───────────────────────────────────────────────
    const policySnap = await firestore.collection('orgs').doc(orgId)
      .collection('autopilotPolicy').doc('policy').get();
    const policy = policySnap.exists ? policySnap.data() : null;
    const globalMode = policy?.globalMode ?? 'approval_only';
    const savedRules: any[] = policy?.rules ?? [];
    logger(`[Sweep] org=${orgId} globalMode=${globalMode}`);

    // If sweep is fully off, bail early
    if (globalMode === 'off') {
      const record: SweepRunRecord = {
        ...emptyRecord, status: 'complete', policyMode: 'off',
        errorCount: 0, durationMs: Date.now() - startMs, completedAt: nowLabel(),
      };
      await runDocRef.update(record);
      return record;
    }

    // ── Load leads + clients ────────────────────────────────────────────────
    const [leadsSnap, clientsSnap] = await Promise.all([
      firestore.collection('orgs').doc(orgId).collection('leads').get(),
      firestore.collection('orgs').doc(orgId).collection('clients').get(),
    ]);

    const leads = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    logger(`[Sweep] org=${orgId} leads=${leads.length} clients=${clients.length}`);

    // ── Derive candidates ───────────────────────────────────────────────────
    const candidates: SweepCandidate[] = [
      ...deriveLeadCandidates(leads),
      ...deriveClientCandidates(clients),
    ];
    logger(`[Sweep] org=${orgId} candidates=${candidates.length}`);

    // ── Process each candidate ──────────────────────────────────────────────
    const counters = {
      auto: 0, approval: 0, recommendation: 0, suppressed: 0, blocked: 0, error: 0,
    };

    for (const candidate of candidates) {
      try {
        const dedupeKey = `${candidate.actionType}_${candidate.entityId}_${dayKey()}`;
        const duped = await isDeduped(orgId, dedupeKey);

        if (duped) {
          await writeSuppression(orgId, runId, candidate, dedupeKey,
            `Already processed today (cooldown: ${candidate.dedupeWindowDays}d)`);
          counters.suppressed++;
          continue;
        }

        const policyOutcome = resolvePolicy(
          candidate.actionType,
          globalMode,
          savedRules,
          candidate.escalationContext,
        );

        if (policyOutcome === 'blocked') {
          counters.blocked++;
          await firestore.collection('orgs').doc(orgId).collection('sweepSuppressions').add({
            orgId,
            sweepRunId: runId,
            dedupeKey,
            actionType: candidate.actionType,
            entityId: candidate.entityId,
            entityName: candidate.entityName,
            scope: candidate.scope,
            suppressionReason: 'policy_blocked',
            suppressionDetail: `Policy outcome: blocked (global mode: ${globalMode})`,
            suppressedAt: nowLabel(),
          });
          continue;
        }

        // Write the action
        const actionOutcome = await writeAction(orgId, runId, candidate, policyOutcome);
        await recordDedupeKey(orgId, dedupeKey, candidate.dedupeWindowDays);

        if (actionOutcome === 'auto_created') counters.auto++;
        else if (actionOutcome === 'approval_queued') counters.approval++;
        else if (actionOutcome === 'recommendation') counters.recommendation++;

      } catch (err: any) {
        logger(`[Sweep] error processing candidate ${candidate.entityId}: ${err.message}`);
        counters.error++;
      }
    }

    // ── Finalize run record ─────────────────────────────────────────────────
    const scopesSwept: SweepScope[] = ['cadence', 'churn_risk', 'referral_window', 'expansion', 'lead_inactivity'];
    const completedAt = nowLabel();
    const durationMs = Date.now() - startMs;

    const record: SweepRunRecord = {
      orgId,
      startedAt,
      completedAt,
      durationMs,
      status: 'complete',
      scopesSwept,
      triggeredBy,
      policyMode: globalMode,
      candidateCount: candidates.length,
      actionCreatedCount: counters.auto,
      approvalRequestedCount: counters.approval,
      recommendationCount: counters.recommendation,
      suppressedDupeCount: counters.suppressed,
      blockedCount: counters.blocked,
      errorCount: counters.error,
    };

    await runDocRef.update(record);

    // Update schedule lastRunAt
    await firestore.collection('orgs').doc(orgId)
      .collection('settings').doc('sweepSchedule')
      .set({ lastRunAt: nowLabel() }, { merge: true });

    logger(`[Sweep] org=${orgId} complete — auto=${counters.auto} approval=${counters.approval} rec=${counters.recommendation} suppressed=${counters.suppressed} blocked=${counters.blocked} duration=${durationMs}ms`);
    return record;

  } catch (err: any) {
    logger(`[Sweep] fatal error for org=${orgId}: ${err.message}`);
    const record: SweepRunRecord = {
      ...emptyRecord,
      status: 'error',
      completedAt: nowLabel(),
      durationMs: Date.now() - startMs,
      error: err.message,
    };
    if (runDocRef) await runDocRef.update(record).catch(() => {});
    return record;
  }
}
