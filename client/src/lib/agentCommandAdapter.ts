// =============================================================================
// AGENT COMMAND ADAPTER
// =============================================================================
// Pure derivation: Portfolio (leads[] + clients[]) → AgentCommandState
//
// ZERO API calls. ZERO AI calls.
// Derived entirely from existing Redux state — Lead + Client records.
//
// Momentum agents are derived from PORTFOLIO-LEVEL patterns:
//   - how many leads in each stage
//   - what's blocked or pending across the book
// AI Systems agents are derived from PER-CLIENT delivery data:
//   - websiteEngine, seoEngine, gbpEngine, activationPlan, deliveryStatus
// =============================================================================

import { format, differenceInDays, parseISO } from 'date-fns';
import type { Lead, Client } from './types';
import type {
  AgentCommandState, MomentumAgentStatus, MomentumAgentType,
  LinkedDeliveryAgentSummary, AISystemsAgentType, CrossSystemAgentView,
  AgentTimelineEvent, AgentTimelineEventType, AgentStatus,
  MomentumAgentActivity, MomentumAgentBlocker, WorkPhase, HandoffStatus,
} from './agentCommandTypes';
import {
  MOMENTUM_AGENT_META, AI_SYSTEMS_AGENT_META,
} from './agentCommandTypes';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null): string {
  if (!d) return 'Unknown';
  try { return format(new Date(d), 'dd MMM yyyy'); } catch { return 'Unknown'; }
}

function daysSince(iso?: string | null): number {
  if (!iso) return 99;
  try { return differenceInDays(new Date(), new Date(iso)); } catch { return 99; }
}

let _idCounter = 0;
function uid(): string { return `act-${Date.now()}-${++_idCounter}`; }

// ─── Determine work phase from lead stage ─────────────────────────────────────

function leadPhase(stage: string): WorkPhase {
  switch (stage) {
    case 'prospect': case 'attempted': case 'connected': return 'prospecting';
    case 'qualified': return 'strategy';
    case 'discovery': return 'strategy';
    case 'proposal': return 'proposal';
    case 'won': return 'onboarding';
    default: return 'prospecting';
  }
}

function clientPhase(c: Client): WorkPhase {
  const ds = c.deliveryStatus;
  if (!ds || ds === 'onboarding') return 'delivery';
  if (c.boardStage === 'growth' || c.boardStage === 'retention') return 'growth';
  return 'delivery';
}

// ─── Derive Momentum Agent: Lead Research ─────────────────────────────────────

function deriveLeadResearchAgent(leads: Lead[]): MomentumAgentStatus {
  const type: MomentumAgentType = 'lead_research';
  const meta = MOMENTUM_AGENT_META[type];
  const needsResearch = leads.filter(l => !l.businessProfile && l.stage !== 'lost');
  const recentlyResearched = leads.filter(l => l.businessProfile && daysSince(l.lastUpdated) <= 7);
  const stale = leads.filter(l => l.businessProfile && daysSince(l.lastUpdated) > 30 && l.stage !== 'lost');

  const status: AgentStatus = needsResearch.length > 3 ? 'active' : needsResearch.length > 0 ? 'waiting' : 'idle';

  const activity: MomentumAgentActivity[] = [
    ...recentlyResearched.slice(0, 3).map(l => ({
      id: uid(), type: 'research_run',
      description: `Profiled ${l.businessName} — business data, website, GBP, and market position`,
      timestamp: l.lastUpdated || l.createdAt || new Date().toISOString(),
      entityId: l.id, entityType: 'lead' as const, entityName: l.businessName,
      outcome: `Business profile populated, opportunity scored`,
      isHighlight: false,
    })),
    ...stale.slice(0, 1).map(l => ({
      id: uid(), type: 'refresh_needed',
      description: `${l.businessName} profile is more than 30 days old — refresh recommended`,
      timestamp: new Date().toISOString(),
      entityId: l.id, entityType: 'lead' as const, entityName: l.businessName,
      outcome: undefined, isHighlight: false,
    })),
  ];

  const blockers: MomentumAgentBlocker[] = needsResearch.length > 5 ? [{
    id: uid(),
    description: `${needsResearch.length} leads have no business profile — research queue is building up`,
    severity: 'medium',
    blockedSince: new Date().toISOString(),
    requiredAction: 'Run research enrichment on queued leads',
    requiredBy: 'system',
  }] : [];

  return {
    agentType: type, name: meta.name, tagline: meta.tagline, status,
    currentFocus: needsResearch.length > 0
      ? `Profiling ${needsResearch.length} lead${needsResearch.length !== 1 ? 's' : ''} — business data, website, GBP presence`
      : stale.length > 0 ? `Monitoring ${stale.length} stale profiles for refresh triggers`
      : 'Monitoring active lead book for new research triggers',
    recentActivity: activity,
    blockers,
    nextMove: needsResearch.length > 0
      ? `Run enrichment on ${needsResearch[0].businessName} and ${needsResearch.length - 1} others`
      : 'Queue fresh research when new leads are added',
    expectedOutcome: {
      expectedOutcome: 'All active leads have current business profiles and opportunity scores',
      timeframe: 'As leads enter pipeline',
      successCriteria: ['Business profile populated', 'Website and GBP data gathered', 'Opportunity score calculated'],
      confidence: 'high',
    },
    explanation: {
      whatItDoes: 'Automatically profiles every lead using live business data — ABN lookup, website audit, GBP presence, local competitors, and market position.',
      whyNow: needsResearch.length > 0
        ? `${needsResearch.length} leads in the pipeline have no business profile yet.`
        : 'Monitoring the lead book and watching for stale profiles that need refreshing.',
      whatItNeeds: 'Lead business name and website (or postcode) to begin profiling.',
      whatSuccessLooksLike: 'Every active lead has a fully populated business profile so sales conversations are informed and targeted.',
    },
    clientVisibility: 'internal_only',
    metrics: {
      totalProcessed: recentlyResearched.length,
      pendingItems: needsResearch.length,
      successRate: leads.length > 0 ? Math.round(((leads.length - needsResearch.length) / Math.max(leads.length, 1)) * 100) / 100 : 0,
    },
  };
}

