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

### AI Integration & Agent Orchestration
- **Role-Aware Agent Architecture**: Internal AI workforce command layer ("Bullpen") visible to `owner`/`admin` roles, with a team-facing "My Work" page for pending `bullpenWork` items.
- **Agent Job System**: Firestore-backed job queue for dispatching tasks (`strategy`, `seo`, `gbp`, `ads`, `website`, `growth_prescription`, `enrichment`, `prep`) to OpenClaw specialist agents. Includes idempotency, dependency chains, retry/backoff mechanisms, and dual-writing of results.
- **Autopilot Orchestrator**: Proactive agent job scanner that runs on a schedule, enqueues overdue jobs, and manages back-pressure.
- **First-Open Lead Orchestration (Two-Speed)**: Orchestrates evidence gathering and prep-pack generation rapidly on lead open, followed by deeper background analysis (X-Ray, SERP, Strategy Diagnosis).
- **Proactive Watchdog / Self-Audit System**: Runtime QA layer (`runWatchdog`) that detects workflow bugs, UI-state mismatches, and misleading fallback states. Findings are displayed in a `WatchdogPanel`.

### Auth & Security
- **Firebase Authentication**: User identity management and token verification.
- **Middleware**: `verifyFirebaseToken`, `requireOrgAccess`, and `requireManager` for route protection.
- **Firestore Rules**: Deployed separately via Firebase CLI.

### Lead to Client Conversion System
- **Evidence Bundle Pipeline**: Gathers structured real-world evidence (GBP/Places API, website crawl, social URLs, paid search) before AI analysis, tracking deltas.
- **Conversion Workflow**: Intercepts lead-to-won pipeline transitions, showing lead intelligence and allowing scope selection (Website, GBP/Local, SEO, Ads). Carries intelligence into `sourceIntelligence` on the client record, creating an `activationPlan`.
- **Workstream Generation**: AI generates detailed plans for website (conversion brief, page structure, content, SEO foundations) and GBP (optimisation tasks, content calendar, category recommendations, review strategy).
- **Client Intelligence**: `ClientIntelligencePanel` provides AI-synthesized execution intelligence (presence snapshot, market context, website interpretation, opportunities, risks, execution strategy, delivery priorities). `ClientVisibilityBaseline` shows static digital footprint data.
- **Activation Panel**: Displays active workstreams, generation options, and collapsible output sections for each workstream.

