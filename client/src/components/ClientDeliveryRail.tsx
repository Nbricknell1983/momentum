import { useState, useEffect, useMemo } from 'react';
import {
  Globe, MapPin, Search, Megaphone, Sparkles, Loader2, ChevronDown,
  CheckCircle2, Clock, AlertCircle, Zap, Bot, TrendingUp, Users,
  Mail, Shield, RotateCcw, Copy, Check, BrainCircuit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Client, WorkstreamScope, WorkstreamStatus,
} from '@/lib/types';

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <Button variant="ghost" size="icon" onClick={copy} className="h-6 w-6" title="Copy">
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </Button>
  );
}

// ─── Delivery agent types ─────────────────────────────────────────────────────

type AgentId = 'growth_operator' | 'website_strategist' | 'content_agent' | 'gbp_optimiser' | 'seo_architect' | 'ads_agent';

type AgentStatus =
  | 'active'
  | 'generating'
  | 'ready_for_review'
  | 'waiting_dep'
  | 'queued'
  | 'completed'
  | 'not_in_scope';

interface AgentState {
  id: AgentId;
  name: string;
  specialty: string;
  initial: string;
  avatarColor: string;
  status: AgentStatus;
  statusLabel: string;
  statusNote: string;
}

// ─── Status config ────────────────────────────────────────────────────────────

