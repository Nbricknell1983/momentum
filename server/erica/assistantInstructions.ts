// =============================================================================
// ERICA ASSISTANT INSTRUCTION FRAMEWORK
// =============================================================================
// Per-intent instruction sets defining how Erica opens, discovers, handles
// objections, and closes for each of the 9 supported call intents.
//
// These are DEFAULTS. They are overridden by the EricaCallBrief which
// carries the source-aware context from Momentum's intelligence layers.
// =============================================================================

import type {
  EricaIntentStyle,
  EricaOpeningStrategy,
  EricaQuestionStrategy,
  EricaClosePlan,
  NEPQQuestionStage,
  EricaIntentStyleKey,
} from './ericaRuntimeTypes';
import type { EricaCallIntent } from '../../client/src/lib/ericaTypes';

// ---------------------------------------------------------------------------
// Per-intent style registry
// ---------------------------------------------------------------------------

export const INTENT_STYLES: Record<EricaCallIntent, EricaIntentStyle> = {

  cold_outreach: {
    intent:         'cold_outreach',
    openingStyle:   'pattern_interrupt',
    discoveryStyle: 'full_nepq',
    objectionStyle: 'nepq_consequence',
    closeStyle:     'choice_alternative',
    frameworkNote:  'Erica is reaching out cold. Use pattern interrupt to disarm. NEPQ full sequence. Appointment only — do not pitch.',
  },

  discovery_qualification: {
    intent:         'discovery_qualification',
    openingStyle:   'insight_led',
    discoveryStyle: 'full_nepq',
    objectionStyle: 'empathetic_voss',
    closeStyle:     'value_bridge',
    frameworkNote:  'Lead has shown some interest. Deepen qualification with full NEPQ. Move toward strategy session.',
  },

  strategy_follow_up: {
    intent:         'strategy_follow_up',
    openingStyle:   'relationship_check_in',
    discoveryStyle: 'light_check_in',
    objectionStyle: 'empathetic_voss',
    closeStyle:     'assumptive_soft',
    frameworkNote:  'Strategy has been discussed. Erica checks in on progress and moves toward commitment.',
  },

  proposal_follow_up: {
    intent:         'proposal_follow_up',
    openingStyle:   'relationship_check_in',
    discoveryStyle: 'problem_focused',
    objectionStyle: 'silence_mirror',
    closeStyle:     'choice_alternative',
    frameworkNote:  'Proposal has been sent. Erica surfaces objections via silence/mirror. Converts or captures timeline.',
  },

  nurture: {
    intent:         'nurture',
    openingStyle:   'relationship_check_in',
    discoveryStyle: 'light_check_in',
    objectionStyle: 'release_and_schedule',
    closeStyle:     'permission_based',
    frameworkNote:  'Existing client or warm prospect nurture. No close pressure. Relationship maintenance.',
  },

  upsell: {
    intent:         'upsell',
    openingStyle:   'insight_led',
    discoveryStyle: 'value_confirming',
    objectionStyle: 'nepq_consequence',
    closeStyle:     'assumptive_soft',
    frameworkNote:  'Existing client showing expansion signals. Lead with value already delivered. Bridge to next opportunity.',
  },

  churn_intervention: {
    intent:         'churn_intervention',
    openingStyle:   'direct_value',
    discoveryStyle: 'risk_aware',
    objectionStyle: 'empathetic_voss',
    closeStyle:     'permission_based',
    frameworkNote:  'Client showing churn signals. Erica leads with care, surfaces root concern, offers resolution path.',
  },

  referral_ask: {
    intent:         'referral_ask',
    openingStyle:   'relationship_check_in',
    discoveryStyle: 'value_confirming',
    objectionStyle: 'release_and_schedule',
    closeStyle:     'next_step_only',
    frameworkNote:  'Referral timing confirmed. Erica celebrates results, makes a natural referral ask without pressure.',
  },

  dormant_lead_reactivation: {
    intent:         'dormant_lead_reactivation',
    openingStyle:   'reactivation_bridge',
    discoveryStyle: 'problem_focused',
    objectionStyle: 'nepq_consequence',
    closeStyle:     'choice_alternative',
    frameworkNote:  'Lead went cold. Bridge back to original pain point. Re-qualify, then move toward appointment.',
  },

  booking_confirmation: {
    intent:         'booking_confirmation',
    openingStyle:   'relationship_check_in',
    discoveryStyle: 'light_check_in',
    objectionStyle: 'release_and_schedule',
    closeStyle:     'permission_based',
    frameworkNote:  'Confirming a scheduled meeting. Short call. Confirm time, format, and prep expectations.',
  },
};

