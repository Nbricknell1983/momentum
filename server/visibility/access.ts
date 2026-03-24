// =============================================================================
// VISIBILITY OS — FIRESTORE ACCESS LAYER
// =============================================================================
// Pure Firestore CRUD for every Visibility OS collection.
//
// Design rules:
//   1. Every function takes (db: Firestore, orgId: string, ...) — no globals.
//   2. Every collection reference is nested under orgs/{orgId}/ — no cross-tenant reads.
//   3. All timestamps are ISO strings. FieldValue.serverTimestamp() is NOT used here;
//      callers pass dates so the layer stays deterministic and testable.
//   4. Functions return typed objects, never raw Firestore DocumentSnapshots.
//   5. List functions are always paginated (limit defaults to 50).
// =============================================================================

import type { Firestore, CollectionReference, DocumentData } from 'firebase-admin/firestore';
import type {
  SensorRun, SensorRunStatus,
  Interpretation,
  Decision, DecisionStatus, Action,
  Execution, ExecutionStatus,
  VisibilitySnapshot,
  ActionLearning,
  ClientLeadJourney, JourneyStageHistoryRecord,
  MomentumJourney, MomentumStageHistoryRecord,
  FollowUp, FollowUpStatus,
  Objection,
  WebsiteBlueprint,
  VisibilityConfig,
} from './types';
import { DEFAULT_VISIBILITY_CONFIG } from './constants';

// ─── Collection path helpers ──────────────────────────────────────────────────
// All paths are functions to enforce the orgId pattern at call time.

const orgRef = (db: Firestore, orgId: string) =>
  db.collection('orgs').doc(orgId);

const clientRef = (db: Firestore, orgId: string, clientId: string) =>
  orgRef(db, orgId).collection('clients').doc(clientId);

const leadRef = (db: Firestore, orgId: string, leadId: string) =>
  orgRef(db, orgId).collection('leads').doc(leadId);

// Sub-collections on clients
const sensorRunsCol = (db: Firestore, orgId: string, clientId: string) =>
  clientRef(db, orgId, clientId).collection('sensorRuns');

const interpretationsCol = (db: Firestore, orgId: string, clientId: string) =>
  clientRef(db, orgId, clientId).collection('interpretations');

const decisionsCol = (db: Firestore, orgId: string, clientId: string) =>
  clientRef(db, orgId, clientId).collection('decisions');

const executionsCol = (db: Firestore, orgId: string, clientId: string) =>
  clientRef(db, orgId, clientId).collection('executions');

const visibilitySnapshotsCol = (db: Firestore, orgId: string, clientId: string) =>
  clientRef(db, orgId, clientId).collection('visibilitySnapshots');

const actionLearningsCol = (db: Firestore, orgId: string, clientId: string) =>
  clientRef(db, orgId, clientId).collection('actionLearnings');

const clientJourneyHistoryCol = (db: Firestore, orgId: string, clientId: string) =>
  clientRef(db, orgId, clientId).collection('journeyStageHistory');

// Sub-collections on leads
const momentumStageHistoryCol = (db: Firestore, orgId: string, leadId: string) =>
  leadRef(db, orgId, leadId).collection('journeyStageHistory');

const followUpsCol = (db: Firestore, orgId: string, leadId: string) =>
  leadRef(db, orgId, leadId).collection('momentumFollowUps');

const objectionsCol = (db: Firestore, orgId: string, leadId: string) =>
  leadRef(db, orgId, leadId).collection('momentumObjections');

// Org-level config
const visibilityConfigRef = (db: Firestore, orgId: string) =>
  orgRef(db, orgId).collection('visibilityConfig').doc('default');