function statusConfig(status: AgentStatus): { label: string; dotColor: string; badgeCls: string } {
  switch (status) {
    case 'active':           return { label: 'Active',              dotColor: 'bg-emerald-500',  badgeCls: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' };
    case 'generating':       return { label: 'Generating',          dotColor: 'bg-blue-500 animate-pulse',    badgeCls: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' };
    case 'ready_for_review': return { label: 'Awaiting review',     dotColor: 'bg-amber-400',    badgeCls: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' };
    case 'waiting_dep':      return { label: 'Waiting',             dotColor: 'bg-slate-300 dark:bg-slate-600', badgeCls: 'bg-slate-100 dark:bg-slate-800 text-slate-500' };
    case 'queued':           return { label: 'Ready to start',      dotColor: 'bg-violet-400',   badgeCls: 'bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300' };
    case 'completed':        return { label: 'Completed',           dotColor: 'bg-emerald-500',  badgeCls: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' };
    case 'not_in_scope':     return { label: 'Not in scope',        dotColor: 'bg-slate-200 dark:bg-slate-700', badgeCls: 'bg-slate-100 dark:bg-slate-800/80 text-slate-400' };
    default:                 return { label: 'Unknown', dotColor: 'bg-slate-300', badgeCls: '' };
  }
}

// ─── Agent derivation from activationPlan ────────────────────────────────────

function deriveAgents(client: Client): AgentState[] {
  const plan = client.activationPlan;
  const si = client.sourceIntelligence;
  const scope = plan?.selectedScope ?? [];
  const ws = plan?.workstreams ?? {};

  // Helper: map WorkstreamStatus → AgentStatus
  function wsToAgent(wss: WorkstreamStatus | undefined): AgentStatus {
    if (!wss) return 'queued';
    switch (wss) {
      case 'queued':           return 'queued';
      case 'generating':       return 'generating';
      case 'ready_for_review': return 'ready_for_review';
      case 'approved':         return 'completed';
      case 'live':             return 'completed';
      case 'optimising':       return 'completed';
      default:                 return 'queued';
    }
  }

  const websiteStatus  = ws.website?.status;
  const gbpStatus      = ws.gbp?.status;
  const seoStatus      = ws.seo?.status;
  const adsStatus      = ws.ads?.status;

  const websiteBriefReady  = !!plan?.websiteWorkstream?.brief;
  const pageStructureReady = !!plan?.websiteWorkstream?.pageStructure?.length;

  const agents: AgentState[] = [];

  // ── Growth Operator ─────────────────────────────────────────────────────────
  agents.push({
    id: 'growth_operator',
    name: 'Growth Operator',
    specialty: 'Delivery orchestration',
    initial: 'G',
    avatarColor: 'bg-indigo-500',
    status: 'active',
    statusLabel: 'Active',
    statusNote: plan
      ? `Orchestrating ${scope.length} active workstream${scope.length !== 1 ? 's' : ''} — coordinating delivery and dependencies`
      : 'Monitoring account health and growth signals',
  });

  // ── Website Strategist ──────────────────────────────────────────────────────
  if (scope.includes('website')) {
    const agentStatus = wsToAgent(websiteStatus);
    let note = '';
    switch (websiteStatus) {
      case 'queued':           note = 'Website brief and content plan ready to generate'; break;
      case 'generating':       note = 'Generating website brief, page structure, and homepage content…'; break;
      case 'ready_for_review': note = 'Brief and content plan ready — awaiting your review and approval'; break;
      case 'approved':         note = 'Approved — handing off to development team'; break;
      case 'live':             note = 'Site live — monitoring conversion performance'; break;
      case 'optimising':       note = 'Running conversion optimisation cycle'; break;
      default:                 note = 'Waiting to begin website brief generation';
    }
    agents.push({
      id: 'website_strategist',
      name: 'Website Strategist',
      specialty: 'Brief · Page structure · Content',
      initial: 'W',
      avatarColor: 'bg-blue-500',
      status: agentStatus,
      statusLabel: statusConfig(agentStatus).label,
      statusNote: note,
    });
  }

  // ── Content Agent ────────────────────────────────────────────────────────────
  if (scope.includes('website')) {
    let contentStatus: AgentStatus = 'waiting_dep';
    let note = '';
    if (websiteStatus === 'generating') {
      contentStatus = 'waiting_dep';
      note = 'Standing by while website brief generates…';
    } else if (!websiteBriefReady) {
      contentStatus = 'waiting_dep';
      note = 'Waiting for website brief — generate brief to unlock content drafting';
    } else if (websiteStatus === 'ready_for_review') {
      contentStatus = 'ready_for_review';
      note = 'Homepage content included in brief — ready for your review';
    } else if (websiteStatus === 'approved' || websiteStatus === 'live' || websiteStatus === 'optimising') {
      contentStatus = 'completed';
      note = 'Content approved and in production';
    } else {
      contentStatus = 'waiting_dep';
      note = 'Waiting for website brief to be generated first';
    }
    agents.push({
      id: 'content_agent',
      name: 'Content Agent',
      specialty: 'Copy · Hero · FAQ · Local',
      initial: 'C',
      avatarColor: 'bg-sky-500',
      status: contentStatus,
      statusLabel: statusConfig(contentStatus).label,
      statusNote: note,
    });
  }

  // ── GBP Optimiser ────────────────────────────────────────────────────────────
  if (scope.includes('gbp')) {
    const agentStatus = wsToAgent(gbpStatus);
    let note = '';
    switch (gbpStatus) {
      case 'queued':           note = 'Optimisation tasks, content calendar, and review strategy ready to generate'; break;
      case 'generating':       note = 'Generating 8–12 GBP tasks, 8-week content calendar, and review strategy…'; break;
      case 'ready_for_review': note = 'Full GBP plan ready — review tasks and begin optimisation sprint'; break;
      case 'approved':         note = 'Tasks approved — begin working through optimisation checklist'; break;
      case 'live':             note = 'In active optimisation cycle — tracking map pack performance'; break;
      case 'optimising':       note = 'Ongoing optimisation — posting content and responding to reviews'; break;
      default:                 note = 'GBP optimisation can begin immediately — no dependencies';
    }
    agents.push({
      id: 'gbp_optimiser',
      name: 'GBP Optimiser',
      specialty: 'Map pack · Reviews · Content calendar',
      initial: 'B',
      avatarColor: 'bg-emerald-500',
      status: agentStatus,
      statusLabel: statusConfig(agentStatus).label,
      statusNote: note,
    });
  }

  // ── SEO Architect ────────────────────────────────────────────────────────────
  if (scope.includes('seo')) {
    let seoAgentStatus: AgentStatus;
    let note = '';
    if (!scope.includes('website') || pageStructureReady) {
      seoAgentStatus = wsToAgent(seoStatus);
      note = pageStructureReady
        ? 'Website page structure ready — keyword architecture can be mapped to pages'
        : 'SEO architecture ready to begin — defining keyword and content strategy';
    } else {
      seoAgentStatus = 'waiting_dep';
      note = 'Waiting on website page structure — SEO keyword architecture maps to page structure';
    }
    agents.push({
      id: 'seo_architect',
      name: 'SEO Architect',
      specialty: 'Keywords · Content strategy · Authority',
      initial: 'S',
      avatarColor: 'bg-violet-500',
      status: seoAgentStatus,
      statusLabel: statusConfig(seoAgentStatus).label,
      statusNote: note,
    });
  }

  // ── Paid Ads Agent ───────────────────────────────────────────────────────────
  if (scope.includes('ads')) {
    const agentStatus = wsToAgent(adsStatus);
    let note = '';
    switch (adsStatus) {
      case 'queued':           note = 'Campaign structure and targeting strategy ready to define'; break;
      case 'generating':       note = 'Generating paid search strategy and campaign structure…'; break;
      case 'ready_for_review': note = 'Campaign plan ready — review targeting and budget allocation'; break;
      case 'approved':         note = 'Campaign approved — ready to launch'; break;
      case 'live':             note = 'Campaign live — monitoring clicks and conversion costs'; break;
      default:                 note = 'Awaiting campaign strategy generation';
    }
    agents.push({
      id: 'ads_agent',
      name: 'Paid Ads Agent',
      specialty: 'Campaign structure · Targeting · Conversion',
      initial: 'A',
      avatarColor: 'bg-amber-500',
      status: agentStatus,
      statusLabel: statusConfig(agentStatus).label,
      statusNote: note,
    });
  }

  // ── Out-of-scope hints ───────────────────────────────────────────────────────
  const outOfScope: { id: AgentId; name: string; specialty: string; initial: string; avatarColor: string; scope: WorkstreamScope }[] = [
    { id: 'website_strategist', name: 'Website Strategist', specialty: 'Brief · Page structure · Content', initial: 'W', avatarColor: 'bg-blue-500', scope: 'website' },
    { id: 'gbp_optimiser',      name: 'GBP Optimiser',      specialty: 'Map pack · Reviews · Content', initial: 'B', avatarColor: 'bg-emerald-500', scope: 'gbp' },
    { id: 'seo_architect',      name: 'SEO Architect',       specialty: 'Keywords · Content · Authority', initial: 'S', avatarColor: 'bg-violet-500', scope: 'seo' },
    { id: 'ads_agent',          name: 'Paid Ads Agent',      specialty: 'Campaign · Targeting · Conversion', initial: 'A', avatarColor: 'bg-amber-500', scope: 'ads' },
  ];
  for (const a of outOfScope) {
    if (plan && !scope.includes(a.scope)) {
      agents.push({
        ...a,
        status: 'not_in_scope',
        statusLabel: 'Not in scope',
        statusNote: `Not included in the active delivery scope — can be added later`,
      });
    }
  }

  return agents;
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentState }) {
  const cfg = statusConfig(agent.status);
  const muted = agent.status === 'not_in_scope';

  return (
    <div
      className={`flex items-start gap-3 py-3 border-b last:border-0 border-border/50 ${muted ? 'opacity-45' : ''}`}
      data-testid={`delivery-agent-${agent.id}`}
    >
      {/* Avatar */}
      <div className="shrink-0 relative">
        <div className={`h-8 w-8 rounded-full ${agent.avatarColor} flex items-center justify-center`}>
          <span className="text-xs font-bold text-white">{agent.initial}</span>
        </div>
        {!muted && (
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${cfg.dotColor}`} />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <div>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">{agent.name}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{agent.specialty}</p>
          </div>
          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cfg.badgeCls}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug mt-1">
          {agent.statusNote}
        </p>
        {agent.status === 'generating' && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">Working…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Growth tools (from AIClientGrowthEngine) ────────────────────────────────

type GrowthSection = 'account_intel' | 'conversation' | 'follow_up' | 'growth_plan' | 'referral';

const GROWTH_TOOLS: { key: GrowthSection; title: string; subtitle: string; icon: typeof Sparkles }[] = [
  { key: 'account_intel', title: 'Account Intelligence',   subtitle: 'Strengths, risks & conversation starter', icon: BrainCircuit },
  { key: 'conversation',  title: 'Expansion Conversation', subtitle: 'Smart questions & upsell angles', icon: Shield },
  { key: 'follow_up',     title: 'Follow-Up Builder',      subtitle: 'Email + SMS after your next call', icon: Mail },
  { key: 'growth_plan',   title: 'Growth Plan',            subtitle: '30 / 90 day + 12-month roadmap', icon: TrendingUp },
  { key: 'referral',      title: 'Referral Engine',        subtitle: 'Find referral partners + the right ask', icon: Users },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientDeliveryRail({ client }: { client: Client }) {
  const { toast } = useToast();
  const [toolsOpen, setToolsOpen] = useState<GrowthSection | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');

  const [accountIntel, setAccountIntel] = useState<any>(null);
  const [conversationResult, setConversationResult] = useState<any>(null);
  const [followUpResult, setFollowUpResult] = useState<any>(null);
  const [growthPlanResult, setGrowthPlanResult] = useState<any>(null);
  const [referralResult, setReferralResult] = useState<any>(null);

  useEffect(() => {
    setAccountIntel(null); setConversationResult(null); setFollowUpResult(null);
    setGrowthPlanResult(null); setReferralResult(null); setNotes('');
  }, [client.id]);

  const setLoad = (key: string, val: boolean) => setLoading(p => ({ ...p, [key]: val }));

  const payload = () => ({
    businessName: client.businessName,
    location: client.regionName || client.areaName || '',
    products: client.products || [],
    channelStatus: client.channelStatus,
    healthStatus: client.healthStatus,
    churnRiskScore: client.churnRiskScore,
    lastContactDate: client.lastContactDate,
    website: client.website,
    totalMRR: client.totalMRR,
    healthReasons: client.healthReasons,
    contactName: client.primaryContactName,
  });

  const callApi = async (path: string, extraBody: object = {}) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload(), ...extraBody }),
    });
    if (!res.ok) throw new Error('Failed');
    return res.json();
  };

  const generateAccountIntel = async () => {
    setLoad('account_intel', true);
    try { setAccountIntel(await callApi('/api/ai/client-growth/account-intelligence')); }
    catch { toast({ title: 'Failed to generate account intelligence', variant: 'destructive' }); }
    finally { setLoad('account_intel', false); }
  };

  const generateConversation = async () => {
    setLoad('conversation', true);
    try { setConversationResult(await callApi('/api/ai/client-growth/conversation-builder')); }
    catch { toast({ title: 'Failed to generate conversation guide', variant: 'destructive' }); }
    finally { setLoad('conversation', false); }
  };

  const generateFollowUp = async () => {
    setLoad('follow_up', true);
    try { setFollowUpResult(await callApi('/api/ai/client-growth/follow-up', { notes })); }
    catch { toast({ title: 'Failed to generate follow-up', variant: 'destructive' }); }
    finally { setLoad('follow_up', false); }
  };

  const generateGrowthPlan = async () => {
    setLoad('growth_plan', true);
    try { setGrowthPlanResult(await callApi('/api/ai/client-growth/growth-plan')); }
    catch { toast({ title: 'Failed to generate growth plan', variant: 'destructive' }); }
    finally { setLoad('growth_plan', false); }
  };

  const generateReferral = async () => {
    setLoad('referral', true);
    try { setReferralResult(await callApi('/api/ai/client-growth/referral-engine')); }
    catch { toast({ title: 'Failed to generate referral engine', variant: 'destructive' }); }
    finally { setLoad('referral', false); }
  };

  const agents = useMemo(() => deriveAgents(client), [client]);
  const hasPlan = !!client.activationPlan;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">

        {/* ── Delivery Team header + agents (only when plan exists) ─────────── */}
        {hasPlan && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Delivery Team</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Live agent activity</p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>

            <div className="rounded-xl border border-border overflow-hidden bg-white dark:bg-slate-900/50" data-testid="delivery-agents-panel">
              <div className="px-3">
                {agents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
              </div>
            </div>

            {/* Divider between agents and tools */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-2 text-[10px] font-medium uppercase tracking-wider bg-background text-muted-foreground">
                  Growth tools
                </span>
              </div>
            </div>
          </>
        )}

        {/* ── Growth tools header (only when NO plan — appears at top) ─────── */}
        {!hasPlan && (
          <div className="flex items-center gap-2 pb-1">
            <div className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Growth Tools</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Account intelligence, expansion & retention</p>
            </div>
          </div>
        )}

        {/* ── Growth tools (preserved from AIClientGrowthEngine) ───────────── */}
        <div className="space-y-2">
          {GROWTH_TOOLS.map(tool => {
            const Icon = tool.icon;
            const isOpen = toolsOpen === tool.key;
            const isLoading = loading[tool.key];

            return (
              <div key={tool.key} className="border rounded-lg overflow-hidden" data-testid={`section-${tool.key}`}>
                <button
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => setToolsOpen(prev => prev === tool.key ? null : tool.key)}
                  data-testid={`button-toggle-${tool.key}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{tool.title}</p>
                      <p className="text-xs text-muted-foreground">{tool.subtitle}</p>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t bg-background/50 p-3 space-y-3">

                    {/* Account Intelligence */}
                    {tool.key === 'account_intel' && (
                      <>
                        {!accountIntel ? (
                          <div className="text-center space-y-2 py-2">
                            <p className="text-xs text-muted-foreground">Get a full account snapshot — strengths, risks, and your opening line.</p>
                            <Button onClick={generateAccountIntel} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-account-intel">
                              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                              {isLoading ? 'Analysing...' : 'Generate Account Intelligence'}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setAccountIntel(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                              <CopyBtn text={[accountIntel.accountSummary, ...accountIntel.strengths, accountIntel.conversationStarter].join('\n')} />
                            </div>
                            <div className="bg-muted/40 rounded-lg p-3">
                              <p className="text-xs text-muted-foreground mb-1 font-medium">Account Summary</p>
                              <p className="text-sm">{accountIntel.accountSummary}</p>
                            </div>
                            {accountIntel.strengths?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1.5">Strengths</p>
                                <ul className="space-y-1">
                                  {accountIntel.strengths.map((s: string, i: number) => (
                                    <li key={i} className="text-xs flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {accountIntel.growthGaps?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">Growth Opportunities</p>
                                <div className="space-y-2">
                                  {accountIntel.growthGaps.map((g: any, i: number) => (
                                    <div key={i} className="border rounded p-2 text-xs space-y-0.5">
                                      <p className="font-medium">{g.title}</p>
                                      <p className="text-muted-foreground">{g.description}</p>
                                      <p className="text-blue-600 dark:text-blue-400">→ {g.opportunity}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {accountIntel.retentionRisks?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1.5">Retention Risks</p>
                                <ul className="space-y-1">
                                  {accountIntel.retentionRisks.map((r: string, i: number) => (
                                    <li key={i} className="text-xs flex gap-2"><span className="text-red-500 shrink-0">⚠</span>{r}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Conversation Starter</p>
                              <p className="text-sm italic">"{accountIntel.conversationStarter}"</p>
                              <div className="flex justify-end mt-1"><CopyBtn text={accountIntel.conversationStarter} /></div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Expansion Conversation */}
                    {tool.key === 'conversation' && (
                      <>
                        {!conversationResult ? (
                          <div className="text-center space-y-2 py-2">
                            <p className="text-xs text-muted-foreground">Prepare smart questions and upsell angles for your next growth conversation.</p>
                            <Button onClick={generateConversation} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-conversation">
                              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                              {isLoading ? 'Building...' : 'Build Expansion Conversation'}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex justify-end">
                              <Button variant="ghost" size="sm" onClick={() => setConversationResult(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                            </div>
                            <div className="bg-muted/40 rounded-lg p-3">
                              <p className="text-xs text-muted-foreground mb-1 font-medium">Client Goal Hypothesis</p>
                              <p className="text-sm">{conversationResult.clientGoalHypothesis}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium mb-1.5">Smart Questions</p>
                              <div className="space-y-1.5">
                                {conversationResult.smartQuestions?.map((q: string, i: number) => (
                                  <div key={i} className="flex gap-2 text-xs p-2 bg-muted/30 rounded">
                                    <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                    <span>"{q}"</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {conversationResult.upsellAngle && (
                              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Upsell Angle</p>
                                <p className="text-sm">{conversationResult.upsellAngle}</p>
                              </div>
                            )}
                            {conversationResult.expansionOpportunities?.length > 0 && (
                              <div>
                                <p className="text-xs font-medium mb-1.5">Expansion Opportunities</p>
                                <div className="space-y-2">
                                  {conversationResult.expansionOpportunities.map((o: any, i: number) => (
                                    <div key={i} className="border rounded p-2 text-xs space-y-0.5">
                                      <div className="flex justify-between">
                                        <p className="font-medium">{o.service}</p>
                                        <Badge variant="outline" className="text-[10px]">{o.estimatedValue}</Badge>
                                      </div>
                                      <p className="text-muted-foreground">{o.rationale}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Follow-Up */}
                    {tool.key === 'follow_up' && (
                      <>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Meeting notes (optional)</p>
                          <Textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="What did you discuss? Key topics, decisions, next steps..."
                            className="text-xs min-h-[70px]"
                            data-testid="textarea-client-followup-notes"
                          />
                        </div>
                        {!followUpResult ? (
                          <Button onClick={generateFollowUp} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-followup">
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                            {isLoading ? 'Writing...' : 'Generate Follow-Up'}
                          </Button>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex justify-end">
                              <Button variant="ghost" size="sm" onClick={() => setFollowUpResult(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                            </div>
                            <div className="space-y-2">
                              <div className="bg-muted/30 rounded p-2">
                                <p className="text-xs text-muted-foreground mb-0.5">Subject</p>
                                <p className="text-xs font-medium">{followUpResult.email?.subject}</p>
                              </div>
                              <div className="bg-muted/30 rounded p-2">
                                <p className="text-xs text-muted-foreground mb-1">Email</p>
                                <pre className="text-xs whitespace-pre-wrap font-sans">{followUpResult.email?.body}</pre>
                                <div className="flex justify-end mt-1"><CopyBtn text={`Subject: ${followUpResult.email?.subject}\n\n${followUpResult.email?.body}`} /></div>
                              </div>
                              <div className="bg-muted/30 rounded p-2">
                                <p className="text-xs text-muted-foreground mb-0.5">SMS</p>
                                <p className="text-xs">{followUpResult.sms}</p>
                                <div className="flex justify-end mt-1"><CopyBtn text={followUpResult.sms} /></div>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Growth Plan */}
                    {tool.key === 'growth_plan' && (
                      <>
                        {!growthPlanResult ? (
                          <div className="text-center space-y-2 py-2">
                            <p className="text-xs text-muted-foreground">Generate a structured 30 / 90 day and 12-month growth plan for this account.</p>
                            <Button onClick={generateGrowthPlan} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-growth-plan">
                              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                              {isLoading ? 'Planning...' : 'Generate Growth Plan'}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex justify-end">
                              <Button variant="ghost" size="sm" onClick={() => setGrowthPlanResult(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                            </div>
                            {growthPlanResult.accountGrowthTarget && (
                              <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded p-2">
                                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Growth Target: {growthPlanResult.accountGrowthTarget}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-medium mb-1.5 text-amber-600 dark:text-amber-400">30-Day Actions</p>
                              <div className="space-y-1.5">
                                {growthPlanResult.thirtyDay?.map((a: any, i: number) => (
                                  <div key={i} className="border rounded p-2 text-xs space-y-0.5">
                                    <p className="font-medium">{a.action}</p>
                                    <p className="text-muted-foreground">{a.why}</p>
                                    <p className="text-emerald-600 dark:text-emerald-400">Impact: {a.impact}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium mb-1.5 text-blue-600 dark:text-blue-400">90-Day Actions</p>
                              <div className="space-y-1.5">
                                {growthPlanResult.ninetyDay?.map((a: any, i: number) => (
                                  <div key={i} className="border rounded p-2 text-xs space-y-0.5">
                                    <p className="font-medium">{a.action}</p>
                                    <p className="text-muted-foreground">{a.why}</p>
                                    <p className="text-emerald-600 dark:text-emerald-400">Impact: {a.impact}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-medium mb-1.5">12-Month Roadmap</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {growthPlanResult.twelveMonth?.map((q: any, i: number) => (
                                  <div key={i} className="border rounded p-2 text-xs">
                                    <p className="font-medium text-muted-foreground">{q.quarter}</p>
                                    <p className="font-medium mt-0.5">{q.focus}</p>
                                    <p className="text-muted-foreground">{q.goal}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Referral Engine */}
                    {tool.key === 'referral' && (
                      <>
                        {!referralResult ? (
                          <div className="text-center space-y-2 py-2">
                            <p className="text-xs text-muted-foreground">Identify referral partners and the perfect ask to multiply your pipeline from this account.</p>
                            <Button onClick={generateReferral} disabled={isLoading} className="w-full h-8 text-sm gap-2" data-testid="button-generate-referral">
                              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                              {isLoading ? 'Identifying...' : 'Find Referral Opportunities'}
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex justify-end">
                              <Button variant="ghost" size="sm" onClick={() => setReferralResult(null)} className="h-7 text-xs gap-1"><RotateCcw className="h-3 w-3" /> Regenerate</Button>
                            </div>
                            {referralResult.referralPartners?.map((p: any, i: number) => (
                              <div key={i} className="border rounded p-2 text-xs space-y-1.5">
                                <p className="font-medium">{p.partnerType}</p>
                                <p className="text-muted-foreground">{p.why}</p>
                                <div className="bg-muted/40 rounded p-1.5">
                                  <p className="text-muted-foreground text-[10px] mb-0.5">Intro Script</p>
                                  <p className="italic">"{p.introScript}"</p>
                                  <div className="flex justify-end mt-1"><CopyBtn text={p.introScript} /></div>
                                </div>
                              </div>
                            ))}
                            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">The Ask</p>
                              <p className="text-xs italic">"{referralResult.referralAsk}"</p>
                              <div className="flex justify-end mt-1"><CopyBtn text={referralResult.referralAsk} /></div>
                            </div>
                            <div className="bg-muted/30 rounded p-2">
                              <p className="text-xs font-medium mb-0.5">Incentive Idea</p>
                              <p className="text-xs text-muted-foreground">{referralResult.incentiveIdea}</p>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </ScrollArea>
  );
}
