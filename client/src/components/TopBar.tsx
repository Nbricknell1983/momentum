import { Search, Bell, Sparkles, LogOut, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setSearchQuery } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'wouter';

interface TopBarProps {
  onAgentClick?: () => void;
}

export default function TopBar({ onAgentClick }: TopBarProps) {
  const dispatch = useDispatch();
  const { user: authUser, signOut, userRole } = useAuth();
  const searchQuery = useSelector((state: RootState) => state.app.searchQuery);

  const initials = authUser?.displayName?.split(' ').map(n => n[0]).join('') || authUser?.email?.charAt(0).toUpperCase() || 'U';

  return (
    <header className="h-16 flex items-center justify-between gap-4 px-4 border-b bg-background">
      <div className="flex items-center gap-4">
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        <div className="relative max-w-md w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="default"
          onClick={onAgentClick}
          className="gap-2"
          data-testid="button-agent"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">AI Sales Engine</span>
        </Button>
        <Button variant="ghost" size="icon" data-testid="button-notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0" data-testid="button-user-menu">
              <Avatar className="h-8 w-8">
                {authUser?.photoURL && <AvatarImage src={authUser.photoURL} alt={authUser.displayName || ''} />}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium text-foreground" data-testid="text-user-name">
                  {authUser?.displayName || 'User'}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="text-user-email">
                  {authUser?.email}
                </p>
                {userRole && (
                  <p className="text-xs text-muted-foreground capitalize">{userRole}</p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer" data-testid="link-settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={signOut}
              className="cursor-pointer text-destructive focus:text-destructive"
              data-testid="button-sign-out"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
