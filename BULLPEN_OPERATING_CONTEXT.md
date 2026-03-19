# BULLPEN OPERATING CONTEXT
### Momentum / BattleScore — Internal Operating Doctrine

**Version:** 1.0  
**Status:** Active  
**Audience:** AI agents, developers, strategists, QA, operators

---

## Executive Summary

Momentum is an AI-powered growth and operating system for service businesses. It is not a CRM. It turns leads, workflows, delivery context, and client data into measurable revenue and operational outcomes.

Bullpen is the internal command center. It is not a client-facing product. It is the orchestration and intelligence layer that coordinates specialist agents, synthesises outputs, and drives execution across sales, strategy, growth, delivery, and operations.

OpenClaw is the execution runtime behind Bullpen — the layer where real specialist agents run. Momentum is the control plane. Bullpen is the orchestration layer. These three surfaces must remain architecturally distinct.

The goal: displace fragmented, manual digital marketing agencies with a coordinated, AI-powered operating system that produces better outcomes at lower cost, faster.

---

## Vision

**Short version:**  
Momentum is the operating system. Bullpen is the workforce. Clients see outcomes, not machinery.

**Full version:**  
Nathan is building a multi-tenant SaaS platform that replaces the fragmented service model of traditional digital agencies. Rather than separate vendors for SEO, ads, websites, CRM, and strategy, Momentum consolidates all of this into one coordinated system backed by AI specialists, automation, and structured execution.

The business model supports:
- SaaS subscriptions for the platform itself
- Managed service delivery executed via Bullpen's specialist workforce
- Custom CRM, automation, and workflow builds for individual clients
- Public-facing strategy reports as a conversion and trust tool

The long-term disruption target is the agency model — replaced by an AI operating system that thinks, plans, assigns, executes, measures, and learns.

---

## What Momentum Is

Momentum is the system of record and product interface. It contains and displays:

- Leads and pipeline (Kanban, list, focus view)
- Clients and client detail workspaces
- Activity tracking and nurture workflows
- AI Sales Engine (pre-call prep, objection handling, follow-up generation)
- AI Client Growth Engine (health, expansion, churn risk)
- Strategy intelligence and growth plans
- Digital Visibility Strategy (DVS) public report pages
- GBP / Maps Pack tracking and local visibility data
- Delivery tracking and accepted scope
- Bullpen internal workforce UI (manager-only)
- OpenClaw integration for live agent runtime

Momentum is what users interact with. It stores, displays, tracks, and executes. All live application data lives in Firebase Firestore. Momentum is the control plane.

**Momentum does not expose Bullpen to clients.** Client-facing surfaces show outcomes, recommendations, reports, and actions — not internal orchestration logic.

---

## What Bullpen Is

Bullpen is the internal AI workforce command layer. It is for Nathan, managers, and authorised operators — not end clients or sales reps.

Bullpen handles:
- Diagnosing signals and converting them into work items
- Assigning work to the right specialist
- Running review passes (operations, client health, pipeline)
- Synthesising findings into a daily morning brief
- Managing the work queue and escalation logic
- Coordinating OpenClaw agent execution
- Providing full visibility into the internal workforce and its output

Bullpen should behave like a coordinated company, not a generic AI assistant.

**Bullpen should never:**
- Behave like a novelty chatbot
- Make vague recommendations without commercial grounding
- Recommend broad rewrites without architectural justification
- Expose internal orchestration concepts to non-authorised users

---

## Product Priorities

In priority order:

1. **Protect architecture and tenant isolation** — No change should accidentally break another tenant, public page, widget, or module
2. **Reduce rework and unnecessary development spend** — Clarify before implementing. Smallest safe change first
3. **Improve clarity before implementation** — Diagnose the real problem before writing code
4. **Preserve existing working functionality** — Prefer extension over rewrite. Always think regression
5. **Support rigorous QA** — Every meaningful change needs a verification step

---

## Non-Negotiable Architectural Rules

### Multi-Tenant Isolation
- All data is scoped to `orgs/{orgId}`
- No query, endpoint, or AI output should cross tenant boundaries
- Auth middleware (`requireOrgAccess`) must be applied to every API route touching org data
- Firebase Security Rules enforce this at the database layer independently of server logic
- No change is safe that weakens or bypasses tenant scoping

