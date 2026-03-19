# Trust Boundary — Momentum Agent

> Last updated: 2026-03-19  
> Owner: Engineering

This document defines what the server trusts, what it verifies independently, and what attack surface exists.

---

## Identity Verification

| Layer | Mechanism | Trusted by server? |
|---|---|---|
| Firebase ID token | RSA-verified JWT via Firebase Admin SDK | ✅ Yes — verified in `verifyFirebaseToken` middleware |
| Session cookie | `credentials: include` (legacy, no session) | ❌ No — no server-side session |
| `uid` in request body | Client-supplied string | ❌ Never trusted as identity |
| `orgId` in request body | Client-supplied string | ⚠️ Used as lookup key only — membership always re-checked |

**Rule**: The server derives identity solely from the Firebase ID token in `Authorization: Bearer <token>`.

---

## Request Flow

```
Browser
  └─> apiRequest() (queryClient.ts)
        ├─> Attaches: Authorization: Bearer <Firebase ID token>
        └─> POST /api/clients/ai/seo-blog { orgId: "org_xyz", clientId: "abc" }

Express
  └─> verifyFirebaseToken (global middleware, server/index.ts)
        ├─> Rejects if no Bearer token → 401
        ├─> Rejects if token invalid/expired → 401
        └─> Attaches req.firebaseUser = { uid, email }
              └─> Route handler
                    └─> [optional] requireOrgAccess
                          ├─> Reads orgId from body/query/params
                          ├─> Checks Firestore: orgs/{orgId}/members/{uid}.active == true
                          ├─> Rejects if not a member → 403
                          └─> Attaches req.orgRole, req.trustedOrgId
                                └─> [optional] requireManager
                                      └─> Rejects if role not owner/admin → 403
```

---

## Route Classification

### Public (no Firebase token required)
These routes are whitelisted in `server/middleware/auth.ts`:

| Route | Reason |
|---|---|
| `GET /api/gbp/callback` | OAuth redirect — no user session available |
| `GET /api/gbp/credentials-check` | Read-only env var check |
| `GET /api/strategy-reports/by-slug/:slug` | Public report URLs |
| `GET /api/reports/:reportId` | Public report |
| `GET /api/strategy-reports/check-slug` | Public slug lookup |
| `POST /api/integrations/events` | Webhook from client device (pairing-code auth) |
| `POST /api/integrations/pair` | Device pairing (pre-auth flow) |

### OpenClaw action routes (own auth)
These routes use `openclawAuth` (shared `OPENCLAW_API_KEY` secret):

- `POST /api/ai/suspects-needing-followup`
- `POST /api/ai/next-best-action`
- `POST /api/ai/draft-followup`
- `POST /api/ai/create-task`
- `POST /api/ai/log-call-outcome`
- `POST /api/ai/move-lead-stage`
- `POST /api/ai/request-appointment-slot`
- `POST /api/ai/send-approved-sms`
- `POST /api/ai/send-approved-email`

### Protected (Firebase token required, all routes)
All `/api/` routes not listed above require a valid Firebase ID token.

### Manager-only (Firebase token + Firestore membership + owner/admin role)
These routes use `verifyAdminAccessForTeam` (or `requireOrgAccess + requireManager`):

- `POST /api/admin/create-team-member`
- `POST /api/admin/reset-password`
- `POST /api/admin/send-password-reset`

---

## Data Layer Boundary

| Database | Used for | Status |
|---|---|---|
| **Firebase Firestore** | All live application data | ✅ Active — primary source of truth |
| **PostgreSQL** | `users`, `leads`, `activities` tables (original schema) | ❌ Orphaned — routes return 410 Gone |

Legacy PostgreSQL routes (`/api/leads`, `/api/activities`) were hard-disabled and return `410 Gone` to prevent accidental use of stale data.

---

## Tenant Isolation Model

Multi-tenancy is enforced at the **Firestore security rules** layer (client-side) and optionally at the **Express middleware** layer (server-side) for sensitive operations.

Org membership path: `orgs/{orgId}/members/{uid}` — must have `active == true`.

Manager role: `role` in `['owner', 'admin']`.

---

## Known Gaps (to address in future sprints)

1. **Per-route org access check**: Most AI endpoints accept `orgId` from the request body but don't independently verify membership — they rely on the requester having a valid token. A user with a valid token for org A could theoretically call with org B's ID and trigger AI generation billed to org A. Mitigation: apply `requireOrgAccess` middleware to all Firestore-writing routes.

2. **`/api/auth/resolve-org`**: Accepts a `uid` in body (not from token). This should derive uid from `req.firebaseUser.uid` instead.

3. **Rate limiting**: No per-IP or per-org rate limiting on AI endpoints. High-cost OpenAI calls are unbounded.
