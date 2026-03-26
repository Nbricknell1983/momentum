// =============================================================================
// ERICA BOOKING CONFIRMATION SERVICE
// =============================================================================
// Generates and (where a channel is configured) sends booking confirmations
// after a real confirmed booking or a booking request creation/conversion.
//
// Output:
//   - EricaBookingConfirmation written to Firestore
//   - EricaBookingCommunicationEvent audit entry written
//   - Booking/request status history updated
//
// Channel behaviour:
//   - Email: sends via nodemailer (SMTP_HOST / SENDGRID_API_KEY) when configured
//   - SMS:   currently surfaces as manual (no SMS provider wired yet)
//   - Manual: records the payload for operator action — no automatic send
//
// The service NEVER silently ignores a failure — it records it and surfaces the
// provider state clearly.
// =============================================================================

import { v4 as uuid } from 'uuid';
import { firestore } from '../firebase';
import { updateBookingStatus, writeCommEvent } from './bookingStatusService';
import type {
  EricaBookingConfirmation,
  EricaConfirmationTrigger,
  EricaCommChannel,
  EricaReminderOrgDefaults,
} from './bookingCommunicationTypes';
import type { EricaConfirmedBooking, EricaBookingRequest } from './bookingTypes';

// ---------------------------------------------------------------------------
// Channel configuration check
// ---------------------------------------------------------------------------

export interface ChannelProviderState {
  email: { configured: boolean; missingSecrets: string[] };
  sms:   { configured: boolean; missingSecrets: string[] };
}

export function getChannelProviderState(): ChannelProviderState {
  const emailMissing: string[] = [];
  if (!process.env.SMTP_HOST && !process.env.SENDGRID_API_KEY && !process.env.RESEND_API_KEY) {
    emailMissing.push('SMTP_HOST (or SENDGRID_API_KEY or RESEND_API_KEY)');
  }
  return {
    email: {
      configured:     emailMissing.length === 0,
      missingSecrets: emailMissing,
    },
    sms: {
      configured:     false,         // No SMS provider wired yet
      missingSecrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'],
    },
  };
}

// ---------------------------------------------------------------------------
// Build confirmation from a confirmed booking
// ---------------------------------------------------------------------------

export async function generateBookingConfirmation(
  orgId:       string,
  booking:     EricaConfirmedBooking,
  defaults:    Partial<EricaReminderOrgDefaults>,
  trigger:     EricaConfirmationTrigger = 'booking_confirmed',
  performedBy: string = 'erica',
): Promise<EricaBookingConfirmation> {
  const db = firestore;

  const confirmationId = uuid();
  const now            = new Date().toISOString();
  const channelState   = getChannelProviderState();

  // Prefer email, fall back to manual
  const channel: EricaCommChannel =
    booking.contactEmail && channelState.email.configured ? 'email' : 'manual';

  const formatStr = formatMeetingFormat(booking.format);

  const subject = `Appointment Confirmed — ${booking.meetingPurpose}`;

  const rescheduleNote = buildRescheduleNote(defaults);

  const bodyText = buildConfirmationText({
    toName:        booking.contactName ?? booking.entityName,
    meetingPurpose: booking.meetingPurpose,
    dateLabel:     booking.slot.dateLabel,
    timeLabel:     booking.slot.timeLabel,
    formatStr,
    meetingLink:   booking.meetingLink,
    businessName:  booking.businessName,
    fromName:      defaults.fromName ?? 'The Team',
    rescheduleNote,
  });

  const bodyHtml = buildConfirmationHtml({
    toName:        booking.contactName ?? booking.entityName,
    meetingPurpose: booking.meetingPurpose,
    dateLabel:     booking.slot.dateLabel,
    timeLabel:     booking.slot.timeLabel,
    formatStr,
    meetingLink:   booking.meetingLink,
    businessName:  booking.businessName,
    fromName:      defaults.fromName ?? 'The Team',
    rescheduleNote,
  });

  const confirmation: EricaBookingConfirmation = {
    confirmationId,
    bookingId:    booking.bookingId,
    orgId,
    createdAt:    now,
    trigger,
    toName:       booking.contactName ?? booking.entityName,
    toEmail:      booking.contactEmail,
    toPhone:      booking.phone,
    channel,
    appointmentDateLabel: booking.slot.dateLabel,
    appointmentTimeLabel: booking.slot.timeLabel,
    meetingFormat:        formatStr,
    meetingLink:          booking.meetingLink,
    meetingPurpose:       booking.meetingPurpose,
    businessName:         booking.businessName,
    contactName:          booking.contactName ?? booking.entityName,
    subject,
    bodyText,
    bodyHtml,
    rescheduleNote,
    entityType:   booking.entityType,
    entityId:     booking.entityId,
    callId:       booking.callId,
    batchId:      booking.batchId,
    status:       'pending',
  };

  // Persist
  if (db) {
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingConfirmations').doc(confirmationId)
      .set({ ...confirmation });

    await writeCommEvent(db, orgId, {
      bookingId:   booking.bookingId,
      eventType:   'confirmation_generated',
      channel,
      note:        `Confirmation generated — channel: ${channel}`,
      metadata:    { confirmationId, trigger },
      performedBy,
    });
  }

  // Attempt send
  const sentConfirmation = await sendConfirmation(confirmation, channelState, performedBy);
  return sentConfirmation;
}