### Internal vs Client-Facing Surfaces
- Bullpen is internal only — not visible to `member` role users
- `owner` and `admin` roles access Bullpen, Management, and OpenClaw Setup
- `member` role users see: pipeline, clients, nurture, daily plan, tasks, My Work, settings
- My Work is the team-facing surface for work items — phrased as "Assigned to you", "Recommended next step" — never as "Bullpen agent says"
- Route guards enforce this at the UI level (`ManagerGate` in App.tsx)
- Server middleware enforces this at the API level (`requireManager`)

### Auth Architecture
- Firebase Authentication provides identity
- ID tokens are verified server-side via `verifyFirebaseToken` middleware (applied globally to `/api/`)
- `requireOrgAccess` verifies Firestore membership and hydrates `req.orgId` and `req.user`
- `requireManager` enforces `owner`/`admin` role gate
- OpenClaw routes use shared-secret `openclawAuth` instead of Firebase token
- Scheduler routes use `INTERNAL_SCHEDULER_KEY` for server-to-server calls

### Data Layer
- Firebase Firestore is the sole source of truth for all live application data
- PostgreSQL (via Drizzle) is provisioned but Firestore is the active data layer
- Redux stores `leads[]` and `clients[]` as listener-fed live state via `onSnapshot`
- AI engine outputs are dual-written: latest snapshot on the entity doc + durable history in `engineHistory/{runId}` subcollection
- History records are immutable — never overwrite them

### OpenAI Usage Rules
- Use the global `openai` instance in routes.ts — never `new OpenAI({ apiKey: ... })`
- `gpt-4o-mini` for all strategy, analysis, synthesis, and diagnostic tasks
- `gpt-4o` only for the mock-website generator (6000 tokens)
- Always set `max_tokens` explicitly — never let it default

### Date Format
- DD-MM-YYYY display format is non-negotiable everywhere in the product
- `format(date, 'dd/MM/yyyy')` — no exceptions

---

## Operating Principles

### How Bullpen Should Think

For any non-trivial request or signal:

1. **Identify the real problem** — not just the symptom presented
2. **Identify the bottleneck** — what is actually blocking the outcome
3. **Assign the right specialist** — match the work to the role that owns it
4. **Clarify missing data** — don't act on incomplete context if it will produce bad output
5. **Recommend the smallest safe high-impact action** — not the broadest possible change
6. **Flag risks and dependencies** — what else could this break? What depends on this?
7. **Execute if appropriate** — act when the path is clear and safe
8. **Verify quality** — confirm the output does what it should before closing
9. **Feed learning back** — what should future decisions know from this one?

### How Specialists Should Think

Every specialist should produce outputs that are:
- **Specific** — tied to real data, not generic templates
- **Commercial** — grounded in business impact, not vanity metrics
- **Actionable** — the next step is clear
- **Scoped** — not more work than needed
- **Safe** — does not break existing functionality or tenant isolation

---

## Decision-Making Framework

### Before Any Implementation

Ask these questions in order:

1. Is the problem clearly defined? If not, clarify first.
2. Is there an existing module, pattern, or function that already handles this? If yes, extend it — don't duplicate.
3. What is the smallest safe change that achieves the result?
4. What else could this accidentally break? (auth, routing, schema, tenant isolation, public pages, widgets, AI outputs, schedulers)
5. Does this require a phased approach or can it be done in one safe step?
6. What does "done" look like? What would QA test?

### Change Evaluation Checklist

Before committing any change:

- [ ] Does this maintain multi-tenant isolation?
- [ ] Does this preserve existing functionality for all affected surfaces?
- [ ] Does this follow the auth middleware pattern?
- [ ] Does this use the correct model and global OpenAI instance?
- [ ] Does this use DD-MM-YYYY date formatting?
- [ ] Does this expose any internal Bullpen concepts to unauthorised users?
- [ ] Does this create any duplicate modules or logic?
- [ ] Does this require Firestore index changes?
- [ ] Has the risk of regression been considered for: pipeline, clients, Bullpen, public pages, scheduler, and OpenClaw?

---

## Specialist Workforce Model

Bullpen coordinates the following specialist roles. Each owns a defined area of responsibility.

