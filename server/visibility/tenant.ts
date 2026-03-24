// =============================================================================
// VISIBILITY OS — TENANT ISOLATION LAYER
// =============================================================================
// VisibilityTenant binds the Firestore access layer to a specific orgId.
// Once constructed, every method is scoped to that org — callers cannot
// accidentally pass a different orgId and read another tenant's data.
//
// Usage:
//   const vt = new VisibilityTenant(db, orgId);
//   const run = await vt.forClient(clientId).createSensorRun(runData);
//   const journey = await vt.forLead(leadId).getMomentumJourney();
//
// Design decisions:
//   - VisibilityTenant is stateless after construction (no caching).
//   - forClient() and forLead() return scoped sub-objects, not new instances.
//   - All writes are pass-through to access.ts — no business logic here.
//   - This file is the ONLY place that should be imported by route handlers.
// =============================================================================

import type { Firestore } from 'firebase-admin/firestore';
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

import * as access from './access';

// ─── Client-scoped operations ─────────────────────────────────────────────────

class ClientScope {
  constructor(
    private readonly db: Firestore,
    private readonly orgId: string,
    private readonly clientId: string
  ) {}

  // Sensor Runs
  createSensorRun(run: Omit<SensorRun, 'id'>) {
    return access.createSensorRun(this.db, this.orgId, this.clientId, run);
  }
  updateSensorRunStatus(runId: string, status: SensorRunStatus, updates?: Partial<SensorRun>) {
    return access.updateSensorRunStatus(this.db, this.orgId, this.clientId, runId, status, updates);
  }
  getSensorRun(runId: string) {
    return access.getSensorRun(this.db, this.orgId, this.clientId, runId);
  }
  getLatestSensorRun() {
    return access.getLatestSensorRun(this.db, this.orgId, this.clientId);
  }
  listSensorRuns(limit?: number) {
    return access.listSensorRuns(this.db, this.orgId, this.clientId, limit);
  }

  // Interpretations
  createInterpretation(interpretation: Omit<Interpretation, 'id'>) {
    return access.createInterpretation(this.db, this.orgId, this.clientId, interpretation);
  }
  getLatestInterpretation() {
    return access.getLatestInterpretation(this.db, this.orgId, this.clientId);
  }
  listInterpretations(limit?: number) {
    return access.listInterpretations(this.db, this.orgId, this.clientId, limit);
  }

  // Decisions
  createDecision(decision: Omit<Decision, 'id'>) {
    return access.createDecision(this.db, this.orgId, this.clientId, decision);
  }
  updateDecisionStatus(decisionId: string, status: DecisionStatus, extra?: Partial<Decision>) {
    return access.updateDecisionStatus(this.db, this.orgId, this.clientId, decisionId, status, extra);
  }
  updateDecisionActionStatus(decisionId: string, actionId: string, actionStatus: Action['status'], executionId?: string) {
    return access.updateDecisionActionStatus(this.db, this.orgId, this.clientId, decisionId, actionId, actionStatus, executionId);
  }
  getPendingDecisions() {
    return access.getPendingDecisions(this.db, this.orgId, this.clientId);
  }
  getDecision(decisionId: string) {
    return access.getDecision(this.db, this.orgId, this.clientId, decisionId);
  }
  approveDecision(decisionId: string, approvedBy: string) {
    return access.approveDecision(this.db, this.orgId, this.clientId, decisionId, approvedBy);
  }

  // Executions
  createExecution(execution: Omit<Execution, 'id'>) {
    return access.createExecution(this.db, this.orgId, this.clientId, execution);
  }
  updateExecutionStatus(executionId: string, status: ExecutionStatus, updates?: Partial<Execution>) {
    return access.updateExecutionStatus(this.db, this.orgId, this.clientId, executionId, status, updates);
  }
  getExecution(executionId: string) {
    return access.getExecution(this.db, this.orgId, this.clientId, executionId);
  }
  listExecutions(limit?: number) {
    return access.listExecutions(this.db, this.orgId, this.clientId, limit);
  }

  // Visibility Snapshots
  writeVisibilitySnapshot(snapshot: VisibilitySnapshot) {
    return access.writeVisibilitySnapshot(this.db, this.orgId, this.clientId, snapshot);
  }
  getVisibilitySnapshot(date: string) {
    return access.getVisibilitySnapshot(this.db, this.orgId, this.clientId, date);
  }
  getVisibilitySnapshotRange(fromDate: string, toDate: string) {
    return access.getVisibilitySnapshotRange(this.db, this.orgId, this.clientId, fromDate, toDate);
  }
  getLatestVisibilitySnapshot() {
    return access.getLatestVisibilitySnapshot(this.db, this.orgId, this.clientId);
  }

  // Action Learnings
  createActionLearning(learning: Omit<ActionLearning, 'id'>) {
    return access.createActionLearning(this.db, this.orgId, this.clientId, learning);
  }
  listActionLearnings(limit?: number) {
    return access.listActionLearnings(this.db, this.orgId, this.clientId, limit);
  }

