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
- **Interactions**: @dnd-kit for drag-and-drop functionality (Kanban board).
- **Design System**: Emphasizes information density and clarity, inspired by modern CRM interfaces. Uses a fixed left sidebar, top bar, main content area, and right drawer overlay.

### Backend
- **Runtime**: Node.js with Express, written in TypeScript.
- **API**: RESTful endpoints prefixed with `/api`.
- **Serving**: Express serves static frontend assets in production.

### Data Layer
- **ORM**: Drizzle ORM for PostgreSQL.
- **Schema**: Defined in `shared/schema.ts` and shared between client and server.
- **Migrations**: Drizzle Kit.
- **Current Data State**: Uses in-memory mock data, with pending integration to a PostgreSQL database.

### Project Structure
- `client/`: React frontend.
- `server/`: Express backend.
- `shared/`: Code shared between client and server.

### Key Features
- **Pipeline Management**: Kanban board with drag-and-drop lead management, featuring a Lead Focus View (full-screen 3-column overlay: left = deal controls/activity, middle = Deal Intelligence panel, right = AI Sales Engine).
- **Conversation Intelligence**: Tracks behavioral progression (Attempted → Connected → Discovery → Qualified → Objection → Proposal → Booked) independently from pipeline stage, with a two-layer architecture for Pipeline Stage and Conversation Stage.
- **Lead & Client Management**: Expandable lead cards, quick actions, activity logging, and client lifecycle management with AI Movement Tips.
- **Territory System**: Hierarchical region/area filtering for leads.
- **Nurture System**: Active and passive nurture modes with cadence automation.
- **Activity Tracking**: One-click logging for sales activities.
- **Traffic Light Status**: Visual indicators for lead follow-up urgency.
- **Momentum Scoring**: Tracks daily/weekly metrics against targets.
- **AI Sales Engine**: A 5-section AI layer (Win Before You Dial, Control the Call, Win the Follow-Up, Growth Plan, Multiply Your Pipeline) integrated into the right-side panel, powered by GPT-4o-mini. It offers stage-aware defaults and actions like copy, save, and regenerate. Win the Follow-Up includes conversation intelligence: browser-based audio recording and file upload with Whisper transcription, AI-extracted insights (pain points, services, opportunities, objections, next steps), and personalised follow-up email generation using the extracted conversation context. All AI-generated outputs (call prep, objection responses, follow-up, conversation insights, growth plan, prospects) are auto-saved to Firestore against the lead and restored when the lead is reopened.
- **Deal Momentum Score**: Health scoring for each lead (Strong/Active/At Risk/Stalled) based on activity patterns, with detailed breakdown and suggested next steps.
- **Strategy Engine**: AI-powered decision engine generating strategic pillars and actionable tasks, utilizing GPT-4o-mini.
- **Leads Research**: Integrates with ABR and Google Business Profiles to discover new businesses, including AI-generated outreach scripts that are contextual and stage-aware.
- **Marketing Website**: SEO-optimized public website (`battlescore.com.au`) at `/marketing` for lead generation.
- **Client App Integration**: System to connect external client business applications for live data flow.
- **AI Meeting Notes System**: AI-powered meeting notes processing with voice dictation support, extracting summaries, action items, sentiment, and risks.
- **Strategy Intelligence**: A discovery input card in the Deal Intelligence panel (above Online Presence) with 6 fields: Business Overview, Ideal Customer, Core Revenue Services, Target Locations, Growth Objective, Discovery Notes. Each field has AI Suggest (pulls from conversation intelligence, deal summary, website crawl) and voice dictation with auto-tidy. Saves to `lead.strategyIntelligence` in Firestore. Feeds into all AI Growth Strategy endpoints as the primary framing context. Backend endpoints: `/api/leads/ai/suggest-field`, `/api/leads/ai/tidy-dictation`.
- **Recommended Website Mockup (Deal Intelligence)**: AI-generated full website mockup in the Deal Intelligence panel showing what the prospect's ideal website should look like. Triggered by "Build Ideal Website" button. Backend endpoint `POST /api/leads/ai/mock-website` fetches lead context (strategy intelligence, crawled pages, online presence, reviews) and uses GPT-4o-mini with `response_format: json_object` to generate a complete self-contained HTML page plus a list of 6-8 gaps in the prospect's current website. The HTML renders in a scaled iframe preview (clickable to full-screen modal). Gaps display in an amber "What their current site is missing" list. Saved to `lead.mockWebsiteHtml`, `lead.mockWebsiteGaps`, `lead.mockWebsiteGeneratedAt` in Firestore. Regenerate button available in both the card header and full-screen modal.
- **Growth Plan Module**: A comprehensive strategy engine within the AI Sales Engine, offering Website X-Ray, SERP Visualization, Competitor Gap Analysis, Traffic & Revenue Forecast, and Strategy PDF Generation.
- **Digital Visibility Strategy (Premium Public Page)**: The public strategy report (`/strategy/:id`) has been completely rebuilt as a 16-section premium consulting document. New sections: Digital Visibility Triangle (Relevance/Authority/Trust scores with evidence), Search Engine View (server-side page structure breakdown), Market Capture Map (keyword clusters by location), Discovery Path Simulator (5-stage buyer journey funnel), Buyer Reality Gap (expectations vs reality comparison), Intent Coverage (5 intent categories with expandable detail), Momentum Moment (psychological turning point section), 3-Phase Growth Roadmap (Foundation/Visibility Expansion/Market Capture), Live Strategy Simulator (interactive sliders for demand/visibility/revenue), Cost of Inaction (AI-generated missed opportunity data), Insight Snapshots (3 copyable insight cards). Backend endpoint `POST /api/ai/growth-plan/twelve-month-strategy` now generates 16 JSON fields with max_tokens=4000. Server-side computed fields: `searchEngineView` (page type counts) and `marketCaptureMap` (keyword clusters). Internal GrowthPlanSection shows strategy direction card (one-sentence strategy + confidence level) after generation.
- **Paid Search Opportunity Model (Growth Plan Engine)**: A production-ready workspace activated when "Growth Plan" is selected in the AI Sales Engine accordion. Swaps the center column to a full calculation workspace with: Budget Forecast / Market Opportunity mode toggle; 4-card KPI row; 2-column layout (assumptions left, outputs right); inputs for Business, Market, Benchmark, and Coverage; live-calculated Forecast, Revenue, Break-even, Opportunity Score, Commentary, and Priority Actions cards; Scenario Comparison table; 12-Month Roadmap. Saves full plan snapshot to `lead.paidSearchGrowthPlan` in Firestore. Architecture: pure domain utilities in `client/src/lib/growth-plan/` (types, benchmarks, calculations, commentary, recommendations, roadmap, summary); workspace UI in `client/src/components/GrowthPlanWorkspace.tsx`; center column swap wired via `onSectionChange` callback in AISalesEngine → LeadFocusView.
- **Client Pipeline & Touchpoint System**: A dedicated Kanban board (`/client-pipeline`) for client management with touchpoint scheduling, traffic light status, and "Next Best Action" visibility. Clients open in a full 3-column workspace (ClientFocusView) mirroring the Sales Pipeline layout: left = client details/quick actions/account value, centre = ClientGrowthIntelligencePanel (health score, service performance, retention signals, expansion opportunities, next best action), right = AIClientGrowthEngine (5-section AI panel: Win Before You Dial/Account Intelligence, Control the Call/Expansion Builder, Win the Follow-Up, Growth Plan 30/90/12-month, Multiply Your Pipeline/Referral Engine).
- **Client Growth Report**: Generates a shareable public URL (`/report/:reportId`) with a beautiful, scrollable SEO & strategy report for clients. Report includes performance metrics, trend charts, keyword progress tracker, completed work, next steps, Page 1 vs Page 2 comparison, and a summary. Generated from the Strategy tab in the Clients page. Stored in Firestore `reports/` collection (no auth required to view).
- **Multi-Tenant RBAC Architecture**: Role-based data isolation (`owner`, `admin`, `member`) for organizations, ensuring reps only see their data while managers have full organizational oversight.
- **AI Onboarding & Team Handover**: A 5-tab collapsible card in the ClientGrowthIntelligencePanel (client middle column). Tabs: (1) Business Context — overview, target customers, services, goals, locations, competitors, brand direction; (2) Products & Commercials — product toggles (Website, SEO, Google Ads, Performance Boost, Local SEO, GBP) with product-specific fields and commercial pricing/capacity notes; (3) SEO Inputs — keyword file upload (Ahrefs/GKP CSV/Excel with UTF-16 support), SEO objective, manual notes, website/sitemap URLs; (4) AI Outputs — generates 4 AI sections (Strategy Summary, SEO Sitemap, Marketing Strategy, Team Handover) via GPT-4o-mini endpoint `/api/clients/ai/onboarding-generate`, all editable post-generation; (5) Final Handover — editable combined handover with copy button. All data autosaves to Firestore under `client.clientOnboarding`. Component: `client/src/components/ClientOnboardingHandover.tsx`.
- **Local Presence (Local Falcon Integration)**: GBP rank tracking section in the ClientGrowthIntelligencePanel. Connects to the Local Falcon API (secret: `LOCAL_FALCON_API_KEY`) to display scan history, latest ARP (Average Rank Position), SoLV (Share of Local Voice), heatmap image, and full scan history. Users can link a Local Falcon location to each client, run new scans inline (keyword, grid size, radius), and view all historical reports. Data saved to Firestore as `client.localFalconPlaceId` and `client.localFalconLocation`. Backend proxy routes: `GET /api/local-falcon/locations`, `GET /api/local-falcon/reports`, `GET /api/local-falcon/reports/:reportKey`, `POST /api/local-falcon/run-scan`, `PATCH /api/clients/:id/local-falcon-place`. Local Falcon API base: `https://api.localfalcon.com` (v1 for reporting, v2 for scanning).
- **Google Business Profile Integration (OAuth2)**: Full GBP OAuth2 connection flow. Owner/admin connects via Settings → Integrations tab using Google OAuth (scope: `business.manage`). Refresh token stored in Firestore at `orgs/{orgId}/settings/gbp`. Backend routes: `GET /api/gbp/connect`, `GET /api/gbp/callback`, `GET /api/gbp/status`, `POST /api/gbp/disconnect`, `GET /api/gbp/accounts`, `GET /api/gbp/locations`, `GET /api/gbp/reviews`, `POST /api/gbp/reviews/:locationName/reply`, `PATCH /api/clients/:clientId/gbp-location`. GBP location linked per-client via `client.gbpLocationName` (full resource name e.g. `accounts/{id}/locations/{id}`). GBPReviewsSection in ClientGrowthIntelligencePanel shows avg rating, star ratings, review text, reviewer photo, date (DD-MM-YYYY), existing replies, and reply composer with live post. APIs: accounts=`mybusinessaccountmanagement.googleapis.com/v1`, locations/reviews=`mybusinessbusinessinformation.googleapis.com/v1`, Reviews(v4)=`mybusiness.googleapis.com/v4`.

