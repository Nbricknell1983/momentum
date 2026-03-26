# Momentum Agent

## Overview
Momentum Agent is an AI-assisted sales operating system designed to transform daily sales activities into consistent pipeline momentum. It functions as a productivity-focused admin dashboard, offering Kanban-style pipeline management, activity tracking, nurture automation, and momentum scoring. The application aims to facilitate frictionless logging, reinforce follow-up discipline, and provide stage-aware coaching to enhance sales performance and pipeline growth, ultimately improving efficiency and driving pipeline growth for sales teams.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript and Vite.
- **Routing**: Wouter.
- **State Management**: Redux Toolkit for global state, TanStack React Query for server state.
- **Styling**: Tailwind CSS with theming via CSS variables.
- **UI Components**: shadcn/ui library, built on Radix primitives.
- **Design System**: Fixed left sidebar, top bar, main content area, and right drawer overlay.

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
- **AI Strategy & Research**: Strategy Engine, Leads Research, Growth Plan Module, and AI Engine Suite.
- **Vapi Voice Agent Layer**: Vapi for voice interface, Momentum for logic/orchestration. Includes 9 call intents and 12 tool boundaries.

### Auth & Security
- **Firebase Authentication**: User identity management and token verification.
- **Middleware**: `verifyFirebaseToken`, `requireOrgAccess`, and `requireManager` for route protection.
- **Firestore Rules**: Deployed via Firebase CLI.

### Core Features
- **Sales Operating System**: Pipeline Management, Conversation Intelligence, Lead & Client Management, Territory System, Nurture System, Activity Tracking, and Momentum Scoring.
- **Website Workstream Agent**: Full website blueprint builder.
- **SEO Engines**: SEO Preservation, Transparency + Comparison, and Keyword Strategy Engines.
- **AI Growth Operator**: Framework for automating growth activities.
- **Autopilot Execution**: One-click auto-approval for queued AI actions.
- **Bullpen Work Queue**: Trigger-driven system for proactive operational management.
- **Intelligence Enrichment Engine**: Three-pass auto-enrichment for leads and clients.
- **Client Portal & Command Centre**: Client-facing dashboard for performance, delivery, and milestones.
- **AI Systems Integration Layer**: Modular, production-grade server-to-server REST integration.
- **Proposal Acceptance → Onboarding → Provisioning Flow**: Guided 4-step panel for scope selection, data capture, readiness assessment, and handoff/provisioning.
- **Expansion Engine**: Derives `AccountGrowthSignal`, `ExpansionOpportunity`, `ChurnRiskSignal`, `ReferralOpportunity`, `ExpansionNextBestAction`, and `ExpansionPlay` from live client data.
- **Scheduled Sweeps + Background Automation Runner**: Server-side orchestrator for scheduled sweeps, processing leads and clients, applying autopilot policies, and managing actions.
- **Autopilot Policy Layer**: Pure deterministic classifier evaluating rules based on safety level, escalation conditions, and global mode overrides.
- **Automation Execution Layer**: Explicit boundaries for communication channels (Email, SMS, Call, Voicemail).
- **Executive Reporting Layer**: A 5-tab leadership dashboard providing KPIs, risks, opportunities, bottlenecks, alerts, watchlists, and pipeline/account snapshots.
- **Communication Drafting Layer**: Generates entity-specific communication drafts across 4 channels for 12 communication intents.
- **Cadence + Automation Layer**: 14 derivation rules for generating reminders.
- **Sales Execution Layer**: Provides `SalesMeetingPrep`, `SalesFollowUpRecommendation`, `StageActionPlan`, and `PipelineMomentumScore`.
- **Sales Intelligence UX Layer**: Enhanced 6-tab command workspace.
- **Erica Calling System**: Full typed model for calls, brief generator, batch service, API router, and premium calling workspace.
- **Calendar + Booking Integration Layer**: Full typed model for slots, availability, and bookings, with Google Calendar adapter.
- **Confirmation + Reminder Automation Layer**: 10-state lifecycle model for confirmations and reminders.
- **Scheduled Calling Campaigns Layer**: Typed models for campaigns, schedules, runs, and outcomes, with a campaign runner and scheduler.
- **Reschedule + Cancel Layer**: Typed models for change requests, outcomes, and audit entries.
- **Erica Execution Bridge**: Vapi launch service, payload builder, webhook reconciler, and router.
- **Erica Assistant Runtime Config Layer**: Typed models for assistant profiles, configurations, strategies, and conversation outcomes.

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
- **Google Calendar API**: Calendar integration.
- **Resend**: Email sending service.
- **SendGrid**: Email sending service.