import { useState } from 'react';
import {
  AlertCircle, AlertTriangle, Info,
  ChevronDown, ChevronUp, X, Bug, Wrench, ArrowRight, Layers,
} from 'lucide-react';
import type { WatchdogFinding, WatchdogSeverity, WatchdogCategory } from '@/lib/watchdog';
import { groupWatchdogFindings } from '@/lib/watchdog';

interface WatchdogPanelProps {
  findings: WatchdogFinding[];
  onDismiss: (id: string) => void;
  onDismissGroup: (ids: string[]) => void;
}

const SEVERITY_CONFIG: Record<WatchdogSeverity, {
  border: string;
  bg: string;
  childBorder: string;
  childBg: string;
  icon: typeof AlertCircle;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}> = {
  high: {
    border: 'border-red-200 dark:border-red-800/50',
    bg: 'bg-red-50/70 dark:bg-red-950/20',
    childBorder: 'border-red-200/60 dark:border-red-800/30',
    childBg: 'bg-red-50/40 dark:bg-red-950/10',
    icon: AlertCircle,
    iconColor: 'text-red-500 dark:text-red-400',
    badgeBg: 'bg-red-100 dark:bg-red-900/40',
    badgeText: 'text-red-700 dark:text-red-300',
    label: 'High',
  },
  medium: {
    border: 'border-amber-200 dark:border-amber-800/50',
    bg: 'bg-amber-50/70 dark:bg-amber-950/20',
    childBorder: 'border-amber-200/60 dark:border-amber-800/30',
    childBg: 'bg-amber-50/40 dark:bg-amber-950/10',
    icon: AlertTriangle,
    iconColor: 'text-amber-500 dark:text-amber-400',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/40',
    badgeText: 'text-amber-700 dark:text-amber-300',
    label: 'Medium',
  },
  low: {
    border: 'border-blue-200 dark:border-blue-800/50',
    bg: 'bg-blue-50/70 dark:bg-blue-950/20',
    childBorder: 'border-blue-200/60 dark:border-blue-800/30',
    childBg: 'bg-blue-50/40 dark:bg-blue-950/10',
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

// ── Child finding row ─────────────────────────────────────────────────────────

function ChildFindingRow({
  finding,
  onDismiss,
}: {
  finding: WatchdogFinding;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CONFIG[finding.severity];
  const SeverityIcon = cfg.icon;
  const hasDetail = finding.likelyCause || finding.recommendedFix || (finding.evidence?.length ?? 0) > 0;

  return (
    <div className={`rounded border ${cfg.childBorder} ${cfg.childBg} overflow-hidden`}>
      <div className="flex items-start gap-2 px-2 py-1.5">
        <SeverityIcon className={`h-3 w-3 shrink-0 mt-0.5 ${cfg.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className={`text-[8.5px] font-semibold uppercase tracking-wider px-1 py-px rounded ${cfg.badgeBg} ${cfg.badgeText}`}>
              {cfg.label}
            </span>
            <span className="text-[8.5px] text-muted-foreground/70 uppercase tracking-wider">
              {CATEGORY_LABELS[finding.category]}
            </span>
          </div>
          <p className="text-[10.5px] text-foreground/80 leading-snug">{finding.summary}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {hasDetail && (
            <button
              onClick={() => setOpen(o => !o)}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
              title={open ? 'Hide detail' : 'Show detail'}
            >
              {open ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
            title="Dismiss this finding"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="px-2 pb-2 space-y-1.5 border-t border-current/10 pt-1.5">
          {finding.likelyCause && (
            <div>
              <p className="text-[8.5px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Likely cause</p>
              <p className="text-[10px] text-foreground/75 leading-relaxed">{finding.likelyCause}</p>
            </div>
          )}
          {finding.recommendedFix && (
            <div>
              <p className="text-[8.5px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Fix</p>
              <div className="flex items-start gap-1">
                <Wrench className="h-2.5 w-2.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[10px] text-foreground/75 leading-relaxed">{finding.recommendedFix}</p>
              </div>
            </div>
          )}
          {finding.evidence && finding.evidence.length > 0 && (
            <ul className="space-y-0.5">
              {finding.evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-1">
                  <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0 mt-px" />
                  <span className="text-[9.5px] text-muted-foreground font-mono break-all">{e}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Root issue card ───────────────────────────────────────────────────────────

function RootIssueCard({
  rootIssue,
  onDismiss,
  onDismissGroup,
}: {
  rootIssue: ReturnType<typeof groupWatchdogFindings>[number];
  onDismiss: (id: string) => void;
  onDismissGroup: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CONFIG[rootIssue.severity];
  const SeverityIcon = cfg.icon;
  const childCount = rootIssue.childFindings.length;

  return (
    <div className={`rounded border ${cfg.border} ${cfg.bg} overflow-hidden`} data-testid={`watchdog-root-${rootIssue.id}`}>
      {/* Root header */}
      <div className="flex items-start gap-2 px-2.5 py-2">
        <SeverityIcon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${cfg.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <span className={`text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded ${cfg.badgeBg} ${cfg.badgeText}`}>
              {cfg.label}
            </span>
            {rootIssue.grouped && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/70 uppercase tracking-wider">
                <Layers className="h-2.5 w-2.5" />
                {childCount} signals
              </span>
            )}
          </div>
          <p className="text-[11px] font-semibold text-foreground leading-snug">{rootIssue.summary}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setOpen(o => !o)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title={open ? 'Collapse' : 'Expand details'}
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={() => onDismissGroup(rootIssue.childFindingIds)}
            className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
            title={rootIssue.grouped ? 'Dismiss all signals' : 'Dismiss'}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-current/10 px-2.5 pb-2.5 pt-2 space-y-2.5">
          {/* Root-level cause + fix (from group definition) */}
          {rootIssue.likelyCause && (
            <div>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Root cause</p>
              <p className="text-[10.5px] text-foreground/80 leading-relaxed">{rootIssue.likelyCause}</p>
            </div>
          )}
          {rootIssue.recommendedFix && (
            <div>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Recommended fix</p>
              <div className="flex items-start gap-1">
                <Wrench className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-[10.5px] text-foreground/80 leading-relaxed">{rootIssue.recommendedFix}</p>
              </div>
            </div>
          )}

          {/* Child signals — always shown when grouped */}
          {rootIssue.grouped && (
            <div className="space-y-1.5">
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">
                Contributing signals ({childCount})
              </p>
              {rootIssue.childFindings.map(f => (
                <ChildFindingRow
                  key={f.id}
                  finding={f}
                  onDismiss={() => onDismiss(f.id)}
                />
              ))}
            </div>
          )}

          {/* Standalone — show the single child's evidence directly */}
          {!rootIssue.grouped && rootIssue.childFindings[0]?.evidence?.length ? (
            <div>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Evidence</p>
              <ul className="space-y-0.5">
                {rootIssue.childFindings[0].evidence!.map((e, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0 mt-px" />
                    <span className="text-[10px] text-muted-foreground font-mono break-all">{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function WatchdogPanel({ findings, onDismiss, onDismissGroup }: WatchdogPanelProps) {
  const [open, setOpen] = useState(false);

  if (findings.length === 0) return null;

  const rootIssues = groupWatchdogFindings(findings);

  const highCount   = rootIssues.filter(r => r.severity === 'high').length;
  const mediumCount = rootIssues.filter(r => r.severity === 'medium').length;

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

  const issueWord = rootIssues.length === 1 ? 'issue' : 'issues';

  return (
    <div className={`rounded border ${headerBg} overflow-hidden`} data-testid="watchdog-panel">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <Bug className={`h-3.5 w-3.5 shrink-0 ${headerColor}`} />
        <span className={`text-[11px] font-semibold flex-1 ${headerColor}`}>
          Self-audit — {rootIssues.length} {issueWord}
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
            Momentum detected these likely issues from observable runtime state. Inferred — not confirmed bugs.
          </p>
          {rootIssues.map(root => (
            <RootIssueCard
              key={root.id}
              rootIssue={root}
              onDismiss={onDismiss}
              onDismissGroup={onDismissGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
}
