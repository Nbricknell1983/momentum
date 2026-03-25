/**
 * Cadence Workspace
 *
 * Premium operational view for the Cadence + Automation Layer.
 * Shows timing-based reminders derived from lead and client portfolio state.
 * Manager and team view. Manager-gated by the route.
 *
 * Tabs: Overview · Queue · Sales · Onboarding · Accounts · Referrals · Nudges · Inspection
 *
 * Safe controls: dismiss · snooze (2d / 5d / 1w / 2w) · complete · restore
 * All overrides are held in session state and can be upgraded to Firestore without
 * changing the domain model.
 */

import { useMemo, useReducer, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { format, addDays } from 'date-fns';
import { deriveCadenceState, deriveCadenceInspections, applyOverrides } from '@/lib/cadenceAdapter';
import {
  CadenceState,
  CadenceQueueItem,
  CadenceGroupCategory,
  CadenceUrgency,
  CadenceItemStatus,
  CadenceItemOverride,
  CadenceOverrideMap,
  AutomatedNudge,
  CADENCE_GROUP_LABELS,
  CADENCE_GROUP_COLORS,
  CADENCE_URGENCY_LABELS,
  CADENCE_URGENCY_BG,
  CADENCE_URGENCY_COLORS,
  NUDGE_TYPE_LABELS,
} from '@/lib/cadenceTypes';
import {
  Clock, AlertTriangle, CheckCircle2, Bell, Search,
  ChevronRight, ChevronDown, MessageSquare, BookOpen, Award,
  ArrowRight, XCircle, MinusCircle, RotateCcw, Megaphone,
  Users, Zap, TrendingUp, Shield, UserPlus, Calendar,
  Activity,
} from 'lucide-react';

// ── Override Reducer ──────────────────────────────────────────────────────────

type OverrideAction =
  | { type: 'complete'; itemId: string }
  | { type: 'dismiss'; itemId: string }
  | { type: 'snooze'; itemId: string; days: number; reason?: string }
  | { type: 'restore'; itemId: string };

function overrideReducer(state: CadenceOverrideMap, action: OverrideAction): CadenceOverrideMap {
  const today = format(new Date(), 'dd/MM/yyyy');
  switch (action.type) {
    case 'complete':
      return { ...state, [action.itemId]: { status: 'completed', completedAt: today } };
    case 'dismiss':
      return { ...state, [action.itemId]: { status: 'dismissed', dismissedAt: today } };
    case 'snooze': {
      const snoozedUntil = format(addDays(new Date(), action.days), 'dd/MM/yyyy');
      return {
        ...state,
        [action.itemId]: {
          status: 'snoozed',
          snoozedUntil,
          snoozeReason: action.reason,
        },
      };
    }
    case 'restore': {
      const next = { ...state };
      delete next[action.itemId];
      return next;
    }
    default:
      return state;
  }
}

// ── Tab Definition ────────────────────────────────────────────────────────────

type WorkspaceTab =
  | 'overview'
  | 'queue'
  | 'sales'
  | 'onboarding'
  | 'accounts'
  | 'referrals'
  | 'nudges'
  | 'inspection';

interface TabDef {
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: (state: CadenceState) => number | undefined;
}

const TABS: TabDef[] = [
  { id: 'overview',    label: 'Overview',    icon: Activity },
  { id: 'queue',       label: 'Queue',       icon: Clock,     badge: s => s.totalPending },
  { id: 'sales',       label: 'Sales',       icon: TrendingUp, badge: s => s.byCategory.sales.length || undefined },
  { id: 'onboarding',  label: 'Onboarding',  icon: Zap,        badge: s => s.byCategory.onboarding.length || undefined },
  { id: 'accounts',    label: 'Accounts',    icon: Users,      badge: s => (s.byCategory.account_growth.length + s.byCategory.churn_intervention.length) || undefined },
  { id: 'referrals',   label: 'Referrals',   icon: UserPlus,   badge: s => s.byCategory.referrals.length || undefined },
  { id: 'nudges',      label: 'Nudges',      icon: Megaphone,  badge: s => s.nudges.length || undefined },
  { id: 'inspection',  label: 'Inspection',  icon: Search },
];

// ── Shared UI Helpers ─────────────────────────────────────────────────────────

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

const SNOOZE_OPTIONS = [
  { label: '2 days', days: 2 },
  { label: '5 days', days: 5 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
];

// ── Cadence Item Card ─────────────────────────────────────────────────────────

interface CardProps {
  item: CadenceQueueItem;
  onComplete: () => void;
  onDismiss: () => void;
  onSnooze: (days: number) => void;
  onRestore: () => void;
}

function CadenceItemCard({ item, onComplete, onDismiss, onSnooze, onRestore }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);

  const isDone = item.status === 'completed' || item.status === 'dismissed' || item.status === 'snoozed';
  const urgencyBg = CADENCE_URGENCY_BG[item.urgency];
  const categoryColor = CADENCE_GROUP_COLORS[item.groupCategory];

  return (
    <div
      data-testid={`cadence-item-${item.id}`}
      className={`border rounded-lg p-4 transition-opacity ${isDone ? 'opacity-50' : ''} bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {item.entityName}
            </span>
            <Pill label={CADENCE_URGENCY_LABELS[item.urgency]} className={urgencyBg} />
            <Pill
              label={CADENCE_GROUP_LABELS[item.groupCategory]}
              className={`bg-zinc-100 dark:bg-zinc-800 ${categoryColor}`}
            />
            {item.overdueDays && (
              <span className="text-[11px] text-red-500 font-medium">
                {item.overdueDays}d overdue
              </span>
            )}
            {item.status === 'completed' && (
              <Pill label="Done" className="bg-emerald-100 text-emerald-700" />
            )}
            {item.status === 'dismissed' && (
              <Pill label="Dismissed" className="bg-zinc-100 text-zinc-500" />
            )}
            {item.status === 'snoozed' && (
              <Pill label={`Snoozed until ${item.snoozedUntil}`} className="bg-blue-100 text-blue-700" />
            )}
          </div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{item.title}</p>
          <p className="text-xs text-zinc-400 mt-0.5">{item.dueDate}</p>
        </div>
        <div className="flex-shrink-0 text-xs text-zinc-400 capitalize">
          {item.entityType}
        </div>
      </div>

      {/* Reason preview */}
      {!isDone && (
        <p className="text-xs text-zinc-500 mb-2 line-clamp-2">{item.reason}</p>
      )}

      {/* Expand toggle */}
      <button
        data-testid={`cadence-expand-${item.id}`}
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-3"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {expanded ? 'Hide detail' : 'Show what to do'}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 mb-3">
          <div>
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Why This Exists</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{item.reason}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">What Triggered It</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{item.triggerExplanation}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Stage Context</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{item.stageContext}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> What to Do Next
            </p>
            <p className="text-xs text-zinc-700 dark:text-zinc-300">{item.recommendedAction}</p>
          </div>
          {item.assetToReference && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                <BookOpen className="w-3 h-3" /> Asset to Reference
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{item.assetToReference}</p>
            </div>
          )}
          {item.suggestedWording && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Suggested Wording
              </p>
              <p className="text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/60 rounded p-2 italic">
                {item.suggestedWording}
              </p>
            </div>
          )}
          {/* Evidence */}
          {item.trigger.evidence.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Supporting Data</p>
              <ul className="space-y-0.5">
                {item.trigger.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-500">
                    <CheckCircle2 className="w-3 h-3 text-zinc-400 flex-shrink-0 mt-0.5" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Action controls */}
      {!isDone && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            data-testid={`cadence-complete-${item.id}`}
            onClick={onComplete}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium"
          >
            <CheckCircle2 className="w-3 h-3" /> Done
          </button>

          <div className="relative">
            <button
              data-testid={`cadence-snooze-${item.id}`}
              onClick={() => setShowSnooze(s => !s)}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium"
            >
              <Clock className="w-3 h-3" /> Snooze
            </button>
            {showSnooze && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                {SNOOZE_OPTIONS.map(opt => (
                  <button
                    key={opt.days}
                    data-testid={`cadence-snooze-${item.id}-${opt.days}`}
                    onClick={() => { onSnooze(opt.days); setShowSnooze(false); }}
                    className="block w-full text-left text-xs px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            data-testid={`cadence-dismiss-${item.id}`}
            onClick={onDismiss}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-zinc-50 text-zinc-500 hover:bg-zinc-100 font-medium"
          >
            <XCircle className="w-3 h-3" /> Dismiss
          </button>
        </div>
      )}

      {/* Restore for done/dismissed/snoozed */}
      {isDone && (
        <button
          data-testid={`cadence-restore-${item.id}`}
          onClick={onRestore}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
        >
          <RotateCcw className="w-3 h-3" /> Restore
        </button>
      )}
    </div>
  );
}

// ── Item List with Controls ───────────────────────────────────────────────────

interface ItemListProps {
  items: CadenceQueueItem[];
  dispatch: React.Dispatch<OverrideAction>;
  showDone?: boolean;
}

function ItemList({ items, dispatch, showDone = false }: ItemListProps) {
  const visible = showDone ? items : items.filter(i => i.status === 'pending');

  if (visible.length === 0) {
    return (
      <div className="text-center py-10 text-zinc-400">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nothing here right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map(item => (
        <CadenceItemCard
          key={item.id}
          item={item}
          onComplete={() => dispatch({ type: 'complete', itemId: item.id })}
          onDismiss={() => dispatch({ type: 'dismiss', itemId: item.id })}
          onSnooze={days => dispatch({ type: 'snooze', itemId: item.id, days })}
          onRestore={() => dispatch({ type: 'restore', itemId: item.id })}
        />
      ))}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  state,
  dispatch,
}: {
  state: CadenceState;
  dispatch: React.Dispatch<OverrideAction>;
}) {
  const tiles = [
    {
      label: 'Overdue',
      value: state.overdueItems.length,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: 'Due Today',
      value: state.dueTodayItems.length,
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      label: 'This Week',
      value: state.dueThisWeekItems.length,
      icon: Calendar,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Total Pending',
      value: state.totalPending,
      icon: Bell,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'Draft Nudges',
      value: state.nudges.length,
      icon: Megaphone,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
  ];

  // Show up to 5 most urgent items in the overview
  const spotlightItems = state.allItems
    .filter(i => i.status === 'pending' && (i.urgency === 'overdue' || i.urgency === 'today'))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tiles.map(tile => (
          <div
            key={tile.label}
            className={`${tile.bg} dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{tile.label}</span>
              <tile.icon className={`w-4 h-4 ${tile.color}`} />
            </div>
            <div className={`text-2xl font-bold ${tile.color}`}>{tile.value}</div>
          </div>
        ))}
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {(Object.entries(state.byCategory) as [CadenceGroupCategory, CadenceQueueItem[]][]).map(([cat, items]) => (
          <div key={cat} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2">
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${CADENCE_GROUP_COLORS[cat]}`}>
              {CADENCE_GROUP_LABELS[cat]}
            </p>
            <p className="text-lg font-bold text-zinc-700 dark:text-zinc-300 mt-0.5">{items.length}</p>
          </div>
        ))}
      </div>

      {/* Urgent spotlight */}
      {spotlightItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Requires Immediate Attention
          </h3>
          <ItemList items={spotlightItems} dispatch={dispatch} />
        </div>
      )}

      {spotlightItems.length === 0 && (
        <div className="text-center py-10 text-zinc-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-400 opacity-60" />
          <p className="text-sm font-medium text-zinc-500">No urgent items right now</p>
          <p className="text-xs mt-1">All overdue and today items are cleared. Check the Queue for upcoming tasks.</p>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        Derived from live portfolio data · Generated {state.generatedAt}
      </p>
    </div>
  );
}

// ── Queue Tab ─────────────────────────────────────────────────────────────────

function QueueTab({
  state,
  dispatch,
}: {
  state: CadenceState;
  dispatch: React.Dispatch<OverrideAction>;
}) {
  const [showDone, setShowDone] = useState(false);

  const sections: {
    label: string;
    items: CadenceQueueItem[];
    color: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { label: `Overdue (${state.overdueItems.length})`, items: state.overdueItems, color: 'text-red-600', icon: AlertTriangle },
    { label: `Due Today (${state.dueTodayItems.length})`, items: state.dueTodayItems, color: 'text-orange-600', icon: Clock },
    { label: `This Week (${state.dueThisWeekItems.length})`, items: state.dueThisWeekItems, color: 'text-amber-600', icon: Calendar },
    { label: `Upcoming (${state.upcomingItems.length})`, items: state.upcomingItems, color: 'text-blue-600', icon: Bell },
  ];

  const doneItems = state.allItems.filter(
    i => i.status === 'completed' || i.status === 'dismissed' || i.status === 'snoozed',
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">{state.totalPending} pending items</p>
        <button
          data-testid="cadence-toggle-done"
          onClick={() => setShowDone(d => !d)}
          className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
        >
          <MinusCircle className="w-3 h-3" />
          {showDone ? 'Hide' : 'Show'} dismissed / done ({doneItems.length})
        </button>
      </div>

      {sections.map(section => {
        const visible = showDone
          ? section.items
          : section.items.filter(i => i.status === 'pending');
        if (visible.length === 0 && !showDone) return null;
        return (
          <div key={section.label}>
            <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${section.color}`}>
              <section.icon className="w-3.5 h-3.5" />
              {section.label}
            </h3>
            <ItemList items={section.items} dispatch={dispatch} showDone={showDone} />
          </div>
        );
      })}

      {showDone && doneItems.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2 text-zinc-400">
            Dismissed / Snoozed / Completed ({doneItems.length})
          </h3>
          <ItemList items={doneItems} dispatch={dispatch} showDone />
        </div>
      )}
    </div>
  );
}

