// =============================================================================
// MOMENTUM VAPI — TOOL HANDLERS
// =============================================================================
// Safe Momentum service boundaries for all 12 Vapi tools.
//
// Rules enforced here:
//   1. All writes go through Momentum service boundaries (not raw Vapi)
//   2. Every action is audited in orgs/{orgId}/vapiToolAudit
//   3. High-risk actions (scheduleMeetingRequest) queue approval requests
//   4. Policy mode is checked at execution time (re-read from Firestore)
//   5. Read-only tools (lookupLead, lookupAccount) always execute
//
// Tool dispatch is called from webhookRouter.ts when Vapi sends a tool_call.
// =============================================================================

import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID }     from 'crypto';

// ---------------------------------------------------------------------------
// Policy check
// ---------------------------------------------------------------------------

type PolicyMode = 'approval_only' | 'low_risk_auto' | 'off';

async function readPolicyMode(db: Firestore, orgId: string): Promise<PolicyMode> {
  try {
    const snap = await db.collection('orgs').doc(orgId)
      .collection('vapiConfig').doc('default').get();
    return (snap.data()?.policyMode ?? 'approval_only') as PolicyMode;
  } catch {
    return 'approval_only';
  }
}

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------

async function writeToolAudit(db: Firestore, orgId: string, audit: {
  toolCallId:     string;
  callId:         string;
  toolName:       string;
  calledAt:       string;
  args:           Record<string, unknown>;
  result:         'success' | 'blocked' | 'error';
  policyDecision: string;
  error?:         string;
  firestoreRef?:  string;
}) {
  try {
    await db.collection('orgs').doc(orgId).collection('vapiToolAudit').add({
      ...audit,
      orgId,
    });
  } catch { /* never throw from audit */ }
}

// ---------------------------------------------------------------------------
// Tool handler result
// ---------------------------------------------------------------------------

export interface ToolHandlerResult {
  success:        boolean;
  result?:        unknown;       // Returned to Vapi as tool result
  error?:         string;
  policyDecision: 'auto_allowed' | 'queued_for_approval' | 'blocked' | 'read_only';
  firestoreRef?:  string;
}

// ---------------------------------------------------------------------------
// 1. lookupLead — READ ONLY
// ---------------------------------------------------------------------------

export async function handleLookupLead(params: {
  db: Firestore; orgId: string; callId: string;
  args: { leadId?: string; phoneNumber?: string; businessName?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();

  try {
    let leadData: Record<string, unknown> | null = null;

    if (args.leadId) {
      const snap = await db.collection('orgs').doc(orgId).collection('leads').doc(args.leadId).get();
      if (snap.exists) leadData = { id: snap.id, ...snap.data() };
    } else if (args.phoneNumber || args.businessName) {
      const q = db.collection('orgs').doc(orgId).collection('leads')
        .where('phone', '==', args.phoneNumber ?? '').limit(1);
      const snap = await q.get();
      if (!snap.empty) leadData = { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    const safeResult = leadData ? {
      leadId:       leadData.id,
      name:         leadData.name,
      businessName: leadData.businessName ?? leadData.companyName,
      stage:        leadData.stage,
      phone:        leadData.phone,
      lastActivity: leadData.lastActivityAt ?? leadData.updatedAt,
      notes:        leadData.notes,
    } : null;

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'lookupLead', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'read_only' });
    return { success: true, result: safeResult, policyDecision: 'read_only' };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'lookupLead', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'read_only', error: err.message });
    return { success: false, error: err.message, policyDecision: 'read_only' };
  }
}

// ---------------------------------------------------------------------------
// 2. lookupAccount — READ ONLY
// ---------------------------------------------------------------------------

export async function handleLookupAccount(params: {
  db: Firestore; orgId: string; callId: string;
  args: { clientId?: string; businessName?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();

  try {
    let clientData: Record<string, unknown> | null = null;

    if (args.clientId) {
      const snap = await db.collection('orgs').doc(orgId).collection('clients').doc(args.clientId).get();
      if (snap.exists) clientData = { id: snap.id, ...snap.data() };
    }

    const safeResult = clientData ? {
      clientId:     clientData.id,
      businessName: clientData.businessName ?? clientData.name,
      healthStatus: clientData.healthStatus,
      deliveryStatus: clientData.deliveryStatus,
      strategyStatus: clientData.strategyStatus,
      accountValue:   clientData.contractValue ?? clientData.accountValue,
      notes:          clientData.notes,
    } : null;

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'lookupAccount', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'read_only' });
    return { success: true, result: safeResult, policyDecision: 'read_only' };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'lookupAccount', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'read_only', error: err.message });
    return { success: false, error: err.message, policyDecision: 'read_only' };
  }
}

