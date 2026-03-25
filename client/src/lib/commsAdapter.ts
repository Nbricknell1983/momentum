/**
 * Communication Drafting Layer — Context Builder & Template Engine
 *
 * Deterministic draft generation from cadence items + entity state.
 * All drafts are explainable, entity-specific, and tied to real signals.
 * No AI required. AI enhancement is an optional overlay (server route).
 *
 * Template design principles:
 * - Use real entity names, not [placeholder]
 * - Reference actual assets available from the lead/client record
 * - Match tone to urgency and stage
 * - Keep SMS under 160 chars
 * - Keep voicemail under 60 seconds (~120 words)
 */

import { format } from 'date-fns';
import { Lead, Client } from './types';
import { CadenceQueueItem, CadenceTriggerType } from './cadenceTypes';
import {
  CommunicationDraft,
  CommunicationChannelDraft,
  CommunicationIntent,
  CommunicationChannel,
  CommunicationAssetReference,
  CommunicationOutcomeGoal,
  CommunicationThreadContext,
  CommsDraftInspection,
} from './commsTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;
function uid(): string {
  return `draft-${Date.now()}-${++_seq}`;
}

function today(): string {
  return format(new Date(), 'dd/MM/yyyy');
}

function salutation(contactName?: string): string {
  if (contactName && contactName.trim()) {
    const first = contactName.trim().split(/\s+/)[0];
    return `Hi ${first}`;
  }
  return 'Hi';
}

function short(body: string): string {
  return body.replace(/\n{3,}/g, '\n\n').trim();
}

// ── Trigger → Intent Mapping ──────────────────────────────────────────────────

const TRIGGER_INTENT_MAP: Record<CadenceTriggerType, CommunicationIntent> = {
  proposal_no_movement: 'proposal_acceptance_nudge',
  verbal_commit_stall: 'verbal_commit_chase',
  discovery_stall: 'discovery_followup',
  engaged_going_cold: 'dormant_lead_reactivation',
  contact_overdue: 'general_checkin',
  no_response_streak: 'dormant_lead_reactivation',
  approval_blocked: 'approval_reminder',
  churn_risk_intervention: 'churn_risk_intervention',
  amber_health_check: 'general_checkin',
  post_completion_followup: 'post_completion_checkin',
  upsell_window_open: 'upsell_conversation_opener',
  referral_window_open: 'referral_ask',
  onboarding_field_gap: 'onboarding_completion_reminder',
  client_inactivity: 'general_checkin',
  lead_inactivity: 'dormant_lead_reactivation',
};

// ── Recommended Channel by Intent ─────────────────────────────────────────────

const INTENT_RECOMMENDED_CHANNEL: Record<CommunicationIntent, CommunicationChannel> = {
  discovery_followup: 'call_prep',
  strategy_review_followup: 'email',
  proposal_acceptance_nudge: 'call_prep',
  verbal_commit_chase: 'call_prep',
  onboarding_completion_reminder: 'email',
  approval_reminder: 'email',
  dormant_lead_reactivation: 'email',
  churn_risk_intervention: 'call_prep',
  upsell_conversation_opener: 'call_prep',
  referral_ask: 'email',
  post_completion_checkin: 'email',
  general_checkin: 'email',
};

const CHANNEL_RATIONALE: Record<CommunicationChannel, string> = {
  email: 'Email allows the contact to review at their own pace. Best for structured information, proposals, or follow-ups that need a paper trail.',
  sms: 'SMS has a ~98% open rate. Best for short, time-sensitive nudges where a call would be premature.',
  call_prep: 'A call allows you to read the room, handle objections in real time, and build rapport. Best for high-stakes conversations.',
  voicemail: 'A voicemail humanises the outreach and triggers a callback. Best when email has not generated a response.',
};

// ── Asset Resolution ──────────────────────────────────────────────────────────