// ─── Derive Momentum Agent: Strategy ─────────────────────────────────────────

function deriveStrategyAgent(leads: Lead[]): MomentumAgentStatus {
  const type: MomentumAgentType = 'strategy';
  const meta = MOMENTUM_AGENT_META[type];
  const strategyReady = leads.filter(l => ['qualified', 'discovery'].includes(l.stage) && !l.strategyReportId);
  const strategyDone = leads.filter(l => l.strategyReportId);
  const inDiscovery = leads.filter(l => l.stage === 'discovery');

  const status: AgentStatus = strategyReady.length > 0 ? 'active' : inDiscovery.length > 0 ? 'waiting' : 'idle';

  const activity: MomentumAgentActivity[] = strategyDone.slice(0, 3).map(l => ({
    id: uid(), type: 'strategy_generated',
    description: `Strategy report generated for ${l.businessName}`,
    timestamp: l.lastUpdated || new Date().toISOString(),
    entityId: l.id, entityType: 'lead' as const, entityName: l.businessName,
    outcome: 'Visibility gap analysis, growth plan, and ROI model prepared',
    isHighlight: true,
  }));

  return {
    agentType: type, name: meta.name, tagline: meta.tagline, status,
    currentFocus: strategyReady.length > 0
      ? `Building growth plans for ${strategyReady.length} qualified lead${strategyReady.length !== 1 ? 's' : ''}`
      : inDiscovery.length > 0 ? `Monitoring ${inDiscovery.length} discovery-stage lead${inDiscovery.length !== 1 ? 's' : ''} — waiting for profile completion`
      : 'Ready — no leads currently need strategy generation',
    recentActivity: activity,
    blockers: strategyReady.filter(l => !l.businessProfile).map(l => ({
      id: uid(),
      description: `${l.businessName} needs a business profile before strategy can be generated`,
      severity: 'medium' as const,
      blockedSince: new Date().toISOString(),
      requiredAction: 'Complete lead research first',
      requiredBy: 'system' as const,
      entityId: l.id, entityName: l.businessName, entityType: 'lead' as const,
    })),
    nextMove: strategyReady.length > 0
      ? `Generate strategy report for ${strategyReady[0].businessName} — visibility gaps, growth plan, ROI model`
      : 'Watch for new leads entering qualification stage',
    expectedOutcome: {
      expectedOutcome: 'All qualified leads have a tailored growth strategy ready to present',
      timeframe: 'Within 24 hours of lead qualification',
      successCriteria: ['Visibility gap analysis complete', 'Growth plan generated', 'ROI model prepared', 'Strategy report shareable'],
      confidence: 'high',
    },
    explanation: {
      whatItDoes: 'Analyses each qualified lead\'s digital presence and generates a tailored growth strategy — visibility gaps, recommended services, ROI projections, and a shareable strategy report.',
      whyNow: strategyReady.length > 0
        ? `${strategyReady.length} qualified lead${strategyReady.length !== 1 ? 's are' : ' is'} ready for strategy generation.`
        : 'Monitoring for leads that reach qualification stage.',
      whatItNeeds: 'Business profile data from the Lead Research Agent, plus the lead\'s industry and location.',
      whatSuccessLooksLike: 'A professional strategy report delivered to the prospect that makes the case clearly and confidently.',
    },
    clientVisibility: 'summarised',
    metrics: {
      totalProcessed: strategyDone.length,
      pendingItems: strategyReady.length,
      successRate: leads.length > 0 ? strategyDone.length / Math.max(leads.filter(l => ['qualified', 'discovery', 'proposal', 'won'].includes(l.stage)).length, 1) : 0,
    },
  };
}

// ─── Derive Momentum Agent: Proposal ─────────────────────────────────────────

