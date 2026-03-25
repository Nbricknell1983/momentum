// ── Unified Cross-System Operations Adapter ──────────────────────────────────
// Pure derivation. Zero async. Composes the UnifiedOpsState from
// Momentum Redux state — leads and clients.
// All dates in DD/MM/YYYY format — NON-NEGOTIABLE.

import { format } from 'date-fns';
import { deriveProposalStatus } from '@/lib/proposalAcceptanceTypes';
import { deriveAISystemsStateFromClient, deriveAISystemsStateFromLead } from '@/lib/aiSystemsAdapter';
import type { Lead, Client } from '@/lib/types';
import type { OnboardingState } from '@/lib/proposalAcceptanceTypes';
import type {
  UnifiedOpsState,
  CrossSystemEntityState,
  CrossSystemBottleneck,
  CrossSystemAlert,
  CrossSystemMilestone,
  CrossSystemHealthSummary,
  MomentumSideState,
  LifecycleStage,
  SystemHealth,
  LifecycleStageCount,
} from '@/lib/unifiedOpsTypes';
import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_INDEX,
  BOTTLENECK_TYPE_LABELS,
} from '@/lib/unifiedOpsTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function now(): string {
  return format(new Date(), 'dd/MM/yyyy HH:mm');
}

function todayStr(): string {
  return format(new Date(), 'dd/MM/yyyy');
}

function uid(...parts: string[]): string {
  return parts.join('::');
}

function daysSince(dateStr?: string | Date | null): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return undefined;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

// ── Stage classifier — Leads ──────────────────────────────────────────────────

function classifyLeadStage(lead: Lead): LifecycleStage {
  const os = (lead as any).onboardingState as OnboardingState | undefined;
  const proposalStatus = deriveProposalStatus(lead);

  // Provisioned
  if (proposalStatus === 'provisioned' || os?.provisioning?.status === 'succeeded') {
    return 'tenant_provisioned';
  }
  // Provisioning in progress
  if (proposalStatus === 'provisioning' || os?.provisioning?.status === 'submitted' || os?.provisioning?.status === 'pending') {
    return 'onboarding_complete';
  }
  // Onboarding ready
  if (proposalStatus === 'onboarding_ready') {
    return 'onboarding_complete';
  }
  // Onboarding in progress
  if (proposalStatus === 'onboarding_in_progress') {
    return 'proposal_accepted';
  }
  // Proposal accepted
  if (proposalStatus === 'proposal_accepted') {
    return 'proposal_accepted';
  }
  // Strategy presented
  if (proposalStatus === 'strategy_presented' || proposalStatus === 'proposal_pending') {
    if ((lead as any).strategyReportId || lead.strategyStatus === 'completed') {
      return 'strategy_generated';
    }
    return 'lead_captured';
  }
  // Strategy completed on lead
  if (lead.strategyStatus === 'completed') {
    return 'strategy_generated';
  }

  return 'lead_captured';
}

// ── Stage classifier — Clients ────────────────────────────────────────────────

function classifyClientStage(client: Client): LifecycleStage {
  const aiState = deriveAISystemsStateFromClient(client);
  const deliveryStatus = client.deliveryStatus;

  if (!deliveryStatus || deliveryStatus === 'onboarding') return 'delivery_active';

  // Optimisation active: healthy + seo module
  if (deliveryStatus === 'active' && client.healthStatus === 'green' && aiState.activeModules.includes('seo')) {
    return 'optimisation_active';
  }
  // Telemetry active
  if (deliveryStatus === 'active' && aiState.telemetryStatus === 'connected') {
    return 'telemetry_active';
  }
  // Portal live
  if (deliveryStatus === 'active' && aiState.portalStatus === 'live') {
    return 'portal_active';
  }
  // Delivery active
  if (deliveryStatus === 'active' || deliveryStatus === 'onboarding') {
    return 'delivery_active';
  }
  if (deliveryStatus === 'complete') {
    return 'optimisation_active';
  }

  return 'delivery_active';
}

// ── Bottleneck detection — Lead ───────────────────────────────────────────────

