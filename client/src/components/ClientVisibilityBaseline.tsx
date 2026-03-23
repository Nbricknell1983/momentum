import { useState } from 'react';
import {
  Globe, MapPin, Search, ExternalLink,
  Shield, AlertTriangle, CheckCircle2, XCircle,
  TrendingUp, Eye, Info, ChevronDown, ChevronUp,
  Zap, BarChart3, Target,
} from 'lucide-react';
import { Client } from '@/lib/types';
import { EvidencePresenceSection } from './PrepCallPackCard';

// ─── Resolve presence URLs ─────────────────────────────────────────────────────

function resolveWebsite(client: Client): string {
  const si  = client.sourceIntelligence;
  const bp  = client.businessProfile;
  const ob  = client.clientOnboarding;
  const pp  = (si?.prepCallPack ?? {}) as Record<string, any>;
  return (
    client.website?.trim() || si?.website?.trim() || ob?.currentWebsiteUrl?.trim() ||
    bp?.websiteUrl?.trim() || pp?.assetLinks?.websiteUrl?.trim() || ''
  );
}

// ─── Grade badge ──────────────────────────────────────────────────────────────

function GradeBadge({ grade, label }: { grade: string; label: string }) {
  const cfg: Record<string, string> = {
    A: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    B: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
    C: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    D: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
    F: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
  };
  return (
    <div className="text-center">
      <span className={`inline-block text-sm font-bold px-2 py-0.5 rounded-md ${cfg[grade] || cfg['C']}`}>{grade}</span>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-600 dark:text-slate-400">{label}</span>
        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{score}/100</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
    </div>
  );
}

// ─── Preservation tag ─────────────────────────────────────────────────────────

type PreservationType = 'preserve' | 'improve' | 'replace';

