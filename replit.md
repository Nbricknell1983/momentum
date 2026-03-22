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

### First-Open Lead Orchestration (Two-Speed)
- **Phase 1 — Fast first pass (auto, ~300–500ms)**: On lead open, `DealLiveActivityFeed` fires `gather-evidence` at 300ms (if no evidence or evidence >24h stale) and `generate-prep-pack` at 500ms (if pack missing or >24h stale). Both fire in parallel; the server's `gatherEvidenceBundle` call inside prep-pack is idempotent so a race is safe.
- **Phase 2 — Deeper background analysis (auto, 800ms+)**: Website X-Ray fires at 800ms, SERP at 1500ms, Strategy Diagnosis when both complete. These continue asynchronously while Phase 1 output is already visible.
- **`AnalysisState` type**: `'idle' | 'queued' | 'scanning' | 'initial-ready' | 'deepening' | 'complete' | 'failed'` — derived in `DealLiveActivityFeed` from running booleans + data presence. Drives state-aware header copy ("Gathering signals…" / "Deepening analysis…" / "First pass ready" / "All specialists done").
- **Idempotency**: All auto-fires use `useRef` flags (`autoEvidenceFired`, `autoPrepFired`, etc.) — never re-fire within the same mount. Fresh leads (evidence <24h, prep <24h) skip auto-fires entirely.
- **Prep Specialist card**: Shows `running` while either `evidenceRunning` or `prepRunning`. Task text is state-aware: "Gathering presence signals and building action plan…" during Phase 1.
- **NBS empty state**: No longer shows "Prepare Action Plan" as a primary CTA gateway. Shows passive "Refresh next steps" retry button — auto-NBS always fires first; the empty state only appears when it completed with insufficient data.

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