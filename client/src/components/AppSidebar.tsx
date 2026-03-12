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

const navItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Pipeline', url: '/pipeline', icon: Kanban },
  { title: 'Nurture', url: '/nurture', icon: Heart },
  { title: 'Clients', url: '/clients', icon: Users },
  { title: 'Research', url: '/research', icon: Search },
  { title: 'Daily Plan', url: '/daily-plan', icon: Calendar },
  { title: 'Tasks', url: '/tasks', icon: CheckSquare },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const managerNavItems = [
  { title: 'Management', url: '/management', icon: BarChart3 },
];

export default function AppSidebar() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { isManager, user } = useAuth();

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
        {isManager && (
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
