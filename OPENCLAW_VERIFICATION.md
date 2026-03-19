# OpenClaw Connection Verification Contract

_Updated: OpenClaw Contract Mismatch Fix — gateway-compatible verification._

---

## Architecture clarification

OpenClaw at port 18789 is a **gateway/dashboard** service — not a REST skill management API.

The actual integration contract is:
- **OpenClaw → Momentum**: OpenClaw calls Momentum's `/api/ai/*` endpoints (defined in `aiActionRoutes.ts`)
- **Momentum → OpenClaw**: Momentum can verify reachability and auth, but OpenClaw does **not** expose `/api/v1/skills` or `/api/v1/agents` as REST management endpoints on the gateway port

Skills/agents are configured in OpenClaw **via the dashboard UI** (copy skill URLs from the manifest). The previous verification assumed a REST management API surface that does not exist on the gateway port.

---

## Verification model

Connection status means: **this is a reachable, authenticated OpenClaw gateway instance** — not just "some URL answered."

### Status enum

| Status | Meaning |
|---|---|
| `unreachable` | All probe candidates timed out or refused connection |
| `not_openclaw` | URL responds with pure HTML on all non-API paths — likely a web server, not an API gateway |
| `auth_failed` | Gateway detected but API key is rejected (401/403) or not configured |
| `healthy` | Reachable, auth accepted — gateway is operational. Skill registration endpoint availability is informational only. |

> **Removed**: `missing_required_endpoints` — this status no longer exists. A gateway that returns 404 on `/api/v1/skills` is still `healthy` as long as it is reachable and auth is not rejected.

### Response shape

```typescript
interface ConnectionVerification {
  status: VerificationStatus;
  reachable: boolean;
  authValid: boolean | null;     // null if auth was never attempted
  requiredEndpoints: { path: string; available: boolean }[];  // informational — does not block healthy
  detectedVersion: string | null;
  message: string;               // human-readable explanation
  httpStatus?: number;
  probePath?: string;            // which candidate path responded (e.g. '/health', '/api/v1/health')
  testedUrl: string;             // exact URL tested
  envWarning: string | null;     // set if localhost/dev URL detected
}
```

---

## Staged verification flow

```
Stage 1 — Reachability (adaptive probe)
  Try each candidate in order (6s timeout each):
    /api/v1/health → /health → /api/health → /api/v1/status → /status
    → /api/v1/ping → /ping → /api/v1/skills → /
  ├── all timeout / connection refused  → unreachable
  └── first HTTP response → continues with that path (successfulProbePath)

Stage 2 — Identity
  Examine response from successfulProbePath:
  ├── JSON response OR 401/403 (auth challenge) → OpenClaw gateway confirmed
  └── Pure HTML on '/' (last fallback) → not_openclaw

Stage 3 — Auth
  GET {successfulProbePath} with:
    Authorization: Bearer {OPENCLAW_API_KEY}
    x-api-key: {OPENCLAW_API_KEY}
  ├── 401 or 403     → auth_failed
  └── any other status → auth accepted, continues

Stage 4 — Informational endpoint probe (non-blocking)
  GET /api/v1/skills (authenticated) — informational
  GET /api/v1/agents (authenticated) — informational
  404 = expected for gateway-style OpenClaw — does NOT block healthy

Stage 5 — Healthy
  Reachable + auth not rejected → healthy
  Message clarifies whether skill endpoints are available (REST-API mode)
  or need manual dashboard configuration (gateway mode).
```

---

## Auth contract

OpenClaw expects both headers:
```
Authorization: Bearer {OPENCLAW_API_KEY}
x-api-key: {OPENCLAW_API_KEY}
```
Both are sent on every authenticated call.

The `OPENCLAW_API_KEY` environment secret is read server-side and never exposed to the frontend.

---

## Informational endpoints (non-blocking)

| Endpoint | Expected in REST-API mode | Expected in gateway mode |
|---|---|---|
| `GET /api/v1/skills` | 200 JSON | 404 (normal) |
| `GET /api/v1/agents` | 200 JSON | 404 (normal) |

When 404, the verification message instructs the user to configure skill URLs manually via the OpenClaw dashboard. The `requiredEndpoints` array in the response reflects the probe results but does not affect the `healthy` status.

---

## Provisioning

The provision endpoint (`POST /api/openclaw/provision`) attempts to auto-register skills and agents via `POST /api/v1/skills` and `POST /api/v1/agents`.

### Status values per item

| Status | Meaning |
|---|---|
| `created` | Successfully registered via REST API |
| `exists` | Already registered (HTTP 409 / `already_exists` flag) |
| `not_supported` | HTTP 404 or 405 — endpoint not exposed by this gateway version. Configure this skill URL manually in the OpenClaw dashboard. |
| `failed` | Unexpected error (network, 5xx, etc.) |

`not_supported` is **amber** in the UI (not red) — it is expected behaviour for gateway-style OpenClaw and requires manual dashboard configuration, not debugging.

The provision summary counts `created`, `exists`, `notSupported`, and `failed` separately.

---

## Provisioning gate

The "Provision OpenClaw" button is disabled unless:
1. A base URL is saved to the org config (`savedBaseUrl` populated)
2. The last connection test returned `status: 'healthy'`

If the URL input changes after a successful test, the verification result is cleared automatically.

---

## Environment safety signals

The backend detects dev-like/local URLs and adds an `envWarning` to the response:

Patterns flagged:
- `localhost`, `127.0.0.1`, `::1`
- RFC1918 ranges: `192.168.*`, `10.*`, `172.16-31.*`
- `.local` hostnames
- `ngrok` tunnels
- `.replit.dev`, `.repl.co` preview domains

The warning is shown inline and does **not** block a healthy status.

---

## Frontend status display

The Connection Status card shows:
- A verification tile coloured by severity (red/amber/green)
- An expanded result panel below the URL input showing:
  - Exact URL tested (font-mono) + probe path that responded
  - Human-readable message explaining the result
  - Per-endpoint availability checklist (informational)
  - Auth validity indicator
  - Detected version (if present)
  - Environment warning (if applicable)

Colour coding:
- `healthy` → green border/background
- `auth_failed` → amber border/background
- `unreachable`, `not_openclaw` → red border/background

---

## Skill URL reference for manual dashboard configuration

All skill endpoints are documented in the manifest at `GET /api/openclaw/manifest`. The OpenClaw Setup page copies each URL with one click. The base URL for all skill endpoints is:

```
APP_BASE_URL (production: https://momentum.battlescore.com.au)
```
