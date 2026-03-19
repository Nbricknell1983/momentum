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

### Auth & Security
- **Firebase Authentication**: All user identity comes from Firebase ID tokens verified server-side.
- **Token Verification**: `verifyFirebaseToken` middleware applied globally to all `/api/` routes.
- **Org Access**: `requireOrgAccess` middleware verifies Firestore membership.
- **Manager Gate**: `requireManager` enforces `owner`/`admin` role for sensitive operations.
- **OpenClaw routes**: Use shared-secret `openclawAuth` instead of Firebase token.
- **Firestore Rules**: Deployed separately via Firebase CLI, covering all org collections.
- **Control-Plane Config**: `automationRules` and `openclawConfig` are validated with Zod and written only through server routes with an audit trail.

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