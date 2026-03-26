// =============================================================================
// ERICA RESCHEDULE + CANCEL DOMAIN TYPES
// =============================================================================
// Models for the full booking-change lifecycle:
//   Change request → Slot selection → Provider action → Record update → Comm
//
// Momentum is always the source of truth for:
//   - all booking change records and history
//   - fallback reasons and manual task queues
//   - communication outcomes after changes
//   - linked call/entity/batch context
// =============================================================================

// ---------------------------------------------------------------------------
// Who initiated the change
// ---------------------------------------------------------------------------

export type EricaChangeInitiator = 'erica' | 'operator' | 'prospect' | 'system';

// ---------------------------------------------------------------------------
// Why the change was made
// ---------------------------------------------------------------------------

export type EricaBookingChangeReason =
  | 'prospect_requested'      // Prospect asked to move/cancel
  | 'operator_requested'      // Operator initiated
  | 'erica_recommended'       // Erica suggested during call
  | 'scheduling_conflict'     // Original slot no longer available
  | 'no_show'                 // Prospect did not attend — may reschedule
  | 'provider_error'          // Calendar provider returned an error
  | 'other';

// ---------------------------------------------------------------------------
// Status of the change request
// ---------------------------------------------------------------------------

export type EricaBookingChangeStatus =
  | 'pending'                 // Change request created, awaiting action
  | 'awaiting_slot_selection' // New slots offered, prospect choosing
  | 'confirmed'               // Change completed successfully
  | 'fallback_pending'        // Provider unavailable — operator task created
  | 'cancelled'               // Change request itself was cancelled
  | 'failed';                 // Change attempt failed

// ---------------------------------------------------------------------------
// The inbound change request (reschedule or cancel)
// ---------------------------------------------------------------------------

export type EricaBookingChangeType = 'reschedule' | 'cancel';

export interface EricaBookingChangeRequest {
  changeId:          string;
  orgId:             string;
  createdAt:         string;           // ISO
  changeType:        EricaBookingChangeType;
  status:            EricaBookingChangeStatus;

  // Source booking
  bookingId:         string;           // EricaConfirmedBooking or EricaBookingRequest ID
  bookingType:       'confirmed' | 'request';
  entityType:        'lead' | 'client';
  entityId:          string;
  entityName:        string;
  businessName:      string;
  contactName?:      string;

  // Call linkage
  callId?:           string;
  batchId?:          string;
  batchItemId?:      string;

  // Change intent
  reason:            EricaBookingChangeReason;
  reasonNote?:       string;           // Optional free-text from operator
  initiatedBy:       EricaChangeInitiator;

  // Reschedule-specific
  preferredWindow?:  {
    fromDate:        string;
    toDate:          string;
    preference:      'morning' | 'afternoon' | 'any';
    timezone:        string;
    durationMinutes: number;
  };
  offeredSlots?:     any[];            // EricaBookingSlot[]
  selectedSlotId?:   string;
  selectedWindowId?: string;
}

// ---------------------------------------------------------------------------
// A slot option offered during a reschedule
// ---------------------------------------------------------------------------

export interface EricaRescheduleOption {
  slotId:     string;
  windowId:   string;
  dateLabel:  string;
  timeLabel:  string;
  startIso:   string;
  endIso:     string;
}

// ---------------------------------------------------------------------------
// Outcome of a reschedule attempt
// ---------------------------------------------------------------------------

export type EricaRescheduleOutcomeKey =
  | 'rescheduled'              // Successfully rescheduled via provider
  | 'reschedule_request_created' // Fallback — operator task created
  | 'slots_offered'            // Slots returned, awaiting selection
  | 'no_slots_available'       // Checked but nothing free
  | 'failed';

export interface EricaRescheduleOutcome {
  outcomeKey:       EricaRescheduleOutcomeKey;
  success:          boolean;
  changeId:         string;
  bookingId:        string;

  newSlot?:         any;               // EricaBookingSlot if confirmed
  offeredSlots?:    any[];
  calendarEventId?: string;
  meetingLink?:     string;

  fallbackUsed:     boolean;
  fallbackReason?:  string;

  notes:            string;
  nextStep:         string;
  processedAt:      string;
  processedBy:      string;
}

// ---------------------------------------------------------------------------
// Outcome of a cancellation attempt
// ---------------------------------------------------------------------------

export type EricaCancellationOutcomeKey =
  | 'cancelled'                // Successfully cancelled
  | 'cancellation_request_created' // Fallback — operator task created
  | 'failed';

export interface EricaCancellationOutcome {
  outcomeKey:       EricaCancellationOutcomeKey;
  success:          boolean;
  changeId:         string;
  bookingId:        string;

  calendarEventCancelled: boolean;
  remindersSuppressed:    number;

  fallbackUsed:     boolean;
  fallbackReason?:  string;

  notes:            string;
  nextStep:         string;
  processedAt:      string;
  processedBy:      string;
}

// ---------------------------------------------------------------------------
// Auditable record of every change event
// ---------------------------------------------------------------------------

export type EricaBookingChangeAuditEventType =
  | 'change_request_created'
  | 'slots_offered'
  | 'slot_selected'
  | 'provider_event_updated'
  | 'provider_event_cancelled'
  | 'booking_rescheduled'
  | 'booking_cancelled'
  | 'fallback_task_created'
  | 'reminder_suppressed'
  | 'confirmation_sent'
  | 'change_failed';

export interface EricaBookingChangeAudit {
  auditId:      string;
  changeId:     string;
  bookingId:    string;
  orgId:        string;
  eventType:    EricaBookingChangeAuditEventType;
  note:         string;
  metadata?:    Record<string, any>;
  performedBy:  string;
  at:           string;
}

// ---------------------------------------------------------------------------
// Tool payloads
// ---------------------------------------------------------------------------

export interface RequestRescheduleToolPayload {
  bookingId:       string;
  entityId:        string;
  entityType:      'lead' | 'client';
  callId?:         string;
  reason:          EricaBookingChangeReason;
  reasonNote?:     string;
  preferenceTime:  'morning' | 'afternoon' | 'any';
  timezone:        string;
  lookAheadDays:   number;
  durationMinutes: number;
}

export interface ConfirmRescheduleToolPayload {
  changeId:    string;
  bookingId:   string;
  slotId:      string;
  windowId:    string;
  callId?:     string;
}

export interface RequestCancellationToolPayload {
  bookingId:  string;
  entityId:   string;
  entityType: 'lead' | 'client';
  callId?:    string;
  reason:     EricaBookingChangeReason;
  reasonNote?: string;
}