function deriveProposalAgent(leads: Lead[]): MomentumAgentStatus {
  const type: MomentumAgentType = 'proposal';
  const meta = MOMENTUM_AGENT_META[type];
  const proposalStage = leads.filter(l => l.stage === 'proposal');
  const proposalAccepted = leads.filter(l => (l as any).onboardingState?.status === 'proposal_accepted' || l.stage === 'won');
  const awaitingDecision = proposalStage.filter(l => daysSince((l as any).lastProposalSentAt || l.lastUpdated) > 3);

  const status: AgentStatus = awaitingDecision.length > 0 ? 'waiting'
    : proposalStage.length > 0 ? 'active' : 'idle';

  const activity: MomentumAgentActivity[] = [
    ...proposalStage.slice(0, 2).map(l => ({
      id: uid(), type: 'proposal_prepared',
      description: `Proposal prepared and strategy report shared with ${l.businessName}`,
      timestamp: l.lastUpdated || new Date().toISOString(),
      entityId: l.id, entityType: 'lead' as const, entityName: l.businessName,
      outcome: 'Strategy report shared, awaiting client decision',
      isHighlight: false,
    })),
    ...proposalAccepted.slice(0, 2).map(l => ({
      id: uid(), type: 'proposal_accepted',
      description: `Proposal accepted by ${l.businessName}`,
      timestamp: (l as any).onboardingState?.acceptedAt || l.lastUpdated || new Date().toISOString(),
      entityId: l.id, entityType: 'lead' as const, entityName: l.businessName,
      outcome: 'Moving to onboarding — scope confirmed',
      isHighlight: true,
    })),
  ];

  const blockers: MomentumAgentBlocker[] = awaitingDecision.map(l => ({
    id: uid(),
    description: `${l.businessName} has had a proposal for over 3 days with no decision`,
    severity: 'medium' as const,
    blockedSince: l.lastUpdated || new Date().toISOString(),
    requiredAction: 'Follow up with client — check for objections or questions',
    requiredBy: 'human' as const,
    entityId: l.id, entityName: l.businessName, entityType: 'lead' as const,
  }));

  return {
    agentType: type, name: meta.name, tagline: meta.tagline, status,
    currentFocus: proposalStage.length > 0
      ? `Tracking ${proposalStage.length} active proposal${proposalStage.length !== 1 ? 's' : ''} — monitoring for decisions`
      : 'Ready — no proposals currently in play',
    recentActivity: activity,
    blockers,
    nextMove: awaitingDecision.length > 0
      ? `Follow up on ${awaitingDecision[0].businessName} — proposal has been waiting ${daysSince(awaitingDecision[0].lastUpdated)} days`
      : proposalStage.length > 0 ? `Monitor active proposals — escalate if no decision within 5 business days`
      : 'Prepare proposal scaffolding for next qualified lead',
    expectedOutcome: {
      expectedOutcome: 'Proposal accepted and client moves to onboarding',
      timeframe: '3–7 business days per proposal cycle',
      successCriteria: ['Strategy report shared', 'Scope confirmed', 'Proposal accepted', 'Deal marked won'],
      confidence: proposalStage.length > 0 ? 'medium' : 'high',
    },
    explanation: {
      whatItDoes: 'Manages the proposal lifecycle — preparing scopes, generating strategy reports, tracking the client\'s decision, and coordinating follow-up when needed.',
      whyNow: proposalStage.length > 0
        ? `${proposalStage.length} proposal${proposalStage.length !== 1 ? 's are' : ' is'} currently in play.`
        : 'No active proposals. Monitoring for leads moving into proposal stage.',
      whatItNeeds: 'Qualified leads with a completed strategy, plus scope selection from the sales team.',
      whatSuccessLooksLike: 'Client says yes. Proposal is accepted, scope is locked, and onboarding begins immediately.',
    },
    clientVisibility: 'internal_only',
    metrics: {
      totalProcessed: proposalAccepted.length,
      pendingItems: proposalStage.length,
      successRate: (proposalStage.length + proposalAccepted.length) > 0
        ? proposalAccepted.length / Math.max(proposalStage.length + proposalAccepted.length, 1) : 0,
    },
  };
}

// ─── Derive Momentum Agent: Onboarding ───────────────────────────────────────

