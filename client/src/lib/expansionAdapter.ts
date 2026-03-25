/**
 * Expansion Engine — Signal Adapter
 *
 * Pure derivation functions. No AI calls. No API calls.
 * All expansion state is derived from live Redux client data.
 *
 * Signal categories:
 *   1. Growth signals       — what's happening at account level
 *   2. Upsell opportunities — structured cross-sell / expansion
 *   3. Churn risk detection — severity, cause, intervention
 *   4. Referral timing      — when and how to ask
 *   5. Next best actions    — what to do and what to say
 *   6. Expansion plays      — campaign-style growth initiatives
 *   7. Trigger events       — audit trail of why signals fired
 *   8. Client-safe moments  — future client-facing surfaces
 */

import { format } from 'date-fns';
import { Client } from './types';
import {
  ExpansionState,
  ClientExpansionState,
  AccountGrowthSignal,
  ExpansionOpportunity,
  ChurnRiskSignal,
  ChurnSeverity,
  ReferralOpportunity,
  ExpansionNextBestAction,
  ExpansionPlay,
  GrowthTriggerEvent,
  ClientSafeGrowthMoment,
  AccountHealthTrend,
  HealthTrendDirection,
  ExpansionSignalInspection,
} from './expansionTypes';

// ── Utilities ─────────────────────────────────────────────────────────────────

let _seq = 0;
function uid(): string {
  return `exp-${Date.now()}-${++_seq}`;
}

function today(): string {
  return format(new Date(), 'dd/MM/yyyy');
}

function liveChannelCount(client: Client): number {
  return Object.values(client.channelStatus).filter(s => s === 'live').length;
}

function liveChannelNames(client: Client): string[] {
  return Object.entries(client.channelStatus)
    .filter(([, s]) => s === 'live')
    .map(([k]) => k.toUpperCase());
}

// ── 1. Account Health Trend ───────────────────────────────────────────────────

function deriveHealthTrend(client: Client): AccountHealthTrend {
  const score = Math.max(0, 100 - (client.churnRiskScore ?? 0));
  const live = liveChannelCount(client);
  const contactDays = client.daysSinceContact ?? 0;

  let trend: HealthTrendDirection;
  if (client.healthStatus === 'red') {
    trend = score < 20 ? 'critical' : 'declining';
  } else if (client.healthStatus === 'amber') {
    trend = 'declining';
  } else if (live >= 3 && contactDays < 14) {
    trend = 'improving';
  } else {
    trend = 'stable';
  }

  const deliveryScore =
    client.deliveryStatus === 'active' ? 80
    : client.deliveryStatus === 'complete' ? 95
    : client.deliveryStatus === 'blocked' ? 15
    : 40;

  const engagementScore =
    contactDays === 0 ? 90
    : contactDays < 7 ? 90
    : contactDays < 14 ? 75
    : contactDays < 30 ? 50
    : contactDays < 60 ? 25
    : 10;

  const totalChannels = Object.keys(client.channelStatus).length || 4;
  const moduleAdoptionScore = Math.round((live / totalChannels) * 100);

  const summaries: Record<HealthTrendDirection, string> = {
    improving: 'Account momentum is building well across multiple channels.',
    stable: 'Account is steady. There is room to expand scope and grow MRR.',
    declining: 'Account needs attention to prevent churn.',
    critical: 'Account at critical risk — immediate intervention required.',
  };

  return {
    clientId: client.id,
    clientName: client.businessName,
    overallScore: score,
    trend,
    dimensions: {
      delivery: deliveryScore,
      engagement: engagementScore,
      momentum: score,
      moduleAdoption: moduleAdoptionScore,
    },
    summary: summaries[trend],
    lastUpdated: today(),
  };
}

// ── 2. Growth Signals ─────────────────────────────────────────────────────────

