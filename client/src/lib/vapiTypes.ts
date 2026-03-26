// =============================================================================
// MOMENTUM VAPI — DOMAIN TYPES
// =============================================================================
// Typed contracts for the Vapi voice agent layer.
// Vapi = voice interface layer. Momentum = logic/orchestration layer.
// All tool calls go through Momentum service boundaries — never raw Vapi writes.
// =============================================================================

// ---------------------------------------------------------------------------
// Call intent — what kind of call this is
// ---------------------------------------------------------------------------

export type VapiCallIntent =
  | 'outbound_prospecting'
  | 'appointment_setting'
  | 'discovery_qualification'
  | 'strategy_follow_up'
  | 'proposal_follow_up'
  | 'dormant_lead_reactivation'
  | 'churn_intervention'
  | 'referral_ask'
  | 'inbound_lead_capture';

// ---------------------------------------------------------------------------
// Call outcome categories
// ---------------------------------------------------------------------------

export type VapiCallOutcome =
  | 'meeting_booked'
  | 'callback_requested'
  | 'not_interested'
  | 'voicemail_left'
  | 'no_answer'
  | 'objection_logged'
  | 'lead_qualified'
  | 'lead_disqualified'
  | 'referral_given'
  | 'intervention_succeeded'
  | 'intervention_failed'
  | 'follow_up_required'
  | 'escalated_to_human'
  | 'inbound_lead_created'
  | 'unknown';

// ---------------------------------------------------------------------------
// Policy mode — controls what Vapi tools are allowed to do
// ---------------------------------------------------------------------------

export type VapiPolicyMode =
  | 'approval_only'     // All write actions queue for human approval
  | 'low_risk_auto'     // Log/note/draft actions auto; booking/write actions queue
  | 'off';              // Vapi voice disabled

// ---------------------------------------------------------------------------
// Tool names — the exact identifiers Vapi uses in tool_call events
// ---------------------------------------------------------------------------

export type VapiToolName =
  | 'lookupLead'
  | 'lookupAccount'
  | 'createLead'
  | 'createFollowUpTask'
  | 'createCallNote'
  | 'scheduleMeetingRequest'
  | 'requestCallback'
  | 'logObjection'
  | 'logCallOutcome'
  | 'createCadenceItem'
  | 'createApprovalRequest'
  | 'createDraftFromCallOutcome';

// ---------------------------------------------------------------------------
// Tool safety classification
// ---------------------------------------------------------------------------

export type VapiToolSafety = 'read_only' | 'low_risk' | 'high_risk';

export interface VapiToolDefinition {
  name:        VapiToolName;
  label:       string;
  description: string;
  safety:      VapiToolSafety;
  requiresApproval: boolean;    // In approval_only mode, all writes require approval
  autoAllowed:      boolean;    // In low_risk_auto mode, can execute automatically
}

export const VAPI_TOOLS: VapiToolDefinition[] = [
  { name: 'lookupLead',             label: 'Look Up Lead',              description: 'Read lead profile and stage from Momentum', safety: 'read_only', requiresApproval: false, autoAllowed: true },
  { name: 'lookupAccount',          label: 'Look Up Account',           description: 'Read client account and health from Momentum', safety: 'read_only', requiresApproval: false, autoAllowed: true },
  { name: 'createLead',             label: 'Create Lead',               description: 'Create a new inbound lead record', safety: 'low_risk', requiresApproval: false, autoAllowed: true },
  { name: 'createFollowUpTask',     label: 'Create Follow-Up Task',     description: 'Create a follow-up task in the Momentum execution queue', safety: 'low_risk', requiresApproval: false, autoAllowed: true },
  { name: 'createCallNote',         label: 'Log Call Note',             description: 'Write a call note to the lead/client activity log', safety: 'low_risk', requiresApproval: false, autoAllowed: true },
  { name: 'scheduleMeetingRequest', label: 'Schedule Meeting Request',  description: 'Create a meeting booking request (requires calendar integration)', safety: 'high_risk', requiresApproval: true, autoAllowed: false },
  { name: 'requestCallback',        label: 'Request Callback',          description: 'Create a callback request in the cadence queue', safety: 'low_risk', requiresApproval: false, autoAllowed: true },
  { name: 'logObjection',           label: 'Log Objection',             description: 'Write an objection record to the intelligence layer', safety: 'low_risk', requiresApproval: false, autoAllowed: true },
  { name: 'logCallOutcome',         label: 'Log Call Outcome',          description: 'Record the final call outcome with stage/next-step implications', safety: 'low_risk', requiresApproval: false, autoAllowed: true },
  { name: 'createCadenceItem',      label: 'Add Cadence Item',          description: 'Create a reminder or follow-up in the Momentum cadence', safety: 'low_risk', requiresApproval: false, autoAllowed: true },
  { name: 'createApprovalRequest',  label: 'Create Approval Request',   description: 'Queue an action for human approval before execution', safety: 'low_risk', requiresApproval: false, autoAllowed: true },
  { name: 'createDraftFromCallOutcome', label: 'Draft From Call Outcome', description: 'Generate a communication draft based on the call outcome', safety: 'low_risk', requiresApproval: false, autoAllowed: true },
];

