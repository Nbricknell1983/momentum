import { useState, useEffect } from 'react';
import { Switch, Route, useLocation } from 'wouter';
import { Provider } from 'react-redux';
import { store } from './store';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AppSidebar from '@/components/AppSidebar';
import TopBar from '@/components/TopBar';
import ImpersonationBanner from '@/components/ImpersonationBanner';
import AISalesEngine from '@/components/AISalesEngine';
import DashboardPage from '@/pages/dashboard';
import PipelinePage from '@/pages/pipeline';
import NurturePage from '@/pages/nurture';
import TasksPage from '@/pages/tasks';
import DailyPlanPage from '@/pages/daily-plan';
import SettingsPage from '@/pages/settings';
import ClientsPage from '@/pages/clients';
import ClientPipelinePage from '@/pages/client-pipeline';
import ResearchPage from '@/pages/research';
import ManagementPage from '@/pages/management';
import BullpenPage from '@/pages/bullpen';
import OpenClawSetupPage from '@/pages/openclaw-setup';
import MyWorkPage from '@/pages/my-work';
import RoutesOverviewPage from '@/pages/routes-overview';
import QueueHealthPage from '@/pages/admin/QueueHealthPage';
import AutopilotSettingsPage from '@/pages/admin/AutopilotSettingsPage';
import AgentsPage from '@/pages/agents';
import ExpansionPage from '@/pages/expansion';
import CadencePage from '@/pages/cadence';
import LoginPage from '@/pages/login';
import ReportPage from '@/pages/report';
import StrategyReportPage from '@/pages/strategy-report';
import ClientPortalPage from '@/pages/client-portal';
import PortalSharePage from '@/pages/portal-share';
import NotFound from '@/pages/not-found';
import MarketingHome from '@/pages/marketing/index';
import MarketingServices from '@/pages/marketing/services';
import MarketingAbout from '@/pages/marketing/about';
import MarketingContact from '@/pages/marketing/contact';
import { useFirestoreSync } from '@/lib/firestoreSync';
import { Loader2 } from 'lucide-react';

function ManagerGate({ component: Component }: { component: React.ComponentType }) {
  const { effectiveIsManager } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!effectiveIsManager) setLocation('/dashboard');
  }, [effectiveIsManager, setLocation]);
  if (!effectiveIsManager) return null;
  return <Component />;
}

