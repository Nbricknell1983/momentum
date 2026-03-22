# Momentum Agent

## Overview
Momentum Agent is an AI-assisted sales operating system designed to transform daily sales activities into consistent pipeline momentum. It functions as a productivity-focused admin dashboard, offering features such as a Kanban-style pipeline, activity tracking, nurture automation, and momentum scoring. The application aims to facilitate frictionless logging, reinforce follow-up discipline, and provide stage-aware coaching to enhance sales performance and pipeline growth. Its business vision is to provide a comprehensive, intelligent platform for sales teams, improving efficiency and driving pipeline growth.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, using Vite.
- **Routing**: Wouter.
- **State Management**: Redux Toolkit for global state, TanStack React Query for server state.
- **Styling**: Tailwind CSS with theming via CSS variables.
- **UI Components**: shadcn/ui library, built on Radix primitives.
- **Design System**: Emphasizes information density and clarity, using a fixed left sidebar, top bar, main content area, and right drawer overlay.

### Backend
- **Runtime**: Node.js with Express, written in TypeScript.
- **API**: RESTful endpoints prefixed with `/api`.
- **Serving**: Express serves static frontend assets in production.

### Data Layer
- **Primary Database**: Firebase Firestore — all live application data lives here. Sole source of truth.
- **Live State**: Leads and clients are synced via `onSnapshot` listeners. Redux `leads[]` and `clients[]` are listener-fed live state.
- **AI Output Storage**: Engine outputs are dual-written: latest snapshot on the entity doc + durable history record in `engineHistory/{runId}` subcollection. History is immutable.

### Role-Aware Agent Architecture
- **Bullpen is internal-only**: Visible only to `owner`/`admin` roles. Non-managers who navigate directly to `/bullpen` or `/openclaw-setup` are redirected to `/dashboard` via the `ManagerGate` component in App.tsx.
- **My Work page** (`/my-work`): Team-facing surface for all users. Shows pending bullpenWork items with natural-language framing ("Assigned to you", "Recommended next step", "Implementation Brief", "Client Alert"). Accessible from the sidebar with a live badge count showing items needing action.
- **Live badge**: AppSidebar subscribes to `bullpenWork` where `status == 'detected'` via Firestore `onSnapshot` and shows the count on the My Work nav item.
- **Work item surface API**: `GET /api/my-work` (all non-resolved items), `PATCH /api/my-work/:itemId` (status updates). Both require `requireOrgAccess`.
- **Attribution model**: Work items shown to team users use product-native language, not internal Bullpen/agent framing.

### Auth & Security
- **Firebase Authentication**: All user identity comes from Firebase ID tokens verified server-side.
- **Token Verification**: `verifyFirebaseToken` middleware applied globally to all `/api/` routes.
- **Org Access**: `requireOrgAccess` middleware verifies Firestore membership.
- **Manager Gate**: `requireManager` enforces `owner`/`admin` role for sensitive operations.
- **OpenClaw routes**: Use shared-secret `openclawAuth` instead of Firebase token.
- **Firestore Rules**: Deployed separately via Firebase CLI, covering all org collections.
- **Control-Plane Config**: `automationRules` and `openclawConfig` are validated with Zod and written only through server routes with an audit trail.