// ---------------------------------------------------------------------------
// Call record — stored in Firestore: orgs/{orgId}/vapiCalls/{callId}
// ---------------------------------------------------------------------------

export type VapiCallStatus =
  | 'initiated'
  | 'ringing'
  | 'in-progress'
  | 'forwarding'
  | 'ended'
  | 'failed';

export interface VapiCallRecord {
  callId:          string;
  vapiCallId?:     string;        // Vapi's internal call ID
  orgId:           string;
  intent:          VapiCallIntent;
  policyMode:      VapiPolicyMode;
  entityType:      'lead' | 'client' | 'inbound';
  entityId?:       string;
  entityName?:     string;
  phoneNumber:     string;
  assistantId?:    string;
  status:          VapiCallStatus;
  outcome?:        VapiCallOutcome;
  durationSeconds?: number;
  startedAt?:      string;        // ISO
  endedAt?:        string;        // ISO
  initiatedAt:     string;        // ISO
  initiatedBy:     string;        // userId
  toolCallCount:   number;
  toolCallLog:     VapiToolCallRecord[];
  callSummary?:    string;        // Generated by Vapi end-of-call summary
  callTranscript?: string;        // If Vapi provides transcript
  objections:      string[];
  nextStep?:       string;
  approvalRequired: boolean;
  notes?:          string;
}

// ---------------------------------------------------------------------------
// Tool call record — audit trail
// ---------------------------------------------------------------------------

export interface VapiToolCallRecord {
  toolCallId:  string;
  toolName:    VapiToolName;
  calledAt:    string;       // ISO
  args:        Record<string, unknown>;
  result:      'success' | 'blocked' | 'error';
  policyDecision: 'auto_allowed' | 'queued_for_approval' | 'blocked' | 'read_only';
  error?:      string;
  firestoreRef?: string;     // Path of the doc written, if any
}

// ---------------------------------------------------------------------------
// Org Vapi configuration — stored in Firestore: orgs/{orgId}/vapiConfig/default
// ---------------------------------------------------------------------------

export interface VapiAssistantConfig {
  intentId:    VapiCallIntent;
  assistantId: string;         // Vapi assistant ID (from Vapi dashboard)
  label:       string;
  enabled:     boolean;
}

export interface VapiOrgConfig {
  orgId:          string;
  vapiEnabled:    boolean;
  policyMode:     VapiPolicyMode;
  phoneNumberId?: string;        // Override for this org (else uses env var)
  assistants:     VapiAssistantConfig[];
  enabledIntents: VapiCallIntent[];
  calendarIntegrationConfigured: boolean;
  escalationEmail?: string;
  complianceNotes?: string;
  updatedAt:      string;
  updatedBy:      string;
}

// ---------------------------------------------------------------------------
// Conversation framework — guarded NEPQ-style call structure
// ---------------------------------------------------------------------------

export type ConversationStage =
  | 'intro'
  | 'purpose'
  | 'discovery'
  | 'implication'
  | 'solution_framing'
  | 'objection_handling'
  | 'next_step'
  | 'close'
  | 'escalation';

export interface ConversationGoal {
  stage:      ConversationStage;
  purpose:    string;
  allowedQuestions: string[];    // Vetted, approved question prompts
  escalationConditions: string[];
  maxAttempts: number;
}

export interface CallConversationFramework {
  intent:     VapiCallIntent;
  stages:     ConversationGoal[];
  allowedTools: VapiToolName[];
  forbiddenTopics: string[];
  escalationTriggers: string[];
  systemPromptHints: string;     // Fragment fed to Vapi assistant system prompt
}

// ---------------------------------------------------------------------------
// Call health / workspace types
// ---------------------------------------------------------------------------

export interface VapiHealthStatus {
  configured:          boolean;
  apiKeySet:           boolean;
  phoneNumberIdSet:    boolean;
  webhookSecuredSet:   boolean;
  assistantsConfigured: number;
  enabledIntents:      VapiCallIntent[];
  missingSections:     string[];
}

export interface VapiRecentCallSummary {
  callId:       string;
  intent:       VapiCallIntent;
  entityName?:  string;
  status:       VapiCallStatus;
  outcome?:     VapiCallOutcome;
  durationSeconds?: number;
  initiatedAt:  string;
  toolCallCount: number;
}