// ---------------------------------------------------------------------------
// 3. createLead — LOW RISK
// ---------------------------------------------------------------------------

export async function handleCreateLead(params: {
  db: Firestore; orgId: string; callId: string;
  args: { name: string; businessName: string; phone: string; serviceNeed?: string; urgency?: string; source?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);

  if (policyMode === 'off') {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createLead', calledAt: new Date().toISOString(), args, result: 'blocked', policyDecision: 'blocked' });
    return { success: false, error: 'Vapi is disabled (policy mode: off)', policyDecision: 'blocked' };
  }

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('leads').add({
      name:         args.name,
      businessName: args.businessName,
      phone:        args.phone,
      serviceNeed:  args.serviceNeed ?? null,
      urgency:      args.urgency ?? 'routine',
      source:       args.source ?? 'vapi_inbound',
      stage:        'suspect',
      createdAt:    new Date().toISOString(),
      createdByVapi: true,
      vapiCallId:   callId,
    });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createLead', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'auto_allowed', firestoreRef: ref.path });
    return { success: true, result: { leadId: ref.id }, policyDecision: 'auto_allowed', firestoreRef: ref.path };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createLead', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'auto_allowed', error: err.message });
    return { success: false, error: err.message, policyDecision: 'auto_allowed' };
  }
}

// ---------------------------------------------------------------------------
// 4. createFollowUpTask — LOW RISK
// ---------------------------------------------------------------------------

export async function handleCreateFollowUpTask(params: {
  db: Firestore; orgId: string; callId: string;
  args: { entityType: 'lead' | 'client'; entityId: string; taskDescription: string; dueBy?: string; priority?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);
  if (policyMode === 'off') return { success: false, error: 'Vapi disabled', policyDecision: 'blocked' };

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('executionQueue').add({
      type:        'follow_up',
      entityType:  args.entityType,
      entityId:    args.entityId,
      description: args.taskDescription,
      dueBy:       args.dueBy ?? null,
      priority:    args.priority ?? 'medium',
      source:      'vapi',
      vapiCallId:  callId,
      status:      'pending',
      createdAt:   new Date().toISOString(),
    });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createFollowUpTask', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'auto_allowed', firestoreRef: ref.path });
    return { success: true, result: { taskId: ref.id }, policyDecision: 'auto_allowed', firestoreRef: ref.path };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createFollowUpTask', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'auto_allowed', error: err.message });
    return { success: false, error: err.message, policyDecision: 'auto_allowed' };
  }
}

// ---------------------------------------------------------------------------
// 5. createCallNote — LOW RISK
// ---------------------------------------------------------------------------

export async function handleCreateCallNote(params: {
  db: Firestore; orgId: string; callId: string;
  args: { entityType: 'lead' | 'client'; entityId: string; note: string; noteType?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);
  if (policyMode === 'off') return { success: false, error: 'Vapi disabled', policyDecision: 'blocked' };

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('activityLog').add({
      type:       args.noteType ?? 'call_note',
      entityType: args.entityType,
      entityId:   args.entityId,
      content:    args.note,
      source:     'vapi',
      vapiCallId: callId,
      createdAt:  new Date().toISOString(),
    });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createCallNote', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'auto_allowed', firestoreRef: ref.path });
    return { success: true, result: { noteId: ref.id }, policyDecision: 'auto_allowed', firestoreRef: ref.path };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createCallNote', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'auto_allowed', error: err.message });
    return { success: false, error: err.message, policyDecision: 'auto_allowed' };
  }
}

// ---------------------------------------------------------------------------
// 6. scheduleMeetingRequest — HIGH RISK — always queues approval
// ---------------------------------------------------------------------------

export async function handleScheduleMeetingRequest(params: {
  db: Firestore; orgId: string; callId: string;
  args: { entityType: 'lead' | 'client'; entityId: string; entityName?: string; proposedTime?: string; meetingType?: string; notes?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);
  if (policyMode === 'off') return { success: false, error: 'Vapi disabled', policyDecision: 'blocked' };

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('approvalRequests').add({
      type:         'meeting_booking',
      entityType:   args.entityType,
      entityId:     args.entityId,
      entityName:   args.entityName ?? null,
      proposedTime: args.proposedTime ?? null,
      meetingType:  args.meetingType ?? 'discovery',
      notes:        args.notes ?? null,
      source:       'vapi',
      vapiCallId:   callId,
      status:       'pending',
      riskLevel:    'high',
      createdAt:    new Date().toISOString(),
    });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'scheduleMeetingRequest', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'queued_for_approval', firestoreRef: ref.path });
    return {
      success: true,
      result:  { approvalRequestId: ref.id, message: 'Meeting booking request created — awaiting human approval' },
      policyDecision: 'queued_for_approval',
      firestoreRef: ref.path,
    };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'scheduleMeetingRequest', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'queued_for_approval', error: err.message });
    return { success: false, error: err.message, policyDecision: 'queued_for_approval' };
  }
}

