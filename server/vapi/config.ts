// =============================================================================
// MOMENTUM VAPI — CONFIGURATION LAYER
// =============================================================================
// All Vapi connection settings flow from here.
// Never read process.env directly outside this file in the Vapi layer.
//
// MISSING SETUP (required from Nathan):
//   VAPI_API_KEY          — Vapi dashboard API key (Settings → API Keys)
//   VAPI_PHONE_NUMBER_ID  — Vapi phone number ID for outbound calls
//   VAPI_WEBHOOK_SECRET   — Secret set on Vapi webhook for header validation
//
// Each Vapi assistant is configured separately in the Vapi dashboard.
// Assistant IDs are stored per-org in Firestore (vapiConfig doc).
// =============================================================================

export const MISSING_VAPI_SETUP = [
  {
    envVar:      'VAPI_API_KEY',
    label:       'Vapi API Key',
    where:       'Vapi dashboard → Settings → API Keys',
    required:    true,
    impact:      'Cannot create outbound calls or query call status',
  },
  {
    envVar:      'VAPI_PHONE_NUMBER_ID',
    label:       'Vapi Phone Number ID',
    where:       'Vapi dashboard → Phone Numbers — copy the ID for the number you want to call from',
    required:    true,
    impact:      'Cannot initiate outbound calls',
  },
  {
    envVar:      'VAPI_WEBHOOK_SECRET',
    label:       'Vapi Webhook Secret',
    where:       'Vapi dashboard → Webhooks — set a shared secret and paste here',
    required:    false,
    impact:      'Webhook payloads will not be signature-validated (security risk in production)',
  },
] as const;

export function isVapiConfigured(): boolean {
  return !!(process.env.VAPI_API_KEY && process.env.VAPI_PHONE_NUMBER_ID);
}

export function isVapiWebhookSecured(): boolean {
  return !!process.env.VAPI_WEBHOOK_SECRET;
}

export function getVapiConfig() {
  return {
    apiKey:        process.env.VAPI_API_KEY ?? null,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID ?? null,
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET ?? null,
    apiBase:       'https://api.vapi.ai',
    requestTimeoutMs: 15_000,
  };
}

export type VapiConfig = ReturnType<typeof getVapiConfig>;

// Vapi REST API paths
export const VAPI_PATHS = {
  calls:    '/call',
  call:     (callId: string) => `/call/${callId}`,
  assistants: '/assistant',
} as const;
