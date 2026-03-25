// ── Sweep scope ───────────────────────────────────────────────────────────────

export type SweepScope =
  | 'cadence'
  | 'churn_risk'
  | 'referral_window'
  | 'expansion'
  | 'lead_inactivity';

export const SWEEP_SCOPE_LABELS: Record<SweepScope, string> = {
  cadence: 'Cadence Health',
  churn_risk: 'Churn Risk',
  referral_window: 'Referral Window',
  expansion: 'Expansion Opportunity',
  lead_inactivity: 'Lead Inactivity',
};

export const SWEEP_SCOPE_DESCRIPTIONS: Record<SweepScope, string> = {
  cadence: 'Finds contacts overdue for follow-up based on cadence rules',
  churn_risk: 'Flags clients showing churn signals above threshold',
  referral_window: 'Identifies clients ready for a referral ask',
  expansion: 'Surfaces clients ready for upsell or expansion conversation',
  lead_inactivity: 'Catches leads going cold at key pipeline stages',
};

// ── Schedule model ────────────────────────────────────────────────────────────

export type SweepScheduleMode = 'every_hour' | 'twice_daily' | 'daily_morning' | 'manual' | 'disabled';

export const SCHEDULE_MODE_LABELS: Record<SweepScheduleMode, string> = {
  every_hour: 'Every Hour',
  twice_daily: 'Twice Daily (6am & 2pm)',
  daily_morning: 'Daily Morning',
  manual: 'Manual Only',
  disabled: 'Disabled',
};

export interface SweepScheduleSettings {
  orgId: string;
  mode: SweepScheduleMode;
  dailyHour: number;             // AEST hour for daily_morning mode
  weekdaysOnly: boolean;
  enabledScopes: SweepScope[];
  lastRunAt?: string;
  nextRunEstimate?: string;
  updatedAt: string;
  updatedBy: string;
}

// ── Run record ────────────────────────────────────────────────────────────────

export type SweepRunStatus = 'running' | 'complete' | 'error';

export interface SweepRunRecord {
  id?: string;
  orgId: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  status: SweepRunStatus;
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

// ── Sweep action (output) ─────────────────────────────────────────────────────

export type SweepActionOutcome = 'auto_created' | 'approval_queued' | 'recommendation' | 'suppressed_dedupe' | 'blocked_policy' | 'blocked_context';

export interface SweepAction {
  id?: string;
  orgId: string;
  sweepRunId?: string;
  scope: SweepScope;
  actionType: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  safetyLevel: string;
  outcome: SweepActionOutcome;
  reason: string;
  contextFacts: string[];
  suggestedAction: string;
  priority: 'urgent' | 'high' | 'normal';
  policyRuleId?: string;
  policyOutcome?: string;
  suppressionReason?: string;
  dedupeKey?: string;
  createdAt: string;
  reviewed?: boolean;
  reviewedAt?: string;
  reviewedBy?: string;
}

// ── Suppression record ────────────────────────────────────────────────────────

export interface SweepSuppression {
  id?: string;
  orgId: string;
  sweepRunId?: string;
  dedupeKey: string;
  actionType: string;
  entityId: string;
  entityName: string;
  scope: SweepScope;
  suppressionReason: 'dedupe_cooldown' | 'policy_blocked' | 'context_condition';
  suppressionDetail: string;
  expiresAt?: string;
  suppressedAt: string;
}

// ── Org automation settings ────────────────────────────────────────────────────

export interface AutomationOrgSettings {
  orgId: string;
  sweepEnabled: boolean;
  schedule: SweepScheduleSettings;
  lastSweepRunId?: string;
  totalSweepRuns: number;
  totalActionsCreated: number;
  updatedAt: string;
}

// ── Runner state (derived for UI) ──────────────────────────────────────────────

export interface SweepRunnerState {
  lastRun?: SweepRunRecord;
  nextRunEstimate?: string;
  isRunning: boolean;
  schedule?: SweepScheduleSettings;
  totalRuns: number;
  actionsThisWeek: number;
  pendingApprovals: number;
}

export const DEFAULT_SWEEP_SCHEDULE: Omit<SweepScheduleSettings, 'orgId' | 'updatedAt' | 'updatedBy'> = {
  mode: 'manual',
  dailyHour: 8,
  weekdaysOnly: true,
  enabledScopes: ['cadence', 'churn_risk', 'referral_window', 'expansion', 'lead_inactivity'],
};
