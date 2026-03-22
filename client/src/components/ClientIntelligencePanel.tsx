import { useState } from 'react';
import {
  Brain, Globe, MapPin, Search, Layers, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronUp,
  Target, Sparkles, Loader2, Shield, RefreshCw,
  BarChart3, ShieldCheck, Lightbulb, ExternalLink,
} from 'lucide-react';
import { SiFacebook, SiInstagram, SiLinkedin } from 'react-icons/si';
import { Client, ClientIntelligenceBrief } from '@/lib/types';

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

// ─── Derive presence signals directly from client record fields ───────────────
// This is deterministic and always accurate — never shows "no signals detected"
// for data we actually have on the record.

interface LocalPresence {
  website: LocalSignal[];
  gbp: LocalSignal[];
  search: LocalSignal[];
  social: LocalSignal[];
  paidSearch: LocalSignal[];
}

interface LocalSignal {
  text: string;
  status: 'confirmed' | 'active' | 'incomplete';
  url?: string;
}

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

function deriveLocalPresence(client: Client): LocalPresence {
  const cs  = client.channelStatus ?? {};
  const pv  = resolvePresenceUrls(client);
  const we  = client.websiteEngine;

  // ── Website ──
  const webSignals: LocalSignal[] = [];
  if (pv.website) {
    const href = pv.website.startsWith('http') ? pv.website : `https://${pv.website}`;
    webSignals.push({ text: `Site confirmed: ${pv.website}`, status: 'confirmed', url: href });
    if (we) {
      webSignals.push({
        text: `Health: ${we.healthScore}/100 — ${we.healthLabel}`,
        status: (we.healthLabel === 'critical' || we.healthLabel === 'needs-work') ? 'incomplete' : 'active',
      });
      if (we.conversionGrade) webSignals.push({ text: `Conversion grade: ${we.conversionGrade}`, status: 'active' });
    } else {
      webSignals.push({ text: 'Full audit not yet run', status: 'incomplete' });
    }
  } else {
    webSignals.push({ text: 'Website not yet on record — check channels', status: 'incomplete' });
  }

  // ── GBP / Local ──
  const gbpSignals: LocalSignal[] = [];
  if (pv.gbpLinked) {
    gbpSignals.push({ text: 'GBP profile linked', status: 'confirmed' });
  } else if (pv.gbpUrl) {
    gbpSignals.push({ text: `GBP URL on record`, status: 'confirmed', url: pv.gbpUrl });
  }
  if (pv.gbpChannelActive) {
    gbpSignals.push({ text: `GBP channel: ${cs.gbp!.replace(/_/g, ' ')}`, status: 'active' });
  }
  if (client.gbpEngine) {
    gbpSignals.push({ text: `Profile score: ${client.gbpEngine.optimizationScore}/100`, status: 'active' });
    if (client.gbpEngine.reviewGrade) gbpSignals.push({ text: `Reviews grade: ${client.gbpEngine.reviewGrade}`, status: 'active' });
  }
  if (gbpSignals.length === 0) {
    gbpSignals.push({ text: 'GBP not yet linked or verified', status: 'incomplete' });
  } else if (!client.gbpEngine) {
    gbpSignals.push({ text: 'Full GBP audit not yet run', status: 'incomplete' });
  }

  // ── Search ──
  const searchSignals: LocalSignal[] = [];
  if (client.seoEngine) {
    searchSignals.push({ text: `SEO visibility: ${client.seoEngine.visibilityScore}/100`, status: 'active' });
    if (client.seoEngine.keywordTargets?.length) {
      searchSignals.push({ text: `Keywords: ${client.seoEngine.keywordTargets.slice(0, 3).join(', ')}`, status: 'active' });
    }
  } else if (cs.seo && cs.seo !== 'not_started') {
    searchSignals.push({ text: `SEO channel: ${cs.seo.replace(/_/g, ' ')}`, status: 'active' });
    searchSignals.push({ text: 'Full SEO audit not yet run', status: 'incomplete' });
  } else if (pv.website) {
    searchSignals.push({ text: 'Organic search baseline not yet audited', status: 'incomplete' });
  } else {
    searchSignals.push({ text: 'No website — search indexing not applicable', status: 'incomplete' });
  }

  // ── Social ──
  const socialSignals: LocalSignal[] = [];
  if (pv.facebook) socialSignals.push({ text: 'Facebook', status: 'confirmed', url: pv.facebook });
  if (pv.instagram) socialSignals.push({ text: 'Instagram', status: 'confirmed', url: pv.instagram });
  if (pv.linkedin) socialSignals.push({ text: 'LinkedIn', status: 'confirmed', url: pv.linkedin });
  if (socialSignals.length === 0) {
    socialSignals.push({ text: 'Social profiles not yet linked', status: 'incomplete' });
  }

  // ── Paid search ──
  const paidSearchSignals: LocalSignal[] = [];
  if (client.adsEngine) {
    paidSearchSignals.push({ text: `Ads readiness: ${client.adsEngine.readinessScore}/100`, status: 'active' });
  } else if (cs.ads && cs.ads !== 'not_started') {
    paidSearchSignals.push({ text: `Paid search channel: ${cs.ads.replace(/_/g, ' ')}`, status: 'active' });
  } else {
    paidSearchSignals.push({ text: 'Paid search not yet assessed', status: 'incomplete' });
  }

  return { website: webSignals, gbp: gbpSignals, search: searchSignals, social: socialSignals, paidSearch: paidSearchSignals };
}

