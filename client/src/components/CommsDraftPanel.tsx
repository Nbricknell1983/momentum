/**
 * CommsDraftPanel — Embeddable Draft Review Panel
 *
 * Shows all 4 channel drafts (Email / SMS / Call Prep / Voicemail) for a single
 * CommunicationDraft. Allows switching channels, editing, copying, and marking as used.
 * Includes a full explanation section.
 *
 * Can be embedded in:
 * - CadenceWorkspace (per-item)
 * - CommsWorkspace (full workspace)
 * - LeadFocusView (future)
 * - ExpansionWorkspace (future)
 */

import { useState, useCallback } from 'react';
import {
  CommunicationDraft,
  CommunicationChannel,
  CHANNEL_LABELS,
  INTENT_LABELS,
  INTENT_COLORS,
  DRAFT_STATUS_LABELS,
} from '@/lib/commsTypes';
import {
  CheckCircle2, Copy, Edit3, RefreshCw, X,
  ChevronDown, ChevronRight, Info, Zap,
  Mail, MessageSquare, Phone, Voicemail,
} from 'lucide-react';

// ── Channel Icons ─────────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<CommunicationChannel, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  sms: MessageSquare,
  call_prep: Phone,
  voicemail: Voicemail,
};

// ── Draft State Actions ───────────────────────────────────────────────────────

export type DraftAction =
  | { type: 'set_channel'; draftId: string; channel: CommunicationChannel }
  | { type: 'edit_body'; draftId: string; channel: CommunicationChannel; body: string }
  | { type: 'mark_used'; draftId: string; channel: CommunicationChannel }
  | { type: 'mark_reviewed'; draftId: string }
  | { type: 'discard'; draftId: string }
  | { type: 'restore'; draftId: string };

interface CommsDraftPanelProps {
  draft: CommunicationDraft;
  dispatch: (action: DraftAction) => void;
  onClose?: () => void;
  compact?: boolean;
}

