// =============================================================================
// ERICA BOOKING REMINDER SERVICE
// =============================================================================
// Builds the full reminder schedule for a confirmed booking and sends
// due reminders when the scheduler fires.
//
// Schedule (configurable via org defaults):
//   1. Immediate — generated at booking creation (optional)
//   2. 24-hour   — sent ~24 hours before appointment
//   3. Same-day  — sent morning of appointment day (8 AM in appointment timezone)
//
// Suppression rules:
//   - If appointment is within `suppressIfWithin` hours, skip that reminder
//   - If contact has no email and no phone, skip all automated reminders
//   - Reminders already sent are never re-sent (idempotent by scheduleId+type)
//
// Sending:
//   - Email when configured (same provider chain as confirmations)
//   - Manual fallback otherwise (payload stored, no automatic send)
// =============================================================================

import { v4 as uuid } from 'uuid';
import type { Firestore } from 'firebase-admin/firestore';
import { firestore } from '../firebase';
import { updateBookingStatus, writeCommEvent } from './bookingStatusService';
import { getChannelProviderState, trySendEmailReminder } from './bookingConfirmationService';
import type {
  EricaBookingReminder,
  EricaReminderSchedule,
  EricaReminderType,
  EricaReminderOrgDefaults,
  EricaCommChannel,
} from './bookingCommunicationTypes';
import type { EricaConfirmedBooking } from './bookingTypes';

export { DEFAULT_REMINDER_ORG_DEFAULTS } from './bookingCommunicationTypes';

// ---------------------------------------------------------------------------
// Build + store a reminder schedule for a confirmed booking
// ---------------------------------------------------------------------------

