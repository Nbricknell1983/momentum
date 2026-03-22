import { useState, type ComponentType, type ReactNode } from 'react';
import { format } from 'date-fns';
import {
  Phone, Globe, MapPin, Users, TrendingUp, AlertTriangle, CheckCircle2,
  MessageSquare, Lightbulb, HelpCircle, ChevronDown, ChevronUp, ChevronRight,
  RotateCcw, Loader2, Star, Brain, Search, Heart, ShieldCheck, Zap, Monitor, Eye,
  ExternalLink, X as XIcon,
} from 'lucide-react';
import { SiFacebook, SiInstagram, SiLinkedin } from 'react-icons/si';
import { Button } from '@/components/ui/button';
import { cn, timeAgo } from '@/lib/utils';
import { PresenceInsightModal } from '@/components/PresenceInsightModal';
import {
  buildWebsiteInsights, buildGbpInsights, buildSocialInsights, buildSearchInsights,
  buildPaidSearchInsights,
  type PresenceInsightDetail, type InsightStatus,
} from '@/lib/presenceInsights';

interface PresenceSnapshot {
  website: string;
  gbp: string;
  social: string;
  searchVisibility: string;
}

export function ObsBadge() {
  return (
    <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700">
      ● Observed
    </span>
  );
}

export function EstBadge() {
  return (
    <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
      ~ Estimated
    </span>
  );
}

export function AiBadgeMini() {
  return (
    <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
      ✦ AI Analysis
    </span>
  );
}