function deriveGrowthSignals(client: Client): AccountGrowthSignal[] {
  const signals: AccountGrowthSignal[] = [];
  const now = today();
  const scope = client.activationPlan?.selectedScope ?? [];

  // Module gap — website live, no SEO
  if (
    client.channelStatus.website === 'live' &&
    client.channelStatus.seo !== 'live' &&
    !scope.includes('seo')
  ) {
    signals.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      signalType: 'module_gap',
      title: 'Website live — SEO not activated',
      description: 'Client has a live website but no active SEO workstream, leaving organic search revenue unrealised.',
      evidence: ['Website channel: live', 'SEO channel: not started or in progress'],
      detectedAt: now, confidence: 'high',
    });
  }

  // Module gap — website live, no GBP
  if (
    client.channelStatus.website === 'live' &&
    client.channelStatus.gbp !== 'live' &&
    !scope.includes('gbp')
  ) {
    signals.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      signalType: 'module_gap',
      title: 'Website live — GBP not active',
      description: 'Client has a live website but Google Business Profile is unmanaged, losing local search and Maps visibility.',
      evidence: ['Website channel: live', 'GBP channel: not started'],
      detectedAt: now, confidence: 'high',
    });
  }

  // Module gap — no paid ads, delivery active
  if (
    client.channelStatus.ppc !== 'live' &&
    client.deliveryStatus === 'active' &&
    !scope.includes('ads')
  ) {
    signals.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      signalType: 'module_gap',
      title: 'Active client — no paid search channel',
      description: 'Client receives active delivery across organic channels but has no immediate-demand paid channel running.',
      evidence: ['Delivery status: active', 'PPC channel: not started'],
      detectedAt: now, confidence: 'medium',
    });
  }

  // Autopilot eligible
  const live = liveChannelCount(client);
  if (live >= 2 && client.automationMode !== 'autonomous' && client.deliveryStatus === 'active') {
    signals.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      signalType: 'autopilot_eligible',
      title: 'Eligible for Autopilot mode',
      description: `${live} channels live with active delivery. Autopilot would provide continuous, unsupervised optimisation.`,
      evidence: [`${live} channels live`, `Current mode: ${client.automationMode ?? 'assisted'}`],
      detectedAt: now, confidence: 'medium',
    });
  }

  // Delivery blocked — approval stall
  if (client.deliveryStatus === 'blocked') {
    signals.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      signalType: 'approval_blocked',
      title: 'Delivery blocked — outstanding approval',
      description: 'A workstream is stalled on client approval. Prolonged stalls erode satisfaction and create churn risk.',
      evidence: ['Delivery status: blocked'],
      detectedAt: now, confidence: 'high',
    });
  }

  // Churn indicator — red health
  if (client.healthStatus === 'red') {
    signals.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      signalType: 'churn_indicator',
      title: 'Red health status — churn risk elevated',
      description: `Health score is critical. Churn risk: ${client.churnRiskScore}%.`,
      evidence: [
        'Health status: red',
        `Churn risk score: ${client.churnRiskScore}`,
        ...client.healthReasons.slice(0, 2),
      ],
      detectedAt: now, confidence: 'high',
    });
  }

  // Long silence
  const contactDays = client.daysSinceContact ?? 0;
  if (contactDays > 30) {
    signals.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      signalType: 'delivery_stall',
      title: `No contact for ${contactDays} days`,
      description: 'Extended silence often precedes churn. The client may feel forgotten or question the value they receive.',
      evidence: [`${contactDays} days since last contact`],
      detectedAt: now, confidence: contactDays > 60 ? 'high' : 'medium',
    });
  }

  // Referral ready — green health + active/complete delivery
  if (
    client.healthStatus === 'green' &&
    (client.deliveryStatus === 'active' || client.deliveryStatus === 'complete')
  ) {
    signals.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      signalType: 'referral_ready',
      title: 'Strong account — referral window open',
      description: 'Account is healthy and delivery is progressing. This client is a prime referral candidate.',
      evidence: ['Health status: green', `Delivery status: ${client.deliveryStatus}`],
      detectedAt: now, confidence: 'high',
    });
  }

  // Scope expansion — system upsell flag
  if (client.upsellReadiness === 'ready' || client.upsellReadiness === 'hot') {
    signals.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      signalType: 'scope_expansion_ready',
      title: `Upsell readiness: ${client.upsellReadiness}`,
      description: 'Portfolio intelligence has flagged this account as ready or hot for scope expansion.',
      evidence: [`Upsell readiness: ${client.upsellReadiness}`],
      detectedAt: now,
      confidence: client.upsellReadiness === 'hot' ? 'high' : 'medium',
    });
  }

  return signals;
}

