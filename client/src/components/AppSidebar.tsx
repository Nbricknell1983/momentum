import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, Kanban, Calendar, CheckSquare, Settings, Moon, Sun,
  Heart, Users, Search, Brain, TrendingUp, Bell, Mail, Send, GitMerge,
  SlidersHorizontal, RefreshCw, Sparkles, Database, Mic, Inbox, Activity,
  Bot, LineChart, ChevronRight, Shield, UserSearch,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useTheme } from './ThemeProvider';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

// ─── Navigation Structure ────────────────────────────────────────────────────

interface NavItem {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  badge?: boolean;
  tooltip: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
  managerOnly?: boolean;
}

const coreItems: NavItem[] = [
  { title: 'Dashboard',  url: '/dashboard',   icon: LayoutDashboard, tooltip: 'Overview of your pipeline, targets, and activity' },
  { title: 'Pipeline',   url: '/pipeline',    icon: Kanban, tooltip: 'Manage leads through your sales stages' },
  { title: 'Clients',    url: '/clients',     icon: Users, tooltip: 'View and manage your active clients' },
  { title: 'Daily Plan', url: '/daily-plan',  icon: Calendar, tooltip: 'Your AI-managed schedule and daily targets' },
  { title: 'My Work',    url: '/my-work',     icon: Inbox, badge: true, tooltip: 'Tasks and actions assigned to you' },
];

const salesSection: NavSection = {
  label: 'Sales',
  defaultOpen: false,
  items: [
    { title: 'Nurture',     url: '/nurture',    icon: Heart, tooltip: 'Warm leads with automated follow-up sequences' },
    { title: 'Research',     url: '/research',   icon: Search, tooltip: 'Research prospects and gather business intelligence' },
    { title: 'Erica',       url: '/erica',      icon: Mic, tooltip: 'AI voice agent — calls, nurtures, and books appointments' },
    { title: 'Cadence',     url: '/cadence',     icon: Bell, tooltip: 'Manage follow-up timing and communication schedules' },
    { title: 'Referrals',   url: '/referral',    icon: GitMerge, tooltip: 'Track and manage client referral opportunities' },
    { title: 'Prospects',   url: '/research',    icon: UserSearch, tooltip: 'Discover new businesses that need your services' },
  ],
};

const intelligenceSection: NavSection = {
  label: 'Intelligence',
  defaultOpen: false,
  managerOnly: true,
  items: [
    { title: 'Exec Dashboard', url: '/exec',             icon: LineChart, tooltip: 'Performance overview — revenue, pipeline, and team metrics' },
    { title: 'Daily Brief',    url: '/briefing',          icon: Sparkles, tooltip: 'AI-generated morning briefing with priorities and insights' },
    { title: 'Expansion',      url: '/expansion',         icon: TrendingUp, tooltip: 'Growth opportunities — upsell, new markets, and scope expansion' },
    { title: 'AI Systems',     url: '/ai-systems-sync',   icon: Database, tooltip: 'Sync status between Momentum and AI Systems delivery engine' },
  ],
};

const automationSection: NavSection = {
  label: 'Automation',
  defaultOpen: false,
  managerOnly: true,
  items: [
    { title: 'Agent Control',   url: '/agents',               icon: Brain, tooltip: 'Manage AI agents — start, stop, configure behaviour' },
    { title: 'Autopilot',       url: '/autopilot',            icon: SlidersHorizontal, tooltip: 'Rules that control what agents can do automatically' },
    { title: 'Sweeps',          url: '/sweeps',               icon: RefreshCw, tooltip: 'Scheduled scans that detect follow-up and churn opportunities' },
    { title: 'Comms',           url: '/comms',                icon: Mail, tooltip: 'Draft and review automated communications before sending' },
    { title: 'Execution',       url: '/execution',            icon: Send, tooltip: 'Queue of pending actions waiting to be executed' },
  ],
};

const adminSection: NavSection = {
  label: 'Admin',
  defaultOpen: false,
  managerOnly: true,
  items: [
    { title: 'System Health',   url: '/admin/queue-health',         icon: Activity, tooltip: 'Monitor agent queues, failures, and system status' },
    { title: 'Autopilot Config', url: '/admin/autopilot-settings',  icon: Bot, tooltip: 'Configure automation rules and safety limits' },
    { title: 'Security',        url: '/admin/queue-health',         icon: Shield, tooltip: 'Security alerts, credential status, and vulnerability scans' },
    { title: 'Tasks',           url: '/tasks',                      icon: CheckSquare, tooltip: 'All tasks across the organisation' },
    { title: 'Settings',        url: '/settings',                   icon: Settings, tooltip: 'Organisation settings, integrations, and user management' },
  ],
};

const allSections: NavSection[] = [salesSection, intelligenceSection, automationSection, adminSection];

// ─── My Work Badge Counter ───────────────────────────────────────────────────

function useMyWorkCount(orgId: string | null) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!orgId || !db) return;
    const q = query(
      collection(db, 'orgs', orgId, 'bullpenWork'),
      where('status', '==', 'detected'),
    );
    const unsub = onSnapshot(q, (snap) => setCount(snap.size), () => {});
    return () => unsub();
  }, [orgId]);
  return count;
}

// ─── Sidebar Component ───────────────────────────────────────────────────────

export default function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isManager, effectiveIsManager, user, orgId } = useAuth();
  const myWorkCount = useMyWorkCount(orgId ?? null);
  const showManager = effectiveIsManager && isManager;

  return (
    <Sidebar>
      <SidebarHeader className="flex items-center justify-center px-4 py-3 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center" data-testid="link-logo-home">
          <img
            src="/momentum-logo.png"
            alt="Momentum"
            className="h-10 w-auto object-contain"
            data-testid="img-app-logo"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Core — always visible, never collapses */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {coreItems.map((item) => (
                <NavLink
                  key={item.url}
                  item={item}
                  isActive={location === item.url || (item.url !== '/dashboard' && location.startsWith(item.url))}
                  badge={item.badge && myWorkCount > 0 ? myWorkCount : undefined}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Collapsible sections */}
        {allSections.map((section) => {
          if (section.managerOnly && !showManager) return null;
          return (
            <CollapsibleSection
              key={section.label}
              section={section}
              location={location}
            />
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-medium text-foreground">
                {(user?.displayName || user?.email || '?').charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="text-xs text-muted-foreground truncate" data-testid="text-sidebar-user">
              {user?.displayName || user?.email || ''}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
          >
            {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

// ─── Collapsible Section ─────────────────────────────────────────────────────

function CollapsibleSection({ section, location }: { section: NavSection; location: string }) {
  const hasActiveChild = section.items.some(item => location === item.url || location.startsWith(item.url));
  const [open, setOpen] = useState(section.defaultOpen || hasActiveChild);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer select-none flex items-center justify-between hover:bg-sidebar-accent/50 rounded-md px-2 transition-colors">
            <span>{section.label}</span>
            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => (
                <NavLink
                  key={item.url + item.title}
                  item={item}
                  isActive={location === item.url}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

// ─── Single Nav Link ─────────────────────────────────────────────────────────

function NavLink({ item, isActive, badge }: { item: NavItem; isActive: boolean; badge?: number }) {
  return (
    <SidebarMenuItem>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <SidebarMenuButton asChild isActive={isActive}>
            <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.title}</span>
              {badge !== undefined && badge > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-1.5 py-0.5 leading-none">
                  {badge}
                </span>
              )}
            </Link>
          </SidebarMenuButton>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[200px] text-xs">
          {item.tooltip}
        </TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  );
}
