// =============================================================================
// ERICA RESCHEDULE SERVICE
// =============================================================================
// Handles the full reschedule lifecycle for confirmed bookings.
//
// LIVE RESCHEDULE FLOW (calendar configured + new slot selected):
//   1. Load existing booking + its calendar event
//   2. Create change request record
//   3. Check new availability (reuses availabilityService)
//   4. Offer new slots (or accept pre-selected slot)
//   5. Cancel old calendar event + create new event for new slot
//   6. Update booking record with new slot details
//   7. Rebuild reminder schedule for new appointment time
//   8. Generate updated confirmation
//   9. Write full audit trail
//
// SLOT-OFFER FLOW:
//   When Erica calls check_reschedule_availability during a call,
//   this service returns candidate slots and stores a pending change request.
//   confirm_reschedule then finalises it.
//
// FALLBACK FLOW (provider unavailable):
//   - Create a reschedule request operator task
//   - Mark booking as rescheduled_pending_manual
//   - Keep full audit trail
// =============================================================================

import { v4 as uuid } from 'uuid';
import type { Firestore } from 'firebase-admin/firestore';
import { firestore } from '../firebase';
import { getCalendarAdapter, isCalendarConfigured } from './calendarProvider';
import { checkAvailability, getSlotFromWindow } from './availabilityService';
import { updateBookingStatus, writeCommEvent } from './bookingStatusService';
import { generateBookingConfirmation } from './bookingConfirmationService';
import { buildReminderSchedule } from './bookingReminderService';
import type {
  EricaBookingChangeRequest,
  EricaRescheduleOutcome,
  RequestRescheduleToolPayload,
  ConfirmRescheduleToolPayload,
  EricaBookingChangeAudit,
  EricaBookingChangeAuditEventType,
} from './bookingChangeTypes';

// ---------------------------------------------------------------------------
// STEP 1 — Check reschedule availability (offer slots)
// ---------------------------------------------------------------------------

export async function checkRescheduleAvailability(
  orgId:       string,
  payload:     RequestRescheduleToolPayload,
  performedBy: string,
): Promise<EricaRescheduleOutcome> {
  const db  = firestore;
  const now = new Date().toISOString();

  const changeId = uuid();

  // Load existing booking
  const booking = await loadBookingRecord(orgId, payload.bookingId);
  if (!booking) {
    return buildFailOutcome(changeId, payload.bookingId, `Booking ${payload.bookingId} not found`, now, performedBy);
  }

  // Create pending change request
  const changeRequest: EricaBookingChangeRequest = {
    changeId,
    orgId,
    createdAt:   now,
    changeType:  'reschedule',
    status:      'awaiting_slot_selection',
    bookingId:   payload.bookingId,
    bookingType: booking.calendarEventId ? 'confirmed' : 'request',
    entityType:  payload.entityType,
    entityId:    payload.entityId,
    entityName:  booking.entityName ?? 'Unknown',
    businessName: booking.businessName ?? 'Unknown',
    contactName: booking.contactName,
    callId:      payload.callId,
    reason:      payload.reason,
    reasonNote:  payload.reasonNote,
    initiatedBy: performedBy === 'erica' ? 'erica' : 'operator',
    preferredWindow: {
      fromDate:        toDateStr(new Date()),
      toDate:          toDateStr(addDays(new Date(), Math.min(payload.lookAheadDays, 14))),
      preference:      payload.preferenceTime,
      timezone:        payload.timezone,
      durationMinutes: payload.durationMinutes,
    },
  };

  if (db) {
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingChanges').doc(changeId)
      .set({ ...changeRequest });
    await writeChangeAudit(db, orgId, {
      changeId, bookingId: payload.bookingId,
      eventType: 'change_request_created',
      note:      `Reschedule requested by ${performedBy}: ${payload.reason}`,
      performedBy,
    });
  }

  // Check availability
  const avResult = await checkAvailability(orgId, {
    entityId:        payload.entityId,
    entityType:      payload.entityType,
    callId:          payload.callId,
    durationMinutes: payload.durationMinutes,
    preferenceTime:  payload.preferenceTime,
    timezone:        payload.timezone,
    lookAheadDays:   payload.lookAheadDays,
  });

  if (!avResult.configured) {
    // Fallback — no calendar, create operator task
    return await createRescheduleFallbackTask(
      db, orgId, changeId, changeRequest, booking, performedBy, 'provider_not_configured', now,
    );
  }

  if (!avResult.success || avResult.slotCount === 0) {
    return await createRescheduleFallbackTask(
      db, orgId, changeId, changeRequest, booking, performedBy,
      avResult.slotCount === 0 ? 'no_slots_available' : 'api_error',
      now,
    );
  }

  // Store offered slots on change request
  const slots = avResult.slots ?? [];
  if (db) {
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingChanges').doc(changeId)
      .set({
        offeredSlots:   slots,
        windowId:       avResult.windowId,
        status:         'awaiting_slot_selection',
      }, { merge: true });
    await writeChangeAudit(db, orgId, {
      changeId, bookingId: payload.bookingId,
      eventType: 'slots_offered',
      note:      `${slots.length} reschedule slot${slots.length !== 1 ? 's' : ''} offered`,
      metadata:  { slotCount: slots.length, windowId: avResult.windowId },
      performedBy,
    });
  }

  const slotList = slots
    .map((s: any, i: number) => `${i + 1}. ${s.timeLabel}`)
    .join(' | ');

  return {
    outcomeKey:    'slots_offered',
    success:       true,
    changeId,
    bookingId:     payload.bookingId,
    offeredSlots:  slots,
    fallbackUsed:  false,
    notes:         `${slots.length} new slot${slots.length !== 1 ? 's' : ''} available: ${slotList}`,
    nextStep:      `Ask the prospect which slot works best, then call confirm_reschedule with the changeId and slotId`,
    processedAt:   now,
    processedBy:   performedBy,
  };
}

