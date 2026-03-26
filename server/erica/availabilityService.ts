// =============================================================================
// ERICA AVAILABILITY SERVICE
// =============================================================================
// Receives booking intent from Erica (via tool call), checks real calendar
// availability, caches the availability window + slots in Firestore, and
// returns structured candidate slots for Erica to offer on the call.
//
// If the calendar provider is not configured, returns a clear not-configured
// state — NEVER fakes availability data.
// =============================================================================

import { v4 as uuid } from 'uuid';
import { firestore } from '../firebase';
import { getCalendarAdapter, getProviderState, isCalendarConfigured } from './calendarProvider';
import type {
  CheckAvailabilityToolPayload,
  EricaBookingAvailabilityWindow,
  EricaBookingSlot,
} from './bookingTypes';

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export interface AvailabilityResult {
  success:          boolean;
  configured:       boolean;
  windowId?:        string;
  slots:            EricaBookingSlot[];
  slotCount:        number;
  providerState?:   ReturnType<typeof getProviderState>;
  notConfiguredMsg?: string;
  error?:           string;
}

// ---------------------------------------------------------------------------
// Main service function
// ---------------------------------------------------------------------------

export async function checkAvailability(
  orgId:   string,
  payload: CheckAvailabilityToolPayload,
): Promise<AvailabilityResult> {
  const db = firestore;

  // ── Provider check ─────────────────────────────────────────────────────
  if (!isCalendarConfigured()) {
    const state = getProviderState();
    return {
      success:     false,
      configured:  false,
      slots:       [],
      slotCount:   0,
      providerState: state,
      notConfiguredMsg: [
        'Google Calendar is not configured for this organisation.',
        'Missing secrets: ' + state.missingSecrets.join(', '),
        'Setup required: ' + state.missingSetup.join(' | '),
        'Until configured, Erica will use the booking-request fallback flow.',
      ].join(' '),
    };
  }

  // ── Build availability window ──────────────────────────────────────────
  const now      = new Date();
  const fromDate = toDateStr(now);
  const toDate   = toDateStr(addDays(now, Math.min(payload.lookAheadDays, 14)));

  const windowId = uuid();
  const window: EricaBookingAvailabilityWindow = {
    windowId,
    orgId,
    requestedAt:      now.toISOString(),
    fromDate,
    toDate,
    preference:       payload.preferenceTime,
    durationMinutes:  payload.durationMinutes,
    timezone:         payload.timezone,
    requestedBy:      payload.callId ?? 'manual',
    callId:           payload.callId,
    entityType:       payload.entityType,
    entityId:         payload.entityId,
  };

  // ── Query calendar ─────────────────────────────────────────────────────
  let slots: EricaBookingSlot[] = [];
  try {
    const adapter = getCalendarAdapter();
    slots = await adapter.getAvailableSlots(window);
  } catch (err: any) {
    return {
      success:   false,
      configured: true,
      slots:     [],
      slotCount: 0,
      error:     `Calendar availability check failed: ${err.message}`,
    };
  }

  // ── Persist window + slots ─────────────────────────────────────────────
  if (db) {
    try {
      await db.collection('orgs').doc(orgId)
        .collection('ericaAvailabilityWindows').doc(windowId)
        .set({
          ...window,
          slots,
          slotCount:  slots.length,
          storedAt:   new Date().toISOString(),
        });
    } catch (err: any) {
      console.warn('[availability-service] Failed to persist window:', err.message);
    }
  }

  return {
    success:    true,
    configured: true,
    windowId,
    slots,
    slotCount:  slots.length,
  };
}

// ---------------------------------------------------------------------------
// Retrieve a previously-fetched window (for booking confirmation)
// ---------------------------------------------------------------------------

export async function getAvailabilityWindow(
  orgId:    string,
  windowId: string,
): Promise<(EricaBookingAvailabilityWindow & { slots: EricaBookingSlot[] }) | null> {
  const db = firestore;
  if (!db) return null;
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaAvailabilityWindows').doc(windowId).get();
  if (!snap.exists) return null;
  return snap.data() as any;
}

// ---------------------------------------------------------------------------
// Get a specific slot from a window
// ---------------------------------------------------------------------------

export async function getSlotFromWindow(
  orgId:    string,
  windowId: string,
  slotId:   string,
): Promise<EricaBookingSlot | null> {
  const window = await getAvailabilityWindow(orgId, windowId);
  if (!window) return null;
  return window.slots?.find(s => s.slotId === slotId) ?? null;
}

// ---------------------------------------------------------------------------
// List recent availability lookups for inspection
// ---------------------------------------------------------------------------

export async function listAvailabilityWindows(orgId: string, limit = 20) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaAvailabilityWindows')
    .orderBy('requestedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
