import { useState } from 'react';
import { Switch, Route } from 'wouter';
import { Provider } from 'react-redux';
import { store } from './store';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppSidebar from '@/components/AppSidebar';
import TopBar from '@/components/TopBar';
import AgentPanel from '@/components/AgentPanel';
import DashboardPage from '@/pages/dashboard';
import PipelinePage from '@/pages/pipeline';
import NurturePage from '@/pages/nurture';
import TasksPage from '@/pages/tasks';
import DailyPlanPage from '@/pages/daily-plan';
import SettingsPage from '@/pages/settings';
import NotFound from '@/pages/not-found';

function Router() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/pipeline" component={PipelinePage} />
      <Route path="/nurture" component={NurturePage} />
      <Route path="/list" component={PipelinePage} />
      <Route path="/forecast" component={DashboardPage} />
      <Route path="/daily-plan" component={DailyPlanPage} />
      <Route path="/tasks" component={TasksPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  const [isAgentOpen, setIsAgentOpen] = useState(false);

  const sidebarStyle = {
    '--sidebar-width': '16rem',
    '--sidebar-width-icon': '3rem',
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar onAgentClick={() => setIsAgentOpen(true)} />
          <main className="flex-1 overflow-hidden">
            <Router />
          </main>
        </div>
      </div>
      <AgentPanel 
        isOpen={isAgentOpen} 
        onClose={() => setIsAgentOpen(false)} 
        context={{ type: 'dashboard' }}
      />
    </SidebarProvider>
  );
}

function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <AppLayout />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  );
}

export default App;
