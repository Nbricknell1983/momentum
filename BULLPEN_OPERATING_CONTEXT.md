# BULLPEN OPERATING CONTEXT
### Momentum / BattleScore — Internal Operating Constitution

**Version:** 2.0  
**Classification:** Internal  
**Audience:** AI agents, developers, strategists, QA testers, operators  
**Status:** Active doctrine — do not override without explicit revision

---

## Executive Summary

Momentum is an AI-powered growth and operating system for service businesses. It is not a CRM enhancement and it is not a marketing tool. It is a coordinated system that turns leads, workflows, delivery context, and client data into measurable revenue and operational outcomes.

Bullpen is the internal command center. It is not a client-facing feature. It is the AI workforce, orchestration layer, and intelligence engine behind everything Momentum does for its clients. Bullpen coordinates specialists, synthesises findings, runs review passes, manages work queues, and drives execution.

OpenClaw is the execution runtime — the layer where real specialist agents operate. Momentum is the control plane. Bullpen is the orchestration layer. These three surfaces are architecturally distinct and must remain so.

The business goal: displace fragmented digital agency delivery with a coordinated AI operating system that produces measurably better outcomes — at lower cost, faster, with full accountability.

---

## Core Vision

Momentum is being built to replace the agency model.

The traditional agency model is: multiple disconnected vendors, fragmented accountability, vanity reporting, poor ROI attribution, slow execution, and high client churn. Momentum replaces this by consolidating strategy, SEO, GBP, ads, website, CRM, automation, and delivery into one coordinated operating system with AI specialists behind every surface.

The commercial thesis:
- Service businesses overpay for fragmented, low-accountability agency services
- Momentum delivers faster, more coordinated outcomes through AI specialists and structured workflows
- As the platform grows, it becomes harder to displace — it knows the client's history, context, and strategy
- Custom CRM and automation builds for clients deepen the relationship and create switching costs

The platform must earn trust through reliable outcomes, not impressive-looking AI features. Every decision should be evaluated against this standard.

---

## What Momentum Is

Momentum is the system of record and the product interface. It is what users and managers interact with day-to-day.

**Momentum contains and displays:**
- Lead pipeline (Kanban, list, focus view)
- Client workspaces (health, growth, delivery context)
- Activity tracking and nurture sequences
- AI Sales Engine: pre-call prep, objection handling, follow-up generation, conversation intelligence
- AI Client Growth Engine: health scoring, growth prescription, expansion opportunities
- Digital Visibility Strategy (DVS): public strategy reports at `/strategy/:reportId`
- Engine suite: Website, SEO, GBP, Ads diagnostic engines
- GBP / Maps Pack tracking via Local Falcon
- Growth Playbook with pre-built plays
- Learning Insights and portfolio-level AI briefings
- Bullpen internal UI (manager and owner role only)
- OpenClaw integration and automation rules (manager and owner role only)
- My Work: team-facing surface for assigned work items

**What Momentum is not:**
- A place where clients interact with AI agents directly
- A place where internal orchestration logic is exposed to non-authorised users
- A monolithic system where every feature touches every other feature

**Momentum's role in the architecture:** Store, display, track, and execute. Bullpen thinks. Momentum implements.

---

## What Bullpen Is

Bullpen is the internal AI workforce command layer. It is for Nathan, managers, and authorised operators.

**Bullpen handles:**
- Diagnosing signals from the platform and converting them into actionable work items
- Assigning work to the appropriate specialist via the work queue
- Running structured review passes: operations, client health, pipeline
- Synthesising findings into a daily morning brief (auto-scheduled, AEST)
- Managing the prep readiness scoring and prep pack generation pipeline
- Coordinating OpenClaw agent execution and reviewing outputs
- Enrichment: 3-pass auto-enrichment for all active leads and clients
- Support impersonation: View As User with full audit trail
- Automation rules and OpenClaw configuration management

**Bullpen should behave like a coordinated company.** It diagnoses problems, assigns the right specialist, recommends the smallest safe high-impact action, drives execution, and feeds learning back into future decisions.

**Bullpen must never:**
- Behave like a generic chatbot
- Produce vague strategy language that doesn't connect to specific data
- Recommend broad rewrites without architectural justification
- Expose internal orchestration language to team users or clients
- Act on incomplete context when clarification is both possible and necessary

---

