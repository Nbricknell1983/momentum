import type { CommunicationChannel } from '@/lib/commsTypes';

export type ExecutionChannel = CommunicationChannel;

export type ExecutionItemStatus =
  | 'idle'
  | 'draft_open'
  | 'approved'
  | 'sent'
  | 'manually_sent'
  | 'cancelled'
  | 'failed';

export type SendMethod = 'mailto' | 'sms_app' | 'clipboard' | 'manual_log';

export interface ExecutionItemLocalState {
  status: ExecutionItemStatus;
  selectedChannel: ExecutionChannel;
  editedBody: string;
  editedSubject: string;
  sentAt?: string;
  sendMethod?: SendMethod;
  sendNote?: string;
  failureReason?: string;
  draft?: {
    body: string;
    subject?: string;
    entityName: string;
    intent: string;
    whyCreated: string;
    recommendedChannel: ExecutionChannel;
  };
}

export type QueueAction =
  | { type: 'open_draft'; id: string; draft: ExecutionItemLocalState['draft'] }
  | { type: 'set_channel'; id: string; channel: ExecutionChannel }
  | { type: 'edit_body'; id: string; body: string }
  | { type: 'edit_subject'; id: string; subject: string }
  | { type: 'approve'; id: string }
  | { type: 'mark_sent'; id: string; sentAt: string; method: SendMethod; note?: string }
  | { type: 'mark_manual'; id: string; sentAt: string }
  | { type: 'mark_failed'; id: string; reason: string }
  | { type: 'cancel'; id: string }
  | { type: 'restore'; id: string };

export type QueueState = Record<string, ExecutionItemLocalState>;

export interface CommunicationHistoryItem {
  id?: string;
  orgId: string;
  entityId: string;
  entityType: 'lead' | 'client';
  entityName: string;
  channel: ExecutionChannel;
  summary: string;
  subject?: string;
  bodySnippet: string;
  sentAt: string;
  sentBy: string;
  method: SendMethod | 'manual';
  linkedCadenceItemId?: string;
  cadenceTitle?: string;
  status: 'sent' | 'manually_sent' | 'failed';
  failureReason?: string;
}

export interface ChannelIntegrationState {
  channel: ExecutionChannel;
  isAvailable: boolean;
  method: SendMethod | 'not_configured';
  label: string;
  sendLabel: string;
  description: string;
  missingConfig: string[];
  notes: string;
}

export interface ExecutionSendResult {
  success: boolean;
  method: SendMethod;
  sentAt: string;
  note?: string;
  errorReason?: string;
}
