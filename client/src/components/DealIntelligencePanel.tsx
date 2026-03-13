import { useMemo, useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, updateLead, patchLead } from '@/store';
import {
  Lead,
  Activity,
  SitemapPage,
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
  Loader2,
  Search,
} from 'lucide-react';
import { SiFacebook, SiInstagram, SiLinkedin } from 'react-icons/si';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
  const dispatch = useDispatch();
  const { orgId, authReady } = useAuth();
  const { toast } = useToast();
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
        category: data.primaryType || lead.sourceData?.category,
      };
      const leadUpdates: Partial<Lead> = {
        sourceData,
        address: lead.address || data.address || undefined,
        phone: lead.phone || data.phone || undefined,
        website: lead.website || data.website || undefined,
        updatedAt: new Date(),
      };
      dispatch(patchLead({ id: lead.id, updates: leadUpdates }));
      await updateLeadInFirestore(orgId, lead.id, leadUpdates, authReady);
      toast({
        title: 'GBP Data Loaded',
        description: `${data.reviewCount || 0} reviews · ${data.rating || 'No'} rating · ${data.primaryType || 'Business'}`,
      });
    } catch (err: any) {
      toast({ title: 'Lookup Failed', description: err.message || 'Could not fetch Google Business data', variant: 'destructive' });
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

      <div className="rounded-lg border bg-card p-3" data-testid="card-online-presence">
        <div className="flex items-center gap-1.5 mb-2">
          <Globe className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Online Presence</span>
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
          <SitemapRow lead={lead} onFetch={handleSitemapFetch} />
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

function GBPLookupRow({ lead, onLookup }: { lead: Lead; onLookup: (placeId: string) => Promise<void> }) {
  const [entering, setEntering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const hasGBP = !!lead.sourceData?.googlePlaceId;
  const reviewCount = lead.sourceData?.googleReviewCount;
  const rating = lead.sourceData?.googleRating;
  const mapsUrl = lead.sourceData?.googleMapsUrl;

  const startEntering = () => {
    setDraft(lead.sourceData?.googlePlaceId || '');
    setEntering(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleLookup = async () => {
    if (!draft.trim()) return;
    setLoading(true);
    try {
      await onLookup(draft.trim());
      setEntering(false);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLookup();
    if (e.key === 'Escape') { setEntering(false); setDraft(''); }
  };

  if (entering) {
    return (
      <div className="space-y-1.5 py-0.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-amber-600"><MapPin className="h-3.5 w-3.5" /></span>
          <span className="text-muted-foreground text-xs w-[76px] shrink-0">Google Place ID</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste Place ID from Google Maps…"
            className="h-6 text-xs px-1.5 flex-1"
            disabled={loading}
          />
          <Button
            size="sm"
            className="h-6 px-2 text-xs shrink-0"
            onClick={handleLookup}
            disabled={loading || !draft.trim()}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          </Button>
          <button
            onClick={() => { setEntering(false); setDraft(''); }}
            className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground pl-[calc(3.5rem+0.5rem)]">
          Find the Place ID at <a href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder" target="_blank" rel="noopener noreferrer" className="underline">Google's Place ID Finder</a> or from the URL in Google Maps.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
        onClick={startEntering}
      >
        <span className={`shrink-0 ${hasGBP ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
          <MapPin className="h-3.5 w-3.5" />
        </span>
        <span className="text-muted-foreground text-xs w-[76px] shrink-0">Google Business</span>
        <span className={`truncate text-xs flex-1 ${hasGBP ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {hasGBP ? (
            mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                Profile linked <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : 'Profile linked'
          ) : 'Add Place ID…'}
        </span>
        <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
      </div>
      {hasGBP && (
        <div
          className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
          onClick={startEntering}
        >
          <span className={`shrink-0 ${reviewCount != null ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
            <Star className="h-3.5 w-3.5" />
          </span>
          <span className="text-muted-foreground text-xs w-[76px] shrink-0">Reviews</span>
          <span className={`truncate text-xs flex-1 ${reviewCount != null ? 'text-foreground' : 'text-muted-foreground italic'}`}>
            {reviewCount != null
              ? `${reviewCount} reviews · ${rating ?? 'N/A'}★`
              : 'No review data'}
          </span>
          <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
        </div>
      )}
      {!hasGBP && (
        <div className="flex items-center gap-2 py-0.5">
          <span className="shrink-0 text-muted-foreground"><Star className="h-3.5 w-3.5" /></span>
          <span className="text-muted-foreground text-xs w-[76px] shrink-0">Reviews</span>
          <span className="truncate text-xs text-muted-foreground italic">No review data</span>
        </div>
      )}
    </>
  );
}

function SitemapRow({ lead, onFetch }: { lead: Lead; onFetch: (url: string) => Promise<void> }) {
  const [entering, setEntering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasSitemap = !!lead.sitemapUrl;
  const pages = lead.sitemapPages || [];
  const fetchedAt = lead.sitemapFetchedAt;

  const startEntering = () => {
    setDraft(lead.sitemapUrl || '');
    setEntering(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleFetch = async () => {
    if (!draft.trim()) return;
    setLoading(true);
    try {
      await onFetch(draft.trim());
      setEntering(false);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFetch();
    if (e.key === 'Escape') { setEntering(false); setDraft(''); }
  };

  // Group pages by top-level section
  const sections = pages.reduce<Record<string, SitemapPage[]>>((acc, p) => {
    try {
      const parts = new URL(p.url).pathname.split('/').filter(Boolean);
      const section = parts.length > 0 ? `/${parts[0]}` : '/';
      if (!acc[section]) acc[section] = [];
      acc[section].push(p);
    } catch { /* skip */ }
    return acc;
  }, {});

  if (entering) {
    return (
      <div className="space-y-1.5 py-0.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-amber-600"><FileText className="h-3.5 w-3.5" /></span>
          <span className="text-muted-foreground text-xs w-[76px] shrink-0">Sitemap URL</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com.au/sitemap.xml"
            className="h-6 text-xs px-1.5 flex-1"
            disabled={loading}
          />
          <Button
            size="sm"
            className="h-6 px-2 text-xs shrink-0"
            onClick={handleFetch}
            disabled={loading || !draft.trim()}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          </Button>
          <button
            onClick={() => { setEntering(false); setDraft(''); }}
            className="shrink-0 p-0.5 rounded text-muted-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground pl-[calc(3.5rem+0.5rem)]">
          Paste the sitemap URL (e.g. /sitemap.xml, /sitemap_index.xml) to capture all indexed pages.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div
        className="flex items-center gap-2 py-0.5 group cursor-pointer rounded hover:bg-muted/40 -mx-1 px-1 transition-colors"
        onClick={startEntering}
      >
        <span className={`shrink-0 ${hasSitemap ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
          <FileText className="h-3.5 w-3.5" />
        </span>
        <span className="text-muted-foreground text-xs w-[76px] shrink-0">Sitemap</span>
        <span className={`truncate text-xs flex-1 ${hasSitemap ? 'text-foreground' : 'text-muted-foreground italic'}`}>
          {hasSitemap
            ? `${pages.length} pages captured`
            : 'Add sitemap URL…'}
        </span>
        <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
      </div>
      {hasSitemap && pages.length > 0 && (
        <div className="ml-[calc(1rem+0.5rem+76px+0.5rem)] space-y-1">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-0.5"
          >
            {expanded ? 'Hide pages' : `View ${pages.length} pages`}
            {fetchedAt && <span className="text-muted-foreground ml-1">· fetched {format(new Date(fetchedAt), 'dd/MM/yy')}</span>}
          </button>
          {expanded && (
            <div className="bg-muted/40 rounded border p-2 space-y-2 max-h-48 overflow-y-auto">
              {Object.entries(sections).slice(0, 20).map(([section, sectionPages]) => (
                <div key={section}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                    {section} <span className="font-normal normal-case">({sectionPages.length})</span>
                  </p>
                  {sectionPages.slice(0, 5).map((p, i) => (
                    <div key={i} className="flex items-center gap-1 py-0.5">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline truncate flex-1"
                      >
                        {p.url.replace(/^https?:\/\/[^/]+/, '')}
                      </a>
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
        </div>
      )}
    </div>
  );
}