// ---------------------------------------------------------------------------
// Build confirmation from a booking request
// ---------------------------------------------------------------------------

export async function generateBookingRequestAcknowledgement(
  orgId:       string,
  request:     EricaBookingRequest,
  defaults:    Partial<EricaReminderOrgDefaults>,
  performedBy: string = 'erica',
): Promise<EricaBookingConfirmation> {
  const db = firestore;

  const confirmationId = uuid();
  const now            = new Date().toISOString();
  const channelState   = getChannelProviderState();
  const channel: EricaCommChannel = channelState.email.configured ? 'email' : 'manual';

  const subject = `We have your appointment request — ${request.meetingPurpose}`;
  const rescheduleNote = buildRescheduleNote(defaults);

  const bodyText = [
    `Hi ${request.contactName ?? request.entityName},`,
    ``,
    `Thanks for taking the time to speak with us. We have received your appointment request for:`,
    ``,
    `  Purpose: ${request.meetingPurpose}`,
    `  Format: ${request.preferredFormat.replace('_', ' ')}`,
    ``,
    `Our team will confirm a specific time with you shortly.`,
    ``,
    rescheduleNote,
    ``,
    `Thanks,`,
    defaults.fromName ?? 'The Team',
  ].join('\n');

  const confirmation: EricaBookingConfirmation = {
    confirmationId,
    bookingId:    request.requestId,
    orgId,
    createdAt:    now,
    trigger:      'booking_request_created',
    toName:       request.contactName ?? request.entityName,
    toEmail:      undefined,
    toPhone:      request.phone,
    channel,
    appointmentDateLabel: 'TBC',
    appointmentTimeLabel: 'TBC — team will confirm',
    meetingFormat:        request.preferredFormat.replace('_', ' '),
    meetingPurpose:       request.meetingPurpose,
    businessName:         request.businessName,
    contactName:          request.contactName ?? request.entityName,
    subject,
    bodyText,
    rescheduleNote,
    entityType:   request.entityType,
    entityId:     request.entityId,
    callId:       request.callId,
    batchId:      request.batchId,
    status:       'pending',
  };

  if (db) {
    await db.collection('orgs').doc(orgId)
      .collection('ericaBookingConfirmations').doc(confirmationId)
      .set({ ...confirmation });
    await writeCommEvent(db, orgId, {
      bookingId:  request.requestId,
      eventType:  'confirmation_generated',
      channel,
      note:       `Request acknowledgement generated — channel: ${channel}`,
      metadata:   { confirmationId },
      performedBy,
    });
  }

  return await sendConfirmation(confirmation, channelState, performedBy);
}

// ---------------------------------------------------------------------------
// Send confirmation via configured channel
// ---------------------------------------------------------------------------

async function sendConfirmation(
  confirmation: EricaBookingConfirmation,
  channelState: ChannelProviderState,
  performedBy:  string,
): Promise<EricaBookingConfirmation> {
  const db = firestore;

  if (confirmation.channel === 'email' && confirmation.toEmail) {
    if (!channelState.email.configured) {
      return await markConfirmationStatus(confirmation, 'skipped',
        `Email not configured. Missing: ${channelState.email.missingSecrets.join(', ')}`, performedBy);
    }

    // Try Resend first, then SendGrid, then SMTP (nodemailer)
    try {
      const result = await trySendEmail(confirmation);
      return await markConfirmationStatus(confirmation, 'sent', undefined, performedBy, result.messageId);
    } catch (err: any) {
      return await markConfirmationStatus(confirmation, 'failed', err.message, performedBy);
    }
  }

  // Manual channel — record payload only, no send
  return await markConfirmationStatus(confirmation, 'skipped',
    `Channel: manual — no automatic send. Payload recorded for operator.`, performedBy);
}