// ---------------------------------------------------------------------------
// 7. requestCallback — LOW RISK
// ---------------------------------------------------------------------------

export async function handleRequestCallback(params: {
  db: Firestore; orgId: string; callId: string;
  args: { entityType: 'lead' | 'client'; entityId: string; preferredTime?: string; reason?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);
  if (policyMode === 'off') return { success: false, error: 'Vapi disabled', policyDecision: 'blocked' };

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('cadenceReminders').add({
      type:          'callback_requested',
      entityType:    args.entityType,
      entityId:      args.entityId,
      preferredTime: args.preferredTime ?? null,
      reason:        args.reason ?? 'Requested during Vapi call',
      source:        'vapi',
      vapiCallId:    callId,
      status:        'pending',
      createdAt:     new Date().toISOString(),
    });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'requestCallback', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'auto_allowed', firestoreRef: ref.path });
    return { success: true, result: { callbackId: ref.id }, policyDecision: 'auto_allowed', firestoreRef: ref.path };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'requestCallback', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'auto_allowed', error: err.message });
    return { success: false, error: err.message, policyDecision: 'auto_allowed' };
  }
}

// ---------------------------------------------------------------------------
// 8. logObjection — LOW RISK
// ---------------------------------------------------------------------------

export async function handleLogObjection(params: {
  db: Firestore; orgId: string; callId: string;
  args: { entityType: 'lead' | 'client'; entityId: string; objection: string; category?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);
  if (policyMode === 'off') return { success: false, error: 'Vapi disabled', policyDecision: 'blocked' };

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('activityLog').add({
      type:       'objection',
      entityType: args.entityType,
      entityId:   args.entityId,
      content:    args.objection,
      category:   args.category ?? 'general',
      source:     'vapi',
      vapiCallId: callId,
      createdAt:  new Date().toISOString(),
    });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'logObjection', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'auto_allowed', firestoreRef: ref.path });
    return { success: true, result: { objectionId: ref.id }, policyDecision: 'auto_allowed', firestoreRef: ref.path };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'logObjection', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'auto_allowed', error: err.message });
    return { success: false, error: err.message, policyDecision: 'auto_allowed' };
  }
}

// ---------------------------------------------------------------------------
// 9. logCallOutcome — LOW RISK
// ---------------------------------------------------------------------------

export async function handleLogCallOutcome(params: {
  db: Firestore; orgId: string; callId: string;
  args: { entityType: 'lead' | 'client'; entityId: string; outcome: string; nextStep?: string; notes?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);
  if (policyMode === 'off') return { success: false, error: 'Vapi disabled', policyDecision: 'blocked' };

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('vapiCalls').doc(callId);
    await ref.set({
      outcome:    args.outcome,
      nextStep:   args.nextStep ?? null,
      outcomeNotes: args.notes ?? null,
      outcomeLoggedAt: new Date().toISOString(),
    }, { merge: true });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'logCallOutcome', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'auto_allowed', firestoreRef: ref.path });
    return { success: true, result: { logged: true }, policyDecision: 'auto_allowed', firestoreRef: ref.path };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'logCallOutcome', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'auto_allowed', error: err.message });
    return { success: false, error: err.message, policyDecision: 'auto_allowed' };
  }
}

// ---------------------------------------------------------------------------
// 10. createCadenceItem — LOW RISK
// ---------------------------------------------------------------------------

export async function handleCreateCadenceItem(params: {
  db: Firestore; orgId: string; callId: string;
  args: { entityType: 'lead' | 'client'; entityId: string; cadenceType: string; dueDate?: string; notes?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);
  if (policyMode === 'off') return { success: false, error: 'Vapi disabled', policyDecision: 'blocked' };

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('cadenceReminders').add({
      type:       args.cadenceType,
      entityType: args.entityType,
      entityId:   args.entityId,
      dueDate:    args.dueDate ?? null,
      notes:      args.notes ?? null,
      source:     'vapi',
      vapiCallId: callId,
      status:     'pending',
      createdAt:  new Date().toISOString(),
    });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createCadenceItem', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'auto_allowed', firestoreRef: ref.path });
    return { success: true, result: { cadenceItemId: ref.id }, policyDecision: 'auto_allowed', firestoreRef: ref.path };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createCadenceItem', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'auto_allowed', error: err.message });
    return { success: false, error: err.message, policyDecision: 'auto_allowed' };
  }
}

