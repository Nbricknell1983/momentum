# Momentum Agent

## Overview
Momentum Agent is an AI-assisted sales operating system designed to transform daily sales activities into consistent pipeline momentum. It functions as a productivity-focused admin dashboard, offering features such as a Kanban-style pipeline, activity tracking, nurture automation, and momentum scoring. The application aims to facilitate frictionless logging, reinforce follow-up discipline, and provide stage-aware coaching to enhance sales performance and pipeline growth. Its business vision is to provide a comprehensive, intelligent platform for sales teams, improving efficiency and driving pipeline growth, and unlocking significant market potential by streamlining sales operations.

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
- **AI Output Storage**: Latest AI output snapshot on the entity document, plus immutable history records.

### AI Integration & Agent Orchestration
- **Role-Aware Agent Architecture**: "Bullpen" command layer for `owner`/`admin` roles, and "My Work" page for `bullpenWork` items.
- **Agent Job System**: Firestore-backed job queue for dispatching tasks to specialist agents, including idempotency, dependency chains, and retry/backoff mechanisms.
- **Autopilot Orchestrator**: Proactive agent job scanner managing task queues and back-pressure.
- **Proactive Watchdog / Self-Audit System**: Runtime QA layer for detecting workflow bugs and UI-state mismatches.
- **AI Sales Engine**: 5-section AI layer for stage-aware defaults, conversation intelligence, insights, and email generation.
- **AI Strategy & Research**: Strategy Engine, Leads Research, and Growth Plan Module.
- **AI Engine Suite**: Growth Prescription, Website, SEO, GBP, and Ads Engines for diagnostics and strategic plans.

### Auth & Security
- **Firebase Authentication**: User identity management and token verification.
- **Middleware**: `verifyFirebaseToken`, `requireOrgAccess`, and `requireManager` for route protection.
- **Firestore Rules**: Deployed via Firebase CLI.

### Core Features
- **Sales Operating System**: Pipeline Management, Conversation Intelligence, Lead & Client Management, Territory System, Nurture System, Activity Tracking, and Momentum Scoring.
- **Website Workstream Agent**: Full website blueprint builder with UI tabs for planning, content, SEO, assets, and preview, including copy variant selection and JSON export.
- **Website HTML Generation Engine**: Generates production-ready HTML pages, sitemap.xml, and robots.txt from the blueprint, supporting live iframe preview.
- **SEO Preservation Engine**: Four-stage process for analysing, classifying, and managing existing site URLs for SEO preservation, including doorway page detection, technical SEO audits, and internal link mapping.
- **SEO Transparency + Comparison Engine**: Compares the new site's SEO performance against the existing site, providing confidence/risk scores, status distribution, and detailed before/after statistics.
- **Keyword Strategy Engine**: Imports keywords, clusters them by intent, maps to target pages, identifies quick wins, and generates comprehensive SEO, GBP, and 12-week execution strategies.
- **AI Growth Operator**: Framework for automating growth activities with per-client automation modes and an AI Actions Feed.
- **Autopilot Execution**: One-click auto-approval for queued AI actions.
- **Bullpen Work Queue**: Trigger-driven system for proactive operational management.
- **Intelligence Enrichment Engine**: Three-pass auto-enrichment for leads and clients.
- **Manager Daily Briefing Layer**: Pure derivation engine generating a daily operational briefing from all existing layers, with priority classification (critical/urgent/important/watchlist), section-based layout (approvals/risks/opportunities/blocked/watchlist), change detection vs previous snapshots, review tracking, Firestore persistence, and a debug/inspection log explaining every inclusion and exclusion decision. Accessible at `/briefing`.
- **Unified Cross-System Operations View**: Operator console combining Momentum (sales-side) and AI Systems (delivery-side) into one command surface. Includes a typed cross-system domain model (`unifiedOpsTypes.ts`), an AI Systems summary adapter deriving delivery-side state from Momentum-synced fields (`aiSystemsAdapter.ts`), a unified ops adapter with lifecycle stage classification and bottleneck/stall detection (`unifiedOpsAdapter.ts`), and a premium operator UX with lifecycle flow bar, cross-system bottlenecks, entity health/drilldown grid, recent milestones, and an inspect panel. Accessible at `/unified-ops`.

