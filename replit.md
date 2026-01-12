# Momentum Agent

## Overview

Momentum Agent is an AI-assisted sales operating system designed to turn daily sales activity into consistent pipeline momentum. It's a productivity-focused admin dashboard with a Kanban-style pipeline, activity tracking, nurture automation, and momentum scoring. The application prioritizes frictionless logging, follow-up discipline, and stage-aware coaching.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with HMR support
- **Routing**: Wouter (lightweight React router)
- **State Management**: Redux Toolkit for global state
- **Data Fetching**: TanStack React Query for server state
- **Styling**: Tailwind CSS with CSS variables for theming
- **UI Components**: shadcn/ui component library (Radix primitives)
- **Drag and Drop**: @dnd-kit for Kanban board interactions

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful endpoints prefixed with `/api`
- **Static Serving**: Express serves built frontend in production

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit for schema migrations (`drizzle-kit push`)
- **Current State**: Uses in-memory storage with mock data; database integration pending

### Project Structure
```
client/           # React frontend
  src/
    components/   # Reusable UI components
    pages/        # Route page components
    store/        # Redux store and slices
    lib/          # Utilities, types, mock data
    hooks/        # Custom React hooks
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API route definitions
  storage.ts      # Data storage interface
shared/           # Shared code between client/server
  schema.ts       # Drizzle database schema
```

### Design System
- Follows design guidelines in `design_guidelines.md`
- Inspired by Linear, Notion, and modern CRM interfaces
- System-based approach emphasizing information density without clutter
- Spacing primitives: Tailwind units of 2, 3, 4, 6, 8, 12, 16
- Layout: Fixed left sidebar (w-64), top bar (h-16), main content area, right drawer overlay

### Key Features
1. **Pipeline (Kanban Board)**: Drag-and-drop lead management across sales stages
2. **Lead Management**: Expandable cards with quick actions, activity logging
3. **Hierarchical Territories**: Region/Area system (e.g., Brisbane → North/South/East/West) with linked filters
4. **Nurture System**: Active and passive nurture modes with cadence automation
5. **Activity Tracking**: One-click logging for calls, emails, meetings, drop-ins
6. **Traffic Light Status**: Visual indicators for lead follow-up urgency
7. **Momentum Scoring**: Daily/weekly metrics tracking against targets
8. **AI Agent Panel**: Context-aware AI assistance (placeholder for OpenAI integration)
9. **Strategy Engine**: AI-powered decision engine that generates strategic pillars and actionable tasks
10. **Leads Research**: ABR (Australian Business Register) integration for discovering newly registered businesses
11. **Client Kanban Board**: Lifecycle stage management with AI Movement Tips for strategic account progression
12. **Marketing Website**: SEO-optimized public website at /marketing for business consultancy lead generation

### Strategy Engine System
- **Purpose**: Decision engine (not passive documentation) that produces actionable tasks
- **Components**:
  - Question Stack: 17 structured intelligence-gathering questions across 5 categories
  - Engine Output: AI-generated strategic pillars with KPIs, goals, and risks
  - Action Stream: AI-recommended tasks with urgency levels and convert-to-task functionality
- **API Endpoint**: `/api/clients/:id/strategy/engine-sync` (POST) - GPT-4o-mini powered
- **Firestore Schema**:
  - `clients/{clientId}/strategyEngine/state` - Engine state with answered questions
  - `clients/{clientId}/strategyEngine/output` - AI-generated strategy output
  - `clients/{clientId}/strategyActions/{actionId}` - Individual action recommendations
- **Confidence Levels**: low (<3 questions), medium (3-6), high (>6 questions answered)
- **Question Categories**: business_context, marketing_status, goals_priorities, constraints_resources, relationship_history

### Territory System
- **Configuration**: `client/src/lib/territoryConfig.ts` - Central source of truth for regions and areas
- **Regions**: Brisbane (with areas), Gold Coast, Logan
- **Lead Fields**: regionId, regionName, areaId, areaName, territoryKey
- **Filtering**: Pipeline page has linked Region/Area dropdowns (area resets when region changes)
- **Migration**: `client/src/lib/migrateTerritories.ts` contains utilities to migrate old territory strings

### Leads Research System
- **Purpose**: Find newly registered Australian businesses to add as leads
- **Data Sources**:
  1. **Google Business Profiles** - Search local businesses by location and type
  2. **Australian Business Register (ABR)** - Search registered ABNs by name or postcode