## External Dependencies

### Database
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: For type-safe database interactions.
- **Firebase Firestore**: Main NoSQL database for application data, structured under an organization scope (`orgs/{orgId}/`), requiring specific composite indexes.

### AI Integration
- **OpenAI API**: For AI features (GPT-4o-mini).

### UI/Component Libraries
- **Radix UI**: Accessible UI primitives.
- **Recharts**: Charting library.
- **Lucide React**: Icon library.
- **date-fns**: Date manipulation utility.

### Authentication & Authorization
- **Firebase Authentication**: For user authentication (Google Sign-In, Email/Password).

### Third-Party APIs
- **Google Places API**: For business research.
- **Australian Business Register (ABR) API**: For Australian business data.
- **Web Speech API**: For voice dictation in meeting notes.
- **Local Falcon API**: GBP rank tracking grid (secret: `LOCAL_FALCON_API_KEY`). Auth: `api_key` form field on POST, query param on GET. Base URL: `https://api.localfalcon.com`.
- **Google Business Profile API**: OAuth2 (secrets: `GOOGLE_GBP_CLIENT_ID`, `GOOGLE_GBP_CLIENT_SECRET`). Scope: `https://www.googleapis.com/auth/business.manage`. Tokens stored in Firestore `orgs/{orgId}/settings/gbp`. Callback: `/api/gbp/callback`. After connect, redirects to `/settings?gbp=connected`.