// ── 3. Expansion Opportunities (Upsell / Cross-sell) ─────────────────────────

function deriveExpansionOpportunities(client: Client): ExpansionOpportunity[] {
  const opps: ExpansionOpportunity[] = [];
  const scope = client.activationPlan?.selectedScope ?? [];
  const websiteLive = client.channelStatus.website === 'live';
  const seoLive = client.channelStatus.seo === 'live';
  const gbpLive = client.channelStatus.gbp === 'live';
  const live = liveChannelCount(client);

  // SEO upsell — website live, no SEO
  if (websiteLive && !seoLive && !scope.includes('seo')) {
    opps.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      type: 'add_seo',
      title: 'Add SEO to capture organic demand',
      why: 'Website is live and receiving traffic, but without SEO the client is invisible in search results.',
      expectedOutcome: 'Improved keyword rankings, increased organic traffic, and lower cost-per-lead over time.',
      confidence: 'high',
      conversationAngle: '"Your website is live and generating awareness — but without SEO, you\'re invisible in search. Let\'s capture the demand that already exists for your services."',
      evidence: ['Website channel: live', 'SEO channel: not started', 'Organic gap identified'],
      priority: 'high',
      estimatedImpact: 'High — SEO compounds over time and reduces paid traffic dependency',
    });
  }

  // GBP upsell — website live, no GBP
  if (websiteLive && !gbpLive && !scope.includes('gbp')) {
    opps.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      type: 'add_gbp',
      title: 'Activate Google Business Profile management',
      why: 'Client has a website but no managed GBP, missing local Maps visibility and review management.',
      expectedOutcome: 'Stronger local presence, more call/direction conversions, and improved review scores.',
      confidence: 'high',
      conversationAngle: '"Most customers find businesses on Google Maps before they visit a website. Let\'s make sure you show up and look great."',
      evidence: ['Website channel: live', 'GBP channel: not started'],
      priority: 'high',
      estimatedImpact: 'High — GBP drives calls, directions, and trust signals immediately',
    });
  }

  // SEO + website both live → local SEO pages upsell
  if (websiteLive && seoLive && client.channelStatus.gbp !== 'live') {
    opps.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      type: 'add_local_seo',
      title: 'Add Local SEO pages to dominate service areas',
      why: 'Website and SEO are live. Adding location-specific landing pages will extend ranking reach to more suburbs and service areas.',
      expectedOutcome: 'Broader geographic coverage, more long-tail rankings, more qualified leads from surrounding areas.',
      confidence: 'medium',
      conversationAngle: '"You\'re ranking well in your primary area — let\'s extend that to the surrounding suburbs where your competitors aren\'t as strong."',
      evidence: ['Website channel: live', 'SEO channel: live'],
      priority: 'medium',
      estimatedImpact: 'Medium — expands geographic reach without rebuilding the site',
    });
  }

  // Ads upsell — active delivery, no paid
  if (!scope.includes('ads') && client.channelStatus.ppc !== 'live' && client.deliveryStatus === 'active') {
    opps.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      type: 'add_ads',
      title: 'Add Google Ads for immediate demand generation',
      why: 'Organic channels are building momentum, but paid search generates leads immediately while organic grows.',
      expectedOutcome: 'Immediate top-of-search visibility, faster pipeline fill, and measurable short-term ROI.',
      confidence: 'medium',
      conversationAngle: '"While your SEO builds, ads can fill the pipeline now. It\'s the fastest way to generate leads while your organic presence grows."',
      evidence: ['Delivery status: active', 'PPC channel: not started'],
      priority: 'medium',
      estimatedImpact: 'Medium-High — immediate traffic but requires committed budget',
    });
  }

  // Autopilot upsell — multiple live channels
  if (live >= 2 && client.automationMode !== 'autonomous') {
    opps.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      type: 'add_autopilot',
      title: 'Enable Autopilot for continuous optimisation',
      why: `${live} live channels means there is constant optimisation work to do. Autopilot handles it without manual intervention.`,
      expectedOutcome: 'Ongoing performance improvements, faster optimisation cycles, and less management overhead.',
      confidence: 'medium',
      conversationAngle: '"You have multiple channels running well. Autopilot means we\'re always optimising — not just when we check in."',
      evidence: [`${live} channels live`, `Current automation: ${client.automationMode ?? 'assisted'}`],
      priority: live >= 3 ? 'high' : 'medium',
      estimatedImpact: 'Medium — compounds over time as automation improves performance',
    });
  }

  // Hot account — open scope expansion
  if (client.upsellReadiness === 'hot') {
    opps.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      type: 'expand_scope',
      title: 'Expand scope — account is hot for growth',
      why: 'Account data signals strong satisfaction, active engagement, and growth appetite.',
      expectedOutcome: 'Increased MRR and deeper, stickier service integration.',
      confidence: 'high',
      conversationAngle: '"Things are going well and there\'s a clear opportunity to do more. Let\'s talk about what the next step looks like."',
      evidence: ['Upsell readiness: hot'],
      priority: 'urgent',
      estimatedImpact: 'High — hot accounts have the highest expansion conversion rate',
    });
  }

  return opps;
}

