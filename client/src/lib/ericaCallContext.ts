// =============================================================================
// ERICA CALLING SYSTEM — SOURCE-AWARE CALL CONTEXT
// =============================================================================
// Derives the call context (intent, tone, framework, objective) from the
// source system that generated the call target.
//
// This is the core logic that determines HOW Erica approaches a call.
// The source determines everything: opening style, framework, objective.
// =============================================================================

import type {
  EricaCallSource,
  EricaCallIntent,
  EricaRelationshipType,
  EricaCallTone,
  EricaCallContext,
  EricaCallTarget,
  EricaObjectionPrediction,
  EricaObjectionType,
  EricaOpeningAngle,
  EricaCloseStrategy,
  EricaQuestionPlan,
  EricaDealIntelligenceSnapshot,
  EricaClientIntelligenceSnapshot,
} from './ericaTypes';

// ---------------------------------------------------------------------------
// Source → Call Context mapping
// ---------------------------------------------------------------------------

export function deriveCallContext(
  source: EricaCallSource,
  target: EricaCallTarget,
  dealSnap?: EricaDealIntelligenceSnapshot,
  clientSnap?: EricaClientIntelligenceSnapshot,
): EricaCallContext {

  switch (source) {

    case 'leads':
      return {
        callSource:       'leads',
        callIntent:       resolveLeadIntent(dealSnap),
        relationship:     'new',
        callTone:         'curious_disarming',
        primaryObjective: 'Book an initial discovery/strategy conversation',
        secondaryObjective: 'Qualify interest and understand current situation',
        callFramework:    'nepq_cold',
      };

    case 'clients':
      return {
        callSource:       'clients',
        callIntent:       'nurture',
        relationship:     'existing_client',
        callTone:         'familiar_value_led',
        primaryObjective: 'Book a review/nurture call and deliver value',
        secondaryObjective: 'Identify growth or satisfaction opportunities',
        callFramework:    'relationship_nurture',
      };

    case 'cadence':
      return {
        callSource:       'cadence',
        callIntent:       resolveLeadIntent(dealSnap),
        relationship:     dealSnap?.stage === 'engaged' || dealSnap?.stage === 'qualified' ? 'known' : 'new',
        callTone:         'strategic_consultative',
        primaryObjective: 'Continue active sales process and agree next step',
        secondaryObjective: 'Identify and resolve blockers',
        callFramework:    'nepq_warm',
      };

    case 'expansion':
      return {
        callSource:       'expansion',
        callIntent:       'upsell',
        relationship:     'existing_client',
        callTone:         'strategic_consultative',
        primaryObjective: 'Explore growth opportunity and book a growth review call',
        secondaryObjective: 'Reference current results to position the expansion',
        callFramework:    'expansion',
      };

    case 'referral':
      return {
        callSource:       'referral',
        callIntent:       'referral_ask',
        relationship:     'existing_client',
        callTone:         'warm_relationship',
        primaryObjective: 'Ask for a warm referral or introduction at the right moment',
        secondaryObjective: 'Confirm satisfaction before the ask',
        callFramework:    'referral',
      };

    case 'churn':
      return {
        callSource:       'churn',
        callIntent:       'churn_intervention',
        relationship:     'existing_client',
        callTone:         'warm_relationship',
        primaryObjective: 'Understand dissatisfaction and agree a resolution path',
        secondaryObjective: 'Retain the account and rebuild confidence',
        callFramework:    'relationship_nurture',
      };

    case 'dormant':
      return {
        callSource:       'dormant',
        callIntent:       'dormant_lead_reactivation',
        relationship:     'lapsed',
        callTone:         'curious_disarming',
        primaryObjective: 'Re-engage a cold lead with a low-pressure value angle',
        secondaryObjective: 'Understand what has changed since last contact',
        callFramework:    'nepq_cold',
      };

    default:
      return {
        callSource:       'manual',
        callIntent:       'cold_outreach',
        relationship:     'new',
        callTone:         'curious_disarming',
        primaryObjective: 'Make contact and qualify interest',
        callFramework:    'nepq_cold',
      };
  }
}

function resolveLeadIntent(snap?: EricaDealIntelligenceSnapshot): EricaCallIntent {
  if (!snap) return 'cold_outreach';
  const stage = snap.stage?.toLowerCase() ?? '';
  if (stage === 'proposal' || stage === 'verbal_commit') return 'proposal_follow_up';
  if (stage === 'discovery' || stage === 'qualified') return 'strategy_follow_up';
  if (stage === 'engaged') return 'discovery_qualification';
  return 'cold_outreach';
}

