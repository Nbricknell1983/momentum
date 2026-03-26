// =============================================================================
// ERICA BOOKING COMMUNICATION DOMAIN TYPES
// =============================================================================
// Models for the full post-booking communication lifecycle:
//   Confirmation → Reminder Schedule → Reminder Sends → Status History
//
// Momentum is always the source of truth for:
//   - booking records
//   - booking requests
//   - all communication payloads and outcomes
//   - reminder timing and suppression
//   - appointment status history
//
// Communication channels: email → SMS → manual fallback
// Provider config is checked at send time — missing config surfaces clearly.
// =============================================================================

// ---------------------------------------------------------------------------
// Communication channel
// ---------------------------------------------------------------------------

export type EricaCommChannel = 'email' | 'sms' | 'manual';

// ---------------------------------------------------------------------------
// Booking status lifecycle
// ---------------------------------------------------------------------------

export type EricaBookingLifecycleStatus =
  | 'booked'               // Booking created (confirmed or request)
  | 'confirmation_pending' // Confirmation not yet sent
  | 'confirmation_sent'    // Confirmation delivered
  | 'confirmation_failed'  // Confirmation send failed
  | 'reminder_scheduled'   // At least one reminder is queued
  | 'reminder_sent'        // Latest reminder delivered
  | 'reminder_failed'      // Latest reminder send failed
  | 'cancelled'            // Appointment cancelled
  | 'rescheduled'          // Appointment moved
  | 'no_show'              // Prospect did not attend
  | 'completed';           // Appointment held successfully

// ---------------------------------------------------------------------------
// Booking status history entry
// ---------------------------------------------------------------------------

export interface EricaBookingStatusHistory {
  historyId:    string;
  bookingId:    string;           // or requestId
  orgId:        string;
  status:       EricaBookingLifecycleStatus;
  note?:        string;
  changedBy:    string;           // 'erica' | 'operator' | userId
  changedAt:    string;           // ISO
  metadata?:    Record<string, any>;
}

// ---------------------------------------------------------------------------
// Confirmation payload
// ---------------------------------------------------------------------------

export type EricaConfirmationTrigger =
  | 'booking_confirmed'       // Real booking via calendar
  | 'booking_request_created' // Fallback request created
  | 'booking_request_converted'; // Operator converted request → confirmed

export interface EricaBookingConfirmation {
  confirmationId:    string;
  bookingId:         string;        // EricaConfirmedBooking.bookingId or requestId
  orgId:             string;
  createdAt:         string;        // ISO
  trigger:           EricaConfirmationTrigger;

  // Contact
  toName:            string;
  toEmail?:          string;
  toPhone?:          string;
  channel:           EricaCommChannel;

  // Appointment detail — pre-formatted for direct insertion
  appointmentDateLabel:  string;    // "Tuesday 8th April 2025"
  appointmentTimeLabel:  string;    // "9:00 AM – 9:30 AM AEST"
  meetingFormat:         string;    // "Zoom" | "Phone call" | "In person"
  meetingLink?:          string;
  meetingPurpose:        string;
  businessName:          string;
  contactName:           string;

  // Body
  subject:           string;
  bodyText:          string;        // Plain-text body
  bodyHtml?:         string;        // HTML version (email only)

  // Reschedule/cancel note
  rescheduleNote:    string;

  // Linkage
  entityType:        'lead' | 'client';
  entityId:          string;
  callId?:           string;
  batchId?:          string;

  // Delivery
  status:            'pending' | 'sent' | 'failed' | 'skipped';
  sentAt?:           string;
  failureReason?:    string;
  providerMessageId?: string;
}

// ---------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------

export type EricaReminderType =
  | 'immediate'   // Sent right after confirmation (or on booking creation)
  | '24_hour'     // Sent 24 hours before appointment
  | 'same_day'    // Sent morning of appointment day
  | 'custom';     // Org-configured custom offset

export interface EricaBookingReminder {
  reminderId:       string;
  bookingId:        string;
  orgId:            string;
  createdAt:        string;         // ISO
  reminderType:     EricaReminderType;
  scheduledFor:     string;         // ISO — when to send
  suppressedReason?: string;        // Set if reminder was suppressed