- **Google Places Features**:
  - Search by suburb/postcode and business type
  - Filter for "Likely New" businesses (fewer than 50 reviews)
  - Shows rating, phone, website
  - One-click "Add as Lead" conversion
- **ABR Features**:
  - Search by business name or postcode
  - View ABN details, entity type, GST status
  - One-click "Add as Lead" conversion
- **API Endpoints**:
  - `GET /api/google-places/search?location=...&type=...` - Search Google Business Profiles
  - `GET /api/google-places/details/:placeId` - Get place details
  - `GET /api/abr/search-name?name=...` - Search ABR by name
  - `GET /api/abr/search-postcode?postcode=...` - Search ABR by postcode
  - `GET /api/abr/abn/:abn` - Get detailed ABN information
- **Requirements**:
  - `GOOGLE_PLACES_API_KEY` - Google Cloud Places API key
  - `ABR_GUID` - Free API key from https://abr.business.gov.au/Tools/WebServices
- **Location**: `client/src/pages/research.tsx`

### Marketing Website (battlescore.com.au)
- **Purpose**: SEO-optimized public website targeting "business consultant Brisbane" and related keywords
- **Routes** (public, no auth required):
  - `/marketing` - Homepage with hero, services preview, testimonials, CTAs
  - `/marketing/services` - Detailed service pages (consulting, sales coaching, growth strategy, leadership)
  - `/marketing/about` - Company story, values, credentials, methodologies
  - `/marketing/contact` - Contact form with discovery call booking
- **SEO Features**:
  - `SEOHead` component for meta tags, Open Graph, canonical URLs
  - JSON-LD structured data (LocalBusiness, Service, AboutPage, ContactPage schemas)
  - `/sitemap.xml` - Dynamic XML sitemap for search engines
  - `/robots.txt` - Crawler directives (allow marketing, disallow app routes)
- **Target Keywords**: business consultant brisbane, business advisor brisbane, small business advisor brisbane, business coaching brisbane, business mentor brisbane, sales coaching brisbane, growth strategy brisbane
- **Components**:
  - `MarketingLayout` - Public header/footer with navigation
  - `SEOHead` - Dynamic meta tag and schema injection
- **Domain**: battlescore.com.au (configure DNS to point to Replit deployment)

### AI Movement Tips System
- **Purpose**: "Chess cheat" style strategic recommendations for moving clients between lifecycle stages
- **Stages**: onboarding → steady_state → growth_plays (or watchlist for at-risk clients)
- **API Endpoint**: `POST /api/clients/:id/movement-tip`
- **AI Model**: GPT-4o-mini with NEPQ, Jeb Blount, Chris Voss sales frameworks
- **Response Format**: headline, reasoning, actions (with framework tags), blocking factors
- **Caching**: Server-side in-memory cache with 6-hour TTL, forceRefresh parameter to bypass
- **UI**: AccountMovementTips dialog triggered from lightbulb icon on ClientKanbanCard

### Client App Integration System
- **Purpose**: Connect external client business apps (e.g., Automotive All-Stars) to Momentum for live data flow
- **Pairing Flow**:
  1. Click "Connect App" button in client card's Integrations tab
  2. System generates 12-character pairing code (5-minute expiry)
  3. External app enters code to validate and receive permanent integration secret
  4. Integration secret stored for ongoing API authentication
- **API Endpoints**:
  - `POST /api/integrations/generate-pairing-code` - Generate short-lived pairing code
  - `POST /api/integrations/pair` - Validate code and return integration secret
  - `POST /api/integrations/events` - Receive events from connected apps (Bearer token auth)
  - `GET /api/integrations/client/:clientId` - Get integration status for a client
- **Firestore Schema**:
  - `orgs/{orgId}/pairingCodes/{pairingCodeId}` - Short-lived pairing codes
  - `orgs/{orgId}/clients/{clientId}/integrations/{integrationId}` - Permanent integration records
  - `orgs/{orgId}/clients/{clientId}/integrationEvents/{eventId}` - Received events from apps
- **Event Types**: kpi_snapshot, booking, revenue, customer_activity, job_completed, custom
- **Types**: `PairingCode`, `ClientIntegration`, `IntegrationEvent`, `KPISnapshot` in `client/src/lib/types.ts`

### Build and Development
- Development: `npm run dev` (runs tsx for server with Vite middleware)
- Production Build: `npm run build` (builds client with Vite, bundles server with esbuild)
- Database Push: `npm run db:push` (applies schema to database)

## External Dependencies

