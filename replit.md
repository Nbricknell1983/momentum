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
- **Bullpen**: Internal AI workforce command layer, visible only to `owner`/`admin` roles.
- **My Work page** (`/my-work`): Team-facing surface for all users, showing pending `bullpenWork` items.

### Auth & Security
- **Firebase Authentication**: User identity management and token verification.
- **Middleware**: `verifyFirebaseToken`, `requireOrgAccess`, and `requireManager` for route protection.
- **OpenClaw routes**: Use shared-secret `openclawAuth`.
- **Firestore Rules**: Deployed separately via Firebase CLI.

### Evidence Bundle Pipeline
- **Purpose**: Structured real-world evidence gathering before AI analysis.
- **Process**: Orchestrates GBP/Places API discovery, website crawl, social URL extraction, and paid search evidence via Google Ads Transparency Center scraper.
- **Evidence Fields**: Includes detailed website, GBP, social, and paid search data.
- **Delta Tracking**: `computeEvidenceDelta` tracks meaningful changes between evidence bundles, saved to `leads/{leadId}.evidenceDelta`.

### Lead → Client Execution System
- **Conversion Modal**: When a lead is dragged to "Won" in the pipeline, a `ConversionModal` intercepts the drop. Shows lead intelligence highlights (strategy intel, prep pack, growth prescription). Lets user select delivery scope: Website, GBP/Local, SEO, Ads. Carries all lead intelligence into `sourceIntelligence` on the client record. Creates an `activationPlan` with per-workstream status tracking.
- **`ActivationPlan` / `SourceIntelligence`** fields on Client (Firestore): `selectedScope`, `status`, `activatedAt`, per-workstream `WorkstreamState`, `websiteWorkstream`, `gbpWorkstream`. Source intelligence captures: `prepCallPack`, `strategyIntelligence`, `growthPrescription`, `aiGrowthPlan`, industry, website.
- **Website Workstream** (`POST /api/clients/:clientId/website-workstream`): AI generates conversion-focused brief (positioning, UVP, CTA, trust signals), page structure (homepage + service/location pages with SEO metadata), homepage content (hero, services, trust section, FAQ, local section), and SEO foundations. Stored on `client.activationPlan.websiteWorkstream`.
- **GBP Workstream** (`POST /api/clients/:clientId/gbp-workstream`): AI generates 8-12 optimisation tasks (with priority, category, action steps, timeline, impact), 8-week content calendar, category recommendations, and review strategy. Stored on `client.activationPlan.gbpWorkstream`.
- **`ClientIntelligencePanel`**: Placed immediately after `ClientOverviewStrip` at the top of `ClientGrowthIntelligencePanel`. AI-synthesized execution intelligence covering presence snapshot, market context, website interpretation, growth opportunities, risks/gaps, execution strategy, and delivery priorities. Auto-fires `POST /api/clients/:clientId/intelligence-brief` at 1200ms on workspace open (48h cache). Shows animated skeleton while generating. TAKEOVER banner + SEO preservation risks shown when client has existing website. `briefRunning` + `refetchBrief` exposed from `useClientAutoFire`.
- **`ClientVisibilityBaseline`**: Static digital footprint panel below ClientIntelligencePanel. Shows website URL + health engine data, SEO preservation checklist (when website rebuild in scope), GBP baseline, search keyword signals, social presence pills, and source intelligence context.
- **`ClientIntelligenceBrief` type** on `Client`: `{ presenceSnapshot, marketContext, websiteInterpretation?, opportunities[], risks[], executionStrategy, deliveryPriorities[], isTakeover, generatedAt }`. Stored on `client.intelligenceBrief`.
- **`POST /api/clients/:clientId/intelligence-brief`**: GPT-4o-mini (max_tokens 2000), synthesizes websiteEngine, seoEngine, gbpEngine, adsEngine, sourceIntelligence (prepCallPack, strategyIntelligence, growthPrescription), scopeAudit, channelStatus. Cached 48h server-side. Preservation-aware for takeover clients.
- **`ClientActivationPanel`**: Shown at the top of `ClientGrowthIntelligencePanel` when `client.activationPlan` exists. Displays active workstreams with status pills, Generate buttons per workstream, and collapsible output sections (brief, page structure, homepage content, GBP tasks, content calendar, category recommendations, review strategy). GBP task completion is tracked via checkboxes and persisted to Firestore. SEO Migration Plan section shown for takeover clients with `preservationPlan` from website-workstream output.
- **`PATCH /api/clients/:clientId/activation-plan`**: Generic activation plan update endpoint.

### Core Features
- **Sales Operating System**: Pipeline Management (Kanban, Lead Focus View), Conversation Intelligence, Lead & Client Management, Territory System, Nurture System, Activity Tracking, and Momentum Scoring.
- **AI Sales Engine**: 5-section AI layer powered by GPT-4o-mini for stage-aware defaults, conversation intelligence, insights, and email generation.
- **AI Strategy & Research**: Strategy Engine, Leads Research, and Growth Plan Module.
- **Client Application Integration**: Connects external client business applications.
- **AI Meeting Notes System**: AI-powered meeting notes processing with voice dictation.
- **Client-Facing Reports**: Digital Visibility Strategy and Client Growth Report.
- **AI Growth Operator**: Framework for automating growth activities with per-client automation modes and an AI Actions Feed.
- **AI Engine Suite**: Growth Prescription, Website, SEO, GBP, and Ads Engines for diagnostics and strategic plans.
- **Growth Playbook**: Library of 8 pre-built growth plays.
- **Learning Insights**: AI-generated analysis of client growth operations.
- **AI Growth Operator Daily Brief**: Portfolio-level morning briefing for managers.
- **Autopilot Execution**: One-click auto-approval for queued AI actions.
- **Bullpen Work Queue**: Trigger-driven system for proactive operational management.
- **Bullpen Daily Brief**: Scheduled daily agent review and GPT synthesis into a morning brief.
- **Intelligence Enrichment Engine**: Three-pass auto-enrichment for leads and clients, identifying industry, category, location, strategic intelligence, and deterministic dependencies.