// ── 4. Churn Risk Detection ───────────────────────────────────────────────────

function deriveChurnRisks(client: Client): ChurnRiskSignal[] {
  const risks: ChurnRiskSignal[] = [];
  const now = today();
  const contactDays = client.daysSinceContact ?? 0;

  // Critical — red health + very high churn score
  if (client.healthStatus === 'red' && client.churnRiskScore > 70) {
    risks.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      severity: 'critical' as ChurnSeverity,
      title: 'Critical churn risk — immediate action required',
      likelyCause: client.healthReasons[0] ?? 'Multiple compounding health factors detected.',
      indicators: [
        `Churn risk score: ${client.churnRiskScore}%`,
        'Health status: red',
        ...client.healthReasons.slice(0, 2),
      ],
      suggestedIntervention: 'Book an urgent account review call. Identify the primary friction point and escalate to the service team. Arrive with a concrete win or recovery plan.',
      owner: client.ownerId,
      detectedAt: now,
      urgency: 'immediate',
    });
  }

  // High — amber health + delivery blocked
  if (client.healthStatus === 'amber' && client.deliveryStatus === 'blocked') {
    risks.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      severity: 'high' as ChurnSeverity,
      title: 'Stalled delivery — engagement at risk',
      likelyCause: 'Delivery is blocked, likely due to an outstanding client approval or missing asset.',
      indicators: [
        'Delivery status: blocked',
        `Health status: ${client.healthStatus}`,
        `Churn risk score: ${client.churnRiskScore}%`,
      ],
      suggestedIntervention: 'Contact the client to diagnose the blocker. Simplify what you need from them. Offer to handle as much as possible on their behalf.',
      owner: client.ownerId,
      detectedAt: now,
      urgency: 'this_week',
    });
  }

  // High or Medium — extended silence
  if (contactDays > 30 && client.healthStatus !== 'red') {
    const severity: ChurnSeverity = contactDays > 60 ? 'high' : 'medium';
    risks.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      severity,
      title: `No contact for ${contactDays} days`,
      likelyCause: 'Extended silence often precedes churn. The client may feel overlooked or question the value they are receiving.',
      indicators: [`${contactDays} days since last contact`, 'No engagement events recorded recently'],
      suggestedIntervention: 'Send a personalised update with a recent win or data point. Schedule a check-in call. Use the portal to surface visible progress before calling.',
      owner: client.ownerId,
      detectedAt: now,
      urgency: contactDays > 60 ? 'this_week' : 'this_month',
    });
  }

  // Low — amber health, not blocked, not silent
  if (
    client.healthStatus === 'amber' &&
    client.deliveryStatus !== 'blocked' &&
    contactDays <= 30
  ) {
    risks.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      severity: 'low' as ChurnSeverity,
      title: 'Amber health — monitor and act proactively',
      likelyCause: client.healthReasons[0] ?? 'Health score is declining from baseline.',
      indicators: [`Health status: amber`, `Churn risk: ${client.churnRiskScore}%`],
      suggestedIntervention: 'Share a proactive progress update and confirm key deliverables are on track. Acknowledge any outstanding concerns before they escalate.',
      owner: client.ownerId,
      detectedAt: now,
      urgency: 'this_month',
    });
  }

  return risks;
}

