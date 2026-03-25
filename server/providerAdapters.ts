/**
 * Real Provider Sending Adapters
 *
 * Email: Resend (https://resend.com) — requires RESEND_API_KEY, RESEND_FROM_EMAIL
 * SMS:   Twilio — requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *
 * Each adapter:
 *   1. Checks config — returns notConfigured cleanly if env vars are missing
 *   2. Sends via provider REST API — no SDK packages, pure fetch
 *   3. Normalises the result — consistent ProviderSendResult shape
 *   4. Never fakes success — if credentials are missing, says so explicitly
 *
 * ── MISSING SETUP / ACTION REQUIRED ─────────────────────────────────────────
 *
 * Email (Resend):
 *   RESEND_API_KEY      → Get from https://resend.com/api-keys
 *   RESEND_FROM_EMAIL   → Verified sender email e.g. hello@yourdomain.com
 *   RESEND_FROM_NAME    → (optional) Sender display name, e.g. "Momentum"
 *
 * SMS (Twilio):
 *   TWILIO_ACCOUNT_SID  → Get from https://console.twilio.com
 *   TWILIO_AUTH_TOKEN   → Get from https://console.twilio.com
 *   TWILIO_FROM_NUMBER  → Your Twilio phone number e.g. +61412345678
 *
 * Add all of the above as Replit environment secrets.
 */

// ── Shared types ──────────────────────────────────────────────────────────────

export interface ProviderSendRequest {
  to: string;
  subject?: string;
  body: string;
  orgId?: string;
  entityId?: string;
  entityName?: string;
  idempotencyKey?: string;
}

export type ProviderDeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'rejected'
  | 'retrying'
  | 'not_configured';

export interface ProviderSendResult {
  success: boolean;
  notConfigured?: boolean;
  provider: 'resend' | 'twilio' | 'none';
  method: 'provider_email' | 'provider_sms' | 'not_configured';
  messageId?: string;
  deliveryStatus: ProviderDeliveryStatus;
  sentAt: string;
  errorReason?: string;
  errorCode?: string;
  retryable?: boolean;
  providerRaw?: unknown;
}

export interface ProviderConfigStatus {
  configured: boolean;
  missing: string[];
}