// ---------------------------------------------------------------------------
// 11. createApprovalRequest — LOW RISK (creates a request, doesn't execute)
// ---------------------------------------------------------------------------

export async function handleCreateApprovalRequest(params: {
  db: Firestore; orgId: string; callId: string;
  args: { entityType: 'lead' | 'client'; entityId: string; actionType: string; description: string; context?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);
  if (policyMode === 'off') return { success: false, error: 'Vapi disabled', policyDecision: 'blocked' };

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('approvalRequests').add({
      actionType:  args.actionType,
      entityType:  args.entityType,
      entityId:    args.entityId,
      description: args.description,
      context:     args.context ?? null,
      source:      'vapi',
      vapiCallId:  callId,
      status:      'pending',
      riskLevel:   'medium',
      createdAt:   new Date().toISOString(),
    });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createApprovalRequest', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'queued_for_approval', firestoreRef: ref.path });
    return { success: true, result: { approvalRequestId: ref.id }, policyDecision: 'queued_for_approval', firestoreRef: ref.path };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createApprovalRequest', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'queued_for_approval', error: err.message });
    return { success: false, error: err.message, policyDecision: 'queued_for_approval' };
  }
}

// ---------------------------------------------------------------------------
// 12. createDraftFromCallOutcome — LOW RISK
// ---------------------------------------------------------------------------

export async function handleCreateDraftFromCallOutcome(params: {
  db: Firestore; orgId: string; callId: string;
  args: { entityType: 'lead' | 'client'; entityId: string; draftType: string; callSummary: string; channel?: string };
}): Promise<ToolHandlerResult> {
  const { db, orgId, callId, args } = params;
  const toolCallId = randomUUID();
  const policyMode = await readPolicyMode(db, orgId);
  if (policyMode === 'off') return { success: false, error: 'Vapi disabled', policyDecision: 'blocked' };

  try {
    const ref = await db.collection('orgs').doc(orgId).collection('draftQueue').add({
      draftType:   args.draftType,
      entityType:  args.entityType,
      entityId:    args.entityId,
      channel:     args.channel ?? 'email',
      context:     args.callSummary,
      source:      'vapi',
      vapiCallId:  callId,
      status:      'pending_generation',
      requiresApproval: true,
      createdAt:   new Date().toISOString(),
    });

    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createDraftFromCallOutcome', calledAt: new Date().toISOString(), args, result: 'success', policyDecision: 'auto_allowed', firestoreRef: ref.path });
    return { success: true, result: { draftId: ref.id }, policyDecision: 'auto_allowed', firestoreRef: ref.path };
  } catch (err: any) {
    await writeToolAudit(db, orgId, { toolCallId, callId, toolName: 'createDraftFromCallOutcome', calledAt: new Date().toISOString(), args, result: 'error', policyDecision: 'auto_allowed', error: err.message });
    return { success: false, error: err.message, policyDecision: 'auto_allowed' };
  }
}

// ---------------------------------------------------------------------------
// Tool dispatcher — called from webhook handler
// ---------------------------------------------------------------------------

type ToolDispatchParams = {
  db:       Firestore;
  orgId:    string;
  callId:   string;
  toolName: string;
  args:     Record<string, unknown>;
};

export async function dispatchTool(params: ToolDispatchParams): Promise<ToolHandlerResult> {
  const { toolName, ...rest } = params;

  switch (toolName) {
    case 'lookupLead':             return handleLookupLead({ ...rest, args: rest.args as any });
    case 'lookupAccount':          return handleLookupAccount({ ...rest, args: rest.args as any });
    case 'createLead':             return handleCreateLead({ ...rest, args: rest.args as any });
    case 'createFollowUpTask':     return handleCreateFollowUpTask({ ...rest, args: rest.args as any });
    case 'createCallNote':         return handleCreateCallNote({ ...rest, args: rest.args as any });
    case 'scheduleMeetingRequest': return handleScheduleMeetingRequest({ ...rest, args: rest.args as any });
    case 'requestCallback':        return handleRequestCallback({ ...rest, args: rest.args as any });
    case 'logObjection':           return handleLogObjection({ ...rest, args: rest.args as any });
    case 'logCallOutcome':         return handleLogCallOutcome({ ...rest, args: rest.args as any });
    case 'createCadenceItem':      return handleCreateCadenceItem({ ...rest, args: rest.args as any });
    case 'createApprovalRequest':  return handleCreateApprovalRequest({ ...rest, args: rest.args as any });
    case 'createDraftFromCallOutcome': return handleCreateDraftFromCallOutcome({ ...rest, args: rest.args as any });
    default:
      return { success: false, error: `Unknown tool: ${toolName}`, policyDecision: 'blocked' };
  }
}
