// =============================================================================
// ERICA CALENDAR + BOOKING INTEGRATION — DOMAIN TYPES
// =============================================================================
// Models for the full booking lifecycle:
//   Availability check → Slot offer → Slot selection → Confirmation → Record
//
// Momentum is always the source of truth for booking intent and outcome.
// The calendar provider (Google Calendar or future adapters) is treated as
// an external integration — the fallback booking-request flow is always
// available when the provider is absent or unavailable.
// =============================================================================

// ---------------------------------------------------------------------------
// Meeting format
// ---------------------------------------------------------------------------

export type EricaBookingFormat = 'zoom' | 'phone' | 'google_meet' | 'in_person' | 'teams';

// ---------------------------------------------------------------------------
// Calendar provider identity
// ---------------------------------------------------------------------------

export type EricaCalendarProvider = 'google_calendar' | 'none';

// ---------------------------------------------------------------------------
// Provider configuration state — what is configured, what is missing
// ---------------------------------------------------------------------------

export interface EricaBookingProviderState {
  provider:          EricaCalendarProvider;
  configured:        boolean;
  missingSecrets:    string[];      // Exact Replit Secret keys that are absent
  missingSetup:      string[];      // Human-readable setup steps outstanding
  canCheckAvailability: boolean;
  canCreateBookings:    boolean;
  lastCheckedAt:     string;        // ISO timestamp
}

// ---------------------------------------------------------------------------
// Availability window — the search range
// ---------------------------------------------------------------------------

export type EricaTimePreference = 'morning' | 'afternoon' | 'any';

export interface EricaBookingAvailabilityWindow {
  windowId:          string;
  orgId:             string;
  requestedAt:       string;        // ISO
  fromDate:          string;        // YYYY-MM-DD
  toDate:            string;        // YYYY-MM-DD
  preference:        EricaTimePreference;
  durationMinutes:   number;        // Desired meeting length
  timezone:          string;        // IANA tz, e.g. "Australia/Sydney"
  requestedBy:       string;        // momentumCallId or userId
  callId?:           string;
  entityType?:       'lead' | 'client';
  entityId?:         string;
}

// ---------------------------------------------------------------------------
// A single candidate time slot
// ---------------------------------------------------------------------------

export interface EricaBookingSlot {
  slotId:            string;
  windowId:          string;        // Parent window
  startIso:          string;        // ISO 8601
  endIso:            string;        // ISO 8601
  startLocal:        string;        // Human-readable in target timezone
  endLocal:          string;
  dateLabel:         string;        // "Tuesday 8th April"
  timeLabel:         string;        // "9:00 AM – 9:30 AM AEST"
  available:         boolean;
  source:            'google_calendar' | 'manual';
}

// ---------------------------------------------------------------------------
// Booking request — fallback / pre-confirmation intent record
// ---------------------------------------------------------------------------

export type EricaBookingRequestStatus =
  | 'pending'         // Waiting for human to confirm a slot
  | 'offered'         // Slots have been offered to the prospect
  | 'accepted'        // Prospect accepted; awaiting system confirmation
  | 'converted'       // Converted to a confirmed booking
  | 'expired'         // No response — slot window passed
  | 'cancelled';      // Cancelled before confirmation

export interface EricaBookingRequest {
  requestId:         string;
  orgId:             string;
  createdAt:         string;        // ISO — DD/MM/YYYY for display
  status:            EricaBookingRequestStatus;

  // Context
  entityType:        'lead' | 'client';
  entityId:          string;
  entityName:        string;
  businessName:      string;
  contactName?:      string;
  phone?:            string;

  // Call linkage
  callId?:           string;
  batchId?:          string;
  batchItemId?:      string;
  briefId?:          string;

  // Intent
  meetingPurpose:    string;
  durationMinutes:   number;
  preferredFormat:   EricaBookingFormat;
  preferredTimezone: string;
  preferredWindow?:  EricaBookingAvailabilityWindow;
  offeredSlots?:     EricaBookingSlot[];

