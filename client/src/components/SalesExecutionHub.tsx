/**
 * SalesExecutionHub
 *
 * The complete Sales Execution Layer for the lead workspace.
 * 4 sections accessible via a compact pill nav:
 *   Actions → Meeting Prep → Objections → Follow-up
 *
 * Replaces the "Sales Actions" tab in LeadFocusView with a richer,
 * stage-aware, commercially useful execution layer.
 */

import { useState, useMemo } from 'react';
import {
  Phone, Mail, MessageSquare, Calendar, Users,
  Zap, Target, Flame, ChevronDown, ChevronUp,
  Copy, Check, AlertTriangle, Clock, ArrowRight,
  Shield, BookOpen, Mic, CheckCircle2, XCircle,
  TrendingUp, Eye, Lightbulb, Star, Info,
  BarChart2, Crosshair,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lead } from '@/lib/types';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { format } from 'date-fns';
import {
  deriveMeetingPrep, deriveFollowUpRecommendation, deriveStageActionPlan,
  deriveApplicableObjections, derivePipelineMomentumScore,
  SalesMeetingPrep, SalesFollowUpRecommendation, StageActionPlan,
  SalesObjection, PipelineMomentumScore, SalesNepqQuestion,
  OBJECTION_BANK,
} from '@/lib/salesIntelligenceTypes';


// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return format(new Date(d), 'dd/MM/yyyy'); } catch { return '—'; }
}

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className={`flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors ${className}`}
      data-testid="btn-copy"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function ScriptBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3 relative group">
      {label && <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-1.5">{label}</p>}
      <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed pr-10 whitespace-pre-wrap">{text}</p>
      <button
        onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
        className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied
          ? <Check className="w-3.5 h-3.5 text-emerald-500" />
          : <Copy className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300" />}
      </button>
    </div>
  );
}

