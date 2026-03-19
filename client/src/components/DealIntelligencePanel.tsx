import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, updateLead, patchLead } from '@/store';
import {
  Lead,
  Activity,
  SitemapPage,
  CrawledPage,
  CompetitorSiteData,
  CompetitorGBPData,
  MarketingActivity,
  AhrefsMetrics,
  AhrefsKeyword,
  StrategyIntelligence,
  STAGE_LABELS,
} from '@/lib/types';
import GrowthPrescriptionPanel from './GrowthPrescriptionPanel';
import {
  Heart,
  Globe,
  MapPin,
  Star,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  FileText,
  Zap,
  Users,
  ExternalLink,
  Eye,
  Pencil,
  Check,
  X,
  Loader2,
  Search,
  ScanLine,
  ChevronDown,
  ChevronUp,
  Tag,
  Link2,
  Image,
  Plus,
  Trash2,
  BarChart3,
  RefreshCw,
  Sparkles,
  Mic,
  MicOff,
  Target,
  Wand2,
  Building2,
  Maximize2,
  Layout,
  Brain,
  ShieldCheck,
  Monitor,
} from 'lucide-react';
import { SiFacebook, SiInstagram, SiLinkedin, SiSalesforce } from 'react-icons/si';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, differenceInDays, isPast, isToday } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { updateLeadInFirestore } from '@/lib/firestoreService';
import { useToast } from '@/hooks/use-toast';

interface DealIntelligencePanelProps {
  lead: Lead;
}

interface HealthSignal {
  label: string;
  positive: boolean;
  weight: number;
}

function computeDealHealth(lead: Lead, activities: Activity[]): {
  score: number;
  level: 'strong' | 'good' | 'fair' | 'at_risk';
  signals: HealthSignal[];
} {
  const leadActivities = activities.filter(a => a.leadId === lead.id);
  const signals: HealthSignal[] = [];
  let score = 50;

  const callCount = leadActivities.filter(a => a.type === 'call').length;
  const emailCount = leadActivities.filter(a => a.type === 'email').length;
  const meetingCount = leadActivities.filter(a => a.type === 'meeting').length;
  const meetingBookedCount = leadActivities.filter(a => a.type === 'meeting_booked').length;
  const totalActivities = leadActivities.length;

  if (totalActivities === 0) {
    signals.push({ label: 'No activity logged yet', positive: false, weight: -20 });
    score -= 20;
  } else if (totalActivities >= 5) {
    signals.push({ label: `${totalActivities} activities logged`, positive: true, weight: 10 });
    score += 10;
  } else {
    signals.push({ label: `${totalActivities} activities logged`, positive: true, weight: 5 });
    score += 5;
  }

  if (meetingBookedCount > 0 || meetingCount > 0) {
    signals.push({ label: 'Meeting booked or held', positive: true, weight: 15 });
    score += 15;
  }

  if (callCount === 0) {
    signals.push({ label: 'No calls made', positive: false, weight: -10 });
    score -= 10;
  } else if (callCount >= 3) {
    signals.push({ label: `${callCount} calls made`, positive: true, weight: 5 });
    score += 5;
  }

  if (lead.nextContactDate) {
    const nextDate = new Date(lead.nextContactDate);
    if (isPast(nextDate) && !isToday(nextDate)) {
      const daysOverdue = differenceInDays(new Date(), nextDate);
      signals.push({ label: `Follow-up ${daysOverdue}d overdue`, positive: false, weight: -15 });
      score -= 15;
    } else {
      signals.push({ label: 'Follow-up scheduled', positive: true, weight: 5 });
      score += 5;
    }
  } else {
    signals.push({ label: 'No next contact scheduled', positive: false, weight: -10 });
    score -= 10;
  }

  const advancedStages = ['discovery', 'proposal', 'negotiation', 'won'];
  if (advancedStages.includes(lead.stage)) {
    signals.push({ label: `Stage: ${STAGE_LABELS[lead.stage]}`, positive: true, weight: 10 });
    score += 10;
  }

  if (lead.conversationStage && lead.conversationStage !== 'not_started' && lead.conversationStage !== 'attempted') {
    signals.push({ label: 'Conversation progressed', positive: true, weight: 5 });
    score += 5;
  }

  if (lead.mrr && lead.mrr > 0) {
    signals.push({ label: `MRR: $${lead.mrr}/mo`, positive: true, weight: 5 });
    score += 5;
  }

  score = Math.max(0, Math.min(100, score));

  const level = score >= 75 ? 'strong' : score >= 55 ? 'good' : score >= 35 ? 'fair' : 'at_risk';

  return { score, level, signals };
}

function generateDealSummary(lead: Lead, activities: Activity[]): string {
  const pack = (lead as any).prepCallPack;

  // If a prep pack exists, use its commercial intelligence as the primary summary
  if (pack?.businessSnapshot) {
    const parts: string[] = [pack.businessSnapshot];
    if (pack.commercialAngle) {
      parts.push(`Key angle: ${pack.commercialAngle}`);
    }
    const leadActivities = activities.filter(a => a.leadId === lead.id);
    if (leadActivities.length > 0) {
      const last = [...leadActivities].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      const daysAgo = differenceInDays(new Date(), new Date(last.createdAt));
      if (daysAgo === 0) parts.push(`Last activity: today (${last.type}).`);
      else if (daysAgo === 1) parts.push(`Last activity: yesterday (${last.type}).`);
      else parts.push(`Last activity: ${daysAgo} days ago (${last.type}).`);
    }
    return parts.join(' ');
  }

  // Fallback: rule-based summary
  const parts: string[] = [];
  if (lead.companyName) {
    let intro = `${lead.companyName}`;
    if (lead.territory || lead.areaName) intro += ` is located in ${lead.territory || lead.areaName}`;
    if (lead.sourceData?.googleTypes?.[0]) intro += ` and operates in ${lead.sourceData.googleTypes[0]}`;
    parts.push(intro + '.');
  }

  const leadActivities = activities.filter(a => a.leadId === lead.id);
  if (leadActivities.length > 0) {
    const lastActivity = [...leadActivities].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    const daysAgo = differenceInDays(new Date(), new Date(lastActivity.createdAt));
    if (daysAgo === 0) parts.push(`Last activity was today (${lastActivity.type}).`);
    else if (daysAgo === 1) parts.push(`Last activity was yesterday (${lastActivity.type}).`);
    else parts.push(`Last activity was ${daysAgo} days ago (${lastActivity.type}).`);
  } else {
    parts.push('No activity has been logged yet.');
  }

  if (lead.website && !lead.sourceData?.googlePlaceId) {
    parts.push('Has a website but no Google Business Profile on record — potential visibility opportunity.');
  } else if (!lead.website && lead.sourceData?.googlePlaceId) {
    parts.push('Has a Google presence but no website recorded — potential web opportunity.');
  } else if (!lead.website && !lead.sourceData?.googlePlaceId) {
    parts.push('No website or Google presence on record — strong opportunity for a full digital strategy.');
  } else if (lead.sourceData?.googleRating && lead.sourceData.googleRating < 4.0) {
    parts.push(`Google rating of ${lead.sourceData.googleRating} could be improved — reputation management opportunity.`);
  }

  return parts.join(' ');
}

function getNextBestAction(lead: Lead, activities: Activity[]): { action: string; urgency: 'high' | 'medium' | 'low'; icon: typeof Phone } {
  const leadActivities = activities.filter(a => a.leadId === lead.id);
  const callCount = leadActivities.filter(a => a.type === 'call').length;
  const meetingBooked = leadActivities.filter(a => a.type === 'meeting_booked').length;

  if (leadActivities.length === 0) {
    return { action: 'Log your first contact attempt to get this deal moving', urgency: 'high', icon: Phone };
  }

  if (lead.nextContactDate) {
    const nextDate = new Date(lead.nextContactDate);
    if (isPast(nextDate) && !isToday(nextDate)) {
      return { action: 'Follow-up is overdue — call today before the lead goes cold', urgency: 'high', icon: Phone };
    }
  }

  if (!lead.nextContactDate) {
    return { action: 'Set a next contact date to keep momentum', urgency: 'medium', icon: Calendar };
  }

  if (callCount > 0 && meetingBooked === 0) {
    return { action: 'Book a discovery meeting to advance this deal', urgency: 'medium', icon: Calendar };
  }

  if (!lead.aiCallPrep) {
    return { action: 'Generate call prep to go in prepared', urgency: 'low', icon: FileText };
  }

  if (!lead.aiFollowUp && leadActivities.length >= 2) {
    return { action: 'Draft a follow-up to keep engagement high', urgency: 'low', icon: Mail };
  }

  return { action: 'Continue building the relationship — log your next activity', urgency: 'low', icon: MessageSquare };
}

const HEALTH_COLORS = {
  strong: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800',
  good: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950 dark:border-blue-800',
  fair: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800',
  at_risk: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950 dark:border-red-800',
};

const HEALTH_LABELS = {
  strong: 'Strong',
  good: 'Good',
  fair: 'Fair',
  at_risk: 'At Risk',
};

const URGENCY_COLORS = {
  high: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300',
  medium: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300',
  low: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300',
};

// ─── Strategy Intelligence Card ──────────────────────────────────────────────

const SR_SUPPORTED = typeof window !== 'undefined' && !!(
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
);

const STRATEGY_FIELDS: { key: keyof StrategyIntelligence; label: string; placeholder: string; hint: string; rows: number }[] = [
  { key: 'businessOverview', label: 'Business Overview', placeholder: 'Residential builder specialising in custom homes and renovations in South Brisbane.', hint: 'What type of business is this and what do they primarily do?', rows: 3 },
  { key: 'idealCustomer', label: 'Ideal Customer', placeholder: 'Homeowners and developers looking for custom home builds and renovations.', hint: 'Who is the ideal client they want more of?', rows: 2 },
  { key: 'coreServices', label: 'Core Revenue Services', placeholder: 'Custom homes\nRenovations\nExtensions', hint: 'What services generate the most revenue or are the main focus?', rows: 3 },
  { key: 'targetLocations', label: 'Target Locations', placeholder: 'Eight Mile Plains\nSunnybank\nMount Gravatt', hint: 'Which locations do they want to generate work from?', rows: 3 },
  { key: 'growthObjective', label: 'Growth Objective', placeholder: 'Increase enquiries for custom home builds in South Brisbane.', hint: 'What would success look like for this business?', rows: 2 },
  { key: 'discoveryNotes', label: 'Discovery Notes', placeholder: 'Most work comes from architects but the owner wants more direct homeowner enquiries.', hint: 'Any insights from conversations that may influence the strategy.', rows: 3 },
];

