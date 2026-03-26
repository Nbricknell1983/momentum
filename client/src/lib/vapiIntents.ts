// =============================================================================
// MOMENTUM VAPI — CALL INTENT DEFINITIONS
// =============================================================================
// Each intent defines: purpose, entry conditions, Momentum context provided,
// success criteria, escalation/handoff, and allowed tools.
// These are the authoritative Momentum-side intent specs that determine
// what Vapi assistants are configured to do.
// =============================================================================

import type {
  VapiCallIntent,
  VapiToolName,
  ConversationStage,
  CallConversationFramework,
} from './vapiTypes';

// ---------------------------------------------------------------------------
// Intent descriptor
// ---------------------------------------------------------------------------

export interface IntentDefinition {
  id:               VapiCallIntent;
  label:            string;
  description:      string;
  entityType:       'lead' | 'client' | 'inbound' | 'lead_or_client';
  entryConditions:  string[];
  momentumContextProvided: string[];
  successCriteria:  string[];
  escalationConditions: string[];
  allowedTools:     VapiToolName[];
  forbiddenActions: string[];
  requiredLeadStages?: string[];    // Lead must be in these stages
  requiredClientHealth?: string[];  // Client health states that qualify
}

export const INTENT_DEFINITIONS: Record<VapiCallIntent, IntentDefinition> = {

  outbound_prospecting: {
    id: 'outbound_prospecting',
    label: 'Outbound Prospecting',
    description: 'Initial outbound call to a prospect to qualify interest and book a discovery meeting.',
    entityType: 'lead',
    entryConditions: [
      'Lead is in suspect or contacted stage',
      'No call in the last 7 days',
      'Lead has a valid phone number',
      'Autopilot policy allows outbound prospecting',
    ],
    momentumContextProvided: [
      'Lead name, business, industry, location',
      'Lead stage and last activity',
      'Outreach history (number of attempts)',
      'Any notes or intelligence available',
      'Assigned sales owner',
    ],
    successCriteria: [
      'Meeting booked',
      'Callback time agreed',
      'Interest confirmed and follow-up planned',
    ],
    escalationConditions: [
      'Prospect requests to speak to a human immediately',
      'Prospect raises legal/compliance question',
      'Call exceeds 3 objections without resolution',
    ],
    allowedTools: [
      'lookupLead', 'createCallNote', 'logObjection', 'logCallOutcome',
      'requestCallback', 'scheduleMeetingRequest', 'createCadenceItem',
      'createDraftFromCallOutcome', 'createApprovalRequest',
    ],
    forbiddenActions: [
      'Making specific price commitments',
      'Making legal or compliance claims',
      'Sharing other client names without consent',
      'Overriding the lead\'s expressed disinterest',
    ],
    requiredLeadStages: ['suspect', 'contacted', 'nurture'],
  },

  appointment_setting: {
    id: 'appointment_setting',
    label: 'Appointment Setting',
    description: 'Focused call to secure a meeting time. Lead has shown prior interest.',
    entityType: 'lead',
    entryConditions: [
      'Lead expressed interest in a meeting (contacted or engaged stage)',
      'No meeting currently scheduled',
      'Call is within active cadence window',
    ],
    momentumContextProvided: [
      'Lead name, business',
      'Prior conversation context / notes',
      'Available meeting types (discovery, strategy, demo)',
      'Meeting calendar link or booking flow (if configured)',
    ],
    successCriteria: [
      'Specific meeting date/time agreed',
      'Meeting booking task created in Momentum',
      'Confirmation sent (if email configured)',
    ],
    escalationConditions: [
      'Lead cannot commit to a time (create callback task)',
      'Lead wants to discuss pricing before meeting',
    ],
    allowedTools: [
      'lookupLead', 'createCallNote', 'scheduleMeetingRequest',
      'requestCallback', 'logCallOutcome', 'createCadenceItem',
      'createApprovalRequest',
    ],
    forbiddenActions: [
      'Committing to specific pricing during booking call',
      'Sharing proprietary meeting links from other systems without approval',
    ],
    requiredLeadStages: ['contacted', 'engaged'],
  },

  discovery_qualification: {
    id: 'discovery_qualification',
    label: 'Discovery / Qualification',
    description: 'Structured discovery call to qualify fit and understand current situation using NEPQ-framed questions.',
    entityType: 'lead',
    entryConditions: [
      'Lead is in engaged or discovery stage',
      'Meeting has been booked or lead agreed to discovery conversation',
    ],
    momentumContextProvided: [
      'Lead name, business, industry',
      'Stated service interest / intent',
      'Available intelligence (website, social, ABR data)',
      'Prior conversation notes',
      'NEPQ discovery question bank for this lead type',
    ],
    successCriteria: [
      'Current situation documented (call note)',
      'Pain/implication captured',
      'Fit decision made (qualified or disqualified)',
      'Next stage action created',
    ],
    escalationConditions: [
      'Lead requests proposal immediately (create approval request)',
      'Lead raises technical questions beyond scope',
    ],
    allowedTools: [
      'lookupLead', 'createCallNote', 'logObjection', 'logCallOutcome',
      'createCadenceItem', 'createDraftFromCallOutcome', 'createApprovalRequest',
    ],
    forbiddenActions: [
      'Making ROI or revenue promises during qualification',
      'Advancing lead stage without logging qualification outcome',
    ],
    requiredLeadStages: ['engaged', 'qualified', 'discovery'],
  },

  strategy_follow_up: {
    id: 'strategy_follow_up',
    label: 'Strategy Follow-Up',
    description: 'Follow-up after a strategy presentation to identify blockers and agree next steps.',
    entityType: 'lead',
    entryConditions: [
      'Lead is in proposal or verbal_commit stage',
      'Strategy or report has been shared (strategyPresentedAt set)',
      'No response within 3+ days',
    ],
    momentumContextProvided: [
      'Lead name, business',
      'Strategy/proposal summary (what was presented)',
      'Days since strategy presented',
      'Any known blockers or objections',
      'Proposed scope and investment range',
    ],
    successCriteria: [
      'Blocker identified and logged',
      'Decision timeline agreed',
      'Next step (meeting, approval, final decision) created',
    ],
    escalationConditions: [
      'Lead requests major scope change (create approval request)',
      'Lead raises pricing objection requiring senior response',
      'Lead appears ready to proceed (create approval request for stage advance)',
    ],
    allowedTools: [
      'lookupLead', 'createCallNote', 'logObjection', 'logCallOutcome',
      'scheduleMeetingRequest', 'requestCallback', 'createCadenceItem',
      'createDraftFromCallOutcome', 'createApprovalRequest',
    ],
    forbiddenActions: [
      'Offering unapproved discounts',
      'Advancing deal stage without a qualified next step',
    ],
    requiredLeadStages: ['proposal', 'verbal_commit', 'discovery'],
  },

  proposal_follow_up: {
    id: 'proposal_follow_up',
    label: 'Proposal Follow-Up',
    description: 'Follow-up after formal proposal delivery to handle objections and move toward commitment.',
    entityType: 'lead',
    entryConditions: [
      'Proposal has been sent/presented',
      'No verbal commit within agreed timeline',
    ],
    momentumContextProvided: [
      'Lead name, business',
      'Proposal scope, value, investment',
      'Known objections from prior conversations',
      'Competitive context if available',
    ],
    successCriteria: [
      'Verbal commit secured',
      'Or: clear objection identified with agreed resolution path',
      'Next step created',
    ],
    escalationConditions: [
      'Lead requests significant changes (create approval request)',
      'Competitor pricing raised (log objection, escalate)',
    ],
    allowedTools: [
      'lookupLead', 'createCallNote', 'logObjection', 'logCallOutcome',
      'scheduleMeetingRequest', 'createCadenceItem', 'createApprovalRequest',
      'createDraftFromCallOutcome',
    ],
    forbiddenActions: [
      'Offering unapproved discounts',
      'Making verbal commitments on behalf of the business owner',
    ],
    requiredLeadStages: ['proposal', 'verbal_commit'],
  },

  dormant_lead_reactivation: {
    id: 'dormant_lead_reactivation',
    label: 'Dormant Lead Reactivation',
    description: 'Re-engage a lead that has gone cold (no activity 30+ days). Low-pressure, value-led approach.',
    entityType: 'lead',
    entryConditions: [
      'Lead is in nurture or was in contacted/engaged stages',
      'No activity for 30+ days',
      'Lead has not opted out',
      'Autopilot dormant-lead sweep triggered this intent',
    ],
    momentumContextProvided: [
      'Lead name, business',
      'Last contact date and channel',
      'Prior conversation summary',
      'Any updated intelligence (new website, news, growth signal)',
    ],
    successCriteria: [
      'Re-engagement confirmed (meeting booked or callback agreed)',
      'Or: explicit opt-out logged (do not contact again)',
    ],
    escalationConditions: [
      'Lead expresses annoyance at being called again',
      'Lead asks to be removed from follow-up (create suppression task)',
    ],
    allowedTools: [
      'lookupLead', 'createCallNote', 'logCallOutcome', 'requestCallback',
      'scheduleMeetingRequest', 'createCadenceItem', 'createApprovalRequest',
    ],
    forbiddenActions: [
      'Calling a lead marked as lost without approval',
      'Making promises about changed pricing or scope',
    ],
    requiredLeadStages: ['nurture', 'contacted', 'engaged'],
  },

  churn_intervention: {
    id: 'churn_intervention',
    label: 'Churn Intervention',
    description: 'Call a client showing churn-risk signals to address concerns and agree a retention plan.',
    entityType: 'client',
    entryConditions: [
      'Expansion engine has flagged client with churn risk score',
      'Churn flag is in approved state for calling',
      'Client has not had a retention call in the last 14 days',
      'Policy allows churn intervention calls',
    ],
    momentumContextProvided: [
      'Client name, business, account value',
      'Churn risk signals (health status, engagement drop, missed milestones)',
      'AI Systems delivery status (from sync layer)',
      'Account history and key milestones',
      'Last NPS or satisfaction signal if available',
    ],
    successCriteria: [
      'Root cause of risk identified',
      'Resolution plan agreed',
      'Follow-up task created',
      'Account health note logged',
    ],
    escalationConditions: [
      'Client threatens immediate cancellation (escalate to human immediately)',
      'Client raises delivery failure (create urgent approval request)',
    ],
    allowedTools: [
      'lookupAccount', 'createCallNote', 'logObjection', 'logCallOutcome',
      'createCadenceItem', 'createApprovalRequest', 'createDraftFromCallOutcome',
    ],
    forbiddenActions: [
      'Offering unapproved refunds or service credits',
      'Making commitments about AI Systems delivery timelines',
      'Escalating delivery issues without creating an approval request',
    ],
    requiredClientHealth: ['red', 'amber'],
  },

  referral_ask: {
    id: 'referral_ask',
    label: 'Referral Ask',
    description: 'Call a satisfied client at the right moment to ask for a referral, using the Referral Engine\'s timing and context.',
    entityType: 'client',
    entryConditions: [
      'Referral Engine has confirmed timing is appropriate',
      'Client health is green',
      'Referral window has not been attempted in the last 60 days',
      'Policy allows referral ask calls',
    ],
    momentumContextProvided: [
      'Client name, business',
      'Recent milestone achieved (website live, ranking improvement, etc)',
      'Referral conversation angles from Referral Engine',
      'Evidence points (what has gone well)',
      'Suggested ask style',
    ],
    successCriteria: [
      'Referral name/business provided (log and create lead)',
      'Referral ask logged (even if declined)',
    ],
    escalationConditions: [
      'Client raises a complaint mid-referral ask (pause, log, escalate)',
    ],
    allowedTools: [
      'lookupAccount', 'createLead', 'createCallNote', 'logCallOutcome',
      'createCadenceItem', 'createApprovalRequest',
    ],
    forbiddenActions: [
      'Calling before Referral Engine confirms timing',
      'Asking for a referral when client health is not green',
    ],
    requiredClientHealth: ['green'],
  },

  inbound_lead_capture: {
    id: 'inbound_lead_capture',
    label: 'Inbound Lead Capture',
    description: 'Handle an inbound call from a prospective new client — capture key details and create a lead record.',
    entityType: 'inbound',
    entryConditions: [
      'Inbound call received on Momentum Vapi number',
      'Caller is unknown (no existing lead/client match)',
    ],
    momentumContextProvided: [
      'Caller phone number (Vapi provides this)',
      'Org context (what services Momentum org offers)',
      'Intake question sequence',
    ],
    successCriteria: [
      'Lead created with: name, business name, service need, urgency, phone',
      'Callback task created for sales owner',
      'Or: meeting booked if caller is ready',
    ],
    escalationConditions: [
      'Caller asks for immediate human (create urgent callback)',
      'Caller is existing client (switch to lookupAccount + route appropriately)',
    ],
    allowedTools: [
      'createLead', 'createCallNote', 'scheduleMeetingRequest',
      'requestCallback', 'logCallOutcome', 'createCadenceItem',
    ],
    forbiddenActions: [
      'Discussing pricing or scope without a sales owner on the call',
      'Creating a lead without at minimum a name and phone number',
    ],
  },
};