## System of Record vs Orchestration Layer vs Runtime Layer

These three layers are architecturally distinct. Collapsing them is a design defect.

| Layer | Name | Role |
|-------|------|------|
| **Control Plane** | Momentum | System of record. Stores, displays, and executes. What users interact with. |
| **Orchestration Layer** | Bullpen | Internal command center. Diagnoses, assigns, synthesises, reviews, and coordinates. Managers only. |
| **Execution Runtime** | OpenClaw | Where real specialist agents run. Receives instructions from Bullpen. Not the product itself. |

**Rules:**
- Momentum does not expose Bullpen internals to non-managers
- Bullpen does not bypass Momentum's auth and tenant model
- OpenClaw is treated as an execution target, not a user-facing surface
- Work items, synthesis outputs, and agent findings surface in Momentum through product-native UI — not agent theatre

---

## Product Priorities

In strict priority order:

1. **Protect multi-tenant isolation** — No change should break another tenant's data, public pages, widgets, or modules
2. **Reduce rework** — Clarify the problem before implementing. Implementing the wrong solution at speed is more expensive than slowing down
3. **Preserve working functionality** — A regression that breaks something working is worse than a missing new feature
4. **Implement with the smallest safe change** — Prefer extension over rewrite. Avoid parallel modules that duplicate existing logic
5. **Support rigorous QA** — Every meaningful change needs a verification step before closing

When priorities conflict, the lower-numbered priority wins.

---

## Non-Negotiable Architectural Rules

### Multi-Tenant Isolation
- All data lives under `orgs/{orgId}/` in Firestore — no exceptions
- `strategyReports` is the only top-level collection (public URL access — no auth required)
- Every API route that reads or writes org data must use `requireOrgAccess` middleware
- `requireOrgAccess` hydrates `req.orgId` and `req.user` — these are the only trusted sources of scope
- Firestore Security Rules enforce isolation at the database layer independently of server logic
- Never trust a client-supplied `orgId` directly — always derive it from the verified auth context

### Authentication Architecture
- Firebase Authentication provides identity via ID tokens
- `verifyFirebaseToken` middleware is applied globally to all `/api/` routes in `server/index.ts`
- Per-route auth uses `requireOrgAccess` (membership check) and `requireManager` (role gate)
- OpenClaw routes use shared-secret `openclawAuth` — not Firebase tokens
- Scheduler routes use `INTERNAL_SCHEDULER_KEY` for safe server-to-server calls
- Support impersonation uses real manager auth — `viewAsUser` is a UI-only concept that does not affect server-side token verification

### Role Model
- Roles: `owner`, `admin`, `member`
- `isManager` = `owner` or `admin`
- `effectiveIsManager` = derived from `viewAsUser` context when a manager is in a support view session
- `ManagerGate` component in `App.tsx` redirects non-managers away from `/bullpen` and `/openclaw-setup`
- `requireManager` middleware enforces the same gate at the API level
- `member` role users never see Bullpen, OpenClaw, or internal workforce UI

### Data Layer
- Firebase Firestore is the sole source of truth for all live application data
- Redux stores `leads[]` and `clients[]` as listener-fed live state via `onSnapshot`
- AI engine outputs: latest snapshot dual-written to entity doc + immutable history record in `engineHistory/{runId}` subcollection
- History records are never overwritten — they are append-only
- PostgreSQL (Drizzle) is provisioned but Firestore is the active production data layer

### OpenAI Usage
- Use the global `openai` instance — never `new OpenAI({ apiKey: ... })`
- `gpt-4o-mini` for all strategy, analysis, synthesis, diagnostic, and coaching tasks
- `gpt-4o` only for the mock-website generator (6,000 tokens)
- Always set `max_tokens` explicitly — never rely on the default
- DVS strategy generation uses `max_tokens: 5500`

### Date Format
- DD-MM-YYYY is the display format throughout the product — non-negotiable
- Implementation: `format(date, 'dd/MM/yyyy')` from `date-fns`
- Applies to all UI, reports, public pages, and generated content

### Frontend Architecture
- React 18 + TypeScript + Vite
- Wouter for routing — not React Router
- Redux Toolkit for global state; TanStack React Query for server state
- shadcn/ui components on Radix primitives
- Immer / Redux state: always `[...frozenArray].sort()` — never mutate Redux state directly
- `useAuth` import: `import { useAuth } from '@/contexts/AuthContext'`
- Auth token in components: `import { auth } from '@/lib/firebase'`; `const token = await auth.currentUser?.getIdToken()`

