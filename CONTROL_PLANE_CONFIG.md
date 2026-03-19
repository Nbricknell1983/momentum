# Control-Plane Configuration Contract

> Last updated: 2026-03-19  
> Owner: Engineering

This document defines the two control-plane settings documents, their schemas, validation rules, audit trail location, fallback behavior, and mutation access.

---

## What counts as control-plane config

Control-plane config is any setting that:
- shapes **automation behavior** (work hours, comms blocks, approval gates)
- **routes provisioning traffic** to external systems (OpenClaw base URL)
- has **no safe default-on-corruption** — a bad value silently breaks safety controls

These are not ordinary user preferences. A malformed value can silently disable an approval gate, misdirect OpenClaw provisioning to a wrong environment, or suppress block controls.

---

## Config documents

### 1. `orgs/{orgId}/settings/automationRules`

**Purpose**: Bullpen work-hours enforcement and approval gates.

**Schema** (`shared/controlPlaneSchemas.ts` — `AutomationRulesSchema`):

| Field | Type | Default | Notes |
|---|---|---|---|
| `workHoursStart` | `string` (HH:MM) | `08:00` | 24h format |
| `workHoursEnd` | `string` (HH:MM) | `17:30` | 24h format |
| `timezone` | `string` | `Australia/Brisbane` | IANA tz |
| `blockSmsOutsideHours` | `boolean` | `true` | |
| `blockEmailOutsideHours` | `boolean` | `false` | |
| `blockCallsOutsideHours` | `boolean` | `true` | |
| `requireApprovalCampaigns` | `boolean` | `true` | |
| `requireApprovalHighRisk` | `boolean` | `true` | |
| `requireApprovalPublish` | `boolean` | `true` | |
| `requireApprovalProduction` | `boolean` | `true` | |

**Unknown-key strategy**: Strip — unknown fields are removed before storage and recorded in the audit entry's `strippedKeys` array.

**`updatedAt`** is added by the server at write time. It is not part of the validated schema but is stored alongside it.

---

### 2. `orgs/{orgId}/settings/openclawConfig`

**Purpose**: Controls which OpenClaw instance receives provisioning calls (skills, agents, crons).

**Schema** (`shared/controlPlaneSchemas.ts` — `OpenclawConfigSchema`):

| Field | Type | Notes |
|---|---|---|
| `baseUrl` | `string` (URL) | Must be HTTPS, or http://localhost/127.0.0.1 for local dev |

**Unknown-key strategy**: Strip — only `baseUrl` is stored.

**`updatedAt`** and `lastSyncAt`/`lastSyncReport` (from the provision endpoint) are stored alongside the validated fields.

---

## Write path

**Both documents are written exclusively through server API routes.**  
Direct client-side Firestore `setDoc` calls for these documents have been removed.

| Document | Write endpoint |
|---|---|
| `automationRules` | `POST /api/settings/automation-rules` |
| `openclawConfig` | `POST /api/openclaw/config` |

**Write flow:**
1. Firebase token verified (global middleware)
2. Org membership verified (`requireOrgAccess`)
3. Manager role required (`requireManager` — `owner` or `admin` only)
4. Payload validated with Zod (unknown keys stripped, wrong types rejected with `400`)
5. Previous value read from Firestore (for audit)
6. Validated document written with `{ merge: false }` — full replace, no merge
7. Audit entry written to `settingsHistory` (non-blocking)

**If validation fails**: `400` with `{ error: 'Validation failed', validationErrors: [...] }`. Nothing is written to Firestore.

---

## Read path

**Both documents are read through validated server API routes.**  
The read response always includes a `status` field so the client knows how to handle the data.

| Document | Read endpoint |
|---|---|
| `automationRules` | `GET /api/settings/automation-rules?orgId=<id>` |
| `openclawConfig` | `GET /api/openclaw/config?orgId=<id>` |

**Response shape:**
```json
{
  "status": "valid | invalid | missing",
  "data": { ... },
  "validationErrors": ["field.path: error message"]  // only when invalid
}
```

**Fallback behavior:**

| Status | `automationRules` behavior | `openclawConfig` behavior |
|---|---|---|
| `valid` | Load and use stored values | Load and use stored baseUrl |
| `missing` | Show "no rules saved" notice; use defaults | Show "not configured" state |
| `invalid` | Show warning banner; use defaults safely | Show "config invalid" banner; block provisioning |

Unknown keys in stored documents are stripped on read (Zod default strip). This means legacy docs with extra fields load without error; stripped keys are never surfaced as valid config.

---

## Audit trail

**Location:** `orgs/{orgId}/settingsHistory/{settingType}/entries/{autoId}`

- `settingType` is one of: `automationRules`, `openclawConfig`
- Written by server (Firebase Admin SDK — bypasses Firestore rules)
- **Immutable** — Firestore rules deny all client-side writes/updates/deletes

**Each entry contains:**

```typescript
{
  changedAt: string;             // ISO 8601
  changedByUid: string;          // Firebase UID of the actor
  changedByEmail: string | null; // from decoded token
  settingType: string;           // 'automationRules' | 'openclawConfig'
  orgId: string;
  previousValue: unknown;        // null if doc didn't exist before
  newValue: unknown;             // the validated, normalised object stored
  strippedKeys: string[];        // unknown keys that were dropped
  source: string;                // 'server-api', etc.
}
```

**Querying audit history** (manager-only):
```typescript
// Firestore path
orgs/{orgId}/settingsHistory/automationRules/entries  // ← orderBy changedAt desc
orgs/{orgId}/settingsHistory/openclawConfig/entries
```

---

## Permissions

| Action | Role required |
|---|---|
| Read automation rules | org member |
| Write automation rules | org owner or admin |
| Read OpenClaw config | org member |
| Write OpenClaw config | org owner or admin |
| Read audit history | org owner or admin |
| Write/delete audit entries | Nobody (server Admin SDK only) |

---

## Rollback procedure

To roll back a settings change:
1. Find the previous value in `settingsHistory/{settingType}/entries` ordered by `changedAt desc`
2. Re-submit the previous value via the write endpoint
3. A new audit entry is created recording the rollback

There is no automated rollback — this is intentional. Rollbacks must be conscious decisions by a manager.

---

## Known follow-up items

1. **In-app audit history viewer**: No UI yet to browse `settingsHistory`. A manager could view it via Firebase Console.
2. **`requireOrgAccess` on all AI routes**: Per-route org membership check is not yet applied to every Firestore-touching AI endpoint — see `TRUST_BOUNDARY.md`.
3. **GBP OAuth hardening**: Out of scope for this brief — tracked separately.
