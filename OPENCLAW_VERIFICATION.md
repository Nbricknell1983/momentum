# OpenClaw Connection Verification Contract

_Completed: OpenClaw Connection Verification Hardening build brief._

---

## Problem replaced

The previous `test-connection` route did:
```
fetch(baseUrl, { method: 'GET', timeout: 5s }) → { connected: true }
```
A random HTTP server returning `200 OK` with HTML would pass. Auth, identity, and capability were never verified.

---

## New verification model

Connection status now means: **this is a real, authenticated, usable OpenClaw instance** — not just "some URL answered."

### Status enum

| Status | Meaning |
|---|---|
| `unreachable` | URL does not respond within timeout, or connection is refused |
| `not_openclaw` | URL responds but returns HTML/non-JSON — not an OpenClaw instance |
| `auth_failed` | OpenClaw detected but API key is rejected (401/403) or not configured |
| `missing_required_endpoints` | Authenticated but required endpoints are missing or not returning JSON |
| `healthy` | Reachable, identity confirmed, auth valid, all required endpoints available |

### Response shape

```typescript
interface ConnectionVerification {
  status: VerificationStatus;
  reachable: boolean;
  authValid: boolean | null;     // null if auth was never attempted
  requiredEndpoints: { path: string; available: boolean }[];
  detectedVersion: string | null;
  message: string;               // human-readable explanation
  httpStatus?: number;
  testedUrl: string;             // exact URL that was tested
  envWarning: string | null;     // set if localhost/dev URL detected
}
```

---

## Staged verification flow

```
Stage 1 — Reachability + Identity
  GET {baseUrl}/api/v1/skills (unauthenticated, 6s timeout)
  ├── timeout / connection refused  → unreachable
  └── responds
       └── Content-Type not JSON AND body not parseable as JSON
           → not_openclaw
           (a generic web server returns HTML here)

Stage 2 — Auth
  GET {baseUrl}/api/v1/skills (with Authorization: Bearer {key} + x-api-key: {key})
  ├── 401 or 403     → auth_failed
  └── authenticated response continues

Stage 3 — Capability
  For each required endpoint [/api/v1/skills, /api/v1/agents]:
    GET {endpoint} (authenticated, 6s timeout)
    Check: ok status + JSON content-type
  └── any endpoint unavailable → missing_required_endpoints

Stage 4 — Healthy
  All checks pass → healthy
  Detects version field from response body if present.
```

---

## Auth contract

OpenClaw expects both headers:
```
Authorization: Bearer {OPENCLAW_API_KEY}
x-api-key: {OPENCLAW_API_KEY}
```
Both are sent on every authenticated call (matching the provision route's existing contract).

The `OPENCLAW_API_KEY` environment secret is read server-side and never exposed to the frontend.

---

## Required endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/skills` | Skills manifest — used for identity + auth verification |
| `GET /api/v1/agents` | Agents manifest — capability check |

These are the endpoints used by the provisioning flow. Additional endpoints (cron jobs, etc.) are not currently part of the mandatory capability check, but can be added to `REQUIRED_ENDPOINTS` in the route with no other changes.

---

## Environment safety signals

The backend detects dev-like/local URLs and adds an `envWarning` to the response:

Patterns flagged:
- `localhost`, `127.0.0.1`, `::1`
- RFC1918 ranges: `192.168.*`, `10.*`, `172.16-31.*`
- `.local` hostnames
- `ngrok` tunnels
- `.replit.dev`, `.repl.co` preview domains

The warning is shown inline in the verification result panel and does **not** block a healthy status — it's informational.

---

## Provisioning gate

The "Provision OpenClaw" button is now disabled unless:
1. A base URL is saved to the org config (`savedBaseUrl` populated)
2. The last connection test returned `status: 'healthy'`

If the URL input changes after a successful test, the verification result is cleared automatically — preventing stale healthy results from a different URL enabling provisioning.

---

## Frontend status display

The Connection Status card shows:
- A verification tile with the status label coloured by severity (red/amber/green)
- An expanded result panel below the URL input, showing:
  - Exact URL tested (font-mono)
  - Human-readable message explaining the failure
  - Per-endpoint availability checklist
  - Auth validity indicator
  - Detected version (if present)
  - Environment warning (if applicable)

The panel is colour-coded:
- `healthy` → green border/background
- `auth_failed`, `missing_required_endpoints` → amber border/background
- `unreachable`, `not_openclaw` → red border/background

---

## Backward compatibility

The route interface has changed: the old `{ connected: boolean }` response is replaced by the structured `ConnectionVerification` object. The frontend has been fully updated — no legacy boolean checks remain in `openclaw-setup.tsx`.

---

## Follow-up recommendations

1. **Version gate** — if `detectedVersion` is present, validate it's within a supported semver range; return `incompatible_api` if too old.
2. **Cron capability check** — add `GET /api/v1/crons` or equivalent to `REQUIRED_ENDPOINTS` once the cron provisioning flow is implemented.
3. **Re-test on provision** — run a verification check at the start of the provision flow as an additional guard (currently provision trusts `savedBaseUrl` without re-verifying).
4. **Connection health badge in Bullpen** — surface the last verification status from Firestore `openclawConfig.lastVerification` so managers can see health without navigating to the setup page.
