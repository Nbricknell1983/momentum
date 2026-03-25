// =============================================================================
// AI SYSTEMS INTEGRATION — CONFIGURATION LAYER
// =============================================================================
// All AI Systems connection settings flow from here.
// Import this object anywhere in the integration layer.
// Never read process.env directly outside this file.
// =============================================================================

export const INTEGRATION_SCHEMA_VERSION = '1.0' as const;

// ---------------------------------------------------------------------------
// Runtime config object — resolved once at startup
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `[integration] Missing required environment variable: ${name}. ` +
      `Add it to Replit Secrets before using the AI Systems integration.`
    );
  }
  return val;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

// ---------------------------------------------------------------------------
// isIntegrationConfigured — safe guard used before any call
// ---------------------------------------------------------------------------
// Returns true only when BOTH required env vars are present.
// Use this to gate UI availability and route actions before touching config.

export function isIntegrationConfigured(): boolean {
  return !!(process.env.AI_SYSTEMS_BASE_URL && process.env.AI_SYSTEMS_API_KEY);
}

// ---------------------------------------------------------------------------
// getIntegrationConfig — throws if called without required env vars
// ---------------------------------------------------------------------------
// Do NOT call at module load time. Call inside request handlers after
// checking isIntegrationConfigured().

export function getIntegrationConfig() {
  return {
    // Base URL of the AI Systems backend — no trailing slash
    baseUrl: requireEnv('AI_SYSTEMS_BASE_URL').replace(/\/$/, ''),

    // Shared secret for server-to-server auth
    apiKey: requireEnv('AI_SYSTEMS_API_KEY'),

    // Optional: secret for validating incoming webhooks from AI Systems
    webhookSecret: process.env.AI_SYSTEMS_WEBHOOK_SECRET ?? null,

    // Timeout for each outbound request (ms)
    requestTimeoutMs: parseInt(optionalEnv('AI_SYSTEMS_TIMEOUT_MS', '15000'), 10),

    // Maximum provisioning attempts before marking as failed
    maxRetries: parseInt(optionalEnv('AI_SYSTEMS_MAX_RETRIES', '3'), 10),

    // Retry delay schedule (ms) — indexed by attempt number (0-based)
    retryDelays: [5_000, 30_000, 300_000],   // 5s → 30s → 5min

    // Schema version sent in every payload
    schemaVersion: INTEGRATION_SCHEMA_VERSION,

    // Source system identifier (always 'momentum' from this side)
    sourceSystem: 'momentum' as const,
  } as const;
}

export type IntegrationConfig = ReturnType<typeof getIntegrationConfig>;

// ---------------------------------------------------------------------------
// Endpoint paths — centralised so changes require a single edit
// ---------------------------------------------------------------------------

export const INTEGRATION_PATHS = {
  createTenant:   '/api/integration/tenants',
  tenantStatus:   (tenantId: string) => `/api/integration/tenants/${tenantId}/status`,
  updateTenant:   (tenantId: string) => `/api/integration/tenants/${tenantId}`,
  triggerWorkflow: (tenantId: string) => `/api/integration/tenants/${tenantId}/workflows`,
  activateAgents:  (tenantId: string) => `/api/integration/tenants/${tenantId}/agents`,
} as const;

// ---------------------------------------------------------------------------
// Required environment variables — listed for setup documentation
// ---------------------------------------------------------------------------

export const REQUIRED_ENV_VARS = [
  {
    name: 'AI_SYSTEMS_BASE_URL',
    description: 'Base URL of the AI Systems backend (e.g. https://ai-systems.example.com)',
    required: true,
  },
  {
    name: 'AI_SYSTEMS_API_KEY',
    description: 'Shared secret for server-to-server authentication with AI Systems',
    required: true,
  },
] as const;

export const OPTIONAL_ENV_VARS = [
  {
    name: 'AI_SYSTEMS_WEBHOOK_SECRET',
    description: 'HMAC-SHA256 secret for validating incoming webhooks from AI Systems',
    required: false,
    default: null,
  },
  {
    name: 'AI_SYSTEMS_TIMEOUT_MS',
    description: 'Request timeout in milliseconds (default: 15000)',
    required: false,
    default: '15000',
  },
  {
    name: 'AI_SYSTEMS_MAX_RETRIES',
    description: 'Maximum provisioning retry attempts (default: 3)',
    required: false,
    default: '3',
  },
] as const;
