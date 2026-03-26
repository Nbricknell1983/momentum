// =============================================================================
// ERICA CALLING SYSTEM — DEAL INTELLIGENCE ADAPTER
// =============================================================================
// Extracts and normalises lead/deal intelligence into the
// EricaDealIntelligenceSnapshot that Erica needs before a call.
// This is a pure derivation — no AI calls, no network requests.
// =============================================================================

import type { EricaDealIntelligenceSnapshot } from './ericaTypes';

// Lead data shape from Redux (matches Momentum lead schema)
type LeadRecord = Record<string, any>;

export function extractDealSnapshot(lead: LeadRecord): EricaDealIntelligenceSnapshot {
  const name         = lead.name ?? lead.contactName ?? '';
  const businessName = lead.businessName ?? lead.companyName ?? lead.business ?? '';
  const phone        = lead.phone ?? lead.mobile ?? lead.contactPhone ?? undefined;

  // Parse opportunity / services
  const servicesDiscussed: string[] = [];
  if (lead.interestedServices) {
    if (Array.isArray(lead.interestedServices)) servicesDiscussed.push(...lead.interestedServices);
    else servicesDiscussed.push(lead.interestedServices);
  }
  if (lead.services) {
    if (Array.isArray(lead.services)) servicesDiscussed.push(...lead.services);
    else servicesDiscussed.push(lead.services);
  }

  // Goals
  const statedGoals: string[] = [];
  if (lead.goals) {
    if (Array.isArray(lead.goals)) statedGoals.push(...lead.goals);
    else statedGoals.push(lead.goals);
  }
  if (lead.objective) statedGoals.push(lead.objective);

  // Blockers
  const knownBlockers: string[] = [];
  if (lead.blockers) {
    if (Array.isArray(lead.blockers)) knownBlockers.push(...lead.blockers);
    else knownBlockers.push(lead.blockers);
  }
  if (lead.objections) {
    if (Array.isArray(lead.objections)) knownBlockers.push(...lead.objections);
    else knownBlockers.push(lead.objections);
  }

  // Urgency
  let urgency: EricaDealIntelligenceSnapshot['urgency'] = 'unknown';
  if (lead.urgency) {
    const u = lead.urgency.toLowerCase();
    if (u === 'high' || u === 'urgent') urgency = 'high';
    else if (u === 'medium' || u === 'moderate') urgency = 'medium';
    else if (u === 'low') urgency = 'low';
  }

  // Last proposal/strategy state
  const lastProposalState = lead.strategyStatus ?? lead.proposalStatus ?? lead.proposalSentAt
    ? `Proposal sent ${lead.proposalSentAt ?? ''}`
    : undefined;

  // Last activity
  const lastActivityAt = lead.lastActivityAt ?? lead.updatedAt ?? lead.lastContact ?? undefined;
  const lastActivityType = lead.lastActivityType ?? lead.lastContactType ?? undefined;

  // Next best action
  const nextBestAction = lead.nextBestAction ?? lead.recommendedAction ?? undefined;

  // Opportunity summary — build from available fields
  const opportunitySummary = lead.opportunitySummary
    ?? lead.notes
    ?? (servicesDiscussed.length > 0 ? `Interested in: ${servicesDiscussed.join(', ')}` : undefined);

  return {
    leadId:           lead.id ?? lead.leadId ?? '',
    name,
    businessName,
    contactName:      name || undefined,
    phone,
    stage:            lead.stage ?? 'unknown',
    source:           lead.source ?? lead.leadSource ?? 'unknown',
    opportunitySummary,
    servicesDiscussed: servicesDiscussed.length > 0 ? servicesDiscussed : undefined,
    pricingContext:    lead.pricingNotes ?? lead.budgetRange ?? lead.investmentRange ?? undefined,
    statedGoals:       statedGoals.length > 0 ? statedGoals : undefined,
    knownBlockers:     knownBlockers.length > 0 ? knownBlockers : undefined,
    lastProposalState,
    lastStrategyDate:  lead.strategyPresentedAt ?? lead.strategyDate ?? undefined,
    lastActivityAt,
    lastActivityType,
    urgency,
    decisionMaker:     lead.decisionMaker ?? lead.decisionMakerName ?? undefined,
    nextBestAction,
    notes:             lead.internalNotes ?? undefined,
  };
}

// Build a human-readable deal summary for the Vapi context packet
export function buildDealSummary(snap: EricaDealIntelligenceSnapshot): string {
  const parts: string[] = [];

  if (snap.businessName) parts.push(`Business: ${snap.businessName}`);
  if (snap.stage)        parts.push(`Stage: ${snap.stage}`);
  if (snap.opportunitySummary) parts.push(snap.opportunitySummary);
  if (snap.servicesDiscussed?.length)
    parts.push(`Services discussed: ${snap.servicesDiscussed.join(', ')}`);
  if (snap.lastProposalState) parts.push(snap.lastProposalState);
  if (snap.knownBlockers?.length)
    parts.push(`Known blockers: ${snap.knownBlockers.join(', ')}`);
  if (snap.urgency && snap.urgency !== 'unknown')
    parts.push(`Urgency: ${snap.urgency}`);
  if (snap.nextBestAction) parts.push(`Next best action: ${snap.nextBestAction}`);

  return parts.join(' | ');
}

// Compute a "why call now" reason from deal intelligence
export function buildWhyCallingNow(snap: EricaDealIntelligenceSnapshot, intent: string): string {
  if (intent === 'proposal_follow_up') {
    const days = snap.lastStrategyDate
      ? Math.round((Date.now() - new Date(snap.lastStrategyDate).getTime()) / 86400000)
      : null;
    return days !== null
      ? `Strategy was presented ${days} days ago — following up to identify blockers and agree next steps`
      : 'Following up on the strategy/proposal — no response received yet';
  }
  if (intent === 'dormant_lead_reactivation') {
    const days = snap.lastActivityAt
      ? Math.round((Date.now() - new Date(snap.lastActivityAt).getTime()) / 86400000)
      : null;
    return days !== null
      ? `No contact in ${days} days — re-engaging with low-pressure value angle`
      : 'Lead has been dormant — re-engagement call';
  }
  if (snap.urgency === 'high') return 'Lead has indicated high urgency — timely follow-up important';
  if (snap.nextBestAction) return snap.nextBestAction;
  return `Progressing ${snap.businessName ?? 'this lead'} through the pipeline`;
}