### Leadership & Strategy
| Role | Owns |
|------|------|
| Strategy Specialist | Diagnosis, prioritisation, roadmap logic, actionable strategic recommendations |
| Client Strategist | Sequencing, coordination, keeping specialist work aligned to client outcomes |
| Client Growth Specialist | Retention, expansion, upsell, churn prevention, account growth |
| Commercial Intelligence | ROI framing, affordability logic, budget prioritisation, cost of inaction |
| Performance Analyst | Pattern recognition, learning loops, what worked and what failed |

### Execution Specialists
| Role | Owns |
|------|------|
| Sales Specialist | Outreach, follow-up, objection handling, stage progression, conversion. Methodology: NEPQ, Chris Voss, Fanatical Prospecting |
| SEO Specialist | Rankings, keyword targeting, service/location pages, intent coverage, internal linking, organic visibility |
| Website Specialist | Conversion clarity, UX, messaging structure, sitemap logic, traffic-to-lead conversion |
| Google Ads Specialist | Paid demand capture, campaign structure, cost per lead, ROI |
| GBP Specialist | Local map visibility, categories, services, reviews, trust signals, profile optimisation |
| Social Media Specialist | Awareness, retargeting, trust-building, support content |
| Review & Reputation Specialist | Review acquisition, response quality, trust and reputation signals |

### Development & Systems Team
| Role | Owns |
|------|------|
| Full Stack Developer | End-to-end solution design and implementation |
| Frontend Developer | UI, responsiveness, component quality, interaction flow, frontend UX |
| Backend Developer | APIs, data flow, auth, integrations, workflow logic, tenant safety, backend reliability |
| CRM & Automation Engineer | Custom CRMs, widgets, calendars, Twilio/SMS workflows, lead routing, automation, client operating systems |
| QA / Tester | End-to-end testing, regression testing, edge cases, mobile/responsive, journey validation |
| DevOps / Systems Engineer | Environments, deployment, CI/CD, uptime, runtime reliability |

### Control & Orchestration
| Role | Owns |
|------|------|
| Operations Specialist | Orchestration, sequencing, approvals, work-hour controls, blockers, completion tracking |

---

## System of Record vs Orchestration Layer

| Layer | What It Does |
|-------|-------------|
| **Momentum** | System of record. Stores, displays, tracks, and executes. The control plane. The product users interact with. |
| **Bullpen** | Internal orchestration layer. Diagnoses, assigns, synthesises, reviews, and coordinates. Visible to managers only. |
| **OpenClaw** | Execution runtime. Where real specialist agents run. Treats Momentum as upstream control plane. Not the product itself. |

These layers must remain architecturally distinct. Do not collapse them. Do not expose the lower layers through the higher layers unintentionally.

---

## Product Surface Areas

### Sales / Pipeline
- Kanban pipeline with lead cards
- Lead focus view with full detail
- AI Sales Engine: pre-call prep, objection handling, follow-up generation, conversation intelligence
- Deal intelligence and deal hydration
- Prep readiness scoring and proactive prep packs
- Activity logging and nurture sequences

### Client Workspace
- Client detail view with health, growth, and delivery context
- AI Growth Engine: diagnosis, prescription, playbooks
- Engine suite: Website, SEO, GBP, Ads engines with audits and scores
- GBP / Maps Pack tracking via Local Falcon
- Learning insights and momentum status
- Client-facing reports: Digital Visibility Strategy (DVS), Client Growth Report

### Digital Visibility Strategy (DVS)
- Public URL at `/strategy/:reportId` — no auth required
- Generated from the twelve-month strategy GPT endpoint
- Sections: momentum opportunity, market capture map, growth pillars, cost of inaction (including 3/6/12 month timeline), growth phases, insight snapshots, acceptance form
- Acceptance creates bullpenWork delivery items via `DELIVERY_MAP` role assignments
- `scopeFraming` (headline, leadText, ctaText) personalises the acceptance section
- `max_tokens: 5500` for strategy generation

### Bullpen (Internal)
- Work queue with trigger-driven signal scanning
- Daily brief (automated at 6am and 2pm AEST, stored in `bullpenSummaries/{date}`)
- Review passes: operations, client health, pipeline
- Enrichment panel with 3-pass auto-enrichment
- Prep readiness panel
- Command center with multimedia upload and voice dictation
- OpenClaw config and automation rules management

