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
}

interface NavSection {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
  managerOnly?: boolean;
}

const coreItems: NavItem[] = [
  { title: 'Dashboard',  url: '/dashboard',   icon: LayoutDashboard },
  { title: 'Pipeline',   url: '/pipeline',    icon: Kanban },
  { title: 'Clients',    url: '/clients',     icon: Users },
  { title: 'Daily Plan', url: '/daily-plan',  icon: Calendar },
  { title: 'My Work',    url: '/my-work',     icon: Inbox, badge: true },
];

const salesSection: NavSection = {
  label: 'Sales',
  defaultOpen: false,
  items: [
    { title: 'Nurture',     url: '/nurture',    icon: Heart },
    { title: 'Research',     url: '/research',   icon: Search },
    { title: 'Erica',       url: '/erica',      icon: Mic },
    { title: 'Cadence',     url: '/cadence',     icon: Bell },
    { title: 'Referrals',   url: '/referral',    icon: GitMerge },
    { title: 'Prospects',   url: '/research',    icon: UserSearch },
  ],
};

const intelligenceSection: NavSection = {
  label: 'Intelligence',
  defaultOpen: false,
  managerOnly: true,
  items: [
    { title: 'Exec Dashboard', url: '/exec',             icon: LineChart },
    { title: 'Daily Brief',    url: '/briefing',          icon: Sparkles },
    { title: 'Expansion',      url: '/expansion',         icon: TrendingUp },
    { title: 'AI Systems',     url: '/ai-systems-sync',   icon: Database },
  ],
};

const automationSection: NavSection = {
  label: 'Automation',
  defaultOpen: false,
  managerOnly: true,
  items: [
    { title: 'Agent Control',   url: '/agents',               icon: Brain },
    { title: 'Autopilot',       url: '/autopilot',            icon: SlidersHorizontal },
    { title: 'Sweeps',          url: '/sweeps',               icon: RefreshCw },
    { title: 'Comms',           url: '/comms',                icon: Mail },
    { title: 'Execution',       url: '/execution',            icon: Send },
  ],
};

const adminSection: NavSection = {
  label: 'Admin',
  defaultOpen: false,
  managerOnly: true,
  items: [
    { title: 'System Health',   url: '/admin/queue-health',         icon: Activity },
    { title: 'Autopilot Config', url: '/admin/autopilot-settings',  icon: Bot },
    { title: 'Security',        url: '/admin/queue-health',         icon: Shield },
    { title: 'Tasks',           url: '/tasks',                      icon: CheckSquare },
    { title: 'Settings',        url: '/settings',                   icon: Settings },
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
    </SidebarMenuItem>
  );
}
