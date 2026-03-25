export interface ExecutiveKPI {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  trend: 'up' | 'down' | 'stable' | 'unknown';
  trendLabel?: string;
  status: 'good' | 'warning' | 'critical' | 'neutral';
  drilldownUrl?: string;
  interpretation: string;
  subtext?: string;
}

export interface ExecutiveRiskSummary {
  id: string;
  category: 'sales' | 'onboarding' | 'account' | 'execution';
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  affectedCount: number;
  affectedNames: string[];
  drilldownUrl: string;
  recommendation: string;
}

export interface ExecutiveOpportunitySummary {
  id: string;
  category: 'expansion' | 'referral' | 'pipeline' | 'reactivation';
  title: string;
  description: string;
  affectedCount: number;
  affectedNames: string[];
  estimatedLabel?: string;
  drilldownUrl: string;
  timeframe: 'now' | 'this_week' | 'this_month';
}

export interface ExecutiveBottleneck {
  id: string;
  area: 'sales' | 'onboarding' | 'delivery' | 'cadence';
  stage: string;
  stageLabel: string;
  blockCount: number;
  avgDaysStuck?: number;
  description: string;
  drilldownUrl: string;
}

export interface ExecutiveAlert {
  id: string;
  severity: 'critical' | 'high' | 'info';
  title: string;
  body: string;
  entityId?: string;
  entityName?: string;
  drilldownUrl?: string;
  category: 'sales' | 'account' | 'execution' | 'expansion';
}

export interface ExecutiveWatchlistLead {
  id: string;
  name: string;
  company?: string;
  stage: string;
  issue: string;
  daysStalled: number;
  urgency: 'critical' | 'high' | 'medium';
}

export interface ExecutiveWatchlistClient {
  id: string;
  name: string;
  company?: string;
  health: 'green' | 'amber' | 'red';
  issue: string;
  riskScore: number;
  deliveryStatus?: string;
}

export interface ExecutiveWorkloadSummary {
  overdueCadence: number;
  todayCadence: number;
  weeklyCadence: number;
  pendingDrafts: number;
  blockedDeliveries: number;
  criticalChurn: number;
  overdueByCategory: {
    sales: number;
    onboarding: number;
    account: number;
    referral: number;
  };
}

export interface ExecutivePipelineSnapshot {
  stageBreakdown: { stage: string; label: string; count: number; isBottleneck: boolean }[];
  totalActive: number;
  totalStalled: number;
  proposalRate: number;
  winRate: number;
  avgDaysInPipeline?: number;
}

export interface ExecutiveAccountSnapshot {
  healthBreakdown: { status: 'green' | 'amber' | 'red'; label: string; count: number }[];
  deliveryBreakdown: { status: string; label: string; count: number }[];
  totalActive: number;
  atRisk: number;
  churnWarnings: number;
  hotUpsell: number;
  referralReady: number;
}

export interface ExecutiveDashboardState {
  kpis: ExecutiveKPI[];
  risks: ExecutiveRiskSummary[];
  opportunities: ExecutiveOpportunitySummary[];
  bottlenecks: ExecutiveBottleneck[];
  alerts: ExecutiveAlert[];
  workload: ExecutiveWorkloadSummary;
  priorities: ExecutiveAlert[];
  watchlistLeads: ExecutiveWatchlistLead[];
  watchlistClients: ExecutiveWatchlistClient[];
  pipeline: ExecutivePipelineSnapshot;
  accounts: ExecutiveAccountSnapshot;
  sourceData: {
    leadsTotal: number;
    clientsTotal: number;
    activeLeads: number;
    activeClients: number;
    derivationInputs: string[];
  };
  generatedAt: string;
}

export interface ExecutiveDrilldownReference {
  label: string;
  url: string;
  description: string;
}

export const EXEC_DRILLDOWNS: ExecutiveDrilldownReference[] = [
  { label: 'Pipeline', url: '/pipeline', description: 'Kanban pipeline and lead management' },
  { label: 'Leads', url: '/leads', description: 'Lead list, scoring, and detail views' },
  { label: 'Clients', url: '/clients', description: 'Client health, delivery, and command centre' },
  { label: 'Cadence', url: '/cadence', description: 'Automated follow-up queue and nudges' },
  { label: 'Comms', url: '/comms', description: 'Communication drafts and outreach queue' },
  { label: 'Expansion', url: '/expansion', description: 'Upsell, churn risk, and referral signals' },
  { label: 'Agents', url: '/agents', description: 'Agent command and AI job queue' },
];
