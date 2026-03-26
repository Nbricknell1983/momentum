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
- **Design System**: Fixed left sidebar, top bar, main content area, and right drawer overlay for information density.

### Backend
- **Runtime**: Node.js with Express, written in TypeScript.
- **API**: RESTful endpoints prefixed with `/api`.
- **Serving**: Express serves static frontend assets in production.

### Data Layer
- **Primary Database**: Firebase Firestore for all live application data.
- **Live State**: Leads and clients synced via `onSnapshot` listeners to Redux.
- **AI Output Storage**: Latest AI output snapshot on entity documents, with immutable history records.

### AI Integration & Agent Orchestration
- **Agent Architecture**: Role-aware command layer for `owner`/`admin` and "My Work" for `bullpenWork` items.
- **Agent Job System**: Firestore-backed job queue with idempotency, dependency chains, and retry/backoff.
- **Autopilot Orchestrator**: Proactive agent job scanner managing task queues and back-pressure.
- **AI Sales Engine**: 5-section AI layer for stage-aware defaults, conversation intelligence, insights, and email generation.
- **AI Strategy & Research**: Strategy Engine, Leads Research, Growth Plan Module, and AI Engine Suite (Growth Prescription, Website, SEO, GBP, Ads Engines).

### Auth & Security
- **Firebase Authentication**: User identity management and token verification.
- **Middleware**: `verifyFirebaseToken`, `requireOrgAccess`, and `requireManager` for route protection.
- **Firestore Rules**: Deployed via Firebase CLI.

### Core Features
- **Sales Operating System**: Pipeline Management, Conversation Intelligence, Lead & Client Management, Territory System, Nurture System, Activity Tracking, and Momentum Scoring.
- **Website Workstream Agent**: Full website blueprint builder with planning, content, SEO, assets, and preview capabilities, including HTML generation, sitemap, and robots.txt.
- **SEO Engines**: SEO Preservation Engine, SEO Transparency + Comparison Engine, and Keyword Strategy Engine.
- **AI Growth Operator**: Framework for automating growth activities with per-client automation modes and an AI Actions Feed.
- **Autopilot Execution**: One-click auto-approval for queued AI actions.
- **Bullpen Work Queue**: Trigger-driven system for proactive operational management.
- **Intelligence Enrichment Engine**: Three-pass auto-enrichment for leads and clients.
- **Manager Daily Briefing Layer**: Derivation engine for daily operational briefings.
- **True Server-Side Autopilot Execution Layer**: Background engine for processing `auto_created` sweep actions.
- **Unified Cross-System Operations View**: Operator console combining Momentum (sales-side) and AI Systems (delivery-side).

### Client Portal & Command Centre
- **Client Portal Access Layer**: Defines models for share links, invites, access, visibility, and configurations.
- **Client Command Centre**: Client-facing dashboard for performance, delivery, and milestones.

### AI Systems Integration Layer
- **Architecture**: Modular, production-grade server-to-server REST integration with provisioning, audit logging, status polling, and typed patching, ensuring idempotency and an 8-stage lifecycle.
- **Direct AI Systems API Sync Layer**: Server-side sync service pulling live delivery summaries from AI Systems.

### Client-Facing Strategy Experience Layer
- **Domain Model**: Defines typed interfaces for strategy documents, reports, and presentations.

### Proposal Acceptance → Onboarding → Provisioning Flow
- **Workflow**: Guided 4-step panel for scope selection, data capture, readiness assessment, and handoff/provisioning, supporting 9 modules.

### Expansion Engine
- **Functionality**: Derives `AccountGrowthSignal`, `ExpansionOpportunity`, `ChurnRiskSignal`, `ReferralOpportunity`, `ExpansionNextBestAction`, and `ExpansionPlay` from live client data without AI calls. Includes Upsell/Cross-sell, Churn-Risk detection, and Referral Timing engines.

### Scheduled Sweeps + Background Automation Runner
- **Core Functionality**: Server-side orchestrator for scheduled sweeps, processing leads and clients, applying autopilot policies, and managing actions with deduplication and suppression logic.
- **Safety Guarantees**: Never auto-sends external communications; high/medium-risk actions require approval by default. All sweeps, actions, and suppressions are auditable.