// ---------------------------------------------------------------------------
// Opening Angle Generator
// ---------------------------------------------------------------------------

export function buildOpeningAngle(
  context: EricaCallContext,
  target: EricaCallTarget,
  dealSnap?: EricaDealIntelligenceSnapshot,
  clientSnap?: EricaClientIntelligenceSnapshot,
): EricaOpeningAngle {

  const name    = target.contactName ?? target.entityName ?? 'there';
  const biz     = target.businessName;

  switch (context.callFramework) {

    case 'nepq_cold':
      return {
        frameworkUsed:  'permission',
        openingLine:    `Hi ${name}, my name is Erica — I'm calling from [Business]. Is now a bad time?`,
        permissionAsk:  'Is now a bad time?',
        curiosityHook:  `I noticed ${biz} and had a quick question — completely up to you whether it's relevant.`,
        disarmingPhrase: 'I\'m not going to pitch you anything today, I just had a quick question.',
      };

    case 'nepq_warm':
      return {
        frameworkUsed:  'reference',
        openingLine:    `Hi ${name}, it's Erica from [Business]. We've been in touch before — I just wanted to check in on where things are at for you.`,
        referencePoint: dealSnap?.lastActivityType ?? 'our last conversation',
        disarmingPhrase: 'I know you\'re probably busy, so I\'ll keep this brief.',
      };

    case 'voss_follow_up': {
      const lastAction = dealSnap?.lastProposalState ?? dealSnap?.lastActivityType ?? 'what we discussed';
      return {
        frameworkUsed:  'voss',
        openingLine:    `Hi ${name}, it's Erica from [Business]. I'm following up on ${lastAction} — I just wanted to see where your head is at.`,
        referencePoint: lastAction,
        disarmingPhrase: 'I\'m not here to pressure you on anything.',
      };
    }

    case 'relationship_nurture': {
      const milestone = clientSnap?.milestones?.[0] ?? 'your progress';
      return {
        frameworkUsed:  'relationship',
        openingLine:    `Hi ${name}, it's Erica from [Business] — just checking in on ${biz}. How are things going?`,
        referencePoint: milestone,
        disarmingPhrase: 'I just wanted to touch base and make sure everything is going well for you.',
      };
    }

    case 'expansion': {
      const result = clientSnap?.milestones?.[0] ?? 'the progress we\'ve made together';
      return {
        frameworkUsed:  'reference',
        openingLine:    `Hi ${name}, it's Erica from [Business]. I was just looking at ${biz}'s account and wanted to reach out — I've noticed ${result} and thought it was worth a quick conversation.`,
        referencePoint: result,
      };
    }

    case 'referral': {
      const win = clientSnap?.milestones?.[0] ?? 'the results we\'ve been getting';
      return {
        frameworkUsed:  'relationship',
        openingLine:    `Hi ${name}, it's Erica from [Business] — just calling to check in. I was actually just looking at ${biz}'s account and noticed ${win}. How have things been going from your end?`,
        referencePoint: win,
      };
    }

    default:
      return {
        frameworkUsed:  'curiosity',
        openingLine:    `Hi ${name}, my name is Erica. Is now a bad time for a really quick question?`,
        permissionAsk:  'Is now a bad time?',
      };
  }
}

// ---------------------------------------------------------------------------
// Question Plan Generator (NEPQ + Voss)
// ---------------------------------------------------------------------------

export function buildQuestionPlan(
  context: EricaCallContext,
  dealSnap?: EricaDealIntelligenceSnapshot,
  clientSnap?: EricaClientIntelligenceSnapshot,
): EricaQuestionPlan {

  const isClient   = context.relationship === 'existing_client';
  const blockers   = dealSnap?.knownBlockers ?? [];
  const goals      = dealSnap?.statedGoals ?? [];
  const frustrations = clientSnap?.knownFrustrations ?? [];
  const expansions  = clientSnap?.expansionOpportunities ?? [];

  return {
    situationQuestions: isClient ? [
      'How are things tracking from your perspective at the moment?',
      'Is the team across everything that\'s been happening?',
      ...expansions.map(e => `I saw an opportunity around ${e} — is that something on your radar?`),
    ] : [
      'Walk me through how you\'re currently finding new clients — is it mostly word of mouth, or do you have other things working for you?',
      'What does your online presence look like at the moment?',
      goals.length > 0 ? `Is ${goals[0]} still a focus for the business this year?` : 'What\'s the main growth priority for the business right now?',
    ],

    problemQuestions: isClient ? [
      ...frustrations.map(f => `I know ${f} has come up before — is that still a challenge?`),
      'Is there anything that hasn\'t been working as well as you\'d hoped?',
    ] : [
      'How\'s that been working out for you — is it consistent?',
      blockers.length > 0 ? `You mentioned ${blockers[0]} before — has that changed?` : 'What\'s the biggest bottleneck when it comes to growing the business?',
    ],

    implicationQuestions: [
      'If that doesn\'t change, where does the business end up in 12 months?',
      'How important is solving this for you right now?',
      'What\'s the cost of leaving that unaddressed?',
    ],

    desiredOutcome: [
      'What would need to be true for you to feel like this was the right move?',
      'If we could show you a clear path to [goal], would that be worth exploring?',
      'Based on what you\'ve described, here\'s what I\'m thinking might be relevant...',
    ],

    calibratedQuestions: [
      'What would it take to make this a priority?',
      'How would you feel about a 20-minute conversation to see if there\'s even a fit?',
      'What would be a fair timeline to make a decision on this?',
      isClient ? 'How are you measuring the success of what we\'re doing together?' : 'What does success look like for you over the next 6 months?',
    ],
  };
}

