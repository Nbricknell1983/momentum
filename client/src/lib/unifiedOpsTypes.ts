// ── Unified Cross-System Operations — Domain Model ───────────────────────────
// All dates in DD/MM/YYYY format — NON-NEGOTIABLE.

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export type LifecycleStage =
  | 'lead_captured'        // 1. Lead exists in Momentum
  | 'strategy_generated'   // 2. Strategy/report completed
  | 'proposal_accepted'    // 3. Prospect accepted scope
  | 'onboarding_complete'  // 4. Data capture done, ready for provisioning
  | 'tenant_provisioned'   // 5. AI Systems tenant created
  | 'delivery_active'      // 6. Delivery underway in AI Systems
  | 'portal_active'        // 7. Client portal live
  | 'telemetry_active'     // 8. Telemetry connected and monitoring
  | 'optimisation_active'; // 9. Ongoing optimisation running

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  'lead_captured',
  'strategy_generated',
  'proposal_accepted',
  'onboarding_complete',
  'tenant_provisioned',
  'delivery_active',
  'portal_active',
  'telemetry_active',
  'optimisation_active',
];

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  lead_captured: 'Lead Captured',
  strategy_generated: 'Strategy Ready',
  proposal_accepted: 'Proposal Accepted',
  onboarding_complete: 'Onboarding Done',
  tenant_provisioned: 'Tenant Provisioned',
  delivery_active: 'Delivery Active',
  portal_active: 'Portal Live',
  telemetry_active: 'Telemetry On',
  optimisation_active: 'Optimising',
};

export const LIFECYCLE_STAGE_SHORT: Record<LifecycleStage, string> = {
  lead_captured: 'Lead',
  strategy_generated: 'Strategy',
  proposal_accepted: 'Proposal',
  onboarding_complete: 'Onboarding',
  tenant_provisioned: 'Provisioned',
  delivery_active: 'Delivery',
  portal_active: 'Portal',
  telemetry_active: 'Telemetry',
  optimisation_active: 'Optimising',
};

export type LifecycleSide = 'momentum' | 'ai_systems';

export const STAGE_SIDE: Record<LifecycleStage, LifecycleSide> = {
  lead_captured: 'momentum',
  strategy_generated: 'momentum',
  proposal_accepted: 'momentum',
  onboarding_complete: 'momentum',
  tenant_provisioned: 'ai_systems',
  delivery_active: 'ai_systems',
  portal_active: 'ai_systems',
  telemetry_active: 'ai_systems',
  optimisation_active: 'ai_systems',
};

export const LIFECYCLE_STAGE_INDEX: Record<LifecycleStage, number> = {
  lead_captured: 0,
  strategy_generated: 1,
  proposal_accepted: 2,
  onboarding_complete: 3,
  tenant_provisioned: 4,
  delivery_active: 5,
  portal_active: 6,
  telemetry_active: 7,
  optimisation_active: 8,
};

// ── Bottleneck types ──────────────────────────────────────────────────────────

export type BottleneckType =
  | 'proposal_accepted_no_onboarding'    // Accepted but no onboarding started
  | 'onboarding_ready_no_provisioning'   // Ready but not sent to AI Systems
  | 'provisioning_stalled'               // Stuck in provisioning state
  | 'provisioning_failed'                // Provisioning returned error
  | 'provisioned_no_delivery'            // Tenant exists but delivery not started
  | 'delivery_blocked'                   // deliveryStatus === 'blocked'
  | 'delivery_red_health'                // Delivery active but health red/amber
  | 'no_portal_access'                   // Active client, no portal module
  | 'no_telemetry'                       // Active client, telemetry not active
  | 'no_optimisation'                    // Active client, optimisation not running
  | 'stale_strategy'                     // Strategy needs review
  | 'proposal_stalled';                  // Proposal not accepted after time

export const BOTTLENECK_TYPE_LABELS: Record<BottleneckType, string> = {
  proposal_accepted_no_onboarding: 'Proposal accepted — onboarding not started',
  onboarding_ready_no_provisioning: 'Onboarding ready — not sent to provisioning',
  provisioning_stalled: 'Provisioning stalled',
  provisioning_failed: 'Provisioning failed',
  provisioned_no_delivery: 'Tenant provisioned — delivery not started',
  delivery_blocked: 'Delivery blocked',
  delivery_red_health: 'Delivery active — health critical',
  no_portal_access: 'Client active — no portal access',
  no_telemetry: 'Client active — telemetry not connected',
  no_optimisation: 'Client active — optimisation not running',
  stale_strategy: 'Strategy needs review',
  proposal_stalled: 'Proposal going cold',
};