function resolveAsset(
  lead: Lead | undefined,
  client: Client | undefined,
  item: CadenceQueueItem,
): CommunicationAssetReference | undefined {
  if (lead) {
    if (lead.strategyReportId) {
      return {
        type: 'strategy_report',
        label: 'Strategy Report',
        description: 'The strategy report prepared for this lead. Share the link or resend the document.',
      };
    }
    if (lead.growthPrescription) {
      return {
        type: 'growth_plan',
        label: 'Growth Plan',
        description: 'The digital growth prescription covering channel gaps and opportunities.',
      };
    }
    if (lead.aiGrowthPlan) {
      return {
        type: 'growth_plan',
        label: 'AI Growth Plan',
        description: 'AI-generated growth plan with priority actions.',
      };
    }
  }
  if (client) {
    if (item.groupCategory === 'referrals') {
      return {
        type: 'milestone',
        label: 'Recent Milestone',
        description: 'A recent delivery win or performance result to reference in the referral conversation.',
      };
    }
    if (item.groupCategory === 'account_growth') {
      return {
        type: 'delivery_summary',
        label: 'Delivery Summary',
        description: 'Current performance and delivery progress across active modules.',
      };
    }
  }
  if (item.assetToReference) {
    return {
      type: 'roadmap',
      label: item.assetToReference,
      description: `Referenced asset from cadence item: ${item.assetToReference}`,
    };
  }
  return undefined;
}

// ── Template Engine ───────────────────────────────────────────────────────────

function buildEmailDraft(
  intent: CommunicationIntent,
  ctx: CommunicationThreadContext,
  item: CadenceQueueItem,
): CommunicationChannelDraft {
  const name = ctx.entityName;
  const contact = salutation(ctx.contactName);
  const days = ctx.daysSinceActivity ?? 0;

  const templates: Record<CommunicationIntent, { subject: string; body: string; cta: string; tone: string; ref: string }> = {
    proposal_acceptance_nudge: {
      subject: `Following up on the proposal for ${name}`,
      body: short(`${contact},

I wanted to check in on the proposal I sent across for ${name}.

I know things get busy — I just want to make sure you've had a chance to review it and that any questions you have are answered before we talk next steps.

If anything in there is unclear or you'd like me to walk you through it, I'm happy to jump on a quick 20-minute call this week.

Is there anything holding you back right now?`),
      cta: 'Schedule a call to review the proposal',
      tone: 'Confident, helpful, no pressure',
      ref: 'Strategy report / proposal sent',
    },
    verbal_commit_chase: {
      subject: `Getting the paperwork sorted — ${name}`,
      body: short(`${contact},

Great news that we're aligned on moving forward — I just wanted to get the agreement formalised so we can get started.

I've attached the service agreement for you to review and sign. It should only take a few minutes.

Once we have that confirmed, I'll get the onboarding process kicked off straight away.

Any questions before you sign — just let me know.`),
      cta: 'Sign the service agreement to begin onboarding',
      tone: 'Direct, action-oriented, warm',
      ref: 'Service agreement / contract',
    },
    discovery_followup: {
      subject: `Following up from our conversation — ${name}`,
      body: short(`${contact},

Thanks for the time we've spent together — I've been thinking about ${name}'s situation and wanted to share a few thoughts.

Based on what we discussed, I think there are some clear opportunities worth exploring. I'd love to walk you through what that could look like in practice.

Are you free for a 30-minute session this week? I'll come prepared with some specific ideas.`),
      cta: 'Book a 30-minute strategy session',
      tone: 'Curious, value-led, confident',
      ref: 'Discovery notes / visibility gap report',
    },
    strategy_review_followup: {
      subject: `Your strategy review — ${name}`,
      body: short(`${contact},

I wanted to follow up on the strategy we've been working through for ${name}.

I think we've identified some strong opportunities, and I wanted to make sure we're both clear on the priority areas and the proposed approach before we move forward.

Can we book a session to finalise the direction? I can have everything ready for you.`),
      cta: 'Book a strategy review session',
      tone: 'Professional, prepared',
      ref: 'Strategy report',
    },
    dormant_lead_reactivation: {
      subject: `Something I noticed about ${name}`,
      body: short(`${contact},

I realise it's been a while since we've spoken — I don't want to take up too much of your time, but I wanted to share something I noticed recently about ${name}'s online presence.

There's a specific gap that's worth a quick conversation. I think it could make a real difference if we address it now before a competitor does.

Worth a 15-minute call this week?`),
      cta: 'Book a 15-minute catch-up call',
      tone: 'Intriguing, low-pressure, specific signal',
      ref: 'Visibility gap or competitive insight',
    },
    approval_reminder: {
      subject: `[Action needed] Approval to continue — ${name}`,
      body: short(`${contact},

We're ready to move forward on the next stage for ${name}, but we need your sign-off to proceed.

I want to make sure this doesn't create unnecessary delays — could you take 5 minutes today to review and approve?

${item.assetToReference ? `The item needing approval is: ${item.assetToReference}.` : ''}

Happy to walk you through it on a call if that's easier.`),
      cta: 'Approve to unblock delivery',
      tone: 'Clear, urgent, helpful',
      ref: item.assetToReference ?? 'Approval request',
    },
    churn_risk_intervention: {
      subject: `Let's connect — ${name}`,
      body: short(`${contact},

I wanted to reach out personally. I want to make sure we're delivering what you need and that we're on the same page about where things stand.

If there's anything you're not happy with, I'd much rather know now so we can address it. That's a commitment I take seriously.

Are you available for a quick call this week? I'll come prepared with a progress update.`),
      cta: 'Book an urgent check-in call',
      tone: 'Personal, accountable, direct',
      ref: 'Account health report',
    },
    upsell_conversation_opener: {
      subject: `What's next for ${name}`,
      body: short(`${contact},

Things are going well and I've been thinking about what the next phase could look like for ${name}.

There's a specific opportunity I'd like to share with you — I think the timing is right and the business case is strong. It builds on what we've already achieved together.

Could we set aside 20 minutes this week? I'll have something concrete to show you.`),
      cta: 'Book a 20-minute growth conversation',
      tone: 'Confident, evidence-based, forward-looking',
      ref: 'Delivery summary / expansion opportunity',
    },
    referral_ask: {
      subject: `A quick favour — ${name}`,
      body: short(`${contact},

We've been getting some great results together and I'm really pleased with how things are progressing for ${name}.

I wanted to ask — do you know of any other business owners who might benefit from what we do? We love working with clients like you, and an introduction means a lot to us.

Even just a name or a quick introduction over email would be wonderful. No pressure at all — just thought I'd ask.`),
      cta: 'Introduce one business owner who could benefit',
      tone: 'Warm, personal, low-pressure',
      ref: 'Recent milestone / delivery win',
    },
    onboarding_completion_reminder: {
      subject: `A few things we still need from you — ${name}`,
      body: short(`${contact},

We're excited to get moving on ${name}'s setup — there are just a few pieces of information we still need from your end to get started.

${item.recommendedAction}

The sooner we can get these, the sooner we can have everything live and working for you. Can you send these across today?`),
      cta: 'Complete the onboarding information',
      tone: 'Helpful, clear, action-oriented',
      ref: 'Onboarding checklist',
    },
    post_completion_checkin: {
      subject: `Checking in — ${name}`,
      body: short(`${contact},

I wanted to take a moment to check in now that we've reached this milestone with ${name}.

How are you feeling about the results so far? I'd love to hear your thoughts, and I also have some ideas about what we could look at next.

Are you free for a quick call this week?`),
      cta: 'Share feedback and discuss next steps',
      tone: 'Celebratory, curious, forward-looking',
      ref: 'Delivery summary',
    },
    general_checkin: {
      subject: `Checking in — ${name}`,
      body: short(`${contact},

I wanted to reach out and check in — it's been ${days > 0 ? `${days} days` : 'a while'} since we last connected and I wanted to make sure everything is on track.

${item.stageContext ? `Context: ${item.stageContext}` : ''}

Is there anything you need from my end or anything on your mind?`),
      cta: 'Reconnect and confirm next steps',
      tone: 'Warm, professional',
      ref: item.assetToReference ?? 'Recent interaction',
    },
  };

  const t = templates[intent];
  return {
    channel: 'email',
    subject: t.subject,
    body: t.body,
    cta: t.cta,
    tone: t.tone,
    keyReferencePoint: t.ref,
  };
}

