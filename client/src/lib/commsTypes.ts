/**
 * Communication Drafting Layer — Domain Model
 *
 * All drafts are generated deterministically from cadence items and entity state.
 * No draft is sent automatically. Every draft is human-reviewed by default.
 * AI enhancement is an optional layer that can be applied per-draft.
 */

// ── Channel ───────────────────────────────────────────────────────────────────

export type CommunicationChannel = 'email' | 'sms' | 'call_prep' | 'voicemail';

export const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  call_prep: 'Call Prep',
  voicemail: 'Voicemail',
};

export const CHANNEL_ICONS: Record<CommunicationChannel, string> = {
  email: '✉️',
  sms: '💬',
  call_prep: '📋',
  voicemail: '📞',
};

// ── Intent ────────────────────────────────────────────────────────────────────

export type CommunicationIntent =
  | 'discovery_followup'
  | 'strategy_review_followup'
  | 'proposal_acceptance_nudge'
  | 'verbal_commit_chase'
  | 'onboarding_completion_reminder'
  | 'approval_reminder'
  | 'dormant_lead_reactivation'
  | 'churn_risk_intervention'
  | 'upsell_conversation_opener'
  | 'referral_ask'
  | 'post_completion_checkin'
  | 'general_checkin';

export const INTENT_LABELS: Record<CommunicationIntent, string> = {
  discovery_followup: 'Discovery Follow-up',
  strategy_review_followup: 'Strategy Review Follow-up',
  proposal_acceptance_nudge: 'Proposal Acceptance Nudge',
  verbal_commit_chase: 'Verbal Commit Chase',
  onboarding_completion_reminder: 'Onboarding Reminder',
  approval_reminder: 'Approval Reminder',
  dormant_lead_reactivation: 'Dormant Lead Reactivation',
  churn_risk_intervention: 'Churn Risk Intervention',
  upsell_conversation_opener: 'Upsell Conversation',
  referral_ask: 'Referral Ask',
  post_completion_checkin: 'Post-Completion Check-in',
  general_checkin: 'General Check-in',
};

export const INTENT_COLORS: Record<CommunicationIntent, string> = {
  discovery_followup: 'bg-violet-100 text-violet-700',
  strategy_review_followup: 'bg-blue-100 text-blue-700',
  proposal_acceptance_nudge: 'bg-orange-100 text-orange-700',
  verbal_commit_chase: 'bg-red-100 text-red-700',
  onboarding_completion_reminder: 'bg-teal-100 text-teal-700',
  approval_reminder: 'bg-amber-100 text-amber-700',
  dormant_lead_reactivation: 'bg-zinc-100 text-zinc-700',
  churn_risk_intervention: 'bg-red-100 text-red-700',
  upsell_conversation_opener: 'bg-emerald-100 text-emerald-700',
  referral_ask: 'bg-pink-100 text-pink-700',
  post_completion_checkin: 'bg-emerald-100 text-emerald-600',
  general_checkin: 'bg-zinc-100 text-zinc-600',
};

// ── Draft Status ──────────────────────────────────────────────────────────────

export type DraftStatus = 'draft' | 'reviewed' | 'used' | 'discarded';

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  draft: 'Draft',
  reviewed: 'Reviewed',
  used: 'Used',
  discarded: 'Discarded',
};

// ── Asset Reference ───────────────────────────────────────────────────────────

export type AssetReferenceType =
  | 'strategy_report'
  | 'proposal'
  | 'growth_plan'
  | 'visibility_gap'
  | 'milestone'
  | 'portal'
  | 'roadmap'
  | 'delivery_summary';

export interface CommunicationAssetReference {
  type: AssetReferenceType;
  label: string;
  description: string;
  url?: string;
}

// ── Outcome Goal ──────────────────────────────────────────────────────────────

export interface CommunicationOutcomeGoal {
  primary: string;
  secondary?: string;
  timeframe: string;
}

// ── Per-channel Draft ─────────────────────────────────────────────────────────

export interface CommunicationChannelDraft {
  channel: CommunicationChannel;
  subject?: string;
  body: string;
  cta: string;
  tone: string;
  keyReferencePoint: string;
  estimatedDuration?: string;
}

// ── Thread Context ────────────────────────────────────────────────────────────

export interface CommunicationThreadContext {
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  contactName?: string;
  stage?: string;
  daysSinceActivity?: number;
  lastTouchChannel?: string;
  urgencyLevel: string;
  keySignal: string;
  assetAvailable?: string;
}

// ── Full Draft ────────────────────────────────────────────────────────────────

export interface CommunicationDraft {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  intent: CommunicationIntent;
  recommendedChannel: CommunicationChannel;
  channels: Partial<Record<CommunicationChannel, CommunicationChannelDraft>>;
  assetReference?: CommunicationAssetReference;
  outcomeGoal: CommunicationOutcomeGoal;

  // Explanation
  whyCreated: string;
  whatSignalTriggered: string;
  whyChannelChosen: string;
  outcomeIfSuccessful: string;

  // Context
  stageContext: string;
  urgency: string;
  linkedCadenceItemId?: string;

  // Review state (managed in session)
  status: DraftStatus;
  activeChannel: CommunicationChannel;
  editedBodies: Partial<Record<CommunicationChannel, string>>;
  usedChannel?: CommunicationChannel;
  usedAt?: string;
  markedUsedAt?: string;

  // Source
  generatedAt: string;
  aiEnhanced: boolean;
}

// ── Variant ───────────────────────────────────────────────────────────────────

export interface CommunicationVariant {
  id: string;
  label: string;
  tone: 'warm' | 'direct' | 'challenger';
  body: string;
}

// ── Draft State (session) ─────────────────────────────────────────────────────

export interface CommsDraftSession {
  drafts: CommunicationDraft[];
  activeId: string | null;
  filter: {
    intent: CommunicationIntent | 'all';
    status: DraftStatus | 'all';
    entityType: 'lead' | 'client' | 'all';
  };
  generatedAt: string;
}

// ── Inspection Record ─────────────────────────────────────────────────────────

export interface CommsDraftInspection {
  draftId: string;
  entityName: string;
  intent: CommunicationIntent;
  channels: CommunicationChannel[];
  recommendedChannel: CommunicationChannel;
  status: DraftStatus;
  linkedCadenceItemId?: string;
  whyCreated: string;
  signal: string;
  outcomeGoal: string;
  generatedAt: string;
  usedChannel?: CommunicationChannel;
  usedAt?: string;
  aiEnhanced: boolean;
}