// ---------------------------------------------------------------------------
// Objection Prediction
// ---------------------------------------------------------------------------

export function predictObjections(
  context: EricaCallContext,
  dealSnap?: EricaDealIntelligenceSnapshot,
  clientSnap?: EricaClientIntelligenceSnapshot,
): EricaObjectionPrediction[] {

  const predictions: EricaObjectionPrediction[] = [];
  const stage  = dealSnap?.stage?.toLowerCase() ?? '';
  const health = clientSnap?.healthStatus?.toLowerCase() ?? '';

  // Price — likely in later stages
  if (['proposal', 'verbal_commit', 'discovery'].includes(stage)) {
    predictions.push({
      objectionType:       'price_too_expensive',
      likelihood:          'high',
      underlyingConcern:   'They\'re not confident the return justifies the investment',
      suggestedFraming:    'Separate the price conversation from the value conversation. "Completely fair — can I ask, is it the number itself, or is it whether you\'ll see the return?"',
      calibratedQuestion:  'What would you need to see to feel confident the investment made sense?',
      vossLabel:           'It sounds like the investment feels significant relative to what you\'re expecting to get back.',
      whatToAvoid:         'Don\'t justify the price immediately or start discounting.',
      howAppointmentHelps: 'A proper strategy session would lay out exactly what return to expect and over what timeframe.',
    });
  }

  // Not ready — common for cold and follow-up calls
  if (['cold_outreach', 'dormant_lead_reactivation', 'discovery_qualification'].includes(context.callIntent)) {
    predictions.push({
      objectionType:       'not_ready',
      likelihood:          'medium',
      underlyingConcern:   'They don\'t have enough urgency yet — the status quo feels safe',
      suggestedFraming:    '"That\'s actually a fair point — can I ask, what would need to change for it to feel more timely?"',
      calibratedQuestion:  'What would need to happen for this to become a priority?',
      vossLabel:           'It seems like the timing doesn\'t feel right yet.',
      whatToAvoid:         'Don\'t pressure them. Don\'t manufacture false urgency.',
      howAppointmentHelps: 'A 20-minute call with no commitment helps them decide on their own terms.',
    });
  }

  // Too busy — very common
  predictions.push({
    objectionType:       'too_busy',
    likelihood:          'medium',
    underlyingConcern:   'They\'re overwhelmed and don\'t see the immediate value',
    suggestedFraming:    '"100% — this is actually why I\'m calling. Most people I speak to are in the same position, and the problem is it never gets less busy. Can I ask you one quick question?"',
    calibratedQuestion:  'What would it take to carve out 20 minutes if the outcome was worth it?',
    vossLabel:           'It sounds like you\'ve got a lot going on right now.',
    whatToAvoid:         'Don\'t say "this will only take 2 minutes" if that\'s not true.',
    howAppointmentHelps: 'Frame the meeting as high-ROI on their time investment.',
  });

  // Need to think — typically later stage
  if (['proposal_follow_up', 'strategy_follow_up'].includes(context.callIntent)) {
    predictions.push({
      objectionType:       'need_to_think',
      likelihood:          'high',
      underlyingConcern:   'There\'s an unresolved concern they haven\'t expressed yet',
      suggestedFraming:    '"Of course — can I ask, what specifically are you thinking through? I want to make sure you have everything you need to make the right call."',
      calibratedQuestion:  'What would help you feel more confident moving forward?',
      vossLabel:           'It seems like there\'s something you\'re still working through.',
      whatToAvoid:         'Don\'t push for an immediate decision. Surface the real concern.',
      howAppointmentHelps: 'Another conversation can address the real blocker directly.',
    });
  }

  // Churn-specific
  if (context.callIntent === 'churn_intervention') {
    predictions.push({
      objectionType:       'skeptical_of_results',
      likelihood:          'high',
      underlyingConcern:   'They feel expectations haven\'t been met',
      suggestedFraming:    '"I completely hear that — and that\'s exactly why I wanted to call. Can you help me understand what specifically hasn\'t felt right?"',
      calibratedQuestion:  'What would it look like if this was working the way you\'d hoped?',
      vossLabel:           'It sounds like you\'re not seeing what you expected.',
      whatToAvoid:         'Don\'t get defensive. Don\'t blame AI Systems. Don\'t make promises without approval.',
      howAppointmentHelps: 'A proper review call can surface the root cause and agree a resolution.',
    });
  }

  return predictions;
}

