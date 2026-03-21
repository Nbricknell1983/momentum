import { useState } from 'react';
import { format } from 'date-fns';
import {
  Phone, Globe, MapPin, Users, TrendingUp, AlertTriangle, CheckCircle2,
  MessageSquare, Lightbulb, HelpCircle, ChevronDown, ChevronUp,
  RotateCcw, Loader2, Star, Brain, Search, Heart, ShieldCheck, Zap, Monitor, Eye,
  ExternalLink, X as XIcon,
} from 'lucide-react';
import { SiFacebook, SiInstagram, SiLinkedin } from 'react-icons/si';
import { Button } from '@/components/ui/button';

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

export function EvidencePresenceSection({ eb, psAi, serp }: { eb?: any; psAi?: PresenceSnapshot; serp?: any }) {
  const w = eb?.website;
  const gbp = eb?.gbp;
  const soc = eb?.social;

  const hasWebObs = !!w?.url;
  const hasGbpObs = !!gbp?.placeId || !!gbp?.name;
  const hasSocObs = !!(soc?.facebook?.detected || soc?.instagram?.detected || soc?.linkedin?.detected || soc?.twitter?.detected);
  const hasSocData = !!(soc?.facebook || soc?.instagram || soc?.linkedin || soc?.twitter);

  const kwServices: string[] = w?.serviceKeywords?.slice(0, 4) ?? [];
  const kwLocations: string[] = w?.locationKeywords?.slice(0, 4) ?? [];
  const hasKwObs = kwServices.length > 0 || kwLocations.length > 0;

  return (
    <div className="grid grid-cols-2 gap-2">

      {/* ── Website card ── */}
      <div className="rounded-lg border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 px-2.5 py-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            <Globe className="h-2.5 w-2.5" /> Website
          </div>
          {hasWebObs ? <ObsBadge /> : psAi?.website ? <AiBadgeMini /> : null}
        </div>
        {hasWebObs ? (
          <div className="space-y-1">
            <a href={w.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline truncate">
              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{w.url.replace(/^https?:\/\//, '')}</span>
            </a>
            <div className="flex flex-wrap gap-1">
              {[
                w.hasHttps ? { label: 'HTTPS ✓', ok: true } : { label: 'No HTTPS', ok: false },
                w.hasSitemap ? { label: 'Sitemap ✓', ok: true } : { label: 'No sitemap', ok: false },
                w.hasSchema ? { label: 'Schema ✓', ok: true } : null,
              ].filter(Boolean).map((chip: any, i) => (
                <span key={i} className={`text-[9px] px-1 py-0.5 rounded font-medium ${chip.ok ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                  {chip.label}
                </span>
              ))}
            </div>
            {(w.servicePageUrls?.length > 0 || w.locationPageUrls?.length > 0) && (
              <div className="flex gap-2 text-[9px] text-slate-500">
                {w.servicePageUrls?.length > 0 && <span>{w.servicePageUrls.length} service pages</span>}
                {w.locationPageUrls?.length > 0 && <span>{w.locationPageUrls.length} location pages</span>}
              </div>
            )}
            {w.ctaSignals?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {w.ctaSignals.slice(0, 3).map((c: string, i: number) => (
                  <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{c}</span>
                ))}
              </div>
            )}
            {w.conversionGaps?.length > 0 && (
              <div className="space-y-0.5">
                {w.conversionGaps.slice(0, 2).map((g: string, i: number) => (
                  <div key={i} className="flex items-start gap-1 text-[9px] text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" />{g}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : psAi?.website ? (
          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{psAi.website}</p>
        ) : (
          <p className="text-[10px] text-slate-400 italic">No website data gathered</p>
        )}
      </div>

      {/* ── GBP / Maps card ── */}
      <div className="rounded-lg border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 px-2.5 py-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            <MapPin className="h-2.5 w-2.5" /> GBP / Maps
          </div>
          {hasGbpObs ? <ObsBadge /> : psAi?.gbp ? <AiBadgeMini /> : null}
        </div>
        {hasGbpObs ? (
          <div className="space-y-1">
            {(gbp.rating != null || gbp.reviewCount != null) && (
              <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                <Star className="h-2.5 w-2.5 text-amber-500" />
                {gbp.rating != null ? gbp.rating.toFixed(1) : '—'}
                {gbp.reviewCount != null && <span className="font-normal text-slate-500">· {gbp.reviewCount} reviews</span>}
              </div>
            )}
            {gbp.category && <p className="text-[9px] text-slate-500">{gbp.category}</p>}
            <div className="flex items-center gap-1 text-[9px]">
              <span className={`px-1 py-0.5 rounded font-medium ${gbp.isOpen ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
                {gbp.isOpen ? 'Open now' : gbp.isOpen === false ? 'Closed' : 'Hours unknown'}
              </span>
              {gbp.mapsUrl && (
                <a href={gbp.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5">
                  <ExternalLink className="h-2 w-2" /> Maps
                </a>
              )}
            </div>
            {gbp.editorialSummary && (
              <p className="text-[9px] text-slate-500 italic leading-snug line-clamp-2">"{gbp.editorialSummary}"</p>
            )}
            {gbp.healthNotes?.length > 0 && (
              <div className="space-y-0.5">
                {gbp.healthNotes.slice(0, 2).map((n: string, i: number) => (
                  <div key={i} className="flex items-start gap-1 text-[9px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-2.5 w-2.5 mt-0.5 shrink-0" />{n}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : psAi?.gbp ? (
          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{psAi.gbp}</p>
        ) : (
          <p className="text-[10px] text-slate-400 italic">No GBP data gathered</p>
        )}
      </div>

      {/* ── Social card ── */}
      <div className="rounded-lg border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 px-2.5 py-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            <Users className="h-2.5 w-2.5" /> Social
          </div>
          {hasSocData ? <ObsBadge /> : psAi?.social ? <AiBadgeMini /> : null}
        </div>
        {hasSocData ? (
          <div className="space-y-1">
            {[
              { key: 'facebook',  label: 'Facebook',  icon: SiFacebook,  data: soc?.facebook },
              { key: 'instagram', label: 'Instagram', icon: SiInstagram, data: soc?.instagram },
              { key: 'linkedin',  label: 'LinkedIn',  icon: SiLinkedin,  data: soc?.linkedin },
              { key: 'twitter',   label: 'X / Twitter', icon: XIcon,    data: soc?.twitter },
            ].map(({ key, label, icon: Icon, data }) => (
              <div key={key} className="flex items-center gap-1.5 text-[10px]">
                <Icon className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                {data?.detected ? (
                  data.url ? (
                    <a href={data.url} target="_blank" rel="noopener noreferrer"
                      className="text-green-700 dark:text-green-300 hover:underline flex items-center gap-0.5 font-medium">
                      {label} <ExternalLink className="h-2 w-2" />
                    </a>
                  ) : (
                    <span className="text-green-700 dark:text-green-300 font-medium">{label} ✓</span>
                  )
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">{label} — not found</span>
                )}
              </div>
            ))}
          </div>
        ) : psAi?.social ? (
          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{psAi.social}</p>
        ) : (
          <p className="text-[10px] text-slate-400 italic">No social data gathered</p>
        )}
      </div>

      {/* ── Search Visibility card ── */}
      <div className="rounded-lg border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 px-2.5 py-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
            <Search className="h-2.5 w-2.5" /> Search Visibility
          </div>
          {hasKwObs ? <ObsBadge /> : psAi?.searchVisibility ? <AiBadgeMini /> : null}
        </div>
        {hasKwObs ? (
          <div className="space-y-1.5">
            {kwServices.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Services detected</p>
                <div className="flex flex-wrap gap-1">
                  {kwServices.map((k: string, i: number) => (
                    <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">{k}</span>
                  ))}
                </div>
              </div>
            )}
            {kwLocations.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Locations detected</p>
                <div className="flex flex-wrap gap-1">
                  {kwLocations.map((k: string, i: number) => (
                    <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">{k}</span>
                  ))}
                </div>
              </div>
            )}
            {serp?.competitors?.length > 0 && (
              <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-1 mb-0.5">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Top competitors</p>
                  <EstBadge />
                </div>
                <div className="space-y-0.5">
                  {serp.competitors.slice(0, 2).map((c: any, i: number) => (
                    <p key={i} className="text-[9px] text-slate-500 truncate">· {c.name || c}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : psAi?.searchVisibility ? (
          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{psAi.searchVisibility}</p>
        ) : (
          <p className="text-[10px] text-slate-400 italic">No search visibility data</p>
        )}
      </div>

    </div>
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

export function PrepCallPackCard({ pack, businessName, evidenceBundle, onRegenerate, isRegenerating }: PrepCallPackCardProps) {
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
