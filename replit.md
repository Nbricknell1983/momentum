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
3. **Nurture System**: Active and passive nurture modes with cadence automation
4. **Activity Tracking**: One-click logging for calls, emails, meetings, drop-ins
5. **Traffic Light Status**: Visual indicators for lead follow-up urgency
6. **Momentum Scoring**: Daily/weekly metrics tracking against targets
7. **AI Agent Panel**: Context-aware AI assistance (placeholder for OpenAI integration)

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

### Authentication (Planned)
- Schema includes users table with username/password
- Passport.js packages available for authentication implementation