// ── 5. Referral Timing ────────────────────────────────────────────────────────

function deriveReferralOpportunity(client: Client): ReferralOpportunity | undefined {
  if (client.healthStatus === 'red') return undefined;
  if (client.deliveryStatus !== 'active' && client.deliveryStatus !== 'complete') return undefined;

  const triggers: string[] = [];
  let score = 0;

  if (client.healthStatus === 'green') { triggers.push('Green health status'); score += 30; }
  if (client.healthStatus === 'amber') { triggers.push('Amber health — some tension but serviceable'); score += 10; }
  if (client.deliveryStatus === 'active') { triggers.push('Active delivery in progress'); score += 20; }
  if (client.deliveryStatus === 'complete') { triggers.push('Delivery milestone achieved'); score += 30; }

  const contactDays = client.daysSinceContact ?? 99;
  if (contactDays < 14) { triggers.push('Recent contact — relationship is warm'); score += 20; }
  if (contactDays < 30) { triggers.push('Contact within 30 days'); score += 10; }

  const live = liveChannelCount(client);
  if (live >= 2) { triggers.push(`${live} live channels — visible wins to reference`); score += 15; }
  if (client.churnRiskScore < 20) { triggers.push('Very low churn risk — highly satisfied account'); score += 15; }
  if (client.upsellReadiness === 'hot' || client.upsellReadiness === 'ready') {
    triggers.push('Account flagged as expansion-ready'); score += 10;
  }

  score = Math.min(100, score);
  if (score < 35) return undefined;

  const askStyle: 'direct' | 'soft' | 'passive' =
    score >= 70 ? 'direct' : score >= 50 ? 'soft' : 'passive';

  const angles: Record<string, string> = {
    direct: '"We\'ve been getting great results together. Do you know any other business owners we could help in the same way?"',
    soft: '"If you ever come across someone who could benefit from what we do, we\'d love an introduction."',
    passive: '"We\'re proud of what we\'ve built together. If it ever comes up, please feel free to pass on our name."',
  };

  return {
    id: uid(),
    clientId: client.id,
    clientName: client.businessName,
    readinessScore: score,
    triggers,
    suggestedTiming: score >= 70 ? 'Now — raise at next check-in call' : 'After next milestone delivery',
    conversationAngle: angles[askStyle],
    askStyle,
    confidence: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low',
  };
}

// ── 6. Next Best Account Actions ──────────────────────────────────────────────

