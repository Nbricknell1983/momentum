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
- **Pipeline Management**: Kanban board with drag-and-drop lead management.
- **Lead & Client Management**: Expandable lead cards, quick actions, activity logging, and client lifecycle management with AI Movement Tips.
- **Territory System**: Hierarchical region/area filtering for leads.
- **Nurture System**: Active and passive nurture modes with cadence automation.
- **Activity Tracking**: One-click logging for sales activities.
- **Traffic Light Status**: Visual indicators for lead follow-up urgency.
- **Momentum Scoring**: Tracks daily/weekly metrics against targets.
- **AI Agent Panel**: Context-aware AI assistance.
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

### Third-Party APIs
- **Google Places API**: For business research.
- **Australian Business Register (ABR) API**: For Australian business data.