function PreservationTag({ type }: { type: PreservationType }) {
  const cfg = {
    preserve: { cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', label: 'Preserve' },
    improve:  { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',   label: 'Improve' },
    replace:  { cls: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-800',               label: 'Replace' },
  };
  const { cls, label } = cfg[type];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, color }: { icon: typeof Globe; title: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</span>
    </div>
  );
}

// ─── Ads stat chip ────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg border ${color}`}>
      <span className="text-sm font-bold">{value}</span>
      <span className="text-[9px] text-muted-foreground mt-0.5 text-center leading-tight">{label}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientVisibilityBaseline({ client }: { client: Client }) {
  const websiteEngine  = client.websiteEngine;
  const seoEngine      = client.seoEngine;
  const gbpEngine      = client.gbpEngine;
  const adsEngine      = client.adsEngine;
  const si             = client.sourceIntelligence;
  const plan           = client.activationPlan;
  const scope          = plan?.selectedScope ?? [];

  const website        = resolveWebsite(client);
  const hasWebsite     = !!website;
  const hasEngineData  = !!(websiteEngine || seoEngine || gbpEngine || adsEngine);
  const isRebuildScope = scope.includes('website') && hasWebsite;

  // Evidence bundle (from lead conversion — same data as lead Presence Snapshot)
  const pp = (si?.prepCallPack ?? {}) as Record<string, any>;
  const rawEb =
    (si as any)?.evidenceBundle ??
    pp.evidenceBundle ??
    (client as any).evidenceBundle ??
    null;
  const serpData =
    (si as any)?.serpData ??
    pp.serpData ??
    null;
  const ebGatheredAt = rawEb?.gatheredAt ?? pp.ebGatheredAt ?? pp.gatheredAt ?? null;
  const sitemapPageCount = pp.sitemapPages?.length ?? pp.sitemapPageCount ?? rawEb?.sitemapPageCount ?? 0;
  const delta = (si as any)?.evidenceDelta ?? (client as any).evidenceDelta ?? null;
  const hasEvidenceBundle = !!rawEb;

  // Only render when engine data, evidence bundle, or takeover context exists
  const hasAnyContent = hasEngineData || hasEvidenceBundle || !!(si?.strategyIntelligence?.businessOverview);
  if (!hasAnyContent && !isRebuildScope) return null;

  // Default: expanded when engines or evidence bundle exists
  const [collapsed, setCollapsed] = useState(!hasEngineData && !hasEvidenceBundle);

  // ── Engine-derived preservation items ─────────────────────────────────────
  const seoTasks     = websiteEngine?.tasks?.filter(t => t.category === 'seo') ?? [];
  const structTasks  = websiteEngine?.tasks?.filter(t => t.category === 'structure') ?? [];
  const highPriority = websiteEngine?.tasks?.filter(t => t.priority === 1) ?? [];
  const websiteHealthScore = websiteEngine?.healthScore ?? 0;

  const getSEOPreservationItems = (): { label: string; type: PreservationType; note: string }[] => {
    if (!hasWebsite) return [];
    const items: { label: string; type: PreservationType; note: string }[] = [];

    items.push({
      label: 'Existing URL structure',
      type: websiteHealthScore > 60 ? 'preserve' : 'improve',
      note: websiteHealthScore > 60
        ? 'Existing URL patterns likely have indexed backlinks — maintain where possible'
        : 'URL structure has issues — plan redirects carefully during rebuild',
    });
    items.push({
      label: 'Page metadata & schema',
      type: seoTasks.length === 0 ? 'preserve' : seoTasks.length <= 2 ? 'improve' : 'replace',
      note: seoTasks.length === 0
        ? 'No SEO issues detected — carry metadata forward into new build'
        : `${seoTasks.length} SEO issue${seoTasks.length !== 1 ? 's' : ''} found — audit before migrating metadata`,
    });
    if (seoEngine?.keywordTargets?.length) {
      items.push({
        label: `Existing keyword signals (${seoEngine.keywordTargets.slice(0, 3).join(', ')}…)`,
        type: 'preserve',
        note: 'Keyword targets from current rankings — ensure new site targets same terms',
      });
    }
    items.push({
      label: 'Internal link architecture',
      type: structTasks.length > 2 ? 'replace' : 'preserve',
      note: structTasks.length > 2
        ? 'Structural issues detected — redesign link architecture in new build'
        : 'Internal linking appears reasonable — replicate structure in new site',
    });
    if (client.channelStatus.gbp !== 'not_started') {
      items.push({
        label: 'GBP-linked website URL',
        type: 'preserve',
        note: 'Keep the same domain or update GBP immediately after migration to avoid rank loss',
      });
    }
    return items;
  };

  const preservationItems = isRebuildScope ? getSEOPreservationItems() : [];

  // ── Colour helpers ────────────────────────────────────────────────────────
  const websiteHealthLabel = websiteEngine?.healthLabel ?? 'unknown';
  const websiteHealthColor =
    websiteHealthLabel === 'critical'    ? 'bg-red-400' :
    websiteHealthLabel === 'needs-work'  ? 'bg-amber-400' :
    websiteHealthLabel === 'good'        ? 'bg-blue-400' :
    websiteHealthLabel === 'strong'      ? 'bg-emerald-500' :
    'bg-slate-300';

  const seoBarColor =
    (seoEngine?.visibilityScore ?? 0) < 30 ? 'bg-red-400' :
    (seoEngine?.visibilityScore ?? 0) < 60 ? 'bg-amber-400' : 'bg-emerald-500';

  const gbpBarColor =
    (gbpEngine?.optimizationScore ?? 0) < 40 ? 'bg-red-400' :
    (gbpEngine?.optimizationScore ?? 0) < 70 ? 'bg-amber-400' : 'bg-emerald-500';

  const adsBarColor =
    (adsEngine?.readinessScore ?? 0) < 40 ? 'bg-red-400' :
    (adsEngine?.readinessScore ?? 0) < 70 ? 'bg-amber-400' : 'bg-emerald-500';

  // Subtitle
  const subtitle = hasEngineData
    ? `${[websiteEngine && 'Website', gbpEngine && 'GBP', seoEngine && 'SEO', adsEngine && 'Ads'].filter(Boolean).join(' · ')} engine analysis`
    : hasEvidenceBundle
    ? 'Presence snapshot from lead intelligence'
    : isRebuildScope
    ? 'SEO preservation required'
    : 'Business context';

  return (
    <div className="rounded-xl border border-border overflow-hidden" data-testid="client-visibility-baseline">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
        onClick={() => setCollapsed(c => !c)}
        data-testid="baseline-toggle"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Engine Analysis</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRebuildScope && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              TAKEOVER
            </span>
          )}
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="p-4 space-y-4 bg-white dark:bg-slate-900/30">

          {/* ── PRESENCE SNAPSHOT (evidence bundle from lead) ─────────────── */}
          {hasEvidenceBundle && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <SectionHeader icon={Eye} title="Presence Snapshot" color="text-violet-500" />
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  Evidence-backed
                </span>
              </div>
              <EvidencePresenceSection
                eb={rawEb}
                psAi={pp.presenceSnapshot ?? pp.aiSnapshot ?? null}
                serp={serpData}
                ebGatheredAt={ebGatheredAt}
                serpGeneratedAt={pp.serpGeneratedAt ?? null}
                aiGeneratedAt={pp.aiGeneratedAt ?? null}
                delta={delta}
                deltaPrevGatheredAt={(client as any).evidenceDeltaPrevGatheredAt ?? null}
                sitemapPageCount={sitemapPageCount}
              />
              {hasEngineData && <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />}
            </div>
          )}

          {/* ── SEO TAKEOVER ALERT ─────────────────────────────────────────── */}
          {isRebuildScope && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">SEO Preservation Required</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">
                  This client has an existing website and a website rebuild is in scope.
                  Existing SEO equity, URL structure, and GBP linkage must be protected during migration.
                </p>
              </div>
            </div>
          )}

          {/* ── WEBSITE ENGINE ─────────────────────────────────────────────── */}
          {websiteEngine && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <SectionHeader icon={Globe} title="Website Engine" color="text-blue-500" />
                {hasWebsite && (
                  <a href={website.startsWith('http') ? website : `https://${website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                    onClick={e => e.stopPropagation()}
                    data-testid="baseline-website-url">
                    {website} <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  </a>
                )}
              </div>
              <div className="rounded-lg border border-border bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                <div className="flex items-start gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 mt-1 ${websiteHealthColor}`} />
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{websiteEngine.summary}</span>
                </div>
                <ScoreBar score={websiteEngine.healthScore} label="Website health" color={websiteHealthColor} />
                {(websiteEngine.conversionGrade || websiteEngine.structureGrade || websiteEngine.contentGrade) && (
                  <div className="flex items-center justify-around pt-1 border-t border-border/60">
                    {websiteEngine.conversionGrade && <GradeBadge grade={websiteEngine.conversionGrade} label="Conversion" />}
                    {websiteEngine.structureGrade && <GradeBadge grade={websiteEngine.structureGrade} label="Structure" />}
                    {websiteEngine.contentGrade && <GradeBadge grade={websiteEngine.contentGrade} label="Content" />}
                  </div>
                )}
                {highPriority.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-border/60">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500 dark:text-red-400">Critical issues</p>
                    {highPriority.slice(0, 3).map((t, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{t.task}</span>
                      </div>
                    ))}
                  </div>
                )}
                {websiteEngine.quickWins?.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-border/60">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Quick wins</p>
                    {websiteEngine.quickWins.slice(0, 2).map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── GBP ENGINE ─────────────────────────────────────────────────── */}
          {gbpEngine && (
            <>
              {websiteEngine && <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />}
              <div className="space-y-2">
                <SectionHeader icon={MapPin} title="GBP Engine" color="text-emerald-500" />
                <div className="rounded-lg border border-border bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 mt-1 ${gbpBarColor}`} />
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{gbpEngine.summary}</span>
                  </div>
                  <ScoreBar score={gbpEngine.optimizationScore} label="GBP optimisation score" color={gbpBarColor} />
                  {(gbpEngine.profileGrade || gbpEngine.reviewGrade || gbpEngine.postGrade) && (
                    <div className="flex items-center justify-around pt-1 border-t border-border/60">
                      {gbpEngine.profileGrade && <GradeBadge grade={gbpEngine.profileGrade} label="Profile" />}
                      {gbpEngine.reviewGrade && <GradeBadge grade={gbpEngine.reviewGrade} label="Reviews" />}
                      {gbpEngine.postGrade && <GradeBadge grade={gbpEngine.postGrade} label="Posts" />}
                    </div>
                  )}
                  {gbpEngine.quickWins?.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/60">
                      {gbpEngine.quickWins.slice(0, 2).map((w, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── SEO ENGINE ─────────────────────────────────────────────────── */}
          {seoEngine && (
            <>
              {(websiteEngine || gbpEngine) && <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />}
              <div className="space-y-2">
                <SectionHeader icon={Search} title="SEO Engine" color="text-violet-500" />
                <div className="rounded-lg border border-border bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 mt-1 ${seoBarColor}`} />
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{seoEngine.summary}</span>
                  </div>
                  <ScoreBar score={seoEngine.visibilityScore} label="Search visibility score" color={seoBarColor} />
                  {seoEngine.keywordTargets?.length > 0 && (
                    <div className="pt-1 border-t border-border/60">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1.5">Keyword signals</p>
                      <div className="flex flex-wrap gap-1" data-testid="keyword-signals">
                        {seoEngine.keywordTargets.slice(0, 8).map((kw, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-900/50">
                            {kw}
                          </span>
                        ))}
                        {seoEngine.keywordTargets.length > 8 && (
                          <span className="text-[10px] text-muted-foreground">+{seoEngine.keywordTargets.length - 8} more</span>
                        )}
                      </div>
                      {isRebuildScope && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          These keyword signals must be replicated in the new site's page structure and metadata.
                        </p>
                      )}
                    </div>
                  )}
                  {seoEngine.contentGaps?.length > 0 && (
                    <div className="pt-1 border-t border-border/60">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Content gaps</p>
                      {seoEngine.contentGaps.slice(0, 3).map((gap, i) => (
                        <div key={i} className="flex items-start gap-2 mb-1">
                          <Target className="h-2.5 w-2.5 text-orange-400 shrink-0 mt-0.5" />
                          <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                            {gap.title}
                            {gap.urgency === 'high' && (
                              <span className="ml-1 text-[9px] font-semibold text-red-500 uppercase">high priority</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── ADS ENGINE ─────────────────────────────────────────────────── */}
          {adsEngine && (
            <>
              {(websiteEngine || gbpEngine || seoEngine) && <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />}
              <div className="space-y-2">
                <SectionHeader icon={TrendingUp} title="Ads Engine" color="text-orange-500" />
                <div className="rounded-lg border border-border bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 mt-1 ${adsBarColor}`} />
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{adsEngine.summary}</span>
                  </div>
                  <ScoreBar score={adsEngine.readinessScore} label="Ads readiness score" color={adsBarColor} />
                  {adsEngine.recommendedMonthlyBudget > 0 && (
                    <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-border/60">
                      <StatChip
                        label="Recommended budget"
                        value={`$${adsEngine.recommendedMonthlyBudget.toLocaleString()}/mo`}
                        color="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40 text-orange-800 dark:text-orange-300"
                      />
                      {adsEngine.expectedMonthlyLeads && (
                        <StatChip
                          label="Est. monthly leads"
                          value={adsEngine.expectedMonthlyLeads}
                          color="bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300"
                        />
                      )}
                      {adsEngine.expectedCPL && (
                        <StatChip
                          label="Est. CPL"
                          value={adsEngine.expectedCPL}
                          color="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                        />
                      )}
                    </div>
                  )}
                  {adsEngine.quickWins?.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-border/60">
                      {adsEngine.quickWins.slice(0, 2).map((w, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <Zap className="h-3 w-3 text-orange-400 shrink-0 mt-0.5" />
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── SEO PRESERVATION CHECKLIST ────────────────────────────────── */}
          {isRebuildScope && preservationItems.length > 0 && (
            <>
              {hasEngineData && <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />}
              <div className="space-y-3">
                <SectionHeader icon={Shield} title="SEO Preservation Checklist" color="text-amber-500" />
                <div className="space-y-2" data-testid="seo-preservation-checklist">
                  {preservationItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <PreservationTag type={item.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">{item.label}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">{item.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                  This checklist informs the website brief and page structure generation. The Website Strategist agent uses this context automatically.
                </p>
              </div>
            </>
          )}

          {/* ── BUSINESS CONTEXT ──────────────────────────────────────────── */}
          {si?.strategyIntelligence?.businessOverview && (
            <>
              {(hasEngineData || isRebuildScope) && <div className="w-full h-px bg-slate-100 dark:bg-slate-700/60" />}
              <div className="space-y-2">
                <SectionHeader icon={Info} title="Business Context" color="text-indigo-500" />
                <div className="rounded-lg bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 p-3 space-y-1.5">
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{si.strategyIntelligence.businessOverview}</p>
                  {si.strategyIntelligence.coreServices && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-500">
                      <span className="font-semibold">Core services: </span>{si.strategyIntelligence.coreServices}
                    </p>
                  )}
                  {si.strategyIntelligence.targetLocations && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-500">
                      <span className="font-semibold">Target areas: </span>{si.strategyIntelligence.targetLocations}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}