function deriveNextBestActions(
  client: Client,
  opportunities: ExpansionOpportunity[],
  churnRisks: ChurnRiskSignal[],
  referral?: ReferralOpportunity,
): ExpansionNextBestAction[] {
  const actions: ExpansionNextBestAction[] = [];

  // Critical churn: escalate immediately
  const criticalRisk = churnRisks.find(r => r.severity === 'critical');
  if (criticalRisk) {
    actions.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      actionType: 'escalate_churn_risk',
      title: 'Escalate churn risk — call today',
      whatToSay: '"I wanted to check in personally — I have noticed a few things I want to make sure we address for you right away."',
      assetToReference: 'Account health summary',
      proofPoint: `Churn risk score: ${client.churnRiskScore}%`,
      nextMove: criticalRisk.suggestedIntervention,
      urgency: 'today',
      linkedRiskId: criticalRisk.id,
    });
  }

  // Delivery blocked: unblock approval
  if (client.deliveryStatus === 'blocked') {
    actions.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      actionType: 'unblock_approval',
      title: 'Chase outstanding approval to unblock delivery',
      whatToSay: '"We are ready to move forward — we just need your sign-off to keep things on track for you."',
      assetToReference: 'Workstream approval request',
      nextMove: 'Send a direct message or call requesting the specific approval. Offer to walk through it with them in 10 minutes.',
      urgency: 'today',
    });
  }

  // Top upsell opportunity
  const topOpp =
    opportunities.find(o => o.priority === 'urgent') ??
    opportunities.find(o => o.priority === 'high') ??
    opportunities[0];
  if (topOpp) {
    actions.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      actionType: 'present_upsell',
      title: `Present: ${topOpp.title}`,
      whatToSay: topOpp.conversationAngle,
      assetToReference: `${EXPANSION_ACTION_ASSET_MAP[topOpp.type] ?? 'Capability brief'}`,
      proofPoint: topOpp.estimatedImpact,
      nextMove: 'Book a focused 20-minute expansion call. Bring one concrete example from a similar client to anchor the conversation.',
      urgency: topOpp.priority === 'urgent' ? 'this_week' : 'this_month',
      linkedOpportunityId: topOpp.id,
    });
  }

  // Referral ask — if readiness is sufficient
  if (referral && referral.readinessScore >= 55) {
    actions.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      actionType: 'request_referral',
      title: 'Ask for a referral at next contact',
      whatToSay: referral.conversationAngle,
      proofPoint: `Referral readiness: ${referral.readinessScore}/100`,
      nextMove: `Raise at next check-in. Timing: ${referral.suggestedTiming}.`,
      urgency: referral.confidence === 'high' ? 'this_week' : 'this_month',
    });
  }

  // Long silence — schedule a review
  const contactDays = client.daysSinceContact ?? 0;
  if (contactDays > 21 && !criticalRisk) {
    actions.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      actionType: 'schedule_review',
      title: 'Schedule an account review',
      whatToSay: '"I\'d love to set aside 20 minutes to walk through what we\'ve been working on and align on what\'s coming up."',
      assetToReference: 'Delivery summary / performance report',
      nextMove: 'Send a calendar invite with a brief agenda. Come prepared with one visible win or recent data point.',
      urgency: 'this_week',
    });
  }

  return actions;
}

const EXPANSION_ACTION_ASSET_MAP: Partial<Record<string, string>> = {
  add_seo: 'SEO capability overview',
  add_gbp: 'GBP management brief',
  add_ads: 'Google Ads proposal template',
  add_autopilot: 'Autopilot overview deck',
  add_local_seo: 'Local SEO page examples',
  expand_scope: 'Full-service growth roadmap',
};

// ── 7. Expansion Plays ────────────────────────────────────────────────────────