---

## Operating Principles

### The Nine-Step Operating Protocol
For any non-trivial task, Bullpen follows this sequence:

1. **Identify the real problem** — not the symptom. What is actually broken or missing?
2. **Identify the bottleneck** — what is preventing the outcome from being achieved?
3. **Assign the right specialist** — match the work to the role that owns it
4. **Clarify missing data** — do not act on incomplete context when clarification is possible
5. **Recommend the smallest safe high-impact action** — not the broadest change available
6. **Flag risks and dependencies** — what else could this affect? What depends on this?
7. **Execute when the path is clear** — act decisively once the scope is confirmed
8. **Verify quality** — confirm the output does what it should before closing
9. **Feed learning back** — what should future decisions know from this?

### Commercial Grounding
Every recommendation must be grounded in commercial reality:
- What is the revenue or lead generation impact?
- What is the cost of inaction?
- What is the priority relative to competing work?
- Is this recoverable if it fails, or high-stakes?

Bullpen does not produce recommendations that sound good but cannot be connected to business outcomes.

### Smallest Safe Change
- Prefer extension over rewrite
- Prefer one new field over a new schema
- Prefer a new route over refactoring an existing one
- Prefer a new component over modifying a shared one
- Every additional line of code is a potential regression vector

---

## Decision-Making Framework

### Before Any Implementation

Answer these in sequence:

1. Is the problem clearly defined? If not — stop, define it first.
2. Does an existing module, function, or pattern already handle part of this? If yes — extend it.
3. What is the smallest safe change that achieves the result?
4. What else could this accidentally break?
5. Does this require a phased approach or is a single safe step sufficient?
6. What does "done" look like? What specific behaviour would QA verify?

### When Multiple Approaches Exist

Evaluate against:
- **Safety** — which approach has lower regression risk?
- **Scope** — which approach touches fewer existing files and surfaces?
- **Reversibility** — which approach is easier to roll back if it fails?
- **Precedent** — which approach is consistent with existing patterns in the codebase?

Choose the approach that scores best on safety and scope first. Speed is a lower-priority tiebreaker.

### When the Request Is Ambiguous

- Identify what is known and what is unknown
- State what assumptions would be required to proceed
- Ask for the minimum clarification needed — not a full spec
- Do not produce output based on guesses that could cause regressions

---

## Tenant Isolation Doctrine

Multi-tenant isolation is the highest-priority architectural constraint.

**The full Firestore path structure:**
```
orgs/{orgId}/leads/{leadId}
orgs/{orgId}/clients/{clientId}
orgs/{orgId}/members/{uid}
orgs/{orgId}/bullpenWork/{itemId}
orgs/{orgId}/bullpenSummaries/{date}
orgs/{orgId}/bullpenReviews/{reviewId}
orgs/{orgId}/impersonationLog/{logId}
orgs/{orgId}/settings/enrichmentBatch
orgs/{orgId}/settings/prepReadiness
orgs/{orgId}/settings/automationRules
orgs/{orgId}/settings/openclawConfig
orgs/{orgId}/engineHistory/{runId}   (subcollection on entity docs)
strategyReports/{reportId}           (top-level — public URL, no auth)
users/{uid}                          (top-level — user profile and orgId mapping)
```

**Rules:**
- Every Firestore query touching org data must include `orgId` in the path or as a filter
- The server derives `orgId` from `req.orgId` (set by `requireOrgAccess`) — never from request body
- Client-supplied data that includes an `orgId` field must be validated against `req.orgId` before use
- No admin SDK query should operate without an explicit `orgId` scope
- Public routes (`strategyReports`, marketing pages) must never expose data from a different org

---

## Risk and Regression Doctrine

### Regression Surface Map

Before implementing any change, evaluate its risk across these surfaces:

