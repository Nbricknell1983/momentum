/**
 * Comms Workspace
 *
 * Standalone workspace for the Communication Drafting Layer.
 * Derives drafts from the cadence queue and provides a full review, edit,
 * copy, and status-tracking interface.
 *
 * Tabs: Overview · All Drafts · Sales · Accounts · Inspection
 *
 * Draft state (edit / used / discarded / restore) managed in session via useReducer.
 * Can be upgraded to Firestore without changing domain model or UI.
 */

import { useMemo, useReducer, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { deriveCadenceState } from '@/lib/cadenceAdapter';
import { buildDraftsFromQueue, buildInspections } from '@/lib/commsAdapter';
import {
  CommunicationDraft,
  CommunicationChannel,
  CommunicationIntent,
  DraftStatus,
  INTENT_LABELS,
  INTENT_COLORS,
  CHANNEL_LABELS,
  DRAFT_STATUS_LABELS,
} from '@/lib/commsTypes';
import { CommsDraftPanel, DraftAction } from './CommsDraftPanel';
import { format } from 'date-fns';
import {
  MessageSquare, CheckCircle2, Clock, Search,
  Mail, Voicemail, Phone, TrendingUp, Users,
  Activity, FileText,
} from 'lucide-react';

// ── Draft Reducer ─────────────────────────────────────────────────────────────

type DraftMap = Record<string, Partial<CommunicationDraft>>;

function draftReducer(state: DraftMap, action: DraftAction): DraftMap {
  switch (action.type) {
    case 'set_channel':
      return { ...state, [action.draftId]: { ...(state[action.draftId] ?? {}), activeChannel: action.channel } };
    case 'edit_body': {
      const prev = state[action.draftId] ?? {};
      return {
        ...state,
        [action.draftId]: {
          ...prev,
          editedBodies: { ...(prev.editedBodies ?? {}), [action.channel]: action.body },
          status: 'reviewed',
        },
      };
    }
    case 'mark_used':
      return {
        ...state,
        [action.draftId]: {
          ...(state[action.draftId] ?? {}),
          status: 'used',
          usedChannel: action.channel,
          usedAt: format(new Date(), 'dd/MM/yyyy'),
        },
      };
    case 'mark_reviewed':
      return { ...state, [action.draftId]: { ...(state[action.draftId] ?? {}), status: 'reviewed' } };
    case 'discard':
      return { ...state, [action.draftId]: { ...(state[action.draftId] ?? {}), status: 'discarded' } };
    case 'restore': {
      const prev = state[action.draftId] ?? {};
      return { ...state, [action.draftId]: { ...prev, status: 'draft' } };
    }
    default:
      return state;
  }
}

function applyDraftOverrides(drafts: CommunicationDraft[], overrides: DraftMap): CommunicationDraft[] {
  return drafts.map(d => {
    const o = overrides[d.id];
    if (!o) return d;
    return {
      ...d,
      ...o,
      editedBodies: { ...d.editedBodies, ...(o.editedBodies ?? {}) },
    };
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type WorkspaceTab = 'overview' | 'all' | 'sales' | 'accounts' | 'inspection';

const TABS: { id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview',    label: 'Overview',    icon: Activity },
  { id: 'all',         label: 'All Drafts',  icon: FileText },
  { id: 'sales',       label: 'Sales',       icon: TrendingUp },
  { id: 'accounts',    label: 'Accounts',    icon: Users },
  { id: 'inspection',  label: 'Inspection',  icon: Search },
];

// ── Draft Card List ───────────────────────────────────────────────────────────

function DraftCardList({
  drafts,
  dispatch,
  expandedId,
  setExpandedId,
}: {
  drafts: CommunicationDraft[];
  dispatch: React.Dispatch<DraftAction>;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  if (drafts.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-400">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No drafts here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {drafts.map(draft => {
        const isExpanded = expandedId === draft.id;
        return (
          <div key={draft.id} className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
            {/* Collapsed header */}
            <button
              data-testid={`comms-draft-toggle-${draft.id}`}
              onClick={() => setExpandedId(isExpanded ? null : draft.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-left"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">{draft.entityName}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${INTENT_COLORS[draft.intent]}`}>
                  {INTENT_LABELS[draft.intent]}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                  draft.status === 'used' ? 'bg-emerald-100 text-emerald-700'
                  : draft.status === 'reviewed' ? 'bg-blue-100 text-blue-700'
                  : draft.status === 'discarded' ? 'bg-zinc-100 text-zinc-500'
                  : 'bg-amber-100 text-amber-700'
                }`}>
                  {DRAFT_STATUS_LABELS[draft.status]}
                </span>
                <span className="text-[10px] text-zinc-400 capitalize">{draft.entityType}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] text-zinc-400 capitalize">{CHANNEL_LABELS[draft.recommendedChannel]}</span>
                <span className="text-zinc-300 text-[11px]">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Expanded panel */}
            {isExpanded && (
              <div className="border-t border-zinc-100 dark:border-zinc-800">
                <CommsDraftPanel
                  draft={draft}
                  dispatch={dispatch}
                  compact
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  drafts,
  dispatch,
  expandedId,
  setExpandedId,
}: {
  drafts: CommunicationDraft[];
  dispatch: React.Dispatch<DraftAction>;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
}) {
  const pending = drafts.filter(d => d.status === 'draft');
  const reviewed = drafts.filter(d => d.status === 'reviewed');
  const used = drafts.filter(d => d.status === 'used');
  const discarded = drafts.filter(d => d.status === 'discarded');

  const byChannel = {
    email: drafts.filter(d => d.recommendedChannel === 'email').length,
    sms: drafts.filter(d => d.recommendedChannel === 'sms').length,
    call_prep: drafts.filter(d => d.recommendedChannel === 'call_prep').length,
    voicemail: drafts.filter(d => d.recommendedChannel === 'voicemail').length,
  };

  const urgent = pending.filter(d => d.urgency === 'overdue' || d.urgency === 'today');

  return (
    <div className="space-y-6">
      {/* Status tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pending Review', value: pending.length, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Reviewed', value: reviewed.length, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Used', value: used.length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Discarded', value: discarded.length, color: 'text-zinc-500', bg: 'bg-zinc-50' },
        ].map(t => (
          <div key={t.label} className={`${t.bg} dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4`}>
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide mb-2">{t.label}</p>
            <p className={`text-2xl font-bold ${t.color}`}>{t.value}</p>
          </div>
        ))}
      </div>

      {/* Channel breakdown */}
      <div className="grid grid-cols-4 gap-2">
        {([['email', Mail], ['sms', MessageSquare], ['call_prep', Phone], ['voicemail', Voicemail]] as const).map(([ch, Icon]) => (
          <div key={ch} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-2">
            <Icon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-zinc-400">{CHANNEL_LABELS[ch]}</p>
              <p className="text-lg font-bold text-zinc-700 dark:text-zinc-300">{byChannel[ch]}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Urgent drafts */}
      {urgent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-orange-500" />
            Overdue &amp; Today — Review First
          </h3>
          <DraftCardList
            drafts={urgent.slice(0, 5)}
            dispatch={dispatch}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
          />
        </div>
      )}

      {urgent.length === 0 && pending.length === 0 && (
        <div className="text-center py-10 text-zinc-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-400 opacity-60" />
          <p className="text-sm font-medium text-zinc-500">All drafts reviewed</p>
          <p className="text-xs mt-1">No pending drafts. Check the All Drafts tab for history.</p>
        </div>
      )}
    </div>
  );
}

// ── Filterable List Tab ───────────────────────────────────────────────────────

function FilteredDraftTab({
  drafts,
  dispatch,
  expandedId,
  setExpandedId,
  entityTypeFilter,
}: {
  drafts: CommunicationDraft[];
  dispatch: React.Dispatch<DraftAction>;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  entityTypeFilter?: 'lead' | 'client';
}) {
  const [intentFilter, setIntentFilter] = useState<CommunicationIntent | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<DraftStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<CommunicationChannel | 'all'>('all');

  const filtered = drafts.filter(d => {
    if (entityTypeFilter && d.entityType !== entityTypeFilter) return false;
    if (intentFilter !== 'all' && d.intent !== intentFilter) return false;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (channelFilter !== 'all' && d.recommendedChannel !== channelFilter) return false;
    return true;
  });

  const uniqueIntents = [...new Set(drafts.map(d => d.intent))];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-1">
          <label className="text-xs font-medium text-zinc-500 mr-1">Status:</label>
          {(['all', 'draft', 'reviewed', 'used', 'discarded'] as const).map(v => (
            <button
              key={v}
              data-testid={`comms-status-filter-${v}`}
              onClick={() => setStatusFilter(v)}
              className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                statusFilter === v
                  ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {v === 'all' ? 'All' : DRAFT_STATUS_LABELS[v]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <label className="text-xs font-medium text-zinc-500 mr-1">Channel:</label>
          {(['all', 'email', 'sms', 'call_prep', 'voicemail'] as const).map(v => (
            <button
              key={v}
              data-testid={`comms-channel-filter-${v}`}
              onClick={() => setChannelFilter(v)}
              className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
                channelFilter === v
                  ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {v === 'all' ? 'All' : CHANNEL_LABELS[v]}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-400 self-center">{filtered.length} draft{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <DraftCardList
        drafts={filtered}
        dispatch={dispatch}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
      />
    </div>
  );
}

// ── Inspection Tab ────────────────────────────────────────────────────────────

function InspectionTab({ drafts }: { drafts: CommunicationDraft[] }) {
  const inspections = useMemo(() => buildInspections(drafts), [drafts]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400">{inspections.length} draft records</p>
      {inspections.map(i => (
        <div
          key={i.draftId}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{i.entityName}</span>
              <span className="mx-2 text-zinc-300">·</span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${INTENT_COLORS[i.intent]}`}>
                {INTENT_LABELS[i.intent]}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                i.status === 'used' ? 'bg-emerald-100 text-emerald-700'
                : i.status === 'reviewed' ? 'bg-blue-100 text-blue-700'
                : i.status === 'discarded' ? 'bg-zinc-100 text-zinc-500'
                : 'bg-amber-100 text-amber-700'
              }`}>
                {DRAFT_STATUS_LABELS[i.status]}
              </span>
              <span className="text-[10px] text-zinc-400">{i.generatedAt}</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500 mb-2">{i.whyCreated}</p>
          <div className="flex flex-wrap gap-3 text-[10px] text-zinc-400">
            <span>Signal: {i.signal}</span>
            <span>·</span>
            <span>Recommended: {CHANNEL_LABELS[i.recommendedChannel]}</span>
            <span>·</span>
            <span>Channels: {i.channels.map(c => CHANNEL_LABELS[c]).join(', ')}</span>
            {i.usedChannel && <><span>·</span><span className="text-emerald-600">Used via {CHANNEL_LABELS[i.usedChannel]} on {i.usedAt}</span></>}
          </div>
          <p className="text-[10px] text-zinc-400 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <strong>Goal:</strong> {i.outcomeGoal}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Main Workspace ────────────────────────────────────────────────────────────

export function CommsWorkspace() {
  const leads = useSelector((state: RootState) => state.app.leads);
  const clients = useSelector((state: RootState) => state.app.clients);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [overrides, dispatch] = useReducer(draftReducer, {});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const cadenceState = useMemo(() => deriveCadenceState(leads, clients), [leads, clients]);

  const rawDrafts = useMemo(
    () => buildDraftsFromQueue(cadenceState.allItems, leads, clients),
    [cadenceState, leads, clients],
  );

  const drafts = useMemo(() => applyDraftOverrides(rawDrafts, overrides), [rawDrafts, overrides]);

  const tabBadges: Partial<Record<WorkspaceTab, number>> = {
    all: drafts.filter(d => d.status === 'draft').length,
    sales: drafts.filter(d => d.entityType === 'lead' && d.status === 'draft').length,
    accounts: drafts.filter(d => d.entityType === 'client' && d.status === 'draft').length,
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Mail className="w-5 h-5 text-violet-600" />
              Communication Drafts
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Stage-aware drafts for every cadence item — email, SMS, call prep, and voicemail. Human-reviewed by default.
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-violet-600">{drafts.filter(d => d.status === 'draft').length}</div>
            <div className="text-xs text-zinc-400">pending review</div>
          </div>
        </div>

        <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
          {TABS.map(tab => {
            const badge = tabBadges[tab.id];
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                data-testid={`comms-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'border-violet-600 text-violet-600'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {badge !== undefined && badge > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-violet-100 text-violet-700' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="text-xs text-zinc-400 mb-4">
          {drafts.length} draft{drafts.length !== 1 ? 's' : ''} generated from {cadenceState.totalPending} active cadence items
          · {format(new Date(), 'dd/MM/yyyy HH:mm')}
        </div>

        {activeTab === 'overview' && (
          <OverviewTab drafts={drafts} dispatch={dispatch} expandedId={expandedId} setExpandedId={setExpandedId} />
        )}
        {activeTab === 'all' && (
          <FilteredDraftTab drafts={drafts} dispatch={dispatch} expandedId={expandedId} setExpandedId={setExpandedId} />
        )}
        {activeTab === 'sales' && (
          <FilteredDraftTab
            drafts={drafts}
            dispatch={dispatch}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            entityTypeFilter="lead"
          />
        )}
        {activeTab === 'accounts' && (
          <FilteredDraftTab
            drafts={drafts}
            dispatch={dispatch}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            entityTypeFilter="client"
          />
        )}
        {activeTab === 'inspection' && <InspectionTab drafts={drafts} />}
      </div>
    </div>
  );
}
