// =============================================================================
// ERICA ASSISTANT RUNTIME CONFIG — TYPE MODELS
// =============================================================================
// These types define exactly how Erica behaves in a live conversation.
// The EricaRuntimePacket is the complete operational brief delivered to Vapi
// at call launch. Every field is derived from the Momentum EricaCallBrief —
// Erica never operates from a generic fallback.
// =============================================================================

import type { EricaCallIntent, EricaCallSource, EricaRelationshipType, EricaCallTone } from '../../client/src/lib/ericaTypes';

// ---------------------------------------------------------------------------
// Erica assistant persona (voice / brand)
// ---------------------------------------------------------------------------

export interface EricaAssistantProfile {
  name:            string;          // Always "Erica" in prod
  voiceId:         string;          // Vapi voice ID
  personality:     string;          // One-liner persona description
  speakingStyle:   string;          // e.g. "warm, direct, curious — never pushy"
  forbiddenWords:  string[];        // Words Erica must never use
  maxCallDuration: number;          // Seconds — safety limit
  silenceTimeoutMs: number;         // How long before Erica re-engages
}

// ---------------------------------------------------------------------------
// Opening strategy — how Erica starts the call
// ---------------------------------------------------------------------------

export type EricaOpeningStyleKey =
  | 'pattern_interrupt'     // "Hey [name] — this is going to sound a bit random…"
  | 'referral_hook'         // "I was introduced by / I came across [trigger]…"
  | 'insight_led'           // "I was looking at [X] and noticed [Y]…"
  | 'relationship_check_in' // "Hey [name], catching up on how [business] is going…"
  | 'direct_value'          // "[Name], I help [niche] with [X]…"
  | 'reactivation_bridge';  // "We spoke [time ago] about [X] — wanted to reach back out…"

export interface EricaOpeningStrategy {
  styleKey:        EricaOpeningStyleKey;
  openingLine:     string;          // Exact first line Erica should say
  followUpBridge:  string;          // Sentence to bridge after first response
  permissionAsk:   string;          // Soft permission to continue
  tone:            EricaCallTone;
  maxOpeningWords: number;          // Keep opening under this word count
}

// ---------------------------------------------------------------------------
// NEPQ question plan — staged discovery
// ---------------------------------------------------------------------------

export interface NEPQQuestionStage {
  stage:       'situation' | 'problem' | 'consequence' | 'solution_awareness';
  question:    string;
  intent:      string;   // What this question is designed to surface
  ifNegative:  string;   // Follow-up if they respond negatively / close off
  vossVariant: string;   // Chris Voss mirror/label/calibrated alternative
}

export interface EricaQuestionStrategy {
  framework:    'nepq_cold' | 'nepq_warm' | 'voss_follow_up' | 'relationship_nurture' | 'expansion' | 'referral';
  stages:       NEPQQuestionStage[];
  maxQuestions: number;   // Don't exceed this in one call
  pivotSignal:  string;   // What to listen for to pivot toward close
}

// ---------------------------------------------------------------------------
// Objection handling plan — guardrailed responses per objection
// ---------------------------------------------------------------------------

export type EricaObjectionKey =
  | 'too_expensive'
  | 'too_busy'
  | 'need_to_think'
  | 'already_have_provider'
  | 'not_ready'
  | 'partner_approval'
  | 'bad_prior_experience'
  | 'no_urgency';

export interface EricaObjectionResponse {
  objectionKey:    EricaObjectionKey;
  label:           string;          // Voss empathy label: "It sounds like…"
  acknowledgement: string;          // Pure acknowledgement, no defence
  calibratedQuestion: string;       // "What would need to be different…?"
  nepqReframe:     string;          // Consequence/solution reframe
  appointmentAsk:  string;          // Appointment pivot after handling
  doNotSay:        string[];        // Hard rules for this objection
}

export interface EricaObjectionHandlingPlan {
  mode:        'non_pushy' | 'direct' | 'empathetic_only';
  maxAttempts: number;     // Max times to address same objection before releasing
  responses:   EricaObjectionResponse[];
}

// ---------------------------------------------------------------------------
// Close plan — appointment / outcome focused
// ---------------------------------------------------------------------------

export type EricaCloseStyleKey =
  | 'assumptive_soft'       // "Based on what you've said, a quick 20 mins would be worth it…"
  | 'choice_alternative'    // "Would [day] or [day] work better for you?"
  | 'next_step_only'        // "Can I send you a quick summary and we go from there?"
  | 'value_bridge'          // "The reason I'd suggest we meet is [X]…"
  | 'permission_based';     // "Would it be okay if I sent you a calendar invite?"

export interface EricaClosePlan {
  styleKey:        EricaCloseStyleKey;
  closingStatement: string;
  calendarAsk:     string;
  fallbackClose:   string;          // If first close rejected — a softer option
  releaseStatement: string;         // What Erica says if they're still not ready
  maxCloseAttempts: number;
  urgencyHook?:    string;          // Optional urgency — must be truthful
}

// ---------------------------------------------------------------------------
// Allowed action set — what Erica can actually do in this call
// ---------------------------------------------------------------------------