function buildSmsDraft(
  intent: CommunicationIntent,
  ctx: CommunicationThreadContext,
  _item: CadenceQueueItem,
): CommunicationChannelDraft {
  const name = ctx.entityName;
  const days = ctx.daysSinceActivity ?? 0;

  const bodies: Record<CommunicationIntent, string> = {
    proposal_acceptance_nudge: `Hi, just checking in on the proposal for ${name} — happy to answer any questions. Reply or call me. [Your name]`,
    verbal_commit_chase: `Hi, just following up on the paperwork for ${name} — can you action it today? Happy to help if needed. [Your name]`,
    discovery_followup: `Hi, following up from our chat about ${name}. Would love to book a quick session this week. Are you free? [Your name]`,
    strategy_review_followup: `Hi, I have the strategy ready for ${name} — worth a 20min review. Are you free this week? [Your name]`,
    dormant_lead_reactivation: `Hi, I spotted something relevant to ${name} and wanted to share it quickly. Worth a call? [Your name]`,
    approval_reminder: `Hi — we need your approval to keep ${name}'s project moving. Takes 5 mins. Can you action today? [Your name]`,
    churn_risk_intervention: `Hi, wanted to personally check in on ${name}. Can we connect briefly? [Your name]`,
    upsell_conversation_opener: `Hi, thinking about the next step for ${name} — have something interesting to share. 20 mins this week? [Your name]`,
    referral_ask: `Hi! Loving working with ${name}. Do you know any other businesses we could help? A quick intro would mean a lot. [Your name]`,
    onboarding_completion_reminder: `Hi, we just need a few more details for ${name} to get started. Can you send across today? [Your name]`,
    post_completion_checkin: `Hi! Wanted to check in now we've reached this milestone with ${name}. Happy with results? Let's chat. [Your name]`,
    general_checkin: `Hi, just checking in on ${name}${days > 0 ? ` — it's been ${days} days` : ''}. Everything OK? [Your name]`,
  };

  return {
    channel: 'sms',
    body: bodies[intent],
    cta: 'Reply to confirm or call back',
    tone: 'Brief, warm, direct',
    keyReferencePoint: `SMS to ${ctx.contactName ?? 'contact'} at ${name}`,
  };
}

