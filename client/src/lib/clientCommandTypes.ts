// =============================================================================
// CLIENT COMMAND CENTRE — Domain Model
// =============================================================================
// Client-facing types. These are simplified, non-technical representations
// of the underlying Momentum + AI Systems delivery state.
// All fields are safe to show to a client.
// =============================================================================

// ─── Delivery ─────────────────────────────────────────────────────────────────

export type DeliveryPhase =
  | 'not_started'
  | 'onboarding'
  | 'building'
  | 'live'
  | 'optimising';

export type ChannelDeliveryStatus =
  | 'planned'
  | 'in_progress'
  | 'live'
  | 'optimising'
  | 'not_included';

export type DeliveryChannel = 'website' | 'gbp' | 'seo' | 'ads';

export interface ChannelDelivery {
  channel:          DeliveryChannel;
  label:            string;
  status:           ChannelDeliveryStatus;
  statusLabel:      string;
  highlight:        string;         // one plain-English fact: "5 pages published"
  milestoneDate?:   string;         // "Launched 12/03/2026"
  isIncluded:       boolean;
}

export interface DeliverySummary {
  phase:             DeliveryPhase;
  phaseLabel:        string;
  phaseDescription:  string;
  channels:          ChannelDelivery[];
  overallProgress:   number;        // 0–100
  liveChannelCount:  number;
  totalChannelCount: number;
  lastUpdated?:      string;        // ISO date
}

// ─── Performance ──────────────────────────────────────────────────────────────

export type VisibilityTrend = 'improving' | 'stable' | 'declining' | 'unknown';

export interface ClientMetric {
  label:  string;
  value:  string;
  detail?: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface PerformanceSummary {
  visibilityScore:   number;          // 0–100 simplified
  visibilityTrend:   VisibilityTrend;
  trendLabel:        string;
  topWin:            string;          // single clearest win
  keyMetrics:        ClientMetric[];
  dataAvailable:     boolean;
  dataNote?:         string;          // "Data will appear once your site is live"
}

// ─── Health ───────────────────────────────────────────────────────────────────

export type ClientHealthStatus = 'excellent' | 'good' | 'attention_needed' | 'at_risk';

export interface ClientHealthScore {
  score:       number;              // 0–100
  status:      ClientHealthStatus;
  statusLabel: string;
  color:       string;              // Tailwind color token: 'emerald' | 'blue' | 'amber' | 'red'
  highlights:  string[];            // 2–3 positive facts
  alerts:      string[];            // 0–2 things that need attention
}

// ─── Milestones ───────────────────────────────────────────────────────────────

export type MilestoneIcon =
  | 'launch'
  | 'ranking'
  | 'review'
  | 'traffic'
  | 'content'
  | 'gbp'
  | 'goal'
  | 'handshake';

export interface ClientMilestone {
  id:           string;
  title:        string;
  description:  string;
  achievedAt?:  string;             // formatted: "12 Mar 2026"
  achieved:     boolean;
  icon:         MilestoneIcon;
  isNext:       boolean;            // the very next milestone to hit
}

// ─── Client Next Actions ──────────────────────────────────────────────────────

export type NextActionUrgency = 'required_now' | 'this_week' | 'when_ready';
export type NextActionCategory = 'approval' | 'content' | 'access' | 'feedback' | 'other';

export interface ClientNextAction {
  id:          string;
  action:      string;
  description: string;
  urgency:     NextActionUrgency;
  category:    NextActionCategory;
}

// ─── Optimisation Activity ────────────────────────────────────────────────────

export interface OptimisationActivity {
  isActive:       boolean;
  summary:        string;
  recentActions:  string[];   // what's been done recently
  upcomingWork:   string[];   // what's coming next
}

// ─── Strategy Alignment ───────────────────────────────────────────────────────

export interface StrategyAlignment {
  promised:  string[];   // what was planned at the start
  delivered: string[];   // what has been completed
  upcoming:  string[];   // what is still to come
}

// ─── Client Dashboard State ───────────────────────────────────────────────────

export interface ClientDashboardState {
  clientId:              string;
  businessName:          string;
  primaryContact:        string;
  delivery:              DeliverySummary;
  performance:           PerformanceSummary;
  health:                ClientHealthScore;
  milestones:            ClientMilestone[];
  nextActions:           ClientNextAction[];
  optimisation:          OptimisationActivity;
  strategyAlignment:     StrategyAlignment;
  generatedAt:           string;   // ISO date
  portalToken?:          string;
}