function detectLeadBottlenecks(lead: Lead): CrossSystemBottleneck[] {
  const bottlenecks: CrossSystemBottleneck[] = [];
  const os = (lead as any).onboardingState as OnboardingState | undefined;
  const proposalStatus = deriveProposalStatus(lead);
  const stage = classifyLeadStage(lead);

  // Proposal accepted but onboarding not started (>3 days)
  if (proposalStatus === 'proposal_accepted') {
    const changedAt = os?.statusChangedAt;
    const days = daysSince(changedAt);
    if (!changedAt || (days !== undefined && days > 3)) {
      bottlenecks.push({
        id: uid('bottleneck', 'proposal_no_onboard', lead.id),
        entityId: lead.id,
        entityName: lead.companyName,
        entityType: 'lead',
        type: 'proposal_accepted_no_onboarding',
        description: BOTTLENECK_TYPE_LABELS['proposal_accepted_no_onboarding'],
        fromStage: 'proposal_accepted',
        toStage: 'onboarding_complete',
        stalledForDays: days,
        impact: (days ?? 0) > 7 ? 'critical' : 'high',
        suggestedFix: 'Open the onboarding panel and complete data capture to move to provisioning.',
        drilldown: { label: 'Open Onboarding Panel', path: '/pipeline', entityId: lead.id, source: 'momentum' },
        why: `Proposal accepted ${days !== undefined ? `${days} days ago` : 'recently'} but onboarding data capture has not been started.`,
      });
    }
  }

  // Onboarding ready but not provisioned (>2 days)
  if (proposalStatus === 'onboarding_ready') {
    const changedAt = os?.statusChangedAt;
    const days = daysSince(changedAt);
    if (!changedAt || (days !== undefined && days > 2)) {
      bottlenecks.push({
        id: uid('bottleneck', 'ready_no_prov', lead.id),
        entityId: lead.id,
        entityName: lead.companyName,
        entityType: 'lead',
        type: 'onboarding_ready_no_provisioning',
        description: BOTTLENECK_TYPE_LABELS['onboarding_ready_no_provisioning'],
        fromStage: 'onboarding_complete',
        toStage: 'tenant_provisioned',
        stalledForDays: days,
        impact: (days ?? 0) > 5 ? 'critical' : 'high',
        suggestedFix: 'Trigger provisioning in the onboarding panel. All required data has been captured.',
        drilldown: { label: 'Open Onboarding Panel', path: '/pipeline', entityId: lead.id, source: 'momentum' },
        why: `Onboarding data is complete and readiness checks have passed, but the provisioning request has not been triggered after ${days !== undefined ? `${days} days` : 'multiple days'}.`,
      });
    }
  }

  // Provisioning failed
  if (os?.provisioning?.status === 'failed') {
    bottlenecks.push({
      id: uid('bottleneck', 'prov_failed', lead.id),
      entityId: lead.id,
      entityName: lead.companyName,
      entityType: 'lead',
      type: 'provisioning_failed',
      description: BOTTLENECK_TYPE_LABELS['provisioning_failed'],
      fromStage: 'onboarding_complete',
      toStage: 'tenant_provisioned',
      impact: 'critical',
      suggestedFix: `Investigate the error: "${os.provisioning.lastError ?? 'unknown error'}". Retry provisioning or contact AI Systems support.`,
      drilldown: { label: 'Retry Provisioning', path: '/pipeline', entityId: lead.id, source: 'momentum' },
      why: `Provisioning request was sent to AI Systems but returned a failure. ${os.provisioning.lastError ? `Error: ${os.provisioning.lastError}` : 'No specific error recorded.'}`,
    });
  }

  // Provisioning stalled (submitted/pending for > 2 days)
  if (os?.provisioning?.status === 'submitted' || os?.provisioning?.status === 'pending') {
    const days = daysSince(os.provisioning.triggeredAt);
    if (days !== undefined && days > 2) {
      bottlenecks.push({
        id: uid('bottleneck', 'prov_stalled', lead.id),
        entityId: lead.id,
        entityName: lead.companyName,
        entityType: 'lead',
        type: 'provisioning_stalled',
        description: BOTTLENECK_TYPE_LABELS['provisioning_stalled'],
        fromStage: 'onboarding_complete',
        toStage: 'tenant_provisioned',
        stalledForDays: days,
        impact: days > 5 ? 'critical' : 'high',
        suggestedFix: 'Check AI Systems for the provisioning request status. Escalate if > 5 business days.',
        drilldown: { label: 'View Provisioning Status', path: '/pipeline', entityId: lead.id, source: 'ai_systems' },
        why: `Provisioning was triggered ${days} day${days !== 1 ? 's' : ''} ago but no success response has been received.`,
      });
    }
  }

  // Strategy needs review
  if (lead.strategyStatus === 'needs_review' && stage !== 'proposal_accepted') {
    bottlenecks.push({
      id: uid('bottleneck', 'stale_strategy', lead.id),
      entityId: lead.id,
      entityName: lead.companyName,
      entityType: 'lead',
      type: 'stale_strategy',
      description: BOTTLENECK_TYPE_LABELS['stale_strategy'],
      fromStage: 'strategy_generated',
      toStage: 'proposal_accepted',
      impact: 'medium',
      suggestedFix: 'Review and update the strategy report before presenting to the prospect.',
      drilldown: { label: 'Open Strategy Report', path: '/pipeline', entityId: lead.id, source: 'momentum' },
      why: 'The strategy report is flagged as needing review — it may contain outdated recommendations.',
    });
  }

  return bottlenecks;
}

