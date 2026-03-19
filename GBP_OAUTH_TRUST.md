# GBP OAuth Trust & Recovery Contract

_Completed: GBP OAuth Trust & Recovery Hardening build brief._

---

## What was hardened

The previous GBP OAuth integration was functional but stored only tokens — no account identity, no health status, and no managed failure state. Token refresh failures threw generic errors that surfaced as opaque downstream errors.

---

## New stored fields

The GBP settings doc at `orgs/{orgId}/settings/gbp` now stores:

| Field | Type | Description |
|---|---|---|
| `refreshToken` | string | Long-lived refresh token (unchanged) |
| `accessToken` | string | Short-lived access token (unchanged) |
| `tokenExpiry` | number | Epoch ms when access token expires (unchanged) |
| `connectedAt` | ISO string | When the connection was first established (unchanged) |
| `redirectUri` | string | OAuth redirect URI used (unchanged) |
| `connectionStatus` | string | `healthy` / `reconnect_required` / `revoked` / `unknown` |
| `lastVerifiedAt` | ISO string | When the connection was last confirmed working |
| `lastFailureAt` | ISO string | When the last refresh failure occurred |
| `lastFailureReason` | string | Error description from Google OAuth |
| `connectedAccountEmail` | string\|null | Google account email of the user who connected |
| `connectedAccountName` | string\|null | Display name of the connected user |
| `connectedGBPAccount` | string\|null | GBP account resource name (e.g. `accounts/123456789`) |
| `connectedGBPAccountTitle` | string\|null | GBP account's `accountName` field |

---

## Connection status lifecycle

```
OAuth flow completes
└── tokens stored
└── userinfo + GBP accounts fetched
└── connectionStatus: 'healthy'
└── lastVerifiedAt: now

Token refresh succeeds
└── connectionStatus: 'healthy'
└── lastVerifiedAt: now

Token refresh fails (invalid_grant)
└── connectionStatus: 'revoked'     ← permanent, must reconnect
└── lastFailureAt: now
└── lastFailureReason: "<Google error>"

Token refresh fails (other error)
└── connectionStatus: 'reconnect_required'
└── lastFailureAt: now
└── lastFailureReason: "<Google error>"

Network error during refresh
└── connectionStatus unchanged      ← network failure ≠ token failure
└── Error thrown to caller

GBP not connected at all
└── connectionStatus: 'not_connected'
```

### Status enum

| Status | Meaning | Action required |
|---|---|---|
| `healthy` | Token is valid, recently verified | None |
| `reconnect_required` | Refresh failed for unknown reason | Reconnect |
| `revoked` | `invalid_grant` — Google revoked access | Reconnect |
| `unknown` | Connected but never had a status (legacy records) | Reconnect recommended |
| `not_connected` | No GBP link at all | Connect |

---

## Post-connect identity verification

After the OAuth callback successfully exchanges the code for tokens, the backend immediately:

1. Calls `GET https://www.googleapis.com/oauth2/v3/userinfo` (using `openid email profile` scopes now included in the OAuth request) → stores `connectedAccountEmail` and `connectedAccountName`
2. Calls `GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts` → stores the first account's `name` (resource) and `accountName`

Both calls are **non-blocking** — if they fail (e.g. API quota, network error), the connection is still saved but identity fields are `null`. The UI shows a "reconnect to populate identity" message in that case.

---

## Scope change

`GBP_SCOPES` was updated from:
```
https://www.googleapis.com/auth/business.manage
```
to:
```
openid email profile https://www.googleapis.com/auth/business.manage
```

This adds `openid email profile` to the OAuth consent flow so the userinfo endpoint can return the connected Google account's email and name. The additional scopes are minimal and standard — they don't add friction to the consent screen beyond what users expect.

**Impact on existing connections:** Existing connections retain their tokens and continue working. They will have `null` for `connectedAccountEmail` and `connectedAccountName` until they reconnect through the new flow. The UI indicates this with "Account identity not available — reconnect to populate this information."

---

## Settings UI changes

### Connection status badge (top-right of GBP card)

| Status | Badge | Colour |
|---|---|---|
| `healthy` | Connected · Healthy | Green |
| `revoked` | Token Revoked | Red |
| `reconnect_required` / `unknown` | Reconnect Required | Amber |
| not connected | Not connected | Muted |

### Connected state panel

1. **Reconnect required banner** (red) — shown when `connectionStatus` is `reconnect_required` or `revoked`. Includes the `lastFailureReason` from Google if available.
2. **Org-scope warning** (amber) — always visible when connected: "This is an org-level connection — all clients share the same Google account."
3. **Connected Account identity panel** — shows `connectedAccountName`, `connectedAccountEmail`, `connectedGBPAccountTitle`, `connectedAt`, `lastVerifiedAt`. Falls back to "Account identity not available" if fields are null.
4. **Healthy info** — "Live reviews available in Local Presence…" shown only when status is `healthy`.
5. **Action buttons** — "Reconnect Google Account" shown alongside Disconnect when status is not healthy.

### `data-testid` attributes added

- `banner-gbp-reconnect` — reconnect required error banner
- `banner-gbp-org-scope` — org-level scope warning
- `panel-gbp-identity` — connected account identity panel
- `button-reconnect-gbp` — reconnect button

---

## Error prefix convention

`getGBPAccessToken` now prefixes its error messages with a structured code:

| Prefix | Meaning |
|---|---|
| `GBP_AUTH_UNAVAILABLE:` | Firestore not available |
| `GBP_NOT_CONNECTED:` | No GBP connection stored |
| `GBP_REFRESH_ERROR:` | Network error during token refresh |
| `GBP_REVOKED:` | `invalid_grant` from Google |
| `GBP_RECONNECT_REQUIRED:` | Other refresh error |

Callers can inspect the message prefix to determine if the error is a config/connection problem (`GBP_NOT_CONNECTED`) vs. an auth problem (`GBP_REVOKED`) vs. a transient network issue (`GBP_REFRESH_ERROR`).

---

## Limitations that remain (org-scoped model)

1. **One connection per org** — all clients share the same Google account. If different clients use different Google accounts (multi-agency scenario), this is not supported.
2. **Wrong-account visibility is UX-based** — the system shows which account is connected prominently, but cannot prevent a user from deliberately connecting the wrong account.
3. **Status is pull-based** — the UI reads status from Firestore. If a token silently expires between refreshes, the status won't update until the next API call that triggers `getGBPAccessToken`.

---

## Follow-up recommendations

1. **Per-client GBP connection** — the current org-level model is the structural limitation most likely to cause wrong-account confusion for agencies managing multiple brands. Per-client OAuth connections would eliminate shared-account risk but require a significant architecture change (out of scope for this task).
2. **Active health check endpoint** — `GET /api/gbp/verify` that triggers a real API call (not just a token cache check) and updates `connectionStatus` + `lastVerifiedAt`. Could be triggered from the settings page UI as a manual "Check connection" action.
3. **Reconnect-required propagation** — when `connectionStatus` changes to `reconnect_required` or `revoked`, downstream GBP panels (Local Presence, GBP Engine, etc.) should surface a specific "GBP disconnected" message rather than a generic error. The error prefix convention above enables this — callers can check `err.message.startsWith('GBP_REVOKED:')` to show a targeted reconnect CTA.
