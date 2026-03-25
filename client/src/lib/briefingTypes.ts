// ── Manager Daily Briefing — Domain Model ────────────────────────────────────
// Every field has a purpose. Nothing in a briefing is cosmetic.
// All dates in DD/MM/YYYY format — NON-NEGOTIABLE.

// ── Priority ─────────────────────────────────────────────────────────────────

export type BriefingPriority = 'critical' | 'urgent' | 'important' | 'watchlist';

export const BRIEFING_PRIORITY_LABELS: Record<BriefingPriority, string> = {
  critical: 'Critical',
  urgent: 'Urgent',
  important: 'Important',
  watchlist: 'Watchlist',
};

export const BRIEFING_PRIORITY_STYLES: Record<BriefingPriority, string> = {
  critical: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
  urgent: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800',
  important: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  watchlist: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
};

export const BRIEFING_PRIORITY_DOT: Record<BriefingPriority, string> = {
  critical: 'bg-red-500',
  urgent: 'bg-orange-500',
  important: 'bg-amber-500',
  watchlist: 'bg-blue-400',
};

export const BRIEFING_PRIORITY_ORDER: Record<BriefingPriority, number> = {
  critical: 0,
  urgent: 1,
  important: 2,
  watchlist: 3,
};

// ── Section types ─────────────────────────────────────────────────────────────

export type BriefingSectionType =
  | 'approvals'        // sweep actions + cadence approvals waiting
  | 'risks'            // churn risk accounts + failed sends
  | 'opportunities'    // expansion + referral ready
  | 'blocked'          // stalled onboarding, blocked provisioning
  | 'watchlist'        // this-week + low-risk items to stay aware of
  | 'changes';         // what shifted since last briefing

export const BRIEFING_SECTION_LABELS: Record<BriefingSectionType, string> = {
  approvals: 'Approvals Waiting',
  risks: 'Risks Detected',
  opportunities: 'Hot Opportunities',
  blocked: 'Blocked Items',
  watchlist: 'Watchlist',
  changes: "What's Changed",
};

export const BRIEFING_SECTION_ICONS: Record<BriefingSectionType, string> = {
  approvals: 'shield-check',
  risks: 'alert-triangle',
  opportunities: 'trending-up',
  blocked: 'lock',
  watchlist: 'eye',
  changes: 'activity',
};

// ── Action types ──────────────────────────────────────────────────────────────

export type BriefingItemAction =
  | 'approve'
  | 'review'
  | 'contact'
  | 'intervene'
  | 'escalate'
  | 'retry_send'
  | 'view'
  | 'log_call';

export const BRIEFING_ACTION_LABELS: Record<BriefingItemAction, string> = {
  approve: 'Approve Now',
  review: 'Review',
  contact: 'Contact',
  intervene: 'Intervene',
  escalate: 'Escalate',
  retry_send: 'Retry Send',
  view: 'View Details',
  log_call: 'Log Outcome',
};

// ── Source layers ─────────────────────────────────────────────────────────────

export type BriefingSourceLayer =
  | 'cadence'
  | 'expansion'
  | 'referral'
  | 'sweep'
  | 'comms'
  | 'proposal'
  | 'onboarding';

export const BRIEFING_SOURCE_LABELS: Record<BriefingSourceLayer, string> = {
  cadence: 'Cadence Engine',
  expansion: 'Expansion Engine',
  referral: 'Referral Engine',
  sweep: 'Sweep Runner',
  comms: 'Communication Layer',
  proposal: 'Proposal System',
  onboarding: 'Onboarding Flow',
};

// ── Drilldown ─────────────────────────────────────────────────────────────────

export interface BriefingDrilldown {
  label: string;
  path: string;          // Internal route e.g. '/clients', '/pipeline', '/execution'
  entityId?: string;     // Optional specific entity to highlight
}

// ── Item ─────────────────────────────────────────────────────────────────────

export interface BriefingItem {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client' | 'system';
  title: string;
  why: string;             // Why this was included — MANDATORY. Never empty.
  context?: string;        // Secondary context if useful
  priority: BriefingPriority;
  action: BriefingItemAction;
  actionLabel: string;
  drilldown?: BriefingDrilldown;
  sourceLayer: BriefingSourceLayer;
  facts: string[];         // Short bullet facts that drove inclusion — max 4
  isNew?: boolean;         // Not in previous briefing
  reviewed?: boolean;
  reviewedAt?: string;
}

// ── Section ───────────────────────────────────────────────────────────────────

export interface BriefingSection {
  type: BriefingSectionType;
  label: string;
  items: BriefingItem[];
  summary: string;          // One-line human-readable summary of this section
  topPriority: BriefingPriority;
}

// ── Change ────────────────────────────────────────────────────────────────────

export type BriefingChangeDelta = 'increased' | 'decreased' | 'new' | 'resolved';

export interface BriefingChange {
  id: string;
  label: string;
  delta: BriefingChangeDelta;
  magnitude: 'critical' | 'significant' | 'minor';
  context: string;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface BriefingSummary {
  totalItems: number;
  criticalCount: number;
  urgentCount: number;
  importantCount: number;
  approvalsWaiting: number;
  risksDetected: number;
  opportunitiesAvailable: number;
  blockedCount: number;
  watchlistCount: number;
}

// ── Delivery state ────────────────────────────────────────────────────────────

export type BriefingDeliveryMode = 'in_app' | 'email_pending' | 'slack_pending';

export interface BriefingDeliveryState {
  mode: BriefingDeliveryMode;
  sentAt?: string;
  recipient?: string;
}

// ── Source data snapshot ──────────────────────────────────────────────────────
// Attached to every briefing so inspectors can see what fed it.

export interface BriefingSourceSnapshot {
  overdueLeadsCount: number;
  overdueClientsCount: number;
  totalPendingCadenceItems: number;
  churnRisksCount: number;
  churnCriticalCount: number;
  expansionOpportunitiesCount: number;
  referralCandidatesCount: number;
  pendingApprovalsCount: number;
  failedSendsCount: number;
  blockedLeadsCount: number;
}

// ── Snapshot (persisted to Firestore) ────────────────────────────────────────

export interface BriefingSnapshot {
  id?: string;
  orgId: string;
  generatedAt: string;      // DD/MM/YYYY HH:mm
  briefingDate: string;     // DD/MM/YYYY — date this briefing represents
  summary: BriefingSummary;
  itemIds: string[];        // IDs of items included (for change detection)
  sourceSnapshot: BriefingSourceSnapshot;
  reviewedItemIds: string[];
}

// ── Root briefing ─────────────────────────────────────────────────────────────

export interface DailyBriefing {
  generatedAt: string;
  briefingDate: string;
  summary: BriefingSummary;
  topAction: BriefingItem | null;
  sections: BriefingSection[];
  changes: BriefingChange[];
  delivery: BriefingDeliveryState;
  sourceSnapshot: BriefingSourceSnapshot;
  debugInfo: BriefingDebugInfo;
}

// ── Debug / inspection ────────────────────────────────────────────────────────

export interface BriefingDebugEntry {
  entityId: string;
  entityName: string;
  sourceLayer: BriefingSourceLayer;
  included: boolean;
  includeReason?: string;
  excludeReason?: string;
  priority?: BriefingPriority;
  evaluatedAt: string;
}

export interface BriefingDebugInfo {
  evaluatedAt: string;
  totalEvaluated: number;
  totalIncluded: number;
  totalExcluded: number;
  inclusionLog: BriefingDebugEntry[];
}
