# Momentum Agent

## Overview
Momentum Agent is an AI-assisted sales operating system designed to transform daily sales activities into consistent pipeline momentum. It functions as a productivity-focused admin dashboard, offering features such as a Kanban-style pipeline, activity tracking, nurture automation, and momentum scoring. The application aims to facilitate frictionless logging, reinforce follow-up discipline, and provide stage-aware coaching to enhance sales performance and pipeline growth. Its business vision is to provide a comprehensive, intelligent platform for sales teams, improving efficiency and driving pipeline growth.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **Routing**: Wouter.
- **State Management**: Redux Toolkit for global state, TanStack React Query for server state.
- **Styling**: Tailwind CSS with theming via CSS variables.
- **UI Components**: shadcn/ui library, built on Radix primitives.
- **Design System**: Fixed left sidebar, top bar, main content area, and right drawer overlay, emphasizing information density and clarity.

### Backend
- **Runtime**: Node.js with Express, written in TypeScript.
- **API**: RESTful endpoints prefixed with `/api`.
- **Serving**: Express serves static frontend assets in production.

### Data Layer
- **Primary Database**: Firebase Firestore for all live application data.
- **Live State**: Leads and clients synced via `onSnapshot` listeners, feeding Redux state.
- **AI Output Storage**: Latest AI output snapshot on the entity document, plus immutable history records in `engineHistory/{runId}` subcollection.

### AI Integration & Agent Orchestration
- **Role-Aware Agent Architecture**: "Bullpen" command layer for `owner`/`admin` roles, and "My Work" page for `bullpenWork` items.
- **Agent Job System**: Firestore-backed job queue for dispatching tasks to specialist agents, including idempotency, dependency chains, and retry/backoff mechanisms.
- **Autopilot Orchestrator**: Proactive agent job scanner managing task queues and back-pressure.
- **First-Open Lead Orchestration**: Rapid evidence gathering and prep-pack generation, followed by deeper background analysis.
- **Proactive Watchdog / Self-Audit System**: Runtime QA layer for detecting workflow bugs, UI-state mismatches, and misleading states, with findings displayed in a `WatchdogPanel`.

### Auth & Security
- **Firebase Authentication**: User identity management and token verification.
- **Middleware**: `verifyFirebaseToken`, `requireOrgAccess`, and `requireManager` for route protection.
- **Firestore Rules**: Deployed via Firebase CLI.

### Lead to Client Conversion System
- **Evidence Bundle Pipeline**: Gathers structured real-world evidence before AI analysis.
- **Conversion Workflow**: Intercepts lead-to-won transitions, showing lead intelligence and allowing scope selection, carrying intelligence into `sourceIntelligence` to create an `activationPlan`.
- **Workstream Generation**: AI generates detailed plans for website (conversion brief, page structure, content, SEO foundations) and GBP (optimisation tasks, content calendar, review strategy).
- **Client Intelligence**: `ClientIntelligencePanel` provides AI-synthesized execution intelligence; `ClientVisibilityBaseline` shows static digital footprint data.
- **Activation Panel**: Displays active workstreams, generation options, and collapsible output sections.

### Core Features
- **Sales Operating System**: Pipeline Management, Conversation Intelligence, Lead & Client Management, Territory System, Nurture System, Activity Tracking, and Momentum Scoring.
- **AI Sales Engine**: 5-section AI layer for stage-aware defaults, conversation intelligence, insights, and email generation.
- **AI Strategy & Research**: Strategy Engine, Leads Research, and Growth Plan Module.
- **AI Engine Suite**: Growth Prescription, Website, SEO, GBP, and Ads Engines for diagnostics and strategic plans.
- **Website Workstream Agent**: Full website blueprint builder with UI tabs for planning, content, SEO, assets, and preview, including copy variant selection and JSON export.
- **Website HTML Generation Engine**: Generates production-ready HTML pages, sitemap.xml, and robots.txt from the blueprint, supporting live iframe preview.
- **Local SEO Page Generator**: AI plans and generates HTML for local service/location pages.
- **SEO Technical Audit**: Enhanced SEO tab with meta-length indicators, Schema Markup viewer, sitemap.xml viewer, and robots.txt viewer.
- **Asset Upload System**: Supports drag-and-drop image uploads for blueprint slots and a freeform gallery.
- **Website ZIP Export & Launch Tab**: Archives all generated site files for download, includes a readiness checklist, custom domain input, and post-launch steps.
- **SEO Preservation Engine**: Four-stage process for analysing, classifying, and managing existing site URLs for SEO preservation, including doorway page detection, technical SEO audits, and internal link mapping.
- **SEO Transparency + Comparison Engine**: Compares the new site's SEO performance against the existing site, providing confidence/risk scores, status distribution, and detailed before/after statistics.
- **Keyword Strategy Engine**: Imports keywords, clusters them by intent, maps to target pages, identifies quick wins, and generates comprehensive SEO, GBP, and 12-week execution strategies.
- **AI Growth Operator**: Framework for automating growth activities with per-client automation modes and an AI Actions Feed.
- **AI Growth Operator Daily Brief**: Portfolio-level morning briefing for managers.
- **Autopilot Execution**: One-click auto-approval for queued AI actions.
- **Bullpen Work Queue**: Trigger-driven system for proactive operational management.
- **Bullpen Daily Brief**: Scheduled daily agent review and GPT synthesis into a morning brief.
- **Intelligence Enrichment Engine**: Three-pass auto-enrichment for leads and clients.

### AI Systems Integration Layer
- **Architecture**: Modular, production-grade server-to-server REST integration between Momentum (upstream) and AI Systems (downstream).
- **Core Services**: Provisioning, audit logging, status polling, and typed patching.
- **Key Rules**: Uses `provisioningRequestId` for idempotency, follows an 8-stage lifecycle, and enforces field ownership.
- **Frontend**: `ProvisioningPanel.tsx` for readiness checks, scope editing, lifecycle display, action buttons, and audit log viewing.

## External Dependencies

### Database
- **Firebase Firestore**: Main NoSQL database.

### AI Integration
- **OpenAI API**: Provides AI capabilities.
- **OpenClaw API**: External AI orchestration layer.

### Authentication & Authorization
- **Firebase Authentication**: Manages user authentication.

### Third-Party APIs
- **Google Places API**: Used for business research.
- **Australian Business Register (ABR) API**: Provides Australian business data.
- **Web Speech API**: Enables voice dictation.
- **Local Falcon API**: Integrates GBP rank tracking services.
- **Google Business Profile API**: Facilitates management of Google Business Profiles.