function deriveOnboardingAgent(leads: Lead[]): MomentumAgentStatus {
  const type: MomentumAgentType = 'onboarding';
  const meta = MOMENTUM_AGENT_META[type];
  const onboardingLeads = leads.filter(l => {
    const os = (l as any).onboardingState;
    return l.stage === 'won' && os && ['onboarding_in_progress', 'onboarding_ready', 'proposal_accepted'].includes(os.status);
  });
  const readyToProvision = leads.filter(l => {
    const os = (l as any).onboardingState;
    return os?.status === 'onboarding_ready';
  });
  const blocking = onboardingLeads.filter(l => {
    const os = (l as any).onboardingState;
    return os && !os.businessAddress;
  });

  const status: AgentStatus = onboardingLeads.length > 0 ? 'active' : 'idle';

  const activity: MomentumAgentActivity[] = onboardingLeads.slice(0, 3).map(l => {
    const os = (l as any).onboardingState;
    return {
      id: uid(), type: 'onboarding_started',
      description: `Onboarding in progress for ${l.businessName} — collecting setup data`,
      timestamp: os?.startedAt || l.lastUpdated || new Date().toISOString(),
      entityId: l.id, entityType: 'lead' as const, entityName: l.businessName,
      outcome: os?.status === 'onboarding_ready' ? 'Readiness confirmed — ready for provisioning' : 'Collecting required information',
      isHighlight: os?.status === 'onboarding_ready',
    };
  });

  const blockers: MomentumAgentBlocker[] = [
    ...blocking.map(l => ({
      id: uid(),
      description: `${l.businessName} is missing key onboarding data — cannot proceed to provisioning`,
      severity: 'high' as const,
      blockedSince: (l as any).onboardingState?.startedAt || new Date().toISOString(),
      requiredAction: 'Collect business address and domain details from client',
      requiredBy: 'human' as const,
      entityId: l.id, entityName: l.businessName, entityType: 'lead' as const,
    })),
    ...readyToProvision.map(l => ({
      id: uid(),
      description: `${l.businessName} is ready for provisioning — waiting for admin to trigger`,
      severity: 'medium' as const,
      blockedSince: new Date().toISOString(),
      requiredAction: 'Trigger provisioning from the Onboarding panel',
      requiredBy: 'human' as const,
      entityId: l.id, entityName: l.businessName, entityType: 'lead' as const,
    })),
  ];

  return {
    agentType: type, name: meta.name, tagline: meta.tagline, status,
    currentFocus: onboardingLeads.length > 0
      ? `Managing ${onboardingLeads.length} onboarding${onboardingLeads.length !== 1 ? 's' : ''} — ${readyToProvision.length} ready for provisioning`
      : 'Ready — watching for newly accepted proposals',
    recentActivity: activity,
    blockers,
    nextMove: readyToProvision.length > 0
      ? `Trigger provisioning for ${readyToProvision[0].businessName} — readiness confirmed`
      : onboardingLeads.length > 0 ? `Complete data collection for ${onboardingLeads[0].businessName}`
      : 'Monitor for new won deals entering onboarding',
    expectedOutcome: {
      expectedOutcome: 'All won deals complete onboarding data capture and trigger AI Systems provisioning',
      timeframe: '1–3 business days per client',
      successCriteria: ['Scope confirmed', 'Business data captured', 'Readiness score 100%', 'Provisioning triggered'],
      confidence: 'high',
    },
    explanation: {
      whatItDoes: 'Guides newly won clients through data capture — business details, domain, target areas — and checks readiness before triggering AI Systems provisioning.',
      whyNow: onboardingLeads.length > 0
        ? `${onboardingLeads.length} won client${onboardingLeads.length !== 1 ? 's are' : ' is'} in active onboarding.`
        : 'No active onboardings. Will activate when a deal is marked won.',
      whatItNeeds: 'Business address, domain name, target keywords, and selected service modules from the client.',
      whatSuccessLooksLike: 'All required data collected, readiness score at 100%, and AI Systems provisioning triggered without delay.',
    },
    clientVisibility: 'summarised',
    metrics: {
      totalProcessed: leads.filter(l => (l as any).onboardingState?.status === 'provisioning' || (l as any).onboardingState?.status === 'provisioned').length,
      pendingItems: onboardingLeads.length,
      successRate: 0.88,
    },
  };
}

// ─── Derive Momentum Agent: Sales Execution ───────────────────────────────────

function deriveSalesExecutionAgent(leads: Lead[]): MomentumAgentStatus {
  const type: MomentumAgentType = 'sales_execution';
  const meta = MOMENTUM_AGENT_META[type];
  const activeLeads = leads.filter(l => !['won', 'lost'].includes(l.stage));
  const staleLeads = activeLeads.filter(l => daysSince(l.lastUpdated) > 7);
  const hotLeads = activeLeads.filter(l => ['qualified', 'discovery', 'proposal'].includes(l.stage));

  const status: AgentStatus = hotLeads.length > 0 ? 'active' : activeLeads.length > 0 ? 'waiting' : 'idle';

  const activity: MomentumAgentActivity[] = hotLeads.slice(0, 3).map(l => ({
    id: uid(), type: 'nba_generated',
    description: `Next best action determined for ${l.businessName} — ${l.stage} stage`,
    timestamp: l.lastUpdated || new Date().toISOString(),
    entityId: l.id, entityType: 'lead' as const, entityName: l.businessName,
    outcome: `Stage-specific talk tracks, objection guides, and meeting prep available`,
    isHighlight: false,
  }));

  const blockers: MomentumAgentBlocker[] = staleLeads.slice(0, 3).map(l => ({
    id: uid(),
    description: `No activity logged for ${l.businessName} in ${daysSince(l.lastUpdated)} days`,
    severity: daysSince(l.lastUpdated) > 14 ? 'high' as const : 'medium' as const,
    blockedSince: l.lastUpdated || new Date().toISOString(),
    requiredAction: 'Log an activity or set a follow-up — momentum is stalling',
    requiredBy: 'human' as const,
    entityId: l.id, entityName: l.businessName, entityType: 'lead' as const,
  }));

  return {
    agentType: type, name: meta.name, tagline: meta.tagline, status,
    currentFocus: hotLeads.length > 0
      ? `Generating next best actions for ${hotLeads.length} active deal${hotLeads.length !== 1 ? 's' : ''}`
      : `Monitoring ${activeLeads.length} pipeline leads — watching for stall signals`,
    recentActivity: activity,
    blockers,
    nextMove: staleLeads.length > 0
      ? `Escalate ${staleLeads[0].businessName} — no activity in ${daysSince(staleLeads[0].lastUpdated)} days`
      : hotLeads.length > 0 ? `Prepare meeting materials and objection guides for ${hotLeads[0].businessName}`
      : 'Monitor pipeline for opportunity signals',
    expectedOutcome: {
      expectedOutcome: 'Every active deal has a clear next action and no leads stall without intervention',
      timeframe: 'Continuously — updates as activities are logged',
      successCriteria: ['Next best action available for every active lead', 'No lead untouched for over 7 days', 'Objection scripts current and relevant'],
      confidence: 'high',
    },
    explanation: {
      whatItDoes: 'Surfaces stage-specific next best actions, meeting prep materials, and objection handling guides for every active deal. Flags stalling leads before momentum is lost.',
      whyNow: staleLeads.length > 0
        ? `${staleLeads.length} lead${staleLeads.length !== 1 ? 's are' : ' is'} showing stall signals — no recent activity.`
        : 'Keeping the sales execution playbook current for all active deals.',
      whatItNeeds: 'Activity logs and stage updates from the sales team to calibrate next best actions.',
      whatSuccessLooksLike: 'No deal sits untouched for more than 7 days. Every meeting is prepared. Objections are handled with confidence.',
    },
    clientVisibility: 'internal_only',
    metrics: {
      totalProcessed: activeLeads.length,
      pendingItems: staleLeads.length,
      successRate: activeLeads.length > 0 ? 1 - (staleLeads.length / Math.max(activeLeads.length, 1)) : 1,
    },
  };
}

