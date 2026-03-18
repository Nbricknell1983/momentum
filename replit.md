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
- **ORM**: Drizzle ORM for PostgreSQL.
- **Schema**: Defined in `shared/schema.ts` and shared between client and server.
- **Migrations**: Drizzle Kit.
- **Current Data State**: Uses in-memory mock data, with pending integration to a PostgreSQL database.

### Core Features
- **Pipeline Management**: Kanban board with drag-and-drop lead management and a Lead Focus View (3-column overlay).
- **Conversation Intelligence**: Tracks behavioral progression independently from pipeline stage.
- **Lead & Client Management**: Expandable lead cards, quick actions, activity logging, and client lifecycle management with AI Movement Tips.
- **Territory System**: Hierarchical region/area filtering for leads.
- **Nurture System**: Active and passive nurture modes with cadence automation.
- **Activity Tracking**: One-click logging for sales activities.
- **Momentum Scoring**: Tracks daily/weekly metrics against targets and provides health scoring for leads.
- **AI Sales Engine**: A 5-section AI layer integrated into the right-side panel, powered by GPT-4o-mini, offering stage-aware defaults and actions. Includes conversation intelligence with transcription, AI-extracted insights, and personalized follow-up email generation.
- **Strategy Engine**: AI-powered decision engine generating strategic pillars and actionable tasks.
- **Leads Research**: Integrates with ABR and Google Business Profiles for business discovery and AI-generated outreach scripts.
- **Marketing Website**: Public website (`battlescore.com.au`) at `/marketing` for lead generation.
- **Client App Integration**: System to connect external client business applications for live data flow.
- **AI Meeting Notes System**: AI-powered meeting notes processing with voice dictation support.
- **Strategy Intelligence**: Discovery input card in the Deal Intelligence panel for gathering business context, feeding into AI Growth Strategy endpoints.
- **Recommended Website Mockup**: AI-generated full website mockup with identified gaps, displayed in the Deal Intelligence panel.
- **Growth Plan Module**: Comprehensive strategy engine within the AI Sales Engine, offering various analytical tools and report generation.
- **Digital Visibility Strategy (Premium Public Page)**: A 16-section premium consulting document with detailed digital visibility analysis and a 3-Phase Growth Roadmap.
- **Paid Search Opportunity Model**: A workspace for calculating paid search forecasts, revenue, break-even points, and generating a 12-month roadmap.
- **Client Pipeline & Touchpoint System**: Dedicated Kanban board for client management with touchpoint scheduling and a ClientFocusView (3-column workspace) mirroring the sales pipeline layout.
- **Client Growth Report**: Generates shareable public URLs for detailed SEO & strategy reports for clients.
- **Multi-Tenant RBAC Architecture**: Role-based data isolation for organizations (`owner`, `admin`, `member`).
- **AI Onboarding & Team Handover**: A 5-tab collapsible card for client onboarding, including business context, product details, SEO inputs, AI-generated outputs (strategy, sitemap, marketing plan, handover), and a final handover document.
- **Local Presence (Local Falcon Integration)**: GBP rank tracking section in the ClientGrowthIntelligencePanel, displaying scan history and heatmaps.
- **Google Business Profile Integration (OAuth2)**: Full GBP OAuth2 connection flow for managing GBP accounts, locations, and replying to reviews directly within the application.
- **AI Growth Operator**: Framework for automating growth activities with per-client automation modes (assisted, supervised, autonomous), execution status tracking, and an AI Actions Feed.
- **Growth Prescription Engine** (Phase 2): Evidence-based AI diagnosis for prospects — analyses digital presence signals, strategy intelligence, and discovery context to produce a recommended product stack, tiered investment options (Starter→Performance), and cost-of-inaction framing. Integrated into the Deal Intelligence panel and enriches pre-call prep.
- **Website Engine** (Phase 3): AI-powered website health audit for clients — scores conversion, structure, and content (A–F grades), generates a prioritised action task list with effort levels, and provides quick wins. Runs from onboarding context + website data. Lives in the Client Growth Intelligence panel.
- **SEO Engine** (Phase 3): AI-powered SEO intelligence plan for clients — generates a visibility score, keyword targets, content gap analysis (service/location/FAQ/blog page opportunities), and a 3-month build roadmap. Lives in the Client Growth Intelligence panel.
- **GBP Engine** (Phase 4): AI-powered Google Business Profile optimisation report — scores profile completeness, review strength, and posting consistency (A–F grades), with a prioritised task list and quick wins. Distinct from the GBP Playbook and Maps Pack tools. Lives in the Client Growth Intelligence panel.
- **Ads Engine** (Phase 4): AI-powered Google Ads intelligence plan — readiness score, recommended budget with breakdown, campaign structure (Search/Local/Remarketing), paid keyword targets, estimated CPL and leads/month, and risk assessment. Pulls from onboarding and SEO engine data. Lives in the Client Growth Intelligence panel.
- **Growth Playbook** (Phase 5): Library of 8 pre-built growth plays (Review Velocity Sprint, GBP Domination, Local SEO Foundation, Website Conversion Fix, Maps Pack Breakthrough, Paid Search Launch, Content Authority Build, Trust Signal Sprint). Each play shows prerequisites (checked against existing engine reports), expected outcomes, and queues its action list directly into the AI Actions feed when applied. Filter by channel, track active/complete/paused status per client.
- **Learning Insights** (Phase 5): AI-generated analysis of client growth operations — reads AI action history (approved/rejected/done counts), engine report scores, intelligence score, and active plays to produce: momentum status (not-started/building/strong/stalled), top performing channel, weakest area, overall assessment, and a single next-best-move recommendation.

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database.
- **Firebase Firestore**: Main NoSQL database for application data, supporting multi-tenancy.

### AI Integration
- **OpenAI API**: Provides AI capabilities, primarily GPT-4o-mini.
- **OpenClaw API**: External AI orchestration layer.

### Authentication & Authorization
- **Firebase Authentication**: Manages user authentication (Google Sign-In, Email/Password).

### Third-Party APIs
- **Google Places API**: Used for business research.
- **Australian Business Register (ABR) API**: Provides Australian business data.
- **Web Speech API**: Enables voice dictation functionality.
- **Local Falcon API**: Integrates GBP rank tracking services.
- **Google Business Profile API**: Facilitates management of Google Business Profiles, including reviews.