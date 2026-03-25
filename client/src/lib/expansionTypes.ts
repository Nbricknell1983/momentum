/**
 * Expansion Engine — Domain Model
 *
 * All types are derived from existing client portfolio state.
 * No AI calls required. Signals are evidence-based and actionable.
 */

// ── Core Signal Types ────────────────────────────────────────────────────────

export type GrowthSignalType =
  | 'module_gap'
  | 'delivery_stall'
  | 'milestone_achieved'
  | 'portal_inactive'
  | 'approval_blocked'
  | 'strong_engagement'
  | 'autopilot_eligible'
  | 'onboarding_complete'
  | 'churn_indicator'
  | 'referral_ready'
  | 'scope_expansion_ready';

export interface AccountGrowthSignal {
  id: string;
  clientId: string;
  clientName: string;
  signalType: GrowthSignalType;
  title: string;
  description: string;
  evidence: string[];
  detectedAt: string;
  confidence: 'high' | 'medium' | 'low';
}

// ── Expansion Opportunities ──────────────────────────────────────────────────

export type ExpansionOpportunityType =
  | 'add_seo'
  | 'add_gbp'
  | 'add_content'
  | 'add_ads'
  | 'add_autopilot'
  | 'add_portal_stakeholders'
  | 'add_local_seo'
  | 'add_telemetry'
  | 'expand_scope';

export const EXPANSION_OPPORTUNITY_LABELS: Record<ExpansionOpportunityType, string> = {
  add_seo: 'Add SEO',
  add_gbp: 'Add GBP Management',
  add_content: 'Add Content Engine',
  add_ads: 'Add Google Ads',
  add_autopilot: 'Enable Autopilot',
  add_portal_stakeholders: 'Expand Portal Access',
  add_local_seo: 'Add Local SEO Pages',
  add_telemetry: 'Add Telemetry',
  expand_scope: 'Expand Service Scope',
};

export const EXPANSION_OPPORTUNITY_COLORS: Record<ExpansionOpportunityType, string> = {
  add_seo: 'bg-blue-100 text-blue-700',
  add_gbp: 'bg-emerald-100 text-emerald-700',
  add_content: 'bg-violet-100 text-violet-700',
  add_ads: 'bg-orange-100 text-orange-700',
  add_autopilot: 'bg-cyan-100 text-cyan-700',
  add_portal_stakeholders: 'bg-pink-100 text-pink-700',
  add_local_seo: 'bg-teal-100 text-teal-700',
  add_telemetry: 'bg-indigo-100 text-indigo-700',
  expand_scope: 'bg-amber-100 text-amber-700',
};

export interface ExpansionOpportunity {
  id: string;
  clientId: string;
  clientName: string;
  type: ExpansionOpportunityType;
  title: string;
  why: string;
  expectedOutcome: string;
  confidence: 'high' | 'medium' | 'low';
  conversationAngle: string;
  evidence: string[];
  priority: 'urgent' | 'high' | 'medium' | 'low';
  estimatedImpact?: string;
}

// ── Churn Risk ───────────────────────────────────────────────────────────────

export type ChurnSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ChurnUrgency = 'immediate' | 'this_week' | 'this_month';

export const CHURN_SEVERITY_LABELS: Record<ChurnSeverity, string> = {
  critical: 'Critical',
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk',
};

export const CHURN_SEVERITY_COLORS: Record<ChurnSeverity, string> = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-amber-600',
  low: 'text-yellow-600',
};

export const CHURN_SEVERITY_BG: Record<ChurnSeverity, string> = {
  critical: 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900',
  high: 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900',
  medium: 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900',
  low: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900',
};

export const CHURN_URGENCY_LABELS: Record<ChurnUrgency, string> = {
  immediate: 'Act today',
  this_week: 'This week',
  this_month: 'This month',
};

export interface ChurnRiskSignal {
  id: string;
  clientId: string;
  clientName: string;
  severity: ChurnSeverity;
  title: string;
  likelyCause: string;
  indicators: string[];
  suggestedIntervention: string;
  owner: string;
  detectedAt: string;
  urgency: ChurnUrgency;
}

// ── Referral Opportunity ─────────────────────────────────────────────────────

export type ReferralAskStyle = 'direct' | 'soft' | 'passive';

export const REFERRAL_ASK_LABELS: Record<ReferralAskStyle, string> = {
  direct: 'Direct Ask',
  soft: 'Soft Ask',
  passive: 'Passive Mention',
};

export const REFERRAL_ASK_COLORS: Record<ReferralAskStyle, string> = {
  direct: 'bg-emerald-100 text-emerald-700',
  soft: 'bg-blue-100 text-blue-700',
  passive: 'bg-zinc-100 text-zinc-600',
};

export interface ReferralOpportunity {
  id: string;
  clientId: string;
  clientName: string;
  readinessScore: number;
  triggers: string[];
  suggestedTiming: string;
  conversationAngle: string;
  askStyle: ReferralAskStyle;
  confidence: 'high' | 'medium' | 'low';
}

// ── Expansion Next Best Action ───────────────────────────────────────────────

export type ExpansionActionType =
  | 'schedule_review'
  | 'present_upsell'
  | 'send_win_summary'
  | 'request_referral'
  | 'escalate_churn_risk'
  | 're_engage_portal'
  | 'unblock_approval'
  | 'celebrate_milestone'
  | 'activate_autopilot';