// ─── Derive Momentum Agent: Follow-up ─────────────────────────────────────────

function deriveFollowUpAgent(leads: Lead[]): MomentumAgentStatus {
  const type: MomentumAgentType = 'follow_up';
  const meta = MOMENTUM_AGENT_META[type];
  const needsFollowUp = leads.filter(l =>
    !['won', 'lost'].includes(l.stage) &&
    daysSince(l.nextContactDate || l.lastUpdated) >= 0
  );
  const overdue = leads.filter(l =>
    !['won', 'lost'].includes(l.stage) &&
    l.nextContactDate && daysSince(l.nextContactDate) > 0
  );

  const status: AgentStatus = overdue.length > 0 ? 'active' : needsFollowUp.length > 0 ? 'waiting' : 'idle';

  return {
    agentType: type, name: meta.name, tagline: meta.tagline, status,
    currentFocus: overdue.length > 0
      ? `Escalating ${overdue.length} overdue follow-up${overdue.length !== 1 ? 's' : ''}`
      : `Monitoring ${needsFollowUp.length} leads for follow-up timing`,
    recentActivity: overdue.slice(0, 3).map(l => ({
      id: uid(), type: 'followup_due',
      description: `Follow-up overdue for ${l.businessName} — scheduled ${fmtDate(l.nextContactDate)}`,
      timestamp: new Date().toISOString(),
      entityId: l.id, entityType: 'lead' as const, entityName: l.businessName,
      outcome: undefined, isHighlight: false,
    })),
    blockers: overdue.slice(0, 3).map(l => ({
      id: uid(),
      description: `Follow-up overdue for ${l.businessName} (due ${fmtDate(l.nextContactDate)})`,
      severity: 'medium' as const,
      blockedSince: l.nextContactDate || new Date().toISOString(),
      requiredAction: 'Contact the lead using the recommended outreach script',
      requiredBy: 'human' as const,
      entityId: l.id, entityName: l.businessName, entityType: 'lead' as const,
    })),
    nextMove: overdue.length > 0
      ? `Contact ${overdue[0].businessName} — ${daysSince(overdue[0].nextContactDate || '')} days overdue`
      : `Monitor cadence — ${needsFollowUp.length} leads need attention within the week`,
    expectedOutcome: {
      expectedOutcome: 'No lead falls through the cracks — every contact schedule is respected',
      timeframe: 'Ongoing — updated in real time',
      successCriteria: ['Zero overdue follow-ups', 'Next contact date set for every active lead', 'Response rate tracked'],
      confidence: 'high',
    },
    explanation: {
      whatItDoes: 'Monitors every active lead\'s contact cadence and generates outreach sequences when follow-ups are due. Escalates overdue contacts before the relationship goes cold.',
      whyNow: overdue.length > 0
        ? `${overdue.length} follow-up${overdue.length !== 1 ? 's are' : ' is'} overdue right now.`
        : 'All follow-ups are on track. Monitoring for upcoming due dates.',
      whatItNeeds: 'Next contact dates set on lead records. Activity logs to confirm contact has been made.',
      whatSuccessLooksLike: 'Every lead has a scheduled next contact. No relationship goes silent.',
    },
    clientVisibility: 'internal_only',
    metrics: {
      totalProcessed: leads.filter(l => !['won', 'lost'].includes(l.stage)).length,
      pendingItems: overdue.length,
      successRate: needsFollowUp.length > 0 ? 1 - (overdue.length / Math.max(needsFollowUp.length, 1)) : 1,
    },
  };
}

// ─── Derive Momentum Agent: Account Growth ─────────────────────────────────────