### Proactive Watchdog / Self-Audit System
- **Purpose**: Runtime QA layer that detects workflow bugs, UI-state mismatches, and misleading fallback states automatically — without waiting for the user to notice.
- **Core function**: `client/src/lib/watchdog.ts` → `runWatchdog(WatchdogInput): WatchdogFinding[]` — pure function, no network calls.
- **UI**: `WatchdogPanel` component renders in the specialist queue (bottom of `DealLiveActivityFeed`) when findings exist. Collapsible with severity count badges. Per-finding dismiss. Session-scoped.
- **Triggers**: Recomputes via `useMemo` on every 8s tick + on key running-state transitions (prepRunning, xrayRunning, etc.).
- **Detection scenarios**: evidence bundle ↔ sourceData mismatch, truncated prep pack (missing sections), stuck X-Ray/SERP/Prep (>90-120s), Strategy Diagnosis not triggered despite deps done, prep fired but no data (silent failure), lead has website but X-Ray never fired, crawl error in evidence, NBS empty despite evidence, stale evidence bundle not refreshed.
- **WatchdogFinding shape**: `{ id, severity, confidence, category, summary, likelyCause, recommendedFix, evidence[] }`
- **Categories**: `ui-state-mismatch | fallback-copy | orchestration | auth | prompt-output | data-pipeline | workflow-friction`

### First-Open Lead Orchestration (Two-Speed)
- **Phase 1 — Fast first pass (auto, ~300–500ms)**: On lead open, `DealLiveActivityFeed` fires `gather-evidence` at 300ms (if no evidence or evidence >24h stale) and `generate-prep-pack` at 500ms (if pack missing or >24h stale). Both fire in parallel; the server's `gatherEvidenceBundle` call inside prep-pack is idempotent so a race is safe.
- **Phase 2 — Deeper background analysis (auto, 800ms+)**: Website X-Ray fires at 800ms, SERP at 1500ms, Strategy Diagnosis when both complete. These continue asynchronously while Phase 1 output is already visible.
- **`AnalysisState` type**: `'idle' | 'queued' | 'scanning' | 'initial-ready' | 'deepening' | 'complete' | 'failed'` — derived in `DealLiveActivityFeed` from running booleans + data presence. Drives state-aware header copy ("Gathering signals…" / "Deepening analysis…" / "First pass ready" / "All specialists done").
- **Idempotency**: All auto-fires use `useRef` flags (`autoEvidenceFired`, `autoPrepFired`, etc.) — never re-fire within the same mount. Fresh leads (evidence <24h, prep <24h) skip auto-fires entirely.
- **Prep Specialist card**: Shows `running` while either `evidenceRunning` or `prepRunning`. Task text is state-aware: "Gathering presence signals and building action plan…" during Phase 1.
- **NBS empty state**: No longer shows "Prepare Action Plan" as a primary CTA gateway. Shows passive "Refresh next steps" retry button — auto-NBS always fires first; the empty state only appears when it completed with insufficient data.
- **Provisional NBS** (`provisional: true`): Fast-path endpoint mode on `POST /api/leads/:leadId/next-best-steps`. Skips `gatherEvidenceBundle`, uses existing `lead.evidenceBundle` from Firestore. Generates 2-3 quick steps with lighter prompt (max_tokens 900). Does NOT write to Firestore — full NBS overwrites when it lands. Frontend fires provisional auto at mount; full NBS fires concurrently. `NextBestStepsCard` shows provisional steps with amber "Preliminary · refining" banner until full NBS replaces them via Firestore onSnapshot.
- **Right rail progressive copy**: Stage task text is now state-aware — pending stages show what they're waiting for ("Waiting for site review…", "Waiting for website and search signals…") rather than static descriptions. Pending opacity reduced to 40% (from 50%). "Up next" badge → "In queue".

### Agent Job System
- **Purpose**: Firestore-backed job queue for dispatching work to OpenClaw specialist agents.
- **Task → Agent routing**: Routes tasks like `strategy`, `seo`, `gbp`, `ads`, `website` to corresponding specialists.
- **Runner**: OpenClaw CLI or HTTP POST to OpenClaw API.

## External Dependencies

### Database
- **Firebase Firestore**: Main NoSQL database.

### AI Integration
- **OpenAI API**: Provides AI capabilities (GPT-4o-mini).
- **OpenClaw API**: External AI orchestration layer.

### Authentication & Authorization
- **Firebase Authentication**: Manages user authentication.

### Third-Party APIs
- **Google Places API**: Used for business research.
- **Australian Business Register (ABR) API**: Provides Australian business data.
- **Web Speech API**: Enables voice dictation.
- **Local Falcon API**: Integrates GBP rank tracking services.
- **Google Business Profile API**: Facilitates management of Google Business Profiles.