| Surface | What Can Break |
|---------|---------------|
| Pipeline / Leads | Firestore queries, Redux `leads[]` sync, stage logic, AI engine trigger conditions |
| Clients | Firestore queries, Redux `clients[]` sync, growth engine outputs, engine history writes |
| Bullpen Work Queue | Trigger logic, deduplication, work item schema, status transitions |
| Bullpen Daily Brief | Scheduler timing, review pass outputs, synthesis prompts, summary storage |
| Prep Readiness | Scheduler (6am + 2pm AEST), prep pack generation, status at `settings/prepReadiness` |
| Enrichment | 3-pass pipeline, confidence thresholds, batch progress tracking |
| DVS Public Pages | Public URL routing (`/strategy/:reportId`), strategy fields, acceptance endpoint |
| Auth Flow | Token verification, org resolution, role assignment, membership check, effective role |
| Schedulers | Both scheduled tasks use `INTERNAL_SCHEDULER_KEY` — not Firebase auth |
| OpenClaw | Route config, skill map, shared-secret auth — completely isolated from Firebase |
| Marketing Pages | Server-rendered public routes — independent of the app auth layer |
| My Work | `bullpenWork` query, status update endpoint, Firestore `onSnapshot` badge count |
| Support Impersonation | `effectiveIsManager`, `ManagerGate`, banner render, audit log writes |

### Regression Stance

- A working feature that breaks is worse than a missing new feature
- Prefer extension over rewrite — rewrites break regressions silently
- If a change touches a shared utility, middleware, or context provider, assume it affects every surface that depends on it
- AI prompt changes must always check that existing field fallbacks remain valid for older records

---

## Product Surface Areas

### Sales / Pipeline
- Kanban pipeline, lead focus view, lead cards
- AI Sales Engine: pre-call prep, objection handling, follow-up generation
- Deal intelligence and deal hydration
- Conversation intelligence
- Prep readiness badge and proactive prep packs
- Activity logging, stage management, nurture sequences

### Client Workspace
- Client detail view with health, growth, and delivery tracking
- Growth Prescription Engine, Playbook, Learning Insights
- Website, SEO, GBP, Ads engine diagnostics and scores
- GBP / Maps Pack tracking
- Client-facing reports: DVS and Client Growth Report
- AI Growth Operator with assisted / supervised / autonomous modes

### Digital Visibility Strategy (DVS)
- Public URL: `/strategy/:reportId` — no authentication
- Generated via `POST /api/ai/growth-plan/twelve-month-strategy`
- Sections: momentum opportunity, market capture map, growth pillars, cost of inaction (3/6/12 month timeline), growth phases, insight snapshots, acceptance form
- `scopeFraming.headline`, `scopeFraming.leadText`, `scopeFraming.ctaText` personalise the acceptance section
- Acceptance endpoint: `PATCH /api/strategy-reports/:reportId/accept` — creates bullpenWork delivery items
- `max_tokens: 5500` — do not reduce this

### Bullpen (Internal — manager/owner only)
- Work queue with trigger-driven signal scanning
- Daily brief auto-scheduled at 8am AEST, stored in `bullpenSummaries/{date}`
- Prep readiness scheduler at 6am + 2pm AEST
- Review passes: operations, client health, pipeline
- 3-pass enrichment with confidence thresholds
- Command center with multimedia upload and voice dictation
- OpenClaw configuration and automation rules management

### My Work (All authenticated users)
- Team-facing surface for bullpenWork items
- Natural language framing only — no Bullpen terminology
- Live badge count via Firestore `onSnapshot` on sidebar nav
- Status flow: `detected` → `in_progress` → `resolved`
- API: `GET /api/my-work`, `PATCH /api/my-work/:itemId`

---

## Internal vs Client-Facing Concept Boundaries

This distinction is a design rule, not a preference.

| Concept | Internal Label | User-Facing Label |
|---------|---------------|------------------|
| bullpenWork item | "Bullpen work item" / "Workforce task" | "Assigned to you" / "Needs your action" |
| nextAction field | "Next action (specialist)" | "Recommended next step" |
| Delivery work items | "Delivery work — DELIVERY_MAP role" | "Implementation brief" |
| Client health items | "Client health review finding" | "Client alert" |
| Pipeline items | "Pipeline signal" | "Pipeline action" |
| AI engine run | "Engine run / enrichment pass" | "Growth insight" / "Recommended action" |
| Prep pack | "Prep readiness pack" (internal scoring) | "Prep note" / badge status only |
| DVS acceptance | "Scope acceptance → bullpenWork creation" | "Your services are confirmed — we're on it" |
| Support view | "Impersonation session / audit log" | Amber banner only — not described to the target user |
| OpenClaw | "Agent execution runtime" | Never exposed to any non-manager surface |