function deriveExpansionPlays(
  client: Client,
  opportunities: ExpansionOpportunity[],
  churnRisks: ChurnRiskSignal[],
): ExpansionPlay[] {
  const plays: ExpansionPlay[] = [];

  if (opportunities.some(o => o.type === 'add_seo' || o.type === 'add_gbp' || o.type === 'add_local_seo')) {
    plays.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      playType: 'module_expansion',
      title: 'Local visibility expansion play',
      steps: [
        'Present a one-page visibility gap analysis at the next check-in',
        'Show a competitor comparison for target search terms',
        'Propose the relevant bundle (SEO, GBP, or Local SEO) with 90-day outcome milestones',
        'Agree a start date and first milestone commitment',
      ],
      expectedOutcome: 'Client adds one or more visibility modules, expanding MRR and long-term ROI',
      timeframe: '30–60 days to close',
      confidence: 'high',
    });
  }

  if (opportunities.some(o => o.type === 'add_autopilot')) {
    plays.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      playType: 'module_expansion',
      title: 'Autopilot upgrade play',
      steps: [
        'Show a summary of manual optimisation cycles completed in the last 90 days',
        'Demonstrate Autopilot\'s equivalent throughput and response speed',
        'Propose an Autopilot trial for one channel — low commitment, high proof',
        'After 30 days, present results and upsell full Autopilot scope',
      ],
      expectedOutcome: 'Client moves to autonomous mode, reducing churn risk and locking in deeper engagement',
      timeframe: '30–90 days',
      confidence: 'medium',
    });
  }

  if (churnRisks.some(r => r.severity === 'critical' || r.severity === 'high')) {
    plays.push({
      id: uid(), clientId: client.id, clientName: client.businessName,
      playType: 'retention_play',
      title: 'Account retention play',
      steps: [
        'Send a personalised win summary within 48 hours of detection',
        'Book a face-to-face or video review — listen first, no agenda',
        'Identify the #1 friction point and commit to resolving it by a specific date',
        'Follow up in writing with what was discussed and agreed',
        'Check in again in 14 days to confirm resolution',
      ],
      expectedOutcome: 'Restored trust, re-activated engagement, churn risk reduced by at least one severity level',
      timeframe: '2–4 weeks',
      confidence: 'medium',
    });
  }

  return plays;
}

// ── 8. Growth Trigger Events ──────────────────────────────────────────────────

function deriveTriggerEvents(client: Client, signals: AccountGrowthSignal[]): GrowthTriggerEvent[] {
  return signals.map(signal => ({
    id: uid(),
    clientId: client.id,
    clientName: client.businessName,
    triggeredAt: signal.detectedAt,
    triggerType: signal.signalType,
    description: signal.description,
    dataPoints: signal.evidence.reduce<Record<string, string>>((acc, e, i) => {
      acc[`evidence_${i + 1}`] = e;
      return acc;
    }, {}),
    resultedIn: [`Signal raised: ${signal.title}`],
  }));
}

// ── 9. Client-Safe Growth Moments ─────────────────────────────────────────────

function deriveClientSafeMoments(client: Client): ClientSafeGrowthMoment[] {
  const moments: ClientSafeGrowthMoment[] = [];
  const live = liveChannelNames(client);

  if (live.length >= 2 && client.healthStatus === 'green') {
    moments.push({
      id: uid(),
      clientId: client.id,
      clientName: client.businessName,
      title: 'Multiple channels live',
      headline: `Your ${live.length} digital channels are active and building presence`,
      body: `Your ${live.join(' and ')} channels are live. This multi-channel presence gives you a measurable edge over competitors who rely on a single touchpoint.`,
      cta: 'View your performance overview',
      readyToSurface: true,
      surfaceCondition: 'health_green_and_multi_channel_live',
      tone: 'celebratory',
    });
  }

  if (client.deliveryStatus === 'complete') {
    moments.push({
      id: uid(),
      clientId: client.id,
      clientName: client.businessName,
      title: 'Delivery milestone reached',
      headline: 'A key delivery milestone has been completed',
      body: 'Your project has hit a completion milestone. Your digital presence is measurably stronger than when we started.',
      cta: 'See what has been delivered',
      readyToSurface: true,
      surfaceCondition: 'delivery_complete',
      tone: 'celebratory',
    });
  }

  return moments;
}