function buildCallPrepDraft(
  intent: CommunicationIntent,
  ctx: CommunicationThreadContext,
  item: CadenceQueueItem,
): CommunicationChannelDraft {
  const name = ctx.entityName;

  const templates: Record<CommunicationIntent, { body: string; cta: string; tone: string; ref: string }> = {
    proposal_acceptance_nudge: {
      body: `CALL OBJECTIVE
Get a decision or clear next step on the proposal.

OPENING LINE
"I'm calling to follow up on the proposal I sent for ${name} — I just want to make sure you've had a chance to review it and that I can answer any questions."

KEY POINTS TO COVER
• Confirm they've read the proposal
• Ask: "Is there anything you'd like me to clarify?"
• Understand what, if anything, is holding them back
• Reconfirm the value and urgency

ANTICIPATED OBJECTIONS
• "We need more time" → "Totally understand — what's the specific thing you need to think through? I can help with that now."
• "The price is a concern" → "Tell me more — is it the total investment, the ROI, or the payment structure?"
• "Not the right time" → "When would be the right time? Let's plan around that."

CLOSING ASK
"Can we confirm moving forward this week? If yes, I'll send the agreement across today."

ASSETS TO REFERENCE
${item.assetToReference ?? 'Strategy report / proposal document'}`,
      cta: 'Secure agreement or identify the specific objection',
      tone: 'Confident, helpful',
      ref: 'Sent proposal',
    },
    verbal_commit_chase: {
      body: `CALL OBJECTIVE
Convert verbal agreement to signed commitment.

OPENING LINE
"I'm calling because we've agreed in principle and I want to get the paperwork sorted so we can get started."

KEY POINTS TO COVER
• Reconfirm verbal agreement
• Walk through the agreement briefly if they have concerns
• Make it as easy as possible to sign
• Set a clear start date once signed

ANTICIPATED OBJECTIONS
• "I haven't had time" → "I understand — can I send it again right now while I have you on the phone?"
• "I need to check with someone" → "Of course — who else is involved? Can I speak to them as well?"

CLOSING ASK
"Can you sign today? I'll have it across to you in the next 5 minutes."`,
      cta: 'Get verbal agreement formalised today',
      tone: 'Direct, action-oriented',
      ref: 'Service agreement',
    },
    discovery_followup: {
      body: `CALL OBJECTIVE
Book next meeting and deepen discovery.

OPENING LINE
"I've been thinking about what we discussed for ${name} and I wanted to pick up where we left off."

KEY POINTS TO COVER
• What's changed since we last spoke?
• Understand their current top priority
• Share 1 relevant insight or data point
• Position the next step (strategy session)

DISCOVERY QUESTIONS
• "What's your biggest concern about growth right now?"
• "What have you tried before that hasn't worked?"
• "If you could fix one thing in your online presence this year, what would it be?"

CLOSING ASK
"Can we book a 30-minute session this week for me to walk you through what I have in mind?"`,
      cta: 'Book a strategy session',
      tone: 'Curious, conversational',
      ref: 'Visibility gap data / discovery notes',
    },
    strategy_review_followup: {
      body: `CALL OBJECTIVE
Walk through the strategy and get buy-in.

OPENING LINE
"I've put together the strategy for ${name} and I'd love to walk you through it."

KEY POINTS TO COVER
• Summary of what you found
• Top 3 opportunities identified
• Proposed approach and timeline
• Investment and expected outcome

CLOSING ASK
"Does this feel like the right direction? Are you ready to move forward?"`,
      cta: 'Get alignment on the strategy and confirm next step',
      tone: 'Professional, prepared',
      ref: 'Strategy report',
    },
    dormant_lead_reactivation: {
      body: `CALL OBJECTIVE
Re-engage a dormant lead with a specific, relevant hook.

OPENING LINE
"I realise it's been a while — I promise I'll keep this brief. I noticed something about ${name} that I think is worth a quick conversation."

KEY POINTS TO COVER
• Lead with the specific insight or signal (competitor, gap, timing)
• Make it about them, not you
• Don't pitch — ask questions
• Re-qualify: is the timing better now?

HOOK IDEAS
• Competitor activity in their market
• A change in their online visibility
• A relevant case study in their industry

CLOSING ASK
"Worth a 15-minute call this week to explore this?"`,
      cta: 'Re-qualify and book next session',
      tone: 'Intriguing, concise, consultative',
      ref: 'Competitive insight / visibility data',
    },
    approval_reminder: {
      body: `CALL OBJECTIVE
Unblock delivery by securing outstanding approval.

OPENING LINE
"I'm calling because we have everything ready to go for ${name} — we just need your approval on [item] to proceed."

KEY POINTS TO COVER
• What specifically needs approval
• What happens if it's delayed further
• Make it as easy as possible to approve on the call
• Offer to walk through it now

CLOSING ASK
"Can you action this while I have you on the phone? It will take less than 5 minutes."

ASSET: ${item.assetToReference ?? 'Approval request item'}`,
      cta: 'Secure approval on the call',
      tone: 'Clear, direct, helpful',
      ref: item.assetToReference ?? 'Approval request',
    },
    churn_risk_intervention: {
      body: `CALL OBJECTIVE
Understand the dissatisfaction and commit to a recovery plan.

OPENING LINE
"I wanted to reach out personally — I want to make sure we're delivering what you need and that I have a clear picture of where things stand."

KEY POINTS TO COVER
• Listen first — let them speak
• Acknowledge any frustration without defensiveness
• Understand the specific gap between expectation and delivery
• Commit to a concrete action within 48 hours

QUESTIONS TO ASK
• "On a scale of 1–10, how would you rate what we've delivered so far?"
• "What was the one thing you were most hoping for that hasn't happened yet?"
• "What would make this feel like a success for you?"

CLOSE
"I appreciate you being honest. Here's what I'm going to do…"

IMPORTANT: Come with a specific offer or recovery plan. Never leave without a clear next step.`,
      cta: 'Understand the gap and commit to a recovery action',
      tone: 'Empathetic, accountable, solution-focused',
      ref: 'Account health report',
    },
    upsell_conversation_opener: {
      body: `CALL OBJECTIVE
Open the conversation about the next phase for ${name}.

OPENING LINE
"I've been thinking about what the next chapter could look like for ${name}, and I have some specific ideas I'd love to share."

KEY POINTS TO COVER
• Reference a recent win or delivery milestone
• Introduce the expansion opportunity (specific module or service)
• Frame it as a logical next step, not an upsell
• Get curiosity, not commitment on this call

QUESTIONS
• "Are you happy with the results so far in [area]?"
• "Have you thought about expanding into [area]?"
• "If you could add one thing to what we're doing, what would it be?"

CLOSE
"Would you be open to a deeper look? I can put together something specific."`,
      cta: 'Generate interest in expansion conversation',
      tone: 'Confident, evidence-based',
      ref: 'Delivery summary / expansion opportunity',
    },
    referral_ask: {
      body: `CALL OBJECTIVE
Ask for a referral in the most natural and low-pressure way.

TIMING
Best done at the end of a positive check-in or after celebrating a win.

APPROACH
• Acknowledge the progress made together
• Ask genuinely — not transactionally
• Make it easy: "Even just a name is helpful"

SCRIPT
"Before I let you go — we've been getting some great results together and I just wanted to ask: do you know of any other business owners who might benefit from what we do? Even if you just gave me a name and I reached out, that would mean a lot to us."

HANDLE HESITATION
• "No rush — if someone comes to mind, just let me know."
• "Even someone who's been struggling with [specific pain point] would be ideal."

CLOSE
"That's genuinely appreciated. I'll look after them the way we look after you."`,
      cta: 'Get one warm referral introduction',
      tone: 'Warm, personal, conversational',
      ref: 'Recent milestone',
    },
    onboarding_completion_reminder: {
      body: `CALL OBJECTIVE
Collect outstanding onboarding information.

OPENING LINE
"I'm calling because we're ready to get started on ${name} — we just need a few more details from your end."

KEY POINTS TO COVER
• What specifically is missing
• Why it's blocking progress
• Collect it live on the call if possible
• Set a deadline for any items not collected today

ITEMS OUTSTANDING
${item.recommendedAction}

CLOSE
"Can we go through these now? I'll update everything as we talk."`,
      cta: 'Collect missing onboarding data on the call',
      tone: 'Helpful, organised',
      ref: 'Onboarding checklist',
    },
    post_completion_checkin: {
      body: `CALL OBJECTIVE
Celebrate the win, collect feedback, and open the next conversation.

OPENING LINE
"I wanted to check in now that we've reached this milestone — I'd love to hear how you're feeling about the results."

KEY POINTS TO COVER
• What they're most pleased with
• Any areas they'd like to improve
• Natural segue into what comes next
• Referral ask if the moment feels right

CLOSE
"I'm glad we're getting these results. I have some thoughts on what the next phase could look like if you're interested."`,
      cta: 'Collect positive feedback and open next opportunity',
      tone: 'Celebratory, forward-looking',
      ref: 'Delivery summary',
    },
    general_checkin: {
      body: `CALL OBJECTIVE
Reconnect and understand current situation.

OPENING LINE
"I'm reaching out for a catch-up — I want to make sure everything is on track and that you have what you need."

KEY POINTS TO COVER
• How are they feeling about progress?
• Any concerns or blockers?
• What's their top priority right now?
• Is there anything we should be doing differently?

CONTEXT
${item.stageContext}

CLOSE
"Thanks for the update — let me [specific action]. I'll follow up by [date]."`,
      cta: 'Reconnect and identify any blockers or opportunities',
      tone: 'Warm, attentive',
      ref: item.assetToReference ?? 'Recent interaction',
    },
  };

  const t = templates[intent];
  return {
    channel: 'call_prep',
    body: t.body,
    cta: t.cta,
    tone: t.tone,
    keyReferencePoint: t.ref,
  };
}