// ── Drilldown ─────────────────────────────────────────────────────────────────

export interface CrossSystemDrilldown {
  label: string;
  path: string;
  entityId?: string;
  source: 'momentum' | 'ai_systems';
}

// ── Bottleneck ────────────────────────────────────────────────────────────────

export interface CrossSystemBottleneck {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  type: BottleneckType;
  description: string;
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  stalledForDays?: number;
  impact: 'critical' | 'high' | 'medium';
  suggestedFix: string;
  drilldown?: CrossSystemDrilldown;
  why: string;
}

// ── Alert ─────────────────────────────────────────────────────────────────────

export interface CrossSystemAlert {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  why: string;
  drilldown?: CrossSystemDrilldown;
  sourceSystem: 'momentum' | 'ai_systems' | 'cross_system';
}

// ── Milestone ─────────────────────────────────────────────────────────────────

export interface CrossSystemMilestone {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  milestone: string;
  achievedAt: string;         // DD/MM/YYYY
  stage: LifecycleStage;
  sourceSystem: 'momentum' | 'ai_systems';
}

// ── Momentum-side state ───────────────────────────────────────────────────────

export interface MomentumSideState {
  stage: string;              // Lead stage from pipeline
  strategyStatus: string;
  proposalStatus: string;
  onboardingStatus?: string;
  provisioningStatus?: string;
  healthScore?: number;
  lastContact?: string;
  daysSinceContact?: number;
}

// ── AI Systems-side state ─────────────────────────────────────────────────────

export type AISystemsDataQuality = 'live' | 'cached' | 'derived' | 'unavailable';

export interface AISystemsLiveSnapshot {
  activeBlockers?:   unknown[];
  recentMilestones?: unknown[];
  nextActions?:      unknown[];
  websiteUrl?:       string;
  portalUrl?:        string;
  overallHealth?:    'green' | 'amber' | 'red' | 'unknown';
  healthNotes?:      string[];
  activeAgents?:     string[];
  summaryGeneratedAt?: string;
}

export interface AISystemsSideState {
  tenantId?: string;
  lifecycleState?: string;
  deliveryStatus?: string;
  websiteStatus?: string;
  contentStatus?: string;
  telemetryStatus?: string;
  optimisationStatus?: string;
  portalStatus?: string;
  healthStatus?: string;
  activeModules: string[];
  lastRefreshed?: string;
  dataQuality: AISystemsDataQuality;
  dataQualityNote?: string;
  liveSnapshot?: AISystemsLiveSnapshot;
}

// ── Entity-level health summary ───────────────────────────────────────────────

export type SystemHealth = 'healthy' | 'attention' | 'blocked' | 'unknown';

export interface CrossSystemHealthSummary {
  presale: SystemHealth;
  onboarding: SystemHealth;
  delivery: SystemHealth;
  optimisation: SystemHealth;
  engagement: SystemHealth;
  overall: SystemHealth;
}

// ── Cross-system entity state ─────────────────────────────────────────────────

export interface CrossSystemEntityState {
  entityId: string;
  entityName: string;
  entityType: 'lead' | 'client';
  currentStage: LifecycleStage;
  stageIndex: number;          // 0-8
  progressPct: number;         // 0-100
  momentumSide: MomentumSideState;
  aiSystemsSide: AISystemsSideState;
  health: CrossSystemHealthSummary;
  bottlenecks: CrossSystemBottleneck[];
  alerts: CrossSystemAlert[];
  drilldowns: CrossSystemDrilldown[];
  isStalled: boolean;
  stalledForDays?: number;
}

// ── Stage count ───────────────────────────────────────────────────────────────

export interface LifecycleStageCount {
  stage: LifecycleStage;
  count: number;
  stalledCount: number;        // Entities at this stage that are stalled
}

// ── Source info ───────────────────────────────────────────────────────────────

export interface CrossSystemSourceInfo {
  derivedAt: string;
  momentumLeadCount: number;
  momentumClientCount: number;
  aiSystemsDataQuality: AISystemsDataQuality;
  aiSystemsNote: string;
}

// ── Root ops state ────────────────────────────────────────────────────────────

export interface UnifiedOpsState {
  generatedAt: string;        // DD/MM/YYYY HH:mm
  stageCounts: LifecycleStageCount[];
  totalEntities: number;
  stalledCount: number;
  criticalBottlenecks: number;
  bottlenecks: CrossSystemBottleneck[];
  alerts: CrossSystemAlert[];
  entities: CrossSystemEntityState[];
  recentMilestones: CrossSystemMilestone[];
  sourceInfo: CrossSystemSourceInfo;
}
