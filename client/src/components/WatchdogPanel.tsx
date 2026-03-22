import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp, X, Bug, Wrench, ArrowRight } from 'lucide-react';
import type { WatchdogFinding, WatchdogSeverity, WatchdogCategory } from '@/lib/watchdog';

interface WatchdogPanelProps {
  findings: WatchdogFinding[];
  onDismiss: (id: string) => void;
}

const SEVERITY_CONFIG: Record<WatchdogSeverity, {
  border: string;
  bg: string;
  icon: typeof AlertCircle;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}> = {
  high: {
    border: 'border-red-200 dark:border-red-800/50',
    bg: 'bg-red-50 dark:bg-red-950/20',
    icon: AlertCircle,
    iconColor: 'text-red-500 dark:text-red-400',
    badgeBg: 'bg-red-100 dark:bg-red-900/40',
    badgeText: 'text-red-700 dark:text-red-300',
    label: 'High',
  },
  medium: {
    border: 'border-amber-200 dark:border-amber-800/50',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    icon: AlertTriangle,
    iconColor: 'text-amber-500 dark:text-amber-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
    badgeText: 'text-amber-700 dark:text-amber-300',
    label: 'Medium',
  },
  low: {
    border: 'border-blue-200 dark:border-blue-800/50',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    icon: Info,
    iconColor: 'text-blue-500 dark:text-blue-400',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/40',
    badgeText: 'text-blue-700 dark:text-blue-300',
    label: 'Low',
  },
};

const CATEGORY_LABELS: Record<WatchdogCategory, string> = {
  'ui-state-mismatch': 'UI Mismatch',
  'fallback-copy':     'Fallback Copy',
  'orchestration':     'Orchestration',
  'auth':              'Auth',
  'prompt-output':     'Prompt Output',
  'data-pipeline':     'Data Pipeline',
  'workflow-friction': 'Workflow',
};

function FindingCard({ finding, onDismiss }: { finding: WatchdogFinding; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[finding.severity];
  const SeverityIcon = cfg.icon;

  return (
    <div className={`rounded border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <div className="flex items-start gap-2 px-2.5 py-2">
        <SeverityIcon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${cfg.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className={`text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded ${cfg.badgeBg} ${cfg.badgeText}`}>
              {cfg.label}
            </span>
            <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">
              {CATEGORY_LABELS[finding.category]}
            </span>
          </div>
          <p className="text-[11px] font-medium text-foreground leading-snug">{finding.summary}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title={expanded ? 'Collapse' : 'Show details'}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={onDismiss}
            className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-current/10 pt-2">
          {finding.likelyCause && (
            <div>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Likely cause</p>
              <p className="text-[10px] text-foreground/80 leading-relaxed">{finding.likelyCause}</p>
            </div>
          )}
          {finding.recommendedFix && (
            <div>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Recommended fix</p>
              <div className="flex items-start gap-1">
                <Wrench className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[10px] text-foreground/80 leading-relaxed">{finding.recommendedFix}</p>
              </div>
            </div>
          )}
          {finding.evidence && finding.evidence.length > 0 && (
            <div>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Evidence</p>
              <ul className="space-y-0.5">
                {finding.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0 mt-px" />
                    <span className="text-[10px] text-muted-foreground font-mono break-all">{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WatchdogPanel({ findings, onDismiss }: WatchdogPanelProps) {
  const [open, setOpen] = useState(false);

  if (findings.length === 0) return null;

  const highCount   = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;

  const headerColor = highCount > 0
    ? 'text-red-600 dark:text-red-400'
    : mediumCount > 0
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-blue-600 dark:text-blue-400';

  const headerBg = highCount > 0
    ? 'border-red-200 dark:border-red-800/40 bg-red-50/60 dark:bg-red-950/20'
    : mediumCount > 0
    ? 'border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/20'
    : 'border-blue-200 dark:border-blue-800/40 bg-blue-50/60 dark:bg-blue-950/20';

  return (
    <div className={`rounded border ${headerBg} overflow-hidden`} data-testid="watchdog-panel">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Bug className={`h-3.5 w-3.5 shrink-0 ${headerColor}`} />
        <span className={`text-[11px] font-semibold flex-1 ${headerColor}`}>
          Self-audit — {findings.length} finding{findings.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {highCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-red-500 text-white">
              {highCount} high
            </span>
          )}
          {mediumCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-amber-500 text-white">
              {mediumCount} medium
            </span>
          )}
          {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2">
          <p className="text-[9px] text-muted-foreground italic px-0.5">
            Momentum detected these likely issues from observable runtime state. These are inferred — not confirmed bugs.
          </p>
          {findings.map(f => (
            <FindingCard key={f.id} finding={f} onDismiss={() => onDismiss(f.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