function ProtectedRoutes() {
  return (
    <Switch>
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/pipeline" component={PipelinePage} />
      <Route path="/nurture" component={NurturePage} />
      <Route path="/client-pipeline" component={ClientPipelinePage} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/research" component={ResearchPage} />
      <Route path="/list" component={PipelinePage} />
      <Route path="/forecast" component={DashboardPage} />
      <Route path="/daily-plan" component={DailyPlanPage} />
      <Route path="/tasks" component={TasksPage} />
      <Route path="/my-work" component={MyWorkPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/management" component={ManagementPage} />
      <Route path="/bullpen">{() => <ManagerGate component={BullpenPage} />}</Route>
      <Route path="/openclaw-setup">{() => <ManagerGate component={OpenClawSetupPage} />}</Route>
      <Route path="/routes">{() => <ManagerGate component={RoutesOverviewPage} />}</Route>
      <Route path="/admin/queue-health">{() => <ManagerGate component={QueueHealthPage} />}</Route>
      <Route path="/admin/autopilot-settings">{() => <ManagerGate component={AutopilotSettingsPage} />}</Route>
      <Route path="/agents">{() => <ManagerGate component={AgentsPage} />}</Route>
      <Route path="/expansion">{() => <ManagerGate component={ExpansionPage} />}</Route>
      <Route path="/cadence">{() => <ManagerGate component={CadencePage} />}</Route>
      <Route path="/portal/:clientId" component={ClientPortalPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

type EngineSection = 'pre_call' | 'objection' | 'follow_up' | 'prospect';

function AppLayout() {
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [aiSection, setAiSection] = useState<EngineSection | null>(null);
  const { user, orgId, loading, authReady, membershipReady, orgError, isManager } = useAuth();
  const [, setLocation] = useLocation();

  const { leadsReady, clientsReady } = useFirestoreSync({
    orgId: orgId ?? null,
    userId: user?.uid ?? null,
    isManager,
    authReady,
    membershipReady,
  });

  useEffect(() => {
    if (authReady && !user) {
      console.log('[App] authReady and no user, redirecting to login');
      setLocation('/login');
    }
  }, [authReady, user, setLocation]);

  useEffect(() => {
    const handler = (e: CustomEvent<{ section: EngineSection }>) => {
      setAiSection(e.detail.section);
      setIsAgentOpen(true);
    };
    window.addEventListener('openAISalesEngine', handler as EventListener);
    return () => window.removeEventListener('openAISalesEngine', handler as EventListener);
  }, []);


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
    // orgError screen rendered below — don't gate on leadsReady here
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'linear-gradient(135deg, #0d0520 0%, #1e0d52 50%, #0d0520 100%)' }}>
        <div className="text-center space-y-6 px-6 max-w-md">
          <img src="/momentum-logo.png" alt="Momentum" className="h-10 w-auto object-contain mx-auto" style={{ filter: 'brightness(0) invert(1) drop-shadow(0 0 12px rgba(139,92,246,0.6))' }} />
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-8 space-y-5" style={{ backdropFilter: 'blur(20px)', boxShadow: '0 0 60px rgba(109,40,217,0.15)' }}>
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-violet-600/20 border border-violet-500/30 mx-auto">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-violet-400" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg mb-2">Access not yet set up</h2>
              <p className="text-violet-200/60 text-sm leading-relaxed">
                Your account isn't linked to an organisation yet. Momentum is invite-only — get in touch and we'll get you set up fast.
              </p>
            </div>
            <div className="space-y-2.5">
              <a href="mailto:nathan@battlescore.com.au" className="flex items-center gap-2.5 w-full rounded-xl px-4 py-2.5 bg-violet-600 hover:bg-violet-500 transition-colors text-white text-sm font-medium justify-center shadow-lg shadow-violet-900/40">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7"/></svg>
                nathan@battlescore.com.au
              </a>
              <a href="tel:0403338733" className="flex items-center gap-2.5 w-full rounded-xl px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-white text-sm font-medium justify-center">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" strokeLinejoin="round" /></svg>
                0403 338 733
              </a>
            </div>
            <button
              onClick={async () => { const { getAuth, signOut } = await import('firebase/auth'); await signOut(getAuth()); }}
              className="w-full text-xs text-violet-300/40 hover:text-violet-300/70 transition-colors pt-1"
            >
              ← Sign out and try a different account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!membershipReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!leadsReady || !clientsReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading pipeline...</p>
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
      <div className="flex flex-col h-screen w-full">
        <ImpersonationBanner />
        <div className="flex flex-1 min-h-0 w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0">
            <TopBar onAgentClick={() => setIsAgentOpen(true)} />
            <main className="flex-1 overflow-hidden">
              <ProtectedRoutes />
            </main>
          </div>
        </div>
      </div>
      <AISalesEngine 
        isOpen={isAgentOpen} 
        onClose={() => { setIsAgentOpen(false); setAiSection(null); }}
        activeSection={aiSection}
      />
    </SidebarProvider>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={MarketingHome} />
      <Route path="/marketing" component={MarketingHome} />
      <Route path="/marketing/services" component={MarketingServices} />
      <Route path="/marketing/about" component={MarketingAbout} />
      <Route path="/marketing/contact" component={MarketingContact} />
      <Route path="/services" component={MarketingServices} />
      <Route path="/about" component={MarketingAbout} />
      <Route path="/contact" component={MarketingContact} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signin" component={LoginPage} />
      <Route path="/report/:reportId" component={ReportPage} />
      <Route path="/strategy/:reportId" component={StrategyReportPage} />
      <Route path="/share/:token" component={PortalSharePage} />
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
