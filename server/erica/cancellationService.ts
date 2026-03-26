// =============================================================================
// ERICA CANCELLATION SERVICE
// =============================================================================
// Handles the full cancellation lifecycle for both confirmed bookings and
// booking requests.
//
// LIVE CANCELLATION FLOW (calendar configured):
//   1. Load existing booking from Firestore
//   2. Create change request record
//   3. Cancel provider calendar event
//   4. Update booking status to cancelled
//   5. Suppress all scheduled reminders
//   6. Write full audit trail + comm event
//
// FALLBACK CANCELLATION FLOW (provider unavailable):
//   1. Create change request record
//   2. Mark booking as cancelled in Momentum (no provider action needed)
//   3. Suppress all scheduled reminders
//   4. Create operator follow-up task if needed
//   5. Write audit trail
//
// Note: Cancelling a booking in Momentum does NOT require a live provider —
// the calendar event cancellation is the only provider-dependent step.
// Even without Google Calendar, Momentum marks the booking cancelled.
// =============================================================================

import { v4 as uuid } from 'uuid';
import { firestore } from '../firebase';
import { getCalendarAdapter, isCalendarConfigured } from './calendarProvider';
import { updateBookingStatus, writeCommEvent } from './bookingStatusService';
import { suppressExistingReminders, writeChangeAudit } from './rescheduleService';
import type {
  EricaBookingChangeRequest,
  EricaCancellationOutcome,
  RequestCancellationToolPayload,
} from './bookingChangeTypes';

// ---------------------------------------------------------------------------
// Main cancel flow
// ---------------------------------------------------------------------------