// ── Bottleneck detection — Client ─────────────────────────────────────────────

function detectClientBottlenecks(client: Client): CrossSystemBottleneck[] {
  const bottlenecks: CrossSystemBottleneck[] = [];
  const aiState = deriveAISystemsStateFromClient(client);

  // Delivery blocked
  if (client.deliveryStatus === 'blocked') {
    bottlenecks.push({
      id: uid('bottleneck', 'delivery_blocked', client.id),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      type: 'delivery_blocked',
      description: BOTTLENECK_TYPE_LABELS['delivery_blocked'],
      fromStage: 'tenant_provisioned',
      toStage: 'delivery_active',
      impact: 'critical',
      suggestedFix: 'Identify the blocker in AI Systems and escalate to the delivery team.',
      drilldown: { label: 'Open Client Profile', path: '/clients', entityId: client.id, source: 'momentum' },
      why: 'This client\'s delivery is in a blocked state. No delivery progress can occur until resolved.',
    });
  }

  // Delivery active but health red
  if (client.deliveryStatus === 'active' && client.healthStatus === 'red') {
    bottlenecks.push({
      id: uid('bottleneck', 'delivery_red', client.id),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      type: 'delivery_red_health',
      description: BOTTLENECK_TYPE_LABELS['delivery_red_health'],
      fromStage: 'delivery_active',
      toStage: 'optimisation_active',
      impact: 'critical',
      suggestedFix: 'Review health signals and intervene immediately to prevent client churn.',
      drilldown: { label: 'Open Expansion Workspace', path: '/clients', entityId: client.id, source: 'momentum' },
      why: `Client is in active delivery but health status is red. ${client.healthReasons?.slice(0, 2).join('; ') ?? 'Health reasons not specified.'}`,
    });
  }

  // Active with no portal
  if (client.deliveryStatus === 'active' && !aiState.activeModules.includes('portal_access')) {
    bottlenecks.push({
      id: uid('bottleneck', 'no_portal', client.id),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      type: 'no_portal_access',
      description: BOTTLENECK_TYPE_LABELS['no_portal_access'],
      fromStage: 'delivery_active',
      toStage: 'portal_active',
      impact: 'medium',
      suggestedFix: 'Set up client portal access so the client can view delivery progress.',
      drilldown: { label: 'Open Client Portal', path: '/clients', entityId: client.id, source: 'momentum' },
      why: 'Client is in active delivery but does not have portal access enabled.',
    });
  }

  // Active with no telemetry
  if (client.deliveryStatus === 'active' && aiState.telemetryStatus !== 'connected' && aiState.activeModules.includes('telemetry')) {
    bottlenecks.push({
      id: uid('bottleneck', 'no_telemetry', client.id),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      type: 'no_telemetry',
      description: BOTTLENECK_TYPE_LABELS['no_telemetry'],
      fromStage: 'delivery_active',
      toStage: 'telemetry_active',
      impact: 'medium',
      suggestedFix: 'Connect telemetry tracking in AI Systems to begin monitoring delivery performance.',
      drilldown: { label: 'Open Client Profile', path: '/clients', entityId: client.id, source: 'ai_systems' },
      why: 'Telemetry module was selected at onboarding but has not been connected in AI Systems.',
    });
  }

  return bottlenecks;
}

