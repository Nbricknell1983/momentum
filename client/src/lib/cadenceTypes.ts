/**
 * Cadence + Automation Layer — Domain Model
 *
 * All cadence items are derived from existing Lead and Client portfolio data.
 * Safe controls (dismiss / snooze / complete) are managed in session state
 * and can be upgraded to Firestore persistence without changing the domain model.
 */

// ── Trigger Taxonomy ──────────────────────────────────────────────────────────

export type CadenceTriggerType =
  | 'proposal_no_movement'       // Proposal stage, no activity in N days
  | 'verbal_commit_stall'        // Verbal commit, no follow-through in N days
  | 'discovery_stall'            // Discovery stage, no meeting booked
  | 'engaged_going_cold'         // Engaged/qualified, silence building
  | 'contact_overdue'            // nextContactDate has passed
  | 'no_response_streak'         // Multiple touches, zero response
  | 'approval_blocked'           // Client delivery blocked
  | 'churn_risk_intervention'    // Client health red / score critical
  | 'amber_health_check'         // Client amber health, overdue contact
  | 'post_completion_followup'   // Delivery complete, no follow-up yet
  | 'upsell_window_open'         // Upsell readiness flagged
  | 'referral_window_open'       // Referral timing optimal
  | 'onboarding_field_gap'       // Onboarding info incomplete
  | 'client_inactivity'          // Client not contacted beyond cadence
  | 'lead_inactivity';           // Lead dark for extended period

// ── Grouping ──────────────────────────────────────────────────────────────────

export type CadenceGroupCategory =
  | 'sales'
  | 'onboarding'
  | 'account_growth'
  | 'churn_intervention'
  | 'referrals';

export const CADENCE_GROUP_LABELS: Record<CadenceGroupCategory, string> = {
  sales: 'Sales Pipeline',
  onboarding: 'Onboarding',
  account_growth: 'Account Growth',
  churn_intervention: 'Churn Intervention',
  referrals: 'Referrals',
};

export const CADENCE_GROUP_COLORS: Record<CadenceGroupCategory, string> = {
  sales: 'text-violet-600',
  onboarding: 'text-blue-600',
  account_growth: 'text-emerald-600',
  churn_intervention: 'text-red-600',
  referrals: 'text-pink-600',
};

export const CADENCE_GROUP_BG: Record<CadenceGroupCategory, string> = {
  sales: 'bg-violet-50 border-violet-200',
  onboarding: 'bg-blue-50 border-blue-200',
  account_growth: 'bg-emerald-50 border-emerald-200',
  churn_intervention: 'bg-red-50 border-red-200',
  referrals: 'bg-pink-50 border-pink-200',
};

// ── Item Status ───────────────────────────────────────────────────────────────

export type CadenceItemStatus = 'pending' | 'dismissed' | 'snoozed' | 'completed';

export const CADENCE_STATUS_LABELS: Record<CadenceItemStatus, string> = {
  pending: 'Pending',
  dismissed: 'Dismissed',
  snoozed: 'Snoozed',
  completed: 'Done',
};

// ── Urgency ───────────────────────────────────────────────────────────────────

export type CadenceUrgency = 'overdue' | 'today' | 'this_week' | 'upcoming';

export const CADENCE_URGENCY_LABELS: Record<CadenceUrgency, string> = {
  overdue: 'Overdue',
  today: 'Due Today',
  this_week: 'This Week',
  upcoming: 'Upcoming',
};

export const CADENCE_URGENCY_COLORS: Record<CadenceUrgency, string> = {
  overdue: 'text-red-600',
  today: 'text-orange-600',
  this_week: 'text-amber-600',
  upcoming: 'text-blue-600',
};

export const CADENCE_URGENCY_BG: Record<CadenceUrgency, string> = {
  overdue: 'bg-red-100 text-red-700',
  today: 'bg-orange-100 text-orange-700',
  this_week: 'bg-amber-100 text-amber-700',
  upcoming: 'bg-blue-100 text-blue-700',
};

// ── Cadence Rule ──────────────────────────────────────────────────────────────