// ---------------------------------------------------------------------------
// Guarded conversation frameworks
// ---------------------------------------------------------------------------

export const CALL_FRAMEWORKS: Record<VapiCallIntent, CallConversationFramework> = {

  outbound_prospecting: {
    intent: 'outbound_prospecting',
    stages: [
      {
        stage: 'intro',
        purpose: 'Introduce self and purpose — brief, low-pressure',
        allowedQuestions: [
          'Hi [name], my name is [agent] from [business]. Is now a bad time?',
          'I\'m calling because I noticed [business name] and wanted to ask you something quick.',
        ],
        escalationConditions: ['Immediate objection to the call', 'Request to be removed from list'],
        maxAttempts: 1,
      },
      {
        stage: 'discovery',
        purpose: 'Understand current situation without pressure',
        allowedQuestions: [
          'Out of curiosity, how are you currently finding new clients — mostly through word of mouth, or do you have other things going?',
          'What does your online presence look like at the moment?',
          'Is getting more enquiries through Google something that\'s on your radar?',
        ],
        escalationConditions: ['Firm no to any further discussion'],
        maxAttempts: 2,
      },
      {
        stage: 'implication',
        purpose: 'Surface the implications of the current situation — not push, probe',
        allowedQuestions: [
          'How\'s that been working out for you — is word of mouth consistent?',
          'If you could get more enquiries coming in predictably, is that something that would make a difference for you?',
        ],
        escalationConditions: ['Expressed disinterest after discovery'],
        maxAttempts: 2,
      },
      {
        stage: 'next_step',
        purpose: 'Agree a low-commitment next step',
        allowedQuestions: [
          'Would it make sense to have a quick 20-minute conversation so I can see if there\'s even a fit?',
          'I\'m not going to pitch you anything today — I\'d just like to understand your situation better. Does that sound fair?',
        ],
        escalationConditions: ['Second refusal of a meeting'],
        maxAttempts: 2,
      },
    ],
    allowedTools: ['lookupLead', 'createCallNote', 'logObjection', 'logCallOutcome', 'requestCallback', 'scheduleMeetingRequest', 'createCadenceItem', 'createDraftFromCallOutcome', 'createApprovalRequest'],
    forbiddenTopics: ['Pricing', 'Competitor names', 'Other client names'],
    escalationTriggers: ['Aggression', 'Legal threats', 'Explicit opt-out'],
    systemPromptHints: 'You are a professional, calm outbound agent for [org]. Your goal is to qualify interest and book a discovery conversation — not to sell. Lead with curiosity. Never pressure. If the prospect says no twice, thank them and end the call professionally.',
  },

  appointment_setting: {
    intent: 'appointment_setting',
    stages: [
      { stage: 'intro', purpose: 'Reference prior contact and confirm reason for call', allowedQuestions: ['Hi [name], it\'s [agent] from [business]. You and I spoke [recently / at our last call] about possibly getting together — I wanted to reach out to lock in a time.'], escalationConditions: ['No memory of prior contact'], maxAttempts: 1 },
      { stage: 'next_step', purpose: 'Offer specific meeting times or booking link', allowedQuestions: ['I have some availability [time period] — does any of that work for you?', 'Would [specific time] suit you, or would another day be better?'], escalationConditions: ['Cannot commit to any time'], maxAttempts: 2 },
    ],
    allowedTools: ['lookupLead', 'createCallNote', 'scheduleMeetingRequest', 'requestCallback', 'logCallOutcome', 'createCadenceItem', 'createApprovalRequest'],
    forbiddenTopics: ['Pricing', 'Detailed scope discussions'],
    escalationTriggers: ['Cannot find mutually available time', 'Request for senior contact'],
    systemPromptHints: 'You are booking a meeting. This is not a sales call. Be efficient, warm, and specific about times. If they cannot commit, offer a callback instead.',
  },

  discovery_qualification: {
    intent: 'discovery_qualification',
    stages: [
      { stage: 'intro', purpose: 'Set the frame for the discovery — collaborative, not interrogative', allowedQuestions: ['Thanks for making time. To make the most of this, I\'d love to understand a bit more about where things are at for you at the moment — is that okay?'], escalationConditions: [], maxAttempts: 1 },
      { stage: 'discovery', purpose: 'Current situation — neutral, curious', allowedQuestions: ['Walk me through your current situation with [area]. What\'s been working, what hasn\'t?', 'How long have things been this way?', 'What have you tried so far?'], escalationConditions: [], maxAttempts: 3 },
      { stage: 'implication', purpose: 'Implications of current situation — let them surface it', allowedQuestions: ['What\'s the impact of that on your business?', 'If nothing changed, where would you be in 12 months?', 'How important is solving this to you right now?'], escalationConditions: ['Expressed disinterest in solving the problem'], maxAttempts: 2 },
      { stage: 'solution_framing', purpose: 'Connect what was uncovered to a possible solution path', allowedQuestions: ['Based on what you\'ve described, here\'s what I\'m thinking might be relevant for you...', 'What would need to be true for you to be confident this was the right move?'], escalationConditions: [], maxAttempts: 2 },
      { stage: 'next_step', purpose: 'Agree a qualified next step', allowedQuestions: ['Based on what we\'ve discussed, does it make sense to put together a strategy for you?', 'What\'s the best next step from your perspective?'], escalationConditions: [], maxAttempts: 1 },
    ],
    allowedTools: ['lookupLead', 'createCallNote', 'logObjection', 'logCallOutcome', 'createCadenceItem', 'createDraftFromCallOutcome', 'createApprovalRequest'],
    forbiddenTopics: ['Competitor claims', 'Guaranteed revenue outcomes', 'Specific pricing'],
    escalationTriggers: ['Request for written proposal immediately', 'Legal questions'],
    systemPromptHints: 'You are conducting a structured discovery conversation using curious, problem-focused questions. Do not pitch. Do not reveal pricing. Surface situation → implication → desired state. Log all key insights via createCallNote.',
  },

  strategy_follow_up: {
    intent: 'strategy_follow_up',
    stages: [
      { stage: 'purpose', purpose: 'Reference the strategy and reason for calling', allowedQuestions: ['Hi [name], I wanted to follow up on the strategy we went through — just checking in to see where your head is at.'], escalationConditions: [], maxAttempts: 1 },
      { stage: 'discovery', purpose: 'Identify the blocker or decision status', allowedQuestions: ['What are your thoughts on what we put together?', 'Is there anything that wasn\'t clear, or any part you\'d like to talk through?', 'What\'s holding you back from making a decision at this point?'], escalationConditions: ['Firm no to proceeding'], maxAttempts: 2 },
      { stage: 'objection_handling', purpose: 'Address specific objections with prepared responses', allowedQuestions: ['That\'s a fair concern. Can I share how we\'ve handled that in the past?', 'What would need to change for that not to be a concern?'], escalationConditions: ['Third unresolved objection'], maxAttempts: 3 },
      { stage: 'next_step', purpose: 'Lock in a decision or decision timeline', allowedQuestions: ['What would be a fair timeline for you to make a decision?', 'Would it help to get back on a call with [senior contact] to work through the last questions?'], escalationConditions: [], maxAttempts: 1 },
    ],
    allowedTools: ['lookupLead', 'createCallNote', 'logObjection', 'logCallOutcome', 'scheduleMeetingRequest', 'requestCallback', 'createCadenceItem', 'createDraftFromCallOutcome', 'createApprovalRequest'],
    forbiddenTopics: ['Unapproved discounts', 'Competitor claims'],
    escalationTriggers: ['Pricing objection requiring senior approval', 'Request for scope change'],
    systemPromptHints: 'You are following up after a strategy presentation. Reference the specific strategy. Identify the blocker. Handle objections with curiosity, not pressure. If pricing comes up, log it and create an approval request — do not offer discounts.',
  },

  proposal_follow_up: {
    intent: 'proposal_follow_up',
    stages: [
      { stage: 'purpose', purpose: 'Reference the proposal and reason for following up', allowedQuestions: ['Hi [name], just following up on the proposal we shared — wanted to check in on where you\'re at with it.'], escalationConditions: [], maxAttempts: 1 },
      { stage: 'objection_handling', purpose: 'Surface and handle final objections', allowedQuestions: ['What\'s your biggest hesitation at this point?', 'Is it a question of timing, budget, or confidence in the outcome?'], escalationConditions: ['Firm no or request to stop following up'], maxAttempts: 3 },
      { stage: 'close', purpose: 'Ask for commitment or agree clear next step', allowedQuestions: ['Based on everything we\'ve discussed, are you ready to move forward?', 'If we can address [objection], would you be ready to go ahead?'], escalationConditions: [], maxAttempts: 1 },
    ],
    allowedTools: ['lookupLead', 'createCallNote', 'logObjection', 'logCallOutcome', 'scheduleMeetingRequest', 'createCadenceItem', 'createApprovalRequest', 'createDraftFromCallOutcome'],
    forbiddenTopics: ['Unapproved pricing changes', 'Commitment beyond agreed scope'],
    escalationTriggers: ['Verbal commitment given (create approval request for stage advance)', 'Major scope change requested'],
    systemPromptHints: 'You are following up on a proposal. Focus on uncovering the final objection and resolving it. If the prospect is ready, log the outcome and create an approval request for next steps. Do not offer discounts without approval.',
  },

  dormant_lead_reactivation: {
    intent: 'dormant_lead_reactivation',
    stages: [
      { stage: 'intro', purpose: 'Low-pressure re-engagement — acknowledge time passed', allowedQuestions: ['Hi [name], it\'s [agent] from [business] — we spoke a while back. I just wanted to check in and see how things are going.'], escalationConditions: ['Immediate annoyance'], maxAttempts: 1 },
      { stage: 'discovery', purpose: 'Understand what has changed since last contact', allowedQuestions: ['A lot has changed in the market lately — is [their business area] something you\'re still focused on?', 'Last time we spoke, [context]. Has anything changed since then?'], escalationConditions: ['Firm disinterest'], maxAttempts: 2 },
      { stage: 'next_step', purpose: 'Agree on a low-commitment next step', allowedQuestions: ['Would it make sense to have a fresh conversation? Things have moved on since we last spoke.'], escalationConditions: [], maxAttempts: 1 },
    ],
    allowedTools: ['lookupLead', 'createCallNote', 'logCallOutcome', 'requestCallback', 'scheduleMeetingRequest', 'createCadenceItem', 'createApprovalRequest'],
    forbiddenTopics: ['Pressure to pick up where things left off', 'Assuming prior interest still exists'],
    escalationTriggers: ['Explicit request to stop calling', 'Annoyance at second follow-up'],
    systemPromptHints: 'This is a reactivation call. The lead went cold. Your tone should be warm and non-pushy. Acknowledge time has passed. Lead with value, not follow-up pressure. If they opt out, log it and end the call.',
  },

  churn_intervention: {
    intent: 'churn_intervention',
    stages: [
      { stage: 'intro', purpose: 'Warm, account-manager-style opening', allowedQuestions: ['Hi [name], it\'s [agent] from [business] — I just wanted to touch base and check in on how things are going for you.'], escalationConditions: ['Immediate complaint'], maxAttempts: 1 },
      { stage: 'discovery', purpose: 'Surface the root cause of dissatisfaction', allowedQuestions: ['We\'ve been keeping an eye on things, and I wanted to check — is everything meeting your expectations at the moment?', 'Is there anything that hasn\'t been working as well as you\'d hoped?'], escalationConditions: ['Threat to cancel immediately'], maxAttempts: 2 },
      { stage: 'solution_framing', purpose: 'Frame a resolution path', allowedQuestions: ['I hear you, and I want to make sure we get this right. Here\'s what I\'d like to do...', 'Would it help if [specific action] — would that address your concern?'], escalationConditions: ['Client refuses any resolution attempt'], maxAttempts: 2 },
      { stage: 'next_step', purpose: 'Agree on a retention action', allowedQuestions: ['Can we agree that [action] and I\'ll follow up with you by [date]?'], escalationConditions: [], maxAttempts: 1 },
    ],
    allowedTools: ['lookupAccount', 'createCallNote', 'logObjection', 'logCallOutcome', 'createCadenceItem', 'createApprovalRequest', 'createDraftFromCallOutcome'],
    forbiddenTopics: ['Unapproved service credits or refunds', 'AI Systems delivery promises', 'Blaming AI Systems team'],
    escalationTriggers: ['Immediate cancellation threat', 'Delivery failure allegation requiring senior response'],
    systemPromptHints: 'This is an intervention call for a client at churn risk. Be empathetic and solution-focused. Surface the root cause. Offer to action something concrete. If pricing or refunds come up, create an approval request — do not commit without approval.',
  },

  referral_ask: {
    intent: 'referral_ask',
    stages: [
      { stage: 'intro', purpose: 'Warm check-in, acknowledge recent win', allowedQuestions: ['Hi [name], just checking in — I noticed [milestone, e.g. website went live / rankings improving]. How\'s everything going?'], escalationConditions: [], maxAttempts: 1 },
      { stage: 'discovery', purpose: 'Confirm satisfaction before the ask', allowedQuestions: ['We\'re really glad to hear things are going well. Is there anything you\'re particularly happy with?'], escalationConditions: ['Client raises a complaint — pause referral ask, log issue, escalate'], maxAttempts: 1 },
      { stage: 'next_step', purpose: 'The referral ask — low-pressure, specific', allowedQuestions: ['I\'m glad things are working well. We\'re always looking to help more businesses like yours. Is there anyone in your network you think could benefit from what we\'ve done together?', 'Even if no one comes to mind right now, if someone ever mentions [their area], I\'d love for you to think of us.'], escalationConditions: [], maxAttempts: 1 },
    ],
    allowedTools: ['lookupAccount', 'createLead', 'createCallNote', 'logCallOutcome', 'createCadenceItem', 'createApprovalRequest'],
    forbiddenTopics: ['Pressure to provide a referral', 'Incentive promises not approved by business'],
    escalationTriggers: ['Client raises complaint during call'],
    systemPromptHints: 'This is a referral ask call. It should feel like a warm check-in, not a sales call. Only make the ask after confirming genuine satisfaction. If the client mentions any concern, pause the referral ask, log the issue, and create an approval request.',
  },

  inbound_lead_capture: {
    intent: 'inbound_lead_capture',
    stages: [
      { stage: 'intro', purpose: 'Welcome caller, confirm they\'ve reached the right place', allowedQuestions: ['Thanks for calling [business]. My name is [agent] — how can I help you today?'], escalationConditions: [], maxAttempts: 1 },
      { stage: 'discovery', purpose: 'Capture: name, business, service need, urgency', allowedQuestions: ['Can I get your name?', 'What business are you calling from?', 'What can we help you with?', 'How urgently are you looking to get started?'], escalationConditions: ['Caller wants immediate human'], maxAttempts: 3 },
      { stage: 'next_step', purpose: 'Agree on next step — callback, meeting, or escalate', allowedQuestions: ['Great. The best next step would be for one of our team to call you back — would [timeframe] work?', 'Alternatively, I can book you in for a quick call at a specific time — does that help?'], escalationConditions: [], maxAttempts: 1 },
    ],
    allowedTools: ['createLead', 'createCallNote', 'scheduleMeetingRequest', 'requestCallback', 'logCallOutcome', 'createCadenceItem'],
    forbiddenTopics: ['Specific pricing', 'Delivery timelines', 'Contract terms'],
    escalationTriggers: ['Caller demands human immediately', 'Caller is an existing client (route to account)'],
    systemPromptHints: 'You are the inbound receptionist for [business]. Your job is to capture the caller\'s details and agree a next step. Keep it warm, professional, and efficient. Do not discuss pricing or scope — that is for the sales owner. Always create a lead record.',
  },
};
