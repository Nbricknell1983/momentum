// =============================================================================
// ERICA CALLING SYSTEM — DOMAIN TYPES
// =============================================================================
// Erica is a Momentum voice agent. She never builds her own calling list.
// A human selects targets, Momentum generates the brief, Vapi executes the call.
// =============================================================================

// ---------------------------------------------------------------------------
// Call source — where in Momentum was this batch item created from
// ---------------------------------------------------------------------------

export type EricaCallSource =
  | 'leads'           // Cold/semi-cold leads from pipeline
  | 'clients'         // Existing client nurture/review
  | 'cadence'         // Triggered from active cadence queue
  | 'expansion'       // Upsell/cross-sell opportunity
  | 'referral'        // Referral ask timing confirmed by Referral Engine
  | 'churn'           // Churn-risk flag from Expansion Engine
  | 'dormant'         // Dormant lead reactivation
  | 'manual';         // Manually added without a source system

// ---------------------------------------------------------------------------
// Call intent — what Erica is trying to achieve
// ---------------------------------------------------------------------------

export type EricaCallIntent =
  | 'cold_outreach'
  | 'discovery_qualification'
  | 'strategy_follow_up'
  | 'proposal_follow_up'
  | 'nurture'
  | 'upsell'
  | 'churn_intervention'
  | 'referral_ask'
  | 'dormant_lead_reactivation'
  | 'booking_confirmation';

// ---------------------------------------------------------------------------
// Relationship type — how well Erica knows this person
// ---------------------------------------------------------------------------

export type EricaRelationshipType = 'new' | 'known' | 'existing_client' | 'lapsed';

// ---------------------------------------------------------------------------
// Call tone guidance
// ---------------------------------------------------------------------------

export type EricaCallTone =
  | 'curious_disarming'
  | 'familiar_value_led'
  | 'strategic_consultative'
  | 'warm_relationship'
  | 'direct_confident';

// ---------------------------------------------------------------------------
// Batch status
// ---------------------------------------------------------------------------

export type EricaCallBatchStatus =
  | 'draft'           // Being built, not ready
  | 'ready'           // Reviewed and ready to launch
  | 'launching'       // In the process of starting
  | 'active'          // Currently making calls
  | 'paused'          // Paused mid-batch
  | 'completed'       // All calls made
  | 'cancelled';      // Cancelled before completion

// ---------------------------------------------------------------------------
// Batch item status
// ---------------------------------------------------------------------------

export type EricaCallItemStatus =
  | 'pending'         // Not yet called
  | 'brief_ready'     // Brief generated, ready to call
  | 'brief_failed'    // Brief generation failed
  | 'calling'         // Currently on a call
  | 'completed'       // Call done
  | 'skipped'         // Manually skipped
  | 'blocked'         // Blocked by policy/validation
  | 'failed';         // Call attempt failed

// ---------------------------------------------------------------------------
// Call result / outcome
// ---------------------------------------------------------------------------

export type EricaCallResultOutcome =
  | 'meeting_booked'
  | 'review_call_booked'
  | 'callback_agreed'
  | 'referral_given'
  | 'not_interested'
  | 'no_answer'
  | 'voicemail_left'
  | 'objection_raised'
  | 'follow_up_required'
  | 'escalated_to_human'
  | 'wrong_number'
  | 'unknown';

// ---------------------------------------------------------------------------
// Deal Intelligence snapshot — what Erica knows about a lead
// ---------------------------------------------------------------------------

export interface EricaDealIntelligenceSnapshot {
  leadId:           string;
  name:             string;
  businessName:     string;
  contactName?:     string;
  phone?:           string;
  stage:            string;
  source:           string;
  opportunitySummary?: string;
  servicesDiscussed?:  string[];
  pricingContext?:     string;
  statedGoals?:        string[];
  knownBlockers?:      string[];
  lastProposalState?:  string;
  lastStrategyDate?:   string;
  lastActivityAt?:     string;
  lastActivityType?:   string;
  urgency?:            'high' | 'medium' | 'low' | 'unknown';
  decisionMaker?:      string;
  nextBestAction?:     string;
  notes?:              string;
}

// ---------------------------------------------------------------------------
// Client Intelligence snapshot — what Erica knows about an account
// ---------------------------------------------------------------------------