export interface ProviderHealthSummary {
  email: { provider: 'resend'; configured: boolean; missing: string[] };
  sms: { provider: 'twilio'; configured: boolean; missing: string[] };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowLabel(): string {
  return new Date().toLocaleDateString('en-AU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function notConfiguredResult(method: 'provider_email' | 'provider_sms'): ProviderSendResult {
  return {
    success: false,
    notConfigured: true,
    provider: 'none',
    method,
    deliveryStatus: 'not_configured',
    sentAt: nowLabel(),
  };
}

// ── Email adapter — Resend ────────────────────────────────────────────────────

export function checkResendConfig(): ProviderConfigStatus {
  const missing: string[] = [];
  if (!process.env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (!process.env.RESEND_FROM_EMAIL) missing.push('RESEND_FROM_EMAIL');
  return { configured: missing.length === 0, missing };
}

export async function sendEmailViaResend(req: ProviderSendRequest): Promise<ProviderSendResult> {
  const config = checkResendConfig();
  if (!config.configured) return notConfiguredResult('provider_email');

  const fromEmail = process.env.RESEND_FROM_EMAIL!;
  const fromName  = process.env.RESEND_FROM_NAME ?? 'Momentum';

  try {
    const payload: Record<string, unknown> = {
      from:    `${fromName} <${fromEmail}>`,
      to:      [req.to],
      subject: req.subject ?? '(No subject)',
      text:    req.body,
    };

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json() as Record<string, unknown>;

    if (resp.ok && data.id) {
      return {
        success: true,
        provider: 'resend',
        method: 'provider_email',
        messageId: data.id as string,
        deliveryStatus: 'queued',
        sentAt: nowLabel(),
        providerRaw: data,
      };
    }

    const errorReason = (data.message ?? data.error ?? `HTTP ${resp.status}`) as string;
    return {
      success: false,
      provider: 'resend',
      method: 'provider_email',
      deliveryStatus: 'failed',
      sentAt: nowLabel(),
      errorReason,
      errorCode: String(resp.status),
      retryable: resp.status >= 500,
      providerRaw: data,
    };

  } catch (err: unknown) {
    return {
      success: false,
      provider: 'resend',
      method: 'provider_email',
      deliveryStatus: 'failed',
      sentAt: nowLabel(),
      errorReason: err instanceof Error ? err.message : 'Unknown error',
      retryable: true,
    };
  }
}

// ── SMS adapter — Twilio ──────────────────────────────────────────────────────

export function checkTwilioConfig(): ProviderConfigStatus {
  const missing: string[] = [];
  if (!process.env.TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID');
  if (!process.env.TWILIO_AUTH_TOKEN)  missing.push('TWILIO_AUTH_TOKEN');
  if (!process.env.TWILIO_FROM_NUMBER) missing.push('TWILIO_FROM_NUMBER');
  return { configured: missing.length === 0, missing };
}

export async function sendSmsViaTwilio(req: ProviderSendRequest): Promise<ProviderSendResult> {
  const config = checkTwilioConfig();
  if (!config.configured) return notConfiguredResult('provider_sms');

  const sid  = process.env.TWILIO_ACCOUNT_SID!;
  const auth = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;

  try {
    const formBody = new URLSearchParams({ From: from, To: req.to, Body: req.body }).toString();

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
      },
    );

    const data = await resp.json() as Record<string, unknown>;

    if (resp.ok && data.sid) {
      const rawStatus = data.status as string;
      const deliveryStatus: ProviderDeliveryStatus =
        rawStatus === 'delivered' ? 'delivered'
        : rawStatus === 'sent' ? 'sent'
        : rawStatus === 'failed' ? 'failed'
        : 'queued';

      return {
        success: true,
        provider: 'twilio',
        method: 'provider_sms',
        messageId: data.sid as string,
        deliveryStatus,
        sentAt: nowLabel(),
        providerRaw: data,
      };
    }

    const twilioCode = data.code ? `(code ${data.code})` : '';
    const errorReason = `${data.message ?? `HTTP ${resp.status}`} ${twilioCode}`.trim();
    const retryable = resp.status >= 500 || data.code === 20429; // rate limited

    return {
      success: false,
      provider: 'twilio',
      method: 'provider_sms',
      deliveryStatus: 'failed',
      sentAt: nowLabel(),
      errorReason,
      errorCode: String(data.code ?? resp.status),
      retryable,
      providerRaw: data,
    };

  } catch (err: unknown) {
    return {
      success: false,
      provider: 'twilio',
      method: 'provider_sms',
      deliveryStatus: 'failed',
      sentAt: nowLabel(),
      errorReason: err instanceof Error ? err.message : 'Unknown error',
      retryable: true,
    };
  }
}

// ── Health summary ─────────────────────────────────────────────────────────────

export function getProviderHealthSummary(): ProviderHealthSummary {
  const email = checkResendConfig();
  const sms   = checkTwilioConfig();
  return {
    email: { provider: 'resend', configured: email.configured, missing: email.missing },
    sms:   { provider: 'twilio', configured: sms.configured, missing: sms.missing },
  };
}

// ── Retry policy ──────────────────────────────────────────────────────────────

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number[];
  terminalCodes: string[];
}

export const EMAIL_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: [5_000, 30_000, 120_000],
  terminalCodes: ['422', '400', '401', '403'],
};

export const SMS_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: [5_000, 30_000, 120_000],
  // Twilio terminal error codes — invalid number, unsubscribed, etc.
  terminalCodes: ['21211', '21612', '21614', '30006', '30007', '21710'],
};

export function isTerminalFailure(policy: RetryPolicy, errorCode?: string): boolean {
  if (!errorCode) return false;
  return policy.terminalCodes.includes(errorCode);
}