// ─── Merge AI brief signals with local derived signals ────────────────────────
// Brief signals from AI augment the deterministic ones; never replace them.

function mergeSignals(local: LocalSignal[], briefSignals: string[] | undefined): LocalSignal[] {
  const merged = [...local];
  if (briefSignals?.length) {
    const localTexts = new Set(local.map(s => s.text.toLowerCase()));
    for (const bs of briefSignals) {
      if (!bs) continue;
      const isAlreadyCovered = [...localTexts].some(t => bs.toLowerCase().includes(t.slice(0, 20)) || t.includes(bs.toLowerCase().slice(0, 20)));
      if (!isAlreadyCovered) {
        merged.push({ text: bs, status: 'active' });
      }
    }
  }
  return merged;
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

// ─── Presence channel card ────────────────────────────────────────────────────

function PresenceChannelCard({ icon: Icon, iconColor, label, signals, socialSlots }: {
  icon: typeof Globe;
  iconColor: string;
  label: string;
  signals: LocalSignal[];
  socialSlots?: { fb?: string; ig?: string; li?: string };
}) {
  const all = signals.filter(Boolean);
  const hasConfirmed = all.some(s => s.status === 'confirmed' || s.status === 'active');

  return (
    <div className={`rounded-lg border p-2.5 space-y-1.5 ${hasConfirmed ? 'border-border bg-slate-50/80 dark:bg-slate-800/40' : 'border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-800/20 opacity-70'}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        {hasConfirmed && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ml-auto" title="Presence confirmed" />}
      </div>

      {/* Social platforms as inline icons */}
      {socialSlots && (
        <div className="flex items-center gap-2">
          {socialSlots.fb ? (
            <a href={socialSlots.fb} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-blue-700 dark:text-blue-400 hover:underline">
              <SiFacebook className="h-3 w-3" />FB
            </a>
          ) : <span className="text-[11px] text-slate-300 dark:text-slate-600 flex items-center gap-1"><SiFacebook className="h-3 w-3" />FB</span>}
          {socialSlots.ig ? (
            <a href={socialSlots.ig} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-pink-600 dark:text-pink-400 hover:underline">
              <SiInstagram className="h-3 w-3" />IG
            </a>
          ) : <span className="text-[11px] text-slate-300 dark:text-slate-600 flex items-center gap-1"><SiInstagram className="h-3 w-3" />IG</span>}
          {socialSlots.li ? (
            <a href={socialSlots.li} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 hover:underline">
              <SiLinkedin className="h-3 w-3" />LI
            </a>
          ) : <span className="text-[11px] text-slate-300 dark:text-slate-600 flex items-center gap-1"><SiLinkedin className="h-3 w-3" />LI</span>}
        </div>
      )}

      {/* Signal rows */}
      <ul className="space-y-0.5">
        {all.slice(0, 3).map((s, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${s.status === 'confirmed' ? 'bg-emerald-400' : s.status === 'active' ? 'bg-blue-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline truncate flex items-center gap-0.5">
                {s.text} <ExternalLink className="h-2 w-2 shrink-0" />
              </a>
            ) : (
              <span className={`text-[11px] leading-relaxed ${s.status === 'incomplete' ? 'text-slate-400 dark:text-slate-500 italic' : 'text-slate-600 dark:text-slate-400'}`}>
                {s.text}
              </span>
            )}
          </li>
        ))}
      </ul>
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
  const local = deriveLocalPresence(client);
  const pv    = resolvePresenceUrls(client);   // for direct URL links
  const ps    = brief?.presenceSnapshot;

  // Merge: local deterministic signals take precedence; brief signals augment
  const websiteSignals  = mergeSignals(local.website,    ps?.websiteSignals);
  const gbpSignals      = mergeSignals(local.gbp,        ps?.gbpSignals);
  const searchSignals   = mergeSignals(local.search,     ps?.searchSignals);
  const socialSignals   = mergeSignals(local.social,     ps?.socialSignals);

  const wi = brief?.websiteInterpretation;
  const mc = brief?.marketContext;
  const es = brief?.executionStrategy;

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

      {/* Overall readout */}
      {ps?.overallReadout && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed italic">{ps.overallReadout}</p>
        </div>
      )}

      {/* ── PRESENCE SNAPSHOT — always visible, always accurate ────────────── */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Current Digital Presence</SectionLabel>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />confirmed
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 ml-1" />active
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600 ml-1" />unverified
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <PresenceChannelCard
            icon={Globe}
            iconColor="text-blue-500"
            label="Website"
            signals={websiteSignals}
          />
          <PresenceChannelCard
            icon={MapPin}
            iconColor="text-emerald-500"
            label="GBP / Local"
            signals={gbpSignals}
          />
          <PresenceChannelCard
            icon={Search}
            iconColor="text-violet-500"
            label="Search"
            signals={searchSignals}
          />
          <PresenceChannelCard
            icon={Layers}
            iconColor="text-slate-400"
            label="Social"
            signals={socialSignals}
            socialSlots={{
              fb: pv.facebook || undefined,
              ig: pv.instagram || undefined,
              li: pv.linkedin || undefined,
            }}
          />
        </div>
        {/* Paid search strip */}
        {local.paidSearch[0]?.status !== 'incomplete' && (
          <div className="mt-2 rounded-lg border border-border bg-slate-50/80 dark:bg-slate-800/40 px-3 py-2 flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            <span className="text-[11px] text-slate-600 dark:text-slate-400">{local.paidSearch[0]?.text}</span>
          </div>
        )}
      </div>

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