// ── Health summary ────────────────────────────────────────────────────────────

function buildEntityHealth(lead?: Lead, client?: Client): CrossSystemHealthSummary {
  const s = (h: string | undefined): SystemHealth => {
    if (h === 'green') return 'healthy';
    if (h === 'amber') return 'attention';
    if (h === 'red') return 'blocked';
    return 'unknown';
  };

  if (client) {
    const delivery = s(client.healthStatus);
    const optimisation = delivery === 'healthy' && client.deliveryStatus === 'active' ? 'healthy' : delivery === 'blocked' ? 'blocked' : 'attention';
    return {
      presale: 'healthy',   // Past pre-sale at client stage
      onboarding: 'healthy', // Past onboarding at client stage
      delivery,
      optimisation,
      engagement: delivery,
      overall: delivery,
    };
  }

  if (lead) {
    const proposalStatus = deriveProposalStatus(lead);
    const os = (lead as any).onboardingState as OnboardingState | undefined;
    const prov = os?.provisioning;

    const presale: SystemHealth = lead.stage === 'proposal' ? 'attention' : 'unknown';
    const onboarding: SystemHealth = proposalStatus === 'onboarding_ready' ? 'healthy'
      : proposalStatus === 'onboarding_in_progress' ? 'attention'
      : prov?.status === 'failed' ? 'blocked'
      : 'unknown';
    const provisioning: SystemHealth = prov?.status === 'succeeded' ? 'healthy'
      : prov?.status === 'failed' ? 'blocked'
      : prov?.status === 'submitted' ? 'attention'
      : 'unknown';

    return {
      presale,
      onboarding,
      delivery: provisioning,
      optimisation: 'unknown',
      engagement: 'unknown',
      overall: onboarding === 'blocked' || provisioning === 'blocked' ? 'blocked' : 'attention',
    };
  }

  return { presale: 'unknown', onboarding: 'unknown', delivery: 'unknown', optimisation: 'unknown', engagement: 'unknown', overall: 'unknown' };
}

// ── Momentum side state ───────────────────────────────────────────────────────

function buildMomentumSideForLead(lead: Lead): MomentumSideState {
  const os = (lead as any).onboardingState as OnboardingState | undefined;
  const days = daysSince(lead.lastContactDate);

  return {
    stage: lead.stage,
    strategyStatus: lead.strategyStatus ?? 'not_started',
    proposalStatus: deriveProposalStatus(lead),
    onboardingStatus: os?.status,
    provisioningStatus: os?.provisioning?.status,
    lastContact: lead.lastContactDate ? format(new Date(lead.lastContactDate), 'dd/MM/yyyy') : undefined,
    daysSinceContact: days,
  };
}

function buildMomentumSideForClient(client: Client): MomentumSideState {
  const days = daysSince((client as any).lastContactDate);
  return {
    stage: client.deliveryStatus ?? 'active',
    strategyStatus: client.strategyStatus ?? 'not_started',
    proposalStatus: 'provisioned',
    healthScore: client.churnRiskScore,
    lastContact: (client as any).lastContactDate ? format(new Date((client as any).lastContactDate), 'dd/MM/yyyy') : undefined,
    daysSinceContact: days,
  };
}

// ── Milestones ────────────────────────────────────────────────────────────────

