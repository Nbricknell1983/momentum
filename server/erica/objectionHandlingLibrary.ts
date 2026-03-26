// =============================================================================
// ERICA OBJECTION HANDLING LIBRARY
// =============================================================================
// Guardrailed, non-pushy objection handling grounded in:
//   - Chris Voss (label, mirror, calibrated question)
//   - NEPQ (consequence surfacing)
//   - SWISH (solution reframe via consequence)
//
// RULES:
//   - Never argue. Never defend. Never pitch.
//   - Max 2 passes per objection — then release gracefully.
//   - Always move toward the appointment, not the sale.
//   - All responses are grounded in the call brief context.
// =============================================================================

import type { EricaObjectionResponse, EricaObjectionHandlingPlan, EricaObjectionKey } from './ericaRuntimeTypes';

// ---------------------------------------------------------------------------
// Objection response definitions
// ---------------------------------------------------------------------------

export const OBJECTION_RESPONSES: Record<EricaObjectionKey, EricaObjectionResponse> = {

  too_expensive: {
    objectionKey:       'too_expensive',
    label:              `It sounds like the investment is a concern right now.`,
    acknowledgement:    `Totally makes sense — and I'm not here to convince you to spend money you don't think is right.`,
    calibratedQuestion: `What would need to be true for the investment to feel worth it?`,
    nepqReframe:        `The thing I'd gently put back to you — what's the cost of the current situation continuing for another 6 months?`,
    appointmentAsk:     `Would it be worth a quick 20 minutes just to understand what the return actually looks like? Then you can make an informed call.`,
    doNotSay:           ['cheap', 'affordable', 'discount', 'pay less', 'negotiate', 'price war'],
  },

  too_busy: {
    objectionKey:       'too_busy',
    label:              `It sounds like your plate is really full right now.`,
    acknowledgement:    `I get it — and I'm not going to waste your time with something that doesn't make sense for where you're at.`,
    calibratedQuestion: `What's taking most of your energy right now?`,
    nepqReframe:        `The reason I ask is that a lot of the businesses I work with were in that same spot — and the thing that was making them busy was the exact problem we ended up solving.`,
    appointmentAsk:     `What if we found 20 minutes in the next couple of weeks — just to see if there's even a fit before committing to anything?`,
    doNotSay:           ['you must have time', 'this won\'t take long', 'just quickly', 'real quick'],
  },

  need_to_think: {
    objectionKey:       'need_to_think',
    label:              `It sounds like you want to make sure this is the right call before committing.`,
    acknowledgement:    `That makes complete sense — and I respect that. I wouldn't want you rushing into anything.`,
    calibratedQuestion: `What's the main thing you'd want to think through?`,
    nepqReframe:        `I find when people say they need to think, there's usually one specific thing underneath it. Is it the timing, the investment, or something about the fit?`,
    appointmentAsk:     `Would it help to have a more detailed conversation first — so you're thinking through something concrete rather than general?`,
    doNotSay:           ['but', 'however', 'what\'s there to think about', 'you should', 'you need to'],
  },

  already_have_provider: {
    objectionKey:       'already_have_provider',
    label:              `It sounds like you've already got something in place for this.`,
    acknowledgement:    `Good — and I'm not here to tell you to walk away from something that's working.`,
    calibratedQuestion: `How happy are you with what you've got right now — on a scale of one to ten?`,
    nepqReframe:        `The reason I ask is that most businesses I speak with who have a provider are getting about 60–70% of what's possible. Not because of anything wrong — just because it's hard to see the gap from the inside.`,
    appointmentAsk:     `Would it be worth a quick comparison just to see where you're at? You'd either feel great about what you've got, or see something you didn't know you were missing.`,
    doNotSay:           ['they\'re not as good', 'we\'re better', 'switch', 'leave them', 'competitor'],
  },

  not_ready: {
    objectionKey:       'not_ready',
    label:              `It sounds like the timing isn't quite right for you.`,
    acknowledgement:    `That's completely fair — and I'd rather know that than push forward before you're ready.`,
    calibratedQuestion: `What would need to shift for this to feel like the right moment?`,
    nepqReframe:        `Can I ask — is it more that the situation isn't urgent enough yet, or more that you're waiting for something specific to happen first?`,
    appointmentAsk:     `Would it help to put something in the calendar further out — so you've got the conversation locked in for when you are ready?`,
    doNotSay:           ['but you need to', 'if you wait', 'you\'ll miss out', 'limited time', 'urgent'],
  },

  partner_approval: {
    objectionKey:       'partner_approval',
    label:              `It sounds like there are other people involved in this decision.`,
    acknowledgement:    `That makes complete sense — and I wouldn't want you to go ahead without having everyone aligned.`,
    calibratedQuestion: `What would your partner / decision-maker want to know before they'd feel comfortable with this?`,
    nepqReframe:        `Is there a way I could make it easy for you to bring them into the conversation — whether that's a call together or something written you could share?`,
    appointmentAsk:     `Would a joint 20-minute session work — so everyone gets the same information at the same time?`,
    doNotSay:           ['just decide yourself', 'they don\'t need to be involved', 'you can make this call'],
  },

  bad_prior_experience: {
    objectionKey:       'bad_prior_experience',
    label:              `It sounds like you've been burned before — and that's completely understandable.`,
    acknowledgement:    `I really appreciate you being honest about that. And I'm not going to dismiss it — that kind of experience shapes how you see everything after.`,
    calibratedQuestion: `Can I ask — what specifically went wrong? I want to understand whether what we do would hit the same problem.`,
    nepqReframe:        `The thing I'd gently offer is that what went wrong before often tells us exactly what to look for — and what to avoid — in whatever comes next.`,
    appointmentAsk:     `Would you be open to a quick conversation — not to convince you, but so you can ask the hard questions and see if we'd hit the same pitfalls?`,
    doNotSay:           ['we\'re different', 'that wouldn\'t happen with us', 'they were bad', 'trust us'],
  },

  no_urgency: {
    objectionKey:       'no_urgency',
    label:              `It sounds like this isn't something that feels pressing right now.`,
    acknowledgement:    `Fair enough — and I wouldn't want to manufacture urgency that isn't real.`,
    calibratedQuestion: `What would have to happen in the next few months for this to move up the priority list?`,
    nepqReframe:        `The question I'd sit with is — if the current situation stays the same for the next 12 months, what does that actually mean for [business name]?`,
    appointmentAsk:     `Would it be worth a quick conversation now — even just to have the information so you're ready when the timing shifts?`,
    doNotSay:           ['you should prioritise this', 'this is urgent', 'you\'re running out of time', 'now or never'],
  },
};

// ---------------------------------------------------------------------------
// Build the objection handling plan for a call
// ---------------------------------------------------------------------------

export function buildObjectionHandlingPlan(
  mode:                'non_pushy' | 'direct' | 'empathetic_only',
  predictedObjections: string[],
): EricaObjectionHandlingPlan {
  const allKeys = Object.keys(OBJECTION_RESPONSES) as EricaObjectionKey[];

  const maxAttempts = mode === 'non_pushy' ? 1 : mode === 'direct' ? 2 : 1;

  // Prioritise predicted objections first, then include the rest
  const prioritised = [
    ...allKeys.filter(k => predictedObjections.some(p => p.toLowerCase().includes(k.replace(/_/g, ' ')))),
    ...allKeys.filter(k => !predictedObjections.some(p => p.toLowerCase().includes(k.replace(/_/g, ' ')))),
  ];

  return {
    mode,
    maxAttempts,
    responses: prioritised.map(k => OBJECTION_RESPONSES[k]),
  };
}
