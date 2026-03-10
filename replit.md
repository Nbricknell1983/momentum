# Momentum Agent

## Overview

Momentum Agent is an AI-assisted sales operating system designed to transform daily sales activities into consistent pipeline momentum. It functions as a productivity-focused admin dashboard, offering features such as a Kanban-style pipeline, activity tracking, nurture automation, and momentum scoring. The application aims to facilitate frictionless logging, reinforce follow-up discipline, and provide stage-aware coaching to enhance sales performance and pipeline growth.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, using Vite for development.
- **Routing**: Wouter.
- **State Management**: Redux Toolkit for global state, TanStack React Query for server state.
- **Styling**: Tailwind CSS with theming via CSS variables.
- **UI Components**: shadcn/ui library, built on Radix primitives.
- **Interactions**: @dnd-kit for drag-and-drop functionality, particularly for the Kanban board.

### Backend
- **Runtime**: Node.js with Express, written in TypeScript.
- **API**: RESTful endpoints prefixed with `/api`.
- **Serving**: Express serves the static frontend assets in production.

### Data Layer
- **ORM**: Drizzle ORM for PostgreSQL.
- **Schema**: Defined in `shared/schema.ts` and shared between client and server.
- **Migrations**: Drizzle Kit for schema management.
- **Current Data State**: Uses in-memory mock data, with pending integration to a PostgreSQL database.

### Project Structure
- `client/`: Contains the React frontend.
- `server/`: Contains the Express backend.
- `shared/`: Houses code shared between client and server, like the database schema.

### Design System
- Emphasizes information density and clarity, inspired by modern CRM interfaces.
- Uses a fixed left sidebar, a top bar, a main content area, and a right drawer overlay.

### Key Features
- **Pipeline Management**: Kanban board with drag-and-drop lead management. Clicking a lead card opens a Pipedrive-style **Lead Focus View** — a full-screen overlay with lead details on the left and embedded AI Sales Engine on the right. Keyboard navigation: Escape closes, arrow keys navigate between leads.
- **Conversation Intelligence**: Separate conversation layer tracking behavioral progression (Attempted → Connected → Discovery → Qualified → Objection → Proposal → Booked) independent from pipeline stage.
- **Lead & Client Management**: Expandable lead cards, quick actions, activity logging, and client lifecycle management with AI Movement Tips.
- **Territory System**: Hierarchical region/area filtering for leads.
- **Nurture System**: Active and passive nurture modes with cadence automation.
- **Activity Tracking**: One-click logging for sales activities.
- **Traffic Light Status**: Visual indicators for lead follow-up urgency.
- **Momentum Scoring**: Tracks daily/weekly metrics against targets.
- **AI Sales Engine**: 4-prompt AI sales execution layer (Win Before You Dial, Control the Call, Win the Follow-Up, Multiply Your Pipeline).
- **Deal Momentum Score**: Health scoring for each lead (Strong/Active/At Risk/Stalled) with reasons and next step suggestions.
- **Strategy Engine**: AI-powered decision engine generating strategic pillars and actionable tasks.
- **Leads Research**: Integrates with ABR and Google Business Profiles to discover new businesses, including AI-generated outreach scripts.
- **Marketing Website**: SEO-optimized public website at `/marketing` for lead generation.
- **Client App Integration**: System to connect external client business applications for live data flow.

### Strategy Engine System
A decision engine generating strategic pillars, KPIs, goals, risks, and actionable tasks based on a structured question stack. Utilizes GPT-4o-mini for AI-generated outputs.

### Territory System
Configurable regions and areas with linked filtering capabilities for lead organization.

### Leads Research System
Discovers new Australian businesses via Google Business Profiles and the Australian Business Register (ABR). Features include:
- **Auto-generated reasons**: "Why suggested" data from search results auto-populates the reason field when adding leads
- **AI-powered outreach scripts**: Generates personalized Text, Email, and Call scripts using NEPQ, Jeb Blount, Chris Voss frameworks
- **Outreach Scripts on All Pipeline Stages**: All leads have an "Outreach Scripts" button in Quick Actions that:
  - Leverages notes, activity history, and logged activities for contextual personalization
  - Adjusts tone and approach based on pipeline stage (cold for suspect, warm for prospect, familiar for qualify+)
  - References specific prior interactions when available

