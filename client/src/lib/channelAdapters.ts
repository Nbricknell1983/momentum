import type { ChannelIntegrationState, ExecutionChannel, ExecutionSendResult, SendMethod } from '@/lib/execAutomationTypes';
import type { ProviderSendResult } from '@/lib/providerTypes';
import { auth } from '@/lib/firebase';

// ── Channel integration states ────────────────────────────────────────────────
// Honest declaration of exactly what is available and how it works.
// When real integrations are added (SMTP, Twilio, etc.) update method + isAvailable.

export const CHANNEL_STATES: ChannelIntegrationState[] = [
  {
    channel: 'email',
    isAvailable: true,
    method: 'mailto',
    label: 'Email',
    sendLabel: 'Open in email client',
    description: 'Opens your default email client with the draft pre-filled as a mailto: link. You review and send it from there.',
    missingConfig: [],
    notes:
      'No SMTP server is configured. Sending uses a mailto: link that opens your local email client. ' +
      'To enable direct system sending, add SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) as environment secrets.',
  },
  {
    channel: 'sms',
    isAvailable: true,
    method: 'sms_app',
    label: 'SMS',
    sendLabel: 'Open SMS app',
    description:
      'On mobile devices, opens your SMS app with the message pre-filled. On desktop, the message is copied to your clipboard.',
    missingConfig: [],
    notes:
      'No SMS gateway (Twilio, MessageBird, etc.) is configured. Sending uses the sms: protocol on mobile or clipboard on desktop. ' +
      'To enable server-side SMS, add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.',
  },
  {
    channel: 'call',
    isAvailable: true,
    method: 'manual_log',
    label: 'Call Prep',
    sendLabel: 'Log call outcome',
    description: 'Call prep notes are shown as a reference script. After the call, log the outcome (connected, voicemail, no answer).',
    missingConfig: [],
    notes:
      'No dialler or telephony integration is configured. Call prep notes are reference material only. ' +
      'Outcome is logged manually. To enable click-to-call, connect a VoIP provider.',
  },
  {
    channel: 'voicemail',
    isAvailable: true,
    method: 'manual_log',
    label: 'Voicemail',
    sendLabel: 'Log voicemail left',
    description: 'The voicemail script is shown for reference. After leaving the voicemail, mark it as logged here.',
    missingConfig: [],
    notes:
      'No dialler integration configured. Voicemail scripts are reference material only. ' +
      'Log that a voicemail was left manually after the call.',
  },
];

export function getChannelState(channel: ExecutionChannel): ChannelIntegrationState {
  return CHANNEL_STATES.find(s => s.channel === channel) ?? CHANNEL_STATES[0];
}

// ── Send dispatcher ───────────────────────────────────────────────────────────
// Each case does the most it can with available tools.
// No sends are faked. If there is no integration, the boundary is made explicit.

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function nowLabel(): string {
  return new Date().toLocaleDateString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) + ' ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export async function sendViaChannel(
  channel: ExecutionChannel,
  params: { to?: string; subject?: string; body: string },
): Promise<ExecutionSendResult> {
  const sentAt = nowLabel();

  if (channel === 'email') {
    const to = encodeURIComponent(params.to ?? '');
    const subject = encodeURIComponent(params.subject ?? '');
    const body = encodeURIComponent(params.body);
    try {
      window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
      return {
        success: true,
        method: 'mailto',
        sentAt,
        note: 'Email client opened. After you send the email, mark it as sent here to complete the record.',
      };
    } catch {
      return {
        success: false,
        method: 'mailto',
        sentAt,
        errorReason: 'Could not open email client. Copy the draft and send manually.',
      };
    }
  }

  if (channel === 'sms') {
    try {
      if (isMobile()) {
        const body = encodeURIComponent(params.body);
        window.open(`sms:?&body=${body}`, '_blank');
        return { success: true, method: 'sms_app', sentAt, note: 'SMS app opened with message pre-filled.' };
      } else {
        await navigator.clipboard.writeText(params.body);
        return { success: true, method: 'clipboard', sentAt, note: 'Message copied to clipboard. Send from your phone and mark as sent here.' };
      }
    } catch {
      return { success: false, method: 'clipboard', sentAt, errorReason: 'Could not copy to clipboard. Please copy the draft manually.' };
    }
  }

  // call + voicemail — reference material, outcome logged manually
  return {
    success: true,
    method: 'manual_log',
    sentAt,
    note: 'Use the reference notes above, then log the outcome below.',
  };
}

// ── Real provider send ────────────────────────────────────────────────────────
// Calls the server-side provider adapter (Resend for email, Twilio for SMS).
// Returns null if the network call itself fails.
// Returns a result with notConfigured=true if the provider is not set up.
// The caller should fall back to sendViaChannel if notConfigured.

export async function sendViaProvider(
  channel: 'email' | 'sms',
  params: { to?: string; subject?: string; body: string },
  orgId: string,
  entityId?: string,
  entityName?: string,
): Promise<ProviderSendResult | null> {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken();

    const res = await fetch(`/api/orgs/${orgId}/send/${channel}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: params.to ?? '',
        subject: params.subject,
        body: params.body,
        entityId,
        entityName,
      }),
    });

    if (!res.ok && res.status !== 200) {
      const text = await res.text().catch(() => '');
      console.warn('[sendViaProvider] non-ok response', res.status, text);
      return null;
    }

    return await res.json() as ProviderSendResult;
  } catch (err) {
    console.warn('[sendViaProvider] network error', err);
    return null;
  }
}

// Whether provider API is likely available (env-set) for a given channel
// Used by the UI to show "Send via Resend" vs "Open email client"
export function getProviderLabel(channel: 'email' | 'sms'): string {
  if (channel === 'email') return 'Send via Resend';
  if (channel === 'sms') return 'Send via Twilio';
  return 'Send';
}
