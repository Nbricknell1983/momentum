// ── Safety levels ─────────────────────────────────────────────────────────────

export type AutopilotSafetyLevel = 'low_risk' | 'medium_risk' | 'high_risk' | 'restricted';

export const SAFETY_LEVEL_LABELS: Record<AutopilotSafetyLevel, string> = {
  low_risk: 'Low Risk',
  medium_risk: 'Medium Risk',
  high_risk: 'High Risk',
  restricted: 'Restricted',
};

export const SAFETY_LEVEL_DESCRIPTIONS: Record<AutopilotSafetyLevel, string> = {
  low_risk: 'Internal only. No external communication. Safe to auto-run.',
  medium_risk: 'Internal action with potential downstream impact. Approval optional.',
  high_risk: 'Client-facing or pipeline-affecting. Human review required by default.',
  restricted: 'Blocked by policy or context. Cannot run in current conditions.',
};

// ── Policy outcomes ───────────────────────────────────────────────────────────

export type AutopilotOutcome =
  | 'auto_allowed'
  | 'approval_required'
  | 'recommendation_only'
  | 'blocked';

export const OUTCOME_LABELS: Record<AutopilotOutcome, string> = {
  auto_allowed: 'Auto-Run',
  approval_required: 'Approval Required',
  recommendation_only: 'Recommendation Only',
  blocked: 'Blocked',
};

export const OUTCOME_STYLES: Record<AutopilotOutcome, string> = {
  auto_allowed: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  approval_required: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  recommendation_only: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  blocked: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
};

// ── Action types ──────────────────────────────────────────────────────────────

export type AutopilotActionType =
  | 'create_cadence_reminder'
  | 'flag_churn_risk'
  | 'flag_upsell_opportunity'
  | 'flag_referral_window'
  | 'log_activity'
  | 'generate_draft'
  | 'queue_communication'
  | 'update_lead_stage'
  | 'send_communication'
  | 'create_referral_ask'
  | 'request_expansion'
  | 'send_portal_digest';

export const ACTION_TYPE_LABELS: Record<AutopilotActionType, string> = {
  create_cadence_reminder: 'Create Cadence Reminder',
  flag_churn_risk: 'Flag Churn Risk',
  flag_upsell_opportunity: 'Flag Upsell Opportunity',
  flag_referral_window: 'Flag Referral Window',
  log_activity: 'Log Activity',
  generate_draft: 'Generate Draft',
  queue_communication: 'Queue Communication',
  update_lead_stage: 'Update Lead Stage',
  send_communication: 'Send Communication',
  create_referral_ask: 'Create Referral Ask',
  request_expansion: 'Request Expansion',
  send_portal_digest: 'Send Portal Digest',
};

// ── Global autopilot mode ─────────────────────────────────────────────────────

export type AutopilotGlobalMode =
  | 'active'          // apply all rules, auto-run where allowed
  | 'approval_only'   // force approval on everything, ignore auto_allowed rules
  | 'recommendations_only' // surface as suggestions, nothing runs
  | 'off';            // fully disabled

export const GLOBAL_MODE_LABELS: Record<AutopilotGlobalMode, string> = {
  active: 'Active',
  approval_only: 'Approval-Only Mode',
  recommendations_only: 'Recommendations Only',
  off: 'Off',
};

export const GLOBAL_MODE_DESCRIPTIONS: Record<AutopilotGlobalMode, string> = {
  active: 'Policy rules applied. Low-risk actions auto-run. High-risk actions require approval.',
  approval_only: 'All actions require explicit approval regardless of safety level.',
  recommendations_only: 'All actions are surfaced as suggestions only. Nothing runs automatically.',
  off: 'Autopilot is disabled. No actions are generated or queued.',
};

// ── Context conditions ────────────────────────────────────────────────────────

