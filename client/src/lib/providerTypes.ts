// ── Provider delivery status ───────────────────────────────────────────────────

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

export const DELIVERY_STATUS_LABELS: Record<ProviderDeliveryStatus, string> = {
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
  bounced: 'Bounced',
  rejected: 'Rejected',
  retrying: 'Retrying',
  not_configured: 'Not Configured',
};

export const DELIVERY_STATUS_STYLES: Record<ProviderDeliveryStatus, string> = {
  queued: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  sending: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  sent: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  delivered: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  failed: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  bounced: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  rejected: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  retrying: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  not_configured: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
};

// ── Provider send result (client-side shape from API) ─────────────────────────

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
}

// ── Provider config status ─────────────────────────────────────────────────────

export interface ProviderConfigStatus {
  provider: string;
  configured: boolean;
  missing: string[];
}

export interface ProviderHealthSummary {
  email: ProviderConfigStatus & { provider: 'resend' };
  sms: ProviderConfigStatus & { provider: 'twilio' };
}

// ── Send attempt record (stored in Firestore) ─────────────────────────────────

export interface SendAttemptRecord {
  id?: string;
  orgId: string;
  entityId?: string;
  entityName?: string;
  channel: 'email' | 'sms';
  provider: 'resend' | 'twilio' | 'none';
  method: string;
  to: string;
  subject?: string;
  bodySnippet: string;
  messageId?: string;
  deliveryStatus: ProviderDeliveryStatus;
  sentAt: string;
  sentBy?: string;
  attemptNumber: number;
  errorReason?: string;
  errorCode?: string;
  retryable?: boolean;
  linkedCommHistoryId?: string;
}

// ── Webhook event ─────────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'email.delivered'
  | 'email.opened'
  | 'email.bounced'
  | 'email.spam'
  | 'sms.delivered'
  | 'sms.failed'
  | 'sms.undelivered';

export interface ProviderWebhookEvent {
  id?: string;
  orgId?: string;
  provider: 'resend' | 'twilio';
  eventType: WebhookEventType;
  messageId: string;
  receivedAt: string;
  rawPayload?: unknown;
}

// ── Retry state ───────────────────────────────────────────────────────────────

export interface ProviderRetryState {
  attemptCount: number;
  nextRetryAt?: string;
  lastErrorReason?: string;
  isTerminal: boolean;
}

// ── Provider method labels ────────────────────────────────────────────────────

export const PROVIDER_LABELS: Record<string, string> = {
  resend: 'Resend',
  twilio: 'Twilio',
  none: 'Not configured',
  provider_email: 'Provider Email',
  provider_sms: 'Provider SMS',
  mailto: 'Email Client',
  sms_app: 'SMS App',
  clipboard: 'Clipboard',
  manual_log: 'Manual Log',
  manual: 'Manual',
};