// ---------------------------------------------------------------------------
// STEP 2 — Confirm reschedule (selected slot → provider action)
// ---------------------------------------------------------------------------

export async function confirmReschedule(
  orgId:       string,
  payload:     ConfirmRescheduleToolPayload,
  performedBy: string,
): Promise<EricaRescheduleOutcome> {
  const db  = firestore;
  const now = new Date().toISOString();

  // Load change request
  const changeSnap = db
    ? await db.collection('orgs').doc(orgId).collection('ericaBookingChanges').doc(payload.changeId).get()
    : null;

  if (!changeSnap?.exists) {
    return buildFailOutcome(payload.changeId, payload.bookingId,
      `Change request ${payload.changeId} not found`, now, performedBy);
  }

  const changeRequest = changeSnap.data() as EricaBookingChangeRequest;

  // Load existing booking
  const booking = await loadBookingRecord(orgId, payload.bookingId);
  if (!booking) {
    return buildFailOutcome(payload.changeId, payload.bookingId,
      `Booking ${payload.bookingId} not found`, now, performedBy);
  }

  // Load selected slot
  const newSlot = await getSlotFromWindow(orgId, payload.windowId, payload.slotId);
  if (!newSlot) {
    return buildFailOutcome(payload.changeId, payload.bookingId,
      `Slot ${payload.slotId} not found in window ${payload.windowId}`, now, performedBy);
  }

  if (db) {
    await writeChangeAudit(db, orgId, {
      changeId: payload.changeId, bookingId: payload.bookingId,
      eventType: 'slot_selected',
      note:      `Slot selected: ${newSlot.timeLabel}`,
      metadata:  { slotId: payload.slotId, windowId: payload.windowId },
      performedBy,
    });
  }

  let calendarEventId: string | undefined = booking.calendarEventId;
  let meetingLink:     string | undefined  = booking.meetingLink;
  let providerUpdated = false;

  if (isCalendarConfigured()) {
    try {
      const adapter = getCalendarAdapter();

      // Cancel old event
      if (booking.calendarEventId) {
        await adapter.cancelCalendarEvent(booking.calendarEventId, 'Rescheduled');
      }

      // Create new event
      const result = await adapter.createCalendarEvent({
        ...booking,
        slot: newSlot,
        updatedAt: now,
        status: 'rescheduled',
      });
      calendarEventId = result.eventId;
      meetingLink     = result.meetingLink ?? booking.meetingLink;
      providerUpdated = true;

      if (db) {
        await writeChangeAudit(db, orgId, {
          changeId: payload.changeId, bookingId: payload.bookingId,
          eventType: 'provider_event_updated',
          note:      `Old event cancelled; new event created: ${calendarEventId}`,
          metadata:  { oldEventId: booking.calendarEventId, newEventId: calendarEventId },
          performedBy,
        });
      }
    } catch (err: any) {
      console.warn('[reschedule] Provider event update failed (non-critical):', err.message);
      // Continue — update record regardless
    }
  }

  // Update booking record
  if (db) {
    const base      = db.collection('orgs').doc(orgId);
    const targetCol = booking.calendarEventId ? 'ericaBookings' : 'ericaBookingRequests';
    await base.collection(targetCol).doc(payload.bookingId)
      .set({
        status:          'rescheduled',
        updatedAt:       now,
        slot:            newSlot,
        calendarEventId: calendarEventId ?? null,
        meetingLink:     meetingLink ?? null,
        rescheduledAt:   now,
        rescheduledBy:   performedBy,
        lastChangeId:    payload.changeId,
      }, { merge: true });

    await updateBookingStatus(db, orgId, payload.bookingId, 'reminder_scheduled', performedBy,
      `Rescheduled to ${newSlot.timeLabel}`);

    // Update change request status
    await base.collection('ericaBookingChanges').doc(payload.changeId)
      .set({
        status:          'confirmed',
        confirmedAt:     now,
        confirmedBy:     performedBy,
        selectedSlotId:  payload.slotId,
        selectedWindowId: payload.windowId,
        newSlot,
      }, { merge: true });

    await writeChangeAudit(db, orgId, {
      changeId: payload.changeId, bookingId: payload.bookingId,
      eventType: 'booking_rescheduled',
      note:      `Booking rescheduled to ${newSlot.timeLabel}`,
      metadata:  { slotId: payload.slotId, calendarEventId, providerUpdated },
      performedBy,
    });
  }

  // Suppress old reminders, build new ones
  const rescheduledBooking = { ...booking, slot: newSlot, calendarEventId, meetingLink, status: 'rescheduled' };
  await suppressExistingReminders(db, orgId, payload.bookingId, performedBy);

  if (new Date(newSlot.startIso).getTime() > Date.now()) {
    try {
      await buildReminderSchedule(orgId, rescheduledBooking as any, {}, performedBy);
    } catch (err: any) {
      console.warn('[reschedule] New reminder schedule failed (non-critical):', err.message);
    }
  }

  // Generate updated confirmation
  try {
    await generateBookingConfirmation(orgId, rescheduledBooking as any, {}, 'booking_confirmed', performedBy);
  } catch (err: any) {
    console.warn('[reschedule] Updated confirmation failed (non-critical):', err.message);
  }

  if (db) {
    await writeCommEvent(db, orgId, {
      bookingId:   payload.bookingId,
      eventType:   'confirmation_generated',
      note:        `Reschedule confirmation generated for ${newSlot.timeLabel}`,
      metadata:    { changeId: payload.changeId },
      performedBy,
    });
  }

  return {
    outcomeKey:       'rescheduled',
    success:          true,
    changeId:         payload.changeId,
    bookingId:        payload.bookingId,
    newSlot,
    calendarEventId,
    meetingLink,
    fallbackUsed:     !providerUpdated && !!booking.calendarEventId,
    fallbackReason:   !providerUpdated && booking.calendarEventId
      ? 'Provider event update failed — booking record updated in Momentum only'
      : undefined,
    notes:            `Appointment rescheduled to ${newSlot.timeLabel}.${meetingLink ? ` Meeting link: ${meetingLink}` : ''}`,
    nextStep:         `Reminders rebuilt. Updated confirmation sent.`,
    processedAt:      now,
    processedBy:      performedBy,
  };
}