// ---------------------------------------------------------------------------
// Opening strategy builder per intent + context
// ---------------------------------------------------------------------------

export function buildOpeningStrategy(
  intent:      EricaCallIntent,
  entityName:  string,
  contactName: string | undefined,
  openingAngle: string,
  relationship: string,
  openingStyleOverride?: string,
): EricaOpeningStrategy {
  const intentStyle  = INTENT_STYLES[intent];
  const styleKey     = (openingStyleOverride as any) ?? intentStyle.openingStyle;
  const firstName    = contactName?.split(' ')[0] ?? entityName;

  const strategies: Record<typeof styleKey, Omit<EricaOpeningStrategy, 'styleKey'>> = {
    pattern_interrupt: {
      openingLine:     `Hey ${firstName} — this might be a slightly random call, but I noticed ${openingAngle}. Am I catching you at an okay time for sixty seconds?`,
      followUpBridge:  `The reason I'm calling is I think there's a real opportunity for ${entityName} that might be worth a quick conversation.`,
      permissionAsk:   `Would it be okay if I took just a minute to explain why I reached out?`,
      tone:            'curious_disarming',
      maxOpeningWords: 30,
    },
    referral_hook: {
      openingLine:     `Hey ${firstName}, I was looking at ${entityName} and ${openingAngle}. Do you have sixty seconds?`,
      followUpBridge:  `I work with businesses like yours on [area] — and the reason I'm calling is I think there's something worth a quick chat about.`,
      permissionAsk:   `Would it be okay to grab two minutes now?`,
      tone:            'curious_disarming',
      maxOpeningWords: 30,
    },
    insight_led: {
      openingLine:     `Hey ${firstName}, I had a look at ${entityName} and noticed ${openingAngle}. I had a quick thought — did I catch you at an okay time?`,
      followUpBridge:  `I had a specific idea based on what I saw. It's pretty relevant to what you're doing.`,
      permissionAsk:   `Can I share it quickly?`,
      tone:            'strategic_consultative',
      maxOpeningWords: 35,
    },
    relationship_check_in: {
      openingLine:     `Hey ${firstName}, it's Erica from [Company] — just checking in on how things are going with ${entityName}. Got a quick minute?`,
      followUpBridge:  `I wanted to follow up because ${openingAngle}.`,
      permissionAsk:   `Is this an okay time to chat for a minute?`,
      tone:            'warm_relationship',
      maxOpeningWords: 30,
    },
    direct_value: {
      openingLine:     `Hey ${firstName}, Erica here from [Company]. I'll be direct — I help ${entityName ? 'businesses like ' + entityName : 'companies'} with ${openingAngle}. Got sixty seconds?`,
      followUpBridge:  `The reason I'm calling specifically is I think there's something relevant to what you're dealing with right now.`,
      permissionAsk:   `Would you mind if I told you exactly why I reached out?`,
      tone:            'direct_confident',
      maxOpeningWords: 35,
    },
    reactivation_bridge: {
      openingLine:     `Hey ${firstName}, it's Erica from [Company] — we spoke a while back about ${openingAngle}. I'm not sure if now's a better time, but I wanted to reach back out. Do you have a minute?`,
      followUpBridge:  `When we last spoke, you mentioned [X] — I was curious if that's still something you're working through.`,
      permissionAsk:   `Would it be okay to talk through where things are at?`,
      tone:            'warm_relationship',
      maxOpeningWords: 40,
    },
  };

  const selected = strategies[styleKey] ?? strategies.relationship_check_in;

  return { styleKey, ...selected };
}