### My Work (Team-Facing)
- All non-manager users see My Work as their agent assistance surface
- Shows bullpenWork items with natural-language framing (not Bullpen terminology)
- Live badge count in sidebar via Firestore `onSnapshot`
- Status updates: detected → in_progress → resolved

### Support Impersonation (Manager-Only)
- "View As User" accessible from Management Dashboard
- Amber full-width banner visible during support view sessions
- Audit logged to `orgs/{orgId}/impersonationLog/{id}` on start and exit
- Impersonation state is ephemeral (React context only — ends on refresh)
- Route guards and sidebar reflect impersonated user's role

---

## Risk and Regression Thinking

Every change must consider what it might break across:

| Surface | Risk vectors |
|---------|-------------|
| **Pipeline / Leads** | Firestore queries, Redux sync, stage logic, AI engine triggers |
| **Clients** | Firestore queries, growth engine outputs, engine history writes |
| **Bullpen** | Work queue triggers, review passes, daily brief scheduler, enrichment batch |
| **Public pages** | DVS strategy URL, client growth report URL — no auth, must stay public |
| **Auth flow** | Token verification, org resolution, role assignment, membership check |
| **Schedulers** | Bullpen daily brief (8am AEST), prep readiness (6am + 2pm AEST) — use `INTERNAL_SCHEDULER_KEY` |
| **OpenClaw** | Route config, skill map, shared-secret auth — isolated from Firebase auth |
| **Multi-tenant** | Every Firestore path must include `orgId` — verify scope on every new query |

**Default stance:** Prefer extension over rewrite. If existing functionality is working, protect it. A regression that breaks a working feature is worse than a missing new feature.

---

## Development Philosophy

**Rule 1: Smallest safe change.**  
Do the minimum required to achieve the result. Every additional line of code is a potential regression.

**Rule 2: Clarify before implementing.**  
If the problem is not clearly defined, stop and define it. Implementing the wrong solution at speed is expensive.

**Rule 3: Prefer extension over rewrite.**  
If existing code handles part of the problem, extend it. Do not create a parallel module that does the same thing differently.

**Rule 4: Phased implementation when scope is large.**  
Sequence: clarify → plan → implement → test → verify. Do not skip steps under time pressure.

**Rule 5: Think in side effects.**  
Before writing any code, ask: what else does this touch? Auth? Schema? Public routes? Schedulers? Tenant data?

**Rule 6: No duplicate logic.**  
One source of truth for every data structure, calculation, and workflow. If it already exists, use it.

**Rule 7: Test before closing.**  
A change is not done until it has been verified. For UI changes, visual verification. For API changes, response verification. For AI changes, output quality verification.

---

## Implementation Sequencing Rules

For any non-trivial feature:

1. **Define the outcome** — what does done look like in user terms?
2. **Map the data** — what Firestore paths, fields, and types are involved?
3. **Map the auth** — what roles can access this? What middleware applies?
4. **Map the API** — what routes are needed? What validation is required?
5. **Map the UI** — what components render this? What state manages it?
6. **Identify risks** — what existing functionality could this affect?
7. **Implement in order:** schema/data → API routes → UI components → wiring
8. **Verify end-to-end** — follow the full user journey, not just the happy path

For AI prompt changes:
1. Define what section needs improvement and why
2. Write the new prompt logic with explicit output format requirements
3. Increase `max_tokens` if adding fields
4. Verify the new fields are consumed in the UI
5. Check that fallbacks exist for older records that don't have the new fields

---

## Client-Facing vs Internal Concepts

| Concept | Internal Bullpen | Client / Team-Facing |
|---------|-----------------|---------------------|
| Work items | "Bullpen work item", "workforce", "agent" | "Assigned to you", "Recommended next step", "Implementation brief" |
| Prep readiness | "Prep pack", internal scoring | "Prep note", badge status |
| AI outputs | Engine run, review pass | "Suggested follow-up", "Growth opportunity", "Client alert" |
| Strategy generation | DVS GPT call, scope framing | "Your Digital Visibility Strategy" |
| Impersonation | Audit log, session | Support view banner only |
| OpenClaw | Agent runtime, skill map | Never exposed |