// ── Evidence delta chip colours + icons ────────────────────────────────────
const DELTA_COLOR: Record<string, string> = {
  added:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40',
  removed:  'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800/40',
  improved: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40',
  worsened: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40',
  changed:  'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};
const DELTA_ICON: Record<string, string> = {
  added: '＋', removed: '−', improved: '↑', worsened: '↓', changed: '⇄',
};

function EvidenceDeltaPanel({ changes, prevGatheredAt }: { changes: any[]; prevGatheredAt?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!changes || changes.length === 0) return null;
  const MAX_VISIBLE = 4;
  const visible = expanded ? changes : changes.slice(0, MAX_VISIBLE);
  const overflow = changes.length - MAX_VISIBLE;
  const prevAge = timeAgo(prevGatheredAt);

  return (
    <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 mt-1">
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
          What changed
        </span>
        {prevAge && (
          <span className="text-[9px] text-slate-400">· since {prevAge}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {visible.map((c: any, i: number) => (
          <span
            key={i}
            className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${DELTA_COLOR[c.type] ?? DELTA_COLOR.changed}`}
          >
            <span>{DELTA_ICON[c.type] ?? '·'}</span>
            {c.label}
          </span>
        ))}
        {!expanded && overflow > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            +{overflow} more
          </button>
        )}
        {expanded && overflow > 0 && (
          <button
            onClick={() => setExpanded(false)}
            className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            show less
          </button>
        )}
      </div>
    </div>
  );
}

// ── Status helpers for insight rows ────────────────────────────────────────

const INSIGHT_ROW_STYLES: Record<InsightStatus, { icon: string; text: string; dot: string }> = {
  positive: { icon: '✓', text: 'text-emerald-700 dark:text-emerald-400', dot: 'text-emerald-500' },
  warning:  { icon: '!', text: 'text-amber-700 dark:text-amber-400',   dot: 'text-amber-500'  },
  neutral:  { icon: '·', text: 'text-slate-600 dark:text-slate-300',   dot: 'text-slate-400'  },
  negative: { icon: '✗', text: 'text-red-700 dark:text-red-400',       dot: 'text-red-500'    },
};

function PresenceInsightRow({
  insight,
  onOpen,
}: {
  insight: PresenceInsightDetail;
  onOpen: (d: PresenceInsightDetail) => void;
}) {
  const s = INSIGHT_ROW_STYLES[insight.status];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(insight)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(insight); } }}
      className="flex items-center gap-1.5 text-[10px] rounded px-1 py-0.5 -mx-1 cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/60 focus:outline-none focus:ring-1 focus:ring-violet-400/60 transition-colors group"
      data-testid={`insight-row-${insight.id}`}
    >
      <span className={cn('shrink-0 font-bold leading-none', s.dot)}>{s.icon}</span>
      <span className={cn('flex-1 leading-snug', s.text)}>{insight.label}</span>
      <ChevronRight className="h-2.5 w-2.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-400 shrink-0 transition-colors" />
    </div>
  );
}

// ── Card wrapper ────────────────────────────────────────────────────────────

function PresenceCard({
  icon: Icon, title, badge, age, children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  badge: ReactNode;
  age?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
          <Icon className="h-2.5 w-2.5" /> {title}
        </div>
        <div className="flex items-center gap-1 min-w-0">
          {badge}
          {age && <span className="text-[9px] text-slate-400 tabular-nums">· {age}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function EvidencePresenceSection({
  eb, psAi, serp,
  ebGatheredAt, serpGeneratedAt, aiGeneratedAt,
  delta, deltaPrevGatheredAt,
  sitemapPageCount,
}: {
  eb?: any;
  psAi?: PresenceSnapshot;
  serp?: any;
  ebGatheredAt?: string | Date | null;
  serpGeneratedAt?: string | Date | null;
  aiGeneratedAt?: string | Date | null;
  delta?: any[] | null;
  deltaPrevGatheredAt?: string | null;
  sitemapPageCount?: number;
}) {
  const [activeDetail, setActiveDetail] = useState<PresenceInsightDetail | null>(null);

  const w   = eb?.website;
  const gbp = eb?.gbp;
  const soc = eb?.social;

  const hasWebObs = !!w?.url;
  const hasGbpObs = !!gbp?.placeId || !!gbp?.name;
  const hasSocData = !!(soc?.facebook || soc?.instagram || soc?.linkedin || soc?.twitter);
  const kwServices: string[] = w?.serviceKeywords?.slice(0, 8) ?? [];
  const kwLocations: string[] = w?.locationKeywords?.slice(0, 8) ?? [];
  const hasKwObs = kwServices.length > 0 || kwLocations.length > 0;

  // Unified sitemap — raw /sitemap.xml check OR scanned pages
  const scannedPageCount = sitemapPageCount ?? 0;
  const hasSitemapData   = !!(w?.hasSitemap || scannedPageCount > 0);

  // Conversion gaps filtered to remove stale sitemap entries when pages exist
  const filteredGaps: string[] = (w?.conversionGaps ?? []).filter((g: string) =>
    hasSitemapData ? !g.toLowerCase().includes('sitemap') : true
  );

  // Freshness
  const ebAge   = timeAgo(ebGatheredAt) ?? undefined;
  const serpAge = timeAgo(serpGeneratedAt) ?? undefined;
  const aiAge   = timeAgo(aiGeneratedAt) ?? undefined;

  // Build structured insight lists from evidence
  const websiteInsights = buildWebsiteInsights(w, hasSitemapData, scannedPageCount, filteredGaps);
  const gbpInsights     = buildGbpInsights(gbp);
  const socialInsights  = buildSocialInsights(soc);
  const searchInsights  = buildSearchInsights(w, serp);

  // Extract the network insight so the banner and the row can share one click handler
  const networkInsight      = gbpInsights.find(i => i.id === 'gbp-network') ?? null;

  // Paid search — only populated when auction data has been gathered
  const paidSearch          = eb?.paidSearch ?? null;
  const paidSearchInsights  = buildPaidSearchInsights(paidSearch);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">

        {/* ── Website card ── */}
        <PresenceCard
          icon={Globe}
          title="Website"
          badge={hasWebObs ? <ObsBadge /> : psAi?.website ? <AiBadgeMini /> : null}
          age={hasWebObs ? ebAge : aiAge}
        >
          {hasWebObs ? (
            <div className="space-y-0.5">
              {/* URL link — static, not an insight row */}
              <a href={w.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline truncate mb-1">
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{w.url.replace(/^https?:\/\//, '')}</span>
              </a>
              {/* Insight rows — each clickable */}
              {websiteInsights.map(insight => (
                <PresenceInsightRow key={insight.id} insight={insight} onOpen={setActiveDetail} />
              ))}
            </div>
          ) : psAi?.website ? (
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{psAi.website}</p>
          ) : (
            <p className="text-[10px] text-slate-400 italic">No website data gathered</p>
          )}
        </PresenceCard>

        {/* ── GBP / Maps card ── */}
        <PresenceCard
          icon={MapPin}
          title="GBP / Maps"
          badge={hasGbpObs ? <ObsBadge /> : psAi?.gbp ? <AiBadgeMini /> : null}
          age={hasGbpObs ? ebAge : aiAge}
        >
          {hasGbpObs ? (
            <div className="space-y-0.5">
              {/* ── Multi-location network banner ──────────────────────────── */}
              {gbp.networkSummary?.totalLocations > 1 && (() => {
                const net = gbp.networkSummary;
                const isClickable = !!networkInsight;
                return (
                  <div
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onClick={isClickable ? () => setActiveDetail(networkInsight!) : undefined}
                    onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveDetail(networkInsight!); } } : undefined}
                    data-testid="gbp-network-banner"
                    className={cn(
                      'rounded border px-1.5 py-1 mb-1 space-y-0.5',
                      'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/40',
                      isClickable && 'cursor-pointer select-none transition-colors hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:border-violet-300 dark:hover:border-violet-700 focus:outline-none focus:ring-1 focus:ring-violet-400/60',
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 text-[9px] font-semibold text-violet-700 dark:text-violet-300">
                        <Users className="h-2.5 w-2.5" />
                        Multi-location brand · {net.totalLocations} locations
                      </div>
                      {isClickable && (
                        <ChevronRight className="h-2.5 w-2.5 text-violet-400 dark:text-violet-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 text-[9px]">
                      {net.totalReviews > 0 && (
                        <span className="text-slate-500 dark:text-slate-400">
                          {net.totalReviews.toLocaleString()} reviews total
                        </span>
                      )}
                      {net.avgRating != null && (
                        <span className="text-slate-500 dark:text-slate-400">
                          · {net.avgRating.toFixed(1)}★ avg
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
              {/* Static identity info — primary location */}
              {gbp.name && (
                <p className="text-[9px] font-medium text-slate-600 dark:text-slate-300 truncate leading-snug">
                  {gbp.networkSummary?.totalLocations > 1 ? `Primary: ${gbp.name}` : gbp.name}
                </p>
              )}
              {gbp.category && (
                <p className="text-[9px] text-slate-400 leading-snug">{gbp.category}</p>
              )}
              {gbp.candidates?.length > 1 && !gbp.networkSummary?.totalLocations && (
                <p className="text-[9px] text-slate-400 italic leading-snug">
                  Best match · {gbp.candidates.length} listings found
                </p>
              )}
              {/* Static status chips */}
              <div className="flex items-center gap-1 text-[9px] mt-0.5 mb-0.5">
                <span className={`px-1 py-0.5 rounded font-medium ${
                  gbp.isOpen ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                             : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                }`}>
                  {gbp.isOpen ? 'Open now' : gbp.isOpen === false ? 'Closed' : 'Hours unknown'}
                </span>
                {gbp.mapsUrl && (
                  <a href={gbp.mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="text-blue-500 hover:underline flex items-center gap-0.5">
                    <ExternalLink className="h-2 w-2" /> Maps
                  </a>
                )}
              </div>
              {gbp.editorialSummary && (
                <p className="text-[9px] text-slate-400 italic leading-snug line-clamp-2 mb-0.5">
                  "{gbp.editorialSummary}"
                </p>
              )}
              {/* Insight rows — network summary + rating + health notes */}
              {gbpInsights.map(insight => (
                <PresenceInsightRow key={insight.id} insight={insight} onOpen={setActiveDetail} />
              ))}
              {/* Dev-only: ranked candidates */}
              {import.meta.env.DEV && gbp.candidates?.length > 1 && (
                <details className="mt-1">
                  <summary className="text-[8px] text-slate-400 cursor-pointer select-none hover:text-slate-500">
                    [dev] {gbp.candidates.length} candidates ranked
                  </summary>
                  <div className="mt-0.5 space-y-0.5 border-t border-dashed border-slate-200 dark:border-slate-700 pt-0.5">
                    {gbp.candidates.map((c: any, i: number) => (
                      <div key={c.placeId || i} className="text-[8px] text-slate-400 leading-tight">
                        <span className={i === 0 ? 'font-bold text-green-600 dark:text-green-400' : ''}>
                          #{i + 1} {c.name} ({c.score}pt)
                        </span>
                        {c.address && <span className="ml-1 opacity-60">{c.address.slice(0, 40)}</span>}
                        {c.reasons?.length > 0 && (
                          <span className="ml-1 opacity-50">[{c.reasons.join(' ')}]</span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : psAi?.gbp ? (
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{psAi.gbp}</p>
          ) : (
            <p className="text-[10px] text-slate-400 italic">No GBP data gathered</p>
          )}
        </PresenceCard>

        {/* ── Social card ── */}
        <PresenceCard
          icon={Users}
          title="Social"
          badge={hasSocData ? <ObsBadge /> : psAi?.social ? <AiBadgeMini /> : null}
          age={hasSocData ? ebAge : aiAge}
        >
          {hasSocData ? (
            <div className="space-y-0.5">
              {socialInsights.map(insight => (
                <PresenceInsightRow key={insight.id} insight={insight} onOpen={setActiveDetail} />
              ))}
            </div>
          ) : psAi?.social ? (
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{psAi.social}</p>
          ) : (
            <p className="text-[10px] text-slate-400 italic">No social data gathered</p>
          )}
        </PresenceCard>

        {/* ── Search Visibility card ── */}
        <PresenceCard
          icon={Search}
          title="Search"
          badge={hasKwObs ? <ObsBadge /> : psAi?.searchVisibility ? <AiBadgeMini /> : null}
          age={hasKwObs ? ebAge : aiAge}
        >
          {hasKwObs || serp?.competitors?.length > 0 ? (
            <div className="space-y-0.5">
              {searchInsights.map((insight, i) => {
                const isCompetitor = insight.id === 'competitors';
                return (
                  <div key={insight.id}>
                    {isCompetitor && searchInsights.length > 1 && (
                      <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                    )}
                    {isCompetitor && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <EstBadge />
                        {serpAge && <span className="text-[9px] text-slate-400 tabular-nums">· {serpAge}</span>}
                      </div>
                    )}
                    <PresenceInsightRow insight={insight} onOpen={setActiveDetail} />
                  </div>
                );
              })}
            </div>
          ) : psAi?.searchVisibility ? (
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{psAi.searchVisibility}</p>
          ) : (
            <p className="text-[10px] text-slate-400 italic">No search visibility data</p>
          )}
        </PresenceCard>

        {/* ── Paid Search Insights — spans both columns, only when data present ── */}
        {paidSearch && (
          <div className="col-span-2">
            <PresenceCard
              icon={TrendingUp}
              title="Paid Search"
              headerRight={
                <span className="text-[9px] text-slate-400 dark:text-slate-500">
                  {(paidSearchInsights.find(i => i.id === 'ps-keywords') != null)
                    ? `${(paidSearch.entries ?? []).length} keywords`
                    : 'Insights'}
                </span>
              }
            >
              {paidSearchInsights.length > 0 ? (
                <div className="space-y-px">
                  {paidSearchInsights
                    .filter(i => i.id !== 'ps-keywords') // keywords row always last
                    .map(insight => (
                      <PresenceInsightRow
                        key={insight.id}
                        insight={insight}
                        onClick={() => setActiveDetail(insight)}
                        data-testid={`ps-insight-${insight.id}`}
                      />
                    ))}
                  {/* Keyword breakdown row always last */}
                  {paidSearchInsights.filter(i => i.id === 'ps-keywords').map(insight => (
                    <PresenceInsightRow
                      key={insight.id}
                      insight={insight}
                      onClick={() => setActiveDetail(insight)}
                      data-testid="ps-insight-ps-keywords"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 italic">No paid search data</p>
              )}
            </PresenceCard>
          </div>
        )}

        {/* ── Evidence delta panel — spans both columns ── */}
        {delta && delta.length > 0 && (
          <div className="col-span-2">
            <EvidenceDeltaPanel changes={delta} prevGatheredAt={deltaPrevGatheredAt} />
          </div>
        )}

      </div>

      {/* ── Insight drilldown modal ── */}
      <PresenceInsightModal
        detail={activeDetail}
        open={!!activeDetail}
        onClose={() => setActiveDetail(null)}
      />
    </>
  );
}

interface CustomerProfile {
  likelyCustomer?: string;
  jobsToBeDone?: string;
  urgencyEmotion?: string;
  trustFactors?: string;
}

interface SearchIntentAnalysis {
  primarySearchTerms?: string[];
  whyTheySearch?: string;
  whatTheyNeedToSee?: string;
  conversionBarriers?: string;
}

interface WebsiteAnalysis {
  whatItTries?: string;
  whoItsFor?: string;
  keyWeaknesses?: string[];
  missedOpportunity?: string;
}

export interface PrepCallPack {
  businessSnapshot: string;
  customerProfile?: CustomerProfile;
  searchIntentAnalysis?: SearchIntentAnalysis;
  websiteAnalysis?: WebsiteAnalysis;
  presenceSnapshot: PresenceSnapshot;
  opportunities: string[];
  gaps: string[];
  callPriorities: string[];
  discoveryQuestions: string[];
  commercialAngle: string;
  missingDataNotes: string[];
  confidence: 'high' | 'medium' | 'low';
  generatedAt: string;
  leadId?: string;
}

interface PrepCallPackCardProps {
  pack: PrepCallPack;
  businessName?: string;
  evidenceBundle?: any;
  evidenceDelta?: any;
  sitemapPageCount?: number;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

const CONFIDENCE_STYLES = {
  high:   { bg: 'bg-green-500/10 border-green-500/30',  text: 'text-green-400',  label: 'High confidence' },
  medium: { bg: 'bg-amber-500/10 border-amber-500/30',  text: 'text-amber-400',  label: 'Medium confidence' },
  low:    { bg: 'bg-red-500/10 border-red-500/30',      text: 'text-red-400',    label: 'Low — check missing data' },
};

function SectionLabel({ icon: Icon, label, color }: { icon: any; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 mb-2 ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      <p className="text-[10px] font-bold uppercase tracking-wider">{label}</p>
    </div>
  );
}

function IntelRow({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{label}: </span>
        <span className="text-xs text-foreground leading-relaxed">{value}</span>
      </div>
    </div>
  );
}

export function PrepCallPackCard({ pack, businessName, evidenceBundle, evidenceDelta, sitemapPageCount, onRegenerate, isRegenerating }: PrepCallPackCardProps) {
  const [showMissing, setShowMissing] = useState(false);
  const conf = CONFIDENCE_STYLES[pack.confidence] || CONFIDENCE_STYLES.medium;
  const genDate = pack.generatedAt ? format(new Date(pack.generatedAt), 'dd/MM/yyyy HH:mm') : '';

  const hasCustomerProfile = pack.customerProfile && (
    pack.customerProfile.likelyCustomer || pack.customerProfile.jobsToBeDone ||
    pack.customerProfile.urgencyEmotion || pack.customerProfile.trustFactors
  );
  const hasSearchIntent = pack.searchIntentAnalysis && (
    pack.searchIntentAnalysis.whyTheySearch || pack.searchIntentAnalysis.whatTheyNeedToSee ||
    pack.searchIntentAnalysis.primarySearchTerms?.length
  );
  const hasWebsiteAnalysis = pack.websiteAnalysis && (
    pack.websiteAnalysis.whatItTries || pack.websiteAnalysis.keyWeaknesses?.length
  );

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200 dark:border-amber-800/40 bg-amber-100/50 dark:bg-amber-900/20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
            <Phone className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Call Prep Pack</p>
            {genDate && <p className="text-[10px] text-amber-600 dark:text-amber-400">Generated {genDate}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${conf.bg} ${conf.text}`}>{conf.label}</span>
          {onRegenerate && (
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-amber-600 dark:text-amber-400"
              onClick={onRegenerate} disabled={isRegenerating}
              data-testid="button-regen-prep-pack" title="Regenerate prep pack"
            >
              {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">

        {/* ── Business Snapshot ── */}
        <div>
          <SectionLabel icon={Brain} label="Business Snapshot" color="text-amber-700 dark:text-amber-400" />
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{pack.businessSnapshot}</p>
        </div>

        {/* ── Customer Profile ── */}
        {hasCustomerProfile && (
          <div className="rounded-lg border border-violet-200 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2.5">
            <SectionLabel icon={Users} label="Customer Profile" color="text-violet-700 dark:text-violet-400" />
            {pack.customerProfile!.likelyCustomer && (
              <IntelRow icon={Users} label="Who they are" value={pack.customerProfile!.likelyCustomer} />
            )}
            {pack.customerProfile!.jobsToBeDone && (
              <IntelRow icon={Zap} label="Job to be done" value={pack.customerProfile!.jobsToBeDone} />
            )}
            {pack.customerProfile!.urgencyEmotion && (
              <IntelRow icon={Heart} label="Urgency / emotion" value={pack.customerProfile!.urgencyEmotion} />
            )}
            {pack.customerProfile!.trustFactors && (
              <IntelRow icon={ShieldCheck} label="Trust factors" value={pack.customerProfile!.trustFactors} />
            )}
          </div>
        )}

        {/* ── Search Intent Analysis ── */}
        {hasSearchIntent && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2.5">
            <SectionLabel icon={Search} label="Search Intent" color="text-blue-700 dark:text-blue-400" />
            {pack.searchIntentAnalysis!.primarySearchTerms && pack.searchIntentAnalysis!.primarySearchTerms.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pack.searchIntentAnalysis!.primarySearchTerms.map((term, i) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40 font-medium">
                    {term}
                  </span>
                ))}
              </div>
            )}
            {pack.searchIntentAnalysis!.whyTheySearch && (
              <IntelRow icon={Search} label="Why they search" value={pack.searchIntentAnalysis!.whyTheySearch} />
            )}
            {pack.searchIntentAnalysis!.whatTheyNeedToSee && (
              <IntelRow icon={Eye} label="What they need to see" value={pack.searchIntentAnalysis!.whatTheyNeedToSee} />
            )}
            {pack.searchIntentAnalysis!.conversionBarriers && (
              <IntelRow icon={AlertTriangle} label="Conversion barriers" value={pack.searchIntentAnalysis!.conversionBarriers} />
            )}
          </div>
        )}

        {/* ── Website Analysis ── */}
        {hasWebsiteAnalysis && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 p-3 space-y-2.5">
            <SectionLabel icon={Monitor} label="Website Analysis" color="text-slate-600 dark:text-slate-400" />
            {pack.websiteAnalysis!.whatItTries && (
              <IntelRow icon={Globe} label="What it's trying to do" value={pack.websiteAnalysis!.whatItTries} />
            )}
            {pack.websiteAnalysis!.whoItsFor && (
              <IntelRow icon={Users} label="Who it's built for" value={pack.websiteAnalysis!.whoItsFor} />
            )}
            {pack.websiteAnalysis!.keyWeaknesses && pack.websiteAnalysis!.keyWeaknesses.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Weaknesses</p>
                <ul className="space-y-1">
                  {pack.websiteAnalysis!.keyWeaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pack.websiteAnalysis!.missedOpportunity && (
              <div className="mt-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Missed Opportunity</p>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{pack.websiteAnalysis!.missedOpportunity}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Presence Snapshot — evidence-backed ── */}
        <div>
          <SectionLabel icon={Globe} label="Presence Snapshot" color="text-amber-700 dark:text-amber-400" />
          <EvidencePresenceSection
            eb={evidenceBundle}
            psAi={pack.presenceSnapshot}
            ebGatheredAt={(evidenceBundle as any)?.gatheredAt}
            aiGeneratedAt={pack.generatedAt}
            delta={(evidenceDelta as any)?.changes ?? null}
            deltaPrevGatheredAt={(evidenceDelta as any)?.prevGatheredAt ?? null}
            sitemapPageCount={sitemapPageCount}
          />
        </div>

        {/* ── Opportunities + Gaps ── */}
        {((pack.opportunities?.length ?? 0) > 0 || (pack.gaps?.length ?? 0) > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(pack.opportunities?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-green-700 dark:text-green-400">Opportunities</p>
                </div>
                <ul className="space-y-1.5">
                  {pack.opportunities.map((op, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                      {op}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(pack.gaps?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Gaps / Weaknesses</p>
                </div>
                <ul className="space-y-1.5">
                  {pack.gaps.map((g, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Call Priorities ── */}
        {(pack.callPriorities?.length ?? 0) > 0 && (
          <div>
            <SectionLabel icon={Phone} label="Call Priorities" color="text-amber-700 dark:text-amber-400" />
            <ol className="space-y-2">
              {pack.callPriorities.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── Discovery Questions ── */}
        {(pack.discoveryQuestions?.length ?? 0) > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Discovery Questions</p>
            </div>
            <ol className="space-y-1.5">
              {pack.discoveryQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <HelpCircle className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                  {q}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── Commercial Angle ── */}
        {pack.commercialAngle && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Commercial Angle</p>
            </div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200 leading-relaxed">{pack.commercialAngle}</p>
          </div>
        )}

        {/* ── Missing data — collapsible ── */}
        {(pack.missingDataNotes?.length ?? 0) > 0 && (
          <div>
            <button
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              onClick={() => setShowMissing(v => !v)}
              data-testid="button-toggle-missing-data"
            >
              {showMissing ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Missing / To Confirm ({pack.missingDataNotes.length})
            </button>
            {showMissing && (
              <ul className="mt-2 space-y-1">
                {pack.missingDataNotes.map((note, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
