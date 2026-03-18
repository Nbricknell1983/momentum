import { useState, useMemo, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Link, Redirect } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { RootState } from '@/store';
import type { Lead, Activity, Client, NBAAction } from '@/lib/types';
import { db, doc, getDoc, setDoc } from '@/lib/firebase';
import { differenceInDays, formatDistanceToNow, isToday, format } from 'date-fns';
import {
  Briefcase, TrendingUp, Globe, Search, BarChart3, Star, Users, Shield,
  Settings2, AlertTriangle, CheckCircle2, Clock, Zap, ChevronDown, ChevronRight,
  ExternalLink, RefreshCw, Activity as ActivityIcon, Timer, Ban,
  BriefcaseBusiness, Cpu, Eye, Radio, Compass
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type BullpenStatus = 'active' | 'idle' | 'blocked' | 'needs_attention' | 'awaiting_approval';

interface RoleMetrics {
  id: string;
  name: string;
  icon: typeof Briefcase;
  status: BullpenStatus;
  currentCount: number;
  currentLabel: string;
  blockerCount: number;
  blockerSummary?: string;
  lastActionLabel?: string;
  detail: string;
  linkedPath?: string;
}

interface AttentionItem {
  id: string;
  title: string;
  description: string;
  role: string;
  severity: 'high' | 'medium' | 'low';
  linkedPath?: string;
  linkedLabel?: string;
}

interface AutomationRules {
  workHoursStart: string;
  workHoursEnd: string;
  timezone: string;
  blockSmsOutsideHours: boolean;
  blockEmailOutsideHours: boolean;
  blockCallsOutsideHours: boolean;
  requireApprovalCampaigns: boolean;
  requireApprovalHighRisk: boolean;
  requireApprovalPublish: boolean;
}

const DEFAULT_RULES: AutomationRules = {
  workHoursStart: '08:00',
  workHoursEnd: '17:30',
  timezone: 'Australia/Brisbane',
  blockSmsOutsideHours: true,
  blockEmailOutsideHours: false,
  blockCallsOutsideHours: true,
  requireApprovalCampaigns: true,
  requireApprovalHighRisk: true,
  requireApprovalPublish: true,
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<BullpenStatus, { label: string; color: string; dot: string }> = {
  active:            { label: 'Active',            color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400', dot: 'bg-emerald-500' },
  idle:              { label: 'Idle',              color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',            dot: 'bg-slate-400' },
  blocked:           { label: 'Blocked',           color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',                dot: 'bg-red-500' },
  needs_attention:   { label: 'Needs Attention',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',        dot: 'bg-amber-500' },
  awaiting_approval: { label: 'Awaiting Approval', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',    dot: 'bg-violet-500' },
};

function StatusBadge({ status }: { status: BullpenStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Briefcase; color: string }) {
  return (
    <Card className="border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
          <div className={`p-2 rounded-lg bg-muted/50`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Role Card ────────────────────────────────────────────────────────────────

function RoleCard({ role, expanded, onToggle }: { role: RoleMetrics; expanded: boolean; onToggle: () => void }) {
  const Icon = role.icon;
  const cfg = STATUS_CONFIG[role.status];

  return (
    <Card className="border bg-card hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-muted/50 shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{role.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{role.detail}</p>
            </div>
          </div>
          <StatusBadge status={role.status} />
        </div>

        <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Active</p>
            <p className="text-lg font-bold text-foreground mt-0.5">{role.currentCount}</p>
            <p className="text-[10px] text-muted-foreground">{role.currentLabel}</p>
          </div>
          {role.blockerCount > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Blockers</p>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">{role.blockerCount}</p>
              <p className="text-[10px] text-muted-foreground truncate">{role.blockerSummary}</p>
            </div>
          ) : (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Last Action</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{role.lastActionLabel || 'No recent activity'}</p>
            </div>
          )}
        </div>

        {role.linkedPath && (
          <div className="mt-3">
            <Link href={role.linkedPath}>
              <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1">
                <ExternalLink className="h-3 w-3" /> View Records
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Attention Item ───────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  high:   { color: 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20',    icon: 'text-red-500',   badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  medium: { color: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20', icon: 'text-amber-500', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  low:    { color: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20',  icon: 'text-blue-500',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
};

function AttentionCard({ item }: { item: AttentionItem }) {
  const cfg = SEVERITY_CONFIG[item.severity];
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.color}`}>
      <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.icon}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold">{item.title}</p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.badge}`}>{item.severity.toUpperCase()}</span>
          <span className="text-[10px] text-muted-foreground">{item.role}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
      </div>
      {item.linkedPath && (
        <Link href={item.linkedPath}>
          <Button variant="ghost" size="sm" className="shrink-0 h-7 w-7 p-0">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─── Rule Toggle Row ──────────────────────────────────────────────────────────

function RuleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BullpenPage() {
  const { isManager, orgId, authReady } = useAuth();
  const { toast } = useToast();

  const leads     = useSelector((s: RootState) => s.app.leads);
  const activities = useSelector((s: RootState) => s.app.activities);
  const clients   = useSelector((s: RootState) => s.app.clients);
  const nbaQueue  = useSelector((s: RootState) => s.app.nbaQueue);

  const [rules, setRules] = useState<AutomationRules>(DEFAULT_RULES);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  // ── Load automation rules from Firestore ──────────────────────────────────
  useEffect(() => {
    if (!isManager || !orgId || !authReady) return;
    const ref = doc(db, 'orgs', orgId, 'settings', 'automationRules');
    getDoc(ref)
      .then(snap => {
        if (snap.exists()) setRules({ ...DEFAULT_RULES, ...(snap.data() as Partial<AutomationRules>) });
        setRulesLoaded(true);
      })
      .catch(() => setRulesLoaded(true));
  }, [orgId, authReady]);

  async function saveRules() {
    if (!orgId) return;
    setRulesSaving(true);
    try {
      const ref = doc(db, 'orgs', orgId, 'settings', 'automationRules');
      await setDoc(ref, { ...rules, updatedAt: new Date() }, { merge: true });
      toast({ title: 'Automation rules saved' });
    } catch {
      toast({ title: 'Failed to save rules', variant: 'destructive' });
    } finally {
      setRulesSaving(false);
    }
  }

  function patchRule<K extends keyof AutomationRules>(key: K, value: AutomationRules[K]) {
    setRules(r => ({ ...r, [key]: value }));
  }

  // ── Derived metrics ───────────────────────────────────────────────────────

  const now = new Date();
  const activeClients  = useMemo(() => clients.filter(c => !c.archived), [clients]);
  const activeLeads    = useMemo(() => leads.filter(l => !l.archived && l.stage !== 'lost' && l.stage !== 'won'), [leads]);
  const todayActivities = useMemo(() => activities.filter(a => isToday(new Date(a.createdAt))), [activities]);

  const openNBA       = useMemo(() => nbaQueue.filter(a => a.status === 'open'), [nbaQueue]);
  const overdueLeads  = useMemo(() => activeLeads.filter(l => l.nextContactDate && new Date(l.nextContactDate) < now), [activeLeads]);
  const autonomousClients = useMemo(() => activeClients.filter(c => c.automationMode === 'autonomous'), [activeClients]);
  const aiActiveClients   = useMemo(() => activeClients.filter(c => c.automationMode && c.automationMode !== 'assisted'), [activeClients]);
  const redAmberClients   = useMemo(() => activeClients.filter(c => c.healthStatus === 'red' || c.healthStatus === 'amber'), [activeClients]);
  const blockedClients    = useMemo(() => activeClients.filter(c => c.executionStatus?.overall === 'blocked' || c.executionStatus?.overall === 'needs_input'), [activeClients]);

  const clientsWithSEO     = useMemo(() => activeClients.filter(c => c.seoEngine), [activeClients]);
  const clientsWithWebsite = useMemo(() => activeClients.filter(c => c.websiteEngine), [activeClients]);
  const clientsWithGBP     = useMemo(() => activeClients.filter(c => c.gbpEngine), [activeClients]);
  const clientsWithAds     = useMemo(() => activeClients.filter(c => c.adsEngine), [activeClients]);
  const clientsWithGBPAuth = useMemo(() => activeClients.filter(c => c.gbpLocationName), [activeClients]);
  const clientsWithPrescription = useMemo(() => activeLeads.filter(l => (l as any).growthPrescription), [activeLeads]);

  const mostRecentActivity = useMemo(() => {
    if (!activities.length) return null;
    return [...activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [activities]);

  // Summary counts
  const summaryActiveWorkloads  = aiActiveClients.length + openNBA.length;
  const summaryQueued           = openNBA.length;
  const summaryAwaitingApproval = activeClients.filter(c => c.automationMode === 'supervised').length;
  const summaryBlocked          = blockedClients.length + overdueLeads.length;
  const summaryCompletedToday   = todayActivities.length;
  const summaryClientsAffected  = aiActiveClients.length;

  // ── Needs Attention items ─────────────────────────────────────────────────

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    if (overdueLeads.length > 0) {
      items.push({
        id: 'overdue-leads',
        title: `${overdueLeads.length} lead${overdueLeads.length > 1 ? 's' : ''} with overdue follow-up`,
        description: `Scheduled contact dates have passed. Sales momentum is stalling.`,
        role: 'Sales Specialist',
        severity: overdueLeads.length > 5 ? 'high' : 'medium',
        linkedPath: '/pipeline',
        linkedLabel: 'View Pipeline',
      });
    }

    if (redAmberClients.length > 0) {
      const redCount = redAmberClients.filter(c => c.healthStatus === 'red').length;
      items.push({
        id: 'at-risk-clients',
        title: `${redAmberClients.length} client${redAmberClients.length > 1 ? 's' : ''} at risk`,
        description: `${redCount} critical, ${redAmberClients.length - redCount} amber. Client health requires attention.`,
        role: 'Client Growth Specialist',
        severity: redCount > 0 ? 'high' : 'medium',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    if (blockedClients.length > 0) {
      items.push({
        id: 'blocked-clients',
        title: `${blockedClients.length} client${blockedClients.length > 1 ? 's' : ''} with blocked execution`,
        description: 'AI growth engine stalled — missing inputs or awaiting resolution.',
        role: 'Operations Specialist',
        severity: 'high',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    const clientsMissingOnboarding = activeClients.filter(c => !c.clientOnboarding?.businessContext);
    if (clientsMissingOnboarding.length > 0) {
      items.push({
        id: 'missing-onboarding',
        title: `${clientsMissingOnboarding.length} client${clientsMissingOnboarding.length > 1 ? 's' : ''} missing onboarding context`,
        description: 'SEO, Website and Ads engines require completed onboarding to generate intelligence.',
        role: 'Strategy Specialist',
        severity: 'medium',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    const stuckLeads = activeLeads.filter(l => {
      const last = l.lastActivityAt ? new Date(l.lastActivityAt) : new Date(l.createdAt);
      return differenceInDays(now, last) > 14;
    });
    if (stuckLeads.length > 0) {
      items.push({
        id: 'stuck-leads',
        title: `${stuckLeads.length} deal${stuckLeads.length > 1 ? 's' : ''} with no activity in 14+ days`,
        description: 'Prospects going cold. Nurture or action required.',
        role: 'Sales Specialist',
        severity: stuckLeads.length > 10 ? 'high' : 'medium',
        linkedPath: '/pipeline',
        linkedLabel: 'View Pipeline',
      });
    }

    const clientsNoGBP = activeClients.filter(c => !c.gbpLocationName && c.website);
    if (clientsNoGBP.length > 0) {
      items.push({
        id: 'no-gbp-auth',
        title: `${clientsNoGBP.length} client${clientsNoGBP.length > 1 ? 's' : ''} without GBP connected`,
        description: 'GBP OAuth not connected — review monitoring and rank tracking unavailable.',
        role: 'GBP Specialist',
        severity: 'low',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    const clientsLowReviews = clientsWithGBP.filter(c => {
      const reviewScore = c.gbpEngine?.scores?.reviewStrength;
      return reviewScore !== undefined && reviewScore < 50;
    });
    if (clientsLowReviews.length > 0) {
      items.push({
        id: 'low-reviews',
        title: `${clientsLowReviews.length} client${clientsLowReviews.length > 1 ? 's' : ''} with weak review profile`,
        description: 'GBP review strength below 50% — reputation risk.',
        role: 'Review Specialist',
        severity: 'medium',
        linkedPath: '/clients',
        linkedLabel: 'View Clients',
      });
    }

    if (autonomousClients.length > 0 && !rules.requireApprovalHighRisk) {
      items.push({
        id: 'autopilot-no-guard',
        title: `${autonomousClients.length} client${autonomousClients.length > 1 ? 's' : ''} on autopilot with reduced guardrails`,
        description: 'High-risk approval not required. Verify automation rules are intentional.',
        role: 'Operations Specialist',
        severity: 'medium',
      });
    }

    return items.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [overdueLeads, redAmberClients, blockedClients, activeClients, activeLeads, autonomousClients, clientsWithGBP, rules.requireApprovalHighRisk]);

  // ── Role cards ────────────────────────────────────────────────────────────

  const roles = useMemo<RoleMetrics[]>(() => {
    const salesActions = openNBA.filter(a => a.targetType === 'lead');
    const lastSalesActivity = [...activities]
      .filter(a => ['call', 'email', 'sms', 'meeting'].includes(a.type))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    const nurtureDue = activeLeads.filter(l => l.nextTouchAt && new Date(l.nextTouchAt) <= now);

    return [
      {
        id: 'sales',
        name: 'Sales Specialist',
        icon: BriefcaseBusiness,
        status: overdueLeads.length > 5 ? 'needs_attention' : salesActions.length > 0 ? 'active' : overdueLeads.length > 0 ? 'needs_attention' : 'idle',
        currentCount: salesActions.length,
        currentLabel: 'open outreach actions',
        blockerCount: overdueLeads.length,
        blockerSummary: overdueLeads.length ? `${overdueLeads.length} overdue follow-ups` : undefined,
        lastActionLabel: lastSalesActivity ? `${lastSalesActivity.type} — ${formatDistanceToNow(new Date(lastSalesActivity.createdAt), { addSuffix: true })}` : undefined,
        detail: 'Outreach, follow-up, stage progression',
        linkedPath: '/pipeline',
      },
      {
        id: 'seo',
        name: 'SEO Specialist',
        icon: Search,
        status: clientsWithSEO.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithSEO.length,
        currentLabel: 'clients with SEO plans',
        blockerCount: activeClients.filter(c => !c.seoEngine && !c.clientOnboarding?.seoInputs).length,
        blockerSummary: 'Missing service/location data',
        lastActionLabel: clientsWithSEO.length > 0 ? `${clientsWithSEO.length} SEO plans generated` : undefined,
        detail: 'Keyword targeting, content plans, visibility scoring',
        linkedPath: '/clients',
      },
      {
        id: 'website',
        name: 'Website Specialist',
        icon: Globe,
        status: clientsWithWebsite.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithWebsite.length,
        currentLabel: 'clients with website audits',
        blockerCount: clientsWithWebsite.filter(c => {
          const grade = c.websiteEngine?.overallGrade;
          return grade === 'F' || grade === 'D';
        }).length,
        blockerSummary: 'Low-grade sites needing rebuild',
        lastActionLabel: clientsWithWebsite.length > 0 ? `${clientsWithWebsite.length} website audits active` : undefined,
        detail: 'Conversion scoring, sitemap, build structure',
        linkedPath: '/clients',
      },
      {
        id: 'ads',
        name: 'Google Ads Specialist',
        icon: BarChart3,
        status: clientsWithAds.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithAds.length,
        currentLabel: 'clients with ads plans',
        blockerCount: clientsWithAds.filter(c => (c.adsEngine?.readinessScore || 0) < 50).length,
        blockerSummary: 'Low readiness — needs SEO/GBP first',
        lastActionLabel: clientsWithAds.length > 0 ? `${clientsWithAds.length} campaigns assessed` : undefined,
        detail: 'Campaign structure, budgets, keyword targeting',
        linkedPath: '/clients',
      },
      {
        id: 'gbp',
        name: 'GBP Specialist',
        icon: Star,
        status: clientsWithGBP.length > 0 ? 'active' : clientsWithGBPAuth.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithGBP.length,
        currentLabel: 'clients with GBP reports',
        blockerCount: activeClients.filter(c => !c.gbpLocationName).length,
        blockerSummary: 'GBP OAuth not connected',
        lastActionLabel: clientsWithGBP.length > 0 ? `${clientsWithGBP.length} GBP profiles assessed` : undefined,
        detail: 'Profile optimisation, review strategy, local visibility',
        linkedPath: '/clients',
      },
      {
        id: 'growth',
        name: 'Client Growth Specialist',
        icon: TrendingUp,
        status: aiActiveClients.length > 0 ? 'active' : redAmberClients.length > 0 ? 'needs_attention' : 'idle',
        currentCount: aiActiveClients.length,
        currentLabel: 'clients with AI growth active',
        blockerCount: redAmberClients.length,
        blockerSummary: `${redAmberClients.filter(c => c.healthStatus === 'red').length} critical, ${redAmberClients.filter(c => c.healthStatus === 'amber').length} amber`,
        lastActionLabel: aiActiveClients.length > 0 ? `${aiActiveClients.length} clients monitored` : undefined,
        detail: 'Health monitoring, churn prevention, expansion signals',
        linkedPath: '/clients',
      },
      {
        id: 'review',
        name: 'Review & Reputation',
        icon: Shield,
        status: clientsWithGBPAuth.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithGBPAuth.length,
        currentLabel: 'clients with GBP connected',
        blockerCount: clientsWithGBP.filter(c => (c.gbpEngine?.scores?.reviewStrength || 0) < 50).length,
        blockerSummary: 'Weak review profiles',
        lastActionLabel: clientsWithGBPAuth.length > 0 ? `${clientsWithGBPAuth.length} profiles monitored` : undefined,
        detail: 'Review acquisition, response management, profile authority',
        linkedPath: '/clients',
      },
      {
        id: 'strategy',
        name: 'Strategy Specialist',
        icon: Eye,
        status: clientsWithPrescription.length > 0 ? 'active' : 'idle',
        currentCount: clientsWithPrescription.length,
        currentLabel: 'growth prescriptions generated',
        blockerCount: activeLeads.filter(l => !l.strategyIntelligence?.businessOverview).length,
        blockerSummary: 'Missing discovery context',
        lastActionLabel: clientsWithPrescription.length > 0 ? `${clientsWithPrescription.length} strategies active` : undefined,
        detail: 'Growth prescriptions, discovery inputs, strategy intelligence',
        linkedPath: '/pipeline',
      },
      {
        id: 'strategist',
        name: 'Client Strategist',
        icon: Compass,
        status: (() => {
          const stalled = activeClients.filter(c => c.learningInsight?.momentumStatus === 'stalled');
          if (stalled.length > 0) return 'needs_attention' as const;
          if (aiActiveClients.length > 0) return 'active' as const;
          return 'idle' as const;
        })(),
        currentCount: aiActiveClients.length,
        currentLabel: 'clients with active growth strategy',
        blockerCount: activeClients.filter(c => !c.appliedPlays || c.appliedPlays.length === 0).length,
        blockerSummary: 'No growth play activated',
        lastActionLabel: (() => {
          const stalled = activeClients.filter(c => c.learningInsight?.momentumStatus === 'stalled');
          if (stalled.length > 0) return `${stalled.length} client${stalled.length > 1 ? 's' : ''} stalled — needs direction`;
          const strong = activeClients.filter(c => c.learningInsight?.momentumStatus === 'strong');
          if (strong.length > 0) return `${strong.length} client${strong.length > 1 ? 's' : ''} with strong momentum`;
          return undefined;
        })(),
        detail: 'Owns client outcomes — sequences engines, plays & actions across all specialists',
        linkedPath: '/clients',
      },
      {
        id: 'ops',
        name: 'Operations Specialist',
        icon: Cpu,
        status: autonomousClients.length > 0 ? 'active' : aiActiveClients.length > 0 ? 'active' : 'idle',
        currentCount: autonomousClients.length,
        currentLabel: 'clients on autopilot',
        blockerCount: 0,
        lastActionLabel: autonomousClients.length > 0 ? `${autonomousClients.length} on autonomous mode` : 'All clients in manual mode',
        detail: 'Automation rules, job execution, OpenClaw orchestration',
        linkedPath: '/clients',
      },
    ];
  }, [
    openNBA, activities, activeLeads, overdueLeads, activeClients,
    clientsWithSEO, clientsWithWebsite, clientsWithGBP, clientsWithGBPAuth,
    clientsWithAds, clientsWithPrescription, aiActiveClients, autonomousClients,
    redAmberClients
  ]);

  const activeRoles = roles.filter(r => r.status !== 'idle');
  const idleRoles   = roles.filter(r => r.status === 'idle');

  // ── Work hours check ──────────────────────────────────────────────────────

  const isWithinWorkHours = useMemo(() => {
    const timeStr = format(now, 'HH:mm');
    return timeStr >= rules.workHoursStart && timeStr <= rules.workHoursEnd;
  }, [rules.workHoursStart, rules.workHoursEnd]);

  if (!isManager) return <Redirect to="/dashboard" />;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Radio className="h-5 w-5 text-violet-500" />
              Bullpen
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Internal AI workforce command layer — {format(now, 'EEEE dd/MM/yyyy HH:mm')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isWithinWorkHours
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isWithinWorkHours ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {isWithinWorkHours ? `Work hours active (${rules.workHoursStart}–${rules.workHoursEnd})` : `Outside work hours (${rules.workHoursStart}–${rules.workHoursEnd})`}
            </div>
          </div>
        </div>

        {/* ── Summary cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Active Workloads"   value={summaryActiveWorkloads}  icon={Zap}          color="text-violet-600 dark:text-violet-400" />
          <SummaryCard label="Queued Actions"      value={summaryQueued}            icon={Clock}        color="text-blue-600 dark:text-blue-400" />
          <SummaryCard label="Awaiting Approval"   value={summaryAwaitingApproval}  icon={Timer}        color="text-amber-600 dark:text-amber-400" />
          <SummaryCard label="Blocked / At Risk"   value={summaryBlocked}           icon={Ban}          color="text-red-600 dark:text-red-400" />
          <SummaryCard label="Completed Today"     value={summaryCompletedToday}    icon={CheckCircle2} color="text-emerald-600 dark:text-emerald-400" />
          <SummaryCard label="AI-Managed Clients"  value={summaryClientsAffected}   icon={Users}        color="text-indigo-600 dark:text-indigo-400" />
        </div>

        {/* ── Needs Attention ──────────────────────────────────────────────── */}
        {attentionItems.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Needs Attention — {attentionItems.length} item{attentionItems.length > 1 ? 's' : ''}
            </h2>
            <div className="space-y-2">
              {attentionItems.map(item => <AttentionCard key={item.id} item={item} />)}
            </div>
          </div>
        )}

        {attentionItems.length === 0 && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">No attention required</p>
              <p className="text-xs text-muted-foreground">All systems operating normally. No blockers or urgent items detected.</p>
            </div>
          </div>
        )}

        {/* ── Workforce ────────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Briefcase className="h-3.5 w-3.5" />
            Workforce — {activeRoles.length} active, {idleRoles.length} idle
          </h2>

          {activeRoles.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              {activeRoles.map(role => (
                <RoleCard
                  key={role.id}
                  role={role}
                  expanded={expandedRoles.has(role.id)}
                  onToggle={() => setExpandedRoles(prev => {
                    const next = new Set(prev);
                    next.has(role.id) ? next.delete(role.id) : next.add(role.id);
                    return next;
                  })}
                />
              ))}
            </div>
          )}

          {idleRoles.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 mt-1">Idle — no active workloads</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {idleRoles.map(role => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    expanded={expandedRoles.has(role.id)}
                    onToggle={() => setExpandedRoles(prev => {
                      const next = new Set(prev);
                      next.has(role.id) ? next.delete(role.id) : next.add(role.id);
                      return next;
                    })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Automation Rules ─────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5" />
            Automation Rules & Control
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Work hours */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Work Hours Window
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start time</Label>
                    <Select value={rules.workHoursStart} onValueChange={v => patchRule('workHoursStart', v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-work-start">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['06:00','07:00','07:30','08:00','08:30','09:00'].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End time</Label>
                    <Select value={rules.workHoursEnd} onValueChange={v => patchRule('workHoursEnd', v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-work-end">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['17:00','17:30','18:00','18:30','19:00','20:00'].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Timezone</Label>
                  <Select value={rules.timezone} onValueChange={v => patchRule('timezone', v)}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Australia/Brisbane">Australia/Brisbane (AEST)</SelectItem>
                      <SelectItem value="Australia/Sydney">Australia/Sydney (AEDT)</SelectItem>
                      <SelectItem value="Australia/Melbourne">Australia/Melbourne (AEDT)</SelectItem>
                      <SelectItem value="Australia/Perth">Australia/Perth (AWST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={`text-xs px-2 py-1.5 rounded flex items-center gap-1.5 ${
                  isWithinWorkHours
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-muted-foreground'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isWithinWorkHours ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {isWithinWorkHours ? 'Currently within work hours' : 'Currently outside work hours — comms held'}
                </div>
              </CardContent>
            </Card>

            {/* Communication restrictions */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Ban className="h-4 w-4 text-muted-foreground" />
                  Communication Restrictions
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <RuleRow
                  label="Block SMS outside hours"
                  description="Queue all outbound SMS until work hours open"
                  checked={rules.blockSmsOutsideHours}
                  onChange={v => patchRule('blockSmsOutsideHours', v)}
                />
                <RuleRow
                  label="Block email outside hours"
                  description="Hold email dispatch until next work window"
                  checked={rules.blockEmailOutsideHours}
                  onChange={v => patchRule('blockEmailOutsideHours', v)}
                />
                <RuleRow
                  label="Block outbound calls outside hours"
                  description="AI must not initiate or log calls outside approved window"
                  checked={rules.blockCallsOutsideHours}
                  onChange={v => patchRule('blockCallsOutsideHours', v)}
                />
              </CardContent>
            </Card>

            {/* Approval requirements */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Approval Requirements
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <RuleRow
                  label="Require approval — campaign launches"
                  description="Google Ads, SEO rollouts, and paid campaigns need sign-off"
                  checked={rules.requireApprovalCampaigns}
                  onChange={v => patchRule('requireApprovalCampaigns', v)}
                />
                <RuleRow
                  label="Require approval — high-risk actions"
                  description="Communications flagged as high-risk need manual review"
                  checked={rules.requireApprovalHighRisk}
                  onChange={v => patchRule('requireApprovalHighRisk', v)}
                />
                <RuleRow
                  label="Require approval — publish actions"
                  description="Website, GBP, and content publish actions require confirmation"
                  checked={rules.requireApprovalPublish}
                  onChange={v => patchRule('requireApprovalPublish', v)}
                />
              </CardContent>
            </Card>

            {/* Status summary */}
            <Card className="border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ActivityIcon className="h-4 w-4 text-muted-foreground" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {[
                  { label: 'Total active leads', value: activeLeads.length },
                  { label: 'Total active clients', value: activeClients.length },
                  { label: 'Clients on AI growth', value: aiActiveClients.length },
                  { label: 'Clients on autopilot', value: autonomousClients.length },
                  { label: 'Activities logged today', value: todayActivities.length },
                  { label: 'Open AI actions (queue)', value: openNBA.length },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">{row.label}</span>
                    <span className="font-semibold tabular-nums">{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={saveRules} disabled={rulesSaving} className="gap-2" data-testid="button-save-rules">
              {rulesSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
              Save Automation Rules
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