export const EXPANSION_ACTION_LABELS: Record<ExpansionActionType, string> = {
  schedule_review: 'Schedule Review',
  present_upsell: 'Present Expansion',
  send_win_summary: 'Send Win Summary',
  request_referral: 'Ask for Referral',
  escalate_churn_risk: 'Escalate Risk',
  re_engage_portal: 'Re-engage Portal',
  unblock_approval: 'Chase Approval',
  celebrate_milestone: 'Celebrate Milestone',
  activate_autopilot: 'Activate Autopilot',
};

export const EXPANSION_ACTION_COLORS: Record<ExpansionActionType, string> = {
  schedule_review: 'bg-blue-100 text-blue-700',
  present_upsell: 'bg-violet-100 text-violet-700',
  send_win_summary: 'bg-emerald-100 text-emerald-700',
  request_referral: 'bg-pink-100 text-pink-700',
  escalate_churn_risk: 'bg-red-100 text-red-700',
  re_engage_portal: 'bg-cyan-100 text-cyan-700',
  unblock_approval: 'bg-orange-100 text-orange-700',
  celebrate_milestone: 'bg-amber-100 text-amber-700',
  activate_autopilot: 'bg-indigo-100 text-indigo-700',
};

export const EXPANSION_URGENCY_LABELS: Record<string, string> = {
  today: 'Today',
  this_week: 'This Week',
  this_month: 'This Month',
};

export const EXPANSION_URGENCY_COLORS: Record<string, string> = {
  today: 'text-red-600 bg-red-50',
  this_week: 'text-orange-600 bg-orange-50',
  this_month: 'text-blue-600 bg-blue-50',
};

export interface ExpansionNextBestAction {
  id: string;
  clientId: string;
  clientName: string;
  actionType: ExpansionActionType;
  title: string;
  whatToSay: string;
  assetToReference?: string;
  proofPoint?: string;
  nextMove: string;
  urgency: 'today' | 'this_week' | 'this_month';
  linkedOpportunityId?: string;
  linkedRiskId?: string;
}

// ── Account Health Trend ─────────────────────────────────────────────────────

export type HealthTrendDirection = 'improving' | 'stable' | 'declining' | 'critical';

export const HEALTH_TREND_LABELS: Record<HealthTrendDirection, string> = {
  improving: 'Improving',
  stable: 'Stable',
  declining: 'Declining',
  critical: 'Critical',
};

export const HEALTH_TREND_COLORS: Record<HealthTrendDirection, string> = {
  improving: 'text-emerald-600',
  stable: 'text-blue-600',
  declining: 'text-amber-600',
  critical: 'text-red-600',
};

export const HEALTH_TREND_BG: Record<HealthTrendDirection, string> = {
  improving: 'bg-emerald-50 border-emerald-200',
  stable: 'bg-blue-50 border-blue-200',
  declining: 'bg-amber-50 border-amber-200',
  critical: 'bg-red-50 border-red-200',
};

export interface AccountHealthTrend {
  clientId: string;
  clientName: string;
  overallScore: number;
  trend: HealthTrendDirection;
  dimensions: {
    delivery: number;
    engagement: number;
    momentum: number;
    moduleAdoption: number;
  };
  summary: string;
  lastUpdated: string;
}

// ── Expansion Play ────────────────────────────────────────────────────────────

export type ExpansionPlayType =
  | 'module_expansion'
  | 'scope_expansion'
  | 'referral_campaign'
  | 'retention_play'
  | 're_engagement';

export interface ExpansionPlay {
  id: string;
  clientId: string;
  clientName: string;
  playType: ExpansionPlayType;
  title: string;
  steps: string[];
  expectedOutcome: string;
  timeframe: string;
  confidence: 'high' | 'medium' | 'low';
}

// ── Growth Trigger Event ─────────────────────────────────────────────────────

export interface GrowthTriggerEvent {
  id: string;
  clientId: string;
  clientName: string;
  triggeredAt: string;
  triggerType: string;
  description: string;
  dataPoints: Record<string, string>;
  resultedIn: string[];
}

// ── Client-Safe Growth Moment ─────────────────────────────────────────────────

export type ClientSafeMomentTone = 'celebratory' | 'informational' | 'educational';

export interface ClientSafeGrowthMoment {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  headline: string;
  body: string;
  cta?: string;
  readyToSurface: boolean;
  surfaceCondition: string;
  tone: ClientSafeMomentTone;
}

// ── Per-Client Expansion State ────────────────────────────────────────────────

export interface ClientExpansionState {
  clientId: string;
  clientName: string;
  healthTrend: AccountHealthTrend;
  growthSignals: AccountGrowthSignal[];
  opportunities: ExpansionOpportunity[];
  churnRisks: ChurnRiskSignal[];
  referralOpportunity?: ReferralOpportunity;
  nextBestActions: ExpansionNextBestAction[];
  expansionPlays: ExpansionPlay[];
  triggerEvents: GrowthTriggerEvent[];
  clientSafeMoments: ClientSafeGrowthMoment[];
}

// ── Portfolio Expansion State ─────────────────────────────────────────────────

export interface ExpansionState {
  clients: ClientExpansionState[];
  topOpportunities: ExpansionOpportunity[];
  activeChurnRisks: ChurnRiskSignal[];
  referralReadyClients: ReferralOpportunity[];
  urgentActions: ExpansionNextBestAction[];
  portfolioHealthScore: number;
  totalOpportunityCount: number;
  generatedAt: string;
}

// ── Inspection Record ─────────────────────────────────────────────────────────

export interface ExpansionSignalInspection {
  signalId: string;
  clientId: string;
  clientName: string;
  signalType: string;
  why: string;
  supportingData: Record<string, string>;
  recommendationGenerated: string;
  actionTaken?: string;
  detectedAt: string;
}