// ---------------------------------------------------------------------------
// NEPQ question plan builder per intent
// ---------------------------------------------------------------------------

const SITUATION_QUESTIONS: Record<EricaCallIntent, NEPQQuestionStage> = {
  cold_outreach: {
    stage:      'situation',
    question:   `How are you currently handling [area relevant to their business]?`,
    intent:     'Understand current state without judging',
    ifNegative: `That makes sense — most businesses I speak with have been doing it that way. Can I ask how long it's been like that?`,
    vossVariant: `It sounds like [current approach] is how you've been running things. How's that been working?`,
  },
  discovery_qualification: {
    stage:      'situation',
    question:   `What does your current [process/system] look like for [area]?`,
    intent:     'Map current state before identifying gaps',
    ifNegative: `Fair enough. What made you look at [area] in the first place?`,
    vossVariant: `It sounds like you've thought about this before. What's the current setup look like?`,
  },
  strategy_follow_up: {
    stage:      'situation',
    question:   `How have things been tracking since we last spoke about [topic]?`,
    intent:     'Update on progress / status',
    ifNegative: `Got it — has anything shifted in how you're thinking about it?`,
    vossVariant: `It sounds like things have been busy. What's changed since we last connected?`,
  },
  proposal_follow_up: {
    stage:      'situation',
    question:   `Did you get a chance to look through what I sent over?`,
    intent:     'Confirm proposal was reviewed',
    ifNegative: `No problem at all — what would be most useful, a quick walk-through or more time to read?`,
    vossVariant: `It sounds like you've had a lot on. How's the timing been for looking at it?`,
  },
  nurture: {
    stage:      'situation',
    question:   `How have things been going with [business name] lately?`,
    intent:     'Low-pressure check-in — no agenda',
    ifNegative: `Sounds like it's been a busy period. What's taking most of your time right now?`,
    vossVariant: `It sounds like there's a lot going on. What's been the main focus?`,
  },
  upsell: {
    stage:      'situation',
    question:   `How's [service/result we're delivering] been tracking for you?`,
    intent:     'Confirm value is being experienced before bridging to expansion',
    ifNegative: `I appreciate you being straight — what's felt like it's been working well vs. not?`,
    vossVariant: `It sounds like there's been some movement. What's been the best part of it so far?`,
  },
  churn_intervention: {
    stage:      'situation',
    question:   `How are things sitting with you at the moment with [service/relationship]?`,
    intent:     'Open the space for honest feedback — no defence',
    ifNegative: `I appreciate you being honest with me. Can I ask — what's been feeling off?`,
    vossVariant: `It sounds like something's been on your mind. What's been the main thing?`,
  },
  referral_ask: {
    stage:      'situation',
    question:   `How has [specific result/win] been playing out for you?`,
    intent:     `Anchor the conversation in the value they've experienced`,
    ifNegative: `Fair enough — what's been working well that you'd point to?`,
    vossVariant: `It sounds like you've seen some solid results. What's stood out the most?`,
  },
  dormant_lead_reactivation: {
    stage:      'situation',
    question:   `When we spoke a while back, [area/challenge] was top of mind. Has that changed at all?`,
    intent:     'Bridge from prior conversation — re-qualify the problem',
    ifNegative: `Makes sense — what's taking priority right now?`,
    vossVariant: `It sounds like things have shifted since then. What's the main focus right now?`,
  },
  booking_confirmation: {
    stage:      'situation',
    question:   `Just confirming we're locked in for [date/time] — does that still work on your end?`,
    intent:     'Confirm the booking details',
    ifNegative: `No problem — what timing works better for you this week?`,
    vossVariant: `It sounds like [date] might not be ideal. What would work better?`,
  },
};