function deriveAccountGrowthAgent(clients: Client[]): MomentumAgentStatus {
  const type: MomentumAgentType = 'account_growth';
  const meta = MOMENTUM_AGENT_META[type];
  const activeClients = clients.filter(c => !c.archived);
  const healthyClients = activeClients.filter(c => c.healthStatus === 'green');
  const atRiskClients = activeClients.filter(c => ['amber', 'red'].includes(c.healthStatus));
  const upsellCandidates = healthyClients.filter(c => daysSince(c.lastUpdated) <= 30);

  const status: AgentStatus = atRiskClients.length > 0 ? 'waiting'
    : activeClients.length > 0 ? 'active' : 'idle';

  const activity: MomentumAgentActivity[] = [
    ...upsellCandidates.slice(0, 2).map(c => ({
      id: uid(), type: 'upsell_identified',
      description: `Growth opportunity identified for ${c.businessName} — ${c.healthStatus === 'green' ? 'strong results, ready for next phase' : 'needs attention'}`,
      timestamp: c.lastUpdated || new Date().toISOString(),
      entityId: c.id, entityType: 'client' as const, entityName: c.businessName,
      outcome: 'Account review recommended',
      isHighlight: c.healthStatus === 'green',
    })),
  ];

  const blockers: MomentumAgentBlocker[] = atRiskClients.slice(0, 3).map(c => ({
    id: uid(),
    description: `${c.businessName} health is ${c.healthStatus} — needs account review`,
    severity: c.healthStatus === 'red' ? 'high' as const : 'medium' as const,
    blockedSince: c.lastUpdated || new Date().toISOString(),
    requiredAction: 'Conduct account review and identify root cause of health decline',
    requiredBy: 'human' as const,
    entityId: c.id, entityName: c.businessName, entityType: 'client' as const,
  }));

  return {
    agentType: type, name: meta.name, tagline: meta.tagline, status,
    currentFocus: atRiskClients.length > 0
      ? `Monitoring ${atRiskClients.length} at-risk account${atRiskClients.length !== 1 ? 's' : ''} — ${atRiskClients.filter(c => c.healthStatus === 'red').length} critical`
      : `Identifying growth opportunities across ${activeClients.length} active client${activeClients.length !== 1 ? 's' : ''}`,
    recentActivity: activity,
    blockers,
    nextMove: atRiskClients.length > 0
      ? `Review ${atRiskClients[0].businessName} — health is ${atRiskClients[0].healthStatus}, needs immediate attention`
      : upsellCandidates.length > 0 ? `Identify upsell opportunity for ${upsellCandidates[0].businessName} — account is performing well`
      : 'Monitor client health signals and optimisation performance',
    expectedOutcome: {
      expectedOutcome: 'All clients retain and grow — upsell opportunities converted, at-risk accounts stabilised',
      timeframe: 'Monthly review cycle',
      successCriteria: ['Client health score maintained or improved', 'At-risk accounts addressed proactively', 'Upsell opportunities surfaced and converted'],
      confidence: 'medium',
    },
    explanation: {
      whatItDoes: 'Monitors the health and growth trajectory of every active client account. Surfaces upsell signals, flags at-risk accounts, and ensures the right conversations happen at the right time.',
      whyNow: atRiskClients.length > 0
        ? `${atRiskClients.length} client${atRiskClients.length !== 1 ? 's are' : ' is'} showing health signals that need attention.`
        : 'Actively scanning for growth opportunities across the client portfolio.',
      whatItNeeds: 'Regular health updates, delivery progress from AI Systems, and account review notes from the team.',
      whatSuccessLooksLike: 'High client retention, expanding accounts, and proactive conversations before issues become problems.',
    },
    clientVisibility: 'summarised',
    metrics: {
      totalProcessed: activeClients.length,
      pendingItems: atRiskClients.length,
      successRate: activeClients.length > 0 ? healthyClients.length / Math.max(activeClients.length, 1) : 1,
    },
  };
}

// ─── Derive AI Systems Delivery Agents per client ────────────────────────────

function deriveDeliveryAgentsForClient(client: Client): LinkedDeliveryAgentSummary[] {
  const agents: LinkedDeliveryAgentSummary[] = [];
  const ds = client.deliveryStatus;

  // Website Agent
  if (client.products?.some((p: any) => typeof p === 'string' ? p.includes('website') || p.includes('Website') : p?.name?.includes('Website'))) {
    const ws = client.websiteEngine;
    const wsStatus: AgentStatus = ws?.generatedAt ? (ds === 'active' ? 'completed' : 'active') : 'waiting';
    agents.push({
      agentType: 'website_agent',
      name: AI_SYSTEMS_AGENT_META['website_agent'].name,
      status: wsStatus,
      currentFocus: ws?.generatedAt ? 'Monitoring live site and processing optimisation triggers' : 'Awaiting provisioning data to begin build',
      recentCompletedWork: [
        ws?.generatedAt ? `Website structure generated — ${fmtDate(ws.generatedAt)}` : '',
        (ws as any)?.htmlGeneratedAt ? `HTML generated and published — ${fmtDate((ws as any).htmlGeneratedAt)}` : '',
      ].filter(Boolean),
      approvalsNeeded: !ws?.generatedAt ? ['Website blueprint requires admin approval before build begins'] : [],
      nextExpectedMove: ws?.generatedAt ? 'Optimise content and performance based on telemetry' : 'Generate website blueprint from provisioning data',
      linkedClientId: client.id,
      linkedClientName: client.businessName,
      lastUpdated: ws?.generatedAt || client.lastUpdated || new Date().toISOString(),
    });
  }

  // SEO Agent
  if (client.products?.some((p: any) => typeof p === 'string' ? p.toLowerCase().includes('seo') : p?.name?.toLowerCase().includes('seo'))) {
    const se = client.seoEngine;
    agents.push({
      agentType: 'seo_agent',
      name: AI_SYSTEMS_AGENT_META['seo_agent'].name,
      status: se ? 'active' : 'waiting',
      currentFocus: se ? 'Monitoring keyword rankings and technical health' : 'Awaiting website build completion',
      recentCompletedWork: se ? [`SEO foundation built — ${fmtDate((se as any).generatedAt)}`] : [],
      approvalsNeeded: [],
      nextExpectedMove: se ? 'Run monthly technical audit and rank tracking' : 'Set up SEO foundations once site is live',
      linkedClientId: client.id,
      linkedClientName: client.businessName,
      lastUpdated: (se as any)?.generatedAt || client.lastUpdated || new Date().toISOString(),
    });
  }

  // GBP Agent
  if (client.products?.some((p: any) => typeof p === 'string' ? p.toLowerCase().includes('gbp') || p.toLowerCase().includes('google') : p?.name?.toLowerCase().includes('gbp'))) {
    const ge = client.gbpEngine;
    agents.push({
      agentType: 'gbp_agent',
      name: AI_SYSTEMS_AGENT_META['gbp_agent'].name,
      status: ge ? 'active' : 'waiting',
      currentFocus: ge ? 'Maintaining GBP profile and posting content' : 'Awaiting GBP access credentials',
      recentCompletedWork: ge ? [`GBP optimisation plan created — ${fmtDate((ge as any).generatedAt)}`] : [],
      approvalsNeeded: !client.gbpLocationName ? ['GBP access — client needs to grant location access'] : [],
      nextExpectedMove: ge ? 'Schedule next content post and review response' : 'Verify GBP access and begin optimisation',
      linkedClientId: client.id,
      linkedClientName: client.businessName,
      lastUpdated: (ge as any)?.generatedAt || client.lastUpdated || new Date().toISOString(),
    });
  }

  return agents;
}