function buildVoicemailDraft(
  intent: CommunicationIntent,
  ctx: CommunicationThreadContext,
  _item: CadenceQueueItem,
): CommunicationChannelDraft {
  const name = ctx.entityName;

  const scripts: Record<CommunicationIntent, string> = {
    proposal_acceptance_nudge:
      `"Hi [Contact Name], it's [Your Name] calling from [Company]. I'm following up on the proposal I sent across for ${name} — I just want to make sure you've had a chance to look it over and that any questions you have are answered. When you get a chance, give me a call back on [number] — or if it's easier, just reply to my email and we can go from there. Thanks, speak soon."`,
    verbal_commit_chase:
      `"Hi [Contact Name], it's [Your Name] from [Company]. I'm calling to sort out the paperwork for ${name} — we're both ready to go, I just need the agreement signed to get things started. I'll send it across again now to make it easy. Call me back on [number] when you get a chance. Thanks."`,
    discovery_followup:
      `"Hi [Contact Name], it's [Your Name] from [Company]. I've been thinking about ${name} since our last conversation and I have some specific ideas I'd love to share. I think there's a real opportunity here. When you have 15 minutes, give me a call on [number] — I promise it'll be worth your time. Thanks."`,
    strategy_review_followup:
      `"Hi [Contact Name], it's [Your Name] from [Company]. I've put together the strategy for ${name} and I'd love to walk you through it. Call me back on [number] or let me know when suits — it won't take long and I think you'll find it valuable. Thanks."`,
    dormant_lead_reactivation:
      `"Hi [Contact Name], it's [Your Name] from [Company]. I know it's been a while — I spotted something specific about ${name} that I think is genuinely worth a quick conversation. I'll keep it brief. Call me back on [number] when you can. Thanks."`,
    approval_reminder:
      `"Hi [Contact Name], it's [Your Name] from [Company]. I'm calling because we're ready to move forward on ${name}'s project — we just need your approval to proceed. It'll take about 5 minutes. Call me back on [number] or reply to my email and I can walk you through it. Thanks."`,
    churn_risk_intervention:
      `"Hi [Contact Name], it's [Your Name] from [Company]. I wanted to reach out personally. I want to make sure we're on the same page and that we're delivering what you need. Please give me a call back on [number] when you're free — I'd really appreciate the chance to connect. Thanks."`,
    upsell_conversation_opener:
      `"Hi [Contact Name], it's [Your Name] from [Company]. I've been thinking about ${name} and I have some specific ideas about what we could do next that I think you'll find interesting. When you have 20 minutes, call me back on [number] — I'll have something concrete to show you. Thanks."`,
    referral_ask:
      `"Hi [Contact Name], it's [Your Name] from [Company]. Just a quick one — we've been getting great results with ${name} and I wanted to ask if you know of any other business owners we might be able to help. Even just a name would mean a lot. Call me back when you can on [number]. Thanks."`,
    onboarding_completion_reminder:
      `"Hi [Contact Name], it's [Your Name] from [Company]. I'm calling because we're ready to get started on ${name} — we just have a couple of things we still need from your end. Give me a call back on [number] and we can go through it quickly. Won't take long. Thanks."`,
    post_completion_checkin:
      `"Hi [Contact Name], it's [Your Name] from [Company]. I wanted to check in now that we've hit this milestone with ${name} — I'd love to hear how you're feeling about things and share what I'm thinking for what comes next. Call me back on [number] when you get a chance. Thanks."`,
    general_checkin:
      `"Hi [Contact Name], it's [Your Name] from [Company]. Just reaching out for a quick catch-up on ${name} — I want to make sure everything is on track and that you have what you need. Give me a call back on [number] when you're free. Thanks."`,
  };

  return {
    channel: 'voicemail',
    body: scripts[intent],
    cta: 'Return call or email reply',
    tone: 'Warm, concise, professional',
    keyReferencePoint: `Voicemail for ${ctx.contactName ?? 'contact'} at ${name}`,
    estimatedDuration: '~45 seconds',
  };
}