const PROBLEM_QUESTIONS: Record<EricaCallIntent, NEPQQuestionStage> = {
  cold_outreach: {
    stage:      'problem',
    question:   `What's been the biggest challenge with [area] for you lately?`,
    intent:     'Surface the pain without leading them',
    ifNegative: `That's fair — is it more of a time thing, a resource thing, or something else?`,
    vossVariant: `It sounds like [area] hasn't been the priority. What's been getting in the way?`,
  },
  discovery_qualification: {
    stage:      'problem',
    question:   `What's been the most frustrating part of [area] for you?`,
    intent:     'Deepen the problem before bridging to consequence',
    ifNegative: `I hear you — what would a better version of this look like?`,
    vossVariant: `It sounds like [area] has had some friction. What's been the most painful part of that?`,
  },
  strategy_follow_up: {
    stage:      'problem',
    question:   `What's been the main blocker since we last spoke?`,
    intent:     `Identify what's held up progress`,
    ifNegative: `Has anything come up that changed how you're thinking about the next step?`,
    vossVariant: `It sounds like something got in the way. What's the main thing holding things up?`,
  },
  proposal_follow_up: {
    stage:      'problem',
    question:   `What's your main concern with what I sent over?`,
    intent:     'Surface the real objection vs. the stated one',
    ifNegative: `I completely understand — is it more about timing, the investment, or fit?`,
    vossVariant: `It sounds like something didn't quite land. What's the main thing you're sitting with?`,
  },
  nurture: {
    stage:      'problem',
    question:   `What's been the trickiest thing on your plate lately?`,
    intent:     'Keep it open and relational — not agenda-driven',
    ifNegative: `No worries — is there anything I can help with or connect you to?`,
    vossVariant: `It sounds like things are pretty full on. What's taking the most energy?`,
  },
  upsell: {
    stage:      'problem',
    question:   `Is there anything that still feels like a gap — something you feel you're not getting traction on?`,
    intent:     'Identify the expansion opportunity organically',
    ifNegative: `That's great to hear — is there anything you'd want to do more of or go deeper on?`,
    vossVariant: `It sounds like things are tracking well. What would make it even better?`,
  },
  churn_intervention: {
    stage:      'problem',
    question:   `What's been feeling off — is it the results, the communication, or something else?`,
    intent:     'Name the problem categories so they feel safe to be specific',
    ifNegative: `I appreciate that — is it more that things are okay but you're weighing your options?`,
    vossVariant: `It sounds like there's been some friction. What's been the main thing?`,
  },
  referral_ask: {
    stage:      'problem',
    question:   `Who do you know that's dealing with the same challenge you had before we started working together?`,
    intent:     'Bridge from their win to a referral without pressure',
    ifNegative: `No pressure at all — even if someone comes to mind later, I'd love a heads up.`,
    vossVariant: `It sounds like you might know someone who'd benefit. Who comes to mind?`,
  },
  dormant_lead_reactivation: {
    stage:      'problem',
    question:   `Is [original challenge] still something you're dealing with, or has it changed?`,
    intent:     'Re-qualify the problem — avoid assumptions from old notes',
    ifNegative: `That makes sense — what's shifted? Is it a better problem or a different priority?`,
    vossVariant: `It sounds like things have evolved. What's the challenge looking like now?`,
  },
  booking_confirmation: {
    stage:      'problem',
    question:   `Is there anything specific you'd like to make sure we cover in our time together?`,
    intent:     'Agenda pre-set — makes the meeting more productive',
    ifNegative: `No problem — I'll make sure to leave plenty of space for questions on your end.`,
    vossVariant: `It sounds like you might have a few things on your mind. What's most important to you?`,
  },
};

