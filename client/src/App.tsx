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
  const { user, orgId, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      setLocation('/login');
    }
  }, [loading, user, setLocation]);

  useEffect(() => {
    async function loadLeads() {
      if (!orgId) return;
      try {
        const leads = await fetchLeads(orgId);
        if (leads.length > 0) {
          dispatch(setLeads(leads));
        }
      } catch (error) {
        console.error('Error loading leads from Firestore:', error);
      }
    }
    if (user && orgId) {
      loadLeads();
    }
  }, [dispatch, user, orgId]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