export async function buildReminderSchedule(
  orgId:       string,
  booking:     EricaConfirmedBooking,
  defaults:    Partial<EricaReminderOrgDefaults>,
  performedBy: string = 'erica',
): Promise<EricaReminderSchedule> {
  const db      = firestore;
  const now     = new Date();
  const apptIso = booking.slot.startIso;
  const apptMs  = new Date(apptIso).getTime();
  const tz      = defaults.preferredChannel === 'sms' ? 'SMS' : booking.slot.timeLabel;

  const suppressIfWithin = (defaults.suppressIfWithin ?? 2) * 3_600_000; // hours → ms

  const scheduleId = uuid();
  const reminders: EricaBookingReminder[] = [];
  const suppressionRules: string[] = [];

  const hasEmail = !!booking.contactEmail;
  const hasPhone = !!booking.phone;
  const channel: EricaCommChannel = hasEmail ? 'email' : 'manual';

  const sendAny = hasEmail || hasPhone;

  // Helper to build a single reminder
  const makeReminder = (
    type:         EricaReminderType,
    scheduledFor: Date,
    suppressed?:  string,
  ): EricaBookingReminder => {
    const hoursUntil = (scheduledFor.getTime() - now.getTime()) / 3_600_000;
    const tooClose   = suppressed ?? (hoursUntil < 0 ? 'Reminder time has already passed' : undefined);

    const subject = buildReminderSubject(type, booking.slot.dateLabel, booking.meetingPurpose);
    const bodyText = buildReminderText(type, {
      toName:       booking.contactName ?? booking.entityName,
      dateLabel:    booking.slot.dateLabel,
      timeLabel:    booking.slot.timeLabel,
      formatStr:    formatMeetingFormat(booking.format),
      meetingLink:  booking.meetingLink,
      fromName:     defaults.fromName ?? 'The Team',
    });

    return {
      reminderId:   uuid(),
      bookingId:    booking.bookingId,
      orgId,
      createdAt:    now.toISOString(),
      reminderType: type,
      scheduledFor: scheduledFor.toISOString(),
      suppressedReason: tooClose,
      toName:       booking.contactName ?? booking.entityName,
      toEmail:      booking.contactEmail,
      toPhone:      booking.phone,
      channel,
      subject,
      bodyText,
      appointmentDateLabel: booking.slot.dateLabel,
      appointmentTimeLabel: booking.slot.timeLabel,
      meetingFormat:        formatMeetingFormat(booking.format),
      meetingLink:  booking.meetingLink,
      entityType:   booking.entityType,
      entityId:     booking.entityId,
      callId:       booking.callId,
      status:       tooClose ? 'suppressed' : 'scheduled',
    };
  };

  // 24-hour reminder
  if (defaults.send24HourReminder !== false) {
    const scheduledFor = new Date(apptMs - 24 * 3_600_000);
    const tooClose     = (apptMs - now.getTime()) < suppressIfWithin + 24 * 3_600_000
      ? `Appointment within ${Math.round((apptMs - now.getTime()) / 3_600_000)}h — 24h reminder suppressed`
      : undefined;
    if (tooClose) suppressionRules.push(tooClose);
    reminders.push(makeReminder('24_hour', scheduledFor, sendAny ? tooClose : 'No contact channel'));
  }

  // Same-day reminder — 8 AM in org-preferred timezone (approximated to 8 AM UTC for now)
  if (defaults.sendSameDayReminder !== false) {
    const apptDate    = new Date(apptIso);
    const sameDayDate = new Date(apptDate);
    sameDayDate.setUTCHours(22, 0, 0, 0); // 8 AM AEST (UTC+10)
    // Move to day before in UTC if appointment is early in AEST
    if (sameDayDate.getTime() >= apptMs) {
      sameDayDate.setUTCDate(sameDayDate.getUTCDate() - 1);
    }

    const tooClose = (sameDayDate.getTime() - now.getTime()) < 0
      ? 'Same-day reminder time has already passed'
      : (apptMs - now.getTime()) < suppressIfWithin
      ? `Appointment within ${defaults.suppressIfWithin ?? 2}h — same-day reminder suppressed`
      : undefined;
    if (tooClose) suppressionRules.push(tooClose);
    reminders.push(makeReminder('same_day', sameDayDate, sendAny ? tooClose : 'No contact channel'));
  }

  const schedule: EricaReminderSchedule = {
    scheduleId,
    bookingId:       booking.bookingId,
    orgId,
    createdAt:       now.toISOString(),
    appointmentIso:  apptIso,
    timezone:        defaults.fromName ?? 'Australia/Sydney',
    contactHasEmail: hasEmail,
    contactHasPhone: hasPhone,
    reminders,
    suppressionRules,
    totalScheduled:  reminders.filter(r => r.status === 'scheduled').length,
    totalSuppressed: reminders.filter(r => r.status === 'suppressed').length,
  };

  // Persist
  if (db) {
    await db.collection('orgs').doc(orgId)
      .collection('ericaReminderSchedules').doc(scheduleId)
      .set({ ...schedule });

    // Write individual reminders to sub-collection for scheduler lookup
    for (const rem of reminders) {
      await db.collection('orgs').doc(orgId)
        .collection('ericaReminders').doc(rem.reminderId)
        .set({ ...rem, scheduleId });
    }

    await writeCommEvent(db, orgId, {
      bookingId:   booking.bookingId,
      eventType:   'reminder_scheduled',
      note:        `Reminder schedule created — ${schedule.totalScheduled} scheduled, ${schedule.totalSuppressed} suppressed`,
      metadata:    { scheduleId, totalScheduled: schedule.totalScheduled },
      performedBy,
    });

    await updateBookingStatus(db, orgId, booking.bookingId, 'reminder_scheduled', performedBy,
      `${schedule.totalScheduled} reminders scheduled`);
  }

  return schedule;
}

// ---------------------------------------------------------------------------
// Process due reminders (called by a scheduler)
// ---------------------------------------------------------------------------

export async function processDueReminders(orgId: string): Promise<{ processed: number; failed: number }> {
  const db = firestore;
  if (!db) return { processed: 0, failed: 0 };

  const now = new Date();

  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaReminders')
    .where('status', '==', 'scheduled')
    .where('scheduledFor', '<=', now.toISOString())
    .limit(50)
    .get();

  let processed = 0;
  let failed    = 0;
  const channelState = getChannelProviderState();

  for (const doc of snap.docs) {
    const reminder = doc.data() as EricaBookingReminder;
    try {
      await sendReminder(db, orgId, reminder, channelState);
      processed++;
    } catch (err: any) {
      console.error(`[reminder-service] Failed to send reminder ${reminder.reminderId}:`, err.message);
      await db.collection('orgs').doc(orgId).collection('ericaReminders').doc(reminder.reminderId)
        .set({ status: 'failed', failureReason: err.message, sentAt: null }, { merge: true });
      await writeCommEvent(db, orgId, {
        bookingId:   reminder.bookingId,
        eventType:   'reminder_failed',
        channel:     reminder.channel,
        note:        `Reminder failed: ${err.message}`,
        metadata:    { reminderId: reminder.reminderId },
        performedBy: 'scheduler',
      });
      failed++;
    }
  }

  return { processed, failed };
}