export async function cancelBooking(
  orgId:       string,
  payload:     RequestCancellationToolPayload,
  performedBy: string,
): Promise<EricaCancellationOutcome> {
  const db  = firestore;
  const now = new Date().toISOString();

  const changeId = uuid();

  // ── Load existing booking ─────────────────────────────────────────────
  const booking = await loadBookingForCancel(orgId, payload.bookingId);
  if (!booking) {
    return {
      outcomeKey:              'failed',
      success:                 false,
      changeId,
      bookingId:               payload.bookingId,
      calendarEventCancelled:  false,
      remindersSuppressed:     0,
      fallbackUsed:            true,
      fallbackReason:          `Booking ${payload.bookingId} not found`,
      notes:                   `Booking not found`,
      nextStep:                'Operator to verify booking ID and action manually',
      processedAt:             now,
      processedBy:             performedBy,
    };
  }

  // ── Create change request record ──────────────────────────────────────
  const changeRequest: EricaBookingChangeRequest = {
    changeId,
    orgId,
    createdAt:    now,
    changeType:   'cancel',
    status:       'pending',
    bookingId:    payload.bookingId,
    bookingType:  booking.calendarEventId ? 'confirmed' : 'request',
    entityType:   payload.entityType,
    entityId:     payload.entityId,
    entityName:   booking.entityName ?? 'Unknown',
    businessName: booking.businessName ?? 'Unknown',
    contactName:  booking.contactName,
    callId:       payload.callId,
    reason:       payload.reason,
    reasonNote:   payload.reasonNote,
    initiatedBy:  performedBy === 'erica' ? 'erica' : 'operator',
  };

  if (db) {
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingChanges').doc(changeId)
      .set({ ...changeRequest });
    await writeChangeAudit(db, orgId, {
      changeId, bookingId: payload.bookingId,
      eventType: 'change_request_created',
      note:      `Cancellation requested by ${performedBy}: ${payload.reason}`,
      metadata:  { reason: payload.reason, reasonNote: payload.reasonNote },
      performedBy,
    });
  }

  // ── Cancel provider calendar event ─────────────────────────────────────
  let calendarEventCancelled = false;

  if (booking.calendarEventId && isCalendarConfigured()) {
    try {
      const adapter = getCalendarAdapter();
      await adapter.cancelCalendarEvent(
        booking.calendarEventId,
        payload.reasonNote ?? payload.reason.replace(/_/g, ' '),
      );
      calendarEventCancelled = true;
      if (db) {
        await writeChangeAudit(db, orgId, {
          changeId, bookingId: payload.bookingId,
          eventType: 'provider_event_cancelled',
          note:      `Calendar event cancelled: ${booking.calendarEventId}`,
          performedBy,
        });
      }
    } catch (err: any) {
      console.warn('[cancellation] Calendar event cancellation failed (non-critical):', err.message);
    }
  }

  // ── Mark booking as cancelled in Momentum ─────────────────────────────
  if (db) {
    const base   = db.collection('orgs').doc(orgId);
    const isReq  = !booking.calendarEventId && !booking.slot;

    const targetCol = isReq ? 'ericaBookingRequests' : 'ericaBookings';
    await base.collection(targetCol).doc(payload.bookingId)
      .set({
        status:          'cancelled',
        updatedAt:       now,
        cancelledAt:     now,
        cancelledBy:     performedBy,
        cancellationReason: payload.reason,
        cancellationNote:   payload.reasonNote ?? null,
        lastChangeId:    changeId,
      }, { merge: true });

    await updateBookingStatus(db, orgId, payload.bookingId, 'cancelled', performedBy,
      `Cancelled: ${payload.reason.replace(/_/g, ' ')}${payload.reasonNote ? ` — ${payload.reasonNote}` : ''}`);
  }

  // ── Suppress scheduled reminders ──────────────────────────────────────
  const remindersSuppressed = await suppressExistingReminders(db, orgId, payload.bookingId, performedBy);

  // ── Update change request ─────────────────────────────────────────────
  if (db) {
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingChanges').doc(changeId)
      .set({
        status:       'confirmed',
        confirmedAt:  now,
        confirmedBy:  performedBy,
      }, { merge: true });

    await writeChangeAudit(db, orgId, {
      changeId, bookingId: payload.bookingId,
      eventType: 'booking_cancelled',
      note:      `Booking cancelled. Calendar event cancelled: ${calendarEventCancelled}. Reminders suppressed: ${remindersSuppressed}`,
      metadata:  { calendarEventCancelled, remindersSuppressed },
      performedBy,
    });

    // Write comm event for audit
    await writeCommEvent(db, orgId, {
      bookingId:   payload.bookingId,
      eventType:   'status_changed',
      note:        `Booking cancelled: ${payload.reason.replace(/_/g, ' ')}`,
      metadata:    { changeId, calendarEventCancelled },
      performedBy,
    });
  }

  return {
    outcomeKey:             'cancelled',
    success:                true,
    changeId,
    bookingId:              payload.bookingId,
    calendarEventCancelled,
    remindersSuppressed,
    fallbackUsed:           !calendarEventCancelled && !!booking.calendarEventId,
    fallbackReason:         !calendarEventCancelled && booking.calendarEventId
      ? 'Calendar event not cancelled — check provider config'
      : undefined,
    notes:                  [
      `Appointment cancelled.`,
      calendarEventCancelled ? `Calendar event removed.` : `Calendar event not removed (provider unavailable or no event ID).`,
      `${remindersSuppressed} reminder${remindersSuppressed !== 1 ? 's' : ''} suppressed.`,
    ].join(' '),
    nextStep:               `Inform ${booking.contactName ?? booking.entityName} of the cancellation if not already done`,
    processedAt:            now,
    processedBy:            performedBy,
  };
}

// ---------------------------------------------------------------------------
// List cancellation-type change requests
// ---------------------------------------------------------------------------

export async function listCancellationChanges(orgId: string, limit = 50) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingChanges')
    .where('changeType', '==', 'cancel')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function loadBookingForCancel(orgId: string, bookingId: string): Promise<any | null> {
  const db = firestore;
  if (!db) return null;
  const base = db.collection('orgs').doc(orgId);

  const bookSnap = await base.collection('ericaBookings').doc(bookingId).get();
  if (bookSnap.exists) return { ...bookSnap.data() };

  const reqSnap = await base.collection('ericaBookingRequests').doc(bookingId).get();
  if (reqSnap.exists) return { ...reqSnap.data(), bookingType: 'request' };

  return null;
}