// ── Outcome Goal Builder ──────────────────────────────────────────────────────

function buildOutcomeGoal(intent: CommunicationIntent): CommunicationOutcomeGoal {
  const goals: Record<CommunicationIntent, CommunicationOutcomeGoal> = {
    proposal_acceptance_nudge: { primary: 'Get a decision or clear objection on the proposal', secondary: 'Book a review call if decision is not immediate', timeframe: 'Within 48 hours' },
    verbal_commit_chase: { primary: 'Get the agreement signed', secondary: 'Confirm onboarding start date', timeframe: 'Today' },
    discovery_followup: { primary: 'Book a strategy session', secondary: 'Deepen understanding of their situation', timeframe: 'This week' },
    strategy_review_followup: { primary: 'Get alignment on strategy direction', secondary: 'Move to proposal stage', timeframe: 'This week' },
    dormant_lead_reactivation: { primary: 'Re-engage with a compelling hook', secondary: 'Re-qualify timing and intent', timeframe: 'Within 7 days' },
    approval_reminder: { primary: 'Secure the approval to unblock delivery', timeframe: 'Today' },
    churn_risk_intervention: { primary: 'Understand root cause of dissatisfaction', secondary: 'Commit to a recovery plan', timeframe: 'Immediate — within 24 hours' },
    upsell_conversation_opener: { primary: 'Create curiosity and interest in expansion', secondary: 'Book a dedicated growth conversation', timeframe: 'This week' },
    referral_ask: { primary: 'Receive one warm introduction or name', timeframe: 'No pressure — within the week' },
    onboarding_completion_reminder: { primary: 'Collect all outstanding onboarding information', timeframe: 'Today' },
    post_completion_checkin: { primary: 'Collect feedback and open next opportunity conversation', secondary: 'Referral ask if moment is right', timeframe: 'This week' },
    general_checkin: { primary: 'Reconnect and identify any blockers or opportunities', timeframe: 'This week' },
  };
  return goals[intent];
}

