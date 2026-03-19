# CHANGE CHECKLIST
### Momentum / Bullpen — Pre-Implementation, Pre-Merge, and Post-Release Verification

**Version:** 1.0  
**Use this file for:** Any change to the codebase, AI prompts, Firestore schema, routing, auth, or product configuration  
**Principle:** A change is not done until it has been verified end-to-end

---

## How to Use This Checklist

Work through the relevant sections before starting implementation, before merging, and after deploying. Not every section applies to every change — use judgement to identify which sections are relevant, but err toward thoroughness on changes that touch auth, multi-tenant data, shared utilities, or AI output.

Mark items:
- `[x]` — confirmed clear
- `[-]` — not applicable to this change
- `[!]` — flagged risk — document the risk and how it is being managed

---

## Section 1 — Problem Clarification

Complete before writing any code.

- [ ] The problem has been stated in precise terms (not just symptoms)
- [ ] The expected outcome after the change is defined in user-observable terms
- [ ] The change has been confirmed as the correct solution to the stated problem
- [ ] Any ambiguity in the request has been resolved with the requester
- [ ] The scope of the change is agreed — what is in and what is out
- [ ] If this change is reactive to a bug: the root cause is understood, not just the symptom

**Clarification gate:** Do not proceed to implementation if any of the above are unresolved.

---

## Section 2 — Scope Control

- [ ] An existing module, function, or pattern that already handles part of this has been checked for
- [ ] This change extends existing code rather than creating a parallel implementation where possible
- [ ] No new module or component is being created to solve a problem already solved elsewhere
- [ ] The change is the smallest safe change that achieves the result
- [ ] The number of files touched has been reviewed — if more than five files, the scope has been re-evaluated
- [ ] The change does not introduce duplicate logic that will create maintenance drift

---

## Section 3 — Architecture Impact Review

- [ ] The three-layer architecture (Momentum / Bullpen / OpenClaw) is preserved
- [ ] No internal Bullpen logic or terminology is being exposed to `member`-role users
- [ ] No client-facing concept is being built into the internal Bullpen layer
- [ ] The change does not collapse the control plane / orchestration / execution runtime separation
- [ ] If adding a new product surface: the internal/external boundary has been defined explicitly

---

## Section 4 — Tenant Isolation Review

**This section is mandatory for any change touching Firestore, API routes, or auth.**

- [ ] Every new Firestore read/write is scoped under `orgs/{orgId}/`
- [ ] `orgId` is derived from `req.orgId` (set by `requireOrgAccess`) — not from client-supplied data
- [ ] No new query operates without an explicit `orgId` filter or path segment
- [ ] No cross-tenant data access is possible through any new code path
- [ ] `strategyReports` is the only collection that legitimately operates outside `orgs/{orgId}/` — any other top-level collection requires explicit justification
- [ ] If this change adds a new collection: it has been added under the correct `orgs/{orgId}/` path

---

## Section 5 — Auth / Permissions Review

- [ ] Every new `/api/` route applies the correct middleware chain
- [ ] Routes accessing org data include `requireOrgAccess`
- [ ] Routes restricted to managers include `requireManager`
- [ ] Public routes (DVS report page, marketing pages) do not apply auth middleware that would block unauthenticated access
- [ ] OpenClaw routes use `openclawAuth` (shared-secret) — not Firebase token middleware
- [ ] Scheduler routes use `INTERNAL_SCHEDULER_KEY` — not Firebase token middleware
- [ ] No route bypasses `verifyFirebaseToken` (which is applied globally at `/api/`)
- [ ] If role gates have changed: `ManagerGate` in `App.tsx` has been updated to match
- [ ] If `AuthContext` has changed: all `useAuth()` consumers have been audited
- [ ] `effectiveIsManager` is used in UI role gates (not `isManager`) when support impersonation must be respected

---

## Section 6 — Data / Schema / Firestore Review