export interface EricaClientIntelligenceSnapshot {
  clientId:            string;
  businessName:        string;
  contactName?:        string;
  phone?:              string;
  accountState:        string;
  healthStatus:        string;
  activeModules:       string[];
  deliveryHistory?:    string;
  priorOutcomes?:      string[];
  engagementLevel?:    'high' | 'medium' | 'low' | 'unknown';
  communicationHistory?: string;
  milestones?:         string[];
  knownFrustrations?:  string[];
  expansionOpportunities?: string[];
  churnSignals?:       string[];
  relationshipStrength?: 'strong' | 'neutral' | 'at_risk';
  lastNPS?:            number;
  accountValue?:       string;
}

// ---------------------------------------------------------------------------
// Opening angle — how Erica opens the call
// ---------------------------------------------------------------------------

export interface EricaOpeningAngle {
  frameworkUsed:  'nepq' | 'voss' | 'permission' | 'reference' | 'curiosity' | 'relationship';
  openingLine:    string;         // Suggested first line
  permissionAsk?: string;         // "Is now a bad time?" variant
  curiosityHook?: string;         // If using curiosity framing
  referencePoint?: string;        // What prior context to reference
  disarmingPhrase?: string;       // Pattern interrupt / disarm
}

// ---------------------------------------------------------------------------
// Objection prediction
// ---------------------------------------------------------------------------

export type EricaObjectionType =
  | 'price_too_expensive'
  | 'too_busy'
  | 'not_ready'
  | 'need_to_think'
  | 'already_have_provider'
  | 'poor_agency_experience'
  | 'partner_approval_needed'
  | 'no_urgency'
  | 'not_decision_maker'
  | 'skeptical_of_results'
  | 'other';

export interface EricaObjectionPrediction {
  objectionType:         EricaObjectionType;
  likelihood:            'high' | 'medium' | 'low';
  underlyingConcern:     string;
  suggestedFraming:      string;
  calibratedQuestion:    string;   // "How" or "What" question to use
  vossLabel?:            string;   // "It sounds like..." or "It seems like..."
  whatToAvoid:           string;
  howAppointmentHelps:   string;
}

// ---------------------------------------------------------------------------
// Question plan — NEPQ-style discovery questions
// ---------------------------------------------------------------------------

export interface EricaQuestionPlan {
  situationQuestions:   string[];   // Current state questions
  problemQuestions:     string[];   // Implication / pain questions
  implicationQuestions: string[];   // "What happens if nothing changes?"
  desiredOutcome:       string[];   // Solution framing questions
  calibratedQuestions:  string[];   // Voss-style "What / How" questions
}

// ---------------------------------------------------------------------------
// Close strategy
// ---------------------------------------------------------------------------

export interface EricaCloseStrategy {
  approachType:     'appointment_ask' | 'low_commitment_next_step' | 'review_call' | 'referral_ask';
  closeStatement:   string;
  fallbackClose:    string;
  trialClose?:      string;   // Test-the-water close before main close
  urgencyFrame?:    string;   // If urgency is relevant
  whatNotToSay:     string[];
}

// ---------------------------------------------------------------------------
// Full call brief — everything Erica needs before dialling
// ---------------------------------------------------------------------------

export interface EricaCallBrief {
  briefId:          string;
  batchItemId:      string;
  generatedAt:      string;

  // Who
  entityType:       'lead' | 'client';
  entityId:         string;
  entityName:       string;
  businessName:     string;
  contactName?:     string;
  phone?:           string;

  // Why
  callIntent:       EricaCallIntent;
  callSource:       EricaCallSource;
  relationship:     EricaRelationshipType;
  callTone:         EricaCallTone;
  primaryObjective: string;

  // Context
  whyCallingNow:    string;         // Human-readable explanation
  dealSnapshot?:    EricaDealIntelligenceSnapshot;
  clientSnapshot?:  EricaClientIntelligenceSnapshot;

  // Strategy
  openingAngle:     EricaOpeningAngle;
  questionPlan:     EricaQuestionPlan;
  objectionPredictions: EricaObjectionPrediction[];
  closeStrategy:    EricaCloseStrategy;

  // Guardrails
  allowedTools:     string[];
  whatNotToSay:     string[];
  escalationTriggers: string[];

  // Vapi context packet — structured payload sent to Vapi assistant
  vapiContextPacket: EricaVapiContextPacket;
}

// ---------------------------------------------------------------------------
// Context packet sent to Vapi when the call is launched
// ---------------------------------------------------------------------------

export interface EricaVapiContextPacket {
  callType:         EricaCallIntent;
  source:           EricaCallSource;
  relationship:     EricaRelationshipType;
  tone:             EricaCallTone;
  objective:        string;
  entityName:       string;
  businessName:     string;
  contactName?:     string;
  openingLine:      string;
  whyCallingNow:    string;
  dealSummary?:     string;
  clientSummary?:   string;
  keyObjections:    string[];
  topQuestions:     string[];
  closeApproach:    string;
  allowedTools:     string[];
  whatNotToSay:     string[];
}