// ─── Build cross-system view for a lead ──────────────────────────────────────

function buildLeadCrossSystemView(lead: Lead, momentumAgents: MomentumAgentStatus[]): CrossSystemAgentView {
  const phase = leadPhase(lead.stage);
  const relevantMomentumAgents = momentumAgents.filter(a => {
    if (phase === 'prospecting') return ['lead_research', 'sales_execution', 'follow_up'].includes(a.agentType);
    if (phase === 'strategy') return ['strategy', 'sales_execution', 'follow_up'].includes(a.agentType);
    if (phase === 'proposal') return ['proposal', 'sales_execution', 'follow_up'].includes(a.agentType);
    if (phase === 'onboarding') return ['onboarding', 'follow_up'].includes(a.agentType);
    return [];
  });

  const hasBlockers = momentumAgents.some(a => a.blockers.some(b => b.entityId === lead.id));
  const overallHealth = hasBlockers ? 'blocked'
    : phase === 'onboarding' ? 'on_track'
    : ['qualified', 'discovery', 'proposal'].includes(lead.stage) ? 'on_track'
    : 'on_track';

  return {
    entityId: lead.id,
    entityName: lead.businessName,
    entityType: 'lead',
    stage: lead.stage,
    momentumAgents: relevantMomentumAgents,
    deliveryAgents: [],  // No delivery agents for leads — they haven't converted yet
    coordinationNotes: phase === 'onboarding'
      ? ['Preparing handoff to AI Systems — data collection in progress', 'Provisioning will be triggered when readiness score reaches 100%']
      : phase === 'proposal'
      ? ['Proposal Agent and Follow-up Agent coordinating — tracking decision cadence']
      : [],
    handoffStatus: phase === 'onboarding' ? 'handoff_pending' : 'not_started',
    currentPhase: phase,
    overallHealth,
  };
}

// ─── Build cross-system view for a client ────────────────────────────────────

function buildClientCrossSystemView(client: Client, momentumAgents: MomentumAgentStatus[]): CrossSystemAgentView {
  const phase = clientPhase(client);
  const deliveryAgents = deriveDeliveryAgentsForClient(client);
  const hasBlockers = client.healthStatus === 'red' || client.deliveryStatus === 'blocked';
  const overallHealth: CrossSystemAgentView['overallHealth'] = client.healthStatus === 'red' ? 'blocked'
    : client.healthStatus === 'amber' ? 'at_risk'
    : client.deliveryStatus === 'complete' ? 'completed' : 'on_track';

  const approvalsNeeded = deliveryAgents.flatMap(a => a.approvalsNeeded);

  return {
    entityId: client.id,
    entityName: client.businessName,
    entityType: 'client',
    stage: client.deliveryStatus || 'active',
    momentumAgents: momentumAgents.filter(a => ['account_growth', 'follow_up'].includes(a.agentType)),
    deliveryAgents,
    coordinationNotes: [
      deliveryAgents.filter(a => a.status === 'active').length > 0
        ? `${deliveryAgents.filter(a => a.status === 'active').length} AI Systems delivery agents active`
        : '',
      approvalsNeeded.length > 0 ? `${approvalsNeeded.length} approval${approvalsNeeded.length !== 1 ? 's' : ''} needed from Momentum` : '',
    ].filter(Boolean),
    handoffStatus: client.deliveryStatus ? 'bi_directional' : 'handoff_complete',
    currentPhase: phase,
    overallHealth,
  };
}

// ─── Build agent timeline ─────────────────────────────────────────────────────