// Helper: snap to typed object or null
function snapToDoc<T>(snap: FirebaseFirestore.DocumentSnapshot): (T & { id: string }) | null {
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

// Helper: query snapshot to typed array
function snapsToDocs<T>(snaps: FirebaseFirestore.QuerySnapshot): (T & { id: string })[] {
  return snaps.docs.map(d => ({ id: d.id, ...(d.data() as T) }));
}

// ─── SENSOR RUNS ──────────────────────────────────────────────────────────────

export async function createSensorRun(
  db: Firestore,
  orgId: string,
  clientId: string,
  run: Omit<SensorRun, 'id'>
): Promise<string> {
  const ref = sensorRunsCol(db, orgId, clientId).doc();
  await ref.set(run);
  return ref.id;
}

export async function updateSensorRunStatus(
  db: Firestore,
  orgId: string,
  clientId: string,
  runId: string,
  status: SensorRunStatus,
  updates: Partial<SensorRun> = {}
): Promise<void> {
  await sensorRunsCol(db, orgId, clientId).doc(runId).update({
    status,
    ...updates,
    ...(status === 'complete' || status === 'failed' || status === 'partial'
      ? { completedAt: new Date().toISOString() }
      : {}),
  });
}

export async function getSensorRun(
  db: Firestore,
  orgId: string,
  clientId: string,
  runId: string
): Promise<(SensorRun & { id: string }) | null> {
  return snapToDoc<SensorRun>(await sensorRunsCol(db, orgId, clientId).doc(runId).get());
}

export async function getLatestSensorRun(
  db: Firestore,
  orgId: string,
  clientId: string
): Promise<(SensorRun & { id: string }) | null> {
  const snaps = await sensorRunsCol(db, orgId, clientId)
    .orderBy('startedAt', 'desc')
    .limit(1)
    .get();
  if (snaps.empty) return null;
  return snapToDoc<SensorRun>(snaps.docs[0]);
}

export async function listSensorRuns(
  db: Firestore,
  orgId: string,
  clientId: string,
  limit = 20
): Promise<(SensorRun & { id: string })[]> {
  const snaps = await sensorRunsCol(db, orgId, clientId)
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();
  return snapsToDocs<SensorRun>(snaps);
}

// ─── INTERPRETATIONS ─────────────────────────────────────────────────────────

export async function createInterpretation(
  db: Firestore,
  orgId: string,
  clientId: string,
  interpretation: Omit<Interpretation, 'id'>
): Promise<string> {
  const ref = interpretationsCol(db, orgId, clientId).doc();
  await ref.set(interpretation);
  return ref.id;
}

export async function getLatestInterpretation(
  db: Firestore,
  orgId: string,
  clientId: string
): Promise<(Interpretation & { id: string }) | null> {
  const snaps = await interpretationsCol(db, orgId, clientId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (snaps.empty) return null;
  return snapToDoc<Interpretation>(snaps.docs[0]);
}

export async function listInterpretations(
  db: Firestore,
  orgId: string,
  clientId: string,
  limit = 10
): Promise<(Interpretation & { id: string })[]> {
  const snaps = await interpretationsCol(db, orgId, clientId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snapsToDocs<Interpretation>(snaps);
}

// ─── DECISIONS ────────────────────────────────────────────────────────────────

export async function createDecision(
  db: Firestore,
  orgId: string,
  clientId: string,
  decision: Omit<Decision, 'id'>
): Promise<string> {
  const ref = decisionsCol(db, orgId, clientId).doc();
  await ref.set(decision);
  return ref.id;
}

export async function updateDecisionStatus(
  db: Firestore,
  orgId: string,
  clientId: string,
  decisionId: string,
  status: DecisionStatus,
  extra: Partial<Decision> = {}
): Promise<void> {
  await decisionsCol(db, orgId, clientId).doc(decisionId).update({
    status,
    ...extra,
    ...(status === 'done' || status === 'rejected'
      ? { completedAt: new Date().toISOString() }
      : {}),
  });
}

export async function updateDecisionActionStatus(
  db: Firestore,
  orgId: string,
  clientId: string,
  decisionId: string,
  actionId: string,
  actionStatus: Action['status'],
  executionId?: string
): Promise<void> {
  // Read → update matching action → write back.
  // Decisions have a small actions array (max ~10) so full read is acceptable.
  const snap = await decisionsCol(db, orgId, clientId).doc(decisionId).get();
  if (!snap.exists) return;
  const doc = snap.data() as Decision;
  const updatedActions = doc.actions.map(a =>
    a.id === actionId
      ? { ...a, status: actionStatus, ...(executionId ? { executionId } : {}) }
      : a
  );
  await decisionsCol(db, orgId, clientId).doc(decisionId).update({ actions: updatedActions });
}

export async function getPendingDecisions(
  db: Firestore,
  orgId: string,
  clientId: string
): Promise<(Decision & { id: string })[]> {
  // 'pending' = awaiting autonomy gate; 'approved' = ready to execute
  const snaps = await decisionsCol(db, orgId, clientId)
    .where('status', 'in', ['pending', 'approved'])
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();
  return snapsToDocs<Decision>(snaps);
}

export async function getDecision(
  db: Firestore,
  orgId: string,
  clientId: string,
  decisionId: string
): Promise<(Decision & { id: string }) | null> {
  return snapToDoc<Decision>(await decisionsCol(db, orgId, clientId).doc(decisionId).get());
}

export async function approveDecision(
  db: Firestore,
  orgId: string,
  clientId: string,
  decisionId: string,
  approvedBy: string   // userId
): Promise<void> {
  await decisionsCol(db, orgId, clientId).doc(decisionId).update({
    status: 'approved' as DecisionStatus,
    approvedBy,
    approvedAt: new Date().toISOString(),
  });
}

// ─── EXECUTIONS ───────────────────────────────────────────────────────────────

export async function createExecution(
  db: Firestore,
  orgId: string,
  clientId: string,
  execution: Omit<Execution, 'id'>
): Promise<string> {
  const ref = executionsCol(db, orgId, clientId).doc();
  await ref.set(execution);
  return ref.id;
}

export async function updateExecutionStatus(
  db: Firestore,
  orgId: string,
  clientId: string,
  executionId: string,
  status: ExecutionStatus,
  updates: Partial<Execution> = {}
): Promise<void> {
  await executionsCol(db, orgId, clientId).doc(executionId).update({
    status,
    ...updates,
    ...(status === 'complete' || status === 'failed' || status === 'rolled_back'
      ? { completedAt: new Date().toISOString() }
      : {}),
  });
}

export async function getExecution(
  db: Firestore,
  orgId: string,
  clientId: string,
  executionId: string
): Promise<(Execution & { id: string }) | null> {
  return snapToDoc<Execution>(await executionsCol(db, orgId, clientId).doc(executionId).get());
}

export async function listExecutions(
  db: Firestore,
  orgId: string,
  clientId: string,
  limit = 20
): Promise<(Execution & { id: string })[]> {
  const snaps = await executionsCol(db, orgId, clientId)
    .orderBy('startedAt', 'desc')
    .limit(limit)
    .get();
  return snapsToDocs<Execution>(snaps);
}

// ─── VISIBILITY SNAPSHOTS ─────────────────────────────────────────────────────

export async function writeVisibilitySnapshot(
  db: Firestore,
  orgId: string,
  clientId: string,
  snapshot: VisibilitySnapshot
): Promise<void> {
  // Document ID = date (YYYY-MM-DD) — one snapshot per client per day.
  // Writing to the same date overwrites, which is the intended upsert behaviour.
  await visibilitySnapshotsCol(db, orgId, clientId)
    .doc(snapshot.date)
    .set(snapshot, { merge: true });
}

export async function getVisibilitySnapshot(
  db: Firestore,
  orgId: string,
  clientId: string,
  date: string   // YYYY-MM-DD
): Promise<(VisibilitySnapshot & { id: string }) | null> {
  return snapToDoc<VisibilitySnapshot>(
    await visibilitySnapshotsCol(db, orgId, clientId).doc(date).get()
  );
}

export async function getVisibilitySnapshotRange(
  db: Firestore,
  orgId: string,
  clientId: string,
  fromDate: string,   // YYYY-MM-DD inclusive
  toDate: string      // YYYY-MM-DD inclusive
): Promise<(VisibilitySnapshot & { id: string })[]> {
  const snaps = await visibilitySnapshotsCol(db, orgId, clientId)
    .where('date', '>=', fromDate)
    .where('date', '<=', toDate)
    .orderBy('date', 'asc')
    .get();
  return snapsToDocs<VisibilitySnapshot>(snaps);
}

export async function getLatestVisibilitySnapshot(
  db: Firestore,
  orgId: string,
  clientId: string
): Promise<(VisibilitySnapshot & { id: string }) | null> {
  const snaps = await visibilitySnapshotsCol(db, orgId, clientId)
    .orderBy('date', 'desc')
    .limit(1)
    .get();
  if (snaps.empty) return null;
  return snapToDoc<VisibilitySnapshot>(snaps.docs[0]);
}

// ─── ACTION LEARNINGS ─────────────────────────────────────────────────────────

export async function createActionLearning(
  db: Firestore,
  orgId: string,
  clientId: string,
  learning: Omit<ActionLearning, 'id'>
): Promise<string> {
  const ref = actionLearningsCol(db, orgId, clientId).doc();
  await ref.set(learning);
  return ref.id;
}

export async function listActionLearnings(
  db: Firestore,
  orgId: string,
  clientId: string,
  limit = 50
): Promise<(ActionLearning & { id: string })[]> {
  const snaps = await actionLearningsCol(db, orgId, clientId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snapsToDocs<ActionLearning>(snaps);
}

// ─── CLIENT LEAD JOURNEY ──────────────────────────────────────────────────────

export async function updateClientLeadJourney(
  db: Firestore,
  orgId: string,
  clientId: string,
  journey: ClientLeadJourney
): Promise<void> {
  await clientRef(db, orgId, clientId).update({ clientLeadJourney: journey });
}

export async function appendClientJourneyHistory(
  db: Firestore,
  orgId: string,
  clientId: string,
  record: JourneyStageHistoryRecord
): Promise<void> {
  // Keyed by date — overwrites same-day record (upsert).
  await clientJourneyHistoryCol(db, orgId, clientId)
    .doc(record.date)
    .set(record, { merge: true });
}

export async function getClientJourneyHistory(
  db: Firestore,
  orgId: string,
  clientId: string,
  limit = 30
): Promise<(JourneyStageHistoryRecord & { id: string })[]> {
  const snaps = await clientJourneyHistoryCol(db, orgId, clientId)
    .orderBy('date', 'desc')
    .limit(limit)
    .get();
  return snapsToDocs<JourneyStageHistoryRecord>(snaps);
}

// ─── MOMENTUM LEAD JOURNEY ────────────────────────────────────────────────────

export async function updateMomentumJourney(
  db: Firestore,
  orgId: string,
  leadId: string,
  journey: MomentumJourney
): Promise<void> {
  await leadRef(db, orgId, leadId).update({ momentumJourney: journey });
}

export async function appendMomentumStageHistory(
  db: Firestore,
  orgId: string,
  leadId: string,
  record: MomentumStageHistoryRecord
): Promise<string> {
  const ref = momentumStageHistoryCol(db, orgId, leadId).doc();
  await ref.set(record);
  return ref.id;
}

export async function getMomentumStageHistory(
  db: Firestore,
  orgId: string,
  leadId: string,
  limit = 20
): Promise<(MomentumStageHistoryRecord & { id: string })[]> {
  const snaps = await momentumStageHistoryCol(db, orgId, leadId)
    .orderBy('enteredAt', 'desc')
    .limit(limit)
    .get();
  return snapsToDocs<MomentumStageHistoryRecord>(snaps);
}

// ─── FOLLOW-UPS ───────────────────────────────────────────────────────────────

export async function createFollowUp(
  db: Firestore,
  orgId: string,
  leadId: string,
  followUp: Omit<FollowUp, 'id'>
): Promise<string> {
  const ref = followUpsCol(db, orgId, leadId).doc();
  await ref.set(followUp);
  return ref.id;
}

export async function updateFollowUpStatus(
  db: Firestore,
  orgId: string,
  leadId: string,
  followUpId: string,
  status: FollowUpStatus,
  sentAt?: string
): Promise<void> {
  await followUpsCol(db, orgId, leadId).doc(followUpId).update({
    status,
    ...(sentAt ? { sentAt } : {}),
  });
}

export async function listFollowUps(
  db: Firestore,
  orgId: string,
  leadId: string,
  statusFilter?: FollowUpStatus
): Promise<(FollowUp & { id: string })[]> {
  let query = followUpsCol(db, orgId, leadId)
    .orderBy('generatedAt', 'desc') as FirebaseFirestore.Query;
  if (statusFilter) {
    query = query.where('status', '==', statusFilter);
  }
  const snaps = await query.limit(50).get();
  return snapsToDocs<FollowUp>(snaps);
}

// ─── OBJECTIONS ───────────────────────────────────────────────────────────────

export async function createObjection(
  db: Firestore,
  orgId: string,
  leadId: string,
  objection: Omit<Objection, 'id'>
): Promise<string> {
  const ref = objectionsCol(db, orgId, leadId).doc();
  await ref.set(objection);
  return ref.id;
}

export async function resolveObjection(
  db: Firestore,
  orgId: string,
  leadId: string,
  objectionId: string
): Promise<void> {
  await objectionsCol(db, orgId, leadId).doc(objectionId).update({
    resolved:   true,
    resolvedAt: new Date().toISOString(),
  });
}

export async function listObjections(
  db: Firestore,
  orgId: string,
  leadId: string
): Promise<(Objection & { id: string })[]> {
  const snaps = await objectionsCol(db, orgId, leadId)
    .orderBy('loggedAt', 'desc')
    .get();
  return snapsToDocs<Objection>(snaps);
}

// ─── WEBSITE BLUEPRINT ────────────────────────────────────────────────────────
// Blueprints are stored on the client root doc (existing path: websiteWorkstream.currentDraft).
// These helpers read/write the enhanced WebsiteBlueprint from that path.

export async function getWebsiteBlueprint(
  db: Firestore,
  orgId: string,
  clientId: string
): Promise<WebsiteBlueprint | null> {
  const snap = await clientRef(db, orgId, clientId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  return (data?.websiteWorkstream as Record<string, unknown>)?.currentDraft as WebsiteBlueprint ?? null;
}

export async function saveWebsiteBlueprint(
  db: Firestore,
  orgId: string,
  clientId: string,
  blueprint: WebsiteBlueprint
): Promise<void> {
  await clientRef(db, orgId, clientId).update({
    'websiteWorkstream.currentDraft': blueprint,
    'websiteWorkstream.blueprintUpdatedAt': new Date().toISOString(),
  });
}

// ─── ORG VISIBILITY CONFIG ────────────────────────────────────────────────────

export async function getVisibilityConfig(
  db: Firestore,
  orgId: string
): Promise<VisibilityConfig> {
  const snap = await visibilityConfigRef(db, orgId).get();
  if (!snap.exists) {
    // Return defaults — config is lazy-initialised
    return {
      orgId,
      ...DEFAULT_VISIBILITY_CONFIG,
      updatedAt: new Date().toISOString(),
    };
  }
  return snap.data() as VisibilityConfig;
}

export async function saveVisibilityConfig(
  db: Firestore,
  orgId: string,
  config: Partial<Omit<VisibilityConfig, 'orgId'>>
): Promise<void> {
  await visibilityConfigRef(db, orgId).set(
    { orgId, ...config, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

// ─── BATTLE SCORE — write to client root doc ──────────────────────────────────

export async function updateBattleScore(
  db: Firestore,
  orgId: string,
  clientId: string,
  score: number,
  breakdown: Record<string, number>
): Promise<void> {
  const now = new Date().toISOString();
  const { FieldValue } = await import('firebase-admin/firestore');
  await clientRef(db, orgId, clientId).update({
    battleScore: score,
    battleScoreBreakdown: breakdown,
    battleScoreUpdatedAt: now,
    // Append to history array (capped in application layer at 90 entries)
    battleScoreHistory: FieldValue.arrayUnion({
      score,
      capturedAt: now,
    }),
  });
}
