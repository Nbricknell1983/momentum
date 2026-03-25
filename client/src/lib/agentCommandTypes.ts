// =============================================================================
// AGENT COMMAND LAYER — Domain Model
// =============================================================================
// Typed models for the unified Agent Command Layer in Momentum.
//
// CRITICAL DISTINCTION:
//   - Momentum agents = sales, strategy, proposal, onboarding, comm, growth
//   - AI Systems agents = website, SEO, GBP, content, telemetry, optimisation
//
// These are NEVER collapsed. Coordination is shown, not duplication.
// =============================================================================

// ─── Status & severity shared types ──────────────────────────────────────────

export type AgentStatus =
  | 'active'
  | 'waiting'
  | 'blocked'
  | 'idle'
  | 'completed'
  | 'paused';

export type BlockerSeverity = 'critical' | 'high' | 'medium' | 'low';
export type BlockerRequiredBy = 'human' | 'system' | 'external';
export type ClientVisibilityLevel = 'internal_only' | 'summarised' | 'full';
export type SystemSide = 'momentum' | 'ai_systems';
export type EntityType = 'lead' | 'client';

// ─── Momentum Agent Types ─────────────────────────────────────────────────────

export type MomentumAgentType =
  | 'lead_research'
  | 'strategy'
  | 'proposal'
  | 'onboarding'
  | 'sales_execution'
  | 'follow_up'
  | 'account_growth';

// ─── AI Systems Delivery Agent Types ─────────────────────────────────────────

export type AISystemsAgentType =
  | 'website_agent'
  | 'seo_agent'
  | 'gbp_agent'
  | 'content_agent'
  | 'telemetry_agent'
  | 'optimisation_agent'
  | 'publishing_agent';

// ─── 1. momentumAgentActivity ─────────────────────────────────────────────────

export interface MomentumAgentActivity {
  id:            string;
  type:          string;                   // e.g. 'research_run', 'strategy_generated'
  description:   string;                   // plain-language summary
  timestamp:     string;                   // ISO date
  entityId?:     string;
  entityType?:   EntityType;
  entityName?:   string;
  outcome?:      string;                   // result of the activity
  isHighlight:   boolean;                  // surface in timeline?
}

// ─── 2. momentumAgentBlocker ──────────────────────────────────────────────────

export interface MomentumAgentBlocker {
  id:              string;
  description:     string;
  severity:        BlockerSeverity;
  blockedSince:    string;                 // ISO date
  requiredAction:  string;                 // what must happen to unblock
  requiredBy:      BlockerRequiredBy;
  entityId?:       string;
  entityName?:     string;
  entityType?:     EntityType;
}

// ─── 3. momentumAgentOutcome ──────────────────────────────────────────────────

export interface MomentumAgentOutcome {
  expectedOutcome:  string;
  timeframe:        string;                // e.g. "Within 2 business days"
  successCriteria:  string[];              // measurable outcomes
  confidence:       'high' | 'medium' | 'low';
}

// ─── 4. momentumAgentStatus ───────────────────────────────────────────────────

export interface MomentumAgentStatus {
  agentType:          MomentumAgentType;
  name:               string;              // display name
  tagline:            string;              // one-line role description
  status:             AgentStatus;
  currentFocus:       string;              // what it's working on right now
  recentActivity:     MomentumAgentActivity[];
  blockers:           MomentumAgentBlocker[];
  nextMove:           string;              // the single next action
  expectedOutcome:    MomentumAgentOutcome;
  explanation:        AgentExplanation;
  clientVisibility:   ClientVisibilityLevel;
  lastActiveAt?:      string;
  metrics?: {
    totalProcessed:   number;
    pendingItems:     number;
    successRate:      number;              // 0–1
  };
}

// ─── 5. linkedDeliveryAgentSummary ───────────────────────────────────────────

export interface LinkedDeliveryAgentSummary {
  agentType:             AISystemsAgentType;
  name:                  string;
  status:                AgentStatus;
  currentFocus:          string;
  recentCompletedWork:   string[];         // last 3 completed items
  approvalsNeeded:       string[];         // pending approvals from admin
  nextExpectedMove:      string;
  linkedClientId?:       string;
  linkedClientName?:     string;
  linkedProvisioningId?: string;
  lastUpdated:           string;           // ISO date
}

// ─── 6. crossSystemAgentView ─────────────────────────────────────────────────

export interface CrossSystemAgentView {
  entityId:           string;
  entityName:         string;
  entityType:         EntityType;
  stage?:             string;              // pipeline stage or delivery phase
  momentumAgents:     MomentumAgentStatus[];
  deliveryAgents:     LinkedDeliveryAgentSummary[];
  coordinationNotes:  string[];
  handoffStatus:      HandoffStatus;
  currentPhase:       WorkPhase;
  overallHealth:      'on_track' | 'at_risk' | 'blocked' | 'completed';
}