### Database
- **PostgreSQL**: Primary database (requires `DATABASE_URL` environment variable)
- **Drizzle ORM**: Type-safe database queries and schema management

### AI Integration (Planned)
- **OpenAI API**: AI features should be called only from server-side (Cloud Functions pattern)
- Currently mocked in `AgentPanel.tsx`

### UI/Component Libraries
- **Radix UI**: Accessible primitive components (dialog, dropdown, tabs, etc.)
- **Recharts**: Charting library for dashboard visualizations
- **Lucide React**: Icon library
- **date-fns**: Date manipulation utilities

### Replit-Specific
- `@replit/vite-plugin-runtime-error-modal`: Error overlay in development
- `@replit/vite-plugin-cartographer`: Development tooling
- `@replit/vite-plugin-dev-banner`: Development banner

### Authentication & Authorization
- **Firebase Authentication**: Google Sign-In and Email/Password authentication
- **2-Stage Auth Gating**: 
  1. `authReady`: Firebase Auth state resolved, user signed in
  2. `membershipReady`: Membership doc verified at `/orgs/{orgId}/members/{uid}` with `active=true`
- All Firestore queries are blocked until both stages complete
- User profile stored at `/users/{uid}` with `orgId` reference

### Firestore Structure
All data is stored under organization scope: `orgs/{orgId}/`

**Collections:**
- `members` - Organization membership records
- `leads` - Sales pipeline leads
- `clients` - Converted client records
- `activities` - Activity log (calls, emails, meetings)
- `tasks` - Tasks with Daily Plan integration
- `dailyPlans` - Daily plan documents
- `aiBriefs` - AI-generated morning briefs
- `aiDebriefs` - AI-generated end-of-day reviews
- `actionRecommendations` - AI action queue recommendations
- `pairingCodes` - Short-lived pairing codes for app integrations (status: pending/used/expired)
- `clients/{clientId}/integrations` - Permanent integration records for connected apps
- `clients/{clientId}/integrationEvents` - Events received from connected apps

### Required Firestore Composite Indexes (MANDATORY)

Create these in Firebase Console → Firestore Database → Indexes:

**1. activities (activity feeds, lead timelines):**
```
Collection ID: activities (collection group scope)
Fields:
- leadId (Ascending)
- createdAt (Descending)
- __name__ (Descending)
```

**2. activities (alternate - activities by lead ordered by time):**
```
Collection ID: activities (collection group scope)
Fields:
- leadId (Ascending)
- createdAt (Ascending)
- __name__ (Ascending)
```

**3. tasks (Daily Plan, Tasks page, Calendar, AI planning):**
```
Collection ID: tasks (collection group scope)
Fields:
- planDate (Ascending)
- userId (Ascending)
- sortOrder (Ascending)
- __name__ (Ascending)
```

**4. actionRecommendations (AI Agent suggestions):**
```
Collection ID: actionRecommendations (collection group scope)
Fields:
- planDate (Ascending)
- userId (Ascending)
- priorityScore (Descending)
- __name__ (Descending)
```

**5. activities (client activity history - REQUIRED for Activity tab):**
```
Collection ID: activities (collection group scope)
Fields:
- clientId (Ascending)
- createdAt (Descending)
- __name__ (Descending)
```

**6. tasks (client tasks - REQUIRED for Activity tab):**
```
Collection ID: tasks (collection group scope)
Fields:
- clientId (Ascending)
- dueAt (Ascending)
- __name__ (Ascending)
```

**Index Creation Steps:**
1. Go to Firebase Console → Firestore Database → Indexes
2. Click "Add Index" for each index above
3. Set Collection Group scope if queries span multiple orgs
4. Wait for each index to build (may take a few minutes)
5. Verify no "index required" errors in browser console

### Date Format Convention (NON-NEGOTIABLE)
- **User-facing dates**: DD-MM-YYYY format (e.g., "05-01-2026")
- **Internal sorting key**: YYYY-MM-DD format stored in `planDateKey` field
- Helper functions in `client/src/lib/types.ts`:
  - `formatDateDDMMYYYY(date)` - Convert Date to DD-MM-YYYY
  - `parseDateDDMMYYYY(str)` - Parse DD-MM-YYYY to Date
  - `toPlanDateKey(ddmmyyyy)` - Convert DD-MM-YYYY to YYYY-MM-DD
  - `fromPlanDateKey(yyyymmdd)` - Convert YYYY-MM-DD to DD-MM-YYYY