function detectMilestones(lead: Lead): CrossSystemMilestone[] {
  const milestones: CrossSystemMilestone[] = [];
  const os = (lead as any).onboardingState as OnboardingState | undefined;

  if (os?.provisioning?.status === 'succeeded' && os.provisioning.succeededAt) {
    milestones.push({
      id: uid('milestone', 'provisioned', lead.id),
      entityId: lead.id,
      entityName: lead.companyName,
      entityType: 'lead',
      milestone: 'Tenant successfully provisioned',
      achievedAt: (() => { try { return format(new Date(os.provisioning!.succeededAt!), 'dd/MM/yyyy'); } catch { return todayStr(); } })(),
      stage: 'tenant_provisioned',
      sourceSystem: 'ai_systems',
    });
  }

  if (os?.acceptanceEvent?.acceptedAt) {
    milestones.push({
      id: uid('milestone', 'accepted', lead.id),
      entityId: lead.id,
      entityName: lead.companyName,
      entityType: 'lead',
      milestone: 'Proposal accepted',
      achievedAt: (() => { try { return format(new Date(os.acceptanceEvent!.acceptedAt!), 'dd/MM/yyyy'); } catch { return todayStr(); } })(),
      stage: 'proposal_accepted',
      sourceSystem: 'momentum',
    });
  }

  return milestones;
}

function detectClientMilestones(client: Client): CrossSystemMilestone[] {
  const milestones: CrossSystemMilestone[] = [];

  if (client.deliveryStatus === 'active') {
    milestones.push({
      id: uid('milestone', 'delivery_active', client.id),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      milestone: 'Delivery now active',
      achievedAt: client.updatedAt ? format(new Date(client.updatedAt), 'dd/MM/yyyy') : todayStr(),
      stage: 'delivery_active',
      sourceSystem: 'ai_systems',
    });
  }

  return milestones;
}

// ── Entity builders ───────────────────────────────────────────────────────────

function buildLeadEntityState(lead: Lead): CrossSystemEntityState {
  const stage = classifyLeadStage(lead);
  const stageIndex = LIFECYCLE_STAGE_INDEX[stage];
  const bottlenecks = detectLeadBottlenecks(lead);
  const alerts: CrossSystemAlert[] = [];

  // Alert on failed provisioning
  const os = (lead as any).onboardingState as OnboardingState | undefined;
  if (os?.provisioning?.status === 'failed') {
    alerts.push({
      id: uid('alert', 'prov_fail', lead.id),
      entityId: lead.id,
      entityName: lead.companyName,
      entityType: 'lead',
      severity: 'critical',
      title: 'Provisioning failed',
      why: `AI Systems returned an error. ${os.provisioning.lastError ?? 'No detail recorded.'}`,
      drilldown: { label: 'View in Pipeline', path: '/pipeline', entityId: lead.id, source: 'momentum' },
      sourceSystem: 'cross_system',
    });
  }

  const drilldowns = [
    { label: 'Pipeline', path: '/pipeline', entityId: lead.id, source: 'momentum' as const },
    { label: 'Onboarding Panel', path: '/pipeline', entityId: lead.id, source: 'momentum' as const },
    { label: 'Daily Briefing', path: '/briefing', source: 'momentum' as const },
  ];

  return {
    entityId: lead.id,
    entityName: lead.companyName,
    entityType: 'lead',
    currentStage: stage,
    stageIndex,
    progressPct: Math.round((stageIndex / 8) * 100),
    momentumSide: buildMomentumSideForLead(lead),
    aiSystemsSide: deriveAISystemsStateFromLead(lead),
    health: buildEntityHealth(lead, undefined),
    bottlenecks,
    alerts,
    drilldowns,
    isStalled: bottlenecks.length > 0,
    stalledForDays: bottlenecks.reduce<number | undefined>((max, b) => {
      if (b.stalledForDays === undefined) return max;
      return max === undefined ? b.stalledForDays : Math.max(max, b.stalledForDays);
    }, undefined),
  };
}

