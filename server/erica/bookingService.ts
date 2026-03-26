// =============================================================================
// ERICA BOOKING SERVICE
// =============================================================================
// Handles two distinct flows:
//
// LIVE BOOKING FLOW (calendar configured + slot selected):
//   1. Validate slot is still available
//   2. Create calendar event via provider adapter
//   3. Write EricaConfirmedBooking to Firestore
//   4. Link to lead/client, call record, and batch item
//   5. Return success with calendar event ID and meeting link
//
// FALLBACK BOOKING-REQUEST FLOW (calendar unavailable or no slot selected):
//   1. Write EricaBookingRequest to Firestore with status = pending
//   2. Create follow-up task for the operator
//   3. Link to entity, call record, and batch item
//   4. Return success with booking request ID and instructions
//
// Both flows produce an EricaBookingOutcome — the structured result consumed
// by Erica, the webhook reconciler, and the Erica Workspace.
// =============================================================================

import { v4 as uuid } from 'uuid';
import { firestore } from '../firebase';
import { getCalendarAdapter, isCalendarConfigured } from './calendarProvider';
import { getSlotFromWindow } from './availabilityService';
import type {
  EricaConfirmedBooking,
  EricaBookingRequest,
  EricaBookingOutcome,
  EricaBookingFallbackReason,
  CreateBookingToolPayload,
  CreateBookingRequestToolPayload,
  EricaBookingSlot,
} from './bookingTypes';

// ---------------------------------------------------------------------------
// LIVE BOOKING FLOW
// ---------------------------------------------------------------------------

export async function createConfirmedBooking(
  orgId:       string,
  payload:     CreateBookingToolPayload,
  entityData:  { entityName: string; businessName: string; contactName?: string; contactEmail?: string; phone?: string },
  performedBy: string,
): Promise<EricaBookingOutcome> {
  const db = firestore;

  // ── Validate provider ─────────────────────────────────────────────────
  if (!isCalendarConfigured()) {
    return buildFallbackOutcome(
      'provider_not_configured',
      'Calendar provider not configured. Using booking-request fallback.',
    );
  }

  // ── Retrieve selected slot ─────────────────────────────────────────────
  let slot: EricaBookingSlot | null = null;
  try {
    slot = await getSlotFromWindow(orgId, payload.windowId, payload.slotId);
  } catch (err: any) {
    console.warn('[booking-service] Failed to retrieve slot:', err.message);
  }

  if (!slot) {
    return buildFallbackOutcome(
      'api_error',
      `Selected slot ${payload.slotId} not found in window ${payload.windowId}. Using booking-request fallback.`,
    );
  }

  // ── Build booking record ───────────────────────────────────────────────
  const bookingId = uuid();
  const now       = new Date().toISOString();

  const booking: Omit<EricaConfirmedBooking, 'calendarEventId' | 'meetingLink'> = {
    bookingId,
    orgId,
    createdAt:    now,
    updatedAt:    now,
    status:       'confirmed',
    entityType:   payload.entityType,
    entityId:     payload.entityId,
    entityName:   entityData.entityName,
    businessName: entityData.businessName,
    contactName:  entityData.contactName,
    contactEmail: payload.contactEmail ?? entityData.contactEmail,
    phone:        entityData.phone,
    callId:       payload.callId,
    batchId:      payload.batchId,
    batchItemId:  payload.batchItemId,
    briefId:      payload.briefId,
    slot,
    format:       payload.format,
    meetingPurpose: payload.meetingPurpose,
  };

  // ── Create calendar event ──────────────────────────────────────────────
  let calendarEventId: string | undefined;
  let meetingLink:     string | undefined;

  try {
    const adapter = getCalendarAdapter();
    const result  = await adapter.createCalendarEvent(booking);
    calendarEventId = result.eventId;
    meetingLink     = result.meetingLink;
  } catch (err: any) {
    console.error('[booking-service] Calendar event creation failed:', err.message);
    // Fallback — still write the booking record, just without a calendar event
    calendarEventId = undefined;
    meetingLink     = undefined;
  }

  const confirmedBooking: EricaConfirmedBooking = {
    ...booking,
    calendarEventId,
    meetingLink,
    calendarProvider: 'google_calendar',
  };

  // ── Persist to Firestore ───────────────────────────────────────────────
  if (db) {
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookings').doc(bookingId)
      .set({ ...confirmedBooking, performedBy });

    // Write outcome audit entry
    await writeBookingAudit(db, orgId, {
      type:       'booking_confirmed',
      bookingId,
      callId:     payload.callId,
      batchId:    payload.batchId,
      entityId:   payload.entityId,
      performedBy,
      at:         now,
      slot:       slot.timeLabel,
      calendarEventId: calendarEventId ?? null,
    });

    // Update batch item with booking ID
    if (payload.batchId && payload.batchItemId) {
      try {
        const batchRef = db.collection('orgs').doc(orgId)
          .collection('ericaBatches').doc(payload.batchId);
        const batchSnap = await batchRef.get();
        if (batchSnap.exists) {
          const data  = batchSnap.data()!;
          const items = (data.items ?? []).map((item: any) =>
            item.itemId === payload.batchItemId
              ? { ...item, bookingId, bookingStatus: 'confirmed', bookedSlot: slot!.timeLabel }
              : item,
          );
          await batchRef.update({ items, bookedCalls: (data.bookedCalls ?? 0) + 1 });
        }
      } catch (err: any) {
        console.warn('[booking-service] Failed to update batch item with booking:', err.message);
      }
    }
  }

  return {
    outcomeKey:       'booked',
    success:          true,
    booking:          confirmedBooking,
    fallbackUsed:     !calendarEventId,
    fallbackReason:   !calendarEventId ? 'api_error' : undefined,
    slotOfferedCount: 1,
    slotSelectedId:   slot.slotId,
    calendarEventId,
    meetingLink,
    notes:            `Appointment confirmed: ${slot.timeLabel}${meetingLink ? ` | Meeting link: ${meetingLink}` : ''}`,
    nextStep:         `Send confirmation details to ${entityData.contactName ?? entityData.entityName}`,
    processedAt:      now,
    processedBy:      performedBy,
  };
}

