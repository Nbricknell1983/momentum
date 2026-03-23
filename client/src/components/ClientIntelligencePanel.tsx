import { useState } from 'react';
import {
  Brain, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronUp,
  Target, Sparkles, Loader2, Shield, RefreshCw,
  ShieldCheck, Lightbulb,
} from 'lucide-react';
import { Client, ClientIntelligenceBrief } from '@/lib/types';
import { EvidencePresenceSection } from './PrepCallPackCard';

// ─── Channel config ───────────────────────────────────────────────────────────

const CHANNEL_CONFIG = {
  website:       { label: 'Website',       color: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-950/40',     border: 'border-blue-200 dark:border-blue-900/50' },
  seo:           { label: 'SEO',           color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-200 dark:border-violet-900/50' },
  gbp:           { label: 'GBP / Local',   color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-900/50' },
  ads:           { label: 'Ads',           color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-900/50' },
  'cross-channel': { label: 'Cross-channel', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/40', border: 'border-slate-200 dark:border-slate-700' },
};

const IMPACT_CONFIG = {
  high:   { cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300', dot: 'bg-emerald-500' },
  medium: { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',         dot: 'bg-amber-400' },
  low:    { cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400',          dot: 'bg-slate-400' },
};

const SEVERITY_CONFIG = {
  high:   { cls: 'text-red-600 dark:text-red-400',     bg: 'bg-red-50 dark:bg-red-950/30',     border: 'border-red-200 dark:border-red-900/40',     dot: 'bg-red-500' },
  medium: { cls: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-900/40', dot: 'bg-amber-400' },
  low:    { cls: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/40', border: 'border-slate-200 dark:border-slate-700',    dot: 'bg-slate-400' },
};

// ── Resolve presence URLs from ALL known locations on the client record ───────
// Legacy clients may have data in businessProfile, clientOnboarding, or
// sourceIntelligence.prepCallPack rather than top-level fields.

function resolvePresenceUrls(client: Client) {
  const si  = client.sourceIntelligence;
  const pp  = (si?.prepCallPack ?? {}) as Record<string, any>;
  const bp  = client.businessProfile;
  const ob  = client.clientOnboarding;

  // Website: priority order — top-level → sourceIntelligence → onboarding → businessProfile → prepCallPack
  const website =
    client.website?.trim() ||
    si?.website?.trim() ||
    ob?.currentWebsiteUrl?.trim() ||
    bp?.websiteUrl?.trim() ||
    pp?.assetLinks?.websiteUrl?.trim() ||
    pp?.currentWebsiteUrl?.trim() ||
    '';

  // Facebook: top-level → businessProfile → prepCallPack
  const facebook =
    client.facebookUrl?.trim() ||
    bp?.facebookUrl?.trim() ||
    pp?.assetLinks?.facebookUrl?.trim() ||
    pp?.facebookUrl?.trim() ||
    '';

  // Instagram: top-level → businessProfile → prepCallPack
  const instagram =
    client.instagramUrl?.trim() ||
    bp?.instagramUrl?.trim() ||
    pp?.assetLinks?.instagramUrl?.trim() ||
    pp?.instagramUrl?.trim() ||
    '';

  // LinkedIn: top-level → prepCallPack
  const linkedin =
    client.linkedinUrl?.trim() ||
    pp?.assetLinks?.linkedinUrl?.trim() ||
    pp?.linkedinUrl?.trim() ||
    '';

  // GBP: direct link (resource name) → businessProfile URL → channel active
  const gbpLinked = !!client.gbpLocationName;
  const gbpUrl    = bp?.gbpUrl?.trim() || '';
  const gbpChannelActive = !!(client.channelStatus?.gbp && client.channelStatus.gbp !== 'not_started');

  return { website, facebook, instagram, linkedin, gbpLinked, gbpUrl, gbpChannelActive };
}

// ─── Build evidence bundle for EvidencePresenceSection ───────────────────────
// Prefer the original scraped evidence bundle from prepCallPack; fall back to
// a synthetic one constructed from engine data and resolved presence URLs.

function buildPresenceEvidence(client: Client, pv: ReturnType<typeof resolvePresenceUrls>) {
  const si  = client.sourceIntelligence;
  const pp  = (si?.prepCallPack ?? {}) as Record<string, any>;
  const bp  = client.businessProfile;
  const se  = client.seoEngine;

  // Prefer the original scraped evidence bundle — same shape as lead workspace.
  // Check in priority order:
  //   1. si.evidenceBundle           → set during conversion from lead.evidenceBundle (new path)
  //   2. pp.evidenceBundle           → legacy path (evidenceBundle embedded in prepCallPack object)
  //   3. (client as any).evidenceBundle → top-level client field (backfill from server)
  const rawEb =
    si?.evidenceBundle ??
    pp.evidenceBundle ??
    (client as any).evidenceBundle ??
    null;

  if (rawEb) {
    return {
      eb: rawEb,
      serp: si?.serpData ?? pp.serpData ?? null,
      ebGatheredAt: rawEb.gatheredAt ?? pp.ebGatheredAt ?? pp.gatheredAt ?? null,
      serpGeneratedAt: pp.serpGeneratedAt ?? null,
      aiGeneratedAt: pp.aiGeneratedAt ?? null,
      sitemapPageCount: pp.sitemapPages?.length ?? pp.sitemapPageCount ?? rawEb.sitemapPageCount ?? 0,
      psAi: pp.presenceSnapshot ?? pp.aiSnapshot ?? null,
      delta: si?.evidenceDelta ?? (client as any).evidenceDelta ?? null,
      deltaPrevGatheredAt: (client as any).evidenceDeltaPrevGatheredAt ?? null,
    };
  }

  // No raw bundle — synthesise from resolved presence fields + engine data
  const website = pv.website ? {
    url: pv.website,
    hasHttps: pv.website.startsWith('https'),
    hasSitemap: undefined,
    hasSchema: undefined,
    phoneNumbers: [],
    ctaSignals: [],
    servicePageUrls: [],
    trustSignals: [],
    serviceKeywords: se?.keywordTargets?.slice(0, 8) ?? [],
    locationKeywords: bp?.primaryLocations?.slice(0, 5) ?? [],
    conversionGaps: [],
  } : null;

  const gbpName = (client as any).gbpLocationName;
  const gbp = (gbpName || pv.gbpUrl) ? {
    name: gbpName,
    mapsUrl: pv.gbpUrl || undefined,
    placeId: undefined,
    rating: undefined,
    totalRatings: undefined,
    category: bp?.primaryServices?.[0],
    isOpen: undefined,
    editorialSummary: undefined,
    networkSummary: undefined,
  } : null;

  const hasSocial = !!(pv.facebook || pv.instagram || pv.linkedin);
  const social = hasSocial ? {
    facebook: pv.facebook ? { url: pv.facebook, data: { url: pv.facebook } } : null,
    instagram: pv.instagram ? { url: pv.instagram, data: { url: pv.instagram } } : null,
    linkedin: pv.linkedin ? { url: pv.linkedin, data: { url: pv.linkedin } } : null,
    twitter: null,
  } : null;

  const hasAny = !!(website || gbp || social);
  return {
    eb: hasAny ? { website, gbp, social, paidSearch: null } : null,
    serp: null,
    ebGatheredAt: null,
    serpGeneratedAt: null,
    aiGeneratedAt: null,
    sitemapPageCount: 0,
    psAi: null,
    delta: null,
    deltaPrevGatheredAt: null,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: keyof typeof CHANNEL_CONFIG }) {
  const cfg = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG['cross-channel'];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{children}</p>
  );
}

function BulletRow({ icon: Icon, iconColor, text }: { icon: typeof CheckCircle2; iconColor: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className={`h-3 w-3 ${iconColor} shrink-0 mt-0.5`} />
      <span className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{text}</span>
    </div>
  );
}

// ─── Brief analysis sections ──────────────────────────────────────────────────

function OpportunityCard({ title, impact, channel, rationale }: {
  title: string;
  impact: 'high' | 'medium' | 'low';
  channel: keyof typeof CHANNEL_CONFIG;
  rationale: string;
}) {
  const imp = IMPACT_CONFIG[impact] ?? IMPACT_CONFIG.medium;
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20">
      <div className={`h-2 w-2 rounded-full ${imp.dot} shrink-0 mt-1.5`} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${imp.cls}`}>{impact}</span>
          <ChannelBadge channel={channel} />
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{rationale}</p>
      </div>
    </div>
  );
}

function RiskCard({ title, severity, type, detail }: {
  title: string;
  severity: 'high' | 'medium' | 'low';
  type: string;
  detail: string;
}) {
  const sev = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.medium;
  const typeLabel = type === 'preservation' ? 'Preservation' : type === 'migration' ? 'Migration' : type === 'missed-revenue' ? 'Revenue gap' : 'Gap';
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${sev.bg} ${sev.border}`}>
      <div className={`h-2 w-2 rounded-full ${sev.dot} shrink-0 mt-1.5`} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</span>
          <span className={`text-[10px] font-semibold ${sev.cls}`}>{severity}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">{typeLabel}</span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

function PriorityRow({ priority, action, channel, why }: {
  priority: number;
  action: string;
  channel: keyof typeof CHANNEL_CONFIG;
  why: string;
}) {
  const cfg = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG['cross-channel'];
  return (
    <div className="flex items-start gap-3">
      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
        {priority}
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{action}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{why}</p>
      </div>
      <ChannelBadge channel={channel} />
    </div>
  );
}

// ─── Analysis loading (shown while brief generates — presence grid still visible) ──

function AnalysisLoadingSkeleton() {
  return (
    <div className="px-4 pt-2 pb-4 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin shrink-0" />
        <span className="text-xs text-slate-500 dark:text-slate-400">Synthesising strategic intelligence…</span>
      </div>
      {[75, 55, 85, 65].map((w, i) => (
        <div key={i} className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

// ─── Main content (presence + brief) ─────────────────────────────────────────

function IntelligenceContent({
  client,
  brief,
  briefRunning,
  onRefresh,
}: {
  client: Client;
  brief: ClientIntelligenceBrief | undefined;
  briefRunning: boolean;
  onRefresh?: () => void;
}) {
  const pv    = resolvePresenceUrls(client);
  const pres  = buildPresenceEvidence(client, pv);

  const wi = brief?.websiteInterpretation;
  const mc = brief?.marketContext;
  const es = brief?.executionStrategy;

  // Overall readout from the AI brief's presenceSnapshot
  const ps = brief?.presenceSnapshot;

  return (
    <div className="space-y-0">

      {/* TAKEOVER BANNER */}
      {brief?.isTakeover && (
        <div className="mx-4 mt-4 mb-2 flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Website Takeover — SEO Preservation Required</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">
              Existing website detected. Execution must protect SEO equity, URL structure, and GBP linkage. Review risks below before rebuild begins.
            </p>
          </div>
        </div>
      )}

      {/* Overall readout from AI */}
      {ps?.overallReadout && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed italic">{ps.overallReadout}</p>
        </div>
      )}

      {/* ── PRESENCE INTELLIGENCE — evidence-backed, same depth as lead ─────── */}
      {pres.eb && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Current Digital Presence</SectionLabel>
            {(client.sourceIntelligence?.evidenceBundle ||
              (client.sourceIntelligence?.prepCallPack as any)?.evidenceBundle ||
              (client as any).evidenceBundle) ? (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                Evidence-backed
              </span>
            ) : (
              <span className="text-[9px] text-slate-400 dark:text-slate-500 italic">From known signals</span>
            )}
          </div>
          <EvidencePresenceSection
            eb={pres.eb}
            psAi={pres.psAi}
            serp={pres.serp}
            ebGatheredAt={pres.ebGatheredAt}
            serpGeneratedAt={pres.serpGeneratedAt}
            aiGeneratedAt={pres.aiGeneratedAt}
            delta={pres.delta}
            deltaPrevGatheredAt={pres.deltaPrevGatheredAt}
            sitemapPageCount={pres.sitemapPageCount}
          />
        </div>
      )}

      {/* ── AI ANALYSIS — loads after brief generates ───────────────────── */}
      {briefRunning && !brief ? (
        <>
          <div className="mx-4 my-2 h-px bg-slate-100 dark:bg-slate-800" />
          <AnalysisLoadingSkeleton />
        </>
      ) : brief ? (
        <>
          {/* Market Context */}
          {mc && (
            <>
              <div className="mx-4 my-2 h-px bg-slate-100 dark:bg-slate-800" />
              <div className="px-4 pb-1">
                <SectionLabel>Customer & Market Context</SectionLabel>
                <div className="rounded-lg border border-border bg-indigo-50/60 dark:bg-indigo-950/20 p-3 space-y-2">
                  {mc.targetCustomer && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">Target Customer</p>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">{mc.targetCustomer}</p>
                    </div>
                  )}
                  {mc.searchIntentThemes?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1.5">Search Intent</p>
                      <div className="flex flex-wrap gap-1.5">
                        {mc.searchIntentThemes.map((t, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {mc.commercialContext && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">Commercial Context</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{mc.commercialContext}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Website Interpretation */}
          {wi && (
            <>
              <div className="mx-4 my-2 h-px bg-slate-100 dark:bg-slate-800" />
              <div className="px-4 pb-1">
                <SectionLabel>Website Interpretation</SectionLabel>
                <div className="space-y-2">
                  {wi.workingWell?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">Working well</p>
                      <div className="space-y-1">{wi.workingWell.map((item, i) => <BulletRow key={i} icon={CheckCircle2} iconColor="text-emerald-500" text={item} />)}</div>
                    </div>
                  )}
                  {wi.weaknesses?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">Weaknesses</p>
                      <div className="space-y-1">{wi.weaknesses.map((item, i) => <BulletRow key={i} icon={AlertTriangle} iconColor="text-amber-500" text={item} />)}</div>
                    </div>
                  )}
                  {wi.conversionIssues?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mb-1.5">Conversion issues</p>
                      <div className="space-y-1">{wi.conversionIssues.map((item, i) => <BulletRow key={i} icon={Target} iconColor="text-red-400" text={item} />)}</div>
                    </div>
                  )}
                  {wi.seoValueToPreserve?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1.5">SEO value to preserve</p>
                      <div className="space-y-1">{wi.seoValueToPreserve.map((item, i) => <BulletRow key={i} icon={ShieldCheck} iconColor="text-violet-500" text={item} />)}</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Opportunities */}
          {brief.opportunities?.length > 0 && (
            <>
              <div className="mx-4 my-2 h-px bg-slate-100 dark:bg-slate-800" />
              <div className="px-4 pb-1">
                <SectionLabel>Growth Opportunities</SectionLabel>
                <div className="space-y-2">
                  {brief.opportunities.map((opp, i) => (
                    <OpportunityCard key={i} title={opp.title} impact={opp.impact} channel={opp.channel} rationale={opp.rationale} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Risks */}
          {brief.risks?.length > 0 && (
            <>
              <div className="mx-4 my-2 h-px bg-slate-100 dark:bg-slate-800" />
              <div className="px-4 pb-1">
                <SectionLabel>Key Risks & Gaps</SectionLabel>
                <div className="space-y-2">
                  {brief.risks.map((risk, i) => (
                    <RiskCard key={i} title={risk.title} severity={risk.severity} type={risk.type} detail={risk.detail} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Execution Strategy */}
          {es && (
            <>
              <div className="mx-4 my-2 h-px bg-slate-100 dark:bg-slate-800" />
              <div className="px-4 pb-1">
                <SectionLabel>Execution Strategy</SectionLabel>
                <div className="rounded-lg border border-border bg-slate-50 dark:bg-slate-800/40 p-3 space-y-2.5">
                  {es.channelSynergy && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Channel Synergy</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{es.channelSynergy}</p>
                    </div>
                  )}
                  {es.strategy && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Strategy</p>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">{es.strategy}</p>
                    </div>
                  )}
                  {es.keyPrinciple && (
                    <div className="flex items-start gap-2 p-2 rounded bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/50">
                      <Lightbulb className="h-3.5 w-3.5 text-violet-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-semibold text-violet-700 dark:text-violet-400">Key Principle</p>
                        <p className="text-[11px] text-violet-700 dark:text-violet-300 leading-relaxed">{es.keyPrinciple}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Delivery Priorities */}
          {brief.deliveryPriorities?.length > 0 && (
            <>
              <div className="mx-4 my-2 h-px bg-slate-100 dark:bg-slate-800" />
              <div className="px-4 pb-4">
                <SectionLabel>Delivery Priorities</SectionLabel>
                <div className="space-y-3">
                  {brief.deliveryPriorities.map((p, i) => (
                    <PriorityRow key={i} priority={p.priority} action={p.action} channel={p.channel} why={p.why} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Timestamp + refresh hint */}
          <div className="px-4 pb-3">
            <p className="text-[10px] text-slate-400 dark:text-slate-600 italic">
              Intelligence generated {brief.generatedAt ? new Date(brief.generatedAt).toLocaleString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              {onRefresh && <> · <button onClick={onRefresh} className="underline hover:text-slate-500">Refresh</button></>}
            </p>
          </div>
        </>
      ) : (
        /* No brief yet — show a gentle prompt below presence grid */
        <div className="px-4 pb-4 pt-2">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 italic text-center">
            Strategic intelligence generating automatically…
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ClientIntelligencePanelProps {
  client: Client;
  briefRunning: boolean;
  onRefresh?: () => void;
}

export default function ClientIntelligencePanel({
  client,
  briefRunning,
  onRefresh,
}: ClientIntelligencePanelProps) {
  const brief = client.intelligenceBrief;
  const [collapsed, setCollapsed] = useState(false);

  const hasHighRisk = brief?.risks?.some(r => r.severity === 'high') ?? false;
  const isTakeover  = brief?.isTakeover ?? (!!client.website && !!client.activationPlan?.selectedScope?.includes('website'));

  return (
    <div className="rounded-xl border border-border overflow-hidden" data-testid="client-intelligence-panel">

      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-50/80 to-indigo-50/40 dark:from-violet-950/30 dark:to-indigo-950/20 hover:from-violet-100/60 hover:to-indigo-50/60 transition-colors border-b border-violet-100 dark:border-violet-900/40"
        onClick={() => setCollapsed(c => !c)}
        data-testid="intelligence-panel-toggle"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-violet-100 dark:bg-violet-950/60 flex items-center justify-center">
            <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Client Intelligence</p>
              {briefRunning && (
                <span className="flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />Analysing…
                </span>
              )}
              {brief && !briefRunning && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">LIVE</span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {brief ? 'Presence, strategy & execution intelligence' : briefRunning ? 'Building strategic intelligence…' : 'Presence & AI execution intelligence'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTakeover && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">TAKEOVER</span>
          )}
          {hasHighRisk && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
              {brief?.risks?.filter(r => r.severity === 'high').length} HIGH RISK
            </span>
          )}
          {brief && onRefresh && !briefRunning && (
            <button
              onClick={e => { e.stopPropagation(); onRefresh(); }}
              className="p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
              title="Refresh intelligence brief"
              data-testid="intelligence-refresh"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
            </button>
          )}
          {collapsed
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronUp className="h-4 w-4 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="bg-white dark:bg-slate-900/30">
          <IntelligenceContent
            client={client}
            brief={brief}
            briefRunning={briefRunning}
            onRefresh={onRefresh}
          />
        </div>
      )}
    </div>
  );
}