### Marketing Website
An SEO-optimized public website (`battlescore.com.au`) targeting business consultancy keywords, with dynamic SEO features and structured data.

### AI Movement Tips System
Provides AI-generated strategic recommendations for moving clients between lifecycle stages, leveraging GPT-4o-mini and sales frameworks.

### AI Meeting Notes System
AI-powered meeting notes processing with voice dictation support:
- **Voice Dictation**: Web Speech API integration for hands-free note-taking via DictationButton component
- **AI Processing**: OpenAI extracts meeting summaries, key discussion points, and actionable items
- **Action Item Extraction**: Automatically identifies tasks with priorities, due dates, and task types
- **Sentiment Analysis**: Detects client sentiment (positive/neutral/negative) from meeting content
- **Risk Detection**: Flags potential concerns like budget issues, timeline concerns, or scope creep
- **Auto-Task Creation**: Users can select extracted action items to create tasks automatically
- **Endpoint**: POST `/api/ai/process-meeting-notes` handles AI processing
- **Response Validation**: Sanitizes AI responses with safe defaults for all fields

### Conversation Intelligence System
A conversation-first architecture that separates behavioral progression from pipeline position:
- **Two-Layer Architecture**: Pipeline Stage (deal position) and Conversation Stage (behavioral progress) are independent dimensions
- **Conversation Stages**: Not Started → Attempted → Connected → Discovery → Qualified → Objection → Proposal → Booked
- **Pipeline Stages**: Unchanged (Suspect → Contacted → Engaged → Qualified → Discovery → Proposal → Won/Lost/Nurture)
- **Log Conversation / Log Attempt**: Primary actions in the lead drawer, replacing activity buttons as the main workflow
- **Conversation Stage Dial**: Segmented ring visualization showing conversation progression on each lead
- **Auto Stage Movement**: Conversation stage updates automatically based on logged outcomes (e.g., "Discovery Conversation" moves stage to Discovery)
- **Momentum Impact**: Conversation progression, frequency, and next-step freshness drive momentum rather than raw activity counts
- **Firestore Storage**: Conversation logs stored as subcollection `orgs/{orgId}/leads/{leadId}/conversations`
- **Lead Fields**: `conversationStage`, `lastConversationAt`, `lastAttemptAt`, `conversationCount`, `attemptCount`, `nextConversationStep`
- **Component**: `ConversationIntelligence.tsx` provides the panel with dial, insight, logging flow, and recent conversation history

### AI Sales Engine
A 4-prompt AI sales execution layer built into the right-side panel, powered by OpenAI GPT-4o-mini:
- **Win Before You Dial**: Pre-call intelligence — auto-fills from lead data, generates business analysis (strengths, gaps, revenue opportunity), opening line, and curiosity question
- **Control the Call**: Objection handling — preset common objections + custom input, generates real concern analysis, conversational response, and regain-control question
- **Win the Follow-Up**: Post-call content — generates personalized follow-up Email, SMS, and Proposal Intro based on meeting notes and services discussed
- **Multiply Your Pipeline**: Prospect generation — finds similar businesses in surrounding suburbs with pain points, prospect strength, and opening lines
- **Stage-aware defaults**: Panel auto-opens the most relevant section based on lead's pipeline stage
- **Lead shortcuts**: "Prep Call", "Handle Objection", "Draft Follow-Up", "Find Prospects" buttons on each lead card open the AI panel to the right section
- **Actions**: Copy, save to notes, regenerate on all generated content
- **Component**: `AISalesEngine.tsx` replaces the old `AgentPanel.tsx`
- **Endpoints**: `POST /api/ai/sales-engine/pre-call`, `/objection`, `/follow-up`, `/prospect`