// ---------------------------------------------------------------------------
// Call context — derived from source
// ---------------------------------------------------------------------------

export interface EricaCallContext {
  callSource:       EricaCallSource;
  callIntent:       EricaCallIntent;
  relationship:     EricaRelationshipType;
  callTone:         EricaCallTone;
  primaryObjective: string;
  secondaryObjective?: string;
  callFramework:    'nepq_cold' | 'nepq_warm' | 'voss_follow_up' | 'relationship_nurture' | 'expansion' | 'referral';
}

// ---------------------------------------------------------------------------
// Call target — a single entity in a batch
// ---------------------------------------------------------------------------

export interface EricaCallTarget {
  entityType:       'lead' | 'client';
  entityId:         string;
  entityName:       string;
  businessName:     string;
  contactName?:     string;
  phone?:           string;
  stage?:           string;
  source:           EricaCallSource;
  reason:           string;         // Why this target was selected
}

// ---------------------------------------------------------------------------
// Batch item — one record inside a batch
// ---------------------------------------------------------------------------

export interface EricaCallBatchItem {
  itemId:           string;
  batchId:          string;
  target:           EricaCallTarget;
  context:          EricaCallContext;
  status:           EricaCallItemStatus;
  priority:         number;          // Lower = called first
  brief?:           EricaCallBrief;
  briefStatus:      'not_generated' | 'generating' | 'ready' | 'failed';
  blockedReason?:   string;
  callId?:          string;          // Momentum callId once launched
  vapiCallId?:      string;
  result?:          EricaCallResult;
  addedAt:          string;
  calledAt?:        string;
  completedAt?:     string;
  warnings:         string[];
}

// ---------------------------------------------------------------------------
// Call result — written back after a call
// ---------------------------------------------------------------------------

export interface EricaCallResult {
  resultId:         string;
  batchItemId:      string;
  callId:           string;
  outcome:          EricaCallResultOutcome;
  booked:           boolean;
  appointmentDetails?: {
    date?:    string;
    time?:    string;
    type?:    string;
    notes?:   string;
  };
  objectionRaised?:   EricaObjectionType;
  sentimentScore?:    'positive' | 'neutral' | 'negative';
  readinessLevel?:    'hot' | 'warm' | 'cold' | 'unknown';
  nextStep?:          string;
  summaryNotes?:      string;
  followUpRequired:   boolean;
  followUpDate?:      string;
  escalatedToHuman:   boolean;
  callDurationSeconds?: number;
  recordedAt:         string;
}

// ---------------------------------------------------------------------------
// Batch — the top-level call batch
// ---------------------------------------------------------------------------

export interface EricaCallBatch {
  batchId:          string;
  orgId:            string;
  name:             string;
  description?:     string;
  status:           EricaCallBatchStatus;
  items:            EricaCallBatchItem[];
  totalTargets:     number;
  completedCalls:   number;
  bookedCalls:      number;
  failedCalls:      number;
  skippedCalls:     number;
  createdBy:        string;
  createdAt:        string;
  launchedAt?:      string;
  completedAt?:     string;
  lastActiveAt?:    string;
  currentItemId?:   string;  // Which item is being called right now
  pausedReason?:    string;
  assistantId?:     string;  // Vapi assistant ID to use for this batch
}

// ---------------------------------------------------------------------------
// Launch state — transient UI state for the launch flow
// ---------------------------------------------------------------------------

export interface EricaCallLaunchState {
  batchId:          string;
  phase:            'selecting' | 'reviewing' | 'generating_briefs' | 'ready' | 'calling' | 'paused' | 'done';
  currentItemIndex: number;
  totalItems:       number;
  briefsReady:      number;
  briefsFailed:     number;
  canLaunch:        boolean;
  blockingReasons:  string[];
}

// ---------------------------------------------------------------------------
// Preparation state — summary for the review screen
// ---------------------------------------------------------------------------

export interface EricaCallPreparationState {
  batch:            EricaCallBatch;
  readyItems:       EricaCallBatchItem[];
  blockedItems:     EricaCallBatchItem[];
  missingPhone:     EricaCallBatchItem[];
  missingBrief:     EricaCallBatchItem[];
  warnings:         Array<{ itemId: string; message: string }>;
  canLaunch:        boolean;
  blockingReasons:  string[];
}
