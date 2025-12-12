import { Search, Bell, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setSearchQuery } from '@/store';

interface TopBarProps {
  onAgentClick?: () => void;
}

export default function TopBar({ onAgentClick }: TopBarProps) {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.app.user);
  const searchQuery = useSelector((state: RootState) => state.app.searchQuery);

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
          <span className="hidden sm:inline">Agent</span>
        </Button>
        <Button variant="ghost" size="icon" data-testid="button-notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <Avatar className="h-8 w-8" data-testid="avatar-user">
          <AvatarFallback className="text-xs">
            {user?.name?.split(' ').map(n => n[0]).join('') || 'U'}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
