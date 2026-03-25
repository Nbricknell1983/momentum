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

### Referral Engine
- **Domain Model** (`referralTypes.ts`): Defines `ReferralReadinessSignal`, `ReferralCandidate`, `ReferralAsk`, `ReferralLeadLink`, `ReferralMomentumState`, `ReferralEvidence`. Six ask styles: `milestone_based`, `direct_intro`, `who_else`, `soft_mention`, `testimonial_bridge`, `follow_up`.
- **Referral Adapter** (`referralAdapter.ts`): Pure derivation from live client data. Scores each client 0–100 across 6 weighted signals (health, delivery, churn risk, contact timing, live channels, upsell readiness). Selects the most appropriate ask style, generates conversation angle and evidence points, and flags suppression reasons when conditions are not right.
- **ReferralWorkspace** (`ReferralWorkspace.tsx`): Premium 5-tab workspace: Overview (program summary + hot candidates), Candidates (filterable scored list with signal breakdown), Active Asks (Firestore-backed ask tracking with status progression), Outcomes (completed asks + conversion counts), Inspection (scoring rules audit + style catalog).
- **Ask Tracking**: Persisted to Firestore `orgs/{orgId}/referralAsks`. Status lifecycle: `created → sent → responded → lead_created → won/lost/no_response`. Real-time via `onSnapshot`.
- **Draft Generation**: `generateReferralAskContent(candidate, channel)` produces pre-filled call prep notes, email (with subject), or SMS body for each ask. All editable before saving.
- **Routes**: `/referral` (manager-gated). `GitMerge` icon in sidebar after Execution Queue.

### Automation Execution Layer
- **Domain Model** (`execAutomationTypes.ts`): Defines `ExecutionItemLocalState`, `ExecutionItemStatus`, `QueueAction`, `QueueState`, `CommunicationHistoryItem`, `ChannelIntegrationState`, and `ExecutionSendResult`. All types derived from existing comms channel types.
- **Channel Adapters** (`channelAdapters.ts`): Honest, explicit boundaries for each channel. Email uses `mailto:` link (no SMTP required). SMS uses `sms:` protocol on mobile, clipboard on desktop (no Twilio required). Call and voicemail are reference material with manual outcome logging. All missing integration config is documented with exact env var names needed to upgrade.
- **`sendViaChannel()`**: Dispatcher function that fires the most capable available method per channel. Returns `ExecutionSendResult` with method, sentAt, and note. Never fakes a send.
- **ExecutionQueue** (`ExecutionQueue.tsx`): Premium 4-tab approval-aware execution queue. Uses `useReducer` for local item state (idle → draft\_open → approved → sent/manually\_sent/cancelled/failed). Writes to Firestore `orgs/{orgId}/commHistory` on every send. Reads history via `onSnapshot`.
- **Approval flow**: Generate Draft → Review/Edit → Approve → Send (fires channel adapter) or Mark as Sent Manually → logged to Firestore.
- **Communication history**: Persisted to Firestore `commHistory` collection, read back via real-time listener. Stored per org with entity, channel, body snippet, sentBy, method, linked cadence item.
- **Routes**: `/execution` (manager-gated), `Send` icon in manager nav sidebar after Comms Drafts.
- **Rules**: No auto-sending. Every item requires human approval. All sends are auditable. Channel limitations are surfaced clearly, not hidden.

### Executive Reporting Layer
- **Dashboard**: A 5-tab leadership dashboard (`/exec`) providing KPIs, risks, opportunities, bottlenecks, alerts, watchlists, and pipeline/account snapshots, all derived from live Redux data without AI or API calls. Focuses on actionable, interpretable metrics.

### Communication Drafting Layer
- **Drafting System**: Generates entity-specific communication drafts across 4 channels (Email / SMS / Call Prep / Voicemail) for 12 communication intents, driven by a context builder and template engine.
- **Workspaces**: `CommsDraftPanel` for reviewing drafts and a 5-tab `CommsWorkspace` (`/comms`) for managing all drafts. Integrated with cadence items.

### Cadence + Automation Layer
- **Rule Engine**: 14 derivation rules (7 lead, 7 client) for generating reminders based on stage, inactivity, proposal status, delivery blocks, churn risk, upsell readiness, and referral timing.
- **Workspace**: A 8-tab premium `CadenceWorkspace` (`/cadence`) with safe controls (dismiss, snooze, complete, restore) and integration with the communication drafting layer.

### Sales Execution Layer
- **Tools**: Provides `SalesMeetingPrep`, `SalesFollowUpRecommendation`, `StageActionPlan`, and `PipelineMomentumScore`, derived from existing Lead data without AI calls. Includes a static objection bank.
- **SalesExecutionHub**: Replaces "Sales Actions" tab in LeadFocusView with sections for Actions, Meeting Prep, Objections, and Follow-up Guide.

### Sales Intelligence UX Layer
- **Lead Focus View**: Enhanced 6-tab command workspace: Deal Intelligence, Visibility Gaps, Growth Plan, Sales Actions, Readiness, ROI Calculator.
- **Panels**: Includes Visibility Gap Panel, Digital Growth Plan Panel, Sales Next Best Action Panel (with NEPQ-style questions), and Proposal & Handoff Readiness Panel.

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