### Autopilot Policy Layer
- **Policy Engine**: Pure deterministic classifier evaluating rules based on safety level, escalation conditions, and global mode overrides. Default is `approval_only`.

### Referral Engine
- **Referral Adapter**: Derives referral readiness signals and appropriate ask styles.

### Automation Execution Layer
- **Channel Adapters**: Explicit boundaries for communication channels (Email, SMS, Call, Voicemail). All communication items require human approval.

### Executive Reporting Layer
- **Dashboard**: A 5-tab leadership dashboard providing KPIs, risks, opportunities, bottlenecks, alerts, watchlists, and pipeline/account snapshots.

### Communication Drafting Layer
- **Drafting System**: Generates entity-specific communication drafts across 4 channels for 12 communication intents.

### Cadence + Automation Layer
- **Rule Engine**: 14 derivation rules for generating reminders based on lead/client status.

### Sales Execution Layer
- **Tools**: Provides `SalesMeetingPrep`, `SalesFollowUpRecommendation`, `StageActionPlan`, and `PipelineMomentumScore`, derived from existing Lead data without AI calls. Includes a static objection bank.

### Sales Intelligence UX Layer
- **Lead Focus View**: Enhanced 6-tab command workspace including Deal Intelligence, Visibility Gaps, Growth Plan, Sales Actions, Readiness, and ROI Calculator.

### Vapi Voice Agent Layer
- **Architecture**: Vapi is the voice interface, Momentum is the logic/orchestration layer. All tool calls go through Momentum service boundaries.
- **9 Call Intents**: `outbound_prospecting`, `appointment_setting`, `discovery_qualification`, `strategy_follow_up`, `proposal_follow_up`, `dormant_lead_reactivation`, `churn_intervention`, `referral_ask`, `inbound_lead_capture`. Each has defined conditions and tools.
- **12 Tool Boundaries**: `lookupLead`, `lookupAccount`, `createLead`, `createFollowUpTask`, `createCallNote`, `requestCallback`, `logObjection`, `logCallOutcome`, `createCadenceItem`, `createDraftFromCallOutcome`, `createApprovalRequest`, `scheduleMeetingRequest`.
- **Policy Modes**: `approval_only` (safe default), `low_risk_auto`, `off` (voice disabled).
- **Conversation Frameworks**: NEPQ-style guarded structures per intent.
- **Workspace**: Full inspection workspace at `/vapi` with 6 tabs.

### Erica Calling System
- **Domain Model**: Full typed model for calls and related intelligence.
- **Adapters**: Deal Intelligence Adapter and Client Intelligence Adapter extract intelligence from records.
- **Brief Generator**: Combines intelligence into a structured `EricaCallBrief` and Vapi context packet.
- **Batch Service**: Firestore-backed batch lifecycle management.
- **API Router**: REST API at `/api/erica/orgs/:orgId/*` for batch/item/result management.
- **Workspace UI**: Premium calling workspace with 7 tabs.
- **Guardrails**: Erica can only call records explicitly selected by a human, with a generated brief, valid phone number, and passing policy checks. No autonomous list building or bulk auto-dialling.

### Erica Execution Bridge
- **Vapi Launch Service**: Launches individual items or next-eligible items via Vapi REST API.
- **Vapi Payload Builder**: Constructs outbound Vapi call payload.
- **Webhook Reconciler**: Handles all Vapi webhook events for Erica calls, writing state, transcript, and outcomes to Firestore.
- **Webhook Router**: Routes Erica calls to the reconciler, non-Erica calls to generic handlers.

### Erica Assistant Runtime Config Layer
- **Runtime Types**: Full typed models for assistant profiles, runtime configurations, strategies, and conversation outcomes.
- **Assistant Instructions**: Per-intent instruction framework defining opening, discovery, objection, and close styles.
- **Objection Library**: 8 guardrailed objection patterns with handling strategies.
- **Runtime Packet Builder**: Converts `EricaCallBrief` + `EricaRuntimeConfig` into a complete `EricaRuntimePacket` for Vapi system prompt injection.
- **Config API**: Org-level behaviour controls for Erica.
- **Packet Preview API**: Allows previewing the full runtime packet for any brief on-demand.

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
- **Vapi**: Voice AI layer for Erica calling system.