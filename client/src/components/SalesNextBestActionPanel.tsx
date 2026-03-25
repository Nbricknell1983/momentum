import { useMemo, useState } from 'react';
import {
  Phone, Mail, MessageSquare, Calendar, Users, Zap,
  ChevronDown, ChevronUp, ArrowRight, Lightbulb, Shield,
  Target, CheckCircle2, Clock, Flame, AlertTriangle,
  Copy, Check,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lead, STAGE_LABELS, CONVERSATION_STAGE_LABELS } from '@/lib/types';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { deriveSalesConversationState, type SalesNextBestAction, type SalesNepqQuestion, type ObjectionScript } from '@/lib/salesIntelligenceTypes';
import { format, differenceInDays } from 'date-fns';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d?: Date | string | null) {
  if (!d) return '';
  try { return format(new Date(d), 'dd/MM/yyyy'); } catch { return ''; }
}

// ---------------------------------------------------------------------------
// NEPQ question type labels
// ---------------------------------------------------------------------------

const NEPQ_TYPE_CONFIG = {
  situation:   { label: 'Situation', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' },
  problem:     { label: 'Problem',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400' },
  consequence: { label: 'Consequence', color: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400' },
  solution:    { label: 'Solution',  color: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400' },
  commitment:  { label: 'Commitment', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
};

const CHANNEL_ICON = {
  call:       Phone,
  email:      Mail,
  sms:        MessageSquare,
  meeting:    Calendar,
  in_person:  Users,
};

const PRIORITY_CONFIG = {
  must_do: { label: 'Must Do Today', bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800', badge: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400', icon: Flame },
  high:    { label: 'High Priority', bg: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400', icon: Zap },
  medium:  { label: 'Medium', bg: 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: Target },
};

// ---------------------------------------------------------------------------
// Generate stage-appropriate NBA actions from lead data
// ---------------------------------------------------------------------------

function generateNBAs(lead: Lead, activities: any[]): SalesNextBestAction[] {
  const stage = lead.stage;
  const convStage = lead.conversationStage || 'not_started';
  const lastActivity = activities.filter(a => a.leadId === lead.id).sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const daysSince = lastActivity ? differenceInDays(new Date(), new Date(lastActivity.createdAt)) : 999;

  const diagnosis = lead.growthPrescription?.businessDiagnosis || '';
  const salesHook = lead.aiCallPrepOutput?.salesHook || '';
  const gaps = lead.aiCallPrepOutput?.gaps || [];
  const topGap = gaps[0];

  const actions: SalesNextBestAction[] = [];

  // ── Never spoken / suspect ──────────────────────────────────────────────
  if (convStage === 'not_started' || convStage === 'attempted') {
    actions.push({
      id: 'open-call',
      category: 'open_conversation',
      priority: 'must_do',
      action: `Make first contact with ${lead.companyName}`,
      why: salesHook || `${lead.companyName} has digital gaps we can solve — get in front of them before a competitor does.`,
      channel: 'call',
      timeframe: 'Today',
      script: lead.sourceData?.callScript || (salesHook ? `"Hi, I'm reaching out because I noticed [specific issue] with your online presence — I have some quick thoughts that could help. Got 2 minutes?"` : undefined),
      nepqQuestions: [
        { type: 'situation', question: `How are you currently getting most of your new customers — is it mostly word of mouth, or are you getting some online enquiries?`, purpose: 'Understand current lead flow without being pushy' },
        { type: 'problem', question: `When you look at your Google presence right now, how would you rate how well it represents what you actually do?`, purpose: 'Surface dissatisfaction with current visibility' },
        { type: 'consequence', question: `If things stay as they are for the next 12 months, what does that mean for your growth goals?`, purpose: 'Create urgency around inaction' },
      ],
      successSignal: 'Booked a discovery conversation or got permission to send more information',
      stageAdvance: 'contacted',
    });
  }

  // ── Connected but no discovery ──────────────────────────────────────────
  if (convStage === 'connected') {
    actions.push({
      id: 'book-discovery',
      category: 'discovery_question',
      priority: 'must_do',
      action: 'Book a proper discovery conversation',
      why: 'You have a connection — now you need to understand their situation before presenting anything.',
      channel: 'call',
      timeframe: 'Within 24 hours',
      script: `"Based on our last chat, I'd love to spend 20 minutes properly understanding your business — I can then show you exactly where your biggest opportunity is. When works for a quick call this week?"`,
      nepqQuestions: [
        { type: 'situation', question: `Walk me through how your business currently gets found by new customers.`, purpose: 'Map their current awareness channels' },
        { type: 'situation', question: `What does your website typically do for you — is it mainly for credibility, or are you getting actual enquiries from it?`, purpose: 'Identify website expectations vs reality' },
        { type: 'problem', question: `What's the biggest challenge you're running into with getting consistent new leads right now?`, purpose: 'Get them to name the pain in their own words' },
        { type: 'consequence', question: `How much business do you think you're losing to competitors who are ranking above you?`, purpose: 'Quantify the cost of inaction' },
        { type: 'solution', question: `If we could give you consistent, qualified online enquiries every month — what would that change for your business?`, purpose: 'Paint the vision of success' },
      ],
      successSignal: 'Discovery call booked in calendar',
      stageAdvance: 'engaged',
    });
  }

  // ── Discovery held ──────────────────────────────────────────────────────
  if (convStage === 'discovery' || stage === 'discovery') {
    actions.push({
      id: 'qualify-present',
      category: 'present_evidence',
      priority: 'must_do',
      action: 'Present the visibility gap analysis and growth opportunity',
      why: diagnosis || 'You have the intelligence — now show them what Google sees vs what they think. This is where you earn the right to propose.',
      channel: 'meeting',
      timeframe: 'This week',
      script: topGap
        ? `"Based on what you told me, I ran a quick analysis of your online presence. What I found is significant — particularly around ${topGap.title}. I'd love 20 minutes to walk you through what we found."`
        : `"I've done a full analysis of your digital presence — I'd love to show you what we found. It's pretty revealing."`,
      nepqQuestions: [
        { type: 'consequence', question: `When you look at this gap — how many leads do you think you're missing every month because of it?`, purpose: 'Quantify the impact in their terms' },
        { type: 'consequence', question: `Your main competitor is doing [X] that you're not — how does that feel from a business perspective?`, purpose: 'Create competitive urgency' },
        { type: 'solution', question: `If we fixed this in the next 90 days, how would that change things for your team?`, purpose: 'Get them to own the outcome' },
        { type: 'commitment', question: `On a scale of 1–10, how important is solving this to you right now?`, purpose: 'Gauge commitment before proposing' },
      ],
      successSignal: 'They acknowledge the gap and ask how to fix it',
      stageAdvance: 'qualified',
    });
  }

  // ── Qualified ───────────────────────────────────────────────────────────
  if (convStage === 'qualified' || stage === 'qualified') {
    actions.push({
      id: 'send-proposal',
      category: 'send_proposal',
      priority: 'must_do',
      action: 'Prepare and present the growth proposal',
      why: 'They are qualified and motivated — any delay risks losing momentum or letting a competitor in.',
      channel: 'meeting',
      timeframe: 'Within 48 hours',
      script: `"I've put together a specific plan for ${lead.companyName} based on everything we discussed. I'd love to walk you through it — it will show you exactly what we'd do, in what order, and what results you can expect. Can we find 30 minutes this week?"`,
      nepqQuestions: [
        { type: 'commitment', question: `When you think about the options we discussed — which direction feels right for where you are right now?`, purpose: 'Advance to decision' },
        { type: 'commitment', question: `What would need to be true for you to be confident moving forward?`, purpose: 'Surface remaining objections' },
        { type: 'commitment', question: `If we were to get started next month, what does your decision process look like?`, purpose: 'Understand decision timeline' },
      ],
      objectionPrep: lead.aiObjectionResponses?.map(o => ({
        objection: o.objection,
        realConcern: o.realConcern,
        response: o.response,
        bridgeBack: o.regainControlQuestion,
      })),
      successSignal: 'Proposal accepted or clear next step agreed',
      stageAdvance: 'proposal',
    });
  }

  // ── Stalled / at risk ───────────────────────────────────────────────────
  if (daysSince > 7 && !['won', 'lost'].includes(stage)) {
    actions.push({
      id: 're-engage',
      category: 're_engage',
      priority: daysSince > 14 ? 'must_do' : 'high',
      action: `Re-engage ${lead.companyName} — ${daysSince} days without contact`,
      why: `This deal is going cold. After 14 days without contact, the close rate drops significantly. Time to re-activate.`,
      channel: 'sms',
      timeframe: 'Today',
      script: lead.aiFollowUp?.sms || `"Hi [Name], just checking in — I had a thought about something specific to your business that I wanted to share. Happy to jump on a quick call?"`,
      nepqQuestions: [
        { type: 'situation', question: `Last time we spoke, you mentioned [pain point] — has anything changed there?`, purpose: 'Re-open the conversation at the point of pain' },
      ],
      successSignal: 'Response received and next touchpoint booked',
    });
  }

  // ── Follow up script available ──────────────────────────────────────────
  if (lead.aiFollowUp && convStage !== 'not_started') {
    actions.push({
      id: 'send-followup',
      category: 'follow_up',
      priority: 'medium',
      action: 'Send AI-generated follow-up email',
      why: 'Keep the conversation warm and add value between calls.',
      channel: 'email',
      timeframe: 'Today',
      script: lead.aiFollowUp.email,
      nepqQuestions: [],
      successSignal: 'Email opened and reply received',
    });
  }

  // Deduplicate and limit
  return actions.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyableScript({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="rounded-md bg-muted/50 border p-3 relative group">
      <p className="text-xs text-foreground pr-8 whitespace-pre-wrap">{text}</p>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        data-testid="btn-copy-script"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />}
      </button>
    </div>
  );
}

function NepqCard({ q }: { q: SalesNepqQuestion }) {
  const cfg = NEPQ_TYPE_CONFIG[q.type];
  return (
    <div className="rounded-lg border bg-card p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
      </div>
      <p className="text-sm font-medium text-foreground">"{q.question}"</p>
      <p className="text-xs text-muted-foreground italic">{q.purpose}</p>
    </div>
  );
}

function ObjectionCard({ o }: { o: ObjectionScript }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button className="w-full flex items-center justify-between p-3 text-left" onClick={() => setExpanded(e => !e)}>
        <p className="text-sm font-medium text-orange-700 dark:text-orange-400">"{o.objection}"</p>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-2">Real concern</p>
            <p className="text-xs text-foreground">{o.realConcern}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Response</p>
            <CopyableScript text={o.response} />
          </div>
          {o.bridgeBack && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Bridge back</p>
              <p className="text-xs text-foreground italic">"{o.bridgeBack}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: SalesNextBestAction }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = PRIORITY_CONFIG[action.priority];
  const ChannelIcon = CHANNEL_ICON[action.channel] || Phone;
  const PriorityIcon = cfg.icon;

  return (
    <div className={`rounded-lg border ${cfg.bg} overflow-hidden`} data-testid={`action-card-${action.id}`}>
      <button className="w-full flex items-start gap-2.5 p-3 text-left" onClick={() => setExpanded(e => !e)}>
        <PriorityIcon className="w-4 h-4 mt-0.5 shrink-0 text-current opacity-70" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <ChannelIcon className="w-3 h-3" /> {action.channel}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
              <Clock className="w-3 h-3" /> {action.timeframe}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground">{action.action}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{action.why}</p>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-current/10">
          {action.script && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mt-2 mb-1">Suggested Script / Opening</p>
              <CopyableScript text={action.script} />
            </div>
          )}

          {action.nepqQuestions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">NEPQ Questions to Ask</p>
              <div className="space-y-2">
                {action.nepqQuestions.map((q, i) => <NepqCard key={i} q={q} />)}
              </div>
            </div>
          )}

          {action.objectionPrep && action.objectionPrep.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Objection Prep</p>
              <div className="space-y-2">
                {action.objectionPrep.map((o, i) => <ObjectionCard key={i} o={o} />)}
              </div>
            </div>
          )}

          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-2.5">
            <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-0.5">Success looks like</p>
            <p className="text-xs text-foreground">{action.successSignal}</p>
          </div>

          {action.stageAdvance && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Advances stage to: <span className="font-medium">{action.stageAdvance}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type SectionTab = 'actions' | 'objections' | 'followup';

interface SalesNextBestActionPanelProps {
  lead: Lead;
}

export default function SalesNextBestActionPanel({ lead }: SalesNextBestActionPanelProps) {
  const [activeSection, setActiveSection] = useState<SectionTab>('actions');
  const activities = useSelector((state: RootState) => state.app.activities);

  const convState = useMemo(() => deriveSalesConversationState(lead, activities), [lead, activities]);
  const actions = useMemo(() => generateNBAs(lead, activities), [lead, activities]);

  const tabs: { id: SectionTab; label: string }[] = [
    { id: 'actions', label: 'Next Actions' },
    { id: 'objections', label: 'Objection Prep' },
    { id: 'followup', label: 'Follow-up Scripts' },
  ];

  const MOMENTUM_COLOR = {
    building: 'text-blue-600 dark:text-blue-400',
    stalled:  'text-amber-600 dark:text-amber-400',
    at_risk:  'text-red-600 dark:text-red-400',
    strong:   'text-emerald-600 dark:text-emerald-400',
  };

  return (
    <div className="space-y-4" data-testid="sales-nba-panel">

      {/* ── Conversation state strip ────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <span className="text-sm font-semibold">Conversation State</span>
          </div>
          <span className={`text-xs font-bold ${MOMENTUM_COLOR[convState.momentum]}`}>
            {convState.momentum.replace('_', ' ')}
          </span>
        </div>

        {/* Stage progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Stage: <span className="font-medium text-foreground">{STAGE_LABELS[lead.stage]}</span></span>
            <span>→ <span className="font-medium text-foreground capitalize">{convState.nextStage.replace('_', ' ')}</span></span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-violet-500 transition-all"
              style={{ width: `${((convState.stageIndex + 1) / convState.totalStages) * 100}%` }} />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold">{convState.totalTouchpoints}</p>
            <p className="text-[10px] text-muted-foreground">Touchpoints</p>
          </div>
          <div>
            <p className={`text-lg font-bold ${convState.daysSinceContact > 14 ? 'text-red-600' : convState.daysSinceContact > 7 ? 'text-amber-600' : 'text-foreground'}`}>
              {convState.daysSinceContact === 999 ? '—' : convState.daysSinceContact}
            </p>
            <p className="text-[10px] text-muted-foreground">Days since contact</p>
          </div>
          <div>
            <p className="text-lg font-bold capitalize">{convState.conversationQuality.replace('_', ' ')}</p>
            <p className="text-[10px] text-muted-foreground">Quality</p>
          </div>
        </div>

        {/* Stall warning */}
        {convState.stallRisk !== 'none' && (
          <div className={`rounded-md p-2.5 flex items-center gap-2 text-xs ${convState.stallRisk === 'high' ? 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'}`}>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{convState.stallReason}</span>
          </div>
        )}

        {/* Milestones */}
        <div className="space-y-1.5">
          {convState.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {m.achieved
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                : <div className="w-3.5 h-3.5 rounded-full border-2 border-muted shrink-0" />}
              <span className={m.achieved ? 'text-foreground' : 'text-muted-foreground'}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="border-b">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveSection(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeSection === t.id
                  ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`nba-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Actions tab ──────────────────────────────────────────────────── */}
      {activeSection === 'actions' && (
        <div className="space-y-3">
          {actions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No specific next actions — update stage and conversation stage to get recommendations
            </div>
          ) : (
            actions.map(a => <ActionCard key={a.id} action={a} />)
          )}

          {/* Sales hook from prep pack */}
          {lead.aiCallPrepOutput?.salesHook && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium">Opening Hook</span>
              </div>
              <CopyableScript text={lead.aiCallPrepOutput.salesHook} />
            </div>
          )}
        </div>
      )}

      {/* ── Objections tab ───────────────────────────────────────────────── */}
      {activeSection === 'objections' && (
        <div className="space-y-3">
          {lead.aiObjectionResponses && lead.aiObjectionResponses.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">Tap an objection to see the recommended response and bridge-back question.</p>
              {lead.aiObjectionResponses.map((o, i) => (
                <ObjectionCard key={i} o={{ objection: o.objection, realConcern: o.realConcern, response: o.response, bridgeBack: o.regainControlQuestion }} />
              ))}
            </>
          ) : (
            <div className="text-center py-8 space-y-2">
              <Shield className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">No objection scripts yet</p>
              <p className="text-xs text-muted-foreground">Run AI Objection Responses from the AI Sales Engine to get tailored scripts for this lead.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Follow-up tab ────────────────────────────────────────────────── */}
      {activeSection === 'followup' && (
        <div className="space-y-4">
          {lead.aiFollowUp ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium">Follow-up Email</span>
                </div>
                <CopyableScript text={lead.aiFollowUp.email} />
              </div>
              {lead.aiFollowUp.sms && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-medium">SMS Follow-up</span>
                  </div>
                  <CopyableScript text={lead.aiFollowUp.sms} />
                </div>
              )}
              {lead.aiFollowUp.proposalIntro && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-medium">Proposal Intro</span>
                  </div>
                  <CopyableScript text={lead.aiFollowUp.proposalIntro} />
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 space-y-2">
              <Mail className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">No follow-up scripts yet</p>
              <p className="text-xs text-muted-foreground">Run AI Follow-up from the AI Sales Engine to get tailored email and SMS scripts.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