  // Contact
  toName:           string;
  toEmail?:         string;
  toPhone?:         string;
  channel:          EricaCommChannel;

  // Content
  subject:          string;
  bodyText:         string;
  bodyHtml?:        string;

  // Appointment context
  appointmentDateLabel: string;
  appointmentTimeLabel: string;
  meetingFormat:        string;
  meetingLink?:         string;

  // Linkage
  entityType:       'lead' | 'client';
  entityId:         string;
  callId?:          string;

  // Delivery
  status:           'scheduled' | 'sent' | 'failed' | 'suppressed' | 'cancelled';
  sentAt?:          string;
  failureReason?:   string;
  providerMessageId?: string;
}

// ---------------------------------------------------------------------------
// Reminder schedule — the full plan for a booking
// ---------------------------------------------------------------------------

export interface EricaReminderSchedule {
  scheduleId:    string;
  bookingId:     string;
  orgId:         string;
  createdAt:     string;

  appointmentIso:     string;       // Appointment start ISO
  timezone:           string;
  contactHasEmail:    boolean;
  contactHasPhone:    boolean;

  reminders:          EricaBookingReminder[];

  // Suppression state
  suppressionRules:   string[];     // Human-readable rules applied
  totalScheduled:     number;
  totalSuppressed:    number;
}

// ---------------------------------------------------------------------------
// Communication plan — combines confirmation + reminder schedule
// ---------------------------------------------------------------------------

export interface EricaBookingCommunicationPlan {
  planId:              string;
  bookingId:           string;
  orgId:               string;
  createdAt:           string;
  entityType:          'lead' | 'client';
  entityId:            string;

  confirmation:        EricaBookingConfirmation;
  reminderSchedule:    EricaReminderSchedule;

  currentStatus:       EricaBookingLifecycleStatus;
  statusHistory:       EricaBookingStatusHistory[];
}

// ---------------------------------------------------------------------------
// Communication event — auditable record of every send attempt
// ---------------------------------------------------------------------------

export type EricaCommEventType =
  | 'confirmation_generated'
  | 'confirmation_sent'
  | 'confirmation_failed'
  | 'confirmation_skipped'
  | 'reminder_scheduled'
  | 'reminder_sent'
  | 'reminder_failed'
  | 'reminder_suppressed'
  | 'reminder_cancelled'
  | 'status_changed';

export interface EricaBookingCommunicationEvent {
  eventId:      string;
  bookingId:    string;
  orgId:        string;
  eventType:    EricaCommEventType;
  channel?:     EricaCommChannel;
  note:         string;
  metadata?:    Record<string, any>;
  performedBy:  string;
  at:           string;             // ISO
}

// ---------------------------------------------------------------------------
// Reminder outcome (per-send result)
// ---------------------------------------------------------------------------

export interface EricaReminderOutcome {
  reminderId:         string;
  bookingId:          string;
  success:            boolean;
  channel:            EricaCommChannel;
  deliveredAt?:       string;
  failureReason?:     string;
  providerMessageId?: string;
  fallbackUsed:       boolean;
  fallbackReason?:    string;
}

// ---------------------------------------------------------------------------
// Org-level reminder defaults
// ---------------------------------------------------------------------------

export interface EricaReminderOrgDefaults {
  orgId:               string;
  sendConfirmation:    boolean;     // Default: true
  send24HourReminder:  boolean;     // Default: true
  sendSameDayReminder: boolean;     // Default: true
  preferredChannel:    EricaCommChannel; // Default: email
  suppressIfWithin:    number;      // Hours — suppress reminder if appointment is within N hours
  fromName:            string;      // "The Team at XYZ"
  fromEmail?:          string;
  reschedulePhone?:    string;
  rescheduleEmail?:    string;
}

export const DEFAULT_REMINDER_ORG_DEFAULTS: Omit<EricaReminderOrgDefaults, 'orgId'> = {
  sendConfirmation:    true,
  send24HourReminder:  true,
  sendSameDayReminder: true,
  preferredChannel:    'email',
  suppressIfWithin:    2,
  fromName:            'The Team',
  fromEmail:           undefined,
  reschedulePhone:     undefined,
  rescheduleEmail:     undefined,
};