### Client Portal & Command Centre
- **Client Portal Access Layer**: Defines models for portal share links, invites, access logs, visibility rules, digest schedules, and client portal configurations, with an admin panel and public share page (`/share/:token`).
- **Client Command Centre**: Client-facing dashboard with a simplified view of performance, delivery, and milestones, avoiding jargon and raw data. Accessible at `/portal/:clientId`.

### AI Systems Integration Layer
- **Architecture**: Modular, production-grade server-to-server REST integration with provisioning, audit logging, status polling, and typed patching, ensuring idempotency and an 8-stage lifecycle.

### Client-Facing Strategy Experience Layer
- **Domain Model**: Defines typed interfaces for strategy documents, reports, and presentations, transforming Lead intelligence without AI calls. Includes a presentation layer for public reports with scope acceptance and ROI simulation.

### Proposal Acceptance → Onboarding → Provisioning Flow
- **Workflow**: Guided 4-step panel for scope selection, data capture, readiness assessment, and handoff/provisioning, supporting 9 defined modules (website, seo, gbp, google_ads, content, local_seo, telemetry, autopilot, portal_access).
- **Status Lifecycle**: Tracks proposal from `strategy_presented` to `provisioned`.

### Expansion Engine
- **Functionality**: Derives `AccountGrowthSignal`, `ExpansionOpportunity`, `ChurnRiskSignal`, `ReferralOpportunity`, `ExpansionNextBestAction`, and `ExpansionPlay` from live client data without AI calls.
- **Key Features**: Upsell/Cross-sell engine, Churn-Risk detection, Referral Timing engine, and a 6-tab premium workspace for account managers.

### Scheduled Sweeps + Background Automation Runner
- **Core Functionality**: Server-side orchestrator for scheduled sweeps, processing leads and clients, applying autopilot policies, and managing actions with deduplication and suppression logic.
- **Safety Guarantees**: Never auto-sends external communications; high/medium-risk actions require approval by default. All sweeps, actions, and suppressions are auditable.

### Autopilot Policy Layer
- **Policy Engine**: Pure deterministic classifier that evaluates rules based on safety level, escalation conditions, and global mode overrides, providing transparent decision explanations.
- **Default Safe State**: Global mode defaults to `approval_only`; nothing auto-runs until explicitly enabled.

### Referral Engine
- **Referral Adapter**: Derives referral readiness signals and appropriate ask styles from live client data, generating conversation angles and evidence points.
- **Ask Tracking**: Persisted to Firestore, tracking referral asks through their lifecycle.

### Automation Execution Layer
- **Channel Adapters**: Provides explicit boundaries for communication channels (Email, SMS, Call, Voicemail) with clear documentation for integration upgrades.
- **Approval Flow**: All communication items require human approval before sending; all sends are auditable.

### Executive Reporting Layer
- **Dashboard**: A 5-tab leadership dashboard providing KPIs, risks, opportunities, bottlenecks, alerts, watchlists, and pipeline/account snapshots, derived from live Redux data.

### Communication Drafting Layer
- **Drafting System**: Generates entity-specific communication drafts across 4 channels for 12 communication intents, driven by a context builder and template engine.

### Cadence + Automation Layer
- **Rule Engine**: 14 derivation rules for generating reminders based on lead/client status, inactivity, and other key signals.

### Sales Execution Layer
- **Tools**: Provides `SalesMeetingPrep`, `SalesFollowUpRecommendation`, `StageActionPlan`, and `PipelineMomentumScore`, derived from existing Lead data without AI calls. Includes a static objection bank.

### Sales Intelligence UX Layer
- **Lead Focus View**: Enhanced 6-tab command workspace including Deal Intelligence, Visibility Gaps, Growth Plan, Sales Actions, Readiness, and ROI Calculator.

## External Dependencies

### Database
- **Firebase Firestore**: Main NoSQL database.

### AI Integration
- **OpenAI API**: Provides core AI capabilities.
- **OpenClaw API**: External AI orchestration layer.

### Authentication & Authorization
- **Firebase Authentication**: Manages user authentication.

### Third-Party APIs
- **Google Places API**: Used for business research.
- **Australian Business Register (ABR) API**: Provides Australian business data.
- **Web Speech API**: Enables voice dictation.
- **Local Falcon API**: Integrates GBP rank tracking services.
- **Google Business Profile API**: Facilitates management of Google Business Profiles.