// ---------------------------------------------------------------------------
// SHARED: Suppress all scheduled reminders for a booking
// ---------------------------------------------------------------------------

export async function suppressExistingReminders(
  db:        FirebaseFirestore.Firestore | null,
  orgId:     string,
  bookingId: string,
  suppressedBy: string,
): Promise<number> {
  if (!db) return 0;

  try {
    const snap = await db.collection('orgs').doc(orgId)
      .collection('ericaReminders')
      .where('bookingId', '==', bookingId)
      .where('status', '==', 'scheduled')
      .get();

    const now = new Date().toISOString();
    let count = 0;
    for (const doc of snap.docs) {
      await doc.ref.set({
        status:           'cancelled',
        suppressedReason: `Cancelled by ${suppressedBy} due to booking change`,
        cancelledAt:      now,
      }, { merge: true });
      count++;
    }
    return count;
  } catch (err: any) {
    console.warn('[reschedule] Failed to suppress reminders:', err.message);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// SHARED: Write a change audit entry
// ---------------------------------------------------------------------------

export async function writeChangeAudit(
  db:       FirebaseFirestore.Firestore,
  orgId:    string,
  event: {
    changeId:    string;
    bookingId:   string;
    eventType:   EricaBookingChangeAuditEventType;
    note:        string;
    metadata?:   Record<string, any>;
    performedBy: string;
  },
): Promise<void> {
  try {
    const auditId = uuid();
    const entry: EricaBookingChangeAudit = {
      auditId,
      changeId:    event.changeId,
      bookingId:   event.bookingId,
      orgId,
      eventType:   event.eventType,
      note:        event.note,
      metadata:    event.metadata,
      performedBy: event.performedBy,
      at:          new Date().toISOString(),
    };
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingChangeAudit').doc(auditId)
      .set(entry);
  } catch (err: any) {
    console.warn('[reschedule] Change audit write failed:', err.message);
  }
}

// ---------------------------------------------------------------------------
// List reschedule change requests
// ---------------------------------------------------------------------------

export async function listRescheduleChanges(orgId: string, limit = 50) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingChanges')
    .where('changeType', '==', 'reschedule')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listAllBookingChanges(orgId: string, limit = 100) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingChanges')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listChangeAudit(orgId: string, limit = 100) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingChangeAudit')
    .orderBy('at', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadBookingRecord(orgId: string, bookingId: string): Promise<any | null> {
  const db = firestore;
  if (!db) return null;
  const base = db.collection('orgs').doc(orgId);

  const bookSnap = await base.collection('ericaBookings').doc(bookingId).get();
  if (bookSnap.exists) return { ...bookSnap.data(), _collection: 'ericaBookings' };

  const reqSnap = await base.collection('ericaBookingRequests').doc(bookingId).get();
  if (reqSnap.exists) return { ...reqSnap.data(), _collection: 'ericaBookingRequests' };

  return null;
}

async function createRescheduleFallbackTask(
  db:            FirebaseFirestore.Firestore | null,
  orgId:         string,
  changeId:      string,
  changeRequest: EricaBookingChangeRequest,
  booking:       any,
  performedBy:   string,
  fallbackReason: string,
  now:           string,
): Promise<EricaRescheduleOutcome> {
  if (db) {
    // Create operator task
    const taskId = uuid();
    await db.collection('orgs').doc(orgId)
      .collection('cadenceItems').doc(taskId)
      .set({
        taskId, orgId,
        type:         'reschedule_follow_up',
        priority:     'high',
        entityType:   changeRequest.entityType,
        entityId:     changeRequest.entityId,
        entityName:   changeRequest.entityName,
        businessName: changeRequest.businessName,
        title:        `Reschedule appointment — ${changeRequest.contactName ?? changeRequest.entityName}`,
        description:  [
          `A reschedule was requested for ${changeRequest.contactName ?? changeRequest.entityName}.`,
          `Reason: ${changeRequest.reason.replace(/_/g, ' ')}`,
          changeRequest.reasonNote ? `Note: ${changeRequest.reasonNote}` : null,
          `Fallback reason: ${fallbackReason.replace(/_/g, ' ')}`,
          `Original booking ID: ${changeRequest.bookingId}`,
        ].filter(Boolean).join('\n'),
        linkedChangeId:  changeId,
        linkedBookingId: changeRequest.bookingId,
        status:   'pending',
        dueDate:  addDays(new Date(), 1).toISOString().slice(0, 10),
        createdAt: now,
        createdBy: performedBy,
        source:    'erica_reschedule_fallback',
      });

    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingChanges').doc(changeId)
      .set({
        status:         'fallback_pending',
        fallbackReason: fallbackReason,
        taskId,
      }, { merge: true });

    await writeChangeAudit(db, orgId, {
      changeId, bookingId: changeRequest.bookingId,
      eventType: 'fallback_task_created',
      note:      `Reschedule fallback task created: ${fallbackReason.replace(/_/g, ' ')}`,
      metadata:  { taskId, fallbackReason },
      performedBy,
    });
  }

  return {
    outcomeKey:   'reschedule_request_created',
    success:      true,
    changeId,
    bookingId:    changeRequest.bookingId,
    fallbackUsed: true,
    fallbackReason: fallbackReason.replace(/_/g, ' '),
    notes:        `Reschedule request created. Follow-up task assigned to operator. Reason: ${fallbackReason.replace(/_/g, ' ')}`,
    nextStep:     `Operator to contact ${changeRequest.contactName ?? changeRequest.entityName} and confirm a new time`,
    processedAt:  now,
    processedBy:  performedBy,
  };
}

function buildFailOutcome(
  changeId:   string,
  bookingId:  string,
  reason:     string,
  now:        string,
  performedBy: string,
): EricaRescheduleOutcome {
  return {
    outcomeKey:   'failed',
    success:      false,
    changeId,
    bookingId,
    fallbackUsed: true,
    fallbackReason: reason,
    notes:        reason,
    nextStep:     'Operator to action manually',
    processedAt:  now,
    processedBy:  performedBy,
  };
}

function toDateStr(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, days: number): Date {
  const r = new Date(d); r.setUTCDate(r.getUTCDate() + days); return r;
}