- [ ] Any new Firestore document fields are documented with their path and type
- [ ] Existing documents that do not have new fields will be handled gracefully (fallback to `null` / empty state)
- [ ] No existing document field has been renamed without updating every consumer
- [ ] AI engine outputs that are dual-written (entity doc + `engineHistory/`) are still writing to both locations
- [ ] History records (`engineHistory/{runId}`) have not been modified to allow overwrites
- [ ] If Firestore indexes are required for new queries: they have been created or flagged for creation
- [ ] Redux `leads[]` and `clients[]` — if their shape has changed, all selectors and components consuming them have been updated
- [ ] Date fields use ISO 8601 strings for storage, DD-MM-YYYY only for display

---

## Section 7 — AI Prompt Review

**Complete this section for any change to an OpenAI prompt or response parser.**

- [ ] The model used is correct: `gpt-4o-mini` for all strategy/analysis; `gpt-4o` only for mock-website
- [ ] The global `openai` instance is used — not `new OpenAI({ apiKey: ... })`
- [ ] `max_tokens` is set explicitly — not left as default
- [ ] For DVS strategy generation: `max_tokens: 5500`
- [ ] New fields added to the prompt response schema are consumed in the UI
- [ ] Existing fields removed from the prompt response schema have been removed from all UI consumers
- [ ] The UI handles the absence of new fields gracefully for records generated before this change
- [ ] The prompt produces specific, commercially grounded output — not generic template content
- [ ] The prompt does not use `new OpenAI()` — confirmed

---

## Section 8 — Routing / Navigation / URL Review

- [ ] New routes have been registered in `App.tsx`
- [ ] Routes requiring manager access are wrapped with `ManagerGate`
- [ ] Routes requiring authentication are within the `AppLayout` component tree
- [ ] Public routes (DVS, marketing) are outside the `AppLayout` auth gate
- [ ] Navigation links in `AppSidebar.tsx` have been updated if a new page was added
- [ ] The sidebar management section visibility uses `effectiveIsManager && isManager`
- [ ] `wouter`'s `Link` and `useLocation` are used — not `window.location` or React Router
- [ ] No existing public URL has changed (breaking change for shared links)
- [ ] If a route was removed: all `Link` components and redirects pointing to it have been updated

---

## Section 9 — UI / Responsive / Component Review

- [ ] New components follow the existing shadcn/ui + Radix patterns
- [ ] All interactive elements have `data-testid` attributes for testing
- [ ] Display elements showing dynamic content have `data-testid` attributes
- [ ] Dark mode: explicit `dark:` variants are used for all visual properties not covered by theme variables
- [ ] Responsive behaviour has been checked at mobile, tablet, and desktop widths
- [ ] Loading states are shown while queries are in flight (`.isLoading` / `.isPending`)
- [ ] Error states are handled and surfaced — not silently ignored
- [ ] Forms use shadcn `useForm` + `zodResolver` — not uncontrolled inputs
- [ ] Redux state arrays are not mutated directly — `[...frozenArray].sort()` pattern applied
- [ ] `useAuth` is imported from `@/contexts/AuthContext`
- [ ] `auth` for token retrieval is imported from `@/lib/firebase`
- [ ] Dates are displayed in DD-MM-YYYY format: `format(date, 'dd/MM/yyyy')`
- [ ] `SelectItem` components have non-empty `value` props

---

## Section 10 — Widget / Embed / External Surface Review

*Complete if the change affects any embeddable widget, iframe, or externally accessible component.*

- [ ] Widget auth does not rely on the same session as the main app (widgets may be unauthenticated)
- [ ] Widget Firestore writes are tenant-scoped via a server-side route — not direct client writes
- [ ] Widgets do not expose internal data structures or Bullpen concepts
- [ ] If a widget feeds into Momentum CRM: the ingestion route is validated and scoped correctly
- [ ] External embeds do not break when the main app is unauthenticated

---

## Section 11 — CRM / Automation / Messaging / Workflow Review

*Complete if the change touches CRM logic, automation rules, Twilio, lead routing, or scheduling.*

- [ ] Automation rules are validated with Zod before being written to Firestore
- [ ] Automation rule changes are written through the validated server route with audit trail
- [ ] Twilio / SMS workflows: credentials are stored as secrets — never hardcoded
- [ ] Lead routing logic: no route sends leads to the wrong org or wrong user
- [ ] Scheduled automation: timing, scheduler key, and Firestore write path are verified
- [ ] New automation capabilities are not accessible to `member`-role users without explicit design approval
- [ ] If modifying OpenClaw config: `requireManager` gate is in place on the write route

