import { useMemo, useState } from 'react';
import {
  AlertTriangle, XCircle, CheckCircle2, ChevronDown, ChevronUp,
  Globe, MapPin, Star, Search, TrendingUp, Eye, Zap,
  Shield, ShieldX, ShieldCheck, BarChart3, Users, ArrowRight,
  ExternalLink, Target, Lightbulb,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Lead } from '@/lib/types';
import { deriveVisibilityGapSummary, deriveOpportunityAssessment, type VisibilityGap, type GapSeverity } from '@/lib/salesIntelligenceTypes';

// ---------------------------------------------------------------------------
// Helpers & config
// ---------------------------------------------------------------------------

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-AU');
}

const SEVERITY_CONFIG: Record<GapSeverity, { label: string; icon: typeof XCircle; bg: string; border: string; text: string; badge: string }> = {
  critical: {
    label: 'Critical',
    icon: XCircle,
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-200 dark:border-red-800',
    text: 'text-red-700 dark:text-red-400',
    badge: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  },
  high: {
    label: 'High',
    icon: AlertTriangle,
    bg: 'bg-orange-50 dark:bg-orange-950/20',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-700 dark:text-orange-400',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
  },
  medium: {
    label: 'Medium',
    icon: AlertTriangle,
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  },
  low: {
    label: 'Low',
    icon: CheckCircle2,
    bg: 'bg-slate-50 dark:bg-slate-900/20',
    border: 'border-slate-200 dark:border-slate-700',
    text: 'text-slate-600 dark:text-slate-400',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VisibilityScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f97316' : '#ef4444';
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" className="rotate-[-90deg]">
        <circle cx="44" cy="44" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
        <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center" style={{ marginTop: -64 }}>
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground -mt-0.5">/ 100</span>
      </div>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function TrustSignalRow({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {present
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
      <span className={present ? 'text-foreground' : 'text-muted-foreground line-through'}>{label}</span>
    </div>
  );
}

function GapCard({ gap }: { gap: VisibilityGap }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[gap.severity];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-lg border ${cfg.bg} ${cfg.border} overflow-hidden`} data-testid={`gap-card-${gap.id}`}>
      <button
        className="w-full flex items-start gap-2.5 p-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.text}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">{gap.title}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.badge}`}>{cfg.label}</span>
            {gap.isQuickWin && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                Quick Win
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{gap.evidence}</p>
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-current/10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Evidence</p>
            <p className="text-xs text-foreground">{gap.evidence}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Business Impact</p>
            <p className="text-xs text-foreground">{gap.impact}</p>
          </div>
          <div className={`rounded p-2 ${gap.severity === 'critical' ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800' : 'bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800'}`}>
            <div className="flex items-start gap-1.5">
              <ArrowRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-0.5">Fix</p>
                <p className="text-xs text-foreground">{gap.fix}</p>
              </div>
            </div>
          </div>
          {gap.competitor && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Competitor doing it right:</span> {gap.competitor}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OpportunityDimBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{score}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface LeadVisibilityGapPanelProps {
  lead: Lead;
}

type TabId = 'gaps' | 'trust' | 'opportunity';

export default function LeadVisibilityGapPanel({ lead }: LeadVisibilityGapPanelProps) {
  const [tab, setTab] = useState<TabId>('gaps');
  const [showAll, setShowAll] = useState(false);

  const gaps = useMemo(() => deriveVisibilityGapSummary(lead), [lead]);
  const opportunity = useMemo(() => deriveOpportunityAssessment(lead), [lead]);

  const visibleGaps = showAll ? gaps.gaps : gaps.gaps.slice(0, 5);

  const tabs: { id: TabId; label: string; icon: typeof Eye }[] = [
    { id: 'gaps', label: 'Gaps', icon: ShieldX },
    { id: 'trust', label: 'Trust', icon: Shield },
    { id: 'opportunity', label: 'Opportunity', icon: Target },
  ];

  return (
    <div className="space-y-4" data-testid="lead-visibility-gap-panel">

      {/* ── Header scores ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Visibility</p>
          <p className={`text-2xl font-bold ${gaps.visibilityScore >= 60 ? 'text-emerald-600 dark:text-emerald-400' : gaps.visibilityScore >= 35 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}
            data-testid="text-visibility-score">
            {gaps.visibilityScore}
          </p>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${gaps.visibilityScore >= 60 ? 'bg-emerald-500' : gaps.visibilityScore >= 35 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${gaps.visibilityScore}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">Current score</p>
        </div>

        <div className="rounded-lg border bg-card p-3 text-center space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Opportunity</p>
          <p className={`text-2xl font-bold ${opportunity.overallScore >= 70 ? 'text-violet-600 dark:text-violet-400' : opportunity.overallScore >= 50 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}
            data-testid="text-opportunity-score">
            {opportunity.overallScore}
          </p>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${opportunity.overallScore}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">Gap = opportunity</p>
        </div>

        <div className="rounded-lg border bg-card p-3 text-center space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gaps found</p>
          <p className="text-2xl font-bold text-foreground" data-testid="text-gap-count">{gaps.gaps.length}</p>
          <div className="flex items-center justify-center gap-1.5">
            {gaps.gaps.filter(g => g.severity === 'critical').length > 0 && (
              <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 px-1 rounded">
                {gaps.gaps.filter(g => g.severity === 'critical').length} critical
              </span>
            )}
            {gaps.gaps.filter(g => g.severity === 'high').length > 0 && (
              <span className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400 px-1 rounded">
                {gaps.gaps.filter(g => g.severity === 'high').length} high
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{gaps.quickWins.length} quick wins</p>
        </div>
      </div>

      {/* ── Presence pills ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${gaps.hasWebsite ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400'}`}>
          <Globe className="w-3 h-3" />
          {gaps.hasWebsite ? 'Has website' : 'No website'}
        </div>
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${gaps.hasGBP ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400'}`}>
          <MapPin className="w-3 h-3" />
          {gaps.hasGBP ? 'GBP present' : 'No GBP'}
        </div>
        {gaps.hasReviews && (
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
            <Star className="w-3 h-3" />
            {gaps.reviewRating?.toFixed(1)} ({fmtNum(gaps.reviewCount)} reviews)
          </div>
        )}
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${gaps.keywordCoverage !== 'none' ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400'}`}>
          <Search className="w-3 h-3" />
          Keywords: {gaps.keywordCoverage}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="border-b">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`tab-${t.id}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Gaps ────────────────────────────────────────────────────── */}
      {tab === 'gaps' && (
        <div className="space-y-3">
          {/* Quick wins banner */}
          {gaps.quickWins.length > 0 && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {gaps.quickWins.length} Quick Win{gaps.quickWins.length !== 1 ? 's' : ''} — High ROI, Low Effort
                </span>
              </div>
              <div className="space-y-1.5">
                {gaps.quickWins.map(w => (
                  <div key={w.id} className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    {w.title}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gap cards */}
          <div className="space-y-2">
            {gaps.gaps.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No gaps identified yet — run evidence gathering first
              </div>
            )}
            {visibleGaps.map(gap => <GapCard key={gap.id} gap={gap} />)}
            {gaps.gaps.length > 5 && (
              <button
                onClick={() => setShowAll(s => !s)}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 flex items-center justify-center gap-1"
                data-testid="btn-show-all-gaps"
              >
                {showAll ? <><ChevronUp className="w-3 h-3" /> Show fewer</> : <><ChevronDown className="w-3 h-3" /> Show {gaps.gaps.length - 5} more gaps</>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Trust Signals ───────────────────────────────────────────── */}
      {tab === 'trust' && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="text-sm font-medium">Trust Signal Checklist</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {gaps.trustSignals.filter(t => t.present).length}/{gaps.trustSignals.length} present
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${(gaps.trustSignals.filter(t => t.present).length / gaps.trustSignals.length) * 100}%` }} />
            </div>
            <div className="space-y-2">
              {gaps.trustSignals.map((t, i) => (
                <TrustSignalRow key={i} label={t.label} present={t.present} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What Google Sees vs What They Think</p>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5">
                  <p className="font-semibold text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> Their perception
                  </p>
                  <p className="text-foreground">"We have a website and Google listing — we're online."</p>
                </div>
                <div className="rounded-md bg-violet-50 dark:bg-violet-950/30 p-2.5 space-y-1.5 border border-violet-200 dark:border-violet-800">
                  <p className="font-semibold text-violet-700 dark:text-violet-400 flex items-center gap-1">
                    <Eye className="w-3 h-3" /> What Google sees
                  </p>
                  <p className="text-foreground">
                    {gaps.visibilityScore < 30
                      ? 'Almost invisible. Competitors dominate their search results.'
                      : gaps.visibilityScore < 60
                      ? 'Partially visible, but missing key signals that drive local rankings.'
                      : 'Reasonable presence, but gaps create opportunity for competitors.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Opportunity ─────────────────────────────────────────────── */}
      {tab === 'opportunity' && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <span className="text-sm font-medium">Opportunity Assessment</span>
              </div>
              <Badge className={`text-xs ${
                opportunity.tier === 'high_value' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' :
                opportunity.tier === 'strong' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400' :
                opportunity.tier === 'moderate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                {opportunity.tier.replace('_', ' ')}
              </Badge>
            </div>

            {opportunity.headline && (
              <p className="text-sm text-muted-foreground italic border-l-2 border-violet-400 pl-3">
                "{opportunity.headline}"
              </p>
            )}

            <div className="space-y-3">
              {opportunity.dimensions.map(d => (
                <OpportunityDimBar
                  key={d.dimension}
                  label={d.label}
                  score={d.score}
                  color={d.score >= 70 ? 'bg-red-500' : d.score >= 50 ? 'bg-orange-500' : d.score >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card p-3 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Primary Gap</p>
              <p className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <ShieldX className="w-3.5 h-3.5" /> {opportunity.primaryGap}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Primary Win</p>
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> {opportunity.primaryWin}
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-card">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              Time to value: <span className="font-medium">{opportunity.timeToValue}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-card">
              <Users className="w-3 h-3 text-muted-foreground" />
              Competitor threat: <span className="font-medium">{opportunity.competitorThreat}</span>
            </div>
          </div>

          {opportunity.generatedFrom.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              Derived from: {opportunity.generatedFrom.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