export type EricaAllowedAction =
  | 'book_appointment'
  | 'take_message'
  | 'request_callback'
  | 'create_followup_task'
  | 'log_objection'
  | 'log_call_outcome'
  | 'schedule_meeting_request'
  | 'create_draft_from_outcome'
  | 'escalate_to_human';

export interface EricaAllowedActionSet {
  allowed:  EricaAllowedAction[];
  blocked:  EricaAllowedAction[];
  primary:  EricaAllowedAction;     // The main outcome Erica should aim for
  fallback: EricaAllowedAction;     // If primary is not possible
}

// ---------------------------------------------------------------------------
// Conversation guardrails
// ---------------------------------------------------------------------------

export interface EricaConversationGuardrail {
  doNotMention:       string[];     // Topics to actively avoid
  doNotPromise:       string[];     // Commitments Erica cannot make
  doNotUseTools:      string[];     // Tool names explicitly blocked
  escalationTriggers: string[];     // Phrases/situations requiring human escalation
  maxCallDuration:    number;       // Hard cutoff in seconds
  silenceRecovery:    string;       // What Erica says after silence
  endCallStatement:   string;       // Polite call wrap-up line
}

// ---------------------------------------------------------------------------
// Per-intent conversation style
// ---------------------------------------------------------------------------

export type EricaIntentStyleKey = EricaCallIntent;

export interface EricaIntentStyle {
  intent:          EricaIntentStyleKey;
  openingStyle:    EricaOpeningStyleKey;
  discoveryStyle:  'full_nepq' | 'light_check_in' | 'problem_focused' | 'value_confirming' | 'risk_aware';
  objectionStyle:  'empathetic_voss' | 'nepq_consequence' | 'release_and_schedule' | 'silence_mirror';
  closeStyle:      EricaCloseStyleKey;
  frameworkNote:   string;          // Operator-facing note about this intent
}

// ---------------------------------------------------------------------------
// Structured conversation outcome — what Erica should always return
// ---------------------------------------------------------------------------

export type EricaCallOutcomeKey =
  | 'booked'
  | 'callback_scheduled'
  | 'no_answer'
  | 'left_message'
  | 'not_interested'
  | 'objection_unresolved'
  | 'escalated'
  | 'wrong_number'
  | 'follow_up_required'
  | 'nurture_continue';

export interface EricaConversationOutcome {
  outcomeKey:         EricaCallOutcomeKey;
  booked:             boolean;
  appointmentDetails?: {
    date?:   string;
    time?:   string;
    format?: 'zoom' | 'phone' | 'in_person';
  };
  objectionRaised?:   EricaObjectionKey;
  sentimentScore:     number;       // 0–100 (0 = hostile, 100 = warm)
  readinessScore:     number;       // 0–100 (0 = not ready, 100 = ready)
  keyTakeaway:        string;
  nextStep:           string;
  noteSummary:        string;
  escalationRequired: boolean;
  escalationReason?:  string;
  followUpRequired:   boolean;
  followUpDate?:      string;       // ISO
  allowedActions:     EricaAllowedAction[];
}

// ---------------------------------------------------------------------------
// Runtime config (org-level — stored in Firestore)
// ---------------------------------------------------------------------------

export interface EricaRuntimeConfig {
  orgId:                  string;
  updatedAt:              string;
  updatedBy:              string;

  assistantProfile:       EricaAssistantProfile;
  openingStyleOverrides?: Partial<Record<EricaIntentStyleKey, EricaOpeningStyleKey>>;
  objectionHandlingMode:  'non_pushy' | 'direct' | 'empathetic_only';
  closeAggressiveness:    'soft' | 'standard' | 'persistent';   // maps to close attempt count
  genericFallbackAllowed: boolean;  // MUST be false in production
  safetyToggles: {
    requireBriefBeforeLaunch:  boolean;
    blockCallWithoutPhone:     boolean;
    blockCallWithoutBrief:     boolean;
    maxCallDurationOverride?:  number;
  };
}

// ---------------------------------------------------------------------------
// The complete runtime packet — delivered to Vapi at launch
// ---------------------------------------------------------------------------

export interface EricaRuntimePacket {
  packetId:         string;
  briefId:          string;
  batchItemId:      string;
  generatedAt:      string;

  // Identity
  callIntent:       EricaCallIntent;
  callSource:       EricaCallSource;
  relationship:     EricaRelationshipType;
  entityName:       string;
  businessName:     string;
  contactName?:     string;
  phone?:           string;

  // Strategy layers
  assistantProfile:  EricaAssistantProfile;
  openingStrategy:   EricaOpeningStrategy;
  questionStrategy:  EricaQuestionStrategy;
  objectionPlan:     EricaObjectionHandlingPlan;
  closePlan:         EricaClosePlan;
  allowedActions:    EricaAllowedActionSet;
  guardrails:        EricaConversationGuardrail;
  intentStyle:       EricaIntentStyle;

  // Pre-built system prompt for Vapi
  systemPrompt:      string;

  // Summary for operator inspection
  inspectionSummary: {
    intentLabel:        string;
    openingStyleLabel:  string;
    objectionModeLabel: string;
    closeStyleLabel:    string;
    allowedActionCount: number;
    guardrailCount:     number;
    questionCount:      number;
  };
}