// ── Category Tab ──────────────────────────────────────────────────────────────

function CategoryTab({
  items,
  dispatch,
  emptyIcon: EmptyIcon,
  emptyMessage,
}: {
  items: CadenceQueueItem[];
  dispatch: React.Dispatch<OverrideAction>;
  emptyIcon: React.ComponentType<{ className?: string }>;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-400">
        <EmptyIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium text-zinc-500">{emptyMessage}</p>
      </div>
    );
  }
  return <ItemList items={items} dispatch={dispatch} />;
}

// ── Nudges Tab ────────────────────────────────────────────────────────────────

function NudgesTab({ nudges }: { nudges: AutomatedNudge[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (nudges.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-400">
        <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium text-zinc-500">No draft nudges</p>
        <p className="text-xs mt-1">Nudges are generated for overdue and today-urgent items.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          <strong>Preview only — not sent automatically.</strong>{' '}
          These are draft nudges generated from your cadence queue. Review and personalise each one before using.
          Automated sending can be enabled per nudge type once explicitly configured.
        </p>
      </div>

      <div className="space-y-3">
        {nudges.map(nudge => (
          <div
            key={nudge.id}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{nudge.entityName}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                    nudge.target === 'internal'
                      ? 'bg-zinc-100 text-zinc-600'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {nudge.target === 'internal' ? 'Internal' : 'Client Draft'}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-violet-100 text-violet-700">
                    {NUDGE_TYPE_LABELS[nudge.nudgeType]}
                  </span>
                </div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{nudge.subject}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-400 mb-2">{nudge.previewNote}</p>

            <button
              data-testid={`nudge-expand-${nudge.id}`}
              onClick={() => setExpanded(expanded === nudge.id ? null : nudge.id)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              {expanded === nudge.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {expanded === nudge.id ? 'Hide draft' : 'Preview draft'}
            </button>

            {expanded === nudge.id && (
              <div className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Draft Body</p>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded p-3 text-xs text-zinc-700 dark:text-zinc-300 italic whitespace-pre-wrap">
                  {nudge.body}
                </div>
                <p className="text-[10px] text-zinc-400 mt-2">
                  Generated {nudge.createdAt} · Status: {nudge.status}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inspection Tab ────────────────────────────────────────────────────────────

function InspectionTab({ state }: { state: CadenceState }) {
  const [entityFilter, setEntityFilter] = useState<'all' | 'lead' | 'client'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CadenceItemStatus>('all');

  const inspections = useMemo(() => deriveCadenceInspections(state), [state]);

  const filtered = inspections.filter(i => {
    if (entityFilter !== 'all' && i.entityType !== entityFilter) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <label className="text-xs font-medium text-zinc-500">Type:</label>
          {(['all', 'lead', 'client'] as const).map(v => (
            <button
              key={v}
              data-testid={`inspection-entity-${v}`}
              onClick={() => setEntityFilter(v)}
              className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                entityFilter === v
                  ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs font-medium text-zinc-500">Status:</label>
          {(['all', 'pending', 'completed', 'dismissed', 'snoozed'] as const).map(v => (
            <button
              key={v}
              data-testid={`inspection-status-${v}`}
              onClick={() => setStatusFilter(v)}
              className={`text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === v
                  ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No records match this filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(record => (
            <div
              key={record.itemId}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{record.entityName}</span>
                  <span className="mx-2 text-zinc-300">·</span>
                  <span className="text-xs text-zinc-500 capitalize">{record.entityType}</span>
                  <span className="mx-2 text-zinc-300">·</span>
                  <span className="text-xs font-mono text-zinc-400">{record.triggerType}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                    record.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                    : record.status === 'dismissed' ? 'bg-zinc-100 text-zinc-500'
                    : record.status === 'snoozed' ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                  }`}>
                    {record.status}
                  </span>
                  <span className="text-xs text-zinc-400">{record.detectedAt}</span>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mb-2">{record.whyFired}</p>
              <div className="space-y-0.5">
                {Object.entries(record.supportingData).map(([k, v]) => (
                  <p key={k} className="text-xs text-zinc-500">
                    <span className="font-mono text-zinc-400">{k}:</span> {v}
                  </p>
                ))}
              </div>
              <p className="text-xs text-zinc-400 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <span className="font-semibold">Recommendation:</span> {record.recommendationGenerated}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Workspace ────────────────────────────────────────────────────────────

export function CadenceWorkspace() {
  const leads = useSelector((state: RootState) => state.app.leads);
  const clients = useSelector((state: RootState) => state.app.clients);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [overrides, dispatch] = useReducer(overrideReducer, {});

  const rawState = useMemo(() => deriveCadenceState(leads, clients), [leads, clients]);

  // Apply overrides to the derived state
  const state = useMemo((): CadenceState => {
    const allItems = applyOverrides(rawState.allItems, overrides);
    const pendingItems = allItems.filter(i => i.status === 'pending');
    const urgencyOrder = { overdue: 0, today: 1, this_week: 2, upcoming: 3 };
    const sorted = [...pendingItems].sort(
      (a, b) => (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3),
    );
    const byCat: Record<CadenceGroupCategory, CadenceQueueItem[]> = {
      sales: sorted.filter(i => i.groupCategory === 'sales'),
      onboarding: sorted.filter(i => i.groupCategory === 'onboarding'),
      account_growth: sorted.filter(i => i.groupCategory === 'account_growth'),
      churn_intervention: sorted.filter(i => i.groupCategory === 'churn_intervention'),
      referrals: sorted.filter(i => i.groupCategory === 'referrals'),
    };
    return {
      ...rawState,
      allItems,
      overdueItems: sorted.filter(i => i.urgency === 'overdue'),
      dueTodayItems: sorted.filter(i => i.urgency === 'today'),
      dueThisWeekItems: sorted.filter(i => i.urgency === 'this_week'),
      upcomingItems: sorted.filter(i => i.urgency === 'upcoming'),
      byCategory: byCat,
      totalPending: pendingItems.length,
      criticalCount: sorted.filter(i => i.urgency === 'overdue').length,
    };
  }, [rawState, overrides]);

  const accountItems = useMemo(
    () => [...state.byCategory.account_growth, ...state.byCategory.churn_intervention],
    [state],
  );

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Bell className="w-5 h-5 text-violet-600" />
              Cadence &amp; Reminders
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Timing-based reminders for sales, onboarding, accounts, and growth — derived from live portfolio data
            </p>
          </div>
          <div className="text-right">
            {state.criticalCount > 0 ? (
              <>
                <div className="text-2xl font-bold text-red-600">{state.criticalCount}</div>
                <div className="text-xs text-zinc-400">overdue</div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-emerald-600">{state.totalPending}</div>
                <div className="text-xs text-zinc-400">pending</div>
              </>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
          {TABS.map(tab => {
            const count = tab.badge?.(state);
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-testid={`cadence-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'border-violet-600 text-violet-600'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-violet-100 text-violet-700' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {activeTab === 'overview' && <OverviewTab state={state} dispatch={dispatch} />}
        {activeTab === 'queue' && <QueueTab state={state} dispatch={dispatch} />}
        {activeTab === 'sales' && (
          <CategoryTab
            items={state.byCategory.sales}
            dispatch={dispatch}
            emptyIcon={TrendingUp}
            emptyMessage="No sales cadence items in this period."
          />
        )}
        {activeTab === 'onboarding' && (
          <CategoryTab
            items={state.byCategory.onboarding}
            dispatch={dispatch}
            emptyIcon={Zap}
            emptyMessage="No onboarding reminders at this time."
          />
        )}
        {activeTab === 'accounts' && (
          <CategoryTab
            items={accountItems}
            dispatch={dispatch}
            emptyIcon={Users}
            emptyMessage="No account or churn reminders detected."
          />
        )}
        {activeTab === 'referrals' && (
          <CategoryTab
            items={state.byCategory.referrals}
            dispatch={dispatch}
            emptyIcon={UserPlus}
            emptyMessage="No referral windows detected right now."
          />
        )}
        {activeTab === 'nudges' && <NudgesTab nudges={state.nudges} />}
        {activeTab === 'inspection' && <InspectionTab state={state} />}
      </div>
    </div>
  );
}