### Core Features
- **Sales Operating System**: Pipeline Management (Kanban, Lead Focus View), Conversation Intelligence, Lead & Client Management, Territory System, Nurture System, Activity Tracking, and Momentum Scoring.
- **AI Sales Engine**: 5-section AI layer for stage-aware defaults, conversation intelligence, insights, and email generation.
- **AI Strategy & Research**: Strategy Engine, Leads Research, and Growth Plan Module.
- **AI Engine Suite**: Growth Prescription, Website, SEO, GBP, and Ads Engines for diagnostics and strategic plans.
- **Website Workstream Agent**: Full website blueprint builder (`website_workstream` task type) — Zod-validated `WebsiteBlueprint` with siteMeta, nav, footer, pages, assets, and performance spec. UI has 6 tabs (Plan, Pages, Copy, SEO, Assets, Preview) with copy variant selection, Accept Plan, history drawer, and JSON export. Dual-writes to `client.websiteWorkstream.currentDraft` + `engineHistory`. Agent ID: `website-workstream-specialist`. TTL: 48h. Deps: strategy, website_xray, serp, growth_prescription. Section preview components in `client/src/components/sections/`.
- **Website HTML Generation Engine**: `POST /api/clients/:clientId/generate-site` — Takes the Blueprint and generates production-ready HTML per page via GPT-4o. Includes Tailwind CSS via CDN, Google Fonts, SEO meta, Schema JSON-LD, nav, footer, responsive layout. Also generates `sitemap.xml` and `robots.txt`. Stored in `client.websiteWorkstream.generatedSite.pages[slug].html`. Preview served at `GET /api/clients/:clientId/site-preview/:slug?orgId=`. Live iframe preview with desktop/mobile toggle in WebsiteWorkstreamPanel.tsx Preview tab. "Build Site" button triggers generation. Sitemap also available at `GET /api/clients/:clientId/sitemap.xml?orgId=`.
- **Local SEO Page Generator**: `POST /api/clients/:clientId/generate-local-pages` — Two-step AI process: GPT-4o-mini plans up to 12 local pages (service, location, combo types) from GBP/SEO data; GPT-4o generates full production HTML for each. Stored in `websiteWorkstream.generatedSite.localPages`. Preview at `GET /api/clients/:clientId/local-preview/:slug`. Sitemap auto-updated. "Local" tab in WebsiteWorkstreamPanel with page cards, type badges, and iframe preview.
- **SEO Technical Audit**: SEO tab enhanced with meta-length indicators (title 30–60, description 70–160), collapsible Schema Markup (JSON-LD) viewer per page, collapsible sitemap.xml viewer with URL count and copy button, collapsible robots.txt viewer with copy button.
- **Asset Upload System**: `POST /api/clients/:clientId/upload-asset` — stores base64 image dataURLs in `websiteWorkstream.assets.{key}` (5 MB limit). `DELETE /api/clients/:clientId/upload-asset/:key` removes a slot. Gallery: `POST` with `isGallery: true` appends to `_gallery[]`; `DELETE /api/clients/:clientId/upload-gallery/:index` removes by index. Assets tab now has drag-and-drop upload per blueprint slot, thumbnail preview, "✓ Uploaded" badge, replace/remove buttons, and freeform gallery grid.
- **Website ZIP Export & Launch Tab**: `GET /api/clients/:clientId/export-site.zip` — archives all HTML pages, local pages, sitemap.xml, robots.txt, decoded asset images, gallery images, README.md, _redirects (Netlify), redirects.htaccess (Apache), SEO-PRESERVATION-REPORT.md, and INTERNAL-LINK-MAP.md using `archiver`. `POST /api/clients/:clientId/set-custom-domain` saves domain to `websiteWorkstream.customDomain`. "Launch" tab shows 10-point readiness score/checklist (including SEO preservation + GBP alignment checks), pre-launch gate banner from tech audit, custom domain input, Download ZIP button, DNS setup steps, Google Search Console setup steps, and 10-item post-launch checklist.
- **SEO Preservation Engine (4 stages)**: "Preserve" tab between SEO and Local tabs in WebsiteWorkstreamPanel. Stage 1: `POST /analyse-urls` — sitemap crawl, manual URL, Ahrefs CSV ingestion; GPT-4o-mini classifies each URL into page records (riskLevel HIGH/MEDIUM/LOW, recommendedAction KEEP/REDIRECT/CONSOLIDATE/REBUILD_SAME_URL/REVIEW, targetKeyword, pageType, notes); stores at `websiteWorkstream.seoPreservation`; includes GBP alignment scoring and defensiveMode banner. `PATCH /seo-preservation/page` and `POST/DELETE /seo-preservation/redirect` allow editing. Stage 2: `POST /detect-doorway-pages` — GPT-4o-mini scans local pages for THIN_CONTENT, DOORWAY_RISK, DUPLICATION_RISK, KEYWORD_STUFFING; stores at `seoPreservation.doorwayDetection`. Stage 3: `POST /tech-seo-audit` — HTML regex checks for title length, meta description length, H1 presence, canonical tag, JSON-LD schema, viewport meta, Open Graph tags; computes per-page score and pass rate; includes pre-launch gate (blocks launch when high-risk pages lack redirects or critical SEO issues exist); stores at `seoPreservation.techAudit`. Stage 4: `POST /build-link-map` — scans href patterns in HTML to build internal link graph; identifies orphan pages (0 inbound), weakly linked pages (1 inbound); GPT-4o-mini generates anchor text recommendations; stores at `seoPreservation.linkMap`. ZIP export includes all preservation files.
- **AI Growth Operator**: Framework for automating growth activities with per-client automation modes and an AI Actions Feed.
- **AI Growth Operator Daily Brief**: Portfolio-level morning briefing for managers.
- **Autopilot Execution**: One-click auto-approval for queued AI actions.
- **Bullpen Work Queue**: Trigger-driven system for proactive operational management.
- **Bullpen Daily Brief**: Scheduled daily agent review and GPT synthesis into a morning brief.
- **Intelligence Enrichment Engine**: Three-pass auto-enrichment for leads and clients.

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