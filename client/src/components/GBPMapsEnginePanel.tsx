import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  CheckCircle2, RefreshCw, X, Star,
  Phone, Globe, Navigation, Calendar, TrendingUp, AlertTriangle,
  Lightbulb, ChevronDown, BarChart3, Loader2,
  ExternalLink, Shield, Activity,
} from 'lucide-react';
import { Client } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { useDispatch } from 'react-redux';
import { updateClient } from '@/store/index';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ── Types ────────────────────────────────────────────────────────────────────

interface Insights {
  phoneCalls: number;
  websiteClicks: number;
  directionRequests: number;
  bookingClicks: number;
  searchImpressions: number;
  mapsImpressions: number;
  totalInteractions: number;
  periodDays: number;
}

interface Review {
  name: string;
  reviewer: { displayName: string; profilePhotoUrl?: string };
  starRating: string;
  comment?: string;
  createTime: string;
  reviewReply?: { comment: string; updateTime: string };
}

interface ReviewsData {
  reviews: Review[];
  averageRating: string;
  totalReviewCount: number;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function starToNum(s: string): number {
  const map: Record<string, number> = {
    ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  };
  return map[s] || 0;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

interface ScoreFactor {
  name: string;
  score: number;
  max: number;
  detail: string;
  hint: string;
}

interface GBPSnapshot {
  category: string | null;
  description: string | null;
  services: string[];
  serviceAreaRegions: string[];
}

interface ScoreBreakdown {
  total: number;
  prominence: number; prominenceMax: number; prominenceFactors: ScoreFactor[];
  relevance: number; relevanceMax: number; relevanceFactors: ScoreFactor[];
  distance: number; distanceMax: number; distanceFactors: ScoreFactor[];
  weakFactors: string[];
  actions: string[];
}

function calcScore(
  client: Client,
  reviews: Review[],
  insights: Insights | null,
  snapshot: GBPSnapshot | null,
): ScoreBreakdown {
  const playbook = client.gbpPlaybook;

  // Live GBP snapshot takes priority over local playbook cache
  const categoryPrimary = snapshot?.category ?? playbook?.categoryPrimary ?? null;
  const description = snapshot?.description ?? playbook?.description ?? '';
  const services = snapshot?.services ?? playbook?.services ?? [];
  const serviceAreaSuburbs = snapshot?.serviceAreaRegions ?? playbook?.serviceAreaSuburbs ?? [];

  // ── Prominence (50) ───────────────────────────────────────────────────────
  const recentReviews = reviews.filter(r => daysSince(r.createTime) <= 30).length;
  const totalReviews = reviews.length;
  const repliedCount = reviews.filter(r => r.reviewReply).length;
  const responseRate = totalReviews > 0 ? (repliedCount / totalReviews) * 100 : 0;
  const totalInteractions = insights?.totalInteractions ?? 0;
  const suburbCount = serviceAreaSuburbs.length;

  let reviewVelocityScore = 0;
  if (recentReviews >= 10) reviewVelocityScore = 15;
  else if (recentReviews >= 3) reviewVelocityScore = 10;
  else if (recentReviews >= 1) reviewVelocityScore = 5;

  let responseRateScore = 0;
  if (responseRate >= 75) responseRateScore = 12;
  else if (responseRate >= 25) responseRateScore = 8;
  else if (responseRate >= 1) responseRateScore = 4;

  let engagementScore = 0;
  if (totalInteractions >= 200) engagementScore = 15;
  else if (totalInteractions >= 50) engagementScore = 10;
  else if (totalInteractions >= 1) engagementScore = 5;

  let geoAuthorityScore = 0;
  if (suburbCount >= 30) geoAuthorityScore = 8;
  else if (suburbCount >= 10) geoAuthorityScore = 5;
  else if (suburbCount >= 1) geoAuthorityScore = 2;

  const prominence = reviewVelocityScore + responseRateScore + engagementScore + geoAuthorityScore;

  const prominenceFactors: ScoreFactor[] = [
    {
      name: 'Review Velocity',
      score: reviewVelocityScore, max: 15,
      detail: `${recentReviews} new review${recentReviews !== 1 ? 's' : ''} in the last 30 days`,
      hint: recentReviews >= 10 ? 'Excellent — keep the momentum going' : recentReviews >= 3 ? 'Good — aim for 10+ per month' : 'Low — send review requests after every job',
    },
    {
      name: 'Response Rate',
      score: responseRateScore, max: 12,
      detail: `${Math.round(responseRate)}% of reviews replied to (${repliedCount}/${totalReviews})`,
      hint: responseRate >= 75 ? 'Strong — maintaining a high response rate' : responseRate >= 25 ? 'Moderate — reply to all unanswered reviews' : 'Low — Google rewards businesses that respond to every review',
    },
    {
      name: 'Engagement Signals',
      score: engagementScore, max: 15,
      detail: `${totalInteractions.toLocaleString()} total interactions last 30 days (calls + directions + clicks)`,
      hint: totalInteractions >= 200 ? 'Strong engagement — business is highly visible' : totalInteractions >= 50 ? 'Moderate — run a Google post campaign to increase interactions' : 'Low — create Posts and enable messaging to drive more engagement',
    },
    {
      name: 'Geo Authority',
      score: geoAuthorityScore, max: 8,
      detail: `${suburbCount} service area suburb${suburbCount !== 1 ? 's' : ''} defined`,
      hint: suburbCount >= 30 ? 'Excellent geo authority' : suburbCount >= 10 ? 'Good — add more suburbs to expand reach' : 'Low — upload geo-tagged photos from job sites and add service areas',
    },
  ];

  // ── Relevance (25) ────────────────────────────────────────────────────────
  const hasPrimaryCategory = !!categoryPrimary;
  const descLen = description.length;
  const serviceCount = services.length;

  const categoryScore = hasPrimaryCategory ? 8 : 0;
  let descScore = 0;
  if (descLen >= 500) descScore = 9;
  else if (descLen >= 250) descScore = 7;
  else if (descLen >= 1) descScore = 4;

  let servicesScore = 0;
  if (serviceCount >= 15) servicesScore = 8;
  else if (serviceCount >= 5) servicesScore = 5;
  else if (serviceCount >= 1) servicesScore = 3;

  const relevance = categoryScore + descScore + servicesScore;

  const relevanceFactors: ScoreFactor[] = [
    {
      name: 'Primary Category',
      score: categoryScore, max: 8,
      detail: hasPrimaryCategory ? `Set to: ${categoryPrimary}` : 'No primary category set',
      hint: hasPrimaryCategory ? 'Good — category is configured' : 'Go to 3-Pack Playbook → Category & Services and set your primary GBP category',
    },
    {
      name: 'Description Quality',
      score: descScore, max: 9,
      detail: descLen > 0 ? `${descLen} characters written (target: 500+)` : 'No description written yet',
      hint: descLen >= 500 ? 'Excellent length — description is fully optimised' : descLen >= 250 ? `Add ${500 - descLen} more characters — include primary keywords and service areas` : 'Go to 3-Pack Playbook → GBP Description and write a keyword-rich 500+ character description',
    },
    {
      name: 'Services Listed',
      score: servicesScore, max: 8,
      detail: serviceCount > 0 ? `${serviceCount} service${serviceCount !== 1 ? 's' : ''} listed on GBP` : 'No services added yet',
      hint: serviceCount >= 15 ? 'Strong — comprehensive service list' : serviceCount >= 5 ? `Add more services — aim for 15+ with keyword-rich descriptions` : 'Go to 3-Pack Playbook → Services and add at least 5 services with descriptions',
    },
  ];

  // ── Distance (25) ─────────────────────────────────────────────────────────
  let distanceScore = 0;
  if (suburbCount >= 30) distanceScore = 25;
  else if (suburbCount >= 15) distanceScore = 18;
  else if (suburbCount >= 5) distanceScore = 10;
  else if (suburbCount >= 1) distanceScore = 5;

  const distanceFactors: ScoreFactor[] = [
    {
      name: 'Suburb Coverage',
      score: distanceScore, max: 25,
      detail: suburbCount > 0 ? `${suburbCount} suburb${suburbCount !== 1 ? 's' : ''} in service area (target: 30+)` : 'No service area suburbs defined',
      hint: suburbCount >= 30 ? 'Excellent coverage — covering a wide service territory' : suburbCount >= 15 ? `Add ${30 - suburbCount} more suburbs to maximise distance score` : suburbCount >= 5 ? 'Add more service area suburbs — and create geo-content pages for each' : 'Go to 3-Pack Playbook → Service Area and add every suburb you serve',
    },
  ];

  const total = prominence + relevance + distanceScore;

  // ── Weak factors ─────────────────────────────────────────────────────────
  const weakFactors: string[] = [];
  const actions: string[] = [];

  if (reviewVelocityScore < 10) {
    weakFactors.push('Prominence: Review Velocity');
    actions.push('Increase review request frequency to build momentum');
  }
  if (responseRateScore < 8) {
    weakFactors.push('Prominence: Review Response');
    actions.push('Reply to all unanswered reviews — response rate lifts ranking signals');
  }
  if (engagementScore < 10) {
    weakFactors.push('Prominence: Engagement Signals');
    actions.push('Run a Google post campaign to lift phone calls and direction requests');
  }
  if (geoAuthorityScore < 5) {
    weakFactors.push('Prominence: Geo Authority');
    actions.push('Upload geo-tagged photos from job sites across your service areas');
  }
  if (!hasPrimaryCategory) {
    weakFactors.push('Relevance: Primary Category');
    actions.push('Set a primary GBP category that matches your core service offering');
  }
  if (descLen < 500) {
    weakFactors.push('Relevance: Description Quality');
    actions.push('Expand your GBP description to 500+ characters with primary keywords');
  }
  if (serviceCount < 5) {
    weakFactors.push('Relevance: Services Listed');
    actions.push('Add at least 5 services to your GBP with keyword-rich descriptions');
  }
  if (suburbCount < 15) {
    weakFactors.push('Distance: Suburb Coverage');
    actions.push('Create geo content targeting specific suburbs you serve');
    actions.push('Ask customers to mention their suburb or area in reviews');
  }

  return {
    total,
    prominence, prominenceMax: 50, prominenceFactors,
    relevance, relevanceMax: 25, relevanceFactors,
    distance: distanceScore, distanceMax: 25, distanceFactors,
    weakFactors: weakFactors.slice(0, 6),
    actions: actions.slice(0, 5),
  };
}

function statusLabel(score: number): { label: string; color: string } {
  if (score >= 76) return { label: 'Dominant', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' };
  if (score >= 51) return { label: 'Growing', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' };
  if (score >= 31) return { label: 'Building', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' };
  return { label: 'Struggling', color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' };
}

function barColor(pct: number): string {
  if (pct >= 67) return 'bg-emerald-500';
  if (pct >= 34) return 'bg-amber-400';
  return 'bg-red-500';
}

// ── Score circle ─────────────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 76 ? '#10b981' : score >= 51 ? '#f59e0b' : score >= 31 ? '#3b82f6' : '#ef4444';
  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/20" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <span className="text-lg font-bold z-10 text-foreground">{score}</span>
    </div>
  );
}

// ── ScoreBar ──────────────────────────────────────────────────────────────────

function FactorRow({ factor }: { factor: ScoreFactor }) {
  const pct = factor.max > 0 ? Math.round((factor.score / factor.max) * 100) : 0;
  const color = barColor(pct);
  const scoreColor = pct >= 67 ? 'text-emerald-600' : pct >= 34 ? 'text-amber-600' : 'text-red-500';
  return (
    <div className="space-y-1 p-2.5 rounded-lg bg-muted/20 border">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium flex-1">{factor.name}</span>
        <span className={`text-[11px] font-bold ${scoreColor}`}>{factor.score}/{factor.max} pts</span>
      </div>
      <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground">{factor.detail}</p>
      <p className={`text-[10px] font-medium ${pct >= 67 ? 'text-emerald-600' : pct >= 34 ? 'text-amber-600' : 'text-red-500'}`}>
        {factor.hint}
      </p>
    </div>
  );
}

function ScoreBar({ label, weight, value, max, factors }: { label: string; weight: string; value: number; max: number; factors: ScoreFactor[] }) {
  const [expanded, setExpanded] = useState(false);
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const color = barColor(pct);

  return (
    <div>
      <button
        className="w-full flex items-center gap-3 py-1.5"
        onClick={() => setExpanded(v => !v)}
        data-testid={`score-bar-${label.toLowerCase()}`}
      >
        <span className="text-sm text-foreground w-28 text-left shrink-0">{label} <span className="text-muted-foreground text-xs">({weight})</span></span>
        <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-sm font-bold w-8 text-right shrink-0 ${pct >= 67 ? 'text-emerald-600' : pct >= 34 ? 'text-amber-600' : 'text-red-500'}`}>{pct}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="ml-0 mb-2 space-y-1.5">
          {factors.map(f => <FactorRow key={f.name} factor={f} />)}
        </div>
      )}
    </div>
  );
}

// ── Review Velocity ───────────────────────────────────────────────────────────

function ReviewVelocityCard({ reviews, avgRating, totalCount }: { reviews: Review[]; avgRating: string; totalCount: number }) {
  const last30 = reviews.filter(r => daysSince(r.createTime) <= 30).length;
  const replied = reviews.filter(r => r.reviewReply).length;
  const responseRate = totalCount > 0 ? Math.round((replied / totalCount) * 100) : 0;

  const starCounts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => { const s = starToNum(r.starRating); if (s >= 1 && s <= 5) starCounts[s]++; });

  const ratingNum = parseFloat(avgRating || '0');

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Star className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-semibold">Review Velocity</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total Reviews', value: totalCount.toString(), color: 'text-foreground' },
          { label: 'Avg Rating', value: ratingNum > 0 ? `★ ${ratingNum.toFixed(1)}` : '—', color: 'text-amber-600' },
          { label: 'Last 30 Days', value: last30.toString(), color: last30 > 0 ? 'text-emerald-600' : 'text-red-500' },
          { label: 'Response Rate', value: `${responseRate}%`, color: responseRate >= 50 ? 'text-emerald-600' : 'text-red-500' },
        ].map(m => (
          <div key={m.label} className="text-center p-2 bg-muted/20 rounded-lg">
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {([5, 4, 3, 2, 1] as const).map(star => (
          <div key={star} className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 w-8 shrink-0">
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
              <span className="text-[10px] text-muted-foreground">{star}</span>
            </div>
            <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full"
                style={{ width: totalCount > 0 ? `${(starCounts[star] / totalCount) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground w-5 text-right">{starCounts[star]}</span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Google weighs review velocity heavily — consistent new reviews signal an active, trusted business.
      </p>
    </div>
  );
}

// ── Behaviour Signals ─────────────────────────────────────────────────────────

function BehaviourSignalsCard({ insights, loading }: { insights: Insights | null; loading: boolean }) {
  const now = new Date();
  const end = now.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const start = new Date(Date.now() - 30 * 86_400_000).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const signals = [
    { icon: Phone, label: 'Phone Calls', value: insights?.phoneCalls ?? 0, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
    { icon: Navigation, label: 'Direction Requests', value: insights?.directionRequests ?? 0, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
    { icon: Globe, label: 'Website Clicks', value: insights?.websiteClicks ?? 0, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30' },
    { icon: Activity, label: 'Search Impressions', value: insights?.searchImpressions ?? 0, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
    { icon: Calendar, label: 'Booking Clicks', value: insights?.bookingClicks ?? 0, color: 'text-pink-600 bg-pink-50 dark:bg-pink-950/30' },
    { icon: TrendingUp, label: 'Total Interactions', value: insights?.totalInteractions ?? 0, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30' },
  ];

  const mapsImpressions = insights?.mapsImpressions ?? 0;
  const searchImpressions = insights?.searchImpressions ?? 0;
  const total = mapsImpressions + searchImpressions;
  const directPct = total > 0 ? Math.round((mapsImpressions / total) * 100) : 0;
  const discoveryPct = total > 0 ? Math.round((searchImpressions / total) * 100) : 0;

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          <p className="text-sm font-semibold">Behaviour Signals</p>
        </div>
        <span className="text-[10px] text-muted-foreground">{start} — {end}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {signals.map(s => (
              <div key={s.label} className={`rounded-lg p-2.5 ${s.color.split(' ').slice(1).join(' ')}`}>
                <s.icon className={`h-4 w-4 mb-1 ${s.color.split(' ')[0]}`} />
                <p className="text-xl font-bold text-foreground">{s.value.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-[11px] text-muted-foreground">Maps: <strong className="text-foreground">{directPct}%</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-muted-foreground">Search: <strong className="text-foreground">{discoveryPct}%</strong></span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Review List ───────────────────────────────────────────────────────────────

function ReviewListTab({ reviews, loading }: { reviews: Review[]; loading: boolean }) {
  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!reviews.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">No reviews found</p>;
  }
  return (
    <div className="space-y-3">
      {reviews.map(r => {
        const stars = starToNum(r.starRating);
        const date = new Date(r.createTime);
        const dateStr = `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
        return (
          <div key={r.name} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {r.reviewer.profilePhotoUrl ? (
                  <img src={r.reviewer.profilePhotoUrl} alt={r.reviewer.displayName} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                    {r.reviewer.displayName?.[0] || '?'}
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium">{r.reviewer.displayName}</p>
                  <p className="text-[10px] text-muted-foreground">{dateStr}</p>
                </div>
              </div>
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-3 w-3 ${i < stars ? 'text-amber-400 fill-amber-400' : 'text-muted/30'}`} />
                ))}
              </div>
            </div>
            {r.comment && <p className="text-xs text-muted-foreground leading-relaxed">{r.comment}</p>}
            {r.reviewReply && (
              <div className="bg-muted/20 rounded p-2 border-l-2 border-primary/30">
                <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Owner reply</p>
                <p className="text-xs text-foreground leading-relaxed">{r.reviewReply.comment}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  client: Client;
}

export default function GBPMapsEnginePanel({ client }: Props) {
  const { orgId } = useAuth();
  const dispatch = useDispatch();
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'reviews' | 'settings'>('dashboard');
  const [syncing, setSyncing] = useState(false);

  const locationName = client.gbpLocationName;
  const isLinked = !!locationName;

  // ── Reviews fetch ─────────────────────────────────────────────────────────
  const { data: reviewsData, isLoading: reviewsLoading, refetch: refetchReviews } = useQuery<ReviewsData>({
    queryKey: ['/api/gbp/reviews-engine', orgId, locationName],
    queryFn: async () => {
      const r = await fetch(`/api/gbp/reviews?orgId=${encodeURIComponent(orgId!)}&locationName=${encodeURIComponent(locationName!)}`);
      if (!r.ok) throw new Error('Failed to fetch reviews');
      return r.json();
    },
    enabled: !!orgId && isLinked,
    staleTime: 120_000,
  });

  // ── Insights fetch ────────────────────────────────────────────────────────
  const { data: insights, isLoading: insightsLoading, refetch: refetchInsights } = useQuery<Insights>({
    queryKey: ['/api/gbp/insights', orgId, locationName],
    queryFn: async () => {
      const r = await fetch(`/api/gbp/insights?orgId=${encodeURIComponent(orgId!)}&locationName=${encodeURIComponent(locationName!)}`);
      if (!r.ok) throw new Error('Failed to fetch insights');
      return r.json();
    },
    enabled: !!orgId && isLinked,
    staleTime: 300_000,
  });

  // ── Live GBP snapshot (category, description, services, service areas) ────
  const { data: gbpSnapshot, refetch: refetchSnapshot } = useQuery<GBPSnapshot>({
    queryKey: ['/api/gbp/location-snapshot', orgId, locationName],
    queryFn: async () => {
      const r = await fetch(`/api/gbp/location-snapshot?orgId=${encodeURIComponent(orgId!)}&locationName=${encodeURIComponent(locationName!)}`);
      if (!r.ok) throw new Error('snapshot fetch failed');
      return r.json();
    },
    enabled: !!orgId && isLinked,
    staleTime: 600_000,
  });

  // ── Sync ──────────────────────────────────────────────────────────────────
  async function handleSync() {
    if (!orgId || !locationName) return;
    setSyncing(true);
    try {
      await Promise.all([refetchReviews(), refetchInsights(), refetchSnapshot()]);
      toast({ title: 'Synced', description: 'Maps Engine data refreshed.' });
    } catch {
      toast({ title: 'Sync failed', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/clients/${client.id}/gbp-location`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, gbpLocationName: null }),
      });
      if (!r.ok) throw new Error('Failed to disconnect');
    },
    onSuccess: () => {
      dispatch(updateClient({ ...client, gbpLocationName: undefined }));
      toast({ title: 'Disconnected', description: 'GBP location unlinked.' });
    },
  });

  // ── Score ─────────────────────────────────────────────────────────────────
  const reviews = useMemo(() => reviewsData?.reviews || [], [reviewsData]);
  const score = useMemo(() => calcScore(client, reviews, insights ?? null, gbpSnapshot ?? null), [client, reviews, insights, gbpSnapshot]);
  const status = statusLabel(score.total);

  // ── Last synced display ───────────────────────────────────────────────────
  const lastSynced = useMemo(() => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }, []);

  // ── Location display name ─────────────────────────────────────────────────
  const locationDisplay = client.businessName || 'Business';

  if (!isLinked) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Link a GBP location first to activate the Maps Pack Growth Engine.
      </div>
    );
  }

  return (
    <div className="space-y-3">

      {/* ── Connected Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border rounded-lg bg-background">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Maps Pack Growth Engine</p>
              <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 px-1.5 py-0">connected</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">{locationDisplay} · Last synced: {lastSynced}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 px-2" onClick={handleSync} disabled={syncing} data-testid="btn-maps-sync">
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} /> Sync
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 px-2 text-muted-foreground" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending} data-testid="btn-maps-disconnect">
            <X className="h-3 w-3" /> Disconnect
          </Button>
        </div>
      </div>

      {/* ── Maps Authority Score Card ────────────────────────────────────── */}
      <div className="border rounded-lg bg-background overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-4">
            {/* Score circle */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <ScoreCircle score={score.total} />
              <Badge className={`text-[10px] px-2 py-0 ${status.color}`}>{status.label}</Badge>
            </div>
            {/* Label + bars */}
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold mb-3">Maps Authority Score</p>
              <div className="space-y-0.5">
                <ScoreBar label="Prominence" weight="50%" value={score.prominence} max={score.prominenceMax} factors={score.prominenceFactors} />
                <ScoreBar label="Relevance" weight="25%" value={score.relevance} max={score.relevanceMax} factors={score.relevanceFactors} />
                <ScoreBar label="Distance" weight="25%" value={score.distance} max={score.distanceMax} factors={score.distanceFactors} />
              </div>
            </div>
          </div>
        </div>

        {/* Weak factors */}
        {score.weakFactors.length > 0 && (
          <div className="border-t px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-[11px] font-semibold">What's holding your score back</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {score.weakFactors.map(f => (
                <span key={f} className="text-[11px] px-2 py-0.5 rounded-full border border-red-200 text-red-600 dark:border-red-800 dark:text-red-400 bg-red-50 dark:bg-red-950/20">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {score.actions.length > 0 && (
          <div className="border-t px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-emerald-500" />
              <p className="text-[11px] font-semibold">Actions to increase your score</p>
            </div>
            <ul className="space-y-1">
              {score.actions.map(a => (
                <li key={a} className="flex items-start gap-2">
                  <TrendingUp className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-[11px] text-muted-foreground leading-relaxed">{a}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground italic">Click each factor to see what drives your score and what to improve.</p>
          </div>
        )}
      </div>

      {/* ── GBP Booking Health Check ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border rounded-lg bg-background">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-violet-500" />
          <div>
            <p className="text-xs font-semibold">GBP Booking Health Check</p>
            <p className="text-[11px] text-muted-foreground">Verify your booking page is set up correctly for Google Business Profile.</p>
          </div>
        </div>
        {client.website ? (
          <a
            href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-violet-600 hover:underline shrink-0 ml-2"
            data-testid="link-check-booking"
          >
            <ExternalLink className="h-3 w-3" /> Check Booking Health
          </a>
        ) : (
          <span className="text-[11px] text-muted-foreground ml-2">No website linked</span>
        )}
      </div>

      {/* ── Sub tabs ─────────────────────────────────────────────────────── */}
      <div className="border rounded-lg bg-background overflow-hidden">
        <div className="flex border-b">
          {([
            { key: 'dashboard', icon: BarChart3, label: 'Dashboard' },
            { key: 'reviews', icon: Star, label: 'Reviews' },
            { key: 'settings', icon: Shield, label: 'Settings' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveSubTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors ${activeSubTab === t.key ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400' : 'text-muted-foreground hover:text-foreground'}`}
              data-testid={`subtab-${t.key}`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeSubTab === 'dashboard' && (
            <div className="grid grid-cols-1 gap-3">
              <ReviewVelocityCard
                reviews={reviews}
                avgRating={reviewsData?.averageRating || '0'}
                totalCount={reviewsData?.totalReviewCount || 0}
              />
              <BehaviourSignalsCard insights={insights ?? null} loading={insightsLoading} />
            </div>
          )}

          {activeSubTab === 'reviews' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">All Reviews</p>
                <Button size="sm" variant="outline" className="h-6 text-[11px] px-2 gap-1" onClick={() => refetchReviews()} data-testid="btn-refresh-reviews">
                  <RefreshCw className="h-3 w-3" /> Refresh
                </Button>
              </div>
              <ReviewListTab reviews={reviews} loading={reviewsLoading} />
            </div>
          )}

          {activeSubTab === 'settings' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">GBP Connection</p>
              <div className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">Linked Location</p>
                    <p className="text-[11px] text-muted-foreground break-all">{locationName}</p>
                  </div>
                  <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200">Active</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-[11px] text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  data-testid="btn-settings-disconnect"
                >
                  <X className="h-3 w-3 mr-1" /> Disconnect GBP Location
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Disconnecting removes the GBP link from this client. You can re-link it at any time from the 3-Pack Playbook.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
