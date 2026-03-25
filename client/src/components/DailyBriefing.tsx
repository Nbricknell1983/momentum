import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'wouter';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  History,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Lock,
  Activity,
  ArrowRight,
  X,
  Check,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { db, collection, addDoc, query, orderBy, limit, onSnapshot, getDocs } from '@/lib/firebase';
import { deriveDailyBriefing, briefingToSnapshot } from '@/lib/briefingAdapter';
import type { RootState } from '@/store';
import type {
  DailyBriefing,
  BriefingItem,
  BriefingSection,
  BriefingSectionType,
  BriefingPriority,
  BriefingChange,
  BriefingDebugEntry,
  BriefingSnapshot,
} from '@/lib/briefingTypes';
import {
  BRIEFING_PRIORITY_LABELS,
  BRIEFING_PRIORITY_STYLES,
  BRIEFING_PRIORITY_DOT,
  BRIEFING_ACTION_LABELS,
  BRIEFING_SOURCE_LABELS,
} from '@/lib/briefingTypes';
import type { SweepAction } from '@/lib/sweepTypes';
import type { CommunicationHistoryItem } from '@/lib/execAutomationTypes';

// ── Section icons ─────────────────────────────────────────────────────────────

const SECTION_ICON_MAP: Record<BriefingSectionType, typeof AlertTriangle> = {
  approvals: ShieldCheck,
  risks: AlertTriangle,
  opportunities: TrendingUp,
  blocked: Lock,
  watchlist: Eye,
  changes: Activity,
};

// ── Priority badge ─────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: BriefingPriority }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${BRIEFING_PRIORITY_STYLES[priority]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${BRIEFING_PRIORITY_DOT[priority]}`} />
      {BRIEFING_PRIORITY_LABELS[priority]}
    </span>
  );
}

// ── Change delta badge ────────────────────────────────────────────────────────