### Evidence Bundle Pipeline
- **Purpose**: Structured real-world evidence gathering before any AI analysis runs. Ensures specialist outputs are grounded in actual data, not inference.
- **Firestore field**: `leads/{leadId}.evidenceBundle` — saved before prep pack generation and via explicit trigger.
- **`gatherEvidenceBundle(lead, orgId)`** (server/routes.ts): Orchestrates (1) GBP/Places API discovery, (2) website crawl with enhanced detection, (3) social URL extraction. Saves structured bundle to Firestore async.
- **`POST /api/leads/:leadId/gather-evidence`**: Explicit trigger endpoint to refresh evidence without running prep pack.
- **Website evidence fields**: `url`, `title`, `metaDescription`, `h1s`, `h2s`, `navLabels`, `servicePageUrls`, `locationPageUrls`, `ctaSignals`, `trustSignals`, `conversionGaps`, `hasSchema`, `hasSitemap`, `phoneNumbers`, `serviceKeywords`, `locationKeywords`, `wordCount`, `hasHttps`.
- **GBP evidence fields**: `placeId`, `name`, `rating`, `reviewCount`, `category`, `address`, `phone`, `mapsUrl`, `editorialSummary`, `isOpen`, `healthNotes[]` (derived quality signals), `siblingLocations[]` (multi-location brand expansion), `networkSummary` (`totalLocations`, `totalReviews`, `avgRating`, `highestRated`, `lowestRated`).
- **Multi-location GBP detection**: Two-pass approach in `activePresenceDiscovery`. Pass 1: `"${name} ${suburb}"` → primary match via `scoreGbpCandidate`. Pass 2: `"${name}"` only → sibling expansion via `scoreGbpSibling` (domain match: 50pts, brand-word overlap: 0–40pts, threshold ≥ 30). `scoreGbpSibling` intentionally ignores suburb/city/phone — sibling locations have different addresses by design. GBP scorer module: `server/lib/gbp-scorer.ts` exports `scoreGbpCandidate`, `buildLeadContext`, `scoreGbpSibling`. Network summary computed in `gatherEvidenceBundle`. UI: violet network banner shown in GBP card when `networkSummary.totalLocations > 1`. Drilldown modal shows all sibling locations.
- **Social evidence fields**: `facebook`, `instagram`, `linkedin`, `twitter` — each with `url` and `detected` boolean.
- **Enhanced `crawlWebsite`** (server/strategyEngine.ts): Now detects CTAs (button/link texts, forms, click-to-call), trust signals (testimonials, awards, schema, certifications), conversion gaps (missing phone, no form, no H1, no HTTPS), service page URLs, location page URLs, and phone numbers in page content.
- **GBP field mask**: Now requests `editorialSummary`, `regularOpeningHours`, `businessStatus`, `primaryTypeDisplayName` in addition to basic fields.
- **SERP analysis**: GPT-estimated (not real search data) — labeled `estimated: true` in response. Accepts `xrayEvidence` in request body to ground competitor analysis in real crawl signals.
- **X-Ray write-back**: `POST /api/ai/growth-plan/website-xray` writes crawl evidence to `evidenceBundle.website` when `orgId` + `leadId` are provided in request body.
- **Evidence delta tracking**: `computeEvidenceDelta(prev, next)` pure function in routes.ts computes meaningful changes between two bundles at gather-time (zero extra Firestore reads — prev bundle already in-memory on `lead.evidenceBundle`). Changes saved to `leads/{leadId}.evidenceDelta` (`computedAt`, `prevGatheredAt`, `changes[]`). Previous bundle saved to `evidenceBundlePrev` for auditability. Changes include: website found/lost, sitemap/schema/HTTPS toggles, CTA/trust signal swings (≥2), conversion gap improvements/regressions (≥1), phone detection, GBP rating (≥0.1) and review count (≥5 absolute), editorial summary, social platform detection. Rendered as compact colour-coded chips in `EvidenceDeltaPanel` at the bottom of `EvidencePresenceSection` — green=improved/added, amber=worsened, red=removed. Capped at 4 visible with `+N more` expand. `delta` and `deltaPrevGatheredAt` props wired through `PrepCallPackCard`, `DealIntelligencePanel`, `LeadCardExpanded`, `AISalesEngine`.