export type WorkPhase =
  | 'prospecting'
  | 'strategy'
  | 'proposal'
  | 'onboarding'
  | 'provisioning'
  | 'delivery'
  | 'growth'
  | 'retention';

export type HandoffStatus =
  | 'not_started'       // Still in Momentum
  | 'handoff_pending'   // Ready but not yet provisioned
  | 'handoff_complete'  // AI Systems has taken over delivery
  | 'bi_directional';   // Both sides active (e.g., growth + comms)

// ─── 7. agentResponsibilityMap ───────────────────────────────────────────────

export interface AgentResponsibilityMap {
  phase:                    WorkPhase;
  phaseLabel:               string;
  momentumOwns:             string[];      // list of responsibilities
  aiSystemsOwns:            string[];
  handoffTrigger:           string;        // what triggers the handoff
  coordinationRequired:     string[];      // ongoing coordination needed
  momentumRetains:          string[];      // what Momentum keeps even in delivery
}

export const RESPONSIBILITY_MAP: AgentResponsibilityMap[] = [
  {
    phase: 'prospecting',
    phaseLabel: 'Prospecting',
    momentumOwns: ['Lead research', 'Business profiling', 'Opportunity scoring', 'Activity tracking'],
    aiSystemsOwns: [],
    handoffTrigger: 'Lead qualified and opportunity confirmed',
    coordinationRequired: [],
    momentumRetains: ['Lead intelligence', 'Activity log'],
  },
  {
    phase: 'strategy',
    phaseLabel: 'Strategy',
    momentumOwns: ['Growth plan generation', 'Visibility gap analysis', 'ROI modelling', 'Strategy report creation'],
    aiSystemsOwns: [],
    handoffTrigger: 'Strategy signed off and proposal accepted',
    coordinationRequired: ['Scope alignment between proposal and delivery plan'],
    momentumRetains: ['Strategy document', 'Client brief'],
  },
  {
    phase: 'proposal',
    phaseLabel: 'Proposal',
    momentumOwns: ['Proposal preparation', 'Scope selection', 'Pricing presentation', 'Proposal delivery'],
    aiSystemsOwns: [],
    handoffTrigger: 'Proposal accepted by client',
    coordinationRequired: ['Module selection passes to provisioning'],
    momentumRetains: ['Accepted scope', 'Commercial terms'],
  },
  {
    phase: 'onboarding',
    phaseLabel: 'Onboarding',
    momentumOwns: ['Onboarding data capture', 'Readiness assessment', 'Client communication', 'Provisioning trigger'],
    aiSystemsOwns: ['Tenant provisioning', 'Initial setup'],
    handoffTrigger: 'Onboarding data complete and readiness confirmed',
    coordinationRequired: ['Onboarding data shared with AI Systems provisioning', 'Scope confirmed across both systems'],
    momentumRetains: ['Client communication', 'Relationship management'],
  },
  {
    phase: 'delivery',
    phaseLabel: 'Delivery',
    momentumOwns: ['Client communication', 'Account health monitoring', 'Upsell identification', 'Portal digest delivery'],
    aiSystemsOwns: ['Website build', 'SEO setup', 'GBP optimisation', 'Content production', 'Telemetry monitoring', 'Publishing'],
    handoffTrigger: 'All active workstreams complete',
    coordinationRequired: ['Progress updates from AI Systems to Momentum', 'Client approvals coordinated through Momentum'],
    momentumRetains: ['Client relationship', 'Strategic direction', 'Commercial conversations'],
  },
  {
    phase: 'growth',
    phaseLabel: 'Growth',
    momentumOwns: ['Growth strategy', 'Upsell execution', 'Account reviews', 'Renewal management'],
    aiSystemsOwns: ['Ongoing optimisation', 'Performance reporting', 'Content updates', 'Technical maintenance'],
    handoffTrigger: 'Ongoing — both systems active indefinitely',
    coordinationRequired: ['Performance data informs growth strategy', 'Growth changes trigger delivery updates'],
    momentumRetains: ['Strategic leadership', 'Client success ownership'],
  },
];

// ─── 8. agentCommandState ────────────────────────────────────────────────────

export interface AgentCommandState {
  generatedAt:                   string;
  totalMomentumAgentsActive:     number;
  totalDeliveryAgentsActive:     number;
  totalBlockers:                 number;
  criticalBlockers:              number;
  crossSystemViews:              CrossSystemAgentView[];
  momentumAgentRoster:           MomentumAgentStatus[];
  agentTimeline:                 AgentTimelineEvent[];
  globalHealthStatus:            'healthy' | 'degraded' | 'critical';
  leadsInProgress:               number;
  clientsInDelivery:             number;
}

