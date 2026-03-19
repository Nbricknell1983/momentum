import { useState } from 'react';
import { format } from 'date-fns';
import { Phone, Globe, MapPin, Users, TrendingUp, AlertTriangle, CheckCircle2, MessageSquare, Lightbulb, HelpCircle, ChevronDown, ChevronUp, RotateCcw, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PresenceSnapshot {
  website: string;
  gbp: string;
  social: string;
  searchVisibility: string;
}

export interface PrepCallPack {
  businessSnapshot: string;
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
  businessName: string;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

const CONFIDENCE_STYLES = {
  high: { bg: 'bg-green-500/10 border-green-500/30', text: 'text-green-400', label: 'High confidence' },
  medium: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-400', label: 'Medium confidence' },
  low: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-400', label: 'Low confidence — check missing data' },
};

function PresenceTile({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className={`rounded-lg p-3 border ${color} space-y-1.5`}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 opacity-70" />
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <p className="text-xs leading-relaxed">{value}</p>
    </div>
  );
}

export function PrepCallPackCard({ pack, businessName, onRegenerate, isRegenerating }: PrepCallPackCardProps) {
  const [showMissing, setShowMissing] = useState(false);
  const conf = CONFIDENCE_STYLES[pack.confidence] || CONFIDENCE_STYLES.medium;
  const genDate = pack.generatedAt ? format(new Date(pack.generatedAt), 'dd/MM/yyyy HH:mm') : '';

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
            <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-600 dark:text-amber-400" onClick={onRegenerate} disabled={isRegenerating} data-testid="button-regen-prep-pack" title="Regenerate prep pack">
              {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Business snapshot */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1.5">Business Snapshot</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{pack.businessSnapshot}</p>
        </div>

        {/* Presence snapshot — 2x2 grid */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">Presence Snapshot</p>
          <div className="grid grid-cols-2 gap-2">
            <PresenceTile icon={Globe} label="Website" value={pack.presenceSnapshot?.website || 'Not assessed'} color="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300" />
            <PresenceTile icon={MapPin} label="GBP / Maps" value={pack.presenceSnapshot?.gbp || 'Not assessed'} color="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300" />
            <PresenceTile icon={Users} label="Social" value={pack.presenceSnapshot?.social || 'Not assessed'} color="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300" />
            <PresenceTile icon={Star} label="Search Visibility" value={pack.presenceSnapshot?.searchVisibility || 'Not assessed'} color="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300" />
          </div>
        </div>

        {/* Opportunities + Gaps */}
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

        {/* Call priorities */}
        {(pack.callPriorities?.length ?? 0) > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">Call Priorities</p>
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

        {/* Discovery questions */}
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

        {/* Commercial angle */}
        {pack.commercialAngle && (
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">Commercial Angle</p>
            </div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200 leading-relaxed">{pack.commercialAngle}</p>
          </div>
        )}

        {/* Missing data notes — collapsible */}
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