// ── Why Explanation ───────────────────────────────────────────────────────────

function buildWhyCreated(item: CadenceQueueItem, intent: CommunicationIntent): string {
  return `This draft was created because ${item.reason} The cadence rule detected: ${item.triggerExplanation}`;
}

function buildOutcomeIfSuccessful(intent: CommunicationIntent): string {
  const outcomes: Record<CommunicationIntent, string> = {
    proposal_acceptance_nudge: 'Lead moves to verbal commit or identifies the specific objection to address.',
    verbal_commit_chase: 'Agreement signed and onboarding date confirmed.',
    discovery_followup: 'Strategy session booked and lead re-engaged.',
    strategy_review_followup: 'Strategy agreed and lead moves to proposal stage.',
    dormant_lead_reactivation: 'Lead re-engages and books next conversation.',
    approval_reminder: 'Delivery unblocked and project continues on schedule.',
    churn_risk_intervention: 'Root cause identified and a recovery plan committed to.',
    upsell_conversation_opener: 'Expansion conversation booked.',
    referral_ask: 'One warm referral introduction received.',
    onboarding_completion_reminder: 'All onboarding data collected and setup can begin.',
    post_completion_checkin: 'Positive feedback collected and next phase introduced.',
    general_checkin: 'Relationship maintained and any blockers identified.',
  };
  return outcomes[intent];
}