async function sendReminder(
  db:           Firestore,
  orgId:        string,
  reminder:     EricaBookingReminder,
  channelState: ReturnType<typeof getChannelProviderState>,
): Promise<void> {
  const now = new Date().toISOString();

  if (reminder.channel === 'email' && reminder.toEmail && channelState.email.configured) {
    try {
      const result = await trySendEmailReminder(reminder);
      await db.collection('orgs').doc(orgId).collection('ericaReminders').doc(reminder.reminderId)
        .set({ status: 'sent', sentAt: now, providerMessageId: result.messageId ?? null }, { merge: true });
      await writeCommEvent(db, orgId, {
        bookingId:   reminder.bookingId,
        eventType:   'reminder_sent',
        channel:     'email',
        note:        `${reminder.reminderType.replace('_', '-')} reminder sent`,
        metadata:    { reminderId: reminder.reminderId },
        performedBy: 'scheduler',
      });
      await updateBookingStatus(db, orgId, reminder.bookingId, 'reminder_sent', 'scheduler',
        `${reminder.reminderType} reminder sent`);
      return;
    } catch (err: any) {
      throw err;
    }
  }

  // Manual fallback — mark as skipped/recorded
  await db.collection('orgs').doc(orgId).collection('ericaReminders').doc(reminder.reminderId)
    .set({ status: 'sent', sentAt: now, fallbackUsed: true, fallbackReason: 'manual_channel' }, { merge: true });

  await writeCommEvent(db, orgId, {
    bookingId:   reminder.bookingId,
    eventType:   'reminder_sent',
    channel:     'manual',
    note:        `${reminder.reminderType} reminder recorded (manual channel — no automatic send)`,
    metadata:    { reminderId: reminder.reminderId },
    performedBy: 'scheduler',
  });
}

// ---------------------------------------------------------------------------
// List reminder schedules and individual reminders
// ---------------------------------------------------------------------------

export async function listReminderSchedules(orgId: string, limit = 20) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaReminderSchedules')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listReminders(orgId: string, limit = 50) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaReminders')
    .orderBy('scheduledFor', 'asc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getScheduleForBooking(orgId: string, bookingId: string) {
  const db = firestore;
  if (!db) return null;
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaReminderSchedules')
    .where('bookingId', '==', bookingId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ---------------------------------------------------------------------------
// Text builders
// ---------------------------------------------------------------------------

function buildReminderSubject(type: EricaReminderType, dateLabel: string, purpose: string): string {
  if (type === '24_hour')  return `Reminder: Your appointment tomorrow — ${purpose}`;
  if (type === 'same_day') return `Today: Your appointment — ${purpose}`;
  return `Upcoming appointment — ${purpose}`;
}

function buildReminderText(type: EricaReminderType, ctx: {
  toName: string; dateLabel: string; timeLabel: string;
  formatStr: string; meetingLink?: string; fromName: string;
}): string {
  const timeRef = type === 'same_day' ? 'today' : type === '24_hour' ? 'tomorrow' : 'soon';
  return [
    `Hi ${ctx.toName},`,
    ``,
    `This is a friendly reminder about your appointment ${timeRef}:`,
    ``,
    `  When:  ${ctx.dateLabel} at ${ctx.timeLabel}`,
    `  How:   ${ctx.formatStr}`,
    ctx.meetingLink ? `  Link:  ${ctx.meetingLink}` : null,
    ``,
    `We are looking forward to speaking with you.`,
    ``,
    `Thanks,`,
    ctx.fromName,
  ].filter(l => l !== null).join('\n');
}

function formatMeetingFormat(format: string): string {
  const map: Record<string, string> = {
    zoom: 'Zoom video call', phone: 'Phone call',
    google_meet: 'Google Meet', in_person: 'In person', teams: 'Microsoft Teams',
  };
  return map[format] ?? format;
}