function SITextArea({ value, onChange, placeholder, rows, fieldLabel, tidyEndpoint }: {
  value: string; onChange: (v: string) => void; placeholder: string; rows: number; fieldLabel: string; tidyEndpoint: string;
}) {
  const [recording, setRecording] = useState(false);
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [tidying, setTidying] = useState(false);
  const recognitionRef = useRef<any>(null);

  const startRecording = () => {
    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass) return;
    const rec = new SRClass();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-AU';
    let accumulated = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) accumulated += (accumulated ? ' ' : '') + t.trim();
        else interim += t;
      }
      setFinalText(accumulated); setInterimText(interim);
    };
    rec.onend = () => { setRecording(false); setInterimText(''); };
    rec.onerror = () => { setRecording(false); setInterimText(''); };
    recognitionRef.current = rec; rec.start();
    setRecording(true); setFinalText(''); setInterimText('');
  };

  const stopRecording = () => { recognitionRef.current?.stop(); setRecording(false); setInterimText(''); };

  const saveAndTidy = async () => {
    const raw = finalText.trim();
    if (!raw) { setFinalText(''); return; }
    stopRecording(); setTidying(true);
    try {
      const combined = value ? `${value.trim()}\n\n${raw}` : raw;
      const res = await fetch(tidyEndpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: combined, fieldLabel }),
      });
      const json = await res.json();
      onChange(json.tidied || combined);
    } catch { onChange(value ? `${value.trim()}\n\n${raw}` : raw); }
    setFinalText(''); setTidying(false);
  };

  const displayValue = recording
    ? [value, finalText, interimText].filter(Boolean).join('\n\n')
    : value;

  return (
    <div className="relative">
      <Textarea
        value={displayValue}
        onChange={e => { if (!recording) onChange(e.target.value); }}
        placeholder={placeholder}
        rows={rows}
        className={`text-xs resize-none pr-8 ${recording ? 'ring-2 ring-red-400 dark:ring-red-600' : ''}`}
        readOnly={recording}
      />
      {SR_SUPPORTED && (
        <div className="absolute bottom-2 right-2 flex gap-1">
          {recording ? (
            finalText ? (
              <button type="button" onClick={saveAndTidy} disabled={tidying} title="Save & tidy dictation"
                className="p-1 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:opacity-80">
                {tidying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </button>
            ) : null
          ) : null}
          <button type="button"
            onClick={recording ? stopRecording : startRecording}
            title={recording ? 'Stop recording' : 'Start voice dictation'}
            className={`p-1 rounded transition-colors ${recording ? 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 animate-pulse' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
            {recording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
          </button>
        </div>
      )}
    </div>
  );
}

function AgentIntelligenceCard({ lead }: { lead: Lead }) {
  const pack = (lead as any).prepCallPack;
  const [expanded, setExpanded] = useState(true);
  if (!pack?.businessSnapshot) return null;

  const cp = pack.customerProfile || {};
  const si = pack.searchIntentAnalysis || {};
  const wa = pack.websiteAnalysis || {};
  const hasCP = cp.likelyCustomer || cp.jobsToBeDone || cp.urgencyEmotion || cp.trustFactors;
  const hasSI = si.whyTheySearch || si.whatTheyNeedToSee || (si.primarySearchTerms?.length > 0);
  const hasWA = wa.whatItTries || wa.keyWeaknesses?.length;
  const hasOps = pack.opportunities?.length > 0 || pack.gaps?.length > 0;

  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-800/40 bg-violet-50/30 dark:bg-violet-950/10 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
        onClick={() => setExpanded(v => !v)}
        data-testid="button-toggle-agent-intelligence"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-violet-500 flex items-center justify-center shrink-0">
            <Brain className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-violet-900 dark:text-violet-200">Agent Intelligence</p>
            <p className="text-[10px] text-violet-500 dark:text-violet-400">Commercial point of view · auto-generated</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-violet-400" /> : <ChevronDown className="h-3.5 w-3.5 text-violet-400" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-violet-200 dark:border-violet-800/40 pt-3">

          {/* Customer profile */}
          {hasCP && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                <Users className="h-3 w-3" /> Customer Profile
              </p>
              {cp.likelyCustomer && (
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Who: </span>{cp.likelyCustomer}
                </div>
              )}
              {cp.jobsToBeDone && (
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Job to be done: </span>{cp.jobsToBeDone}
                </div>
              )}
              {cp.urgencyEmotion && (
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Urgency: </span>{cp.urgencyEmotion}
                </div>
              )}
              {cp.trustFactors && (
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Trust factors: </span>{cp.trustFactors}
                </div>
              )}
            </div>
          )}

          {/* Search intent */}
          {hasSI && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <Search className="h-3 w-3" /> Search Intent
              </p>
              {si.primarySearchTerms?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {si.primarySearchTerms.map((t: string, i: number) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 font-medium">{t}</span>
                  ))}
                </div>
              )}
              {si.whyTheySearch && (
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Why they search: </span>{si.whyTheySearch}
                </div>
              )}
              {si.whatTheyNeedToSee && (
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">What they need to see: </span>{si.whatTheyNeedToSee}
                </div>
              )}
            </div>
          )}

          {/* Website interpretation */}
          {hasWA && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Monitor className="h-3 w-3" /> Website Interpretation
              </p>
              {wa.whatItTries && (
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">What it's trying to do: </span>{wa.whatItTries}
                </div>
              )}
              {wa.keyWeaknesses?.length > 0 && (
                <ul className="space-y-1">
                  {wa.keyWeaknesses.map((w: string, i: number) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
              {wa.missedOpportunity && (
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Missed opportunity: </span>{wa.missedOpportunity}
                </div>
              )}
            </div>
          )}

          {/* Opportunities */}
          {hasOps && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pack.opportunities?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400 mb-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Opportunities
                  </p>
                  <ul className="space-y-1">
                    {pack.opportunities.slice(0, 3).map((op: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />{op}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pack.gaps?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-500 dark:text-red-400 mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Key Gaps
                  </p>
                  <ul className="space-y-1">
                    {pack.gaps.slice(0, 3).map((g: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <AlertTriangle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />{g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Commercial angle */}
          {pack.commercialAngle && (
            <div className="rounded-md bg-violet-100 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800/40 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1 flex items-center gap-1">
                <Zap className="h-3 w-3" /> Commercial Angle
              </p>
              <p className="text-xs font-medium text-violet-900 dark:text-violet-200 leading-relaxed">{pack.commercialAngle}</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function StrategyIntelligenceCard({ lead }: { lead: Lead }) {
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();
  const activities = useSelector((state: RootState) => state.app.activities);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<StrategyIntelligence>(lead.strategyIntelligence || {});
  const [suggesting, setSuggesting] = useState<Partial<Record<keyof StrategyIntelligence, boolean>>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from lead prop when it changes externally
  useEffect(() => { setFields(lead.strategyIntelligence || {}); }, [lead.strategyIntelligence]);

  const filledCount = STRATEGY_FIELDS.filter(f => fields[f.key]?.trim()).length;
  const hasAny = filledCount > 0;

  const persist = useCallback((updated: StrategyIntelligence) => {
    if (!orgId || !authReady) return;
    const updates: Partial<Lead> = { strategyIntelligence: { ...updated, updatedAt: new Date() } as any, updatedAt: new Date() };
    dispatch(patchLead({ id: lead.id, updates }));
    updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
  }, [dispatch, lead.id, orgId, authReady]);

  const handleChange = useCallback((key: keyof StrategyIntelligence, val: string) => {
    setFields(prev => {
      const next = { ...prev, [key]: val };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => persist(next), 800);
      return next;
    });
  }, [persist]);

  const handleSuggest = useCallback(async (fieldKey: keyof StrategyIntelligence, fieldLabel: string, fieldHint: string) => {
    setSuggesting(p => ({ ...p, [fieldKey]: true }));
    try {
      const dealSummary = generateDealSummary(lead, activities);
      const websiteContent = lead.crawledPages?.map(p => p.bodyText || '').filter(Boolean).slice(0, 3).join(' ') || '';
      const context: Record<string, string> = {
        companyName: lead.companyName,
        industry: lead.industry || '',
        website: lead.website || '',
        location: (lead.sourceData as any)?.city || (lead.address || ''),
        dealStage: lead.stage,
        businessOverview: fields.businessOverview || '',
        idealCustomer: fields.idealCustomer || '',
        coreServices: fields.coreServices || '',
        targetLocations: fields.targetLocations || '',
        growthObjective: fields.growthObjective || '',
        conversationNotes: lead.notes || '',
        conversationInsights: lead.aiConversationInsights ? JSON.stringify(lead.aiConversationInsights).slice(0, 500) : '',
        dealSummary,
        websiteContent,
      };
      const res = await fetch('/api/leads/ai/suggest-field', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldLabel, fieldHint, context }),
      });
      if (!res.ok) throw new Error('Suggest failed');
      const { suggestion } = await res.json();
      if (suggestion) handleChange(fieldKey, suggestion);
    } catch {
      toast({ title: 'Suggestion failed', description: 'Could not generate a suggestion', variant: 'destructive' });
    }
    setSuggesting(p => ({ ...p, [fieldKey]: false }));
  }, [lead, activities, fields, handleChange, toast]);

  return (
    <div className="rounded-lg border bg-card overflow-hidden" data-testid="card-strategy-intelligence">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Strategy Intelligence</span>
          {!open && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {hasAny ? `${filledCount} of ${STRATEGY_FIELDS.length} fields filled` : 'Business discovery inputs for AI strategy'}
            </p>
          )}
        </div>
        {hasAny && !open && (
          <Badge variant="secondary" className="text-[9px] bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-0 shrink-0">
            {filledCount}/{STRATEGY_FIELDS.length}
          </Badge>
        )}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t px-3 pt-3 pb-4 space-y-4">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            These inputs are used by the AI to generate a personalised Digital Growth Strategy. Fill in what you know — use <span className="font-medium text-violet-600 dark:text-violet-400">AI suggest</span> to auto-fill from your conversation notes and website data.
          </p>
          {STRATEGY_FIELDS.map(field => (
            <div key={field.key} className="space-y-1.5" data-testid={`si-field-${field.key}`}>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">{field.label}</Label>
                <button
                  type="button"
                  disabled={!!suggesting[field.key]}
                  onClick={() => handleSuggest(field.key, field.label, field.hint)}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 disabled:opacity-50 transition-colors"
                  data-testid={`button-si-suggest-${field.key}`}
                >
                  {suggesting[field.key] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {suggesting[field.key] ? 'Suggesting…' : 'AI suggest'}
                </button>
              </div>
              <SITextArea
                value={fields[field.key] || ''}
                onChange={val => handleChange(field.key, val)}
                placeholder={field.placeholder}
                rows={field.rows}
                fieldLabel={field.label}
                tidyEndpoint="/api/leads/ai/tidy-dictation"
              />
            </div>
          ))}

          {hasAny && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Check className="h-2.5 w-2.5 text-green-500" />
              Auto-saved — will be included in AI Growth Strategy
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DealIntelligencePanel({ lead }: DealIntelligencePanelProps) {
  const activities = useSelector((state: RootState) => state.app.activities);
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [newCompetitor, setNewCompetitor] = useState('');
  const [competitorSitemapLoading, setCompetitorSitemapLoading] = useState<Record<string, boolean>>({});
  const [competitorDeepCrawling, setCompetitorDeepCrawling] = useState<Record<string, boolean>>({});
  const [screenshotCacheBust, setScreenshotCacheBust] = useState<number>(Date.now());
  const [screenshotLoaded, setScreenshotLoaded] = useState(false);
  const [screenshotError, setScreenshotError] = useState(false);
  const [screenshotExpanded, setScreenshotExpanded] = useState(true);
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);
  const [discoveringSocial, setDiscoveringSocial] = useState(false);
  const prevWebsite = useRef<string | undefined>(undefined);
  const [mockWebsiteHtml, setMockWebsiteHtml] = useState<string | null>(lead.mockWebsiteHtml || null);
  const [mockWebsiteGaps, setMockWebsiteGaps] = useState<string[]>(lead.mockWebsiteGaps || []);
  const [generatingMockWebsite, setGeneratingMockWebsite] = useState(false);
  const [mockWebsiteExpanded, setMockWebsiteExpanded] = useState(true);
  const [mockWebsiteModalOpen, setMockWebsiteModalOpen] = useState(false);

  // Sanitize stored HTML — replace loremflickr redirecting URLs with picsum.photos
  // (picsum serves images directly with CORS headers, works reliably in srcDoc iframes)
  const sanitizedMockHtml = useMemo(() => {
    if (!mockWebsiteHtml) return null;
    return mockWebsiteHtml.replace(
      /https?:\/\/loremflickr\.com\/(\d+)\/(\d+)\/[^'"\s)]*/g,
      'https://picsum.photos/seed/200/$1/$2'
    );
  }, [mockWebsiteHtml]);

  // Auto-reset screenshot state when website changes
  useEffect(() => {
    if (lead.website !== prevWebsite.current) {
      prevWebsite.current = lead.website;
      setScreenshotLoaded(false);
      setScreenshotError(false);
      setScreenshotCacheBust(Date.now());
      setScreenshotExpanded(true);
    }
  }, [lead.website]);

  // Sync mock website state from lead
  useEffect(() => {
    setMockWebsiteHtml(lead.mockWebsiteHtml || null);
    setMockWebsiteGaps(lead.mockWebsiteGaps || []);
  }, [lead.mockWebsiteHtml, lead.mockWebsiteGaps]);

  const saveCompetitorDomains = useCallback(async (domains: string[]) => {
    if (!orgId || !authReady) return;
    const updates: Partial<Lead> = { competitorDomains: domains, updatedAt: new Date() };
    dispatch(patchLead({ id: lead.id, updates }));
    await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
  }, [dispatch, lead.id, orgId, authReady]);

  const addCompetitor = useCallback(() => {
    const raw = newCompetitor.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!raw) return;
    const existing = lead.competitorDomains || [];
    if (existing.includes(raw)) { setNewCompetitor(''); return; }
    const updated = [...existing, raw];
    saveCompetitorDomains(updated);
    setNewCompetitor('');
    toast({ title: 'Competitor saved', description: raw });
  }, [newCompetitor, lead.competitorDomains, saveCompetitorDomains, toast]);

  const removeCompetitor = useCallback((domain: string) => {
    const updated = (lead.competitorDomains || []).filter(d => d !== domain);
    saveCompetitorDomains(updated);
  }, [lead.competitorDomains, saveCompetitorDomains]);

  const handleCompetitorSitemapScan = useCallback(async (domain: string) => {
    if (!orgId || !authReady) return;
    setCompetitorSitemapLoading(p => ({ ...p, [domain]: true }));
    try {
      const sitemapUrl = `https://${domain}/sitemap.xml`;
      const res = await fetch(`/api/sitemap?url=${encodeURIComponent(sitemapUrl)}`);
      if (!res.ok) throw new Error('Sitemap fetch failed');
      const data = await res.json();
      const existing = lead.competitorData || {};
      const updated = { ...existing, [domain]: { ...(existing[domain] || {}), sitemapPages: data.pages, sitemapFetchedAt: new Date() } };
      const updates: Partial<Lead> = { competitorData: updated, updatedAt: new Date() };
      dispatch(patchLead({ id: lead.id, updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
      toast({ title: 'Sitemap scanned', description: `${data.pages?.length ?? 0} pages found on ${domain}` });
    } catch {
      toast({ title: 'Scan failed', description: `Could not fetch sitemap for ${domain}`, variant: 'destructive' });
    } finally {
      setCompetitorSitemapLoading(p => ({ ...p, [domain]: false }));
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleCompetitorDeepCrawl = useCallback(async (domain: string) => {
    if (!orgId || !authReady) return;
    const sitemapPages = lead.competitorData?.[domain]?.sitemapPages;
    if (!sitemapPages?.length) {
      toast({ title: 'Scan sitemap first', description: 'Run the sitemap scan before deep crawling', variant: 'destructive' });
      return;
    }
    setCompetitorDeepCrawling(p => ({ ...p, [domain]: true }));
    try {
      const urls = sitemapPages.map((p: SitemapPage) => p.url);
      const res = await fetch('/api/crawl-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, domain }),
      });
      if (!res.ok) throw new Error('Crawl failed');
      const data = await res.json();
      const existing = lead.competitorData || {};
      const updated = { ...existing, [domain]: { ...(existing[domain] || {}), crawledPages: data.crawledPages, crawledAt: new Date() } };
      const updates: Partial<Lead> = { competitorData: updated, updatedAt: new Date() };
      dispatch(patchLead({ id: lead.id, updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
      const success = data.crawledPages.filter((p: any) => !p.error).length;
      toast({ title: 'Deep crawl complete', description: `SEO signals extracted from ${success} pages on ${domain}` });
    } catch {
      toast({ title: 'Crawl failed', description: `Could not crawl ${domain}`, variant: 'destructive' });
    } finally {
      setCompetitorDeepCrawling(p => ({ ...p, [domain]: false }));
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleFetchAhrefs = useCallback(async () => {
    if (!lead.website || !orgId || !authReady) return;
    const target = lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const [metricsRes, keywordsRes] = await Promise.all([
      fetch(`/api/ahrefs/metrics?target=${encodeURIComponent(target)}`),
      fetch(`/api/ahrefs/keywords?target=${encodeURIComponent(target)}`),
    ]);
    if (!metricsRes.ok) {
      const err = await metricsRes.json().catch(() => ({}));
      throw new Error((err as any).error || 'Ahrefs fetch failed');
    }
    const metrics = await metricsRes.json();
    const kwData = keywordsRes.ok ? await keywordsRes.json() : { keywords: [] };
    const ahrefsData: AhrefsMetrics = { ...metrics, topKeywords: kwData.keywords || [], fetchedAt: new Date(), target };
    const updates: Partial<Lead> = { ahrefsData, updatedAt: new Date() };
    dispatch(patchLead({ id: lead.id, updates }));
    await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
  }, [lead, orgId, authReady, dispatch]);

  const handleCompetitorAhrefsFetch = useCallback(async (domain: string) => {
    if (!orgId || !authReady) return;
    const target = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const [metricsRes, keywordsRes] = await Promise.all([
      fetch(`/api/ahrefs/metrics?target=${encodeURIComponent(target)}`),
      fetch(`/api/ahrefs/keywords?target=${encodeURIComponent(target)}`),
    ]);
    if (!metricsRes.ok) {
      const err = await metricsRes.json().catch(() => ({}));
      throw new Error((err as any).error || 'Ahrefs fetch failed');
    }
    const metrics = await metricsRes.json();
    const kwData = keywordsRes.ok ? await keywordsRes.json() : { keywords: [] };
    const ahrefs: AhrefsMetrics = { ...metrics, topKeywords: kwData.keywords || [], fetchedAt: new Date(), target };
    const existing = lead.competitorData || {};
    const updated = { ...existing, [domain]: { ...(existing[domain] || {}), ahrefs } };
    const updates: Partial<Lead> = { competitorData: updated, updatedAt: new Date() };
    dispatch(patchLead({ id: lead.id, updates }));
    await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
  }, [lead, orgId, authReady, dispatch]);

  const saveMarketingActivity = useCallback(async (updated: MarketingActivity[]) => {
    const updates: Partial<Lead> = { marketingActivity: updated, updatedAt: new Date() };
    dispatch(patchLead({ id: lead.id, updates }));
    if (orgId && authReady) {
      await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
    }
  }, [lead.id, lead, orgId, authReady, dispatch]);

  const handleCompetitorGBPLookup = useCallback(async (domain: string, placeId: string) => {
    if (!orgId || !authReady) return;
    const res = await fetch(`/api/google-places/details/${placeId}`);
    if (!res.ok) throw new Error('Failed to fetch GBP data');
    const data = await res.json();
    const gbp: CompetitorGBPData = {
      placeId: data.placeId || placeId,
      name: data.name || domain,
      address: data.address,
      rating: data.rating ?? null,
      reviewCount: data.reviewCount ?? 0,
      phone: data.phone ?? null,
      website: data.website ?? null,
      primaryType: data.primaryType,
      mapsUrl: `https://www.google.com/maps/place/?q=place_id:${data.placeId || placeId}`,
      fetchedAt: new Date(),
    };
    const existing = lead.competitorData || {};
    const updated = { ...existing, [domain]: { ...(existing[domain] || {}), gbp } };
    const updates: Partial<Lead> = { competitorData: updated, updatedAt: new Date() };
    dispatch(patchLead({ id: lead.id, updates }));
    await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
  }, [lead, orgId, authReady, dispatch]);

  const health = useMemo(() => computeDealHealth(lead, activities), [lead, activities]);
  const summary = useMemo(() => generateDealSummary(lead, activities), [lead, activities]);
  const nextAction = useMemo(() => getNextBestAction(lead, activities), [lead, activities]);

  const handleGBPLookup = useCallback(async (placeId: string) => {
    if (!placeId.trim() || !orgId || !authReady) return;
    try {
      const res = await fetch(`/api/google-places/details/${placeId.trim()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch GBP data');
      }
      const data = await res.json();
      const sourceData: any = {
        ...(lead.sourceData || { source: 'manual' }),
        googlePlaceId: data.placeId || placeId.trim(),
        googleRating: data.rating ?? lead.sourceData?.googleRating,
        googleReviewCount: data.reviewCount ?? lead.sourceData?.googleReviewCount,
        googleTypes: data.types || lead.sourceData?.googleTypes,
        googleMapsUrl: `https://www.google.com/maps/place/?q=place_id:${data.placeId || placeId.trim()}`,
        googleAddress: data.address || lead.sourceData?.googleAddress,
        googlePhone: data.phone || lead.sourceData?.googlePhone,
        googleWebsite: data.website || lead.sourceData?.googleWebsite,
        category: data.primaryType || lead.sourceData?.category,
      };
      const leadUpdates: Partial<Lead> = {
        sourceData,
        address: lead.address || data.address || undefined,
        phone: lead.phone || data.phone || undefined,
        website: lead.website || data.website || undefined,
        industry: data.primaryType || lead.industry || undefined,
        updatedAt: new Date(),
      };
      dispatch(patchLead({ id: lead.id, updates: leadUpdates }));
      await updateLeadInFirestore(orgId, lead.id, leadUpdates, authReady);
      toast({
        title: 'GBP Data Loaded',
        description: `${data.reviewCount || 0} reviews · ${data.rating || 'No'} rating · ${data.primaryType || 'Business'}`,
      });

      // Auto-discover social links if not already set
      const websiteForSocial = leadUpdates.website || lead.website || data.website;
      if (websiteForSocial && !lead.facebookUrl && !lead.instagramUrl && !lead.linkedinUrl) {
        handleDiscoverSocial(websiteForSocial);
      }
    } catch (err: any) {
      toast({ title: 'Lookup Failed', description: err.message || 'Could not fetch Google Business data', variant: 'destructive' });
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleDiscoverSocial = useCallback(async (websiteUrl?: string) => {
    const url = websiteUrl || lead.website;
    if (!url || !orgId || !authReady) return;
    setDiscoveringSocial(true);
    try {
      const res = await fetch('/api/leads/discover-social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ websiteUrl: url }),
      });
      if (!res.ok) throw new Error('Discovery failed');
      const data = await res.json() as { facebookUrl: string | null; instagramUrl: string | null; linkedinUrl: string | null };
      const updates: Partial<Lead> = {};
      if (data.facebookUrl && !lead.facebookUrl) updates.facebookUrl = data.facebookUrl;
      if (data.instagramUrl && !lead.instagramUrl) updates.instagramUrl = data.instagramUrl;
      if (data.linkedinUrl && !lead.linkedinUrl) updates.linkedinUrl = data.linkedinUrl;
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        dispatch(patchLead({ id: lead.id, updates }));
        await updateLeadInFirestore(orgId, lead.id, updates, authReady);
        const found = [
          updates.facebookUrl && 'Facebook',
          updates.instagramUrl && 'Instagram',
          updates.linkedinUrl && 'LinkedIn',
        ].filter(Boolean).join(', ');
        toast({ title: 'Social profiles found', description: found });
      } else {
        toast({ title: 'No new profiles found', description: 'Check the website has visible social links' });
      }
    } catch {
      toast({ title: 'Discovery failed', description: 'Could not read the website', variant: 'destructive' });
    } finally {
      setDiscoveringSocial(false);
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleSitemapFetch = useCallback(async (sitemapUrl: string) => {
    if (!sitemapUrl.trim() || !orgId || !authReady) return;
    try {
      const res = await fetch(`/api/sitemap?url=${encodeURIComponent(sitemapUrl.trim())}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch sitemap');
      }
      const data = await res.json();
      const updates: Partial<Lead> = {
        sitemapUrl: sitemapUrl.trim(),
        sitemapPages: data.pages,
        sitemapFetchedAt: new Date(),
        updatedAt: new Date(),
      };
      dispatch(patchLead({ id: lead.id, updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady);
      toast({
        title: 'Sitemap Captured',
        description: `Found ${data.totalPages} page${data.totalPages !== 1 ? 's' : ''} across ${Object.keys(data.sections || {}).length} section${Object.keys(data.sections || {}).length !== 1 ? 's' : ''}`,
      });
    } catch (err: any) {
      toast({ title: 'Sitemap Failed', description: err.message || 'Could not fetch sitemap', variant: 'destructive' });
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleGenerateMockWebsite = useCallback(async () => {
    if (!orgId || !authReady) return;
    setGeneratingMockWebsite(true);
    try {
      const res = await fetch('/api/leads/ai/mock-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, orgId }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setMockWebsiteHtml(data.html);
      setMockWebsiteGaps(data.gaps || []);
      setMockWebsiteExpanded(true);
      dispatch(patchLead({ id: lead.id, updates: { mockWebsiteHtml: data.html, mockWebsiteGaps: data.gaps || [], updatedAt: new Date() } }));
      toast({ title: 'Ideal website ready', description: 'Mockup generated from strategy and business data' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Generation failed', description: 'Could not build mock website', variant: 'destructive' });
    } finally {
      setGeneratingMockWebsite(false);
    }
  }, [lead.id, orgId, authReady, dispatch, toast]);

  const handleCrawlPages = useCallback(async () => {
    const pages = lead.sitemapPages;
    if (!pages?.length || !orgId || !authReady) return;
    const urls = pages.map(p => p.url);
    const domain = (() => {
      try { return lead.website ? new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`).hostname : undefined; } catch { return undefined; }
    })();
    try {
      const res = await fetch('/api/crawl-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, domain }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Crawl failed');
      }
      const data = await res.json();
      const updates: Partial<Lead> = {
        crawledPages: data.crawledPages,
        crawledAt: new Date(),
        updatedAt: new Date(),
      };
      dispatch(patchLead({ id: lead.id, updates }));
      await updateLeadInFirestore(orgId, lead.id, updates, authReady);
      const success = data.crawledPages.filter((p: any) => !p.error).length;
      toast({
        title: 'Pages Analysed',
        description: `Extracted SEO signals from ${success} of ${data.crawledPages.length} pages`,
      });
    } catch (err: any) {
      toast({ title: 'Crawl Failed', description: err.message || 'Could not crawl pages', variant: 'destructive' });
    }
  }, [lead, orgId, authReady, dispatch, toast]);

  const handleUpdatePresenceField = useCallback((field: keyof Lead, value: string) => {
    dispatch(updateLead({ ...lead, [field]: value || undefined, updatedAt: new Date() }));
    if (orgId && authReady) {
      if (debounceRef.current[field]) clearTimeout(debounceRef.current[field]);
      debounceRef.current[field] = setTimeout(() => {
        updateLeadInFirestore(orgId, lead.id, { [field]: value || null, updatedAt: new Date() }, authReady)
          .catch(err => console.error(`[DealIntelligencePanel] Failed to save ${field}:`, err));
        delete debounceRef.current[field];
      }, 800);
    }
  }, [dispatch, lead, orgId, authReady]);

  return (
    <div className="p-4 space-y-4" data-testid="deal-intelligence-panel">
      <div className="flex items-center gap-2 mb-1">
        <Eye className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold tracking-tight">Deal Intelligence</h3>
      </div>

      <div className={`rounded-lg border p-3 ${HEALTH_COLORS[health.level]}`} data-testid="card-deal-health">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">Deal Health</span>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold">{health.score}</span>
            <span className="text-xs font-medium">/100</span>
            <Badge variant="outline" className="text-[10px] ml-1 border-current">{HEALTH_LABELS[health.level]}</Badge>
          </div>
        </div>
        <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full mb-2">
          <div
            className="h-full rounded-full bg-current transition-all"
            style={{ width: `${health.score}%` }}
          />
        </div>
        <div className="space-y-0.5">
          {health.signals.slice(0, 4).map((signal, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              {signal.positive ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 opacity-70" />
              ) : (
                <AlertTriangle className="h-3 w-3 shrink-0 opacity-70" />
              )}
              <span>{signal.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3" data-testid="card-deal-summary">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Deal Summary</span>
        </div>
        {summary ? (
          <p className="text-sm text-foreground leading-relaxed">{summary}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Not enough information yet. Log a conversation or generate call prep to build a richer summary.</p>
        )}
      </div>

      <AgentIntelligenceCard lead={lead} />

      <StrategyIntelligenceCard lead={lead} />

      <GrowthPrescriptionPanel lead={lead} />

      <div className="rounded-lg border bg-card p-3" data-testid="card-online-presence">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Online Presence</span>
          </div>
          {lead.website && (
            <button
              onClick={() => handleDiscoverSocial()}
              disabled={discoveringSocial}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors disabled:opacity-50"
              title="Auto-detect Facebook, Instagram and LinkedIn from the website"
              data-testid="button-discover-social"
            >
              {discoveringSocial
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Search className="h-3 w-3" />}
              {discoveringSocial ? 'Discovering…' : 'Discover socials'}
            </button>
          )}
        </div>
        <div className="space-y-1">
          <EditablePresenceRow
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Industry"
            value={lead.industry || ''}
            placeholder="e.g. Plumbing, Dental, Café"
            onSave={(v) => handleUpdatePresenceField('industry', v)}
          />
          <EditablePresenceRow
            icon={<Globe className="h-3.5 w-3.5" />}
            label="Website"
            value={lead.website || ''}
            placeholder="https://example.com.au"
            link={lead.website}
            onSave={(v) => handleUpdatePresenceField('website', v)}
          />
          <GBPLookupRow
            lead={lead}
            onLookup={handleGBPLookup}
          />
          <EditablePresenceRow
            icon={<SiFacebook className="h-3 w-3" />}
            label="Facebook"
            value={lead.facebookUrl || ''}
            placeholder="https://facebook.com/page"
            link={lead.facebookUrl}
            onSave={(v) => handleUpdatePresenceField('facebookUrl', v)}
          />
          <EditablePresenceRow
            icon={<SiInstagram className="h-3 w-3" />}
            label="Instagram"
            value={lead.instagramUrl || ''}
            placeholder="https://instagram.com/handle"
            link={lead.instagramUrl}
            onSave={(v) => handleUpdatePresenceField('instagramUrl', v)}
          />
          <EditablePresenceRow
            icon={<SiLinkedin className="h-3 w-3" />}
            label="LinkedIn"
            value={lead.linkedinUrl || ''}
            placeholder="https://linkedin.com/company/..."
            link={lead.linkedinUrl}
            onSave={(v) => handleUpdatePresenceField('linkedinUrl', v)}
          />
          <EditablePresenceRow
            icon={<SiSalesforce className="h-3 w-3 text-[#00A1E0]" />}
            label="Salesforce"
            value={lead.crmLink || ''}
            placeholder="Paste Salesforce deal link..."
            link={lead.crmLink}
            onSave={(v) => handleUpdatePresenceField('crmLink', v)}
          />
          <CurrentMarketingRow
            activities={lead.marketingActivity || []}
            onSave={saveMarketingActivity}
          />
          <SitemapRow lead={lead} onFetch={handleSitemapFetch} onCrawl={handleCrawlPages} />
        </div>

        <LocalVisibilitySignals lead={lead} />

        {/* Website screenshot preview */}
        {lead.website && (() => {
          const websiteUrl = lead.website.startsWith('http') ? lead.website : `https://${lead.website}`;
          const thumbUrl = `https://image.thum.io/get/width/800/crop/420/url/${websiteUrl}?cb=${screenshotCacheBust}`;
          const fullUrl = `https://image.thum.io/get/width/1400/url/${websiteUrl}?cb=${screenshotCacheBust}`;
          return (
            <>
              <div className="mt-2.5 rounded-md overflow-hidden border" data-testid="card-website-screenshot">
                {/* Header bar */}
                <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/40 border-b">
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1.5">
                    <Image className="h-2.5 w-2.5" /> Website Preview
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-2.5 w-2.5" /> Visit
                    </a>
                    <button
                      onClick={() => {
                        setScreenshotLoaded(false);
                        setScreenshotError(false);
                        setScreenshotCacheBust(Date.now());
                      }}
                      title="Refresh screenshot"
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      data-testid="button-refresh-screenshot"
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                    </button>
                    <button
                      onClick={() => setScreenshotExpanded(e => !e)}
                      title={screenshotExpanded ? 'Collapse' : 'Expand'}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      data-testid="button-toggle-screenshot"
                    >
                      {screenshotExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {/* Collapsible thumbnail — click to open modal */}
                {screenshotExpanded && (
                  !screenshotError ? (
                    <div
                      className="relative bg-muted/10 cursor-zoom-in group"
                      onClick={() => screenshotLoaded && setScreenshotModalOpen(true)}
                      data-testid="button-open-screenshot-modal"
                    >
                      {!screenshotLoaded && (
                        <div className="flex items-center justify-center h-32 bg-muted/20">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      )}
                      <img
                        src={thumbUrl}
                        alt={`Screenshot of ${lead.companyName} website`}
                        className={`w-full object-cover object-top transition-opacity duration-300 ${screenshotLoaded ? 'opacity-100' : 'opacity-0 h-32'}`}
                        style={{ maxHeight: '180px' }}
                        onLoad={() => setScreenshotLoaded(true)}
                        onError={() => { setScreenshotError(true); setScreenshotLoaded(true); }}
                        data-testid="img-website-screenshot"
                      />
                      {screenshotLoaded && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1">
                            <Eye className="h-3 w-3" /> Click to view full page
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-14 flex items-center justify-center bg-muted/20">
                      <p className="text-[10px] text-muted-foreground">Could not load preview — check the URL is correct</p>
                    </div>
                  )
                )}
              </div>

              {/* Full-page modal */}
              <Dialog open={screenshotModalOpen} onOpenChange={setScreenshotModalOpen}>
                <DialogContent className="max-w-4xl w-full p-0">
                  <DialogHeader className="flex flex-row items-center justify-between px-4 pr-12 py-3 border-b bg-muted/40 space-y-0">
                    <DialogTitle className="text-sm font-medium flex items-center gap-2">
                      <Image className="h-3.5 w-3.5" />
                      {lead.companyName} — Website Preview
                    </DialogTitle>
                    <div className="flex items-center gap-3">
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> Visit site
                      </a>
                    </div>
                  </DialogHeader>
                  <div className="overflow-y-auto max-h-[80vh]">
                    <img
                      src={fullUrl}
                      alt={`Full screenshot of ${lead.companyName} website`}
                      className="w-full"
                      data-testid="img-website-screenshot-modal"
                    />
                  </div>
                </DialogContent>
              </Dialog>
            </>
          );
        })()}

        {/* Recommended Website Mockup */}
        <div className="mt-2.5 rounded-md overflow-hidden border border-violet-100 dark:border-violet-900/40" data-testid="card-mock-website">
          {/* Header bar */}
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-violet-50/60 dark:bg-violet-950/20 border-b border-violet-100 dark:border-violet-900/30">
            <span className="text-[10px] text-violet-700 dark:text-violet-400 font-medium uppercase tracking-wide flex items-center gap-1.5">
              <Layout className="h-2.5 w-2.5" /> Recommended Website
            </span>
            <div className="flex items-center gap-2">
              {mockWebsiteHtml && (
                <>
                  <button
                    onClick={() => setMockWebsiteModalOpen(true)}
                    className="text-[10px] text-muted-foreground hover:text-violet-600 flex items-center gap-0.5 transition-colors"
                    data-testid="button-open-mock-fullscreen"
                  >
                    <Maximize2 className="h-2.5 w-2.5" /> Full screen
                  </button>
                  <button
                    onClick={handleGenerateMockWebsite}
                    disabled={generatingMockWebsite}
                    title="Regenerate mockup"
                    className="text-muted-foreground hover:text-violet-600 transition-colors p-0.5"
                    data-testid="button-regenerate-mock-website"
                  >
                    <RefreshCw className={`h-2.5 w-2.5 ${generatingMockWebsite ? 'animate-spin' : ''}`} />
                  </button>
                </>
              )}
              {mockWebsiteHtml && (
                <button
                  onClick={() => setMockWebsiteExpanded(e => !e)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                  data-testid="button-toggle-mock-website"
                >
                  {mockWebsiteExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}
            </div>
          </div>

          {!mockWebsiteHtml ? (
            /* Empty state — prompt to generate */
            <div className="p-4 bg-violet-50/20 dark:bg-violet-950/10">
              <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                Generate a full website mockup showing what <span className="font-medium">{lead.companyName}</span>'s ideal site should look like — built from their strategy, services, and target market. Use it to show the prospect: <em>"Here's what you have. Here's what you need."</em>
              </p>
              <button
                onClick={handleGenerateMockWebsite}
                disabled={generatingMockWebsite}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium py-2 px-3 rounded-md transition-colors disabled:opacity-60"
                data-testid="button-generate-mock-website"
              >
                {generatingMockWebsite ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analysing strategy &amp; building mockup…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Build Ideal Website
                  </>
                )}
              </button>
            </div>
          ) : mockWebsiteExpanded ? (
            <div>
              {/* Scaled iframe preview */}
              <div className="relative bg-white overflow-hidden cursor-zoom-in group" style={{ height: '220px' }} onClick={() => setMockWebsiteModalOpen(true)}>
                {generatingMockWebsite && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-black/60 flex items-center justify-center z-10">
                    <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
                  </div>
                )}
                <iframe
                  srcDoc={sanitizedMockHtml || ''}
                  title="Recommended Website Mockup"
                  className="border-0 pointer-events-none"
                  style={{ width: '200%', height: '200%', transform: 'scale(0.5)', transformOrigin: 'top left' }}
                  data-testid="iframe-mock-website"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-violet-900/20 transition-colors flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-violet-900/80 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1">
                    <Maximize2 className="h-3 w-3" /> View full screen
                  </span>
                </div>
              </div>

              {/* What's missing list */}
              {mockWebsiteGaps.length > 0 && (
                <div className="border-t border-amber-100 dark:border-amber-900/30 p-3 bg-amber-50/40 dark:bg-amber-950/10">
                  <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" /> What their current site is missing
                  </p>
                  <ul className="space-y-1">
                    {mockWebsiteGaps.map((gap, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                        {gap}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Mock website full-screen modal */}
        <Dialog open={mockWebsiteModalOpen} onOpenChange={setMockWebsiteModalOpen}>
          <DialogContent className="max-w-5xl w-full p-0" style={{ maxHeight: '90vh' }}>
            <DialogHeader className="px-4 pr-12 py-3 border-b bg-violet-50/60 dark:bg-violet-950/20 space-y-0 flex flex-row items-center justify-between">
              <DialogTitle className="text-sm font-medium flex items-center gap-2">
                <Layout className="h-3.5 w-3.5 text-violet-600" />
                {lead.companyName} — Recommended Website
              </DialogTitle>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground">AI-generated from strategy data</span>
                <button
                  onClick={handleGenerateMockWebsite}
                  disabled={generatingMockWebsite}
                  className="text-[10px] text-violet-600 hover:text-violet-700 flex items-center gap-1 disabled:opacity-50"
                  data-testid="button-regenerate-mock-modal"
                >
                  <RefreshCw className={`h-3 w-3 ${generatingMockWebsite ? 'animate-spin' : ''}`} />
                  {generatingMockWebsite ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
            </DialogHeader>
            <div className="overflow-y-auto" style={{ height: 'calc(90vh - 56px)' }}>
              <iframe
                srcDoc={sanitizedMockHtml || ''}
                title="Recommended Website Full View"
                className="w-full border-0"
                style={{ height: '100vh', minHeight: '600px' }}
                data-testid="iframe-mock-website-modal"
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <AhrefsSEOSection
        label={lead.companyName || lead.website || 'Prospect'}
        website={lead.website}
        data={lead.ahrefsData}
        onFetch={handleFetchAhrefs}
        onSave={async (updated) => {
          const updates: Partial<Lead> = { ahrefsData: updated, updatedAt: new Date() };
          dispatch(patchLead({ id: lead.id, updates }));
          if (orgId && authReady) await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
        }}
      />

      <div className="rounded-lg border bg-card p-3 space-y-3" data-testid="card-competitor-snapshot">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Competitor Tracking</span>
          {(lead.competitorDomains?.length ?? 0) > 0 && (
            <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
              {lead.competitorDomains!.length} tracked
            </Badge>
          )}
        </div>

        {/* Add competitor input */}
        <div className="flex gap-1.5">
          <Input
            value={newCompetitor}
            onChange={e => setNewCompetitor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompetitor(); } }}
            placeholder="e.g. besa.au or https://competitor.com"
            className="h-7 text-xs flex-1"
            data-testid="input-new-competitor"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={addCompetitor}
            disabled={!newCompetitor.trim()}
            className="h-7 w-7 p-0 shrink-0"
            data-testid="button-add-competitor"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Saved competitor domains */}
        {(lead.competitorDomains?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {lead.competitorDomains!.map(domain => (
              <CompetitorCard
                key={domain}
                domain={domain}
                siteData={lead.competitorData?.[domain]}
                sitemapLoading={!!competitorSitemapLoading[domain]}
                deepCrawling={!!competitorDeepCrawling[domain]}
                onScanSitemap={() => handleCompetitorSitemapScan(domain)}
                onDeepCrawl={() => handleCompetitorDeepCrawl(domain)}
                onRemove={() => removeCompetitor(domain)}
                onGBPLookup={(placeId) => handleCompetitorGBPLookup(domain, placeId)}
                onAhrefsFetch={() => handleCompetitorAhrefsFetch(domain)}
                onAhrefsSave={async (data) => {
                  const existing = lead.competitorData || {};
                  const updated = { ...existing, [domain]: { ...(existing[domain] || {}), ahrefs: data } };
                  const updates: Partial<Lead> = { competitorData: updated, updatedAt: new Date() };
                  dispatch(patchLead({ id: lead.id, updates }));
                  if (orgId && authReady) await updateLeadInFirestore(orgId, lead.id, updates, authReady).catch(console.error);
                }}
              />
            ))}
            {/* AI analysis insights if available */}
            {(lead.aiGrowthPlan?.competitor as any)?.insights?.length > 0 && (
              <div className="rounded border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 px-2.5 py-1.5">
                <div className="flex items-center gap-1 mb-1">
                  <BarChart3 className="h-3 w-3 text-amber-600" />
                  <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">AI Gap Insights</span>
                </div>
                {(lead.aiGrowthPlan.competitor as any).insights.slice(0, 2).map((insight: string, i: number) => (
                  <p key={i} className="text-[11px] text-muted-foreground">{insight}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Add competitor domains above to track and analyse them against this lead.</p>
        )}
      </div>

      <div className={`rounded-lg border p-3 ${URGENCY_COLORS[nextAction.urgency]}`} data-testid="card-next-best-action">
        <div className="flex items-center gap-1.5 mb-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          <span className="text-xs font-medium uppercase tracking-wider opacity-70">Next Best Action</span>
        </div>
        <div className="flex items-center gap-2">
          <nextAction.icon className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium">{nextAction.action}</p>
        </div>
      </div>
    </div>
  );
}

function PresenceRow({ icon, label, value, fallback, link }: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  fallback?: string;
  link?: string;
}) {
  const displayValue = value || fallback || 'Unknown';
  const hasValue = !!value;

  return (
    <div className="flex items-center gap-2 text-sm py-0.5">
      <span className={`shrink-0 ${hasValue ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {icon}
      </span>
      <span className="text-muted-foreground text-xs w-[76px] shrink-0">{label}</span>
      <span className={`truncate text-xs ${hasValue ? 'text-foreground' : 'text-muted-foreground italic'}`}>
        {link && hasValue ? (
          <a href={link.startsWith('http') ? link : `https://${link}`} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">
            {displayValue} <ExternalLink className="h-2.5 w-2.5 inline" />
          </a>
        ) : displayValue}
      </span>
    </div>
  );
}

function EditablePresenceRow({ icon, label, value, placeholder, link, onSave }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder?: string;
  link?: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasValue = !!value;

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="shrink-0 text-amber-600">{icon}</span>
        <span className="text-muted-foreground text-xs w-[76px] shrink-0">{label}</span>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-6 text-xs px-1.5 flex-1 min-w-0"
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); commit(); }}
            className="shrink-0 p-0.5 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancel(); }}
            className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
      onClick={startEditing}
    >
      <span className={`shrink-0 ${hasValue ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {icon}
      </span>
      <span className="text-muted-foreground text-xs w-[76px] shrink-0">{label}</span>
      <span className={`truncate text-xs flex-1 ${hasValue ? 'text-foreground' : 'text-muted-foreground italic'}`}>
        {hasValue ? (
          link ? (
            <a
              href={link.startsWith('http') ? link : `https://${link}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline inline-flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {value} <ExternalLink className="h-2.5 w-2.5 inline" />
            </a>
          ) : value
        ) : (placeholder ? `Add ${label.toLowerCase()}…` : 'Not recorded')}
      </span>
      <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
    </div>
  );
}

interface GBPSearchResult {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number;
  phone: string | null;
  website: string | null;
}

function GBPLookupRow({ lead, onLookup }: { lead: Lead; onLookup: (placeId: string) => Promise<void> }) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GBPSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectLoading, setSelectLoading] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [urlMode, setUrlMode] = useState(false);
  const [pastedMapsUrl, setPastedMapsUrl] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  // Auto-loaded suggestions (shown inline without entering search mode)
  const [suggestions, setSuggestions] = useState<GBPSearchResult[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  const autoSearched = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasGBP = !!lead.sourceData?.googlePlaceId;
  const reviewCount = lead.sourceData?.googleReviewCount;
  const rating = lead.sourceData?.googleRating;
  const gbpMapsUrl = lead.sourceData?.googleMapsUrl;
  const gbpAddress = lead.sourceData?.googleAddress || (hasGBP ? lead.address : undefined);

  // Auto-search on mount when no GBP linked and lead has a company name
  useEffect(() => {
    if (hasGBP || autoSearched.current || !lead.companyName?.trim()) return;
    autoSearched.current = true;
    setSuggestLoading(true);
    // Extract suburb/state from address — fall back to sourceData.googleAddress
    const rawAddress = lead.address || (lead.sourceData as any)?.googleAddress || '';
    const locationHint = rawAddress
      ? rawAddress.split(',').slice(-2).join(',').trim().replace(/\s+\d{4}.*$/, '').trim()
      : '';
    const params = new URLSearchParams({ query: lead.companyName.trim() });
    if (locationHint) params.set('location', locationHint);
    if (lead.website) params.set('website', lead.website);
    if (lead.phone) params.set('phone', lead.phone);
    fetch(`/api/google-places/find?${params}`)
      .then(r => r.json())
      .then(data => { if (data.results?.length) setSuggestions(data.results.slice(0, 3)); })
      .catch(() => {})
      .finally(() => setSuggestLoading(false));
  }, [hasGBP, lead.companyName, lead.address, lead.website, lead.phone]);

  const openSearch = () => {
    setQuery(lead.companyName || '');
    setResults([]);
    setSearchError(null);
    setSearching(true);
    setSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeSearch = () => {
    setSearching(false);
    setResults([]);
    setQuery('');
    setSearchError(null);
    setUrlMode(false);
    setPastedMapsUrl('');
    setUrlError(null);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setResults([]);
    try {
      // Extract location hint from lead address OR google address from sourceData
      const hasLocationInQuery = /\b(qld|nsw|vic|wa|sa|act|nt|tasmania|queensland|new south wales|victoria|australia|\d{4})\b/i.test(query);
      const rawAddress = lead.address || (lead.sourceData as any)?.googleAddress || '';
      const locationHint = !hasLocationInQuery && rawAddress
        ? rawAddress.split(',').slice(-2).join(',').trim().replace(/\s+\d{4}.*$/, '').trim()
        : '';
      const params = new URLSearchParams({ query: query.trim() });
      if (locationHint) params.set('location', locationHint);
      // Pass website and phone as extra fallback hints for the backend
      if (lead.website) params.set('website', lead.website);
      if (lead.phone) params.set('phone', lead.phone);
      const res = await fetch(`/api/google-places/find?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.results || []);
      if ((data.results || []).length === 0) setSearchError('No businesses found — try adding a suburb or postcode to your search.');
    } catch (e: any) {
      setSearchError(e.message || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelect = async (placeId: string) => {
    setSelectLoading(placeId);
    try {
      await onLookup(placeId);
      closeSearch();
      setSuggestions([]);
    } finally {
      setSelectLoading(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') closeSearch();
  };

  const handleUrlLink = async () => {
    if (!pastedMapsUrl.trim()) return;
    setUrlLoading(true);
    setUrlError(null);
    try {
      const params = new URLSearchParams({ url: pastedMapsUrl.trim() });
      if (query.trim()) params.set('name', query.trim());
      const res = await fetch(`/api/google-places/from-url?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resolve link');
      await handleSelect(data.placeId);
    } catch (e: any) {
      setUrlError(e.message || 'Could not link that URL. Try again.');
    } finally {
      setUrlLoading(false);
    }
  };

  if (searching) {
    return (
      <div className="space-y-1.5 py-0.5">
        {!urlMode ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-amber-600"><MapPin className="h-3.5 w-3.5" /></span>
              <Input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Business name + suburb…"
                className="h-6 text-xs px-1.5 flex-1"
                disabled={searchLoading}
              />
              <Button
                size="sm"
                className="h-6 px-2 text-xs shrink-0"
                onClick={handleSearch}
                disabled={searchLoading || !query.trim()}
              >
                {searchLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              </Button>
              <button onClick={closeSearch} className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-muted">
                <X className="h-3 w-3" />
              </button>
            </div>
            {searchError && (
              <p className="text-[10px] text-destructive pl-5">{searchError}</p>
            )}
            {results.length > 0 && (
              <div className="border rounded bg-background shadow-sm overflow-hidden ml-5">
                {results.map(r => (
                  <button
                    key={r.placeId}
                    onClick={() => handleSelect(r.placeId)}
                    disabled={!!selectLoading}
                    className="w-full text-left px-2 py-1.5 hover:bg-muted/60 border-b last:border-b-0 transition-colors disabled:opacity-60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{r.name}</span>
                      {selectLoading === r.placeId
                        ? <Loader2 className="h-3 w-3 animate-spin shrink-0 text-violet-600" />
                        : r.rating != null && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {r.rating}★ · {r.reviewCount}
                          </span>
                        )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{r.address}</p>
                  </button>
                ))}
              </div>
            )}
            <div className="pl-5">
              <button
                onClick={() => { setUrlMode(true); setPastedMapsUrl(''); setUrlError(null); }}
                className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline"
              >
                Can't find it? Paste a Google Maps link instead →
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-amber-600"><MapPin className="h-3.5 w-3.5" /></span>
              <Input
                autoFocus
                value={pastedMapsUrl}
                onChange={e => setPastedMapsUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleUrlLink(); if (e.key === 'Escape') setUrlMode(false); }}
                placeholder="Paste Google Maps link or Place ID…"
                className="h-6 text-xs px-1.5 flex-1"
                disabled={urlLoading}
              />
              <Button
                size="sm"
                className="h-6 px-2 text-xs shrink-0"
                onClick={handleUrlLink}
                disabled={urlLoading || !pastedMapsUrl.trim()}
              >
                {urlLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Link'}
              </Button>
              <button onClick={() => setUrlMode(false)} className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-muted">
                <X className="h-3 w-3" />
              </button>
            </div>
            {urlError && <p className="text-[10px] text-destructive pl-5">{urlError}</p>}
            <p className="text-[10px] text-muted-foreground pl-5">
              Open Google Maps → find the business → copy the URL from your browser and paste it here.
            </p>
            <div className="pl-5">
              <button onClick={() => setUrlMode(false)} className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline">
                ← Back to search
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
        onClick={openSearch}
      >
        <span className={`shrink-0 ${hasGBP ? 'text-green-600 dark:text-green-400' : suggestLoading ? 'text-amber-500' : 'text-muted-foreground'}`}>
          {suggestLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
        </span>
        <span className="text-muted-foreground text-xs w-[76px] shrink-0">Google Business</span>
        <span className={`truncate text-xs flex-1 ${hasGBP ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {hasGBP ? (
            gbpMapsUrl ? (
              <a href={gbpMapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                Profile linked <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : 'Profile linked'
          ) : suggestLoading ? 'Searching…' : suggestions.length > 0 ? 'Select a match below' : 'Search business name…'}
        </span>
        <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
      </div>

      {/* GBP address line */}
      {hasGBP && gbpAddress && (
        <div className="flex items-center gap-2 pl-5 -mt-0.5 pb-0.5">
          <span className="text-muted-foreground text-xs w-[76px] shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate" data-testid="text-gbp-address">
            {gbpAddress}
          </span>
        </div>
      )}

      {/* Auto-loaded suggestions panel */}
      {!hasGBP && !suggestDismissed && suggestions.length > 0 && (
        <div className="ml-5 space-y-0.5">
          <p className="text-[10px] text-muted-foreground mb-1">Is this the right business?</p>
          <div className="border rounded bg-background shadow-sm overflow-hidden">
            {suggestions.map(r => (
              <button
                key={r.placeId}
                onClick={() => handleSelect(r.placeId)}
                disabled={!!selectLoading}
                className="w-full text-left px-2 py-1.5 hover:bg-muted/60 border-b last:border-b-0 transition-colors disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{r.name}</span>
                  {selectLoading === r.placeId
                    ? <Loader2 className="h-3 w-3 animate-spin shrink-0 text-violet-600" />
                    : r.rating != null && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{r.rating}★ · {r.reviewCount}</span>
                    )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{r.address}</p>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <button onClick={openSearch} className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline">
              Not right? Search manually
            </button>
            <button onClick={() => setSuggestDismissed(true)} className="text-[10px] text-muted-foreground hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {hasGBP && (
        <div
          className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
          onClick={openSearch}
        >
          <span className={`shrink-0 ${reviewCount != null ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
            <Star className="h-3.5 w-3.5" />
          </span>
          <span className="text-muted-foreground text-xs w-[76px] shrink-0">Reviews</span>
          <span className={`truncate text-xs flex-1 ${reviewCount != null ? 'text-foreground' : 'text-muted-foreground italic'}`}>
            {reviewCount != null ? `${reviewCount} reviews · ${rating ?? 'N/A'}★` : 'No review data'}
          </span>
          <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
        </div>
      )}
      {!hasGBP && suggestions.length === 0 && !suggestLoading && (
        <div className="flex items-center gap-2 py-0.5">
          <span className="shrink-0 text-muted-foreground"><Star className="h-3.5 w-3.5" /></span>
          <span className="text-muted-foreground text-xs w-[76px] shrink-0">Reviews</span>
          <span className="truncate text-xs text-muted-foreground italic">No review data</span>
        </div>
      )}
    </>
  );
}

function CompetitorCard({
  domain, siteData, sitemapLoading, deepCrawling, onScanSitemap, onDeepCrawl, onRemove, onGBPLookup, onAhrefsFetch, onAhrefsSave,
}: {
  domain: string;
  siteData?: CompetitorSiteData;
  sitemapLoading: boolean;
  deepCrawling: boolean;
  onScanSitemap: () => void;
  onDeepCrawl: () => void;
  onRemove: () => void;
  onGBPLookup: (placeId: string) => Promise<void>;
  onAhrefsFetch: () => Promise<void>;
  onAhrefsSave: (data: AhrefsMetrics) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [screenshotLoaded, setScreenshotLoaded] = useState(false);
  const [screenshotError, setScreenshotError] = useState(false);
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);
  const [sitemapExpanded, setSitemapExpanded] = useState(false);
  const [crawlSectionExpanded, setCrawlSectionExpanded] = useState(false);
  const [crawlPageExpanded, setCrawlPageExpanded] = useState<number | null>(null);
  // GBP state
  const [gbpSearching, setGbpSearching] = useState(false);
  const [gbpQuery, setGbpQuery] = useState('');
  const [gbpResults, setGbpResults] = useState<GBPSearchResult[]>([]);
  const [gbpSearchLoading, setGbpSearchLoading] = useState(false);
  const [gbpSelectLoading, setGbpSelectLoading] = useState<string | null>(null);
  const [gbpSearchError, setGbpSearchError] = useState<string | null>(null);
  const [gbpSuggestions, setGbpSuggestions] = useState<GBPSearchResult[]>([]);
  const [gbpSuggestLoading, setGbpSuggestLoading] = useState(false);
  const [gbpSuggestDismissed, setGbpSuggestDismissed] = useState(false);
  const gbpAutoSearched = useRef(false);
  const gbpInputRef = useRef<HTMLInputElement>(null);

  const websiteUrl = `https://${domain}`;
  const thumbUrl = `https://image.thum.io/get/width/800/crop/420/url/${websiteUrl}`;
  const fullUrl = `https://image.thum.io/get/width/1400/url/${websiteUrl}`;
  const pages = siteData?.sitemapPages || [];
  const crawledPages = siteData?.crawledPages || [];
  const successCrawls = crawledPages.filter(p => !p.error);
  const gbp = siteData?.gbp;

  // Derive a human-readable search query from the domain
  const domainQuery = domain.replace(/\.(com\.au|com|net\.au|net|org\.au|org|au)$/, '').replace(/[.-]/g, ' ');

  // Auto-search GBP on first expand
  useEffect(() => {
    if (!expanded || gbp || gbpAutoSearched.current || !domainQuery.trim()) return;
    gbpAutoSearched.current = true;
    setGbpSuggestLoading(true);
    fetch(`/api/google-places/find?query=${encodeURIComponent(domainQuery.trim())}`)
      .then(r => r.json())
      .then(data => { if (data.results?.length) setGbpSuggestions(data.results.slice(0, 3)); })
      .catch(() => {})
      .finally(() => setGbpSuggestLoading(false));
  }, [expanded, gbp, domainQuery]);

  const openGbpSearch = () => {
    setGbpQuery(domainQuery);
    setGbpResults([]);
    setGbpSearchError(null);
    setGbpSearching(true);
    setGbpSuggestions([]);
    setTimeout(() => gbpInputRef.current?.focus(), 0);
  };

  const closeGbpSearch = () => {
    setGbpSearching(false);
    setGbpResults([]);
    setGbpQuery('');
    setGbpSearchError(null);
  };

  const handleGbpSearch = async () => {
    if (!gbpQuery.trim()) return;
    setGbpSearchLoading(true);
    setGbpSearchError(null);
    setGbpResults([]);
    try {
      const res = await fetch(`/api/google-places/find?query=${encodeURIComponent(gbpQuery.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setGbpResults(data.results || []);
      if (!(data.results || []).length) setGbpSearchError('No results — try adding a suburb or state.');
    } catch (e: any) {
      setGbpSearchError(e.message || 'Search failed');
    } finally {
      setGbpSearchLoading(false);
    }
  };

  const handleGbpSelect = async (placeId: string) => {
    setGbpSelectLoading(placeId);
    try {
      await onGBPLookup(placeId);
      closeGbpSearch();
      setGbpSuggestions([]);
    } finally {
      setGbpSelectLoading(null);
    }
  };

  return (
    <div className="rounded border bg-muted/20 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/40">
        <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium truncate flex-1 hover:underline"
        >
          {domain}
        </a>
        {pages.length > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">{pages.length} pages</span>
        )}
        {crawledPages.length > 0 && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0">· {successCrawls.length} crawled</span>
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          title={expanded ? 'Collapse' : 'Expand analysis'}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 ml-1"
          data-testid={`button-expand-competitor-${domain}`}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <button
          onClick={onRemove}
          title="Remove"
          className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
          data-testid={`button-remove-competitor-${domain}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Expanded analysis body */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-2 space-y-2.5">

          {/* Screenshot thumbnail */}
          <div className="rounded overflow-hidden border">
            <div className="flex items-center justify-between px-2 py-1 bg-muted/30 border-b">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                <Image className="h-2.5 w-2.5" /> Website Preview
              </span>
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                <ExternalLink className="h-2.5 w-2.5" /> Visit
              </a>
            </div>
            {!screenshotError ? (
              <div className="relative bg-muted/10 cursor-zoom-in group"
                onClick={() => screenshotLoaded && setScreenshotModalOpen(true)}>
                {!screenshotLoaded && (
                  <div className="flex items-center justify-center h-24 bg-muted/20">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                <img
                  src={thumbUrl}
                  alt={`Screenshot of ${domain}`}
                  className={`w-full object-cover object-top transition-opacity duration-300 ${screenshotLoaded ? 'opacity-100' : 'opacity-0 h-24'}`}
                  style={{ maxHeight: '140px' }}
                  onLoad={() => setScreenshotLoaded(true)}
                  onError={() => { setScreenshotError(true); setScreenshotLoaded(true); }}
                />
                {screenshotLoaded && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Click to view full page
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-10 flex items-center justify-center bg-muted/20">
                <p className="text-[10px] text-muted-foreground">Preview unavailable</p>
              </div>
            )}
          </div>

          {/* Screenshot modal */}
          <Dialog open={screenshotModalOpen} onOpenChange={setScreenshotModalOpen}>
            <DialogContent className="max-w-4xl w-full p-0">
              <DialogHeader className="flex flex-row items-center justify-between px-4 pr-12 py-3 border-b bg-muted/40 space-y-0">
                <DialogTitle className="text-sm font-medium flex items-center gap-2">
                  <Image className="h-3.5 w-3.5" /> {domain}
                </DialogTitle>
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> Visit site
                </a>
              </DialogHeader>
              <div className="overflow-y-auto max-h-[80vh]">
                <img src={fullUrl} alt={`Full screenshot of ${domain}`} className="w-full" />
              </div>
            </DialogContent>
          </Dialog>

          {/* Sitemap section */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileText className={`h-3 w-3 shrink-0 ${pages.length > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`} />
              <span className={`text-[11px] flex-1 ${pages.length > 0 ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {pages.length > 0
                  ? `${pages.length} pages in sitemap`
                  : 'Sitemap not scanned'}
              </span>
              <button
                onClick={onScanSitemap}
                disabled={sitemapLoading}
                className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50 flex items-center gap-0.5"
                data-testid={`button-scan-sitemap-${domain}`}
              >
                {sitemapLoading ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Scanning…</> : pages.length > 0 ? 'Refresh' : 'Scan now'}
              </button>
            </div>
            {pages.length > 0 && (
              <>
                <button
                  onClick={() => setSitemapExpanded(e => !e)}
                  className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 ml-4"
                >
                  {sitemapExpanded ? 'Hide pages' : `View ${pages.length} pages`}
                  {siteData?.sitemapFetchedAt && (
                    <span className="text-muted-foreground">· {format(new Date(siteData.sitemapFetchedAt), 'dd/MM/yy')}</span>
                  )}
                </button>
                {sitemapExpanded && (
                  <div className="ml-4 bg-muted/40 rounded border p-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                    {pages.slice(0, 30).map((p, i) => (
                      <div key={i} className="text-[10px] text-foreground/70 truncate">
                        {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </div>
                    ))}
                    {pages.length > 30 && <p className="text-[9px] text-muted-foreground">+{pages.length - 30} more</p>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Deep crawl section */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ScanLine className={`h-3 w-3 shrink-0 ${crawledPages.length > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`} />
              <span className={`text-[11px] flex-1 ${crawledPages.length > 0 ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                {crawledPages.length > 0
                  ? `${successCrawls.length} pages analysed · SEO signals extracted`
                  : pages.length > 0 ? 'Deep crawl not yet run' : 'Scan sitemap first'}
              </span>
              {pages.length > 0 && (
                <button
                  onClick={onDeepCrawl}
                  disabled={deepCrawling || sitemapLoading}
                  className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50 flex items-center gap-0.5"
                  data-testid={`button-deep-crawl-${domain}`}
                >
                  {deepCrawling ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Crawling…</> : crawledPages.length > 0 ? 'Re-crawl' : 'Crawl pages'}
                </button>
              )}
            </div>
            {crawledPages.length > 0 && (
              <>
                <button
                  onClick={() => setCrawlSectionExpanded(e => !e)}
                  className="w-full flex items-center justify-between text-[9px] text-muted-foreground hover:text-foreground transition-colors ml-4"
                  style={{ width: 'calc(100% - 1rem)' }}
                >
                  <span>{siteData?.crawledAt ? `Analysed ${format(new Date(siteData.crawledAt), 'dd/MM/yy HH:mm')}` : 'Analysed'}</span>
                  <span className="flex items-center gap-0.5">
                    {crawlSectionExpanded ? <><ChevronUp className="h-2.5 w-2.5" /> Hide</> : <><ChevronDown className="h-2.5 w-2.5" /> Show pages</>}
                  </span>
                </button>
                {crawlSectionExpanded && (
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {crawledPages.map((cp, idx) => {
                      const path = (() => { try { return new URL(cp.url).pathname || '/'; } catch { return cp.url; } })();
                      const isOpen = crawlPageExpanded === idx;
                      return (
                        <div key={idx} className="rounded border bg-muted/30 overflow-hidden">
                          <button
                            onClick={() => setCrawlPageExpanded(isOpen ? null : idx)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/60 transition-colors"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cp.error ? 'bg-red-400' : 'bg-emerald-400'}`} />
                            <span className="text-[10px] text-foreground/80 truncate flex-1">{path}</span>
                            {isOpen ? <ChevronUp className="h-2.5 w-2.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
                          </button>
                          {isOpen && (
                            <div className="px-2 pb-2 space-y-1.5 text-[10px]">
                              {cp.error ? <p className="text-red-500">{cp.error}</p> : (
                                <>
                                  {cp.title && <div><p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Title</p><p className="text-foreground/90">{cp.title}</p></div>}
                                  {cp.metaDescription && <div><p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Meta</p><p className="text-foreground/70">{cp.metaDescription}</p></div>}
                                  {cp.h1 && <div><p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H1</p><p className="text-foreground/90 font-medium">{cp.h1}</p></div>}
                                  {cp.h2s && cp.h2s.length > 0 && (
                                    <div>
                                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H2 Headings</p>
                                      <ul className="space-y-0.5">{cp.h2s.map((h, i) => <li key={i} className="text-foreground/70">· {h}</li>)}</ul>
                                    </div>
                                  )}
                                  {cp.bodyText && <div><p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Body Snippet</p><p className="text-foreground/60 line-clamp-3">{cp.bodyText}</p></div>}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* GBP section */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              <MapPin className="h-2.5 w-2.5" /> Google Business Profile
            </div>

            {gbp ? (
              /* Linked GBP — show data */
              <div className="rounded border bg-muted/30 px-2.5 py-2 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{gbp.name}</p>
                    {gbp.address && <p className="text-[10px] text-muted-foreground truncate">{gbp.address}</p>}
                    {gbp.primaryType && <p className="text-[10px] text-muted-foreground/70 truncate">{gbp.primaryType}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {gbp.rating != null && (
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />{gbp.rating}
                      </span>
                    )}
                    {gbp.reviewCount != null && gbp.reviewCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">{gbp.reviewCount} reviews</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={gbp.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-0.5"
                  >
                    <ExternalLink className="h-2.5 w-2.5" /> View on Maps
                  </a>
                  <button
                    onClick={openGbpSearch}
                    className="text-[10px] text-muted-foreground hover:text-foreground hover:underline flex items-center gap-0.5"
                  >
                    <Pencil className="h-2.5 w-2.5" /> Change
                  </button>
                </div>
              </div>
            ) : gbpSearching ? (
              /* Search mode */
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Input
                    ref={gbpInputRef}
                    value={gbpQuery}
                    onChange={e => setGbpQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleGbpSearch(); if (e.key === 'Escape') closeGbpSearch(); }}
                    placeholder="Business name + suburb…"
                    className="h-6 text-xs px-1.5 flex-1"
                    disabled={gbpSearchLoading}
                  />
                  <Button
                    size="sm"
                    className="h-6 px-2 text-xs shrink-0"
                    onClick={handleGbpSearch}
                    disabled={gbpSearchLoading || !gbpQuery.trim()}
                  >
                    {gbpSearchLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  </Button>
                  <button onClick={closeGbpSearch} className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-muted">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {gbpSearchError && <p className="text-[10px] text-destructive">{gbpSearchError}</p>}
                {gbpResults.length > 0 && (
                  <div className="border rounded bg-background shadow-sm overflow-hidden">
                    {gbpResults.map(r => (
                      <button
                        key={r.placeId}
                        onClick={() => handleGbpSelect(r.placeId)}
                        disabled={!!gbpSelectLoading}
                        className="w-full text-left px-2 py-1.5 hover:bg-muted/60 border-b last:border-b-0 transition-colors disabled:opacity-60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate">{r.name}</span>
                          {gbpSelectLoading === r.placeId
                            ? <Loader2 className="h-3 w-3 animate-spin shrink-0 text-violet-600" />
                            : r.rating != null && (
                              <span className="text-[10px] text-muted-foreground shrink-0">{r.rating}★ · {r.reviewCount}</span>
                            )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{r.address}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Not linked yet — show auto-suggest or prompt */
              <div className="space-y-1">
                <div
                  className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
                  onClick={openGbpSearch}
                >
                  <span className={gbpSuggestLoading ? 'text-amber-500' : 'text-muted-foreground'}>
                    {gbpSuggestLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                  </span>
                  <span className="text-[11px] text-muted-foreground italic flex-1">
                    {gbpSuggestLoading ? 'Searching GBP…' : gbpSuggestions.length > 0 ? 'Select a match below' : 'Search Google Business…'}
                  </span>
                  <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                </div>
                {!gbpSuggestDismissed && gbpSuggestions.length > 0 && (
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-muted-foreground">Is this the right business?</p>
                    <div className="border rounded bg-background shadow-sm overflow-hidden">
                      {gbpSuggestions.map(r => (
                        <button
                          key={r.placeId}
                          onClick={() => handleGbpSelect(r.placeId)}
                          disabled={!!gbpSelectLoading}
                          className="w-full text-left px-2 py-1.5 hover:bg-muted/60 border-b last:border-b-0 transition-colors disabled:opacity-60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium truncate">{r.name}</span>
                            {gbpSelectLoading === r.placeId
                              ? <Loader2 className="h-3 w-3 animate-spin shrink-0 text-violet-600" />
                              : r.rating != null && (
                                <span className="text-[10px] text-muted-foreground shrink-0">{r.rating}★ · {r.reviewCount}</span>
                              )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{r.address}</p>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-0.5">
                      <button onClick={openGbpSearch} className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline">
                        Not right? Search manually
                      </button>
                      <button onClick={() => setGbpSuggestDismissed(true)} className="text-[10px] text-muted-foreground hover:underline">
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ahrefs section */}
          <AhrefsSEOSection
            label={domain}
            website={`https://${domain}`}
            data={siteData?.ahrefs}
            onFetch={onAhrefsFetch}
            onSave={onAhrefsSave}
            compact
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------
   Parse an Ahrefs Excel/CSV export and map to AhrefsMetrics
   Supports:
     - Organic Keywords export (keyword-level rows)
     - Overview snapshot (single-row domain metrics)
   ------------------------------------------------------- */
async function parseAhrefsFile(file: File): Promise<AhrefsMetrics> {
  /* Dynamic import avoids Vite ESM/CJS interop issues with xlsx */
  const xlsx = await import('xlsx');
  const xlsxRead = xlsx.read ?? (xlsx as any).default?.read;
  const xlsxUtils = xlsx.utils ?? (xlsx as any).default?.utils;
  if (!xlsxRead || !xlsxUtils) throw new Error('Excel library failed to load — try a CSV export instead.');

  /* Read the raw bytes first so we can detect encoding */
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isCSV = file.name.toLowerCase().endsWith('.csv');

  /* Detect BOM and decode text for CSV files */
  let wb: any;
  if (isCSV) {
    let text: string;
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      /* UTF-16 LE (most common Ahrefs export encoding) */
      text = new TextDecoder('UTF-16LE').decode(buffer.slice(2));
    } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      /* UTF-16 BE */
      text = new TextDecoder('UTF-16BE').decode(buffer.slice(2));
    } else if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      /* UTF-8 BOM */
      text = new TextDecoder('UTF-8').decode(buffer.slice(3));
    } else {
      /* Plain UTF-8 */
      text = new TextDecoder('UTF-8').decode(buffer);
    }
    /* Strip any remaining BOM characters just in case */
    text = text.replace(/^\uFEFF/, '');
    wb = xlsxRead(text, { type: 'string' });
  } else {
    /* Excel binary format */
    wb = xlsxRead(bytes, { type: 'array' });
  }

  /* Parse rows from the workbook */
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, any>[] = xlsxUtils.sheet_to_json(ws, { defval: null });

  if (!rows.length) throw new Error('No data found in file');

  /* Normalise headers to lowercase for flexible matching */
  const norm = (s: string) => String(s ?? '').toLowerCase().trim();

  const firstRow = rows[0];
  const headers = Object.keys(firstRow).map(norm);
  const hasKeyword = headers.some(h => h.includes('keyword') && !h.includes('parent'));
  const hasPosition = headers.some(h => h.includes('position') || (h.includes('rank') && !h.includes('domain')));

  /* Helper: find value from a row by fuzzy key match */
  const pick = (row: Record<string, any>, ...terms: string[]): any => {
    for (const key of Object.keys(row)) {
      const k = norm(key);
      if (terms.some(t => k.includes(t))) return row[key];
    }
    return null;
  };
  const num = (v: any) => { const n = Number(v); return isNaN(n) ? null : n; };

  const metrics: AhrefsMetrics = { fetchedAt: new Date() };

  if (hasKeyword && hasPosition) {
    /* ---------- Organic Keywords export (has current rankings) ---------- */
    const keywords: AhrefsKeyword[] = rows.map(row => ({
      keyword: String(pick(row, 'keyword') ?? '').trim(),
      position: num(pick(row, 'current position', 'position', 'rank')),
      volume: num(pick(row, 'search volume', 'volume', 'avg. monthly searches', 'avg monthly searches')),
      traffic: num(pick(row, 'traffic')),
      difficulty: num(pick(row, 'kd', 'keyword difficulty', 'difficulty')),
      cpc: num(pick(row, 'cpc')),
      url: String(pick(row, 'url') ?? '').trim() || undefined,
    })).filter(k => k.keyword);

    keywords.sort((a, b) => ((b.traffic ?? 0) - (a.traffic ?? 0)) || ((a.position ?? 999) - (b.position ?? 999)));
    metrics.topKeywords = keywords.slice(0, 100);
    metrics.organicKeywords = keywords.length;
    metrics.organicTraffic = keywords.reduce((s, k) => s + (k.traffic ?? 0), 0);

  } else if (hasKeyword) {
    /* ---------- Keyword List / Keyword Planner export (research data — no position) ----------
       Handles: Ahrefs "List Overview", Ahrefs "Keyword Explorer", Google Keyword Planner exports.
       These have volume/KD/CPC columns but no "current position" column. */
    const keywords: AhrefsKeyword[] = rows.map(row => ({
      keyword: String(pick(row, 'keyword') ?? '').trim(),
      volume: num(pick(row, 'search volume', 'volume', 'avg. monthly searches', 'avg monthly searches', 'monthly searches')),
      difficulty: num(pick(row, 'kd', 'keyword difficulty', 'difficulty')),
      cpc: num(pick(row, 'cpc', 'top of page bid')),
      traffic: num(pick(row, 'traffic potential', 'tp', 'traffic')),
    })).filter(k => k.keyword && (k.volume !== null || k.traffic !== null));

    if (!keywords.length) throw new Error('Could not find recognisable Ahrefs columns. Try an Organic Keywords or Overview export.');

    keywords.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    metrics.topKeywords = keywords.slice(0, 100);
    metrics.organicKeywords = keywords.length;
    // Use traffic potential if available, otherwise sum volumes as a proxy
    const hasTrafficPotential = keywords.some(k => k.traffic !== null);
    metrics.organicTraffic = keywords.reduce((s, k) => s + (hasTrafficPotential ? (k.traffic ?? 0) : (k.volume ?? 0)), 0);
  }

  /* ---------- Overview / domain-level metric columns ---------- */
  const dr = num(pick(firstRow, 'domain rating', 'dr'));
  if (dr !== null) metrics.domainRating = dr;
  const ar = num(pick(firstRow, 'ahrefs rank'));
  if (ar !== null) metrics.ahrefsRank = ar;
  const bl = num(pick(firstRow, 'backlinks', 'total backlinks'));
  if (bl !== null) metrics.backlinks = bl;
  const rd = num(pick(firstRow, 'referring domains', 'ref domains', 'refdomains'));
  if (rd !== null) metrics.refdomains = rd;
  const ok = num(pick(firstRow, 'organic keywords'));
  if (ok !== null) metrics.organicKeywords = ok;
  const ot = num(pick(firstRow, 'organic traffic'));
  if (ot !== null) metrics.organicTraffic = ot;

  if (!metrics.topKeywords?.length && !metrics.domainRating && !metrics.backlinks) {
    throw new Error('Could not find recognisable Ahrefs columns. Try an Organic Keywords, Keyword List, or Domain Overview export.');
  }

  return metrics;
}

function AhrefsSEOSection({
  label, website, data, onFetch, onSave, compact = false,
}: {
  label: string;
  website?: string;
  data?: AhrefsMetrics;
  onFetch: () => Promise<void>;
  onSave?: (updated: AhrefsMetrics) => Promise<void>;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywordsExpanded, setKeywordsExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      await onFetch();
      toast({ title: 'Ahrefs data loaded', description: `SEO metrics updated for ${label}` });
    } catch (e: any) {
      const msg = e.message || 'Ahrefs fetch failed';
      setError(msg);
      toast({ title: 'Ahrefs error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    /* Reset input so same file can be re-uploaded if needed */
    e.target.value = '';
    setUploading(true);
    setError(null);
    try {
      const parsed = await parseAhrefsFile(file);
      /* Merge with any existing data so we don't lose previously stored fields */
      const merged: AhrefsMetrics = { ...data, ...parsed };
      if (onSave) await onSave(merged);
      const kwCount = parsed.topKeywords?.length ?? 0;
      toast({
        title: 'Ahrefs data imported',
        description: `${kwCount ? `${kwCount} keywords` : 'Domain metrics'} loaded for ${label}`,
      });
    } catch (e: any) {
      const msg = e.message || 'Upload failed';
      setError(msg);
      toast({ title: 'Import error', description: msg, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const fmt = (n?: number | null) => n == null ? '—' : n.toLocaleString();

  if (compact) {
    /* Compact variant for inside CompetitorCard */
    return (
      <div className="space-y-1.5">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <BarChart3 className="h-2.5 w-2.5" /> Ahrefs SEO
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !onSave}
              className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50 flex items-center gap-0.5"
              data-testid={`button-ahrefs-upload-${label}`}
            >
              {uploading ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Importing…</> : 'Upload Excel'}
            </button>
          </div>
        </div>
        {error && <p className="text-[10px] text-destructive">{error}</p>}
        {data ? (
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-1">
              {[
                { label: 'DR', value: data.domainRating ?? '—', color: 'text-blue-600 dark:text-blue-400' },
                { label: 'Backlinks', value: fmt(data.backlinks) },
                { label: 'Ref Domains', value: fmt(data.refdomains) },
                { label: 'Organic KWs', value: fmt(data.organicKeywords) },
                { label: 'Org Traffic', value: fmt(data.organicTraffic) },
                { label: 'Paid Traffic', value: fmt(data.paidTraffic) },
              ].map(m => (
                <div key={m.label} className="flex items-center justify-between rounded bg-muted/30 px-1.5 py-0.5">
                  <span className="text-[9px] text-muted-foreground">{m.label}</span>
                  <span className={`text-[10px] font-semibold ${(m as any).color || 'text-foreground'}`}>{m.value}</span>
                </div>
              ))}
            </div>
            {(data.topKeywords?.length ?? 0) > 0 && (
              <>
                <button onClick={() => setKeywordsExpanded(e => !e)} className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
                  {keywordsExpanded ? 'Hide keywords' : `View top ${data.topKeywords!.length} keywords`}
                  {data.fetchedAt && <span className="text-muted-foreground ml-1">· {format(new Date(data.fetchedAt), 'dd/MM/yy')}</span>}
                </button>
                {keywordsExpanded && (
                  <div className="rounded border overflow-hidden">
                    <div className="grid grid-cols-4 gap-0 bg-muted/50 px-1.5 py-0.5">
                      {['Keyword', 'Vol', 'Traffic', 'Pos'].map(h => (
                        <span key={h} className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
                      ))}
                    </div>
                    <div className="max-h-32 overflow-y-auto divide-y">
                      {data.topKeywords!.map((kw, i) => (
                        <div key={i} className="grid grid-cols-4 gap-0 px-1.5 py-0.5 hover:bg-muted/30 transition-colors">
                          <span className="text-[9px] text-foreground/90 truncate col-span-1">{kw.keyword}</span>
                          <span className="text-[9px] text-muted-foreground">{kw.volume != null ? kw.volume.toLocaleString() : '—'}</span>
                          <span className="text-[9px] text-muted-foreground">{kw.traffic != null ? kw.traffic.toLocaleString() : '—'}</span>
                          <span className={`text-[9px] font-medium ${(kw.position ?? 99) <= 3 ? 'text-green-600' : (kw.position ?? 99) <= 10 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            #{kw.position ?? '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">
            {website ? 'No Ahrefs data yet — click Fetch data above.' : 'No website set for this competitor.'}
          </p>
        )}
      </div>
    );
  }

  /* Full card variant for the prospect */
  return (
    <div className="rounded-lg border bg-card p-3" data-testid="card-ahrefs-seo">
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
      <div className="flex items-center gap-1.5 mb-2">
        <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ahrefs SEO</span>
        {data?.fetchedAt && (
          <span className="text-[10px] text-muted-foreground ml-1">· {format(new Date(data.fetchedAt), 'dd/MM/yy')}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !onSave}
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50 flex items-center gap-1"
            data-testid="button-ahrefs-upload-prospect"
          >
            {uploading ? <><Loader2 className="h-3 w-3 animate-spin" /> Importing…</> : 'Upload Excel'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-destructive mb-2">{error}</p>}

      {!data && (
        <p className="text-xs text-muted-foreground italic">Upload an Ahrefs export (Excel or CSV) to import SEO data.</p>
      )}

      {data ? (
        <div className="space-y-2">
          {/* Metrics grid */}
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Domain Rating', value: data.domainRating ?? '—', badge: true },
              { label: 'Ahrefs Rank', value: data.ahrefsRank != null ? `#${data.ahrefsRank.toLocaleString()}` : '—' },
              { label: 'Backlinks', value: fmt(data.backlinks) },
              { label: 'Ref. Domains', value: fmt(data.refdomains) },
              { label: 'Organic Keywords', value: fmt(data.organicKeywords) },
              { label: 'Organic Traffic', value: fmt(data.organicTraffic) },
            ].map(m => (
              <div key={m.label} className="rounded-md border bg-muted/20 px-2 py-1.5 text-center">
                <p className={`text-sm font-bold ${m.badge ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}`}>{m.value}</p>
                <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Top keywords */}
          {(data.topKeywords?.length ?? 0) > 0 && (
            <div>
              <button
                onClick={() => setKeywordsExpanded(e => !e)}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mb-1"
              >
                {keywordsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {keywordsExpanded ? 'Hide' : `Top ${data.topKeywords!.length} keywords by traffic`}
              </button>
              {keywordsExpanded && (
                <div className="rounded border overflow-hidden text-[10px]">
                  <div className="grid grid-cols-5 bg-muted/50 px-2 py-1 gap-1">
                    {['Keyword', 'Vol', 'Traffic', 'Pos', 'KD'].map(h => (
                      <span key={h} className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</span>
                    ))}
                  </div>
                  <div className="divide-y max-h-48 overflow-y-auto">
                    {data.topKeywords!.map((kw, i) => (
                      <div key={i} className="grid grid-cols-5 gap-1 px-2 py-1 hover:bg-muted/30 transition-colors">
                        <span className="text-foreground/90 truncate">{kw.keyword}</span>
                        <span className="text-muted-foreground">{kw.volume != null ? kw.volume.toLocaleString() : '—'}</span>
                        <span className="text-muted-foreground">{kw.traffic != null ? kw.traffic.toLocaleString() : '—'}</span>
                        <span className={`font-medium ${(kw.position ?? 99) <= 3 ? 'text-green-600' : (kw.position ?? 99) <= 10 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                          #{kw.position ?? '—'}
                        </span>
                        <span className={`${(kw.difficulty ?? 0) >= 70 ? 'text-red-500' : (kw.difficulty ?? 0) >= 40 ? 'text-amber-500' : 'text-green-600'}`}>
                          {kw.difficulty ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : website ? (
        <p className="text-xs text-muted-foreground italic">Click "Fetch SEO data" to pull Ahrefs metrics for {label}.</p>
      ) : null}
    </div>
  );
}

const MARKETING_CHANNEL_PRESETS = [
  'Google Ads', 'Facebook Ads', 'Instagram Ads', 'SEO / Organic', 'Email Marketing',
  'Print / Flyers', 'Radio', 'TV', 'Letterbox Drop', 'Trade Shows', 'Referral Program', 'Other',
];

function CurrentMarketingRow({
  activities,
  onSave,
}: {
  activities: MarketingActivity[];
  onSave: (updated: MarketingActivity[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newChannel, setNewChannel] = useState('');
  const [newSpend, setNewSpend] = useState('');
  const [newPeriod, setNewPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [newNotes, setNewNotes] = useState('');

  const totalMonthly = activities.reduce((sum, a) => {
    if (!a.spend) return sum;
    if (a.period === 'week') return sum + a.spend * 4.33;
    if (a.period === 'year') return sum + a.spend / 12;
    return sum + a.spend;
  }, 0);

  const handleAdd = () => {
    if (!newChannel.trim()) return;
    const entry: MarketingActivity = {
      id: Date.now().toString(),
      channel: newChannel.trim(),
      spend: newSpend ? parseFloat(newSpend) : undefined,
      period: newSpend ? newPeriod : undefined,
      notes: newNotes.trim() || undefined,
    };
    onSave([...activities, entry]);
    setNewChannel('');
    setNewSpend('');
    setNewNotes('');
    setAdding(false);
  };

  const handleRemove = (id: string) => {
    onSave(activities.filter(a => a.id !== id));
  };

  const formatSpend = (a: MarketingActivity) => {
    if (!a.spend) return null;
    return `$${a.spend.toLocaleString()}/${a.period === 'week' ? 'wk' : a.period === 'year' ? 'yr' : 'mo'}`;
  };

  return (
    <div className="space-y-0.5">
      {/* Summary row */}
      <div
        className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`shrink-0 ${activities.length > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-muted-foreground'}`}>
          <TrendingUp className="h-3.5 w-3.5" />
        </span>
        <span className="text-muted-foreground text-xs w-[76px] shrink-0">Ad Spend</span>
        <span className={`truncate text-xs flex-1 ${activities.length > 0 ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {activities.length > 0
            ? totalMonthly > 0
              ? `${activities.length} channel${activities.length > 1 ? 's' : ''} · ~$${Math.round(totalMonthly).toLocaleString()}/mo`
              : `${activities.length} channel${activities.length > 1 ? 's' : ''} tracked`
            : 'Add marketing channels…'}
        </span>
        {open
          ? <ChevronUp className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
        }
      </div>

      {/* Expanded panel */}
      {open && (
        <div className="ml-5 space-y-1.5 pt-1">
          {/* Existing entries */}
          {activities.map(a => (
            <div key={a.id} className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1">
              <span className="text-[11px] flex-1 font-medium truncate">{a.channel}</span>
              {formatSpend(a) && (
                <span className="text-[10px] text-orange-600 dark:text-orange-400 shrink-0 font-semibold">{formatSpend(a)}</span>
              )}
              {a.notes && (
                <span className="text-[10px] text-muted-foreground italic truncate max-w-[80px]">{a.notes}</span>
              )}
              <button
                onClick={() => handleRemove(a.id)}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                data-testid={`button-remove-marketing-${a.id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* Add new */}
          {adding ? (
            <div className="space-y-1.5 rounded border p-2 bg-muted/20">
              {/* Channel quick-select */}
              <div className="flex flex-wrap gap-1">
                {MARKETING_CHANNEL_PRESETS.map(ch => (
                  <button
                    key={ch}
                    onClick={() => setNewChannel(ch)}
                    className={`text-[10px] rounded px-1.5 py-0.5 border transition-colors ${newChannel === ch ? 'bg-orange-100 dark:bg-orange-900/40 border-orange-400 text-orange-700 dark:text-orange-300' : 'bg-muted/40 border-transparent hover:border-muted-foreground/30'}`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
              {/* Custom channel name */}
              <Input
                value={newChannel}
                onChange={e => setNewChannel(e.target.value)}
                placeholder="Or type channel name…"
                className="h-6 text-xs px-1.5"
              />
              {/* Spend row */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground shrink-0">Spend</span>
                <div className="relative flex-1">
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                  <Input
                    value={newSpend}
                    onChange={e => setNewSpend(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="e.g. 2500"
                    className="h-6 text-xs pl-4 pr-1.5"
                    type="number"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">per</span>
                <select
                  value={newPeriod}
                  onChange={e => setNewPeriod(e.target.value as any)}
                  className="h-6 text-[10px] rounded border bg-background px-1 text-foreground"
                >
                  <option value="week">week</option>
                  <option value="month">month</option>
                  <option value="year">year</option>
                </select>
              </div>
              {/* Notes */}
              <Input
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="Notes (optional)…"
                className="h-6 text-xs px-1.5"
              />
              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-6 px-2.5 text-xs"
                  onClick={handleAdd}
                  disabled={!newChannel.trim()}
                  data-testid="button-add-marketing-confirm"
                >
                  Add
                </Button>
                <button
                  onClick={() => { setAdding(false); setNewChannel(''); setNewSpend(''); setNewNotes(''); }}
                  className="text-[10px] text-muted-foreground hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400 hover:underline"
              data-testid="button-add-marketing-channel"
            >
              <Plus className="h-3 w-3" /> Add channel
            </button>
          )}

          {/* Total summary */}
          {activities.length > 0 && totalMonthly > 0 && (
            <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t pt-1">
              <span>{activities.length} channel{activities.length > 1 ? 's' : ''}</span>
              <span className="font-semibold text-orange-600 dark:text-orange-400">~${Math.round(totalMonthly).toLocaleString()}/mo total</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LocalVisibilitySignals({ lead }: { lead: Lead }) {
  const [open, setOpen] = useState(true);
  const sd = lead.sourceData;
  if (!sd?.googlePlaceId) return null;

  const normPhone = (s?: string | null) => (s || '').replace(/\D/g, '');
  const normDomain = (url?: string | null) => {
    if (!url) return '';
    try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); }
    catch { return (url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
  };
  const normText = (s?: string | null) => (s || '').toLowerCase();
  const textIncludes = (haystack?: string | null, needle?: string | null) => {
    if (!haystack || !needle || needle.length < 3) return false;
    return normText(haystack).includes(normText(needle));
  };
  const extractPostcode = (addr?: string | null) => (addr || '').match(/\b\d{4}\b/)?.[0] || '';
  const extractFirstSuburbWord = (addr?: string | null) => {
    const parts = (addr || '').split(',');
    const suburbPart = parts.length >= 2 ? parts[1] : parts[0];
    return (suburbPart || '').trim().split(/\s+/).find(w => w.length > 3 && !/^\d/.test(w))?.toLowerCase() || '';
  };

  // GBP alignment
  const gbpDomain = normDomain(sd.googleWebsite);
  const leadDomain = normDomain(lead.website);
  const websiteMatch = gbpDomain && leadDomain ? gbpDomain === leadDomain : null;

  const gbpPhoneDigits = normPhone(sd.googlePhone);
  const leadPhoneDigits = normPhone(lead.phone);
  const phoneMatch = gbpPhoneDigits && leadPhoneDigits ? gbpPhoneDigits === leadPhoneDigits : null;

  const gbpPostcode = extractPostcode(sd.googleAddress);
  const leadPostcode = extractPostcode(lead.address);
  const gbpSuburbWord = extractFirstSuburbWord(sd.googleAddress);
  const leadSuburbWord = extractFirstSuburbWord(lead.address);
  const addressMatch = sd.googleAddress && lead.address
    ? (gbpPostcode && leadPostcode && gbpPostcode === leadPostcode) || (gbpSuburbWord && leadSuburbWord && gbpSuburbWord === leadSuburbWord)
    : null;

  const gbpCat = (sd.category || '').toLowerCase();
  const leadInd = (lead.industry || '').toLowerCase();
  const categoryMatch = gbpCat && leadInd
    ? gbpCat.includes(leadInd.split(/\s+/)[0]) || leadInd.includes(gbpCat.split(/\s+/)[0])
    : null;

  // NAP on website (crawled pages)
  const crawledPages = lead.crawledPages || [];
  const hasCrawl = crawledPages.length > 0;
  const allText = crawledPages.map(p => [p.bodyText, p.title, p.metaDescription, p.h1].filter(Boolean).join(' ')).join(' ');

  const phoneOnSite = hasCrawl && gbpPhoneDigits.length >= 8
    ? normPhone(allText).includes(gbpPhoneDigits.slice(-8))
    : null;
  const nameWords = (lead.companyName || '').split(/\s+/).filter(w => w.length > 3);
  const nameOnSite = hasCrawl && nameWords.length > 0
    ? textIncludes(allText, nameWords[0])
    : null;
  const suburbOnSite = hasCrawl && gbpSuburbWord.length > 2
    ? textIncludes(allText, gbpSuburbWord)
    : null;

  type Signal = { label: string; status: 'ok' | 'warn' | 'error' | 'na'; detail?: string };
  const sig = (label: string, match: boolean | null, okDetail?: string, failDetail?: string, warnNotNull = false): Signal => {
    if (match === null) return { label, status: 'na', detail: 'No data' };
    if (match) return { label, status: 'ok', detail: okDetail };
    return { label, status: warnNotNull ? 'warn' : 'error', detail: failDetail };
  };

  const gbpSignals: Signal[] = [
    sig('Website URL', websiteMatch, '', gbpDomain ? `GBP: ${gbpDomain}` : 'GBP has no website', true),
    sig('Phone', phoneMatch, lead.phone || '', sd.googlePhone ? `GBP: ${sd.googlePhone}` : 'Not on GBP'),
    sig('Address', addressMatch, '', sd.googleAddress ? `GBP: ${sd.googleAddress.split(',').slice(0, 2).join(',')}` : undefined, true),
    sig('Category', categoryMatch, sd.category || '', sd.category ? `GBP: ${sd.category}` : undefined, true),
  ];

  const napSignals: Signal[] = hasCrawl ? [
    sig('Phone on site', phoneOnSite, '', 'Not detected on website'),
    sig('Business name', nameOnSite, '', 'Not found in page content', true),
    sig('Local suburb', suburbOnSite, gbpSuburbWord, 'Not mentioned on website', true),
  ] : [];

  const allSigs = [...gbpSignals, ...napSignals];
  const okCount = allSigs.filter(s => s.status === 'ok').length;
  const applicable = allSigs.filter(s => s.status !== 'na').length;
  const scoreColor = applicable === 0 ? 'text-muted-foreground' : okCount === applicable ? 'text-green-600' : okCount >= applicable * 0.6 ? 'text-amber-600' : 'text-red-600';

  const StatusIcon = ({ s }: { s: Signal['status'] }) => {
    if (s === 'ok') return <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-px" />;
    if (s === 'warn') return <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-px" />;
    if (s === 'error') return <X className="h-3 w-3 text-red-500 shrink-0 mt-px" />;
    return <div className="h-3 w-3 rounded-full border border-muted-foreground/30 shrink-0 mt-px" />;
  };

  return (
    <div className="mt-2.5 rounded-md border bg-muted/20 overflow-hidden" data-testid="local-visibility-signals">
      <button
        className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(o => !o)}
        data-testid="button-toggle-local-visibility"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MapPin className="h-3 w-3 text-green-600" /> Local Visibility Signals
        </span>
        <span className="flex items-center gap-2">
          {applicable > 0 && <span className={`text-[11px] font-semibold ${scoreColor}`}>{okCount}/{applicable} OK</span>}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 space-y-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 pt-1">GBP Alignment</p>
            <div className="space-y-1.5">
              {gbpSignals.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px]">
                  <StatusIcon s={s.status} />
                  <span className="text-foreground/80 font-medium w-20 shrink-0">{s.label}</span>
                  {s.detail ? <span className="text-muted-foreground truncate">{s.detail}</span> : null}
                </div>
              ))}
            </div>
          </div>
          {hasCrawl ? (
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">NAP on Website</p>
              <div className="space-y-1.5">
                {napSignals.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px]">
                    <StatusIcon s={s.status} />
                    <span className="text-foreground/80 font-medium w-20 shrink-0">{s.label}</span>
                    {s.detail ? <span className="text-muted-foreground truncate">{s.detail}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground italic">Crawl the website to check NAP consistency on-page</p>
          )}
        </div>
      )}
    </div>
  );
}

function SitemapRow({ lead, onFetch, onCrawl }: { lead: Lead; onFetch: (url: string) => Promise<void>; onCrawl: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [crawlExpanded, setCrawlExpanded] = useState<number | null>(null);
  const [crawlSectionExpanded, setCrawlSectionExpanded] = useState(false);

  const hasSitemap = (lead.sitemapPages?.length ?? 0) > 0;
  const pages = lead.sitemapPages || [];
  const fetchedAt = lead.sitemapFetchedAt;
  const crawledPages = lead.crawledPages || [];
  const crawledAt = lead.crawledAt;
  const hasCrawl = crawledPages.length > 0;

  const derivedSitemapUrl = (() => {
    const w = lead.website?.trim();
    if (!w) return null;
    try {
      const base = new URL(w.startsWith('http') ? w : `https://${w}`);
      return `${base.origin}/sitemap.xml`;
    } catch { return null; }
  })();

  const handleFetch = async () => {
    if (!derivedSitemapUrl) return;
    setLoading(true);
    try { await onFetch(derivedSitemapUrl); } finally { setLoading(false); }
  };

  const handleCrawl = async () => {
    setCrawling(true);
    try { await onCrawl(); } finally { setCrawling(false); }
  };

  const sections = pages.reduce<Record<string, SitemapPage[]>>((acc, p) => {
    try {
      const parts = new URL(p.url).pathname.split('/').filter(Boolean);
      const section = parts.length > 0 ? `/${parts[0]}` : '/';
      if (!acc[section]) acc[section] = [];
      acc[section].push(p);
    } catch { /* skip */ }
    return acc;
  }, {});

  const successCrawls = crawledPages.filter(p => !p.error);

  return (
    <div className="space-y-1">
      {/* Sitemap row */}
      <div className="flex items-center gap-2 py-0.5">
        <span className={`shrink-0 ${hasSitemap ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
          <FileText className="h-3.5 w-3.5" />
        </span>
        <span className="text-muted-foreground text-xs w-[76px] shrink-0">Sitemap</span>
        <span className={`truncate text-xs flex-1 ${hasSitemap ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {hasSitemap ? `${pages.length} pages captured` : derivedSitemapUrl ? 'Not yet scanned' : 'Add a website first'}
        </span>
        {derivedSitemapUrl && (
          <button
            onClick={handleFetch}
            disabled={loading || crawling}
            className="shrink-0 flex items-center gap-0.5 text-[10px] text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Scanning…</>
              : hasSitemap ? 'Refresh' : 'Scan now'}
          </button>
        )}
      </div>

      {hasSitemap && (
        <div className="ml-[calc(1rem+0.5rem+76px+0.5rem)] space-y-1">
          {/* Pages list toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
          >
            {expanded ? 'Hide pages' : `View ${pages.length} pages`}
            {fetchedAt && <span className="text-muted-foreground">· {format(new Date(fetchedAt), 'dd/MM/yy')}</span>}
          </button>

          {expanded && (
            <div className="bg-muted/40 rounded border p-2 space-y-2 max-h-40 overflow-y-auto">
              {Object.entries(sections).slice(0, 20).map(([section, sectionPages]) => (
                <div key={section}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                    {section} <span className="font-normal normal-case">({sectionPages.length})</span>
                  </p>
                  {sectionPages.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center gap-1 py-0.5">
                      <span className="text-[10px] text-foreground/70 truncate flex-1">
                        {p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                      </span>
                      {p.lastmod && (
                        <span className="text-[9px] text-muted-foreground shrink-0">{p.lastmod.slice(0, 10)}</span>
                      )}
                    </div>
                  ))}
                  {sectionPages.length > 5 && (
                    <p className="text-[9px] text-muted-foreground">+{sectionPages.length - 5} more</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Deep Crawl row */}
          <div className="flex items-center gap-2 pt-0.5">
            <ScanLine className={`h-3 w-3 shrink-0 ${hasCrawl ? 'text-emerald-500' : 'text-muted-foreground'}`} />
            <span className={`text-[10px] flex-1 ${hasCrawl ? 'text-foreground' : 'text-muted-foreground italic'}`}>
              {hasCrawl
                ? `${successCrawls.length} pages analysed · SEO signals extracted`
                : 'Deep crawl not yet run'}
            </span>
            <button
              onClick={handleCrawl}
              disabled={crawling || loading}
              data-testid="button-crawl-pages"
              className="shrink-0 flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
            >
              {crawling
                ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Crawling…</>
                : hasCrawl ? 'Re-crawl' : 'Crawl pages'}
            </button>
          </div>

          {/* Crawled pages results */}
          {hasCrawl && (
            <div className="space-y-1 mt-1">
              <button
                onClick={() => setCrawlSectionExpanded(e => !e)}
                className="w-full flex items-center justify-between text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-toggle-crawl-pages"
              >
                <span>{crawledAt ? `Analysed ${format(new Date(crawledAt), 'dd/MM/yy HH:mm')}` : 'Pages analysed'}</span>
                <span className="flex items-center gap-0.5 text-[9px]">
                  {crawlSectionExpanded ? <><ChevronUp className="h-2.5 w-2.5" /> Hide</> : <><ChevronDown className="h-2.5 w-2.5" /> Show pages</>}
                </span>
              </button>
              {crawlSectionExpanded && (<div className="space-y-1 max-h-80 overflow-y-auto">
                {crawledPages.map((cp, idx) => {
                  const path = (() => { try { return new URL(cp.url).pathname || '/'; } catch { return cp.url; } })();
                  const isOpen = crawlExpanded === idx;
                  return (
                    <div key={idx} className="rounded border bg-muted/30 overflow-hidden">
                      <button
                        onClick={() => setCrawlExpanded(isOpen ? null : idx)}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-muted/60 transition-colors"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cp.error ? 'bg-red-400' : 'bg-emerald-400'}`} />
                        <span className="text-[10px] text-foreground/80 truncate flex-1">{path}</span>
                        {isOpen ? <ChevronUp className="h-2.5 w-2.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-2 pb-2 space-y-1.5 text-[10px]">
                          {cp.error ? (
                            <p className="text-red-500">{cp.error}</p>
                          ) : (
                            <>
                              {cp.title && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Title</p>
                                  <p className="text-foreground/90">{cp.title}</p>
                                </div>
                              )}
                              {cp.metaDescription && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Meta Description</p>
                                  <p className="text-foreground/70">{cp.metaDescription}</p>
                                </div>
                              )}
                              {cp.h1 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H1</p>
                                  <p className="text-foreground/90 font-medium">{cp.h1}</p>
                                </div>
                              )}
                              {cp.h2s && cp.h2s.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H2 Headings</p>
                                  <ul className="space-y-0.5">
                                    {cp.h2s.map((h, i) => <li key={i} className="text-foreground/70">· {h}</li>)}
                                  </ul>
                                </div>
                              )}
                              {cp.h3s && cp.h3s.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">H3 Headings</p>
                                  <ul className="space-y-0.5">
                                    {cp.h3s.map((h, i) => <li key={i} className="text-foreground/70">· {h}</li>)}
                                  </ul>
                                </div>
                              )}
                              {cp.bodyText && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Body Text Snippet</p>
                                  <p className="text-foreground/60 line-clamp-3">{cp.bodyText}</p>
                                </div>
                              )}
                              {cp.imageAlts && cp.imageAlts.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-0.5"><Image className="h-2.5 w-2.5" /> Image Alt Tags</p>
                                  <ul className="space-y-0.5">
                                    {cp.imageAlts.slice(0, 5).map((a, i) => <li key={i} className="text-foreground/70">· {a}</li>)}
                                  </ul>
                                </div>
                              )}
                              {cp.schemaTypes && cp.schemaTypes.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-0.5"><Tag className="h-2.5 w-2.5" /> Schema Types</p>
                                  <div className="flex flex-wrap gap-1">
                                    {cp.schemaTypes.map((s, i) => (
                                      <span key={i} className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded px-1 py-0.5 text-[9px]">{s}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {cp.internalLinks && cp.internalLinks.length > 0 && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-0.5"><Link2 className="h-2.5 w-2.5" /> Internal Links ({cp.internalLinks.length})</p>
                                  <ul className="space-y-0.5">
                                    {cp.internalLinks.slice(0, 6).map((l, i) => <li key={i} className="text-foreground/60 truncate">· {l}</li>)}
                                    {cp.internalLinks.length > 6 && <li className="text-muted-foreground">+{cp.internalLinks.length - 6} more</li>}
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
