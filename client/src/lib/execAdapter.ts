import type { Lead, Client } from '@/lib/types';
import { deriveCadenceState } from '@/lib/cadenceAdapter';
import { buildDraftsFromQueue } from '@/lib/commsAdapter';
import type {
  ExecutiveDashboardState,
  ExecutiveKPI,
  ExecutiveRiskSummary,
  ExecutiveOpportunitySummary,
  ExecutiveBottleneck,
  ExecutiveAlert,
  ExecutiveWatchlistLead,
  ExecutiveWatchlistClient,
  ExecutiveWorkloadSummary,
  ExecutivePipelineSnapshot,
  ExecutiveAccountSnapshot,
} from '@/lib/execTypes';

// ── helpers ──────────────────────────────────────────────────────────────────

function daysSince(d: Date | string | undefined | null): number {
  if (!d) return 0;
  const date = d instanceof Date ? d : new Date(d as string);
  if (isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function fmt(d: Date | string | undefined | null): string {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d as string);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STAGE_LABELS: Record<string, string> = {
  suspect: 'Suspect',
  contacted: 'Contacted',
  engaged: 'Engaged',
  qualified: 'Qualified',
  discovery: 'Discovery',
  proposal: 'Proposal',
  verbal_commit: 'Verbal Commit',
  won: 'Won',
  lost: 'Lost',
  nurture: 'Nurture',
};

const PIPELINE_STAGES = ['suspect', 'contacted', 'engaged', 'qualified', 'discovery', 'proposal', 'verbal_commit'] as const;

// ── main adapter ─────────────────────────────────────────────────────────────

export function deriveExecDashboard(
  leads: Lead[],
  clients: Client[],
): ExecutiveDashboardState {
  const now = new Date();
  const activeLeads = leads.filter(l => !l.archived && l.stage !== 'won' && l.stage !== 'lost');
  const activeClients = clients.filter(c => !c.archived);

  // ── Pipeline snapshot ──────────────────────────────────────────────────────
  const stageBreakdown = PIPELINE_STAGES.map(stage => {
    const count = activeLeads.filter(l => l.stage === stage).length;
    return { stage, label: STAGE_LABELS[stage] ?? stage, count, isBottleneck: false };
  });

  // Mark bottleneck: biggest count that isn't the entry stage
  const nonEntryStages = stageBreakdown.filter(s => s.stage !== 'suspect');
  const maxCount = Math.max(...nonEntryStages.map(s => s.count), 0);
  if (maxCount > 0) {
    const bottleneckStage = nonEntryStages.find(s => s.count === maxCount);
    if (bottleneckStage) bottleneckStage.isBottleneck = true;
  }

  const wonLeads = leads.filter(l => l.stage === 'won').length;
  const totalClosed = wonLeads + leads.filter(l => l.stage === 'lost').length;
  const winRate = totalClosed > 0 ? Math.round((wonLeads / totalClosed) * 100) : 0;

  const proposalLeads = activeLeads.filter(l => l.stage === 'proposal' || l.stage === 'verbal_commit');
  const proposalRate = activeLeads.length > 0
    ? Math.round((proposalLeads.length / activeLeads.length) * 100)
    : 0;

  const stalledLeads = activeLeads.filter(l => {
    const since = daysSince(l.lastActivityAt ?? l.lastContactDate);
    return since >= 14;
  });

  const pipeline: ExecutivePipelineSnapshot = {
    stageBreakdown,
    totalActive: activeLeads.length,
    totalStalled: stalledLeads.length,
    proposalRate,
    winRate,
  };

  // ── Account snapshot ───────────────────────────────────────────────────────
  const healthBreakdown = (
    ['green', 'amber', 'red'] as const
  ).map(status => ({
    status,
    label: status === 'green' ? 'Healthy' : status === 'amber' ? 'At Risk' : 'Critical',
    count: activeClients.filter(c => c.healthStatus === status).length,
  }));

  const deliveryStatusMap: Record<string, string> = {
    onboarding: 'Onboarding',
    active: 'Active',
    blocked: 'Blocked',
    complete: 'Complete',
  };
  const deliveryBreakdown = Object.entries(deliveryStatusMap).map(([status, label]) => ({
    status,
    label,
    count: activeClients.filter(c => c.deliveryStatus === status).length,
  }));

  const atRisk = activeClients.filter(c => c.healthStatus !== 'green').length;
  const churnWarnings = activeClients.filter(c => c.healthStatus === 'red' || (c.churnRiskScore ?? 0) >= 0.6).length;
  const hotUpsell = activeClients.filter(c => c.upsellReadiness === 'hot' || c.upsellReadiness === 'ready').length;
  const referralReady = activeClients.filter(c => {
    const days = daysSince(c.lastContactDate);
    return c.healthStatus === 'green' && days >= 30;
  }).length;

  const accounts: ExecutiveAccountSnapshot = {
    healthBreakdown,
    deliveryBreakdown,
    totalActive: activeClients.length,
    atRisk,
    churnWarnings,
    hotUpsell,
    referralReady,
  };

  // ── Cadence state ──────────────────────────────────────────────────────────
  const cadenceState = deriveCadenceState(leads, clients, {});
  const overdueCadence = cadenceState.byUrgency.overdue?.length ?? 0;
  const todayCadence = cadenceState.byUrgency.today?.length ?? 0;
  const weeklyCadence = cadenceState.byUrgency.this_week?.length ?? 0;
  const salesCadence = cadenceState.byCategory.sales?.length ?? 0;
  const onboardingCadence = cadenceState.byCategory.onboarding?.length ?? 0;
  const accountCadence = (cadenceState.byCategory.account_growth?.length ?? 0) + (cadenceState.byCategory.churn_intervention?.length ?? 0);
  const referralCadence = cadenceState.byCategory.referrals?.length ?? 0;

  // ── Comms drafts ───────────────────────────────────────────────────────────
  const allCadenceItems = Object.values(cadenceState.byCategory).flat();
  const allDrafts = buildDraftsFromQueue(allCadenceItems, leads, clients);
  const pendingDrafts = allDrafts.filter(d => d.status === 'draft' || d.status === 'reviewed').length;

  // ── Workload ───────────────────────────────────────────────────────────────
  const blockedDeliveries = activeClients.filter(c => c.deliveryStatus === 'blocked').length;

  const workload: ExecutiveWorkloadSummary = {
    overdueCadence,
    todayCadence,
    weeklyCadence,
    pendingDrafts,
    blockedDeliveries,
    criticalChurn: churnWarnings,
    overdueByCategory: {
      sales: salesCadence,
      onboarding: onboardingCadence,
      account: accountCadence,
      referral: referralCadence,
    },
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis: ExecutiveKPI[] = [
    {
      id: 'active_pipeline',
      label: 'Active Pipeline',
      value: activeLeads.length,
      unit: 'leads',
      trend: 'stable',
      status: activeLeads.length > 0 ? 'good' : 'warning',
      drilldownUrl: '/pipeline',
      interpretation:
        activeLeads.length > 0
          ? `${activeLeads.length} lead${activeLeads.length !== 1 ? 's' : ''} currently in pipeline across all stages.`
          : 'No active leads in the pipeline. Prospecting activity may be needed.',
      subtext: `${stalledLeads.length} stalled ≥14d`,
    },
    {
      id: 'proposal_rate',
      label: 'Proposal Rate',
      value: `${proposalRate}%`,
      trend: proposalRate >= 20 ? 'up' : proposalRate >= 10 ? 'stable' : 'down',
      status: proposalRate >= 20 ? 'good' : proposalRate >= 10 ? 'warning' : 'critical',
      drilldownUrl: '/pipeline',
      interpretation:
        `${proposalLeads.length} of ${activeLeads.length} active leads are at proposal or verbal commit stage.`,
      subtext: `${proposalLeads.length} at proposal/commit`,
    },
    {
      id: 'win_rate',
      label: 'Win Rate',
      value: `${winRate}%`,
      trend: winRate >= 30 ? 'up' : winRate >= 20 ? 'stable' : 'down',
      status: winRate >= 30 ? 'good' : winRate >= 20 ? 'warning' : totalClosed === 0 ? 'neutral' : 'critical',
      drilldownUrl: '/leads',
      interpretation:
        totalClosed > 0
          ? `${wonLeads} won from ${totalClosed} closed opportunities.`
          : 'No closed opportunities yet to measure win rate.',
      subtext: `${wonLeads}W / ${leads.filter(l => l.stage === 'lost').length}L`,
    },
    {
      id: 'active_clients',
      label: 'Active Accounts',
      value: activeClients.length,
      unit: 'clients',
      trend: 'stable',
      status: activeClients.length > 0 ? 'good' : 'neutral',
      drilldownUrl: '/clients',
      interpretation:
        `${activeClients.length} active client account${activeClients.length !== 1 ? 's' : ''}. ${atRisk} not healthy.`,
      subtext: atRisk > 0 ? `${atRisk} at risk` : 'All accounts healthy',
    },
    {
      id: 'churn_risk',
      label: 'Churn Risks',
      value: churnWarnings,
      unit: 'accounts',
      trend: churnWarnings === 0 ? 'stable' : 'down',
      status: churnWarnings === 0 ? 'good' : churnWarnings <= 2 ? 'warning' : 'critical',
      drilldownUrl: '/expansion',
      interpretation:
        churnWarnings > 0
          ? `${churnWarnings} account${churnWarnings !== 1 ? 's' : ''} showing critical health or high churn risk score.`
          : 'No accounts flagged as high churn risk at this time.',
      subtext: churnWarnings > 0 ? 'Needs immediate attention' : 'No critical churn signals',
    },
    {
      id: 'expansion_ready',
      label: 'Expansion Ready',
      value: hotUpsell,
      unit: 'accounts',
      trend: hotUpsell > 0 ? 'up' : 'stable',
      status: hotUpsell > 0 ? 'good' : 'neutral',
      drilldownUrl: '/expansion',
      interpretation:
        hotUpsell > 0
          ? `${hotUpsell} account${hotUpsell !== 1 ? 's' : ''} flagged as ready or hot for upsell conversations.`
          : 'No accounts are currently flagged for expansion.',
      subtext: `${referralReady} referral-ready`,
    },
    {
      id: 'overdue_cadence',
      label: 'Overdue Actions',
      value: overdueCadence,
      unit: 'items',
      trend: overdueCadence === 0 ? 'stable' : 'down',
      status: overdueCadence === 0 ? 'good' : overdueCadence <= 3 ? 'warning' : 'critical',
      drilldownUrl: '/cadence',
      interpretation:
        overdueCadence > 0
          ? `${overdueCadence} cadence item${overdueCadence !== 1 ? 's' : ''} past their due date — execution pressure is building.`
          : 'No overdue actions. Execution is on track.',
      subtext: `${todayCadence} due today`,
    },
    {
      id: 'pending_comms',
      label: 'Pending Outreach',
      value: pendingDrafts,
      unit: 'drafts',
      trend: pendingDrafts === 0 ? 'stable' : 'down',
      status: pendingDrafts === 0 ? 'good' : pendingDrafts <= 5 ? 'warning' : 'critical',
      drilldownUrl: '/comms',
      interpretation:
        pendingDrafts > 0
          ? `${pendingDrafts} communication draft${pendingDrafts !== 1 ? 's' : ''} pending review and approval before sending.`
          : 'No pending outreach drafts — communications are up to date.',
      subtext: 'Requires human review',
    },
  ];

  // ── Risks ─────────────────────────────────────────────────────────────────
  const risks: ExecutiveRiskSummary[] = [];

  if (stalledLeads.length > 0) {
    risks.push({
      id: 'stalled_leads',
      category: 'sales',
      severity: stalledLeads.length > 5 ? 'critical' : stalledLeads.length > 2 ? 'high' : 'medium',
      title: `${stalledLeads.length} Lead${stalledLeads.length !== 1 ? 's' : ''} Stalled`,
      description: `${stalledLeads.length} active lead${stalledLeads.length !== 1 ? 's have' : ' has'} had no activity for 14+ days. Pipeline momentum is at risk.`,
      affectedCount: stalledLeads.length,
      affectedNames: stalledLeads.slice(0, 4).map(l => l.businessName ?? l.contactName ?? 'Unknown'),
      drilldownUrl: '/leads',
      recommendation: 'Open the Cadence workspace and review overdue follow-up items. Prioritise verbal commit and proposal-stage leads first.',
    });
  }

  const blockedClients = activeClients.filter(c => c.deliveryStatus === 'blocked');
  if (blockedClients.length > 0) {
    risks.push({
      id: 'blocked_deliveries',
      category: 'onboarding',
      severity: blockedClients.length > 3 ? 'critical' : 'high',
      title: `${blockedClients.length} Delivery Blocked`,
      description: `${blockedClients.length} active account${blockedClients.length !== 1 ? 's are' : ' is'} in a blocked delivery state. Client satisfaction and retention are at risk.`,
      affectedCount: blockedClients.length,
      affectedNames: blockedClients.slice(0, 4).map(c => c.businessName ?? c.contactName ?? 'Unknown'),
      drilldownUrl: '/clients',
      recommendation: 'Review blocked accounts in the Client dashboard and identify the specific delivery blocker for each. Escalate where needed.',
    });
  }

  const redClients = activeClients.filter(c => c.healthStatus === 'red');
  if (redClients.length > 0) {
    risks.push({
      id: 'red_health',
      category: 'account',
      severity: 'critical',
      title: `${redClients.length} Account${redClients.length !== 1 ? 's' : ''} Critical`,
      description: `${redClients.length} account${redClients.length !== 1 ? 's have' : ' has'} a red health status. Immediate intervention is required to prevent churn.`,
      affectedCount: redClients.length,
      affectedNames: redClients.slice(0, 4).map(c => c.businessName ?? c.contactName ?? 'Unknown'),
      drilldownUrl: '/expansion',
      recommendation: 'Open the Expansion workspace (Churn Risks tab) to review intervention strategies for each at-risk account.',
    });
  }

  if (overdueCadence >= 5) {
    risks.push({
      id: 'overdue_cadence',
      category: 'execution',
      severity: overdueCadence >= 10 ? 'critical' : 'high',
      title: `${overdueCadence} Overdue Cadence Items`,
      description: `${overdueCadence} follow-up and cadence items are past their due date. Execution discipline is under pressure.`,
      affectedCount: overdueCadence,
      affectedNames: [],
      drilldownUrl: '/cadence',
      recommendation: 'Open the Cadence workspace and work through the overdue queue. Use the "Draft" buttons to prepare outreach for the highest-priority items first.',
    });
  }

  // Sort risks: critical first
  risks.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2 };
    return order[a.severity] - order[b.severity];
  });

  // ── Opportunities ──────────────────────────────────────────────────────────
  const opportunities: ExecutiveOpportunitySummary[] = [];

  if (hotUpsell > 0) {
    const hotClients = activeClients.filter(c => c.upsellReadiness === 'hot' || c.upsellReadiness === 'ready');
    opportunities.push({
      id: 'hot_upsell',
      category: 'expansion',
      title: `${hotUpsell} Upsell Opportunit${hotUpsell !== 1 ? 'ies' : 'y'}`,
      description: `${hotUpsell} account${hotUpsell !== 1 ? 's are' : ' is'} flagged as ready or hot for expansion conversations. These accounts have proven value and are primed for additional scope.`,
      affectedCount: hotUpsell,
      affectedNames: hotClients.slice(0, 4).map(c => c.businessName ?? c.contactName ?? 'Unknown'),
      estimatedLabel: 'High revenue potential',
      drilldownUrl: '/expansion',
      timeframe: 'now',
    });
  }

  if (referralReady > 0) {
    const refClients = activeClients.filter(c => c.healthStatus === 'green' && daysSince(c.lastContactDate) >= 30);
    opportunities.push({
      id: 'referral_ready',
      category: 'referral',
      title: `${referralReady} Referral Window${referralReady !== 1 ? 's' : ''}`,
      description: `${referralReady} healthy account${referralReady !== 1 ? 's have' : ' has'} been running long enough to ask for referrals. This is a pipeline-free growth lever.`,
      affectedCount: referralReady,
      affectedNames: refClients.slice(0, 4).map(c => c.businessName ?? c.contactName ?? 'Unknown'),
      estimatedLabel: 'Zero-cost pipeline',
      drilldownUrl: '/expansion',
      timeframe: 'this_week',
    });
  }

  const dormantLeads = activeLeads.filter(l => {
    const since = daysSince(l.lastActivityAt ?? l.lastContactDate);
    return since >= 30 && (l.stage === 'suspect' || l.stage === 'contacted' || l.stage === 'nurture');
  });
  if (dormantLeads.length > 0) {
    opportunities.push({
      id: 'reactivation',
      category: 'reactivation',
      title: `${dormantLeads.length} Lead${dormantLeads.length !== 1 ? 's' : ''} to Reactivate`,
      description: `${dormantLeads.length} lead${dormantLeads.length !== 1 ? 's have' : ' has'} been inactive for 30+ days and may respond to a fresh outreach. Reactivation costs less than new prospecting.`,
      affectedCount: dormantLeads.length,
      affectedNames: dormantLeads.slice(0, 4).map(l => l.businessName ?? l.contactName ?? 'Unknown'),
      estimatedLabel: 'Low-cost pipeline',
      drilldownUrl: '/leads',
      timeframe: 'this_month',
    });
  }

  if (proposalLeads.length > 0) {
    const verbalCommits = proposalLeads.filter(l => l.stage === 'verbal_commit');
    if (verbalCommits.length > 0) {
      opportunities.push({
        id: 'verbal_commits',
        category: 'pipeline',
        title: `${verbalCommits.length} Verbal Commit${verbalCommits.length !== 1 ? 's' : ''} to Close`,
        description: `${verbalCommits.length} lead${verbalCommits.length !== 1 ? 's have' : ' has'} given a verbal commitment. Converting these to signed deals is the highest-leverage action right now.`,
        affectedCount: verbalCommits.length,
        affectedNames: verbalCommits.slice(0, 4).map(l => l.businessName ?? l.contactName ?? 'Unknown'),
        estimatedLabel: 'Highest conversion priority',
        drilldownUrl: '/pipeline',
        timeframe: 'now',
      });
    }
  }

  // ── Bottlenecks ────────────────────────────────────────────────────────────
  const bottlenecks: ExecutiveBottleneck[] = [];

  const bottleneckStageEntry = stageBreakdown.find(s => s.isBottleneck);
  if (bottleneckStageEntry && bottleneckStageEntry.count > 1) {
    const stuckLeads = activeLeads.filter(l => l.stage === bottleneckStageEntry.stage);
    const avgDays = stuckLeads.length > 0
      ? Math.round(stuckLeads.reduce((sum, l) => sum + daysSince(l.lastActivityAt ?? l.lastContactDate), 0) / stuckLeads.length)
      : undefined;
    bottlenecks.push({
      id: 'pipeline_bottleneck',
      area: 'sales',
      stage: bottleneckStageEntry.stage,
      stageLabel: bottleneckStageEntry.label,
      blockCount: bottleneckStageEntry.count,
      avgDaysStuck: avgDays,
      description: `${bottleneckStageEntry.count} leads are concentrated at the ${bottleneckStageEntry.label} stage${avgDays ? ` (avg ${avgDays}d inactive)` : ''}. This stage is slowing overall pipeline velocity.`,
      drilldownUrl: '/pipeline',
    });
  }

  if (blockedClients.length > 1) {
    bottlenecks.push({
      id: 'delivery_bottleneck',
      area: 'delivery',
      stage: 'blocked',
      stageLabel: 'Blocked Delivery',
      blockCount: blockedClients.length,
      description: `${blockedClients.length} accounts are stuck in a blocked delivery state. This creates satisfaction risk and delays revenue recognition.`,
      drilldownUrl: '/clients',
    });
  }

  const onboardingClients = activeClients.filter(c => c.deliveryStatus === 'onboarding');
  if (onboardingClients.length > 3) {
    bottlenecks.push({
      id: 'onboarding_queue',
      area: 'onboarding',
      stage: 'onboarding',
      stageLabel: 'Onboarding Queue',
      blockCount: onboardingClients.length,
      description: `${onboardingClients.length} accounts are simultaneously in onboarding. This may be stretching delivery capacity and causing slower time-to-value.`,
      drilldownUrl: '/clients',
    });
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────
  const alerts: ExecutiveAlert[] = [];

  redClients.slice(0, 3).forEach((c, idx) => {
    alerts.push({
      id: `alert-red-${c.id ?? idx}`,
      severity: 'critical',
      title: `${c.businessName ?? c.contactName ?? 'Account'} — Critical Health`,
      body: `This account has a red health status${(c.churnRiskScore ?? 0) >= 0.6 ? ' and high churn risk score' : ''}. Immediate intervention is recommended.`,
      entityId: c.id,
      entityName: c.businessName ?? c.contactName,
      drilldownUrl: '/expansion',
      category: 'account',
    });
  });

  const verbalCommits = activeLeads.filter(l => l.stage === 'verbal_commit');
  verbalCommits.slice(0, 2).forEach((l, idx) => {
    const since = daysSince(l.lastActivityAt ?? l.lastContactDate);
    if (since >= 7) {
      alerts.push({
        id: `alert-vc-${l.id ?? idx}`,
        severity: 'high',
        title: `${l.businessName ?? l.contactName ?? 'Lead'} — Verbal Commit Cooling`,
        body: `This lead gave a verbal commitment but has had no activity for ${since} days. The commitment may be at risk.`,
        entityId: l.id,
        entityName: l.businessName ?? l.contactName,
        drilldownUrl: '/pipeline',
        category: 'sales',
      });
    }
  });

  blockedClients.slice(0, 2).forEach((c, idx) => {
    alerts.push({
      id: `alert-blocked-${c.id ?? idx}`,
      severity: 'high',
      title: `${c.businessName ?? c.contactName ?? 'Account'} — Delivery Blocked`,
      body: 'Delivery for this account is blocked. Client satisfaction and retention may be at risk without immediate action.',
      entityId: c.id,
      entityName: c.businessName ?? c.contactName,
      drilldownUrl: '/clients',
      category: 'account',
    });
  });

  if (overdueCadence >= 5) {
    alerts.push({
      id: 'alert-cadence-overdue',
      severity: overdueCadence >= 10 ? 'critical' : 'high',
      title: `${overdueCadence} Overdue Follow-ups`,
      body: `${overdueCadence} cadence items are past due. Execution pressure is building across sales and account management.`,
      drilldownUrl: '/cadence',
      category: 'execution',
    });
  }

  // Sort: critical first, then high, then info
  alerts.sort((a, b) => {
    const order = { critical: 0, high: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  // ── Priorities (top 5, deduplicated from alerts + biggest items) ───────────
  const priorities = alerts.slice(0, 5);

  // ── Watchlists ─────────────────────────────────────────────────────────────
  const watchlistLeads: ExecutiveWatchlistLead[] = stalledLeads
    .sort((a, b) => daysSince(b.lastActivityAt ?? b.lastContactDate) - daysSince(a.lastActivityAt ?? a.lastContactDate))
    .slice(0, 8)
    .map(l => {
      const daysStalled = daysSince(l.lastActivityAt ?? l.lastContactDate);
      return {
        id: l.id ?? '',
        name: l.businessName ?? l.contactName ?? 'Unknown',
        company: l.businessName,
        stage: STAGE_LABELS[l.stage] ?? l.stage,
        issue: `No activity for ${daysStalled} days`,
        daysStalled,
        urgency: daysStalled >= 30 ? 'critical' : daysStalled >= 21 ? 'high' : 'medium',
      };
    });

  const watchlistClients: ExecutiveWatchlistClient[] = activeClients
    .filter(c => c.healthStatus !== 'green' || (c.churnRiskScore ?? 0) >= 0.4 || c.deliveryStatus === 'blocked')
    .sort((a, b) => (b.churnRiskScore ?? 0) - (a.churnRiskScore ?? 0))
    .slice(0, 8)
    .map(c => {
      let issue = '';
      if (c.deliveryStatus === 'blocked') issue = 'Delivery blocked';
      else if (c.healthStatus === 'red') issue = 'Critical health status';
      else if (c.healthStatus === 'amber') issue = 'Health at risk';
      else issue = `Churn risk score: ${Math.round((c.churnRiskScore ?? 0) * 100)}%`;
      return {
        id: c.id ?? '',
        name: c.businessName ?? c.contactName ?? 'Unknown',
        company: c.businessName,
        health: c.healthStatus,
        issue,
        riskScore: c.churnRiskScore ?? 0,
        deliveryStatus: c.deliveryStatus,
      };
    });

  return {
    kpis,
    risks,
    opportunities,
    bottlenecks,
    alerts,
    workload,
    priorities,
    watchlistLeads,
    watchlistClients,
    pipeline,
    accounts,
    sourceData: {
      leadsTotal: leads.length,
      clientsTotal: clients.length,
      activeLeads: activeLeads.length,
      activeClients: activeClients.length,
      derivationInputs: [
        `${leads.length} leads (${activeLeads.length} active)`,
        `${clients.length} clients (${activeClients.length} active)`,
        `${cadenceState.totalPending} cadence items (${overdueCadence} overdue)`,
        `${allDrafts.length} communication drafts (${pendingDrafts} pending)`,
      ],
    },
    generatedAt: fmt(now),
  };
}