---

## Section 12 — Marketing / Public Page Review

*Complete if the change touches public-facing marketing pages or the DVS strategy report.*

- [ ] Public marketing pages remain accessible without authentication
- [ ] DVS report pages (`/strategy/:reportId`) remain publicly accessible without authentication
- [ ] The DVS acceptance endpoint (`PATCH /api/strategy-reports/:reportId/accept`) does not require Firebase auth (uses public shared identifier)
- [ ] Public pages do not accidentally expose data from other tenants
- [ ] SEO metadata (title, description, Open Graph) is present on all public pages
- [ ] No change to `strategyReports` document schema has broken the public page renderer
- [ ] New fields added to DVS strategy output have fallbacks for older report documents

---

## Section 13 — Performance / Reliability / Operational Review

- [ ] New Firestore queries have appropriate indexes (or index creation has been planned)
- [ ] New queries are not unbounded — `.limit()` is applied where appropriate
- [ ] New schedulers use the correct key (`INTERNAL_SCHEDULER_KEY`) and timing logic
- [ ] Long-running AI calls use appropriate `max_tokens` limits and do not block the event loop
- [ ] Error handling is present for all external API calls (OpenAI, Google Places, ABR, Local Falcon)
- [ ] Failures in non-critical paths (enrichment, prep scoring) do not crash the main request
- [ ] Batch operations pace appropriately — enrichment paces at 700ms per lead minimum

---

## Section 14 — Regression Test Planning

Before merging, confirm the following have been tested:

**Core user flows:**
- [ ] Login → org resolution → role assignment → correct nav displayed
- [ ] Lead pipeline loads, stage changes persist, lead cards render correctly
- [ ] Client workspace loads, engine outputs render, activity logged correctly
- [ ] My Work page loads, items display, status updates work
- [ ] DVS public page loads without auth, acceptance form works, work items created

**Role-gated surfaces:**
- [ ] `member` user cannot access `/bullpen` or `/openclaw-setup` (redirected to `/dashboard`)
- [ ] `manager` user sees Bullpen, Management, and OpenClaw in sidebar and can access these pages
- [ ] Support impersonation: banner shows, sidebar reflects impersonated role, exit works

**AI outputs:**
- [ ] Strategy generation completes without truncation
- [ ] All expected fields are present in the generated strategy
- [ ] DVS page renders all sections from the new strategy output
- [ ] Older DVS records that lack new fields render without crashing

**Tenant isolation:**
- [ ] A request with one org's token cannot retrieve another org's data

---

## Section 15 — Release Readiness

- [ ] All checklist items relevant to this change are marked `[x]` or `[-]`
- [ ] All `[!]` flagged risks have documented mitigations
- [ ] The change has been reviewed by at least one other person (or documented self-review if solo)
- [ ] A rollback plan exists if the change causes a production issue
- [ ] No secrets or API keys are hardcoded in the change
- [ ] No `console.log` statements containing sensitive data are included
- [ ] `replit.md` has been updated to reflect architectural changes

---

## Section 16 — Post-Deployment Verification

After deploying, confirm:

- [ ] The primary user flow affected by the change works end-to-end in production
- [ ] No new errors have appeared in server logs
- [ ] No new errors have appeared in browser console
- [ ] Firestore writes are appearing in the correct collections with the correct structure
- [ ] AI outputs are appearing with the expected fields
- [ ] Public pages are accessible without authentication
- [ ] Role-gated pages are inaccessible to the wrong roles

---

## Section 17 — Lessons / Feedback Loop

After completing and verifying a significant change:

- [ ] If unexpected issues were encountered: the root cause has been documented
- [ ] If the change required more files than expected: the scope estimation failure has been noted
- [ ] If an anti-pattern was discovered: it has been added to `AGENT_RULES.md` or `BULLPEN_OPERATING_CONTEXT.md`
- [ ] If a new architectural pattern was established: it has been documented in `BULLPEN_OPERATING_CONTEXT.md`
- [ ] `SPECIALISTS.md` updated if role ownership boundaries changed

---

*Version 1.0 — 19 March 2026*