function buildClientEntityState(client: Client): CrossSystemEntityState {
  const stage = classifyClientStage(client);
  const stageIndex = LIFECYCLE_STAGE_INDEX[stage];
  const bottlenecks = detectClientBottlenecks(client);
  const alerts: CrossSystemAlert[] = [];

  if (client.healthStatus === 'red') {
    alerts.push({
      id: uid('alert', 'health_red', client.id),
      entityId: client.id,
      entityName: client.businessName,
      entityType: 'client',
      severity: 'critical',
      title: 'Health status critical',
      why: client.healthReasons?.slice(0, 2).join('; ') ?? 'Health signals indicate urgent risk.',
      drilldown: { label: 'Open Expansion Workspace', path: '/clients', entityId: client.id, source: 'momentum' },
      sourceSystem: 'momentum',
    });
  }

  const drilldowns = [
    { label: 'Client Profile', path: '/clients', entityId: client.id, source: 'momentum' as const },
    { label: 'Client Portal', path: `/portal/${client.id}`, source: 'momentum' as const },
    { label: 'Execution Queue', path: '/execution', source: 'momentum' as const },
    { label: 'Expansion Workspace', path: '/clients', entityId: client.id, source: 'momentum' as const },
  ];

  return {
    entityId: client.id,
    entityName: client.businessName,
    entityType: 'client',
    currentStage: stage,
    stageIndex,
    progressPct: Math.round((stageIndex / 8) * 100),
    momentumSide: buildMomentumSideForClient(client),
    aiSystemsSide: deriveAISystemsStateFromClient(client),
    health: buildEntityHealth(undefined, client),
    bottlenecks,
    alerts,
    drilldowns,
    isStalled: bottlenecks.some(b => b.impact === 'critical' || b.impact === 'high'),
  };
}

// ── Main derivation ───────────────────────────────────────────────────────────

export function deriveUnifiedOpsState(leads: Lead[], clients: Client[]): UnifiedOpsState {
  const activeLeads = leads.filter(l => !l.archived && (
    l.stage === 'proposal' ||
    (() => { const os = (l as any).onboardingState; return os && os.status; })()
  ));
  const activeClients = clients.filter(c => !c.archived);

  const leadEntities = activeLeads.map(buildLeadEntityState);
  const clientEntities = activeClients.map(buildClientEntityState);
  const allEntities = [...leadEntities, ...clientEntities];

  // Stage counts
  const stageCounts: LifecycleStageCount[] = LIFECYCLE_STAGES.map(stage => ({
    stage,
    count: allEntities.filter(e => e.currentStage === stage).length,
    stalledCount: allEntities.filter(e => e.currentStage === stage && e.isStalled).length,
  }));

  // Aggregate bottlenecks sorted by impact
  const allBottlenecks = allEntities.flatMap(e => e.bottlenecks).sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2 };
    return order[a.impact] - order[b.impact];
  });

  // Aggregate alerts
  const allAlerts = allEntities.flatMap(e => e.alerts).sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2 };
    return order[a.severity] - order[b.severity];
  });

  // Milestones from all leads + clients (sorted recent first)
  const leadMilestones = activeLeads.flatMap(detectMilestones);
  const clientMilestones = activeClients.flatMap(detectClientMilestones);
  const allMilestones = [...leadMilestones, ...clientMilestones].slice(0, 20);

  return {
    generatedAt: now(),
    stageCounts,
    totalEntities: allEntities.length,
    stalledCount: allEntities.filter(e => e.isStalled).length,
    criticalBottlenecks: allBottlenecks.filter(b => b.impact === 'critical').length,
    bottlenecks: allBottlenecks,
    alerts: allAlerts,
    entities: allEntities,
    recentMilestones: allMilestones,
    sourceInfo: {
      derivedAt: now(),
      momentumLeadCount: activeLeads.length,
      momentumClientCount: activeClients.length,
      aiSystemsDataQuality: 'derived',
      aiSystemsNote: 'AI Systems data is inferred from Momentum-synced fields. Direct API integration pending.',
    },
  };
}