export interface AutopilotCondition {
  field: 'health_status' | 'churn_risk' | 'delivery_status' | 'account_stage' | 'channel' | 'days_since_contact';
  operator: 'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte' | 'in';
  value: string | number | string[];
  label: string; // human-readable form of the condition
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export interface AutopilotRule {
  id: string;
  actionType: AutopilotActionType;
  safetyLevel: AutopilotSafetyLevel;
  defaultOutcome: AutopilotOutcome; // outcome when conditions are normal
  escalatedOutcome?: AutopilotOutcome; // outcome when conditions are elevated-risk
  escalationConditions?: AutopilotCondition[]; // conditions that trigger escalation
  label: string;
  description: string;
  rationale: string;
  enabled: boolean;
  orgOverride?: AutopilotOutcome; // org has changed the default
  channels?: string[]; // if action involves a channel, restrict to these
}

// ── Policy (per org) ──────────────────────────────────────────────────────────

export interface AutopilotOrgPolicy {
  orgId: string;
  globalMode: AutopilotGlobalMode;
  rules: AutopilotRule[];
  updatedAt: string;
  updatedBy: string;
}

// ── Decision ──────────────────────────────────────────────────────────────────

export interface AutopilotDecision {
  id: string;
  actionType: AutopilotActionType;
  actionLabel: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client' | 'org';
  safetyLevel: AutopilotSafetyLevel;
  outcome: AutopilotOutcome;
  ruleId: string;
  ruleLabel: string;
  explanation: string;
  context: string[];           // facts that informed the decision
  whatWouldChange?: string;    // what would need to change for it to auto-run
  overriddenBy?: string;       // if global mode changed the default
  decidedAt: string;
}

// ── Audit event ───────────────────────────────────────────────────────────────

export type AutopilotAuditEventType =
  | 'decision_made'
  | 'action_auto_run'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_denied'
  | 'action_blocked'
  | 'policy_changed'
  | 'global_mode_changed';

export interface AutopilotAuditEvent {
  id?: string;
  orgId: string;
  eventType: AutopilotAuditEventType;
  actionType?: AutopilotActionType;
  entityId?: string;
  entityName?: string;
  outcome?: AutopilotOutcome;
  ruleId?: string;
  performedBy: string;
  note?: string;
  occurredAt: string;
}

// ── Workspace state ───────────────────────────────────────────────────────────

export interface AutopilotState {
  globalMode: AutopilotGlobalMode;
  rules: AutopilotRule[];
  decisions: AutopilotDecision[];
  autoRunCount: number;
  approvalPendingCount: number;
  blockedCount: number;
  recommendationCount: number;
  generatedAt: string;
}

// ── Default rules ─────────────────────────────────────────────────────────────

export const DEFAULT_AUTOPILOT_RULES: AutopilotRule[] = [
  // ── Low risk: internal only ─────────────────────────────────────────────────
  {
    id: 'rule_cadence_reminder',
    actionType: 'create_cadence_reminder',
    safetyLevel: 'low_risk',
    defaultOutcome: 'auto_allowed',
    label: 'Create Cadence Reminders',
    description: 'Automatically create follow-up reminders based on contact cadence rules.',
    rationale: 'Internal-only action. No external communication. Safe to auto-generate based on inactivity or stage rules.',
    enabled: true,
  },
  {
    id: 'rule_churn_flag',
    actionType: 'flag_churn_risk',
    safetyLevel: 'low_risk',
    defaultOutcome: 'auto_allowed',
    label: 'Flag Churn Risks',
    description: 'Automatically flag accounts showing churn signals for internal review.',
    rationale: 'Internal alert only. Creates visibility without triggering any client-facing action.',
    enabled: true,
  },
  {
    id: 'rule_upsell_flag',
    actionType: 'flag_upsell_opportunity',
    safetyLevel: 'low_risk',
    defaultOutcome: 'auto_allowed',
    label: 'Flag Upsell Opportunities',
    description: 'Automatically surface expansion opportunities when accounts hit readiness thresholds.',
    rationale: 'Internal signal detection only. Adds items to the internal expansion queue for manager review.',
    enabled: true,
  },
  {
    id: 'rule_referral_flag',
    actionType: 'flag_referral_window',
    safetyLevel: 'low_risk',
    defaultOutcome: 'auto_allowed',
    label: 'Flag Referral Windows',
    description: 'Automatically surface referral candidate notifications when readiness score exceeds threshold.',
    rationale: 'Internal flag. Adds to the referral engine candidates view without any external action.',
    enabled: true,
  },
  {
    id: 'rule_log_activity',
    actionType: 'log_activity',
    safetyLevel: 'low_risk',
    defaultOutcome: 'auto_allowed',
    label: 'Log Activities',
    description: 'Auto-log system-generated activity records for audit and history.',
    rationale: 'Read-only audit trail. No external communication or pipeline change.',
    enabled: true,
  },

  // ── Medium risk: approval optional ──────────────────────────────────────────
  {
    id: 'rule_generate_draft',
    actionType: 'generate_draft',
    safetyLevel: 'medium_risk',
    defaultOutcome: 'approval_required',
    escalatedOutcome: 'recommendation_only',
    escalationConditions: [
      { field: 'health_status', operator: 'eq', value: 'red', label: 'Account health is red' },
      { field: 'churn_risk', operator: 'gte', value: 0.6, label: 'Churn risk ≥60%' },
    ],
    label: 'Generate Communication Drafts',
    description: 'Generate AI drafts for pending cadence items and communication intents.',
    rationale: 'Draft generation is internal but precedes external communication. Review ensures quality and tone.',
    enabled: true,
  },
  {
    id: 'rule_queue_comms',
    actionType: 'queue_communication',
    safetyLevel: 'medium_risk',
    defaultOutcome: 'approval_required',
    label: 'Queue Communications',
    description: 'Move approved drafts into the execution queue for sending.',
    rationale: 'Queuing is one step from sending. Approval gate ensures no accidental sends.',
    enabled: true,
  },
  {
    id: 'rule_stage_update',
    actionType: 'update_lead_stage',
    safetyLevel: 'medium_risk',
    defaultOutcome: 'recommendation_only',
    label: 'Update Lead Stage',
    description: 'Recommend lead stage progressions based on activity signals.',
    rationale: 'Stage changes affect pipeline reporting. Recommended rather than auto-applied to keep pipeline accurate.',
    enabled: true,
  },

  // ── High risk: client-facing ─────────────────────────────────────────────────
  {
    id: 'rule_send_comms',
    actionType: 'send_communication',
    safetyLevel: 'high_risk',
    defaultOutcome: 'approval_required',
    escalatedOutcome: 'blocked',
    escalationConditions: [
      { field: 'health_status', operator: 'eq', value: 'red', label: 'Account health is red' },
      { field: 'churn_risk', operator: 'gte', value: 0.7, label: 'Very high churn risk' },
    ],
    label: 'Send Client-Facing Communication',
    description: 'Direct external communication via email, SMS, or other channels.',
    rationale: 'All external communication must be reviewed by a human before sending. This cannot be auto-run.',
    enabled: true,
  },
  {
    id: 'rule_referral_ask',
    actionType: 'create_referral_ask',
    safetyLevel: 'high_risk',
    defaultOutcome: 'approval_required',
    escalatedOutcome: 'blocked',
    escalationConditions: [
      { field: 'health_status', operator: 'ne', value: 'green', label: 'Account health is not green' },
      { field: 'churn_risk', operator: 'gte', value: 0.4, label: 'Churn risk ≥40%' },
    ],
    label: 'Create Referral Ask',
    description: 'Initiate a referral ask campaign for a client account.',
    rationale: 'Referral asks are relationship-sensitive. Timing and tone must be human-judged. Requires account manager review.',
    enabled: true,
  },
  {
    id: 'rule_expansion_ask',
    actionType: 'request_expansion',
    safetyLevel: 'high_risk',
    defaultOutcome: 'recommendation_only',
    label: 'Request Expansion / Upsell',
    description: 'Surface expansion or upsell conversations with existing clients.',
    rationale: 'Upsell asks require strategic timing and relationship awareness. Always a recommendation — never auto-initiated.',
    enabled: true,
  },
  {
    id: 'rule_portal_digest',
    actionType: 'send_portal_digest',
    safetyLevel: 'high_risk',
    defaultOutcome: 'approval_required',
    label: 'Send Client Portal Digest',
    description: 'Send automated performance digest emails to clients via the portal.',
    rationale: 'Client-facing email summarising performance data. Requires review to ensure data is accurate before sending.',
    enabled: true,
  },
];