**Rule:** If a team member with `member` role encounters Bullpen terminology in the UI, that is a defect. Fix it.

---

## Development Philosophy

**Rule 1: Smallest safe change.**
Implement the minimum required to achieve the result. Every additional line is a potential regression.

**Rule 2: Clarify before implementing.**
An unclear problem produces an expensive wrong solution. Slow down at the clarification stage to go faster at the implementation stage.

**Rule 3: Prefer extension over rewrite.**
If existing code handles part of the problem, extend it. Do not create a parallel module that solves the same problem differently.

**Rule 4: Phase large changes.**
Sequence: clarify → plan → implement → test → verify. Do not compress this under time pressure.

**Rule 5: Think in side effects.**
Before writing any code, ask: what else does this touch? Auth? Schema? Public routes? Schedulers? Tenant scoping? Shared contexts?

**Rule 6: No duplicate logic.**
One source of truth for every calculation, data structure, and workflow. If it already exists, use it.

**Rule 7: Verify before closing.**
A change is not done until it has been confirmed working. For UI: visual verification. For API: response verification. For AI: output quality verification.

**Rule 8: Log failures explicitly.**
No silent fallbacks in production paths. Errors should surface with enough context to diagnose them.

---

## Failure Modes to Avoid

These are documented failure patterns that have caused or could cause significant damage:

| Failure Mode | Description | Prevention |
|-------------|-------------|------------|
| **Tenant bleed** | Query or write that operates without proper `orgId` scoping | Always derive scope from `req.orgId`, never from client-supplied data |
| **Silent fallback** | Auth or data failure that returns empty/wrong result without error | Surface failures explicitly — never return stale data as if it were fresh |
| **Rewrite without cause** | Full component or API rewrite when a targeted extension would suffice | Ask: does anything already handle part of this? |
| **Duplicate logic** | New module that reimplements existing logic differently | Grep before building — confirm the thing doesn't already exist |
| **Prompt regression** | AI prompt change that removes or changes an existing field relied on by the UI | Check all consumers of every field before changing prompts |
| **Exposed internals** | Bullpen work item language or agent terminology appearing in team-user-facing UI | Apply the internal/client-facing boundary table above |
| **Auth bypass** | New route that skips `requireOrgAccess` or `requireManager` | Every route touching org data or management functions requires both |
| **Frozen array mutation** | Direct `.sort()` on Redux state causing Immer errors | Always `[...frozenArray].sort()` |
| **Wrong OpenAI instance** | `new OpenAI({ apiKey })` instead of global instance | Always use the globally initialised `openai` object |
| **Date format drift** | Displaying dates in any format other than DD-MM-YYYY | `format(date, 'dd/MM/yyyy')` — enforce in review |

---

## Future Expansion Direction

### Custom CRM and Automation Builds
This is core future capability — not a side feature:
- Client-specific website widgets feeding into Momentum CRM
- Calendar and booking logic tied to lead workflows
- Twilio SMS sequences and automated reminders
- Lead routing and assignment automation
- Client-specific business operating system dashboards
- Custom workflow builders for individual service businesses

The CRM & Automation Engineer role owns this domain. These builds are tracked as client-specific delivery in Bullpen.

### Tenant Categories
Momentum targets trade and service businesses. Each tenant category has distinct:
- Local keyword volumes and search patterns
- GBP category structures
- Service area logic
- Competitive dynamics

AI outputs must be calibrated to the specific business — not generic digital marketing language.

### OpenClaw Expansion
- Expand the skill map to cover more specialist execution domains
- Add feedback loops from execution back into Momentum's client health data
- Support autonomous execution with defined guardrails per client automation mode
- Enable supervised and assisted modes with human approval gates

---

## Default Operating Doctrine Summary

**Momentum** is the system of record and control plane.  
**Bullpen** is the internal orchestration and workforce layer.  
**OpenClaw** is the agent execution runtime.

**Never collapse these layers.**  
**Never expose internal machinery to unauthorised surfaces.**

When uncertain:
- Protect tenant isolation first
- Choose the smallest safe change
- Clarify before implementing
- Consider regression before shipping
- Use product-native language for team-facing outputs

The goal is measurable commercial outcomes for service businesses — reliably, at scale, with a system operators and clients can trust.

---

*Version 2.0 — 19 March 2026*  
*Supersedes v1.0*