// ---------------------------------------------------------------------------
// FALLBACK BOOKING-REQUEST FLOW
// ---------------------------------------------------------------------------

export async function createBookingRequest(
  orgId:       string,
  payload:     CreateBookingRequestToolPayload,
  entityData:  { entityName: string; businessName: string; contactName?: string; phone?: string },
  performedBy: string,
): Promise<EricaBookingOutcome> {
  const db = firestore;

  const requestId = uuid();
  const now       = new Date().toISOString();

  const bookingRequest: EricaBookingRequest = {
    requestId,
    orgId,
    createdAt:        now,
    status:           'pending',
    entityType:       payload.entityType,
    entityId:         payload.entityId,
    entityName:       entityData.entityName,
    businessName:     entityData.businessName,
    contactName:      entityData.contactName,
    phone:            entityData.phone,
    callId:           payload.callId,
    batchId:          payload.batchId,
    batchItemId:      payload.batchItemId,
    briefId:          payload.briefId,
    meetingPurpose:   payload.meetingPurpose,
    durationMinutes:  30,
    preferredFormat:  payload.preferredFormat,
    preferredTimezone: payload.preferredTimezone,
    internalNotes:    payload.internalNotes,
    fallbackReason:   payload.fallbackReason,
  };

  // ── Persist booking request ────────────────────────────────────────────
  if (db) {
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingRequests').doc(requestId)
      .set({ ...bookingRequest, performedBy });

    // Write follow-up task
    const taskId = uuid();
    await db.collection('orgs').doc(orgId)
      .collection('cadenceItems').doc(taskId)
      .set({
        taskId,
        orgId,
        type:        'follow_up',
        priority:    'high',
        entityType:  payload.entityType,
        entityId:    payload.entityId,
        entityName:  entityData.entityName,
        businessName: entityData.businessName,
        title:       `Book appointment — ${entityData.contactName ?? entityData.entityName}`,
        description: [
          `Erica spoke with ${entityData.contactName ?? entityData.entityName} and a booking request was created.`,
          `Purpose: ${payload.meetingPurpose}`,
          `Reason for manual booking: ${payload.fallbackReason.replace(/_/g, ' ')}`,
          payload.internalNotes ? `Notes: ${payload.internalNotes}` : null,
        ].filter(Boolean).join('\n'),
        linkedCallId:      payload.callId,
        linkedBookingRequestId: requestId,
        status:      'pending',
        dueDate:     addDays(new Date(), 1).toISOString().slice(0, 10),
        createdAt:   now,
        createdBy:   performedBy,
        source:      'erica_booking_request',
      });

    // Audit
    await writeBookingAudit(db, orgId, {
      type:        'booking_request_created',
      requestId,
      callId:      payload.callId,
      batchId:     payload.batchId,
      entityId:    payload.entityId,
      performedBy,
      at:          now,
      fallbackReason: payload.fallbackReason,
    });
  }

  return {
    outcomeKey:       'booking_request_created',
    success:          true,
    bookingRequest,
    fallbackUsed:     true,
    fallbackReason:   payload.fallbackReason,
    slotOfferedCount: 0,
    notes:            `Booking request created. Follow-up task assigned to operator. Reason: ${payload.fallbackReason.replace(/_/g, ' ')}`,
    nextStep:         `Operator to confirm appointment time with ${entityData.contactName ?? entityData.entityName} and convert to confirmed booking`,
    processedAt:      now,
    processedBy:      performedBy,
  };
}