  // Notes
  internalNotes?:    string;
  operatorNotes?:    string;
  fallbackReason?:   string;
}

// ---------------------------------------------------------------------------
// Confirmed booking — a real appointment in the calendar
// ---------------------------------------------------------------------------

export type EricaConfirmedBookingStatus =
  | 'confirmed'
  | 'rescheduled'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export interface EricaConfirmedBooking {
  bookingId:         string;
  orgId:             string;
  createdAt:         string;        // ISO
  updatedAt:         string;

  status:            EricaConfirmedBookingStatus;

  // Context
  entityType:        'lead' | 'client';
  entityId:          string;
  entityName:        string;
  businessName:      string;
  contactName?:      string;
  contactEmail?:     string;
  phone?:            string;

  // Call linkage
  callId?:           string;
  batchId?:          string;
  batchItemId?:      string;
  briefId?:          string;
  requestId?:        string;        // If converted from a booking request

  // Appointment detail
  slot:              EricaBookingSlot;
  format:            EricaBookingFormat;
  meetingPurpose:    string;
  meetingLink?:      string;        // Zoom/Meet link
  calendarEventId?:  string;        // Provider-side event ID
  calendarProvider?: EricaCalendarProvider;

  // Outcome (set after meeting)
  meetingOutcome?:   string;
  meetingNotes?:     string;
}

// ---------------------------------------------------------------------------
// Fallback reason — why live booking was not used
// ---------------------------------------------------------------------------

export type EricaBookingFallbackReason =
  | 'provider_not_configured'     // No calendar integration set up
  | 'provider_auth_failed'        // OAuth token expired or invalid
  | 'no_slots_available'          // Calendar checked but no free slots
  | 'prospect_preferred_callback' // Prospect asked to be called back
  | 'call_ended_before_booking'   // Call ended before slot was selected
  | 'erica_not_allowed'           // Runtime packet does not permit booking
  | 'api_error';                  // Provider returned an error

// ---------------------------------------------------------------------------
// Booking outcome — the structured result of any booking attempt
// ---------------------------------------------------------------------------

export type EricaBookingOutcomeKey =
  | 'booked'
  | 'booking_request_created'
  | 'follow_up_task_created'
  | 'declined'
  | 'failed';

export interface EricaBookingOutcome {
  outcomeKey:          EricaBookingOutcomeKey;
  success:             boolean;

  booking?:            EricaConfirmedBooking;
  bookingRequest?:     EricaBookingRequest;

  fallbackUsed:        boolean;
  fallbackReason?:     EricaBookingFallbackReason;

  slotOfferedCount:    number;
  slotSelectedId?:     string;

  calendarEventId?:    string;
  meetingLink?:        string;

  notes:               string;
  nextStep:            string;

  processedAt:         string;      // ISO
  processedBy:         string;      // 'erica' | userId
}

// ---------------------------------------------------------------------------
// Tool payloads — structured inputs from Erica tool calls
// ---------------------------------------------------------------------------

export interface CheckAvailabilityToolPayload {
  entityId:           string;
  entityType:         'lead' | 'client';
  callId?:            string;
  durationMinutes:    number;
  preferenceTime:     EricaTimePreference;
  timezone:           string;
  lookAheadDays:      number;       // How many days forward to search (1–14)
}

export interface CreateBookingToolPayload {
  entityId:           string;
  entityType:         'lead' | 'client';
  callId?:            string;
  batchId?:           string;
  batchItemId?:       string;
  briefId?:           string;
  slotId:             string;       // Selected slot from check_availability
  windowId:           string;       // Parent availability window
  format:             EricaBookingFormat;
  meetingPurpose:     string;
  contactEmail?:      string;
}

export interface CreateBookingRequestToolPayload {
  entityId:           string;
  entityType:         'lead' | 'client';
  callId?:            string;
  batchId?:           string;
  batchItemId?:       string;
  briefId?:           string;
  meetingPurpose:     string;
  preferredFormat:    EricaBookingFormat;
  preferredTimezone:  string;
  internalNotes:      string;
  fallbackReason:     EricaBookingFallbackReason;
}