// ---------------------------------------------------------------------------
// Close Strategy Generator
// ---------------------------------------------------------------------------

export function buildCloseStrategy(
  context: EricaCallContext,
  dealSnap?: EricaDealIntelligenceSnapshot,
): EricaCloseStrategy {

  switch (context.callIntent) {

    case 'cold_outreach':
    case 'dormant_lead_reactivation':
      return {
        approachType:   'low_commitment_next_step',
        closeStatement: 'Would it make sense to have a quick 20-minute conversation just to see if there\'s even a fit? No commitment, I just want to understand your situation better.',
        fallbackClose:  'Even if now isn\'t the right time — can I ask what would need to change for it to make sense to have that conversation?',
        trialClose:     'Based on what you\'ve told me, does it sound like the kind of thing that could be relevant for you?',
        whatNotToSay:   ['Let me just send you some info', 'Can I email you a brochure', 'Are you the decision maker'],
      };

    case 'discovery_qualification':
    case 'strategy_follow_up':
      return {
        approachType:   'appointment_ask',
        closeStatement: 'Based on what we\'ve discussed, it sounds like putting together a proper strategy for you makes sense. Does next week work for a 45-minute session?',
        fallbackClose:  'What would be a fair next step from your perspective?',
        trialClose:     'Does what I\'ve described sound like the kind of solution that would make a difference for you?',
        urgencyFrame:   dealSnap?.urgency === 'high' ? 'Given the timeline you mentioned, it makes sense to move on this sooner rather than later.' : undefined,
        whatNotToSay:   ['You need to sign up now', 'This offer expires', 'Everyone else is doing it'],
      };

    case 'proposal_follow_up':
      return {
        approachType:   'appointment_ask',
        closeStatement: 'Based on everything we\'ve gone through, are you ready to move forward? Or is there something specific we should work through first?',
        fallbackClose:  'What would be a fair timeline for you to make a decision?',
        trialClose:     'If we can address [concern], would you be ready to go ahead?',
        whatNotToSay:   ['I\'ll give you a discount', 'You\'re running out of time', 'All my other clients said yes'],
      };

    case 'nurture':
    case 'upsell':
      return {
        approachType:   'review_call',
        closeStatement: 'Would it make sense to set aside some time for a proper review? I\'d love to go through everything and show you where I think there\'s real opportunity.',
        fallbackClose:  'Even if nothing changes, a review call is always worthwhile — when does your schedule open up?',
        whatNotToSay:   ['You should be paying more', 'Your current plan is limiting you', 'You\'re leaving money on the table'],
      };

    case 'referral_ask':
      return {
        approachType:   'referral_ask',
        closeStatement: 'We\'re always looking to help more businesses like yours. Is there anyone in your network you think could benefit from what we\'ve done together?',
        fallbackClose:  'Even if no one comes to mind right now — if someone ever mentions [area], I\'d love for you to think of us.',
        whatNotToSay:   ['We\'ll give you a commission', 'You owe us a referral', 'All our clients refer us'],
      };

    case 'churn_intervention':
      return {
        approachType:   'appointment_ask',
        closeStatement: 'Can we agree to get on a call with the full team this week and work through this properly? I want to make sure we get this right for you.',
        fallbackClose:  'What would it look like if this was resolved to your satisfaction?',
        whatNotToSay:   ['It\'s not our fault', 'That\'s not in scope', 'You should have told us sooner'],
      };

    default:
      return {
        approachType:   'low_commitment_next_step',
        closeStatement: 'Would it make sense to have a quick conversation to explore this further?',
        fallbackClose:  'What would be a fair next step from your perspective?',
        whatNotToSay:   ['You need to decide now'],
      };
  }
}
