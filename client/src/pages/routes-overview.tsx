import { Link } from 'wouter';
import {
  LayoutDashboard, GitBranch, Bell, Users, Search, Briefcase,
  CalendarDays, CheckSquare, Settings, BarChart2, List, TrendingUp,
  Bot, Shield, Globe, ExternalLink, Map, FileText, Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';

interface RouteEntry {
  path: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
  managerOnly?: boolean;
  publicRoute?: boolean;
  external?: boolean;
}

interface RouteGroup {
  section: string;
  routes: RouteEntry[];
}

const ROUTE_GROUPS: RouteGroup[] = [
  {
    section: 'Core App',
    routes: [
      { path: '/dashboard',      label: 'Dashboard',       icon: LayoutDashboard, description: 'Overview metrics, activity summary, pipeline snapshot' },
      { path: '/pipeline',       label: 'Pipeline',        icon: GitBranch,       description: 'Kanban deal pipeline with stage management' },
      { path: '/nurture',        label: 'Nurture',         icon: Bell,            description: 'Nurture sequences and follow-up management' },
      { path: '/clients',        label: 'Clients',         icon: Users,           description: 'Active client list with health and growth tracking' },
      { path: '/research',       label: 'Research',        icon: Search,          description: 'Lead research, ABR lookup, Google Places data' },
      { path: '/my-work',        label: 'My Work',         icon: Briefcase,       description: 'Team-facing work items assigned by Bullpen' },
      { path: '/daily-plan',     label: 'Daily Plan',      icon: CalendarDays,    description: 'Daily prioritised task and activity plan' },
      { path: '/tasks',          label: 'Tasks',           icon: CheckSquare,     description: 'Task list and completion tracking' },
      { path: '/settings',       label: 'Settings',        icon: Settings,        description: 'Account settings, profile, integrations' },
    ],
  },
  {
    section: 'Management',
    routes: [
      { path: '/management',     label: 'Management Dashboard', icon: BarChart2,  description: 'Team performance overview, pipeline MRR, activity breakdown', managerOnly: true },
      { path: '/bullpen',        label: 'Bullpen',              icon: Bot,        description: 'Internal AI workforce command center, work queue, daily brief', managerOnly: true },
      { path: '/openclaw-setup', label: 'OpenClaw Setup',       icon: Shield,     description: 'OpenClaw agent runtime configuration and skill map', managerOnly: true },
      { path: '/routes',         label: 'Routes Overview',      icon: Map,        description: 'This page — diagnostic route map', managerOnly: true },
    ],
  },
  {
    section: 'Alternate Views',
    routes: [
      { path: '/list',           label: 'Pipeline List View',   icon: List,       description: 'Pipeline in flat list format (same data as Kanban)' },
      { path: '/forecast',       label: 'Forecast',             icon: TrendingUp, description: 'Revenue forecast view (renders Dashboard page)' },
      { path: '/client-pipeline',label: 'Client Pipeline',      icon: Activity,   description: 'Client delivery pipeline workspace' },
    ],
  },
  {
    section: 'Public / Unauthenticated',
    routes: [
      { path: '/login',          label: 'Login',                icon: Shield,     description: 'Authentication — Google Sign-In and email/password', publicRoute: true },
      { path: '/strategy/:id',   label: 'Strategy Report',      icon: FileText,   description: 'Public DVS strategy report — shareable URL, no auth required', publicRoute: true },
      { path: '/report/:id',     label: 'Client Growth Report', icon: FileText,   description: 'Shareable client growth report — no auth required', publicRoute: true },
      { path: '/',               label: 'Marketing Home',       icon: Globe,      description: 'Public marketing landing page', publicRoute: true },
    ],
  },
];

export default function RoutesOverviewPage() {
  const { isManager } = useAuth();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="page-routes-overview">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Route Map</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All application routes — use for navigation testing and diagnostics.
        </p>
      </div>

      {ROUTE_GROUPS.map(group => (
        <Card key={group.section} className="border bg-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.section}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-1">
            {group.routes.map(route => {
              const Icon = route.icon;
              const isLocked = route.managerOnly && !isManager;

              return (
                <div
                  key={route.path}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors ${
                    isLocked
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-muted/60 cursor-pointer'
                  }`}
                  data-testid={`route-row-${route.path.replace(/[/:]/g, '-')}`}
                >
                  <div className="p-1.5 rounded bg-muted/50 shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isLocked ? (
                        <span className="text-sm font-medium">{route.label}</span>
                      ) : (
                        <Link href={route.path} className="text-sm font-medium hover:underline text-foreground">
                          {route.label}
                        </Link>
                      )}
                      {route.managerOnly && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-400/40 text-violet-600 dark:text-violet-400">
                          manager
                        </Badge>
                      )}
                      {route.publicRoute && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-400/40 text-emerald-600 dark:text-emerald-400">
                          public
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{route.description}</p>
                  </div>

                  <code className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded shrink-0 hidden sm:block">
                    {route.path}
                  </code>

                  {!isLocked && !route.path.includes(':') && (
                    <Link href={route.path}>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground shrink-0" />
                    </Link>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <p className="text-xs text-muted-foreground pb-4">
        Routes with <code className="bg-muted px-1 rounded">:id</code> parameters require a real ID to navigate. Manager-only routes redirect non-managers to <code className="bg-muted px-1 rounded">/dashboard</code>.
      </p>
    </div>
  );
}