function ChangeBadge({ change }: { change: BriefingChange }) {
  const styles = {
    increased: change.magnitude === 'critical'
      ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
      : 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800',
    decreased: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800',
    new: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
    resolved: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800',
  };
  const arrow = change.delta === 'increased' ? '↑' : change.delta === 'decreased' ? '↓' : change.delta === 'new' ? '●' : '✓';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${styles[change.delta]}`}>
      {arrow} {change.context}
    </span>
  );
}

// ── Briefing item card ─────────────────────────────────────────────────────────

function BriefingItemCard({
  item,
  reviewed,
  onReview,
  onNavigate,
}: {
  item: BriefingItem;
  reviewed: boolean;
  onReview: (id: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid={`briefing-item-${item.id}`}
      className={`border rounded-xl overflow-hidden transition-all ${
        reviewed
          ? 'opacity-50 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900'
          : item.priority === 'critical'
          ? 'border-red-200 dark:border-red-800 bg-white dark:bg-zinc-900 ring-1 ring-red-100 dark:ring-red-900'
          : item.priority === 'urgent'
          ? 'border-orange-200 dark:border-orange-800 bg-white dark:bg-zinc-900'
          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
      }`}
    >
      {/* Header row */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <PriorityBadge priority={item.priority} />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">{item.entityType}</span>
            {item.isNew && (
              <span className="text-[10px] bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 px-1.5 py-0.5 rounded font-semibold">New</span>
            )}
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">{item.entityName}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{item.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <button
            data-testid={`briefing-item-review-${item.id}`}
            onClick={() => onReview(item.id)}
            title={reviewed ? 'Mark as unreviewed' : 'Mark as reviewed'}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              reviewed
                ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 hover:text-emerald-600'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setExpanded(e => !e)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-3">
          {/* Why included */}
          <div className="p-3 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded-lg">
            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-1">Why this is in your briefing</p>
            <p className="text-xs text-violet-900 dark:text-violet-200 leading-relaxed">{item.why}</p>
          </div>

          {/* Context */}
          {item.context && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{item.context}</p>
          )}

          {/* Facts */}
          {item.facts.length > 0 && (
            <div className="space-y-1">
              {item.facts.map((fact, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="text-zinc-300 dark:text-zinc-600 flex-shrink-0 mt-0.5">·</span>
                  {fact}
                </div>
              ))}
            </div>
          )}

          {/* Source + action */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[10px] text-zinc-400">
              Source: {BRIEFING_SOURCE_LABELS[item.sourceLayer] ?? item.sourceLayer}
            </span>
            {item.drilldown && (
              <button
                data-testid={`briefing-item-drilldown-${item.id}`}
                onClick={() => onNavigate(item.drilldown!.path)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200 transition-colors"
              >
                {BRIEFING_ACTION_LABELS[item.action]}
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section panel ─────────────────────────────────────────────────────────────

function SectionPanel({
  section,
  reviewedIds,
  onReview,
  onNavigate,
}: {
  section: BriefingSection;
  reviewedIds: Set<string>;
  onReview: (id: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const Icon = SECTION_ICON_MAP[section.type] ?? Info;
  const unreviewed = section.items.filter(i => !reviewedIds.has(i.id));
  const hasUrgent = section.topPriority === 'critical' || section.topPriority === 'urgent';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
      {/* Section header */}
      <button
        data-testid={`briefing-section-${section.type}`}
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
          section.topPriority === 'critical' ? 'bg-red-100 dark:bg-red-950'
          : section.topPriority === 'urgent' ? 'bg-orange-100 dark:bg-orange-950'
          : section.topPriority === 'important' ? 'bg-amber-100 dark:bg-amber-950'
          : 'bg-zinc-100 dark:bg-zinc-800'
        }`}>
          <Icon className={`w-4 h-4 ${
            section.topPriority === 'critical' ? 'text-red-600 dark:text-red-400'
            : section.topPriority === 'urgent' ? 'text-orange-600 dark:text-orange-400'
            : section.topPriority === 'important' ? 'text-amber-600 dark:text-amber-400'
            : 'text-zinc-400'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{section.label}</span>
            {unreviewed.length > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                hasUrgent
                  ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
              }`}>
                {unreviewed.length}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{section.summary}</p>
        </div>
        {collapsed ? <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />}
      </button>

      {!collapsed && section.items.length > 0 && (
        <div className="px-5 pb-5 space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
          {section.items.map(item => (
            <BriefingItemCard
              key={item.id}
              item={item}
              reviewed={reviewedIds.has(item.id)}
              onReview={onReview}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      {!collapsed && section.items.length === 0 && (
        <div className="px-5 pb-5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 py-4 justify-center text-zinc-400">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-zinc-500">{section.summary}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Top action card ───────────────────────────────────────────────────────────

function TopActionCard({
  item,
  onReview,
  onNavigate,
}: {
  item: BriefingItem;
  onReview: (id: string) => void;
  onNavigate: (path: string) => void;
}) {
  const borderStyle = item.priority === 'critical'
    ? 'border-red-300 dark:border-red-700 ring-2 ring-red-100 dark:ring-red-900'
    : 'border-orange-200 dark:border-orange-800 ring-1 ring-orange-100 dark:ring-orange-900';

  const headerStyle = item.priority === 'critical'
    ? 'bg-red-600 dark:bg-red-700'
    : 'bg-orange-500 dark:bg-orange-700';

  return (
    <div className={`bg-white dark:bg-zinc-900 border rounded-2xl overflow-hidden ${borderStyle}`}>
      <div className={`px-5 py-3 flex items-center gap-2 ${headerStyle}`}>
        <Zap className="w-4 h-4 text-white" />
        <span className="text-xs font-bold text-white uppercase tracking-wide">Top Priority Action</span>
        <span className="ml-auto text-[10px] text-white/80 font-medium">{BRIEFING_PRIORITY_LABELS[item.priority]}</span>
      </div>
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400 mb-1">
              {item.entityType} · {BRIEFING_SOURCE_LABELS[item.sourceLayer]}
            </p>
            <p className="text-base font-bold text-zinc-900 dark:text-zinc-100">{item.entityName}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">{item.title}</p>
            <div className="mt-3 p-3 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded-lg">
              <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 mb-1 uppercase tracking-wide">Why it's first</p>
              <p className="text-xs text-violet-900 dark:text-violet-200 leading-relaxed">{item.why}</p>
            </div>
            {item.facts.length > 0 && (
              <div className="flex gap-3 mt-3 flex-wrap">
                {item.facts.map((f, i) => (
                  <span key={i} className="text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          {item.drilldown && (
            <button
              data-testid="briefing-top-action-cta"
              onClick={() => onNavigate(item.drilldown!.path)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 ${
                item.priority === 'critical' ? 'bg-red-600' : 'bg-orange-500'
              }`}
            >
              {BRIEFING_ACTION_LABELS[item.action]}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onReview(item.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Mark reviewed
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Summary stats strip ───────────────────────────────────────────────────────

function SummaryStrip({ briefing }: { briefing: DailyBriefing }) {
  const { summary } = briefing;
  const stats = [
    {
      label: 'Critical',
      value: summary.criticalCount,
      style: summary.criticalCount > 0
        ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400',
      valueStyle: summary.criticalCount > 0 ? 'text-red-700 dark:text-red-300' : 'text-zinc-400',
    },
    {
      label: 'Urgent',
      value: summary.urgentCount,
      style: summary.urgentCount > 0
        ? 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800'
        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
      valueStyle: summary.urgentCount > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-zinc-400',
    },
    {
      label: 'Approvals',
      value: summary.approvalsWaiting,
      style: summary.approvalsWaiting > 0
        ? 'bg-violet-50 dark:bg-violet-950 border-violet-200 dark:border-violet-800'
        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
      valueStyle: summary.approvalsWaiting > 0 ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-400',
    },
    {
      label: 'Risks',
      value: summary.risksDetected,
      style: 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
      valueStyle: summary.risksDetected > 0 ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-400',
    },
    {
      label: 'Opportunities',
      value: summary.opportunitiesAvailable,
      style: summary.opportunitiesAvailable > 0
        ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800'
        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
      valueStyle: summary.opportunitiesAvailable > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-zinc-400',
    },
    {
      label: 'Blocked',
      value: summary.blockedCount,
      style: summary.blockedCount > 0
        ? 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'
        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800',
      valueStyle: summary.blockedCount > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-400',
    },
  ];

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
      {stats.map(stat => (
        <div key={stat.label} className={`border rounded-xl p-3 text-center ${stat.style}`}>
          <p className={`text-2xl font-black ${stat.valueStyle}`}>{stat.value}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mt-0.5">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Changes strip ─────────────────────────────────────────────────────────────

function ChangesStrip({ changes }: { changes: BriefingChange[] }) {
  if (changes.length === 0) return null;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">What's changed since last briefing</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {changes.map(change => (
          <div key={change.id} className="flex items-center gap-2">
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{change.label}</span>
            <ChangeBadge change={change} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Debug inspector ───────────────────────────────────────────────────────────

function DebugInspector({ debug }: { debug: DailyBriefing['debugInfo'] }) {
  const [filter, setFilter] = useState<'all' | 'included' | 'excluded'>('included');
  const entries = debug.inclusionLog.filter(e =>
    filter === 'all' ? true : filter === 'included' ? e.included : !e.included,
  );

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-700 flex items-center gap-3">
        <AlertCircle className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold text-zinc-100">Briefing Inspection Log</span>
        <span className="ml-auto text-xs text-zinc-500">
          {debug.totalIncluded} included · {debug.totalExcluded} excluded · {debug.totalEvaluated} total
        </span>
      </div>
      <div className="px-5 py-3 border-b border-zinc-700 flex gap-2">
        {(['all', 'included', 'excluded'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1 rounded font-medium capitalize ${filter === f ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800">
        {entries.map((entry, i) => (
          <div key={i} className="px-5 py-2.5 flex items-start gap-3">
            {entry.included
              ? <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
              : <X className="w-3.5 h-3.5 text-zinc-500 mt-0.5 flex-shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-zinc-200">{entry.entityName}</span>
                {entry.priority && <PriorityBadge priority={entry.priority} />}
                <span className="text-[10px] text-zinc-500">{BRIEFING_SOURCE_LABELS[entry.sourceLayer]}</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {entry.included ? entry.includeReason : entry.excludeReason}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History list ──────────────────────────────────────────────────────────────

function BriefingHistoryList({ snapshots }: { snapshots: BriefingSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <div className="text-center py-12">
        <History className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No saved briefings yet</p>
        <p className="text-xs text-zinc-500 mt-1">Click "Save Briefing" to create your first snapshot.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {snapshots.map(snap => (
        <div
          key={snap.id ?? snap.generatedAt}
          data-testid={`briefing-snapshot-${snap.briefingDate?.replace(/\//g, '-')}`}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{snap.briefingDate}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Generated {snap.generatedAt}</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-red-600 dark:text-red-400 font-semibold">{snap.summary.criticalCount} critical</span>
              <span className="text-xs text-orange-600 dark:text-orange-400 font-semibold">{snap.summary.urgentCount} urgent</span>
              <span className="text-xs text-zinc-500">{snap.summary.totalItems} items</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type BriefingTab = 'today' | 'history' | 'inspect';

export default function DailyBriefing() {
  const [activeTab, setActiveTab] = useState<BriefingTab>('today');
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [sweepActions, setSweepActions] = useState<SweepAction[]>([]);
  const [commHistory, setCommHistory] = useState<CommunicationHistoryItem[]>([]);
  const [snapshots, setSnapshots] = useState<BriefingSnapshot[]>([]);
  const [previousSnapshot, setPreviousSnapshot] = useState<BriefingSnapshot | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const leads = useSelector((s: RootState) => s.app.leads);
  const clients = useSelector((s: RootState) => s.app.clients);
  const { orgId, user } = useAuth();
  const userName = (user as any)?.displayName ?? (user as any)?.email ?? 'Manager';
  const firstName = userName.split(' ')[0] ?? userName.split('@')[0];

  const [, navigate] = useLocation();

  // ── Load Firestore data ────────────────────────────────────────────────────

  useEffect(() => {
    if (!orgId || !db) { setLoading(false); return; }

    const unsubs: Array<() => void> = [];

    // Sweep actions pending approval
    const sweepRef = collection(db, 'orgs', orgId, 'sweepActions');
    const sweepQ = query(sweepRef, orderBy('createdAt', 'desc'), limit(50));
    unsubs.push(onSnapshot(sweepQ, snap => {
      setSweepActions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SweepAction)));
    }, () => {}));

    // Recent comm history
    const histRef = collection(db, 'orgs', orgId, 'commHistory');
    const histQ = query(histRef, orderBy('sentAt', 'desc'), limit(30));
    unsubs.push(onSnapshot(histQ, snap => {
      setCommHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommunicationHistoryItem)));
    }, () => {}));

    // Briefing snapshots
    const briefRef = collection(db, 'orgs', orgId, 'briefings');
    const briefQ = query(briefRef, orderBy('generatedAt', 'desc'), limit(30));
    unsubs.push(onSnapshot(briefQ, snap => {
      const snaps = snap.docs.map(d => ({ id: d.id, ...d.data() } as BriefingSnapshot));
      setSnapshots(snaps);
      setPreviousSnapshot(snaps[0]); // latest saved = previous reference
      setLoading(false);
    }, () => setLoading(false)));

    return () => unsubs.forEach(u => u());
  }, [orgId]);

  // ── Derive briefing ────────────────────────────────────────────────────────

  const briefing = useMemo((): DailyBriefing => deriveDailyBriefing({
    leads,
    clients,
    sweepActions,
    commHistory,
    previousSnapshot,
    reviewedItemIds: Array.from(reviewedIds),
  }), [leads, clients, sweepActions, commHistory, previousSnapshot, reviewedIds]);

  // ── Review handler ─────────────────────────────────────────────────────────

  const handleReview = useCallback((id: string) => {
    setReviewedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Save snapshot ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!orgId || !db) return;
    setSaving(true);
    try {
      const snap = briefingToSnapshot(briefing, orgId);
      snap.reviewedItemIds = Array.from(reviewedIds);
      await addDoc(collection(db, 'orgs', orgId, 'briefings'), snap);
      setSavedAt(format(new Date(), 'HH:mm'));
    } catch (e) {
      console.error('[DailyBriefing] save error', e);
    } finally {
      setSaving(false);
    }
  }, [briefing, orgId, reviewedIds]);

  // ── Greeting ───────────────────────────────────────────────────────────────

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
        <span className="ml-2 text-zinc-500 text-sm">Generating briefing…</span>
      </div>
    );
  }

  const TABS: { id: BriefingTab; label: string }[] = [
    { id: 'today', label: "Today's Briefing" },
    { id: 'history', label: `History (${snapshots.length})` },
    { id: 'inspect', label: 'Inspect' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Top bar */}
      <div className="flex-shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">Manager Daily Briefing</span>
            </div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {briefing.briefingDate} · Generated {briefing.generatedAt.split(' ')[1]} ·{' '}
              {briefing.summary.totalItems === 0 ? 'Everything looks clear' : `${briefing.summary.totalItems} items need attention`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {savedAt && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                Saved {savedAt}
              </span>
            )}
            <button
              data-testid="briefing-save"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Briefing
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6">
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              data-testid={`briefing-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

        {/* TODAY tab */}
        {activeTab === 'today' && (
          <>
            {/* Summary strip */}
            <SummaryStrip briefing={briefing} />

            {/* Changes */}
            {briefing.changes.length > 0 && <ChangesStrip changes={briefing.changes} />}

            {/* All clear state */}
            {briefing.summary.totalItems === 0 && (
              <div className="text-center py-16 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Everything is on track</p>
                <p className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto">
                  No urgent items detected across your pipeline, clients, sweeps, or communication layer.
                  Good work keeping things moving.
                </p>
              </div>
            )}

            {/* Top action */}
            {briefing.topAction && !reviewedIds.has(briefing.topAction.id) && (
              <TopActionCard
                item={briefing.topAction}
                onReview={handleReview}
                onNavigate={navigate}
              />
            )}

            {/* Sections */}
            {briefing.sections.map(section => (
              <SectionPanel
                key={section.type}
                section={section}
                reviewedIds={reviewedIds}
                onReview={handleReview}
                onNavigate={navigate}
              />
            ))}

            {/* Review progress */}
            {briefing.summary.totalItems > 0 && (
              <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Review progress
                    </span>
                    <span className="text-xs text-zinc-500">
                      {reviewedIds.size} / {briefing.summary.totalItems} reviewed
                    </span>
                  </div>
                  <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${Math.round((reviewedIds.size / briefing.summary.totalItems) * 100)}%` }}
                    />
                  </div>
                </div>
                {reviewedIds.size === briefing.summary.totalItems && (
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                )}
              </div>
            )}
          </>
        )}

        {/* HISTORY tab */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {snapshots.length} saved briefing{snapshots.length !== 1 ? 's' : ''} — click "Save Briefing" each morning to build your history.
              </p>
            </div>
            <BriefingHistoryList snapshots={snapshots} />
          </div>
        )}

        {/* INSPECT tab */}
        {activeTab === 'inspect' && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-200">
                <p className="font-semibold mb-0.5">Inspection log</p>
                <p className="leading-relaxed">Shows exactly why each entity was included or excluded. Data source shown for every decision.</p>
              </div>
            </div>

            {/* Source snapshot */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-5 py-4">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-3 uppercase tracking-wide">Source data at derivation time</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {Object.entries(briefing.sourceSnapshot).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-zinc-500 capitalize">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <DebugInspector debug={briefing.debugInfo} />
          </div>
        )}

      </div>
    </div>
  );
}
