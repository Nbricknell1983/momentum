import { useMemo, useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, updateLead } from '@/store';
import {
  Lead,
  Activity,
  STAGE_LABELS,
} from '@/lib/types';
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
} from 'lucide-react';
import { SiFacebook, SiInstagram, SiLinkedin } from 'react-icons/si';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { format, differenceInDays, isPast, isToday } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { updateLeadInFirestore } from '@/lib/firestoreService';

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
  const parts: string[] = [];

  if (lead.companyName) {
    let intro = `${lead.companyName}`;
    if (lead.territory || lead.areaName) {
      intro += ` is located in ${lead.territory || lead.areaName}`;
    }
    if (lead.sourceData?.googleTypes?.[0]) {
      intro += ` and operates in ${lead.sourceData.googleTypes[0]}`;
    }
    parts.push(intro + '.');
  }

  const leadActivities = activities.filter(a => a.leadId === lead.id);
  if (leadActivities.length > 0) {
    const lastActivity = leadActivities.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    const daysAgo = differenceInDays(new Date(), new Date(lastActivity.createdAt));
    if (daysAgo === 0) {
      parts.push(`Last activity was today (${lastActivity.type}).`);
    } else if (daysAgo === 1) {
      parts.push(`Last activity was yesterday (${lastActivity.type}).`);
    } else {
      parts.push(`Last activity was ${daysAgo} days ago (${lastActivity.type}).`);
    }
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

export default function DealIntelligencePanel({ lead }: DealIntelligencePanelProps) {
  const activities = useSelector((state: RootState) => state.app.activities);

  const health = useMemo(() => computeDealHealth(lead, activities), [lead, activities]);
  const summary = useMemo(() => generateDealSummary(lead, activities), [lead, activities]);
  const nextAction = useMemo(() => getNextBestAction(lead, activities), [lead, activities]);

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

      <div className="rounded-lg border bg-card p-3" data-testid="card-online-presence">
        <div className="flex items-center gap-1.5 mb-2">
          <Globe className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Online Presence</span>
        </div>
        <div className="space-y-1.5">
          {lead.industry && (
            <PresenceRow
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Industry"
              value={lead.industry}
            />
          )}
          <PresenceRow
            icon={<Globe className="h-3.5 w-3.5" />}
            label="Website"
            value={lead.website || null}
            link={lead.website}
          />
          <PresenceRow
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Google Business"
            value={lead.sourceData?.googlePlaceId ? 'Profile detected' : null}
            fallback="Not yet analysed"
          />
          <PresenceRow
            icon={<Star className="h-3.5 w-3.5" />}
            label="Reviews"
            value={lead.sourceData?.googleReviewCount != null
              ? `${lead.sourceData.googleReviewCount} reviews (${lead.sourceData.googleRating || 'N/A'} rating)`
              : null}
            fallback="No review data"
          />
          <PresenceRow
            icon={<SiFacebook className="h-3 w-3" />}
            label="Facebook"
            value={lead.facebookUrl ? 'Profile linked' : null}
            link={lead.facebookUrl}
            fallback="Not recorded"
          />
          <PresenceRow
            icon={<SiInstagram className="h-3 w-3" />}
            label="Instagram"
            value={lead.instagramUrl ? 'Profile linked' : null}
            link={lead.instagramUrl}
            fallback="Not recorded"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3" data-testid="card-competitor-snapshot">
        <div className="flex items-center gap-1.5 mb-2">
          <Users className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Competitor Snapshot</span>
        </div>
        {lead.aiGrowthPlan?.competitor ? (
          <div className="space-y-1">
            {(lead.aiGrowthPlan.competitor as any)?.competitors?.slice(0, 3).map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{c.servicePages || 0} service pages</span>
              </div>
            ))}
            {(lead.aiGrowthPlan.competitor as any)?.insights?.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1 italic">
                {(lead.aiGrowthPlan.competitor as any).insights[0]}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Competitor insights will appear here once growth analysis has been generated.</p>
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
    <div className="flex items-center gap-2 text-sm">
      <span className={`shrink-0 ${hasValue ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {icon}
      </span>
      <span className="text-muted-foreground text-xs w-20 shrink-0">{label}</span>
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
