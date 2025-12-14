import { useState, useEffect } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { Provider, useDispatch } from 'react-redux';
import { store, setLeads } from './store';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AppSidebar from '@/components/AppSidebar';
import TopBar from '@/components/TopBar';
import AgentPanel from '@/components/AgentPanel';
import DashboardPage from '@/pages/dashboard';
import PipelinePage from '@/pages/pipeline';
import NurturePage from '@/pages/nurture';
import TasksPage from '@/pages/tasks';
import DailyPlanPage from '@/pages/daily-plan';
import SettingsPage from '@/pages/settings';
import LoginPage from '@/pages/login';
import NotFound from '@/pages/not-found';
import { fetchLeads } from '@/lib/firestoreService';
import { Loader2 } from 'lucide-react';

function ProtectedRoutes() {
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
  const dispatch = useDispatch();
  const { user, orgId, loading, authReady, orgError } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (authReady && !user) {
      console.log('[App] authReady and no user, redirecting to login');
      setLocation('/login');
    }
  }, [authReady, user, setLocation]);

  useEffect(() => {
    async function loadLeads() {
      if (!authReady || !orgId) {
        console.log('[App] Skipping lead fetch - authReady:', authReady, 'orgId:', orgId);
        return;
      }
      console.log('[App] Auth ready, fetching leads for org:', orgId);
      try {
        const leads = await fetchLeads(orgId, true);
        console.log('[App] Fetched', leads.length, 'leads');
        dispatch(setLeads(leads));
      } catch (error) {
        console.error('[App] Error loading leads from Firestore:', error);
      }
    }
    if (authReady && user && orgId) {
      loadLeads();
    }
  }, [dispatch, user, orgId, authReady]);

  if (loading || !authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (orgError || !orgId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <p className="text-lg text-destructive">{orgError || 'Organisation not initialised.'}</p>
          <p className="text-sm text-muted-foreground">Please try signing out and signing in again.</p>
        </div>
      </div>
    );
  }

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
            <ProtectedRoutes />
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

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route component={AppLayout} />
    </Switch>
  );
}

function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <AuthProvider>
              <AppRoutes />
              <Toaster />
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  );
}

export default App;