// ---------------------------------------------------------------------------
// Convert a booking request to a confirmed booking
// ---------------------------------------------------------------------------

export async function convertBookingRequest(
  orgId:       string,
  requestId:   string,
  slot:        EricaBookingSlot,
  format:      string,
  performedBy: string,
): Promise<EricaBookingOutcome> {
  const db = firestore;
  if (!db) return buildFallbackOutcome('api_error', 'Firestore not initialised');

  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingRequests').doc(requestId).get();
  if (!snap.exists) return buildFallbackOutcome('api_error', 'Booking request not found');

  const req = snap.data() as EricaBookingRequest;

  // Delegate to createConfirmedBooking
  return createConfirmedBooking(
    orgId,
    {
      entityId:       req.entityId,
      entityType:     req.entityType,
      callId:         req.callId,
      batchId:        req.batchId,
      batchItemId:    req.batchItemId,
      briefId:        req.briefId,
      slotId:         slot.slotId,
      windowId:       slot.windowId,
      format:         format as any,
      meetingPurpose: req.meetingPurpose,
    },
    {
      entityName:   req.entityName,
      businessName: req.businessName,
      contactName:  req.contactName,
      phone:        req.phone,
    },
    performedBy,
  );
}

// ---------------------------------------------------------------------------
// List bookings and booking requests
// ---------------------------------------------------------------------------

export async function listConfirmedBookings(orgId: string, limit = 50) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookings')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listBookingRequests(orgId: string, limit = 50) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingRequests')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listBookingAudit(orgId: string, limit = 100) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingAudit')
    .orderBy('at', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFallbackOutcome(
  reason:  EricaBookingFallbackReason,
  notes:   string,
): EricaBookingOutcome {
  return {
    outcomeKey:       'failed',
    success:          false,
    fallbackUsed:     true,
    fallbackReason:   reason,
    slotOfferedCount: 0,
    notes,
    nextStep:         'Operator to manually book appointment',
    processedAt:      new Date().toISOString(),
    processedBy:      'erica',
  };
}

async function writeBookingAudit(
  db:   FirebaseFirestore.Firestore,
  orgId: string,
  data:  Record<string, any>,
): Promise<void> {
  try {
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingAudit').doc(uuid())
      .set(data);
  } catch (err: any) {
    console.warn('[booking-service] Audit write failed:', err.message);
  }
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
