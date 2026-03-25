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
- **AI Output Storage**: Latest AI output snapshot on the entity document, plus immutable history records.

### AI Integration & Agent Orchestration
- **Role-Aware Agent Architecture**: "Bullpen" command layer for `owner`/`admin` roles, and "My Work" page for `bullpenWork` items.
- **Agent Job System**: Firestore-backed job queue for dispatching tasks to specialist agents, including idempotency, dependency chains, and retry/backoff mechanisms.
- **Autopilot Orchestrator**: Proactive agent job scanner managing task queues and back-pressure.
- **Proactive Watchdog / Self-Audit System**: Runtime QA layer for detecting workflow bugs and UI-state mismatches.

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

### Client Portal Access Layer
- **Domain Model**: Defines typed interfaces for portal share links, invites, access logs, visibility rules, digest schedules, and client portal configurations.
- **Digest Adapter**: Transforms `ClientDashboardState` into a structured `ClientUpdateDigest` without AI or API calls.
- **Portal Admin Panel**: Internal admin panel for managing links, invites, visibility, digest schedules, and audit logs.
- **Portal Share Page**: Public client-facing portal at `/share/:token` rendering stripped client data.
- **Server Routes**: Public and protected routes for managing portal configurations, share links, invites, visibility rules, and digest schedules.
- **Route Architecture**: `/share/:token` is fully accessible without login.

### Client Command Centre
- **Domain Model**: Defines client-facing types for dashboard state, delivery summaries, performance summaries, health scores, milestones, and next actions.
- **Adapter Layer**: Transforms existing `Client` fields into a simplified, client-safe `ClientDashboardState` with zero AI or API calls.
- **ClientCommandCentre Panel**: 5-tab premium client-facing dashboard (Overview, Delivery, Performance, Milestones, Your Actions). Includes health score, delivery phase, channel cards, milestone timeline, performance metrics, optimisation activity, and strategy alignment.
- **ClientFocusView Integration**: Tab switcher between "Account Intelligence" and "Command Centre", with a "Portal Preview" button.
- **Client Portal Page**: Full-page client portal preview at `/portal/:clientId` with branded header and embedded command centre.
- **Rules**: No raw data, jargon, or internal states surfaced to client; content is outcome-focused and simplified.

### AI Systems Integration Layer
- **Architecture**: Modular, production-grade server-to-server REST integration between Momentum (upstream) and AI Systems (downstream).
- **Core Services**: Provisioning, audit logging, status polling, and typed patching.
- **Key Rules**: Uses `provisioningRequestId` for idempotency, follows an 8-stage lifecycle, and enforces field ownership.
- **Frontend**: `ProvisioningPanel.tsx` for readiness checks, scope editing, lifecycle display, action buttons, and audit log viewing.

### Client-Facing Strategy Experience Layer
- **Domain Model**: Defines typed interfaces for strategy documents, reports, and presentations.
- **Adapter Layer**: Transforms Lead intelligence into a `StrategyDocument` and `StrategyDiagnosis` without AI calls.
- **Admin Panel**: Manages strategy report generation, sharing, and versioning.
- **Server Routes**: Handle strategy report generation, revocation, locking, and snapshot retrieval.
- **LeadFocusView**: Includes an "Onboarding" tab in addition to Deal Intelligence, Visibility Gaps, Growth Plan, Sales Actions, Readiness, and ROI Calculator.
- **Presentation layer**: Serves the public-facing report, compatible with adapter output, including scope acceptance and ROI simulation.

### Proposal Acceptance → Onboarding → Provisioning Flow
- **Domain Model**: Defines typed interfaces for the full lifecycle, including proposal status, module selection, onboarding capture, readiness results, provisioning trigger state, and onboarding state.
- **UI Panel**: `OnboardingTransitionPanel.tsx` provides a 4-step guided panel for scope selection, data capture, readiness assessment, and handoff/provisioning.
- **Server Routes**: Manage the `onboardingState` field on the Lead Firestore document, including retrieval, patching, and acceptance, with full audit trails.
- **Module Catalogue**: 9 defined modules: website, seo, gbp, google_ads, content, local_seo, telemetry, autopilot, portal_access.
- **Status lifecycle**: `strategy_presented → proposal_pending → proposal_accepted → onboarding_in_progress → onboarding_ready → provisioning → provisioned`.

### Sales Execution Layer
- **Domain Model**: Extends `salesIntelligenceTypes.ts` with models for `SalesMeetingPrep`, `SalesFollowUpRecommendation`, `StageActionPlan`, and `PipelineMomentumScore`.
- **Static Objection Bank**: Contains scripted objection patterns with detailed response guidance.
- **Derivation functions**: Pure functions derive meeting prep, follow-up recommendations, stage action plans, pipeline momentum scores, and applicable objections from existing Lead data without AI calls.
- **SalesExecutionHub**: A 4-section hub replacing the "Sales Actions" tab in LeadFocusView, featuring Actions, Meeting Prep, Objections, and Follow-up Guide.
- **PipelineMomentumPanel**: Offers a portfolio-level momentum view with summary tiles, a filterable lead list, and trajectory/urgency indicators.

### Sales Intelligence UX Layer
- **Domain Model**: Defines typed models for `OpportunityAssessment`, `VisibilityGapSummary`, `MarketOpportunitySummary`, `SalesNextBestAction`, `ProposalReadiness`, `HandoffReadiness`, `SalesConversationState`, and `ProvisioningReadiness`, all derived on-the-fly.
- **Lead Focus View** (enhanced): Provides a 6-tab command workspace: Deal Intelligence, Visibility Gaps, Growth Plan, Sales Actions, Readiness, ROI Calculator.
- **Visibility Gap Panel**: Offers premium gap analysis UI with scores, gap cards, trust signal checklist, and opportunity dimension breakdown.
- **Digital Growth Plan Panel**: Presents a strategy-led plan view with urgency diagnosis, growth barriers, recommended product stack, priority actions, investment tiers, and outcome forecasts.
- **Sales Next Best Action Panel**: Provides a stage/conversation-aware NBA engine with NEPQ-style questions, conversation state tracking, objection handling, and follow-up scripts.
- **Proposal & Handoff Readiness Panel**: A 3-tab readiness system covering Proposal Readiness, Handoff Readiness, and Provisioning.

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