export function CommsDraftPanel({ draft, dispatch, onClose, compact = false }: CommsDraftPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [copied, setCopied] = useState(false);
  const [showExplanation, setShowExplanation] = useState(!compact);

  const activeChannel = draft.activeChannel;
  const channelDraft = draft.channels[activeChannel];
  const currentBody = draft.editedBodies[activeChannel] ?? channelDraft?.body ?? '';

  const handleCopy = useCallback(() => {
    const content = [
      channelDraft?.subject ? `Subject: ${channelDraft.subject}\n\n` : '',
      currentBody,
    ].join('');
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [channelDraft, currentBody]);

  const handleStartEdit = () => {
    setEditValue(currentBody);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    dispatch({ type: 'edit_body', draftId: draft.id, channel: activeChannel, body: editValue });
    setIsEditing(false);
  };

  const handleMarkUsed = () => {
    dispatch({ type: 'mark_used', draftId: draft.id, channel: activeChannel });
  };

  const isEdited = !!draft.editedBodies[activeChannel];
  const isUsed = draft.status === 'used';
  const isDiscarded = draft.status === 'discarded';

  return (
    <div
      data-testid={`draft-panel-${draft.id}`}
      className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl ${compact ? '' : 'shadow-md'}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${INTENT_COLORS[draft.intent]}`}>
              {INTENT_LABELS[draft.intent]}
            </span>
            {isUsed && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-700">
                Used via {CHANNEL_LABELS[draft.usedChannel!]}
              </span>
            )}
            {isDiscarded && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-500">
                Discarded
              </span>
            )}
            {isEdited && !isUsed && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-600">
                Edited
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{draft.entityName}</h3>
          <p className="text-xs text-zinc-400 mt-0.5">Generated {draft.generatedAt}</p>
        </div>
        {onClose && (
          <button
            data-testid={`draft-close-${draft.id}`}
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Channel tabs */}
      <div className="flex border-b border-zinc-100 dark:border-zinc-800 px-4 gap-0.5 overflow-x-auto">
        {(Object.keys(draft.channels) as CommunicationChannel[]).map(channel => {
          const Icon = CHANNEL_ICON[channel];
          const isActive = activeChannel === channel;
          const isRecommended = draft.recommendedChannel === channel;
          return (
            <button
              key={channel}
              data-testid={`draft-channel-${draft.id}-${channel}`}
              onClick={() => dispatch({ type: 'set_channel', draftId: draft.id, channel })}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {CHANNEL_LABELS[channel]}
              {isRecommended && !isActive && (
                <span className="text-[10px] bg-violet-50 text-violet-600 px-1 rounded">✦</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Draft body */}
      <div className="p-4">
        {channelDraft ? (
          <>
            {/* Subject line for email */}
            {activeChannel === 'email' && channelDraft.subject && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Subject Line</p>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 rounded px-3 py-2">
                  {channelDraft.subject}
                </p>
              </div>
            )}

            {/* Voicemail duration */}
            {activeChannel === 'voicemail' && channelDraft.estimatedDuration && (
              <p className="text-[11px] text-zinc-400 mb-2">Estimated: {channelDraft.estimatedDuration}</p>
            )}

            {/* Body */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                  {activeChannel === 'call_prep' ? 'Preparation Notes' : 'Draft'}
                </p>
                {isEdited && (
                  <span className="text-[10px] text-blue-500">Your edits applied</span>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    data-testid={`draft-edit-textarea-${draft.id}`}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    className="w-full text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 border border-violet-300 rounded-lg p-3 resize-y min-h-[160px] font-mono focus:outline-none focus:ring-1 focus:ring-violet-400"
                    rows={10}
                  />
                  <div className="flex gap-2">
                    <button
                      data-testid={`draft-save-edit-${draft.id}`}
                      onClick={handleSaveEdit}
                      className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700"
                    >
                      Save edits
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="text-xs px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-lg font-medium hover:bg-zinc-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg p-3 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {currentBody}
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="flex items-center gap-3 text-[11px] text-zinc-400 mb-4">
              <span>Tone: {channelDraft.tone}</span>
              <span>·</span>
              <span>CTA: {channelDraft.cta}</span>
            </div>

            {/* Actions */}
            {!isUsed && !isDiscarded && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  data-testid={`draft-copy-${draft.id}`}
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    copied
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                  }`}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>

                {!isEditing && (
                  <button
                    data-testid={`draft-edit-${draft.id}`}
                    onClick={handleStartEdit}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}

                <button
                  data-testid={`draft-mark-used-${draft.id}`}
                  onClick={handleMarkUsed}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark as used
                </button>

                <button
                  data-testid={`draft-discard-${draft.id}`}
                  onClick={() => dispatch({ type: 'discard', draftId: draft.id })}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-zinc-50 text-zinc-400 hover:bg-zinc-100"
                >
                  <X className="w-3.5 h-3.5" />
                  Discard
                </button>
              </div>
            )}

            {(isUsed || isDiscarded) && (
              <button
                data-testid={`draft-restore-${draft.id}`}
                onClick={() => dispatch({ type: 'restore', draftId: draft.id })}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-zinc-50 text-zinc-500 hover:bg-zinc-100"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restore draft
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-zinc-400 py-4 text-center">No draft for this channel.</p>
        )}
      </div>

      {/* Asset reference */}
      {draft.assetReference && (
        <div className="mx-4 mb-4 bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900 rounded-lg px-3 py-2">
          <p className="text-[11px] font-semibold text-violet-600 mb-0.5">Asset to Reference</p>
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{draft.assetReference.label}</p>
          <p className="text-xs text-zinc-500">{draft.assetReference.description}</p>
        </div>
      )}

      {/* Outcome goal */}
      <div className="mx-4 mb-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
        <p className="text-[11px] font-semibold text-emerald-600 mb-0.5 flex items-center gap-1">
          <Zap className="w-3 h-3" /> Outcome Goal
        </p>
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{draft.outcomeGoal.primary}</p>
        {draft.outcomeGoal.secondary && (
          <p className="text-xs text-zinc-500 mt-0.5">{draft.outcomeGoal.secondary}</p>
        )}
        <p className="text-[10px] text-zinc-400 mt-1">Timeframe: {draft.outcomeGoal.timeframe}</p>
      </div>

      {/* Explanation toggle */}
      <div className="border-t border-zinc-100 dark:border-zinc-800">
        <button
          data-testid={`draft-explanation-toggle-${draft.id}`}
          onClick={() => setShowExplanation(e => !e)}
          className="flex items-center gap-2 w-full px-4 py-3 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          <Info className="w-3.5 h-3.5" />
          {showExplanation ? 'Hide explanation' : 'Why was this draft created?'}
          {showExplanation ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
        </button>

        {showExplanation && (
          <div className="px-4 pb-4 space-y-3">
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Why this draft exists</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{draft.whyCreated}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Signal that triggered it</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{draft.whatSignalTriggered}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Why {CHANNEL_LABELS[draft.recommendedChannel]} is recommended</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{draft.whyChannelChosen}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">If this succeeds</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{draft.outcomeIfSuccessful}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">Stage context</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{draft.stageContext}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