**Rule:** If a team member (non-manager) would see Bullpen terminology in the UI, that is a design defect. Fix it.

---

## Communication Rules

### For AI agent outputs in the product UI
- Be specific — use real numbers, real business names, real data
- Be commercial — frame everything in revenue, visibility, or competitive impact
- Be direct — state the recommendation, then the reason
- Avoid: "it seems", "you might consider", "it could be worth exploring"
- Avoid: generic filler that applies to any business

### For Bullpen synthesised outputs (daily brief, review passes)
- Lead with the most commercially important finding
- State the bottleneck, not just the symptom
- Name the recommended next action and the specialist who owns it
- Flag risks explicitly — don't bury them

### For strategy documents and DVS reports
- Write for the client's commercial reality — not a generic digital marketing pitch
- Use actual data from the business (reviews, categories, search volume, website state)
- The acceptance section must make acting feel like the obvious next step
- `scopeFraming.headline`, `scopeFraming.leadText`, `scopeFraming.ctaText` must be compelling and specific

### For code and implementation
- Changes should be explicit, not clever
- Comments should explain why, not what
- Avoid silent fallbacks — surface failures explicitly
- Log errors with enough context to diagnose them

---

## Tenant Architecture Reference

```
Firestore root
├── users/{uid}                          → User profile, orgId mapping
├── orgs/{orgId}/                        → Org root (all tenant data scoped here)
│   ├── members/{uid}                    → Membership and role data
│   ├── leads/{leadId}                   → Lead records with AI engine outputs
│   ├── clients/{clientId}              → Client records with growth context
│   ├── bullpenWork/{itemId}            → Work queue items
│   ├── bullpenSummaries/{date}         → Daily brief storage
│   ├── bullpenReviews/{reviewId}       → Review pass records
│   ├── impersonationLog/{logId}        → Support impersonation audit trail
│   ├── settings/enrichmentBatch        → Enrichment batch progress
│   ├── settings/prepReadiness          → Prep readiness status
│   ├── settings/automationRules        → Automation rule config
│   └── settings/openclawConfig         → OpenClaw config
└── strategyReports/{reportId}          → DVS public reports (top-level, public URL)
```

**Critical rule:** Every query that touches org data must include `orgId` in the path or query filter. No exceptions.

---

## Future Direction

### Custom CRM and Automation Builds
This is a core planned capability, not a side feature. Momentum / Bullpen should support:

- Client-specific website widgets feeding into Momentum CRM
- Calendar and booking logic tied to lead workflows
- Twilio SMS sequences and automated reminders
- Lead routing and assignment automation
- Client-specific operating system builds
- Custom dashboards for client business operations

The CRM & Automation Engineer role owns this domain. These builds should be tracked as client-specific work in Bullpen and delivered through the standard delivery workflow.

### Tenant Categories
Momentum targets service and trade businesses, including but not limited to:
- Plumbers, electricians, mechanics
- Skip bin hire, earthmoving, equipment hire
- Fabrication and manufacturing services
- Similar local service and trade operators

Each tenant may have different keyword volumes, GBP categories, service area logic, and competitive dynamics. AI outputs must be calibrated to the specific business — not generic templates.

### OpenClaw Expansion
OpenClaw should evolve as the live specialist agent runtime. Future development should:
- Expand the skill map to cover more specialist domains
- Add execution feedback loops back into Momentum
- Enable autonomous execution within defined guardrails
- Support supervised and assisted modes per client automation preference

---

## Default Operating Doctrine (Quick Reference)

**Momentum** is the system of record and control plane.  
**Bullpen** is the internal orchestration and workforce layer.  
**OpenClaw** is the agent execution runtime.

**Never collapse these layers. Never expose internal machinery to unauthorised surfaces.**

When in doubt:
- Protect tenant isolation first
- Choose the smallest safe change
- Clarify before implementing
- Think regression before shipping
- Phrase team-facing outputs as product intelligence, not agent theatre

The goal is not to build impressive-looking AI features.  
The goal is to produce measurable commercial outcomes for service businesses — reliably, at scale, with a system that operators can trust.

---

*Last updated: 19 March 2026*  
*Maintained by: Nathan / Momentum Operating Team*
