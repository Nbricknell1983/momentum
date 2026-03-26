// =============================================================================
// ERICA BOOKING STATUS SERVICE
// =============================================================================
// Manages the booking lifecycle status and history for both:
//   - EricaConfirmedBooking records (collection: ericaBookings)
//   - EricaBookingRequest records  (collection: ericaBookingRequests)
//
// All status transitions are written as immutable history entries.
// =============================================================================

import { v4 as uuid } from 'uuid';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  EricaBookingLifecycleStatus,
  EricaBookingStatusHistory,
  EricaBookingCommunicationEvent,
  EricaCommEventType,
  EricaCommChannel,
} from './bookingCommunicationTypes';

// ---------------------------------------------------------------------------
// Update booking status (writes to ericaBookings)
// ---------------------------------------------------------------------------

export async function updateBookingStatus(
  db:          Firestore,
  orgId:       string,
  bookingId:   string,
  status:      EricaBookingLifecycleStatus,
  changedBy:   string,
  note?:       string,
  metadata?:   Record<string, any>,
): Promise<void> {
  const historyId = uuid();
  const now       = new Date().toISOString();

  const entry: EricaBookingStatusHistory = {
    historyId,
    bookingId,
    orgId,
    status,
    note,
    changedBy,
    changedAt: now,
    metadata,
  };

  const base = db.collection('orgs').doc(orgId);

  // Try confirmed bookings first, then requests
  try {
    const bookingRef = base.collection('ericaBookings').doc(bookingId);
    const snap       = await bookingRef.get();
    if (snap.exists) {
      await bookingRef.set({ commStatus: status, commStatusUpdatedAt: now }, { merge: true });
      await bookingRef.collection('statusHistory').doc(historyId).set(entry);
      return;
    }
  } catch (err: any) {
    console.warn('[booking-status] Failed to update ericaBookings:', err.message);
  }

  try {
    const reqRef = base.collection('ericaBookingRequests').doc(bookingId);
    const snap   = await reqRef.get();
    if (snap.exists) {
      await reqRef.set({ commStatus: status, commStatusUpdatedAt: now }, { merge: true });
      await reqRef.collection('statusHistory').doc(historyId).set(entry);
      return;
    }
  } catch (err: any) {
    console.warn('[booking-status] Failed to update ericaBookingRequests:', err.message);
  }

  // Store in top-level status history collection regardless
  await base.collection('ericaBookingStatusHistory').doc(historyId).set(entry);
}

// ---------------------------------------------------------------------------
// Write communication event audit entry
// ---------------------------------------------------------------------------

export async function writeCommEvent(
  db:         Firestore,
  orgId:      string,
  event: {
    bookingId:   string;
    eventType:   EricaCommEventType;
    channel?:    EricaCommChannel;
    note:        string;
    metadata?:   Record<string, any>;
    performedBy: string;
  },
): Promise<void> {
  const eventId = uuid();
  const now     = new Date().toISOString();

  const entry: EricaBookingCommunicationEvent = {
    eventId,
    bookingId:   event.bookingId,
    orgId,
    eventType:   event.eventType,
    channel:     event.channel,
    note:        event.note,
    metadata:    event.metadata,
    performedBy: event.performedBy,
    at:          now,
  };

  try {
    await db.collection('orgs').doc(orgId)
      .collection('ericaCommEvents').doc(eventId)
      .set(entry);
  } catch (err: any) {
    console.warn('[booking-status] Failed to write comm event:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Get status history for a booking
// ---------------------------------------------------------------------------

export async function getStatusHistory(
  db:        Firestore,
  orgId:     string,
  bookingId: string,
): Promise<EricaBookingStatusHistory[]> {
  try {
    const base = db.collection('orgs').doc(orgId);
    const [fromBookings, fromRequests] = await Promise.all([
      base.collection('ericaBookings').doc(bookingId).collection('statusHistory').orderBy('changedAt', 'asc').get(),
      base.collection('ericaBookingRequests').doc(bookingId).collection('statusHistory').orderBy('changedAt', 'asc').get(),
    ]);
    const allDocs = [...fromBookings.docs, ...fromRequests.docs];
    return allDocs.map(d => d.data() as EricaBookingStatusHistory);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// List communication events
// ---------------------------------------------------------------------------

export async function listCommEvents(orgId: string, limit = 100) {
  const { firestore } = await import('../firebase');
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaCommEvents')
    .orderBy('at', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// List status history (top-level collection)
// ---------------------------------------------------------------------------

export async function listStatusHistory(orgId: string, limit = 100) {
  const { firestore } = await import('../firebase');
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingStatusHistory')
    .orderBy('changedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