### Core Features
- **Sales Operating System**: Includes Pipeline Management (Kanban, Lead Focus View), Conversation Intelligence, Lead & Client Management (AI Movement Tips), Territory System, Nurture System, Activity Tracking, and Momentum Scoring.
- **AI Sales Engine**: A 5-section AI layer powered by GPT-4o-mini, offering stage-aware defaults, conversation intelligence, AI-extracted insights, and personalized email generation.
- **AI Strategy & Research**: Strategy Engine, Leads Research (integrating ABR and Google Business Profiles for AI-generated outreach scripts), and a Growth Plan Module.
- **Client Application Integration**: System to connect external client business applications for live data flow.
- **AI Meeting Notes System**: AI-powered meeting notes processing with voice dictation support.
- **Client-Facing Reports**: Digital Visibility Strategy (premium consulting document) and Client Growth Report (shareable public URLs for SEO & strategy reports).
- **AI Growth Operator**: Framework for automating growth activities with per-client automation modes (assisted, supervised, autonomous), execution status tracking, and an AI Actions Feed.
- **AI Engine Suite**: Includes Growth Prescription Engine, Website Engine, SEO Engine, GBP Engine, and Ads Engine, providing AI-powered diagnostics, audits, and strategic plans for various digital presence aspects.
- **Growth Playbook**: Library of 8 pre-built growth plays with prerequisites and outcome tracking.
- **Learning Insights**: AI-generated analysis of client growth operations providing momentum status, performance insights, and next-best-move recommendations.
- **AI Growth Operator Daily Brief**: Portfolio-level morning briefing for managers with metrics, client flags, and AI-prioritized tasks.
- **Autopilot Execution**: One-click auto-approval for queued AI actions for clients in autonomous mode.
- **Bullpen**: Internal AI workforce command layer (manager-only) with summary metrics, attention items, workforce roles, and Automation Rules. Supports multimedia uploads, live voice dictation, structured thread creation, and Bullpen AI synthesis responses via specialized GPT calls.
- **Bullpen Work Queue**: Trigger-driven system scanning Momentum state for signals and creating structured work items for proactive operational management.
- **Bullpen Daily Brief**: Scheduled daily agent review — trigger scan + 3 review passes (operations, client health, pipeline) + GPT synthesis into a morning brief. Auto-runs on configurable AEST cadence (default 8am). Stored in `orgs/{orgId}/bullpenSummaries/{date}`. Scheduler uses an in-memory key (`INTERNAL_SCHEDULER_KEY`) for safe server-to-server calls.
- **Intelligence Enrichment Engine**: Three-pass auto-enrichment for all active leads and clients. Pass 1: identity & presence (GPT: industry, category, location). Pass 2: strategic intelligence (GPT: deal/client summary, next action, urgency). Pass 3: deterministic dependency check (GBP OAuth, Ahrefs API, website field, Local Falcon). Confidence ≥ 0.80 → auto-write to record field; below → stored in `enrichment.*` only. 7-day skip policy. Batch endpoint fires async and stores progress at `orgs/{orgId}/settings/enrichmentBatch`.

### Agent Job System
- **Purpose**: Firestore-backed job queue for dispatching work to OpenClaw specialist agents independently.
- **Firestore path**: `orgs/{orgId}/agentJobs/{jobId}`
- **Job status flow**: `queued → running → completed | failed`
- **Job fields**: `orgId`, `taskType`, `agentId`, `status`, `input`, `output`, `raw`, `error`, `createdAt`, `startedAt`, `completedAt`
- **Task → Agent routing**:
  - `strategy` → `strategy-specialist`
  - `seo` → `seo-specialist`
  - `gbp` → `gbp-specialist`
  - `ads` → `google-ads-specialist`
  - `website` → `website-specialist`
  - (default) → `strategy-specialist`
- **Runner**: Primary path is OpenClaw CLI (`openclaw agent --agent ID --message "..." --json`). Fallback is HTTP POST to `{openclawConfig.baseUrl}/api/agent/run` with `x-openclaw-key` header.
- **Module files**: `server/agent-jobs/types.ts`, `router.ts`, `runner.ts`, `processor.ts`, `firestore-helpers.ts`
- **API routes**:
  - `POST /api/agent-jobs` — create a queued job (requires org access)
  - `GET /api/agent-jobs` — list jobs (manager only)
  - `GET /api/agent-jobs/:jobId` — get job status (manager only)
  - `POST /api/agent-jobs/:jobId/process` — trigger processing (manager only)

## External Dependencies

### Database
- **Firebase Firestore**: Main NoSQL database for application data, supporting multi-tenancy.

### AI Integration
- **OpenAI API**: Provides AI capabilities, primarily GPT-4o-mini.
- **OpenClaw API**: External AI orchestration layer for inbound calls to Momentum's API.

### Authentication & Authorization
- **Firebase Authentication**: Manages user authentication (Google Sign-In, Email/Password).

### Third-Party APIs
- **Google Places API**: Used for business research.
- **Australian Business Register (ABR) API**: Provides Australian business data.
- **Web Speech API**: Enables voice dictation functionality.
- **Local Falcon API**: Integrates GBP rank tracking services.
- **Google Business Profile API**: Facilitates management of Google Business Profiles, including reviews.