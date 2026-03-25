import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Kanban,
  Calendar,
  CheckSquare,
  Settings,
  Moon,
  Sun,
  Heart,
  Users,
  Search,
  BarChart3,
  Radio,
  Zap,
  Inbox,
  Map,
  Activity,
  Bot,
  Brain,
  TrendingUp,
  Bell,
  Mail,
  LineChart,
  Send,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { useTheme } from './ThemeProvider';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const navItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Pipeline', url: '/pipeline', icon: Kanban },
  { title: 'Nurture', url: '/nurture', icon: Heart },
  { title: 'Clients', url: '/clients', icon: Users },
  { title: 'Research', url: '/research', icon: Search },
  { title: 'My Work', url: '/my-work', icon: Inbox },
  { title: 'Daily Plan', url: '/daily-plan', icon: Calendar },
  { title: 'Tasks', url: '/tasks', icon: CheckSquare },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const managerNavItems = [
  { title: 'Exec Dashboard',   url: '/exec',         icon: LineChart },
  { title: 'Management',       url: '/management',   icon: BarChart3 },
  { title: 'Agent Command',    url: '/agents',       icon: Brain },
  { title: 'Expansion Engine', url: '/expansion',   icon: TrendingUp },
  { title: 'Cadence',          url: '/cadence',     icon: Bell },
  { title: 'Comms Drafts',     url: '/comms',       icon: Mail },
  { title: 'Execution Queue',  url: '/execution',   icon: Send },
  { title: 'Bullpen',        url: '/bullpen',        icon: Radio },
  { title: 'OpenClaw Setup', url: '/openclaw-setup', icon: Zap },
  { title: 'Route Map',      url: '/routes',         icon: Map },
];

const adminNavItems = [
  { title: 'Queue Health',       url: '/admin/queue-health',       icon: Activity },
  { title: 'Autopilot Settings', url: '/admin/autopilot-settings', icon: Bot },
];

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

export default function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isManager, effectiveIsManager, user, orgId } = useAuth();
  const myWorkCount = useMyWorkCount(orgId ?? null);

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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url !== '/dashboard' && location.startsWith(item.url));
                const isMyWork = item.url === '/my-work';
                const badge = isMyWork && myWorkCount > 0 ? myWorkCount : null;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(' ', '-')}`}>
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {badge !== null && (
                          <span className="ml-auto text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-1.5 py-0.5 leading-none">
                            {badge}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {effectiveIsManager && isManager && (
          <SidebarGroup>
            <SidebarGroupLabel>Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managerNavItems.map((item) => {
                  const isActive = location === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {effectiveIsManager && isManager && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => {
                  const isActive = location.startsWith(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(' ', '-')}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
            {theme === 'light' ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <Sun className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