// ---------------------------------------------------------------------------
// Email send — Resend → SendGrid → SMTP (first configured wins)
// ---------------------------------------------------------------------------

// Exported so reminder service can reuse the same send chain
export async function trySendEmailReminder(reminder: { toEmail?: string; subject: string; bodyText: string; bodyHtml?: string }): Promise<{ messageId?: string }> {
  return trySendEmail({ ...reminder, toEmail: reminder.toEmail } as any);
}

async function trySendEmail(confirmation: { toEmail?: string; subject: string; bodyText: string; bodyHtml?: string }): Promise<{ messageId?: string }> {
  // Resend
  if (process.env.RESEND_API_KEY && confirmation.toEmail) {
    const resp = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM_EMAIL ?? `noreply@${process.env.APP_DOMAIN ?? 'momentum.app'}`,
        to:      [confirmation.toEmail],
        subject: confirmation.subject,
        text:    confirmation.bodyText,
        html:    confirmation.bodyHtml,
      }),
    });
    if (!resp.ok) throw new Error(`Resend send failed: ${await resp.text()}`);
    const data = await resp.json() as { id?: string };
    return { messageId: data.id };
  }

  // SendGrid
  if (process.env.SENDGRID_API_KEY && confirmation.toEmail) {
    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: confirmation.toEmail, name: confirmation.toName }] }],
        from:             { email: process.env.SENDGRID_FROM_EMAIL ?? 'noreply@momentum.app' },
        subject:          confirmation.subject,
        content:          [
          { type: 'text/plain', value: confirmation.bodyText },
          ...(confirmation.bodyHtml ? [{ type: 'text/html', value: confirmation.bodyHtml }] : []),
        ],
      }),
    });
    if (!resp.ok) throw new Error(`SendGrid send failed: ${await resp.text()}`);
    return { messageId: resp.headers.get('x-message-id') ?? undefined };
  }

  // SMTP via nodemailer (lazy import)
  if (process.env.SMTP_HOST && confirmation.toEmail) {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });
    const info = await transporter.sendMail({
      from:    process.env.SMTP_FROM ?? `noreply@${process.env.SMTP_HOST}`,
      to:      confirmation.toEmail,
      subject: confirmation.subject,
      text:    confirmation.bodyText,
      html:    confirmation.bodyHtml,
    });
    return { messageId: info.messageId };
  }

  throw new Error('No email provider configured');
}

// ---------------------------------------------------------------------------
// Update confirmation status in Firestore
// ---------------------------------------------------------------------------