const NEPQ_TYPE_CONFIG = {
  situation:   { label: 'Situation',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  problem:     { label: 'Problem',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300' },
  consequence: { label: 'Consequence', color: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' },
  solution:    { label: 'Solution',    color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300' },
  commitment:  { label: 'Commitment',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
};

const CHANNEL_ICON = {
  call: Phone, email: Mail, sms: MessageSquare, meeting: Calendar, in_person: Users,
};

const FREQ_BADGE = {
  very_common: { label: 'Very Common', color: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
  common:      { label: 'Common',      color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  occasional:  { label: 'Occasional',  color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
};

// ─── Section: Meeting Prep ────────────────────────────────────────────────────

function SectionTag({ label, icon: Icon }: { label: string; icon: typeof Eye }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </div>
  );
}

function NepqQuestionCard({ q }: { q: SalesNepqQuestion }) {
  const cfg = NEPQ_TYPE_CONFIG[q.type];
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 space-y-1.5">
      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
      <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-snug">"{q.question}"</p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">{q.purpose}</p>
      <div className="flex justify-end">
        <CopyButton text={q.question} />
      </div>
    </div>
  );
}

function MeetingPrepSection({ prep }: { prep: SalesMeetingPrep }) {
  const [showObjections, setShowObjections] = useState(false);

  return (
    <div className="p-4 space-y-5" data-testid="meeting-prep-section">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Mic className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{prep.meetingLabel}</h3>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{prep.businessSummary}</p>
        </div>
      </div>

      {/* Objective */}
      <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
        <p className="text-[10px] font-semibold text-violet-400 dark:text-violet-500 uppercase tracking-wide mb-1">Your one goal for this call</p>
        <p className="text-sm font-medium text-violet-800 dark:text-violet-300">{prep.callObjective}</p>
      </div>

      {/* Quick intel */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <SectionTag label="Current situation" icon={Eye} />
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{prep.currentSituation}</p>
        </div>
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <SectionTag label="Your angle" icon={Crosshair} />
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{prep.opportunityAngle}</p>
        </div>
      </div>

      {/* Opening line */}
      <div>
        <SectionTag label="Opening line" icon={Mic} />
        <ScriptBlock text={prep.openingLine} />
      </div>

      {/* What to show */}
      {prep.whatToShow.length > 0 && (
        <div>
          <SectionTag label="What to show / reference" icon={Eye} />
          <div className="space-y-1.5">
            {prep.whatToShow.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Talking points */}
      {prep.talkingPoints.length > 0 && (
        <div>
          <SectionTag label="Key talking points" icon={Lightbulb} />
          <div className="space-y-1.5">
            {prep.talkingPoints.map((pt, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300">
                <span className="text-[10px] font-bold text-zinc-400 mt-0.5 flex-shrink-0">#{i + 1}</span>
                <span>{pt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NEPQ Questions */}
      {prep.questions.length > 0 && (
        <div>
          <SectionTag label="NEPQ questions to ask" icon={BookOpen} />
          <div className="space-y-2">
            {prep.questions.map((q, i) => <NepqQuestionCard key={i} q={q} />)}
          </div>
        </div>
      )}

      {/* Likely objections */}
      {prep.likelyObjections.length > 0 && (
        <div>
          <button
            data-testid="btn-toggle-objections"
            onClick={() => setShowObjections(v => !v)}
            className="w-full flex items-center justify-between text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2"
          >
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3" />
              <span>Likely objections to prep for</span>
            </div>
            {showObjections ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showObjections && (
            <div className="space-y-2">
              {prep.likelyObjections.map((o, i) => (
                <div key={i} className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 p-3 space-y-2">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-300">"{o.objection}"</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400"><span className="font-medium">Real concern:</span> {o.realConcern}</p>
                  <ScriptBlock text={o.response} label="Suggested response" />
                  {o.bridgeBack && <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">Bridge back: "{o.bridgeBack}"</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Things to avoid */}
      {prep.thingsToAvoid.length > 0 && (
        <div>
          <SectionTag label="Things to avoid" icon={XCircle} />
          <div className="space-y-1">
            {prep.thingsToAvoid.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <XCircle className="w-3 h-3 flex-shrink-0" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outcomes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
          <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">Ideal outcome</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{prep.idealOutcome}</p>
        </div>
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Minimum outcome</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{prep.fallbackOutcome}</p>
        </div>
      </div>

      {/* Closing question */}
      <div>
        <SectionTag label="Call-to-action / closing question" icon={ArrowRight} />
        <ScriptBlock text={prep.closingQuestion} />
      </div>
    </div>
  );
}

// ─── Section: Objection Bank ──────────────────────────────────────────────────

function ObjectionCard({ objection, isStageRelevant }: { objection: SalesObjection; isStageRelevant: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const freq = FREQ_BADGE[objection.frequency];

  return (
    <div
      data-testid={`objection-card-${objection.id}`}
      className={[
        'rounded-xl border overflow-hidden transition-all',
        isStageRelevant
          ? 'border-orange-200 dark:border-orange-800 bg-white dark:bg-zinc-900'
          : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 opacity-75',
      ].join(' ')}
    >
      <button
        className="w-full flex items-start gap-3 p-3.5 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <Shield className={['w-4 h-4 mt-0.5 flex-shrink-0', isStageRelevant ? 'text-orange-500' : 'text-zinc-400'].join(' ')} />
        <div className="flex-1 min-w-0">
          <p className={['text-sm font-medium leading-snug', isStageRelevant ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-400'].join(' ')}>
            "{objection.objectionText}"
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${freq.color}`}>{freq.label}</span>
            {isStageRelevant && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Likely at current stage</span>}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-zinc-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-3.5 pb-3.5 pt-3 space-y-3">
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-0.5">Real concern behind this</p>
            <p className="text-xs text-amber-800 dark:text-amber-300">{objection.realConcern}</p>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-1">Framing tip</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 italic">{objection.framingTip}</p>
          </div>

          <ScriptBlock text={objection.responseScript} label="Suggested response" />

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-0.5">Bridge back</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 italic">"{objection.bridgeBack}"</p>
            </div>
            <div className="p-2.5 rounded-lg border border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
              <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-0.5">Do not say</p>
              <p className="text-xs text-red-600 dark:text-red-400">{objection.doNotSay}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span><span className="font-medium">Success signal:</span> {objection.successSignal}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ObjectionSection({ lead }: { lead: Lead }) {
  const stageObjections = useMemo(() => deriveApplicableObjections(lead), [lead.stage]);
  const stageRelevantIds = useMemo(() => new Set(stageObjections.map(o => o.id)), [stageObjections]);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? OBJECTION_BANK : [...OBJECTION_BANK].sort((a, b) => {
    const aR = stageRelevantIds.has(a.id) ? 0 : 1;
    const bR = stageRelevantIds.has(b.id) ? 0 : 1;
    return aR - bR;
  });

  return (
    <div className="p-4 space-y-4" data-testid="objection-section">
      <div>
        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Objection Handling Bank</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {stageObjections.length} objections are common at the <span className="font-medium text-zinc-700 dark:text-zinc-300">{lead.stage}</span> stage. All 8 patterns are available below.
        </p>
      </div>

      {stageObjections.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
          <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
          <p className="text-xs text-orange-700 dark:text-orange-300">
            Prep for <span className="font-semibold">{stageObjections[0]?.objectionText.slice(0, 60)}…</span> — most likely at this stage.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {visible.map(o => (
          <ObjectionCard key={o.id} objection={o} isStageRelevant={stageRelevantIds.has(o.id)} />
        ))}
      </div>

      {!showAll && OBJECTION_BANK.length > visible.length && (
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAll(true)} data-testid="btn-show-all-objections">
          Show all {OBJECTION_BANK.length} objection patterns
        </Button>
      )}
    </div>
  );
}

// ─── Section: Follow-up Recommendation ───────────────────────────────────────

const URGENCY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  overdue:          { label: 'Overdue — Act Now',     color: 'text-red-700 dark:text-red-300',    bg: 'bg-red-50 dark:bg-red-950/30',    border: 'border-red-200 dark:border-red-800' },
  today:            { label: 'Follow Up Today',       color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800' },
  this_week:        { label: 'This Week',             color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800' },
  next_week:        { label: 'Next Week',             color: 'text-blue-700 dark:text-blue-300',   bg: 'bg-blue-50 dark:bg-blue-950/30',   border: 'border-blue-200 dark:border-blue-800' },
  no_action_needed: { label: 'No Follow-up Needed',  color: 'text-zinc-600 dark:text-zinc-400',   bg: 'bg-zinc-50 dark:bg-zinc-900',      border: 'border-zinc-200 dark:border-zinc-700' },
};

const ASSET_LABELS: Record<string, { label: string; description: string }> = {
  strategy_report:     { label: 'Strategy Report',      description: 'Share the locked strategy report link' },
  growth_prescription: { label: 'Growth Prescription',  description: 'Reference the AI-generated growth plan' },
  competitor_data:     { label: 'Competitor Intelligence', description: 'Use specific competitor findings' },
  visibility_gaps:     { label: 'Visibility Gap Analysis', description: 'Lead with a specific gap finding' },
  roi_calculator:      { label: 'ROI Calculator',       description: 'Reference the estimated return on investment' },
  none:                { label: 'No specific asset',    description: 'Focus on re-opening the conversation' },
};

function FollowUpSection({ rec, lead }: { rec: SalesFollowUpRecommendation; lead: Lead }) {
  const urgCfg = URGENCY_CONFIG[rec.urgency] || URGENCY_CONFIG.this_week;
  const ChannelIcon = CHANNEL_ICON[rec.channel] || Mail;
  const assetInfo = ASSET_LABELS[rec.asset] || ASSET_LABELS.none;

  return (
    <div className="p-4 space-y-5" data-testid="followup-section">
      {/* Urgency banner */}
      <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${urgCfg.bg} ${urgCfg.border}`}>
        <Clock className={`w-5 h-5 flex-shrink-0 ${urgCfg.color}`} />
        <div className="flex-1">
          <p className={`text-sm font-semibold ${urgCfg.color}`}>{urgCfg.label}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{rec.followUpReason}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Recommended by</p>
          <p className={`text-xs font-semibold ${urgCfg.color}`}>{fmtDate(rec.recommendedByDate)}</p>
        </div>
      </div>

      {/* Channel + focus */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-1.5">Recommended channel</p>
          <div className="flex items-center gap-2">
            <ChannelIcon className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 capitalize">{rec.channel}</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{rec.channelRationale}</p>
        </div>
        <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-1.5">Focus area</p>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{rec.focusArea}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 italic">{rec.messagingAngle}</p>
        </div>
      </div>

      {/* Asset to reference */}
      {rec.asset !== 'none' && (
        <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-3.5 h-3.5 text-violet-500" />
            <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">Lead with this asset</p>
          </div>
          <p className="text-sm font-medium text-violet-800 dark:text-violet-300">{assetInfo.label}</p>
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">{rec.assetRationale}</p>
        </div>
      )}

      {/* Suggested message */}
      <div>
        {rec.suggestedSubject && (
          <div className="mb-2">
            <SectionTag label="Subject line" icon={Mail} />
            <div className="flex items-center gap-2 p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
              <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 font-medium">{rec.suggestedSubject}</p>
              <CopyButton text={rec.suggestedSubject} />
            </div>
          </div>
        )}
        <SectionTag label={rec.channel === 'sms' ? 'Message' : 'Email / message body'} icon={MessageSquare} />
        <ScriptBlock text={rec.suggestedMessage} />
      </div>

      {/* Do not do */}
      {rec.doNotDoList.length > 0 && (
        <div>
          <SectionTag label="Things to avoid" icon={XCircle} />
          <div className="space-y-1">
            {rec.doNotDoList.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                <XCircle className="w-3 h-3 flex-shrink-0" />
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next milestone */}
      <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
        <Target className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        <div>
          <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-0.5">Next milestone</p>
          <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">{rec.nextMilestone}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Stage Action Plan ───────────────────────────────────────────────

function StagePlanSection({ plan, momentumScore }: { plan: StageActionPlan; momentumScore: PipelineMomentumScore }) {
  const scoreColor = momentumScore.score >= 70 ? 'text-emerald-600 dark:text-emerald-400'
    : momentumScore.score >= 40 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';
  const trajectoryIcon = {
    accelerating: TrendingUp, steady: BarChart2,
    decelerating: AlertTriangle, stalled: Clock, at_risk: AlertTriangle,
  }[momentumScore.trajectory] || BarChart2;
  const TrajectoryIcon = trajectoryIcon;

  return (
    <div className="p-4 space-y-4" data-testid="stage-plan-section">
      {/* Momentum score pill */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <div className="flex flex-col items-center">
          <span className={`text-3xl font-bold tabular-nums ${scoreColor}`}>{momentumScore.score}</span>
          <span className="text-[10px] text-zinc-400 uppercase tracking-wide">/ 100</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrajectoryIcon className={`w-3.5 h-3.5 ${scoreColor}`} />
            <span className={`text-xs font-semibold capitalize ${scoreColor}`}>{momentumScore.trajectory.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{momentumScore.urgencyLabel}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">Next: <span className="font-medium text-zinc-600 dark:text-zinc-400">{momentumScore.nextMilestone}</span></p>
        </div>
        {momentumScore.estimatedDaysToClose && (
          <div className="text-right">
            <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Est. close</p>
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">~{momentumScore.estimatedDaysToClose}d</p>
          </div>
        )}
      </div>

      {/* Stage plan */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{plan.stageLabel} Stage — Action Plan</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{plan.objective}</p>
            </div>
            <Badge variant="outline" className="text-xs text-zinc-500">~{plan.estimatedDaysToAdvance}d to advance</Badge>
          </div>
        </div>

        {plan.blockers.length > 0 && (
          <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-800">
            {plan.blockers.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>{b}</span>
              </div>
            ))}
          </div>
        )}

        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {plan.actions.map((action) => (
            <div key={action.order} data-testid={`stage-action-${action.order}`} className="px-4 py-3 flex items-start gap-3">
              <div className={[
                'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold',
                action.isComplete
                  ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
              ].join(' ')}>
                {action.isComplete ? <CheckCircle2 className="w-3.5 h-3.5" /> : action.order}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{action.action}</p>
                  <span className="text-[10px] text-zinc-400 flex-shrink-0 capitalize">{action.timeframe}</span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{action.why}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  <span className="font-medium">Expected:</span> {action.expectedOutcome}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-medium">Exit criteria:</span> {plan.exitCriteria}
            </p>
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 italic">💡 {plan.tipForThisStage}</p>
        </div>
      </div>

      {/* Risk / Accelerators */}
      {(momentumScore.riskFactors.length > 0 || momentumScore.accelerators.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {momentumScore.riskFactors.length > 0 && (
            <div className="p-3 rounded-lg border border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
              <SectionTag label="Risk factors" icon={AlertTriangle} />
              {momentumScore.riskFactors.slice(0, 3).map((r, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400 mb-1">• {r}</p>
              ))}
            </div>
          )}
          {momentumScore.accelerators.length > 0 && (
            <div className="p-3 rounded-lg border border-emerald-100 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20">
              <SectionTag label="Accelerators" icon={Zap} />
              {momentumScore.accelerators.slice(0, 3).map((a, i) => (
                <p key={i} className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">• {a}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Hub navigation ───────────────────────────────────────────────────────────

type HubSection = 'actions' | 'prep' | 'objections' | 'followup';

const HUB_SECTIONS: { id: HubSection; label: string; shortLabel: string; icon: typeof Eye }[] = [
  { id: 'actions',    label: 'Next Actions',    shortLabel: 'Actions',   icon: Zap },
  { id: 'prep',       label: 'Meeting Prep',    shortLabel: 'Prep',      icon: Mic },
  { id: 'objections', label: 'Objections',      shortLabel: 'Objections', icon: Shield },
  { id: 'followup',   label: 'Follow-up Guide', shortLabel: 'Follow-up', icon: ArrowRight },
];

// ─── Main Component ───────────────────────────────────────────────────────────

interface SalesExecutionHubProps {
  lead: Lead;
}

export function SalesExecutionHub({ lead }: SalesExecutionHubProps) {
  const [section, setSection] = useState<HubSection>('actions');
  const activities = useSelector((state: RootState) => state.activities || []);

  const prep       = useMemo(() => deriveMeetingPrep(lead), [lead.stage, lead.conversationStage, lead.website, lead.aiCallPrepOutput, lead.growthPrescription]);
  const followUp   = useMemo(() => deriveFollowUpRecommendation(lead, activities), [lead.stage, lead.conversationStage, activities]);
  const stagePlan  = useMemo(() => deriveStageActionPlan(lead), [lead.stage]);
  const momentum   = useMemo(() => derivePipelineMomentumScore(lead, activities), [lead.stage, lead.conversationStage, activities]);

  return (
    <div className="flex flex-col h-full" data-testid="sales-execution-hub">
      {/* Compact pill nav */}
      <div className="flex gap-1 p-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/60">
        {HUB_SECTIONS.map(s => {
          const Icon = s.icon;
          const isActive = section === s.id;
          return (
            <button
              key={s.id}
              data-testid={`hub-section-${s.id}`}
              onClick={() => setSection(s.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all flex-1 justify-center',
                isActive
                  ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800',
              ].join(' ')}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:block">{s.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Momentum score pill — always visible */}
      {section !== 'actions' && (
        <div className={[
          'flex items-center gap-2 px-3 py-1.5 border-b text-xs',
          momentum.score >= 70
            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
            : momentum.score >= 40
            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400',
        ].join(' ')}>
          <BarChart2 className="w-3 h-3 flex-shrink-0" />
          <span>Momentum: <span className="font-bold">{momentum.score}/100</span> · {momentum.urgencyLabel}</span>
          {momentum.daysSinceLastContact < 999 && (
            <span className="ml-auto">{momentum.daysSinceLastContact}d since contact</span>
          )}
        </div>
      )}

      {/* Section content */}
      <div className="flex-1 overflow-y-auto">
        {section === 'actions' && (
          <StagePlanSection plan={stagePlan} momentumScore={momentum} />
        )}
        {section === 'prep' && <MeetingPrepSection prep={prep} />}
        {section === 'objections' && <ObjectionSection lead={lead} />}
        {section === 'followup' && <FollowUpSection rec={followUp} lead={lead} />}
      </div>
    </div>
  );
}

export default SalesExecutionHub;
