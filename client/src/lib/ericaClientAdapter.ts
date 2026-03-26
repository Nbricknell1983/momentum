// =============================================================================
// ERICA CALLING SYSTEM — CLIENT INTELLIGENCE ADAPTER
// =============================================================================
// Extracts and normalises existing client account intelligence into the
// EricaClientIntelligenceSnapshot that Erica needs before account calls.
// Required for: nurture, expansion, referral, churn intervention flows.
// =============================================================================

import type { EricaClientIntelligenceSnapshot } from './ericaTypes';

type ClientRecord = Record<string, any>;

export function extractClientSnapshot(client: ClientRecord): EricaClientIntelligenceSnapshot {
  const businessName = client.businessName ?? client.name ?? client.companyName ?? '';
  const contactName  = client.contactName ?? client.primaryContact ?? undefined;
  const phone        = client.phone ?? client.contactPhone ?? client.mobile ?? undefined;

  // Active modules / services
  const activeModules: string[] = [];
  if (Array.isArray(client.activeModules)) activeModules.push(...client.activeModules);
  if (Array.isArray(client.services))      activeModules.push(...client.services);
  if (typeof client.scope === 'object' && client.scope) {
    Object.entries(client.scope).forEach(([k, v]) => { if (v) activeModules.push(k); });
  }

  // Milestones / wins
  const milestones: string[] = [];
  if (Array.isArray(client.milestones)) milestones.push(...client.milestones);
  if (client.recentWin) milestones.push(client.recentWin);
  if (client.websiteLaunchedAt) milestones.push('Website launched');
  if (client.rankingImprovedAt) milestones.push('Rankings improving');

  // Known frustrations / complaints
  const knownFrustrations: string[] = [];
  if (Array.isArray(client.frustrations)) knownFrustrations.push(...client.frustrations);
  if (Array.isArray(client.complaints)) knownFrustrations.push(...client.complaints);
  if (client.churnReason) knownFrustrations.push(client.churnReason);

  // Expansion opportunities
  const expansionOpportunities: string[] = [];
  if (Array.isArray(client.expansionOpportunities)) expansionOpportunities.push(...client.expansionOpportunities);
  if (client.upsellSignal) expansionOpportunities.push(client.upsellSignal);

  // Churn signals
  const churnSignals: string[] = [];
  if (Array.isArray(client.churnSignals)) churnSignals.push(...client.churnSignals);
  if (client.churnRisk && client.churnRisk !== 'none') churnSignals.push(`Churn risk: ${client.churnRisk}`);
  if (client.engagementDrop) churnSignals.push('Engagement has dropped');

  // Prior outcomes
  const priorOutcomes: string[] = [];
  if (Array.isArray(client.priorOutcomes)) priorOutcomes.push(...client.priorOutcomes);
  if (client.lastReviewOutcome) priorOutcomes.push(client.lastReviewOutcome);

  // Relationship strength
  let relationshipStrength: EricaClientIntelligenceSnapshot['relationshipStrength'] = 'neutral';
  const health = (client.healthStatus ?? '').toLowerCase();
  if (health === 'green' || health === 'healthy') relationshipStrength = 'strong';
  if (health === 'red' || health === 'critical') relationshipStrength = 'at_risk';

  // Engagement level
  let engagementLevel: EricaClientIntelligenceSnapshot['engagementLevel'] = 'unknown';
  if (client.engagementLevel) {
    const e = client.engagementLevel.toLowerCase();
    if (e === 'high') engagementLevel = 'high';
    else if (e === 'medium') engagementLevel = 'medium';
    else if (e === 'low') engagementLevel = 'low';
  } else if (health === 'green') {
    engagementLevel = 'high';
  } else if (health === 'red') {
    engagementLevel = 'low';
  }

  // Account value
  const accountValue = client.contractValue ?? client.mrr ?? client.accountValue
    ? `$${(client.contractValue ?? client.mrr ?? client.accountValue).toLocaleString()}`
    : undefined;

  return {
    clientId:              client.id ?? client.clientId ?? '',
    businessName,
    contactName,
    phone,
    accountState:          client.status ?? client.accountState ?? 'active',
    healthStatus:          client.healthStatus ?? 'unknown',
    activeModules:         activeModules.length > 0 ? [...new Set(activeModules)] : [],
    deliveryHistory:       client.deliverySummary ?? client.deliveryHistory ?? undefined,
    priorOutcomes:         priorOutcomes.length > 0 ? priorOutcomes : undefined,
    engagementLevel,
    communicationHistory:  client.communicationSummary ?? undefined,
    milestones:            milestones.length > 0 ? milestones : undefined,
    knownFrustrations:     knownFrustrations.length > 0 ? knownFrustrations : undefined,
    expansionOpportunities: expansionOpportunities.length > 0 ? expansionOpportunities : undefined,
    churnSignals:          churnSignals.length > 0 ? churnSignals : undefined,
    relationshipStrength,
    lastNPS:               client.lastNPS ?? client.npsScore ?? undefined,
    accountValue,
  };
}

// Build a human-readable client summary for the Vapi context packet
export function buildClientSummary(snap: EricaClientIntelligenceSnapshot): string {
  const parts: string[] = [];

  if (snap.businessName)          parts.push(snap.businessName);
  if (snap.healthStatus)          parts.push(`Health: ${snap.healthStatus}`);
  if (snap.activeModules.length)  parts.push(`Active: ${snap.activeModules.join(', ')}`);
  if (snap.milestones?.length)    parts.push(`Recent win: ${snap.milestones[0]}`);
  if (snap.knownFrustrations?.length) parts.push(`Concern: ${snap.knownFrustrations[0]}`);
  if (snap.expansionOpportunities?.length) parts.push(`Opportunity: ${snap.expansionOpportunities[0]}`);
  if (snap.churnSignals?.length)  parts.push(`⚠ ${snap.churnSignals[0]}`);
  if (snap.accountValue)          parts.push(`Value: ${snap.accountValue}`);

  return parts.join(' | ');
}

// Build "why call now" from client context
export function buildClientWhyCallingNow(
  snap: EricaClientIntelligenceSnapshot,
  intent: string,
): string {
  if (intent === 'churn_intervention') {
    return snap.churnSignals?.length
      ? `Churn risk detected: ${snap.churnSignals.join(', ')} — intervention call to understand and address`
      : 'Client health has deteriorated — proactive check-in call';
  }
  if (intent === 'referral_ask') {
    return snap.milestones?.length
      ? `Referral timing is right — client just achieved: ${snap.milestones[0]}`
      : 'Client relationship is strong — referral ask timing confirmed';
  }
  if (intent === 'upsell') {
    return snap.expansionOpportunities?.length
      ? `Growth signal detected: ${snap.expansionOpportunities[0]} — booking a growth review call`
      : 'Expansion opportunity identified — positioning growth review';
  }
  return snap.milestones?.length
    ? `Nurture call — referencing recent win: ${snap.milestones[0]}`
    : 'Scheduled nurture/review call to maintain relationship and deliver value';
}