async function markConfirmationStatus(
  confirmation: EricaBookingConfirmation,
  status:       'sent' | 'failed' | 'skipped',
  failureReason?: string,
  performedBy:    string = 'erica',
  providerMessageId?: string,
): Promise<EricaBookingConfirmation> {
  const db = firestore;
  const now = new Date().toISOString();
  const updated: EricaBookingConfirmation = {
    ...confirmation,
    status,
    sentAt:            status === 'sent' ? now : undefined,
    failureReason:     status !== 'sent' ? failureReason : undefined,
    providerMessageId,
  };

  if (db) {
    await db.collection('orgs').doc(confirmation.orgId)
      .collection('ericaBookingConfirmations').doc(confirmation.confirmationId)
      .set({ status, sentAt: updated.sentAt ?? null, failureReason: updated.failureReason ?? null, providerMessageId: providerMessageId ?? null }, { merge: true });

    const eventType =
      status === 'sent'    ? 'confirmation_sent' as const :
      status === 'skipped' ? 'confirmation_skipped' as const :
                             'confirmation_failed' as const;

    await writeCommEvent(db, confirmation.orgId, {
      bookingId:  confirmation.bookingId,
      eventType,
      channel:    confirmation.channel,
      note:       failureReason ?? `Confirmation ${status}`,
      metadata:   { confirmationId: confirmation.confirmationId, status },
      performedBy,
    });

    // Update booking status
    const nextStatus = status === 'sent' ? 'confirmation_sent' as const
                     : status === 'failed' ? 'confirmation_failed' as const
                     : undefined;
    if (nextStatus) {
      await updateBookingStatus(db, confirmation.orgId, confirmation.bookingId, nextStatus, performedBy);
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// List confirmations
// ---------------------------------------------------------------------------

export async function listConfirmations(orgId: string, limit = 50) {
  const db = firestore;
  if (!db) return [];
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingConfirmations')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getConfirmationForBooking(orgId: string, bookingId: string) {
  const db = firestore;
  if (!db) return null;
  const snap = await db.collection('orgs').doc(orgId)
    .collection('ericaBookingConfirmations')
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

function buildConfirmationText(ctx: {
  toName: string; meetingPurpose: string; dateLabel: string; timeLabel: string;
  formatStr: string; meetingLink?: string; businessName: string; fromName: string;
  rescheduleNote: string;
}): string {
  return [
    `Hi ${ctx.toName},`,
    ``,
    `Your appointment is confirmed. Here are the details:`,
    ``,
    `  What:  ${ctx.meetingPurpose}`,
    `  When:  ${ctx.dateLabel} at ${ctx.timeLabel}`,
    `  How:   ${ctx.formatStr}`,
    ctx.meetingLink ? `  Link:  ${ctx.meetingLink}` : null,
    ``,
    `We are looking forward to speaking with you.`,
    ``,
    ctx.rescheduleNote,
    ``,
    `Thanks,`,
    ctx.fromName,
  ].filter(l => l !== null).join('\n');
}

function buildConfirmationHtml(ctx: {
  toName: string; meetingPurpose: string; dateLabel: string; timeLabel: string;
  formatStr: string; meetingLink?: string; businessName: string; fromName: string;
  rescheduleNote: string;
}): string {
  const linkRow = ctx.meetingLink
    ? `<tr><td style="padding:4px 0;color:#64748b;font-size:14px;">Meeting link</td><td style="padding:4px 0 4px 16px;font-size:14px;"><a href="${ctx.meetingLink}" style="color:#2563eb;">Join meeting</a></td></tr>`
    : '';

  return `
<!DOCTYPE html>
<html>
<body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;margin:0;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#1e293b;padding:24px 32px;">
      <h2 style="color:#fff;margin:0;font-size:20px;">Appointment Confirmed</h2>
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;color:#1e293b;margin:0 0 20px;">Hi ${ctx.toName},</p>
      <p style="font-size:15px;color:#475569;margin:0 0 24px;">Your appointment is confirmed. Here are the details:</p>
      <table style="border-collapse:collapse;width:100%;margin:0 0 24px;">
        <tr><td style="padding:4px 0;color:#64748b;font-size:14px;vertical-align:top;">What</td><td style="padding:4px 0 4px 16px;font-size:14px;color:#1e293b;font-weight:600;">${ctx.meetingPurpose}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;font-size:14px;">When</td><td style="padding:4px 0 4px 16px;font-size:14px;color:#1e293b;">${ctx.dateLabel} at ${ctx.timeLabel}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;font-size:14px;">How</td><td style="padding:4px 0 4px 16px;font-size:14px;color:#1e293b;">${ctx.formatStr}</td></tr>
        ${linkRow}
      </table>
      <p style="font-size:15px;color:#475569;margin:0 0 24px;">We are looking forward to speaking with you.</p>
      <p style="font-size:13px;color:#94a3b8;margin:0;">${ctx.rescheduleNote}</p>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="font-size:13px;color:#64748b;margin:0;">Thanks, ${ctx.fromName}</p>
    </div>
  </div>
</body>
</html>`.trim();
}

function buildRescheduleNote(defaults: Partial<EricaReminderOrgDefaults>): string {
  const parts: string[] = ['Need to reschedule or cancel?'];
  if (defaults.rescheduleEmail) parts.push(`Email us at ${defaults.rescheduleEmail}`);
  if (defaults.reschedulePhone) parts.push(`or call ${defaults.reschedulePhone}`);
  if (parts.length === 1) parts.push('Please contact us as soon as possible.');
  return parts.join(' ');
}

function formatMeetingFormat(format: string): string {
  const map: Record<string, string> = {
    zoom:        'Zoom video call',
    phone:       'Phone call',
    google_meet: 'Google Meet',
    in_person:   'In person',
    teams:       'Microsoft Teams',
  };
  return map[format] ?? format;
}