// ── Main Draft Builder ────────────────────────────────────────────────────────

export function buildDraftFromCadenceItem(
  item: CadenceQueueItem,
  leads: Lead[],
  clients: Client[],
): CommunicationDraft {
  ++_seq;

  const lead = item.entityType === 'lead' ? leads.find(l => l.id === item.entityId) : undefined;
  const client = item.entityType === 'client' ? clients.find(c => c.id === item.entityId) : undefined;

  const intent: CommunicationIntent = TRIGGER_INTENT_MAP[item.trigger.type] ?? 'general_checkin';

  const ctx: CommunicationThreadContext = {
    entityId: item.entityId,
    entityName: item.entityName,
    entityType: item.entityType,
    contactName: lead?.contactName ?? client?.phone ? undefined : undefined,
    stage: item.stageContext,
    daysSinceActivity: item.trigger.daysElapsed,
    urgencyLevel: item.urgency,
    keySignal: item.triggerExplanation,
    assetAvailable: item.assetToReference,
  };

  const recommendedChannel = INTENT_RECOMMENDED_CHANNEL[intent];
  const assetReference = resolveAsset(lead, client, item);

  const channels: Partial<Record<CommunicationChannel, CommunicationChannelDraft>> = {
    email: buildEmailDraft(intent, ctx, item),
    sms: buildSmsDraft(intent, ctx, item),
    call_prep: buildCallPrepDraft(intent, ctx, item),
    voicemail: buildVoicemailDraft(intent, ctx, item),
  };

  return {
    id: uid(),
    entityId: item.entityId,
    entityName: item.entityName,
    entityType: item.entityType,
    intent,
    recommendedChannel,
    channels,
    assetReference,
    outcomeGoal: buildOutcomeGoal(intent),
    whyCreated: buildWhyCreated(item, intent),
    whatSignalTriggered: item.triggerExplanation,
    whyChannelChosen: CHANNEL_RATIONALE[recommendedChannel],
    outcomeIfSuccessful: buildOutcomeIfSuccessful(intent),
    stageContext: item.stageContext,
    urgency: item.urgency,
    linkedCadenceItemId: item.id,
    status: 'draft',
    activeChannel: recommendedChannel,
    editedBodies: {},
    generatedAt: today(),
    aiEnhanced: false,
  };
}

// ── Bulk Draft Generation ─────────────────────────────────────────────────────

export function buildDraftsFromQueue(
  items: CadenceQueueItem[],
  leads: Lead[],
  clients: Client[],
): CommunicationDraft[] {
  _seq = 0;
  return items
    .filter(i => i.status === 'pending')
    .map(item => buildDraftFromCadenceItem(item, leads, clients));
}

// ── Inspection Support ────────────────────────────────────────────────────────

export function buildInspections(drafts: CommunicationDraft[]): CommsDraftInspection[] {
  return drafts.map(d => ({
    draftId: d.id,
    entityName: d.entityName,
    intent: d.intent,
    channels: Object.keys(d.channels) as CommunicationChannel[],
    recommendedChannel: d.recommendedChannel,
    status: d.status,
    linkedCadenceItemId: d.linkedCadenceItemId,
    whyCreated: d.whyCreated,
    signal: d.whatSignalTriggered,
    outcomeGoal: d.outcomeGoal.primary,
    generatedAt: d.generatedAt,
    usedChannel: d.usedChannel,
    usedAt: d.usedAt,
    aiEnhanced: d.aiEnhanced,
  }));
}