### Deal Momentum Score
A health scoring system for each lead based on activity patterns:
- **Scoring Model**: Base 50, adjusts based on activity recency, stage movement, follow-up scheduling, MRR presence
- **Status Bands**: Strong (80-100), Active (60-79), At Risk (35-59), Stalled (0-34)
- **UI**: Score badge on collapsed lead cards, detailed breakdown in lead drawer with reasons and suggested next step
- **Engine**: `client/src/lib/dealMomentumScore.ts` — pure client-side computation from existing lead + activity data
- **Colors**: Green (Strong), Blue (Active), Amber (At Risk), Red (Stalled)

### Client Pipeline & Touchpoint System
A dedicated Kanban board (`/client-pipeline`) for quick client management with:
- **Client Pipeline Kanban**: 5-column board (Onboarding, Steady State, Growth Plays, Watchlist, Churned) with drag-and-drop
- **Touchpoint Schedule**: Configurable cadence per client (Weekly/Fortnightly/Monthly/Bi-monthly/Quarterly)
- **Traffic Light Status**: Green/Amber/Red indicators based on touchpoint schedule adherence
- **Touchpoint Types**: Check-in Call, Report Sent, Strategy Review, QBR, Ad-hoc
- **Auto-scheduling**: Logging a touchpoint automatically sets the next contact date based on cadence
- **Quick Adjust**: +1w, +2w, +1m, +3m buttons to adjust next touchpoint date
- **Salesforce Integration**: CRM link field on each client card for quick access
- **Next Best Action**: Prominent "Next Action" field on each card showing the current next step (e.g., "Reach out to hosting provider about DNS"), visible on collapsed cards, with mark-done and history logging
- **Stage-aware Playbooks**: AI outreach scripts adapted to client lifecycle stage

### Client App Integration System
Enables secure pairing and data exchange with external client business applications via pairing codes and permanent integration secrets. Supports various event types like KPI snapshots and bookings.

## External Dependencies

### Database
- **PostgreSQL**: Primary database.
- **Drizzle ORM**: For type-safe database interactions.

### AI Integration
- **OpenAI API**: Planned for AI features, to be called server-side.

### UI/Component Libraries
- **Radix UI**: Accessible UI primitives.
- **Recharts**: Charting library.
- **Lucide React**: Icon library.
- **date-fns**: Date manipulation utility.

### Authentication & Authorization
- **Firebase Authentication**: For user authentication (Google Sign-In, Email/Password).
- **Firebase Firestore**: Main NoSQL database for application data, structured under an organization scope (`orgs/{orgId}/`). Requires specific composite indexes for efficient querying.

### Multi-Tenant RBAC Architecture
Role-based data isolation for organisations with multiple sales reps (50+ user scale):
- **Roles**: `owner` (full access + management), `admin` (management access), `member` (rep - own data only)
- **Data Isolation**: Reps only see leads, activities, and clients where `userId` matches their Firebase UID. Managers (owner/admin) see all org data.
- **AuthContext**: Exposes `userRole` (TeamMemberRole) and `isManager` (boolean) derived from Firestore member document role field
- **Firestore Queries**: `fetchLeads`, `fetchClients`, `fetchAllActivities` accept optional `filterByUserId` param. When provided, adds `where('userId', '==', userId)` filter. Reps pass their UID; managers pass undefined (no filter).
- **App-Level Loading**: `App.tsx` determines `userFilter` based on `isManager` and passes it to all data fetch calls
- **Management Dashboard**: `/management` page visible only to admin/owner roles. Shows team overview with per-rep metrics: active deals, lead counts, activity volume, pipeline value, conversation counts. Drill-down into individual rep performance with pipeline distribution and activity breakdown.
- **Sidebar**: "Management" section appears only for manager roles. Footer shows current user identity.
- **Data Preservation**: Lead `userId` field travels with the lead through all stage transitions. No data loss when moving deals between pipeline stages.

### Third-Party APIs
- **Google Places API**: For business research.
- **Australian Business Register (ABR) API**: For Australian business data.