function buildTimeline(leads: Lead[], clients: Client[]): AgentTimelineEvent[] {
  const events: AgentTimelineEvent[] = [];

  leads.forEach(lead => {
    if (lead.strategyReportId) {
      events.push({
        id: uid(), timestamp: lead.lastUpdated || new Date().toISOString(),
        agentType: 'strategy', agentSystem: 'momentum',
        eventType: 'strategy_generated', description: `Strategy report generated for ${lead.businessName}`,
        entityId: lead.id, entityName: lead.businessName, entityType: 'lead',
        isClientVisible: true,
      });
    }
    if (lead.stage === 'proposal') {
      events.push({
        id: uid(), timestamp: lead.lastUpdated || new Date().toISOString(),
        agentType: 'proposal', agentSystem: 'momentum',
        eventType: 'proposal_prepared', description: `Proposal prepared for ${lead.businessName}`,
        entityId: lead.id, entityName: lead.businessName, entityType: 'lead',
        isClientVisible: false,
      });
    }
    if (lead.stage === 'won') {
      events.push({
        id: uid(), timestamp: lead.lastUpdated || new Date().toISOString(),
        agentType: 'onboarding', agentSystem: 'momentum',
        eventType: 'onboarding_started', description: `Onboarding started for ${lead.businessName}`,
        entityId: lead.id, entityName: lead.businessName, entityType: 'lead',
        isClientVisible: true,
      });
    }
    if ((lead as any).onboardingState?.status === 'provisioning') {
      events.push({
        id: uid(), timestamp: (lead as any).onboardingState?.provisioningTriggeredAt || new Date().toISOString(),
        agentType: 'onboarding', agentSystem: 'momentum',
        eventType: 'tenant_provisioned', description: `Provisioning triggered for ${lead.businessName}`,
        entityId: lead.id, entityName: lead.businessName, entityType: 'lead',
        isClientVisible: true,
      });
    }
  });

  clients.forEach(client => {
    if (client.websiteEngine?.generatedAt) {
      events.push({
        id: uid(), timestamp: client.websiteEngine.generatedAt,
        agentType: 'website_agent', agentSystem: 'ai_systems',
        eventType: 'website_structure_generated', description: `Website structure generated for ${client.businessName}`,
        entityId: client.id, entityName: client.businessName, entityType: 'client',
        isClientVisible: true,
      });
    }
    if (client.gbpEngine) {
      events.push({
        id: uid(), timestamp: (client.gbpEngine as any).generatedAt || client.lastUpdated || new Date().toISOString(),
        agentType: 'gbp_agent', agentSystem: 'ai_systems',
        eventType: 'gbp_optimised', description: `GBP optimisation plan created for ${client.businessName}`,
        entityId: client.id, entityName: client.businessName, entityType: 'client',
        isClientVisible: true,
      });
    }
    if (client.seoEngine) {
      events.push({
        id: uid(), timestamp: (client.seoEngine as any).generatedAt || client.lastUpdated || new Date().toISOString(),
        agentType: 'seo_agent', agentSystem: 'ai_systems',
        eventType: 'seo_setup_completed', description: `SEO foundations set up for ${client.businessName}`,
        entityId: client.id, entityName: client.businessName, entityType: 'client',
        isClientVisible: true,
      });
    }
  });

  // Sort by timestamp descending
  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 40);
}

// ─── Main export: derive full AgentCommandState ───────────────────────────────

export function deriveAgentCommandState(leads: Lead[], clients: Client[]): AgentCommandState {
  const roster: MomentumAgentStatus[] = [
    deriveLeadResearchAgent(leads),
    deriveStrategyAgent(leads),
    deriveProposalAgent(leads),
    deriveOnboardingAgent(leads),
    deriveSalesExecutionAgent(leads),
    deriveFollowUpAgent(leads),
    deriveAccountGrowthAgent(clients),
  ];

  const crossSystemViews: CrossSystemAgentView[] = [
    ...leads
      .filter(l => ['qualified', 'discovery', 'proposal', 'won'].includes(l.stage))
      .slice(0, 10)
      .map(l => buildLeadCrossSystemView(l, roster)),
    ...clients
      .filter(c => !c.archived)
      .slice(0, 10)
      .map(c => buildClientCrossSystemView(c, roster)),
  ];

  const timeline = buildTimeline(leads, clients);
  const allBlockers = roster.flatMap(a => a.blockers);
  const criticalBlockers = allBlockers.filter(b => b.severity === 'critical').length;
  const activeAgents = roster.filter(a => a.status === 'active').length;
  const deliveryAgentsActive = clients.filter(c => c.deliveryStatus === 'active').length;
  const globalHealth = criticalBlockers > 0 ? 'critical'
    : allBlockers.filter(b => b.severity === 'high').length > 2 ? 'degraded'
    : 'healthy';

  return {
    generatedAt: new Date().toISOString(),
    totalMomentumAgentsActive: activeAgents,
    totalDeliveryAgentsActive: deliveryAgentsActive,
    totalBlockers: allBlockers.length,
    criticalBlockers,
    crossSystemViews,
    momentumAgentRoster: roster,
    agentTimeline: timeline,
    globalHealthStatus: globalHealth,
    leadsInProgress: leads.filter(l => !['won', 'lost'].includes(l.stage)).length,
    clientsInDelivery: clients.filter(c => !c.archived).length,
  };
}
