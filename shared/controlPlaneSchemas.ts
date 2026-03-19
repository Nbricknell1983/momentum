/**
 * Control-Plane Configuration Schemas
 *
 * These are the authoritative Zod schemas for Bullpen and OpenClaw control-plane
 * settings. Both client and server import from here to ensure a single source of
 * truth for shape, validation rules, and defaults.
 *
 * Unknown-key strategy: .strip() (Zod default) — unknown fields are removed
 * before storage. They do not silently persist or influence runtime behavior.
 * Stripped keys are logged in the audit entry.
 */

import { z } from 'zod';

// ─── AutomationRules ─────────────────────────────────────────────────────────
// Controls Bullpen work-hours enforcement and approval gates.

export const AutomationRulesSchema = z.object({
  workHoursStart:           z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').default('08:00'),
  workHoursEnd:             z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').default('17:30'),
  timezone:                 z.string().min(1).max(100).default('Australia/Brisbane'),
  blockSmsOutsideHours:     z.boolean().default(true),
  blockEmailOutsideHours:   z.boolean().default(false),
  blockCallsOutsideHours:   z.boolean().default(true),
  requireApprovalCampaigns: z.boolean().default(true),
  requireApprovalHighRisk:  z.boolean().default(true),
  requireApprovalPublish:   z.boolean().default(true),
  requireApprovalProduction:z.boolean().default(true),
});

export type AutomationRules = z.infer<typeof AutomationRulesSchema>;

export const AUTOMATION_RULES_DEFAULTS: AutomationRules = AutomationRulesSchema.parse({});

// ─── OpenclawConfig ──────────────────────────────────────────────────────────
// Controls the OpenClaw provisioning target. A wrong value here misdirects
// all skill/agent registration. Validate strictly.

export const OpenclawConfigSchema = z.object({
  baseUrl: z
    .string()
    .min(1, 'baseUrl is required')
    .url('baseUrl must be a valid URL')
    .refine(
      (u) => u.startsWith('https://') || u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1'),
      { message: 'baseUrl must be HTTPS (or localhost/127.0.0.1 for local dev)' },
    ),
});

export type OpenclawConfig = z.infer<typeof OpenclawConfigSchema>;

// ─── Audit entry shape ────────────────────────────────────────────────────────
// Written to: orgs/{orgId}/settingsHistory/{settingType}/entries/{id}

export interface SettingsAuditEntry {
  changedAt: string;             // ISO 8601
  changedByUid: string;
  changedByEmail: string | null;
  settingType: 'automationRules' | 'openclawConfig';
  orgId: string;
  previousValue: unknown;        // null if doc did not exist before
  newValue: unknown;             // the validated, normalised value stored
  strippedKeys: string[];        // unknown keys that were dropped before storage
  source: string;                // e.g. 'bullpen-ui', 'openclaw-setup', 'server-api'
}

// ─── Validated read result ────────────────────────────────────────────────────
// What the server returns on read, so the client knows how to handle the state.

export type ConfigStatus = 'valid' | 'invalid' | 'missing';

export interface AutomationRulesReadResult {
  status: ConfigStatus;
  data: AutomationRules;          // always present (defaults if missing/invalid)
  validationErrors?: string[];    // present when status === 'invalid'
}

export interface OpenclawConfigReadResult {
  status: ConfigStatus;
  data: Partial<OpenclawConfig>;  // only present when status === 'valid'
  validationErrors?: string[];    // present when status === 'invalid'
}
