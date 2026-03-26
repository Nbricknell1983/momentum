// =============================================================================
// ERICA CALLING SYSTEM — CALL BRIEF GENERATOR
// =============================================================================
// Combines all intelligence (deal, client, context) into a structured
// EricaCallBrief. This is what Momentum sends to Vapi to prepare Erica
// for a specific call. It is structured data — not a raw prompt blob.
//
// The brief is generated before launching a call and stored against the
// batch item in Firestore.
// =============================================================================

import type {
  EricaCallBrief,
  EricaCallBatchItem,
  EricaVapiContextPacket,
  EricaDealIntelligenceSnapshot,
  EricaClientIntelligenceSnapshot,
} from './ericaTypes';
import {
  buildOpeningAngle,
  buildQuestionPlan,
  predictObjections,
  buildCloseStrategy,
} from './ericaCallContext';
import { buildDealSummary, buildWhyCallingNow } from './ericaDealAdapter';
import { buildClientSummary, buildClientWhyCallingNow } from './ericaClientAdapter';

// Browser-compatible UUID generator (avoids Vite's crypto externalization)
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------------------
// Core brief generator
// ---------------------------------------------------------------------------

export function generateCallBrief(params: {
  batchItemId:     string;
  item:            EricaCallBatchItem;
  dealSnap?:       EricaDealIntelligenceSnapshot;
  clientSnap?:     EricaClientIntelligenceSnapshot;
}): EricaCallBrief {
  const { batchItemId, item, dealSnap, clientSnap } = params;
  const { target, context } = item;

  const entityType   = target.entityType;
  const entityId     = target.entityId;
  const entityName   = target.entityName;
  const businessName = target.businessName;
  const contactName  = target.contactName ?? dealSnap?.contactName ?? clientSnap?.contactName;
  const phone        = target.phone ?? dealSnap?.phone ?? clientSnap?.phone;

  // Determine why Erica is calling now
  const whyCallingNow = entityType === 'client' && clientSnap
    ? buildClientWhyCallingNow(clientSnap, context.callIntent)
    : buildWhyCallingNow(dealSnap ?? { leadId: entityId, name: entityName, businessName, stage: 'unknown', source: 'unknown' }, context.callIntent);

  // Generate strategy components
  const openingAngle         = buildOpeningAngle(context, target, dealSnap, clientSnap);
  const questionPlan         = buildQuestionPlan(context, dealSnap, clientSnap);
  const objectionPredictions = predictObjections(context, dealSnap, clientSnap);
  const closeStrategy        = buildCloseStrategy(context, dealSnap);

  // Allowed tools (varies by intent)
  const allowedTools = deriveAllowedTools(context.callIntent);

  // What not to say (aggregate from multiple sources)
  const whatNotToSay = [
    ...closeStrategy.whatNotToSay,
    'Mention competitor names',
    'Make pricing commitments without approval',
    'Promise delivery timelines',
  ];

  // Escalation triggers
  const escalationTriggers = [
    'Prospect becomes aggressive or hostile',
    'Explicit request for a human to call back',
    'Legal or contractual questions raised',
    'Cancellation threat (for existing clients)',
  ];

  // Build deal and client summaries
  const dealSummary   = dealSnap   ? buildDealSummary(dealSnap)     : undefined;
  const clientSummary = clientSnap ? buildClientSummary(clientSnap) : undefined;

  // Build the Vapi context packet
  const vapiContextPacket: EricaVapiContextPacket = {
    callType:     context.callIntent,
    source:       context.callSource,
    relationship: context.relationship,
    tone:         context.callTone,
    objective:    context.primaryObjective,
    entityName,
    businessName,
    contactName,
    openingLine:  openingAngle.openingLine,
    whyCallingNow,
    dealSummary,
    clientSummary,
    keyObjections: objectionPredictions
      .filter(o => o.likelihood === 'high')
      .map(o => `${o.objectionType}: ${o.suggestedFraming}`),
    topQuestions: [
      ...questionPlan.situationQuestions.slice(0, 2),
      ...questionPlan.calibratedQuestions.slice(0, 1),
    ],
    closeApproach: closeStrategy.closeStatement,
    allowedTools,
    whatNotToSay: whatNotToSay.slice(0, 5),
  };

  return {
    briefId:          generateId(),
    batchItemId,
    generatedAt:      new Date().toISOString(),
    entityType,
    entityId,
    entityName,
    businessName,
    contactName,
    phone,
    callIntent:       context.callIntent,
    callSource:       context.callSource,
    relationship:     context.relationship,
    callTone:         context.callTone,
    primaryObjective: context.primaryObjective,
    whyCallingNow,
    dealSnapshot:     dealSnap,
    clientSnapshot:   clientSnap,
    openingAngle,
    questionPlan,
    objectionPredictions,
    closeStrategy,
    allowedTools,
    whatNotToSay,
    escalationTriggers,
    vapiContextPacket,
  };
}