export interface CadenceRule {
  id: string;
  name: string;
  triggerType: CadenceTriggerType;
  description: string;
  applyTo: 'lead' | 'client' | 'both';
  daysAfterTrigger: number;
  urgency: CadenceUrgency;
  groupCategory: CadenceGroupCategory;
}

// ── Cadence Trigger ───────────────────────────────────────────────────────────

export interface CadenceTrigger {
  type: CadenceTriggerType;
  detectedAt: string;
  evidence: string[];
  daysElapsed?: number;
}

// ── Cadence Queue Item ────────────────────────────────────────────────────────

export interface CadenceQueueItem {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  ruleId: string;
  trigger: CadenceTrigger;
  groupCategory: CadenceGroupCategory;

  // Timing
  dueDate: string;
  urgency: CadenceUrgency;
  overdueDays?: number;

  // Content
  title: string;
  reason: string;
  triggerExplanation: string;
  stageContext: string;
  recommendedAction: string;
  assetToReference?: string;
  suggestedWording?: string;

  // Ownership
  owner: string;
  linkedOpportunityId?: string;
  linkedRiskId?: string;

  // Status overlay (managed in session)
  status: CadenceItemStatus;
  snoozedUntil?: string;
  completedAt?: string;
  dismissedAt?: string;
  snoozeReason?: string;

  // Inspection
  sourceData: Record<string, string>;
}

// ── Follow-up Plan ────────────────────────────────────────────────────────────

export interface FollowUpPlan {
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  items: CadenceQueueItem[];
  nextDueDate?: string;
  totalPending: number;
}

// ── Approval Reminder ─────────────────────────────────────────────────────────

export interface ApprovalReminder extends CadenceQueueItem {
  approvalType: 'workstream' | 'strategy' | 'proposal' | 'onboarding';
  blockedSinceDays: number;
}

// ── Automated Nudge (preview-only, not sent) ──────────────────────────────────

export type NudgeTarget = 'internal' | 'client_draft';
export type NudgeType =
  | 'follow_up'
  | 'approval_reminder'
  | 'referral_ask'
  | 'check_in'
  | 'win_share'
  | 'proposal_chase'
  | 'intervention';

export const NUDGE_TYPE_LABELS: Record<NudgeType, string> = {
  follow_up: 'Follow-up',
  approval_reminder: 'Approval Reminder',
  referral_ask: 'Referral Ask',
  check_in: 'Check-in',
  win_share: 'Win Share',
  proposal_chase: 'Proposal Chase',
  intervention: 'Intervention',
};

export interface AutomatedNudge {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  nudgeType: NudgeType;
  target: NudgeTarget;
  subject: string;
  body: string;
  previewNote: string;
  scheduledFor?: string;
  status: 'draft' | 'ready' | 'suppressed';
  createdAt: string;
  linkedQueueItemId?: string;
}

// ── Cadence State Override ────────────────────────────────────────────────────

export interface CadenceItemOverride {
  status: CadenceItemStatus;
  snoozedUntil?: string;
  completedAt?: string;
  dismissedAt?: string;
  snoozeReason?: string;
}

export type CadenceOverrideMap = Record<string, CadenceItemOverride>;

// ── Portfolio Cadence State ───────────────────────────────────────────────────

export interface CadenceState {
  allItems: CadenceQueueItem[];
  overdueItems: CadenceQueueItem[];
  dueTodayItems: CadenceQueueItem[];
  dueThisWeekItems: CadenceQueueItem[];
  upcomingItems: CadenceQueueItem[];
  byCategory: Record<CadenceGroupCategory, CadenceQueueItem[]>;
  nudges: AutomatedNudge[];
  totalPending: number;
  criticalCount: number;
  generatedAt: string;
}

// ── Inspection Record ─────────────────────────────────────────────────────────

export interface CadenceInspectionRecord {
  itemId: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  ruleId: string;
  triggerType: CadenceTriggerType;
  whyFired: string;
  supportingData: Record<string, string>;
  recommendationGenerated: string;
  status: CadenceItemStatus;
  detectedAt: string;
}
