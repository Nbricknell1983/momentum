import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PresenceInsightDetail, InsightStatus } from '@/lib/presenceInsights';

// ── Status styles ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<InsightStatus, { badge: string; dot: string }> = {
  positive: {
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40',
    dot: 'text-emerald-500',
  },
  warning: {
    badge: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800/40',
    dot: 'text-amber-500',
  },
  neutral: {
    badge: 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    dot: 'text-slate-400',
  },
  negative: {
    badge: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800/40',
    dot: 'text-red-500',
  },
};

const STATUS_LABEL: Record<InsightStatus, string> = {
  positive: 'Good',
  warning:  'Needs attention',
  neutral:  'Observed',
  negative: 'Issue found',
};

// ── Evidence item renderer ─────────────────────────────────────────────────

function EvidenceRow({ item }: { item: { label?: string; value: string; type?: string } }) {
  if (item.type === 'link') {
    return (
      <div className="flex items-start gap-2 text-[11px]">
        {item.label && <span className="text-muted-foreground w-28 shrink-0">{item.label}</span>}
        <a
          href={item.value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 break-all min-w-0"
        >
          {item.value.length > 55 ? item.value.slice(0, 55) + '…' : item.value}
          <ExternalLink className="h-2.5 w-2.5 shrink-0 ml-0.5" />
        </a>
      </div>
    );
  }
  if (item.type === 'count') {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        {item.label && <span className="text-muted-foreground w-28 shrink-0">{item.label}</span>}
        <span className="font-semibold text-foreground tabular-nums">{item.value}</span>
      </div>
    );
  }
  if (item.type === 'code') {
    return (
      <div className="flex items-start gap-2 text-[11px]">
        {item.label && <span className="text-muted-foreground w-28 shrink-0">{item.label}</span>}
        <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px] text-foreground break-all">{item.value}</code>
      </div>
    );
  }
  // default: text
  return (
    <div className="flex items-start gap-2 text-[11px]">
      {item.label && <span className="text-muted-foreground w-28 shrink-0">{item.label}</span>}
      <span className="text-foreground flex-1">{item.value}</span>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────

interface PresenceInsightModalProps {
  detail: PresenceInsightDetail | null;
  open: boolean;
  onClose: () => void;
}

export function PresenceInsightModal({ detail, open, onClose }: PresenceInsightModalProps) {
  const [showTech, setShowTech] = useState(false);

  if (!detail) return null;

  const cfg = STATUS_CONFIG[detail.status];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-sm font-semibold leading-snug text-foreground pr-6">
                {detail.title ?? detail.label}
              </DialogTitle>
            </div>
          </div>
          <div className="mt-1.5">
            <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>
              {STATUS_LABEL[detail.status]}
            </span>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">

          {/* Summary */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
            <p className="text-[13px] text-foreground leading-relaxed">{detail.summary}</p>
          </div>

          {/* Why it matters */}
          {detail.whyItMatters && (
            <div className="rounded-lg bg-muted/50 border border-border px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Why it matters</p>
              <p className="text-[12px] text-foreground/80 leading-relaxed">{detail.whyItMatters}</p>
            </div>
          )}

          {/* Evidence */}
          {detail.evidence && detail.evidence.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Evidence</p>
              <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 px-3.5 py-3">
                {detail.evidence.map((item, i) => (
                  <EvidenceRow key={i} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Recommended improvement */}
          {detail.recommendedImprovement && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Recommended improvement</p>
              <div className="flex items-start gap-2">
                <span className="text-violet-500 mt-0.5 shrink-0 text-[11px]">→</span>
                <p className="text-[12px] text-foreground leading-relaxed">{detail.recommendedImprovement}</p>
              </div>
            </div>
          )}

          {/* Technical details (collapsible) */}
          {detail.technicalDetails && detail.technicalDetails.length > 0 && (
            <div className="border-t pt-3">
              <button
                onClick={() => setShowTech(t => !t)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {showTech ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Technical details
              </button>
              {showTech && (
                <div className="mt-2 rounded border border-dashed border-border bg-muted/20 px-3 py-2 space-y-0.5">
                  {detail.technicalDetails.map((d, i) => (
                    <p key={i} className="text-[10px] font-mono text-muted-foreground">{d}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