// ---------------------------------------------------------------------------
// Tools allowed per intent
// ---------------------------------------------------------------------------

function deriveAllowedTools(intent: string): string[] {
  const base = ['lookupLead', 'lookupAccount', 'createCallNote', 'logObjection', 'logCallOutcome', 'createCadenceItem'];

  switch (intent) {
    case 'cold_outreach':
    case 'dormant_lead_reactivation':
      return [...base, 'requestCallback', 'scheduleMeetingRequest', 'createDraftFromCallOutcome'];
    case 'discovery_qualification':
    case 'strategy_follow_up':
    case 'proposal_follow_up':
      return [...base, 'requestCallback', 'scheduleMeetingRequest', 'createApprovalRequest', 'createDraftFromCallOutcome'];
    case 'nurture':
    case 'upsell':
      return [...base, 'scheduleMeetingRequest', 'createApprovalRequest', 'createDraftFromCallOutcome'];
    case 'churn_intervention':
      return [...base, 'scheduleMeetingRequest', 'createApprovalRequest', 'createDraftFromCallOutcome'];
    case 'referral_ask':
      return [...base, 'createLead', 'createApprovalRequest'];
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Validate that a batch item can be called
// ---------------------------------------------------------------------------

export interface BriefValidationResult {
  valid:    boolean;
  reasons:  string[];
  warnings: string[];
}

export function validateBatchItem(item: EricaCallBatchItem): BriefValidationResult {
  const reasons:  string[] = [];
  const warnings: string[] = [];

  const phone = item.target.phone ?? item.brief?.phone;

  if (!phone) {
    reasons.push('No phone number — Erica cannot call without a phone number');
  }
  if (!item.target.entityId) {
    reasons.push('No entity ID — cannot link call to a Momentum record');
  }
  if (item.status === 'blocked') {
    reasons.push(item.blockedReason ?? 'Blocked by policy');
  }
  if (!item.context) {
    reasons.push('No call context — source-aware context is required before calling');
  }

  // Warnings (non-blocking)
  if (!item.target.contactName) {
    warnings.push('No contact name — Erica will use business name instead');
  }
  if (item.briefStatus !== 'ready') {
    warnings.push('Call brief not yet generated — generate brief before launching');
  }

  return {
    valid:    reasons.length === 0,
    reasons,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Build the system prompt hint for a Vapi assistant (structured, not raw blob)
// ---------------------------------------------------------------------------

export function buildSystemPromptHint(brief: EricaCallBrief): string {
  const pkt = brief.vapiContextPacket;
  return [
    `You are Erica, a professional voice agent for [Business].`,
    ``,
    `CALL TYPE: ${pkt.callType.replace(/_/g, ' ').toUpperCase()}`,
    `RELATIONSHIP: ${pkt.relationship.replace(/_/g, ' ')}`,
    `OBJECTIVE: ${pkt.objective}`,
    ``,
    `WHO YOU ARE CALLING:`,
    `- Contact: ${pkt.contactName ?? 'Unknown'}`,
    `- Business: ${pkt.businessName}`,
    `- Why now: ${pkt.whyCallingNow}`,
    pkt.dealSummary   ? `- Deal context: ${pkt.dealSummary}` : '',
    pkt.clientSummary ? `- Account context: ${pkt.clientSummary}` : '',
    ``,
    `OPENING LINE (use this or a natural variation):`,
    `"${pkt.openingLine}"`,
    ``,
    `TOP QUESTIONS TO ASK:`,
    pkt.topQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
    ``,
    `LIKELY OBJECTIONS AND HOW TO HANDLE:`,
    pkt.keyObjections.map(o => `- ${o}`).join('\n'),
    ``,
    `CLOSE APPROACH:`,
    pkt.closeApproach,
    ``,
    `WHAT NOT TO SAY:`,
    pkt.whatNotToSay.map(s => `- ${s}`).join('\n'),
    ``,
    `AVAILABLE TOOLS: ${pkt.allowedTools.join(', ')}`,
    ``,
    `CRITICAL RULES:`,
    `- Do not make pricing commitments without creating an approval request`,
    `- Do not commit to delivery timelines`,
    `- If the caller becomes hostile, de-escalate and offer a human callback`,
    `- Log the call outcome using logCallOutcome before ending the call`,
  ].filter(Boolean).join('\n');
}