// ─── Agent timeline event ─────────────────────────────────────────────────────

export type AgentTimelineEventType =
  | 'research_completed'
  | 'strategy_generated'
  | 'proposal_prepared'
  | 'proposal_accepted'
  | 'onboarding_started'
  | 'onboarding_ready'
  | 'tenant_provisioned'
  | 'website_structure_generated'
  | 'website_html_generated'
  | 'content_produced'
  | 'gbp_optimised'
  | 'seo_setup_completed'
  | 'telemetry_scan_completed'
  | 'optimisation_triggered'
  | 'follow_up_sent'
  | 'portal_digest_sent'
  | 'upsell_identified'
  | 'account_review_completed';

export interface AgentTimelineEvent {
  id:            string;
  timestamp:     string;               // ISO date
  agentType:     MomentumAgentType | AISystemsAgentType;
  agentSystem:   SystemSide;
  eventType:     AgentTimelineEventType;
  description:   string;
  entityId?:     string;
  entityName?:   string;
  entityType?:   EntityType;
  isClientVisible: boolean;            // can this be shown in the portal?
}

// ─── Agent explanation layer ──────────────────────────────────────────────────

export interface AgentExplanation {
  whatItDoes:          string;         // plain language role description
  whyNow:              string;         // why this agent is active / relevant right now
  whatItNeeds:         string;         // inputs or decisions required
  whatSuccessLooksLike: string;        // measurable / observable success state
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const MOMENTUM_AGENT_META: Record<MomentumAgentType, { name: string; tagline: string; color: string; icon: string }> = {
  lead_research:    { name: 'Lead Research Agent',      tagline: 'Profiles and scores incoming opportunities',              color: 'blue',    icon: 'search'     },
  strategy:         { name: 'Strategy Agent',           tagline: 'Builds growth plans and visibility diagnoses',            color: 'violet',  icon: 'brain'      },
  proposal:         { name: 'Proposal Agent',           tagline: 'Prepares scopes, pricing, and strategy reports',         color: 'indigo',  icon: 'file-text'  },
  onboarding:       { name: 'Onboarding Agent',         tagline: 'Captures data, checks readiness, triggers provisioning', color: 'teal',    icon: 'package'    },
  sales_execution:  { name: 'Sales Execution Agent',    tagline: 'Surfaces next best actions, objections, and prep',       color: 'amber',   icon: 'zap'        },
  follow_up:        { name: 'Follow-up Agent',          tagline: 'Monitors cadence and generates outreach sequences',      color: 'orange',  icon: 'mail'       },
  account_growth:   { name: 'Account Growth Agent',     tagline: 'Identifies upsell signals and drives retention',         color: 'emerald', icon: 'trending-up'},
};

export const AI_SYSTEMS_AGENT_META: Record<AISystemsAgentType, { name: string; tagline: string; color: string }> = {
  website_agent:      { name: 'Website Agent',      tagline: 'Builds and publishes web pages from blueprints',    color: 'blue'    },
  seo_agent:          { name: 'SEO Agent',          tagline: 'Technical SEO, keywords, and local optimisation',   color: 'green'   },
  gbp_agent:          { name: 'GBP Agent',          tagline: 'Google Business Profile setup and optimisation',    color: 'yellow'  },
  content_agent:      { name: 'Content Agent',      tagline: 'Generates copy, posts, and local pages',            color: 'purple'  },
  telemetry_agent:    { name: 'Telemetry Agent',    tagline: 'Monitors rankings, traffic, and technical health',  color: 'cyan'    },
  optimisation_agent: { name: 'Optimisation Agent', tagline: 'Triggers improvements based on performance data',   color: 'orange'  },
  publishing_agent:   { name: 'Publishing Agent',   tagline: 'Deploys assets to hosting and CDN',                color: 'pink'    },
};

export const STATUS_COLORS: Record<AgentStatus, string> = {
  active:    'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
  waiting:   'text-amber-500 bg-amber-50 dark:bg-amber-950/30',
  blocked:   'text-red-500 bg-red-50 dark:bg-red-950/30',
  idle:      'text-zinc-400 bg-zinc-50 dark:bg-zinc-900',
  completed: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30',
  paused:    'text-zinc-400 bg-zinc-100 dark:bg-zinc-800',
};

export const STATUS_DOTS: Record<AgentStatus, string> = {
  active:    'bg-emerald-500',
  waiting:   'bg-amber-400',
  blocked:   'bg-red-500',
  idle:      'bg-zinc-400',
  completed: 'bg-blue-500',
  paused:    'bg-zinc-400',
};

export const STATUS_LABELS: Record<AgentStatus, string> = {
  active:    'Active',
  waiting:   'Waiting',
  blocked:   'Blocked',
  idle:      'Idle',
  completed: 'Complete',
  paused:    'Paused',
};
