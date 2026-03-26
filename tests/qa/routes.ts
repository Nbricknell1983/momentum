import type { RouteDefinition } from './types';

export const ROUTES: RouteDefinition[] = [
  // ── Unauthenticated public routes ──────────────────────────────────────────
  {
    path: '/login',
    label: 'Login Page',
    requiresAuth: false,
    requiresManager: false,
    priority: 1,
    tags: ['auth', 'public'],
  },

  // ── Core user routes (priority 1-2) ────────────────────────────────────────
  {
    path: '/dashboard',
    label: 'Dashboard',
    requiresAuth: true,
    requiresManager: false,
    priority: 1,
    tags: ['dashboard', 'core'],
  },
  {
    path: '/pipeline',
    label: 'Pipeline / Kanban',
    requiresAuth: true,
    requiresManager: false,
    priority: 1,
    tags: ['pipeline', 'core', 'list'],
  },
  {
    path: '/clients',
    label: 'Clients',
    requiresAuth: true,
    requiresManager: false,
    priority: 1,
    tags: ['clients', 'core', 'list'],
  },
  {
    path: '/nurture',
    label: 'Nurture',
    requiresAuth: true,
    requiresManager: false,
    priority: 2,
    tags: ['nurture', 'cadence'],
  },
  {
    path: '/daily-plan',
    label: 'Daily Plan',
    requiresAuth: true,
    requiresManager: false,
    priority: 2,
    tags: ['planning', 'core'],
  },
  {
    path: '/tasks',
    label: 'Tasks',
    requiresAuth: true,
    requiresManager: false,
    priority: 2,
    tags: ['tasks', 'core'],
  },
  {
    path: '/my-work',
    label: 'My Work',
    requiresAuth: true,
    requiresManager: false,
    priority: 2,
    tags: ['queue', 'core'],
  },
  {
    path: '/research',
    label: 'Research / Prospecting',
    requiresAuth: true,
    requiresManager: false,
    priority: 2,
    tags: ['research', 'prospecting'],
  },
  {
    path: '/settings',
    label: 'Settings',
    requiresAuth: true,
    requiresManager: false,
    priority: 3,
    tags: ['settings'],
  },

  // ── Manager routes (priority 2-3) ──────────────────────────────────────────
  {
    path: '/exec',
    label: 'Exec Dashboard',
    requiresAuth: true,
    requiresManager: true,
    priority: 2,
    tags: ['reporting', 'manager', 'tabs'],
  },
  {
    path: '/management',
    label: 'Management',
    requiresAuth: true,
    requiresManager: false,
    priority: 2,
    tags: ['management'],
  },
  {
    path: '/cadence',
    label: 'Cadence',
    requiresAuth: true,
    requiresManager: true,
    priority: 2,
    tags: ['cadence', 'manager', 'tabs'],
  },
  {
    path: '/execution',
    label: 'Execution Queue',
    requiresAuth: true,
    requiresManager: true,
    priority: 2,
    tags: ['execution', 'manager', 'queue'],
  },
  {
    path: '/comms',
    label: 'Comms Drafts',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['comms', 'manager'],
  },
  {
    path: '/expansion',
    label: 'Expansion Engine',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['expansion', 'manager'],
  },
  {
    path: '/referral',
    label: 'Referral Engine',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['referral', 'manager'],
  },
  {
    path: '/briefing',
    label: 'Daily Briefing',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['briefing', 'manager'],
  },
  {
    path: '/agents',
    label: 'Agent Command',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['agents', 'manager'],
  },
  {
    path: '/unified-ops',
    label: 'Unified Ops',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['ops', 'manager'],
  },
  {
    path: '/autopilot',
    label: 'Autopilot Policy',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['autopilot', 'manager'],
  },
  {
    path: '/autopilot-execution',
    label: 'Autopilot Execution',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['autopilot', 'manager'],
  },
  {
    path: '/sweeps',
    label: 'Scheduled Sweeps',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['sweeps', 'manager'],
  },
  {
    path: '/bullpen',
    label: 'Bullpen',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['bullpen', 'manager'],
  },
  {
    path: '/vapi',
    label: 'Vapi Voice Agent',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['vapi', 'voice', 'manager', 'tabs'],
  },
  {
    path: '/erica',
    label: 'Erica Calling System',
    requiresAuth: true,
    requiresManager: true,
    priority: 2,
    tags: ['erica', 'voice', 'manager', 'tabs'],
  },
  {
    path: '/ai-systems-sync',
    label: 'AI Systems Sync',
    requiresAuth: true,
    requiresManager: true,
    priority: 3,
    tags: ['ai', 'sync', 'manager'],
  },
  {
    path: '/openclaw-setup',
    label: 'OpenClaw Setup',
    requiresAuth: true,
    requiresManager: true,
    priority: 4,
    tags: ['setup', 'manager'],
  },
  {
    path: '/routes',
    label: 'Route Map',
    requiresAuth: true,
    requiresManager: true,
    priority: 4,
    tags: ['admin'],
  },

  // ── Admin routes ────────────────────────────────────────────────────────────
  {
    path: '/admin/queue-health',
    label: 'Queue Health',
    requiresAuth: true,
    requiresManager: true,
    priority: 4,
    tags: ['admin'],
  },
  {
    path: '/admin/autopilot-settings',
    label: 'Autopilot Settings',
    requiresAuth: true,
    requiresManager: true,
    priority: 4,
    tags: ['admin', 'settings'],
  },
];

export function getRoutesToTest(opts: {
  authenticated: boolean;
  isManager: boolean;
  skipRoutes?: string[];
  maxPriority?: number;
}): RouteDefinition[] {
  return ROUTES.filter(r => {
    if (opts.skipRoutes?.includes(r.path)) return false;
    if (opts.maxPriority && r.priority > opts.maxPriority) return false;
    if (r.requiresAuth && !opts.authenticated) return false;
    if (r.requiresManager && !opts.isManager) return false;
    return true;
  }).sort((a, b) => a.priority - b.priority);
}
