// =============================================================================
// ERICA CALLING SYSTEM — VAPI EXECUTION DOMAIN TYPES
// =============================================================================
// Types for the execution bridge layer between Momentum and Vapi.
// Momentum prepares; Vapi executes voice only.
// =============================================================================

import type { EricaCallIntent, EricaCallSource, EricaVapiContextPacket } from './ericaTypes';

// ---------------------------------------------------------------------------
// Call launch — what Momentum sends to Vapi
// ---------------------------------------------------------------------------

export interface EricaVapiCallLaunch {
  launchId:         string;
  batchId:          string;
  batchItemId:      string;
  orgId:            string;
  briefId:          string;
  callIntent:       EricaCallIntent;
  callSource:       EricaCallSource;
  entityType:       'lead' | 'client';
  entityId:         string;
  entityName:       string;
  businessName:     string;
  phoneNumber:      string;
  assistantId:      string;           // Vapi assistant ID (from org config)
  phoneNumberId:    string;           // Vapi phone number ID
  contextPacket:    EricaVapiContextPacket;
  systemPromptHint: string;           // Injected as assistant override
  launchedAt:       string;
  launchedBy:       string;           // userId
}

// ---------------------------------------------------------------------------
// Live call state — tracked on the batch item during execution
// ---------------------------------------------------------------------------

export type EricaVapiCallPhase =
  | 'queued'
  | 'launching'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'cancelled'
  | 'skipped';

export interface EricaVapiCallState {
  phase:            EricaVapiCallPhase;
  momentumCallId?:  string;   // Momentum Firestore callId
  vapiCallId?:      string;   // Vapi's own call ID
  launchedAt?:      string;
  answeredAt?:      string;
  endedAt?:         string;
  durationSeconds?: number;
  lastEventAt:      string;
  lastEventType?:   string;
  failReason?:      string;
  retryCount:       number;
  transcriptCount:  number;   // Number of transcript messages received
}

// ---------------------------------------------------------------------------
// Webhook event — normalised representation of a Vapi webhook payload
// ---------------------------------------------------------------------------

export interface EricaVapiWebhookEvent {
  eventId:          string;
  receivedAt:       string;
  rawType:          string;   // Original Vapi event type string
  normalisedType:   string;   // Normalised (dot → dash, lowercase)
  vapiCallId?:      string;
  momentumCallId?:  string;
  orgId?:           string;
  batchId?:         string;
  batchItemId?:     string;
  entityType?:      string;
  entityId?:        string;
  payload:          Record<string, any>;  // Full original payload
}

// ---------------------------------------------------------------------------
// Execution result — final outcome mapped from Vapi
// ---------------------------------------------------------------------------

export interface EricaVapiExecutionResult {
  resultId:             string;
  batchItemId:          string;
  momentumCallId:       string;
  vapiCallId?:          string;
  phase:                EricaVapiCallPhase;
  outcome:              string;    // mapped from call summary / tool calls
  booked:               boolean;
  bookingDetails?:      { date?: string; time?: string; type?: string; notes?: string };
  objectionRaised?:     string;
  sentimentScore?:      'positive' | 'neutral' | 'negative';
  readinessLevel?:      'hot' | 'warm' | 'cold' | 'unknown';
  summaryNotes?:        string;
  nextStep?:            string;
  followUpRequired:     boolean;
  followUpDate?:        string;
  escalatedToHuman:     boolean;
  durationSeconds?:     number;
  transcriptLines:      number;
  functionCallsSummary: string[];  // Human-readable list of actions taken
  recordedAt:           string;
}

// ---------------------------------------------------------------------------
// Assistant config — per-org Vapi assistant assignment
// ---------------------------------------------------------------------------

export interface EricaVapiAssistantConfig {
  assistantId:    string;
  intentId:       EricaCallIntent;
  name:           string;
  enabled:        boolean;
  notes?:         string;
}

// ---------------------------------------------------------------------------
// Phone number config
// ---------------------------------------------------------------------------

export interface EricaVapiNumberConfig {
  phoneNumberId:  string;
  number:         string;
  label?:         string;
  isDefault:      boolean;
}

// ---------------------------------------------------------------------------
// Error state — recorded when a call launch or webhook fails
// ---------------------------------------------------------------------------

export interface EricaVapiErrorState {
  errorId:        string;
  batchItemId:    string;
  errorType:      'launch_failed' | 'webhook_auth_failed' | 'webhook_parse_failed' | 'tool_failed' | 'reconcile_failed' | 'vapi_error';
  message:        string;
  payload?:       Record<string, any>;
  occurredAt:     string;
  retryable:      boolean;
}

// ---------------------------------------------------------------------------
// Sync state — for the execution workspace to show live status
// ---------------------------------------------------------------------------

export interface EricaVapiSyncState {
  orgId:            string;
  batchId:          string;
  activeCallId?:    string;    // momentumCallId of current live call
  activeItemId?:    string;    // batchItemId of current live call
  activePhase?:     EricaVapiCallPhase;
  lastSyncAt:       string;
  totalLaunched:    number;
  totalCompleted:   number;
  totalFailed:      number;
  totalBooked:      number;
  pendingItems:     string[];  // itemIds still to be called
}

// ---------------------------------------------------------------------------
// Payload builder output — what gets sent to Vapi REST API
// ---------------------------------------------------------------------------

export interface EricaVapiOutboundPayload {
  phoneNumberId:     string;
  assistantId:       string;
  customer: {
    number:  string;
    name?:   string;
  };
  assistantOverrides: {
    firstMessage:   string;
    model: {
      messages: Array<{ role: 'system'; content: string }>;
    };
  };
  metadata: {
    momentumCallId: string;
    orgId:          string;
    batchId:        string;
    batchItemId:    string;
    briefId:        string;
    intent:         string;
    callSource:     string;
    entityType:     string;
    entityId:       string;
    contextPacket:  EricaVapiContextPacket;
  };
}