// ── Per-Client Derivation ─────────────────────────────────────────────────────

function deriveClientExpansionState(client: Client): ClientExpansionState {
  const healthTrend = deriveHealthTrend(client);
  const growthSignals = deriveGrowthSignals(client);
  const opportunities = deriveExpansionOpportunities(client);
  const churnRisks = deriveChurnRisks(client);
  const referralOpportunity = deriveReferralOpportunity(client);
  const nextBestActions = deriveNextBestActions(client, opportunities, churnRisks, referralOpportunity);
  const expansionPlays = deriveExpansionPlays(client, opportunities, churnRisks);
  const triggerEvents = deriveTriggerEvents(client, growthSignals);
  const clientSafeMoments = deriveClientSafeMoments(client);

  return {
    clientId: client.id,
    clientName: client.businessName,
    healthTrend,
    growthSignals,
    opportunities,
    churnRisks,
    referralOpportunity,
    nextBestActions,
    expansionPlays,
    triggerEvents,
    clientSafeMoments,
  };
}

// ── Portfolio-Level Derivation ────────────────────────────────────────────────

export function deriveExpansionState(clients: Client[]): ExpansionState {
  _seq = 0;
  const active = clients.filter(c => !c.archived);
  const clientStates = active.map(deriveClientExpansionState);

  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

  const topOpportunities = clientStates
    .flatMap(cs => cs.opportunities)
    .sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3))
    .slice(0, 12);

  const activeChurnRisks = clientStates
    .flatMap(cs => cs.churnRisks)
    .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  const referralReadyClients = clientStates
    .filter(cs => cs.referralOpportunity)
    .map(cs => cs.referralOpportunity!)
    .sort((a, b) => b.readinessScore - a.readinessScore);

  const urgentActions = clientStates
    .flatMap(cs => cs.nextBestActions)
    .filter(a => a.urgency === 'today' || a.urgency === 'this_week')
    .slice(0, 20);

  const scores = clientStates.map(cs => cs.healthTrend.overallScore);
  const portfolioHealthScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 100;

  return {
    clients: clientStates,
    topOpportunities,
    activeChurnRisks,
    referralReadyClients,
    urgentActions,
    portfolioHealthScore,
    totalOpportunityCount: clientStates.reduce((sum, cs) => sum + cs.opportunities.length, 0),
    generatedAt: format(new Date(), 'dd/MM/yyyy HH:mm'),
  };
}

// ── Inspection Support ────────────────────────────────────────────────────────

export function deriveSignalInspections(state: ExpansionState): ExpansionSignalInspection[] {
  const inspections: ExpansionSignalInspection[] = [];

  for (const cs of state.clients) {
    for (const signal of cs.growthSignals) {
      const relatedOpp = cs.opportunities.find(o =>
        o.type.includes(signal.signalType.replace('module_gap', 'add')) ||
        (signal.signalType === 'autopilot_eligible' && o.type === 'add_autopilot') ||
        (signal.signalType === 'scope_expansion_ready' && o.type === 'expand_scope')
      );
      const relatedRisk = signal.signalType === 'churn_indicator'
        ? cs.churnRisks[0]
        : undefined;

      inspections.push({
        signalId: signal.id,
        clientId: cs.clientId,
        clientName: cs.clientName,
        signalType: signal.signalType,
        why: signal.description,
        supportingData: signal.evidence.reduce<Record<string, string>>((acc, e, i) => {
          acc[`evidence_${i + 1}`] = e;
          return acc;
        }, {}),
        recommendationGenerated:
          relatedOpp?.title ?? relatedRisk?.title ?? 'Signal captured — monitoring',
        detectedAt: signal.detectedAt,
      });
    }
  }

  return inspections;
}
