import { useReducer, useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  Send,
  CheckCircle,
  Clock,
  AlertTriangle,
  Radio,
  Mail,
  MessageSquare,
  Phone,
  Voicemail,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  X,
  History,
  Info,
  ArrowRight,
  Loader2,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import type { RootState } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { db, collection, addDoc, query, orderBy, limit, onSnapshot } from '@/lib/firebase';
import { deriveCadenceState } from '@/lib/cadenceAdapter';
import { buildDraftFromCadenceItem } from '@/lib/commsAdapter';
import type { CadenceQueueItem } from '@/lib/cadenceTypes';
import { CHANNEL_STATES, sendViaChannel, sendViaProvider } from '@/lib/channelAdapters';
import ProviderStatusPanel from '@/components/ProviderStatusPanel';
import type {
  QueueState,
  QueueAction,
  ExecutionChannel,
  ExecutionItemLocalState,
  CommunicationHistoryItem,
  SendMethod,
} from '@/lib/execAutomationTypes';

// ── reducer ───────────────────────────────────────────────────────────────────

function queueReducer(state: QueueState, action: QueueAction): QueueState {
  const prev = state[action.id] ?? defaultItemState();

  switch (action.type) {
    case 'open_draft':
      return {
        ...state,
        [action.id]: {
          ...prev,
          status: 'draft_open',
          draft: action.draft,
          selectedChannel: action.draft?.recommendedChannel ?? 'email',
          editedBody: action.draft?.body ?? '',
          editedSubject: action.draft?.subject ?? '',
        },
      };
    case 'set_channel':
      return { ...state, [action.id]: { ...prev, selectedChannel: action.channel } };
    case 'edit_body':
      return { ...state, [action.id]: { ...prev, editedBody: action.body } };
    case 'edit_subject':
      return { ...state, [action.id]: { ...prev, editedSubject: action.subject } };
    case 'approve':
      return { ...state, [action.id]: { ...prev, status: 'approved' } };
    case 'mark_sent':
      return { ...state, [action.id]: { ...prev, status: 'sent', sentAt: action.sentAt, sendMethod: action.method, sendNote: action.note } };
    case 'mark_manual':
      return { ...state, [action.id]: { ...prev, status: 'manually_sent', sentAt: action.sentAt } };
    case 'mark_failed':
      return { ...state, [action.id]: { ...prev, status: 'failed', failureReason: action.reason } };
    case 'cancel':
      return { ...state, [action.id]: { ...prev, status: 'cancelled' } };
    case 'restore':
      return { ...state, [action.id]: { ...prev, status: prev.draft ? 'draft_open' : 'idle' } };
    default:
      return state;
  }
}

function defaultItemState(): ExecutionItemLocalState {
  return {
    status: 'idle',
    selectedChannel: 'email',
    editedBody: '',
    editedSubject: '',
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<ExecutionChannel, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  call: Phone,
  voicemail: Voicemail,
};

const CHANNEL_LABELS: Record<ExecutionChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  call: 'Call Prep',
  voicemail: 'Voicemail',
};

const URGENCY_STYLES: Record<string, string> = {
  overdue: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
  today: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800',
  this_week: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
  upcoming: 'text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700',
};

const URGENCY_LABELS: Record<string, string> = {
  overdue: 'Overdue',
  today: 'Due Today',
  this_week: 'This Week',
  upcoming: 'Upcoming',
};

function nowLabel(): string {
  return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

// ── QueueItemCard ─────────────────────────────────────────────────────────────

interface QueueItemCardProps {
  item: CadenceQueueItem;
  localState: ExecutionItemLocalState;
  dispatch: React.Dispatch<QueueAction>;
  leads: RootState['app']['leads'];
  clients: RootState['app']['clients'];
  onHistoryWrite: (record: Omit<CommunicationHistoryItem, 'id'>) => Promise<void>;
  orgId: string;
  userName: string;
}

function QueueItemCard({ item, localState, dispatch, leads, clients, onHistoryWrite, orgId, userName }: QueueItemCardProps) {
  const [copying, setCopying] = useState(false);
  const [sending, setSending] = useState(false);

  const ChannelIcon = CHANNEL_ICONS[localState.selectedChannel];

  const handleGenerateDraft = useCallback(() => {
    const draft = buildDraftFromCadenceItem(item, leads, clients);
    if (!draft) return;
    const ch = localState.selectedChannel;
    const channelDraft = draft.channels[ch] ?? draft.channels[draft.recommendedChannel];
    dispatch({
      type: 'open_draft',
      id: item.id,
      draft: {
        body: channelDraft?.body ?? '',
        subject: channelDraft?.subject,
        entityName: item.entityName,
        intent: draft.intent,
        whyCreated: draft.whyCreated,
        recommendedChannel: draft.recommendedChannel,
      },
    });
  }, [item, leads, clients, localState.selectedChannel, dispatch]);

  const handleChannelChange = useCallback((ch: ExecutionChannel) => {
    dispatch({ type: 'set_channel', id: item.id, channel: ch });
    if (localState.draft) {
      const comsDraft = buildDraftFromCadenceItem(item, leads, clients);
      if (!comsDraft) return;
      const channelDraft = comsDraft.channels[ch] ?? comsDraft.channels[comsDraft.recommendedChannel];
      dispatch({ type: 'open_draft', id: item.id, draft: { ...localState.draft!, body: channelDraft?.body ?? '', subject: channelDraft?.subject, recommendedChannel: ch } });
    }
  }, [dispatch, item, leads, clients, localState.draft]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(localState.editedBody).catch(() => {});
    setCopying(true);
    setTimeout(() => setCopying(false), 1500);
  }, [localState.editedBody]);

  const handleSend = useCallback(async () => {
    setSending(true);
    try {
      const ch = localState.selectedChannel;

      // Try real provider first for email and SMS
      if ((ch === 'email' || ch === 'sms') && orgId) {
        const entity = [...(leads as any[]), ...(clients as any[])].find((e: any) => e.id === item.entityId) as any;
        const to = ch === 'email'
          ? (entity?.email ?? entity?.contactEmail ?? '')
          : (entity?.phone ?? entity?.contactPhone ?? '');

        const provResult = await sendViaProvider(ch, {
          to,
          subject: localState.editedSubject,
          body: localState.editedBody,
        }, orgId, item.entityId, item.entityName);

        if (provResult && !provResult.notConfigured) {
          const method = (ch === 'email' ? 'provider_email' : 'provider_sms') as SendMethod;
          if (provResult.success) {
            dispatch({ type: 'mark_sent', id: item.id, sentAt: provResult.sentAt, method, note: `Sent via ${provResult.provider}` });
            await onHistoryWrite({
              orgId: '',
              entityId: item.entityId,
              entityType: item.entityType,
              entityName: item.entityName,
              channel: ch,
              summary: item.title,
              subject: localState.editedSubject,
              bodySnippet: localState.editedBody.slice(0, 200),
              sentAt: provResult.sentAt,
              sentBy: userName,
              method,
              linkedCadenceItemId: item.id,
              cadenceTitle: item.title,
              status: 'sent',
              deliveryStatus: provResult.deliveryStatus,
              providerMessageId: provResult.messageId,
              providerName: provResult.provider,
            });
            return;
          } else {
            dispatch({ type: 'mark_failed', id: item.id, reason: provResult.errorReason ?? 'Provider send failed' });
            return;
          }
        }
        // provResult null or notConfigured → fall through to channel fallback below
      }

      // Fallback: open email client / SMS app / clipboard
      const result = await sendViaChannel(ch, {
        subject: localState.editedSubject,
        body: localState.editedBody,
      });

      if (result.success) {
        dispatch({ type: 'mark_sent', id: item.id, sentAt: result.sentAt, method: result.method as SendMethod, note: result.note });
        await onHistoryWrite({
          orgId: '',
          entityId: item.entityId,
          entityType: item.entityType,
          entityName: item.entityName,
          channel: ch,
          summary: item.title,
          subject: localState.editedSubject,
          bodySnippet: localState.editedBody.slice(0, 200),
          sentAt: result.sentAt,
          sentBy: userName,
          method: result.method as SendMethod,
          linkedCadenceItemId: item.id,
          cadenceTitle: item.title,
          status: 'sent',
        });
      } else {
        dispatch({ type: 'mark_failed', id: item.id, reason: result.errorReason ?? 'Unknown error' });
      }
    } catch (err: unknown) {
      dispatch({ type: 'mark_failed', id: item.id, reason: err instanceof Error ? err.message : 'Unexpected error' });
    } finally {
      setSending(false);
    }
  }, [localState, item, dispatch, onHistoryWrite, orgId, leads, clients, userName]);

  const handleMarkManual = useCallback(async () => {
    const at = nowLabel();
    dispatch({ type: 'mark_manual', id: item.id, sentAt: at });
    await onHistoryWrite({
      orgId: '',
      entityId: item.entityId,
      entityType: item.entityType,
      entityName: item.entityName,
      channel: localState.selectedChannel,
      summary: item.title,
      subject: localState.editedSubject,
      bodySnippet: localState.editedBody.slice(0, 200),
      sentAt: at,
      sentBy: userName,
      method: 'manual',
      linkedCadenceItemId: item.id,
      cadenceTitle: item.title,
      status: 'manually_sent',
    });
  }, [localState, item, dispatch, onHistoryWrite, userName]);

  const isSent = localState.status === 'sent' || localState.status === 'manually_sent';
  const isCancelled = localState.status === 'cancelled';
  const isDraftOpen = localState.status === 'draft_open' || localState.status === 'approved';
  const isApproved = localState.status === 'approved';

  if (isSent) {
    return (
      <div data-testid={`exec-queue-item-${item.id}`} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 opacity-60">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{item.entityName} — {item.title}</span>
          <span className="ml-auto text-xs text-zinc-400">{localState.sentAt}</span>
        </div>
        <p className="text-xs text-zinc-500 mt-1 ml-6">
          {localState.status === 'manually_sent' ? 'Marked as sent manually' : `Sent via ${CHANNEL_LABELS[localState.selectedChannel]}`}
          {localState.sendNote && ` · ${localState.sendNote}`}
        </p>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div data-testid={`exec-queue-item-${item.id}`} className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 opacity-50">
        <div className="flex items-center gap-2">
          <X className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <span className="text-xs text-zinc-500">{item.entityName} — {item.title} (skipped)</span>
          <button onClick={() => dispatch({ type: 'restore', id: item.id })} className="ml-auto text-xs text-violet-600 dark:text-violet-400 hover:underline">
            Restore
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`exec-queue-item-${item.id}`}
      className={`bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden transition-all ${
        isApproved
          ? 'border-emerald-300 dark:border-emerald-700 ring-1 ring-emerald-200 dark:ring-emerald-900'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      {/* Item header */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${URGENCY_STYLES[item.urgency] ?? URGENCY_STYLES.upcoming}`}>
              {URGENCY_LABELS[item.urgency] ?? item.urgency}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">{item.entityType}</span>
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">{item.entityName}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{item.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isApproved && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded">
              <CheckCircle className="w-3 h-3" /> Approved
            </span>
          )}
          <button
            data-testid={`exec-cancel-${item.id}`}
            onClick={() => dispatch({ type: 'cancel', id: item.id })}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            title="Skip this item"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Draft panel */}
      {isDraftOpen && localState.draft ? (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-3">
          {/* Why created */}
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed border-l-2 border-violet-300 dark:border-violet-700 pl-2">
            {localState.draft.whyCreated}
          </p>

          {/* Channel selector */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Channel</p>
            <div className="flex gap-2 flex-wrap">
              {(['email', 'sms', 'call', 'voicemail'] as ExecutionChannel[]).map(ch => {
                const Icon = CHANNEL_ICONS[ch];
                const isRec = ch === localState.draft?.recommendedChannel;
                return (
                  <button
                    key={ch}
                    data-testid={`exec-channel-${item.id}-${ch}`}
                    onClick={() => handleChannelChange(ch)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      localState.selectedChannel === ch
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-violet-300'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {CHANNEL_LABELS[ch]}
                    {isRec && <span className="text-[9px] opacity-70">★</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject (email only) */}
          {localState.selectedChannel === 'email' && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Subject</p>
              <input
                data-testid={`exec-subject-${item.id}`}
                type="text"
                value={localState.editedSubject}
                onChange={e => dispatch({ type: 'edit_subject', id: item.id, subject: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
            </div>
          )}

          {/* Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {localState.selectedChannel === 'call' || localState.selectedChannel === 'voicemail' ? 'Reference Notes' : 'Message'}
              </p>
              <button
                data-testid={`exec-copy-${item.id}`}
                onClick={handleCopy}
                className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
              >
                {copying ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copying ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              data-testid={`exec-body-${item.id}`}
              value={localState.editedBody}
              onChange={e => dispatch({ type: 'edit_body', id: item.id, body: e.target.value })}
              rows={localState.selectedChannel === 'sms' ? 3 : 6}
              className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none font-mono leading-relaxed"
            />
            {localState.selectedChannel === 'sms' && (
              <p className={`text-[10px] mt-1 text-right ${localState.editedBody.length > 160 ? 'text-amber-500' : 'text-zinc-400'}`}>
                {localState.editedBody.length} chars {localState.editedBody.length > 160 ? '(may split into 2 SMS)' : ''}
              </p>
            )}
          </div>

          {/* Channel note */}
          <div className="flex items-start gap-2 p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
            <Info className="w-3 h-3 text-zinc-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              {CHANNEL_STATES.find(s => s.channel === localState.selectedChannel)?.description}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {!isApproved && (
              <button
                data-testid={`exec-approve-${item.id}`}
                onClick={() => dispatch({ type: 'approve', id: item.id })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Approve
              </button>
            )}
            {isApproved && (
              <button
                data-testid={`exec-send-${item.id}`}
                onClick={handleSend}
                disabled={sending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {CHANNEL_STATES.find(s => s.channel === localState.selectedChannel)?.sendLabel ?? 'Send'}
                <ExternalLink className="w-3 h-3 opacity-60" />
              </button>
            )}
            {isApproved && (
              <button
                data-testid={`exec-mark-manual-${item.id}`}
                onClick={handleMarkManual}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Mark as Sent Manually
              </button>
            )}
            {!isApproved && (
              <button
                onClick={() => dispatch({ type: 'cancel', id: item.id })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 text-xs transition-colors"
              >
                Skip
              </button>
            )}
          </div>

          {localState.status === 'failed' && localState.failureReason && (
            <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              <p className="text-[11px] text-red-700 dark:text-red-300">{localState.failureReason}</p>
            </div>
          )}
        </div>
      ) : !isDraftOpen ? (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
          <p className="text-xs text-zinc-500 flex-1">{item.recommendedAction}</p>
          <button
            data-testid={`exec-generate-${item.id}`}
            onClick={handleGenerateDraft}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 dark:bg-violet-950 hover:bg-violet-100 dark:hover:bg-violet-900 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-lg text-xs font-semibold transition-colors flex-shrink-0"
          >
            <Mail className="w-3.5 h-3.5" />
            Generate Draft
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ── History item row ───────────────────────────────────────────────────────────

function HistoryRow({ record }: { record: CommunicationHistoryItem }) {
  const Icon = CHANNEL_ICONS[record.channel] ?? Mail;
  const methodLabel: Record<string, string> = {
    mailto: 'email client',
    sms_app: 'SMS app',
    clipboard: 'clipboard',
    manual_log: 'logged',
    manual: 'manual',
    provider_email: 'Resend',
    provider_sms: 'Twilio',
  };

  const deliveryBadge = (record as any).deliveryStatus;
  const deliveryBadgeStyle: Record<string, string> = {
    sent: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    delivered: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    failed: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    bounced: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    rejected: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
    queued: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  };

  return (
    <div data-testid={`exec-history-${record.id ?? record.sentAt}`} className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{record.entityName}</span>
            <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
              record.status === 'sent'
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : record.status === 'manually_sent'
                ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
            }`}>
              {record.status === 'manually_sent' ? 'manual' : record.status}
            </span>
            {deliveryBadge && (
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${deliveryBadgeStyle[deliveryBadge] ?? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'}`}>
                {deliveryBadge}
              </span>
            )}
            {(record as any).providerName && (
              <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                {(record as any).providerName}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{record.summary}</p>
          {record.bodySnippet && (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 truncate">{record.bodySnippet}</p>
          )}
          <div className="flex items-center gap-3 mt-1 text-[10px] text-zinc-400 flex-wrap">
            <span>{record.sentAt}</span>
            <span>by {record.sentBy}</span>
            <span>via {methodLabel[record.method] ?? record.method}</span>
            {record.cadenceTitle && <span>· {record.cadenceTitle}</span>}
            {(record as any).providerMessageId && (
              <span className="font-mono truncate max-w-[140px]">ID: {(record as any).providerMessageId}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Channel status tile ────────────────────────────────────────────────────────

function ChannelTile({ state }: { state: (typeof CHANNEL_STATES)[0] }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CHANNEL_ICONS[state.channel];

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${state.isAvailable ? 'bg-emerald-100 dark:bg-emerald-950' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
          <Icon className={`w-4 h-4 ${state.isAvailable ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{state.label}</span>
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${
              state.isAvailable
                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
            }`}>
              {state.isAvailable ? 'Available' : 'Not configured'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{state.sendLabel} · {state.method}</p>
        </div>
        <button onClick={() => setExpanded(e => !e)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-3 space-y-2">
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{state.description}</p>
          <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
            <p className="text-[11px] text-zinc-500 leading-relaxed">{state.notes}</p>
          </div>
          {state.missingConfig.length > 0 && (
            <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 mb-1">Missing configuration:</p>
                {state.missingConfig.map(c => (
                  <p key={c} className="text-[11px] text-amber-700 dark:text-amber-300 font-mono">{c}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = 'queue' | 'approved' | 'sent' | 'channels' | 'provider';

const TABS: { id: Tab; label: string; icon: typeof Send }[] = [
  { id: 'queue', label: 'Queue', icon: Clock },
  { id: 'approved', label: 'Approved', icon: ShieldCheck },
  { id: 'sent', label: 'Sent', icon: CheckCircle },
  { id: 'channels', label: 'Channels', icon: Radio },
  { id: 'provider', label: 'Provider', icon: ExternalLink },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function ExecutionQueue() {
  const [activeTab, setActiveTab] = useState<Tab>('queue');
  const [queueState, dispatch] = useReducer(queueReducer, {} as QueueState);
  const [history, setHistory] = useState<CommunicationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const leads = useSelector((s: RootState) => s.app.leads);
  const clients = useSelector((s: RootState) => s.app.clients);
  const { orgId, user } = useAuth();
  const userName = (user as { displayName?: string | null })?.displayName ?? user?.email ?? 'Unknown';

  // ── Cadence queue derivation ─────────────────────────────────────────────
  const cadenceState = useMemo(() => deriveCadenceState(leads, clients, {}), [leads, clients]);

  const pendingItems = useMemo(
    () =>
      [...(cadenceState.byUrgency.overdue ?? []), ...(cadenceState.byUrgency.today ?? []), ...(cadenceState.byUrgency.this_week ?? [])].filter(
        i => i.status === 'pending',
      ),
    [cadenceState],
  );

  const queueItems = useMemo(
    () => pendingItems.filter(i => {
      const s = queueState[i.id];
      return !s || (s.status !== 'sent' && s.status !== 'manually_sent' && s.status !== 'cancelled');
    }),
    [pendingItems, queueState],
  );

  const approvedItems = useMemo(
    () => pendingItems.filter(i => queueState[i.id]?.status === 'approved'),
    [pendingItems, queueState],
  );

  const sentItems = useMemo(
    () => pendingItems.filter(i => queueState[i.id]?.status === 'sent' || queueState[i.id]?.status === 'manually_sent'),
    [pendingItems, queueState],
  );

  // ── Firestore history ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !db) { setHistoryLoading(false); return; }
    const ref = collection(db, 'orgs', orgId, 'commHistory');
    const q = query(ref, orderBy('sentAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, snap => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommunicationHistoryItem)));
      setHistoryLoading(false);
    }, () => setHistoryLoading(false));
    return () => unsub();
  }, [orgId]);

  const writeHistory = useCallback(async (record: Omit<CommunicationHistoryItem, 'id'>) => {
    if (!orgId || !db) return;
    try {
      await addDoc(collection(db, 'orgs', orgId, 'commHistory'), { ...record, orgId });
    } catch { /* non-fatal */ }
  }, [orgId]);

  // ── Counts for tab badges ─────────────────────────────────────────────────
  const overdueCount = cadenceState.byUrgency.overdue?.filter(i => {
    const s = queueState[i.id];
    return !s || (s.status !== 'sent' && s.status !== 'manually_sent' && s.status !== 'cancelled');
  }).length ?? 0;

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Execution Queue</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Approve, review, and log communications — all human-reviewed before sending
            </p>
          </div>
          <div className="flex items-center gap-3">
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {overdueCount} overdue
              </span>
            )}
            {approvedItems.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                {approvedItems.length} approved
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 flex-shrink-0">
        <div className="flex gap-0">
          {TABS.map(tab => {
            const count =
              tab.id === 'queue'
                ? queueItems.length
                : tab.id === 'approved'
                ? approvedItems.length
                : tab.id === 'sent'
                ? sentItems.length + history.length
                : null;
            return (
              <button
                key={tab.id}
                data-testid={`exec-queue-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {tab.label}
                {count !== null && count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id ? 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
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

        {/* Queue tab */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {queueItems.length} item{queueItems.length !== 1 ? 's' : ''} pending ·
                Generate a draft, approve, then send or mark as done manually
              </p>
            </div>
            {queueItems.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Queue is clear</p>
                <p className="text-sm text-zinc-500 mt-1">No pending or overdue cadence items requiring outreach.</p>
              </div>
            ) : (
              queueItems.map(item => (
                <QueueItemCard
                  key={item.id}
                  item={item}
                  localState={queueState[item.id] ?? defaultItemState()}
                  dispatch={dispatch}
                  leads={leads}
                  clients={clients}
                  onHistoryWrite={writeHistory}
                  orgId={orgId ?? ''}
                  userName={userName}
                />
              ))
            )}
          </div>
        )}

        {/* Approved tab */}
        {activeTab === 'approved' && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500">
              {approvedItems.length} item{approvedItems.length !== 1 ? 's' : ''} approved and ready to send.
              These have been reviewed — send at your discretion.
            </p>
            {approvedItems.length === 0 ? (
              <div className="text-center py-16">
                <ShieldCheck className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">No approved items yet</p>
                <p className="text-sm text-zinc-500 mt-1">Generate a draft in the Queue tab, then approve it to see it here.</p>
              </div>
            ) : (
              approvedItems.map(item => (
                <QueueItemCard
                  key={item.id}
                  item={item}
                  localState={queueState[item.id] ?? defaultItemState()}
                  dispatch={dispatch}
                  leads={leads}
                  clients={clients}
                  onHistoryWrite={writeHistory}
                  orgId={orgId ?? ''}
                  userName={userName}
                />
              ))
            )}
          </div>
        )}

        {/* Sent tab */}
        {activeTab === 'sent' && (
          <div className="space-y-4">
            {/* Session sent items */}
            {sentItems.length > 0 && (
              <section>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-3">This session</p>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl divide-y divide-zinc-100 dark:divide-zinc-800">
                  {sentItems.map(item => {
                    const s = queueState[item.id];
                    return (
                      <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.entityName} — {item.title}</p>
                          <p className="text-xs text-zinc-400">
                            {s?.status === 'manually_sent' ? 'Marked as sent manually' : `Sent via ${CHANNEL_LABELS[s?.selectedChannel ?? 'email']}`}
                            {s?.sentAt && ` · ${s.sentAt}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Firestore history */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Communication History
                </p>
                <span className="text-xs text-zinc-400">{history.length} records</span>
              </div>
              {historyLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Loading history...</span>
                </div>
              ) : history.length === 0 && sentItems.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No communication history yet</p>
                  <p className="text-xs text-zinc-500 mt-1">Sent and manually logged items will appear here.</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  {history.map(record => (
                    <HistoryRow key={record.id ?? record.sentAt} record={record} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Provider tab */}
        {activeTab === 'provider' && <ProviderStatusPanel />}

        {/* Channels tab */}
        {activeTab === 'channels' && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Channel integration status</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">
                  All channels use the most capable method available without needing external integrations.
                  To enable server-side sending (SMTP, Twilio, etc.), add the listed secrets as environment variables.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {CHANNEL_STATES.map(state => (
                <ChannelTile key={state.channel} state={state} />
              ))}
            </div>
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-violet-500" />
                Future integration path
              </p>
              <ul className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1.5 leading-relaxed">
                <li><span className="font-medium text-zinc-700 dark:text-zinc-300">Email:</span> Add SMTP_HOST, SMTP_USER, SMTP_PASS → enables direct server-side email via Nodemailer</li>
                <li><span className="font-medium text-zinc-700 dark:text-zinc-300">SMS:</span> Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER → enables Twilio SMS delivery</li>
                <li><span className="font-medium text-zinc-700 dark:text-zinc-300">Call:</span> Add VoIP provider credentials → enables click-to-call and automatic outcome logging</li>
                <li><span className="font-medium text-zinc-700 dark:text-zinc-300">Webhooks:</span> Add DELIVERY_WEBHOOK_URL → enables provider delivery confirmations and bounce tracking</li>
              </ul>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