export function buildQuestionStrategy(intent: EricaCallIntent): EricaQuestionStrategy {
  const intentStyle = INTENT_STYLES[intent];
  const framework   = intentStyle.discoveryStyle === 'full_nepq'          ? 'nepq_cold'
                    : intentStyle.discoveryStyle === 'value_confirming'    ? 'expansion'
                    : intentStyle.discoveryStyle === 'risk_aware'          ? 'nepq_warm'
                    : intentStyle.discoveryStyle === 'problem_focused'     ? 'nepq_warm'
                    : intentStyle.discoveryStyle === 'light_check_in'      ? 'relationship_nurture'
                    : 'nepq_cold';

  const baseStages: NEPQQuestionStage[] = [
    SITUATION_QUESTIONS[intent],
    PROBLEM_QUESTIONS[intent],
    {
      stage:      'consequence',
      question:   `If [problem] keeps going the way it is, what does that mean for [business] over the next 6–12 months?`,
      intent:     'Elevate the cost of inaction — do not overdo this',
      ifNegative: `Fair enough — what would have to change for it to become more urgent?`,
      vossVariant: `It sounds like the cost of not solving this is pretty real. What's the biggest risk if nothing changes?`,
    },
    {
      stage:      'solution_awareness',
      question:   `If you could get [result] without [main objection concern], what would that mean for you?`,
      intent:     'Move them toward envisioning the solution',
      ifNegative: `That makes sense. What would need to be true for you to feel confident about a next step?`,
      vossVariant: `It sounds like the result is appealing. What's the main thing holding the decision back?`,
    },
  ];

  const maxQuestions = intentStyle.discoveryStyle === 'light_check_in' ? 2 : 4;

  return {
    framework,
    stages:       baseStages.slice(0, maxQuestions),
    maxQuestions,
    pivotSignal:  'When they describe the pain clearly or ask "how does it work" — pivot to the appointment.',
  };
}

// ---------------------------------------------------------------------------
// Close plan builder
// ---------------------------------------------------------------------------

export function buildClosePlan(
  intent:              EricaCallIntent,
  closeAggressiveness: 'soft' | 'standard' | 'persistent',
  entityName:          string,
): EricaClosePlan {
  const intentStyle  = INTENT_STYLES[intent];
  const styleKey     = intentStyle.closeStyle;
  const maxAttempts  = closeAggressiveness === 'soft' ? 1 : closeAggressiveness === 'standard' ? 2 : 3;

  const planMap: Record<typeof styleKey, Omit<EricaClosePlan, 'styleKey' | 'maxCloseAttempts'>> = {
    assumptive_soft: {
      closingStatement: `Based on what you've shared, I think a quick 20-minute call would be genuinely worth your time — even if you decide it's not for you.`,
      calendarAsk:      `What does your calendar look like this week or next?`,
      fallbackClose:    `What if we just pencilled in a time and you can always move it if needed?`,
      releaseStatement: `No problem at all. Would it be okay if I followed up with something written first?`,
    },
    choice_alternative: {
      closingStatement: `I'd love to set up a quick strategy conversation — no sales pitch, just a look at what's possible.`,
      calendarAsk:      `Would [day] or [day] work better on your end?`,
      fallbackClose:    `What about a quick 15-minute call just to see if there's even a fit?`,
      releaseStatement: `Totally understand — happy to stay in touch. Would it be okay to check in again next month?`,
    },
    next_step_only: {
      closingStatement: `What I'd suggest is a short conversation just to map out what a next step could even look like.`,
      calendarAsk:      `Can I send you a calendar invite and you can confirm when you see it?`,
      fallbackClose:    `Happy to send something written first if that makes it easier to evaluate.`,
      releaseStatement: `No worries — I'll keep an eye on things and reach out when the timing feels better.`,
    },
    value_bridge: {
      closingStatement: `The reason I'd suggest we talk further is that [value point relevant to their situation] — and I want to make sure you're not leaving that on the table.`,
      calendarAsk:      `Can we lock in a 20-minute call this week to map that out?`,
      fallbackClose:    `Even a quick 10-minute call might be enough to know if it's worth going deeper.`,
      releaseStatement: `No pressure — would it help if I sent something across first?`,
    },
    permission_based: {
      closingStatement: `Would it be okay if I sent you a calendar invite for a short conversation? Even just 15–20 minutes.`,
      calendarAsk:      `What does your week look like — any time that works better than others?`,
      fallbackClose:    `If now's not the right time, when would be a better moment for me to follow up?`,
      releaseStatement: `Of course — I'll make a note and check in when the timing makes more sense for you.`,
    },
  };

  const selected = planMap[styleKey] ?? planMap.permission_based;

  return {
    styleKey,
    maxCloseAttempts: maxAttempts,
    ...selected,
  };
}