  // Client Lead Journey
  updateClientLeadJourney(journey: ClientLeadJourney) {
    return access.updateClientLeadJourney(this.db, this.orgId, this.clientId, journey);
  }
  appendClientJourneyHistory(record: JourneyStageHistoryRecord) {
    return access.appendClientJourneyHistory(this.db, this.orgId, this.clientId, record);
  }
  getClientJourneyHistory(limit?: number) {
    return access.getClientJourneyHistory(this.db, this.orgId, this.clientId, limit);
  }

  // Website Blueprint
  getWebsiteBlueprint() {
    return access.getWebsiteBlueprint(this.db, this.orgId, this.clientId);
  }
  saveWebsiteBlueprint(blueprint: WebsiteBlueprint) {
    return access.saveWebsiteBlueprint(this.db, this.orgId, this.clientId, blueprint);
  }

  // Battle Score
  updateBattleScore(score: number, breakdown: Record<string, number>) {
    return access.updateBattleScore(this.db, this.orgId, this.clientId, score, breakdown);
  }
}

// ─── Lead-scoped operations ───────────────────────────────────────────────────

class LeadScope {
  constructor(
    private readonly db: Firestore,
    private readonly orgId: string,
    private readonly leadId: string
  ) {}

  // Momentum Journey (embedded field on lead doc)
  updateMomentumJourney(journey: MomentumJourney) {
    return access.updateMomentumJourney(this.db, this.orgId, this.leadId, journey);
  }

  // Stage History (sub-collection)
  appendMomentumStageHistory(record: MomentumStageHistoryRecord) {
    return access.appendMomentumStageHistory(this.db, this.orgId, this.leadId, record);
  }
  getMomentumStageHistory(limit?: number) {
    return access.getMomentumStageHistory(this.db, this.orgId, this.leadId, limit);
  }

  // Follow-Ups (sub-collection)
  createFollowUp(followUp: Omit<FollowUp, 'id'>) {
    return access.createFollowUp(this.db, this.orgId, this.leadId, followUp);
  }
  updateFollowUpStatus(followUpId: string, status: FollowUpStatus, sentAt?: string) {
    return access.updateFollowUpStatus(this.db, this.orgId, this.leadId, followUpId, status, sentAt);
  }
  listFollowUps(statusFilter?: FollowUpStatus) {
    return access.listFollowUps(this.db, this.orgId, this.leadId, statusFilter);
  }

  // Objections (sub-collection)
  createObjection(objection: Omit<Objection, 'id'>) {
    return access.createObjection(this.db, this.orgId, this.leadId, objection);
  }
  resolveObjection(objectionId: string) {
    return access.resolveObjection(this.db, this.orgId, this.leadId, objectionId);
  }
  listObjections() {
    return access.listObjections(this.db, this.orgId, this.leadId);
  }
}

// ─── Org-scoped operations ────────────────────────────────────────────────────

class OrgScope {
  constructor(
    private readonly db: Firestore,
    private readonly orgId: string
  ) {}

  getVisibilityConfig() {
    return access.getVisibilityConfig(this.db, this.orgId);
  }
  saveVisibilityConfig(config: Partial<Omit<VisibilityConfig, 'orgId'>>) {
    return access.saveVisibilityConfig(this.db, this.orgId, config);
  }
}

// ─── VisibilityTenant — entry point ──────────────────────────────────────────

export class VisibilityTenant {
  private readonly orgScope: OrgScope;

  constructor(
    private readonly db: Firestore,
    private readonly orgId: string
  ) {
    if (!orgId) throw new Error('[VisibilityTenant] orgId is required');
    this.orgScope = new OrgScope(db, orgId);
  }

  /** Returns a client-scoped accessor — all operations bound to this clientId */
  forClient(clientId: string): ClientScope {
    if (!clientId) throw new Error('[VisibilityTenant] clientId is required');
    return new ClientScope(this.db, this.orgId, clientId);
  }

  /** Returns a lead-scoped accessor — all operations bound to this leadId */
  forLead(leadId: string): LeadScope {
    if (!leadId) throw new Error('[VisibilityTenant] leadId is required');
    return new LeadScope(this.db, this.orgId, leadId);
  }

  /** Org-level operations (config, portfolio queries) */
  get org(): OrgScope {
    return this.orgScope;
  }

  /** Exposes the bound orgId for logging and debugging */
  get id(): string {
    return this.orgId;
  }
}

// ─── Factory helper — use in route handlers ───────────────────────────────────
// Example:
//   import { createTenant } from '../visibility/tenant';
//   const vt = createTenant(firestore, req.orgId);

export function createTenant(db: Firestore, orgId: string): VisibilityTenant {
  return new VisibilityTenant(db, orgId);
}
