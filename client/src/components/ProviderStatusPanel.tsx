import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  AlertTriangle,
  X,
  Mail,
  MessageSquare,
  Webhook,
  Clock,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { ProviderHealthSummary, SendAttemptRecord } from '@/lib/providerTypes';
import { DELIVERY_STATUS_LABELS, DELIVERY_STATUS_STYLES, PROVIDER_LABELS } from '@/lib/providerTypes';

// ── Config item ───────────────────────────────────────────────────────────────

function ConfigRow({ label, configured, missing }: { label: string; configured: boolean; missing: string[] }) {
  return (
    <div className={`p-4 border rounded-xl ${configured ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950'}`}>
      <div className="flex items-center gap-2 mb-1">
        {configured
          ? <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          : <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        }
        <span className={`text-sm font-semibold ${configured ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-800 dark:text-amber-200'}`}>
          {label} — {configured ? 'Configured' : 'Not Configured'}
        </span>
      </div>
      {!configured && missing.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Missing environment secrets:</p>
          {missing.map(m => (
            <p key={m} className="text-xs font-mono text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-900 px-2 py-1 rounded">
              {m}
            </p>
          ))}
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            Add these as Replit environment secrets to enable real sending.
          </p>
        </div>
      )}
      {configured && (
        <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
          All required credentials are present. Provider is active.
        </p>
      )}
    </div>
  );
}

// ── Attempt row ───────────────────────────────────────────────────────────────

function AttemptRow({ attempt }: { attempt: SendAttemptRecord }) {
  const deliveryStyle = DELIVERY_STATUS_STYLES[attempt.deliveryStatus as any] ?? DELIVERY_STATUS_STYLES.not_configured;
  const deliveryLabel = DELIVERY_STATUS_LABELS[attempt.deliveryStatus as any] ?? attempt.deliveryStatus;

  return (
    <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="flex items-start gap-3">
        {attempt.channel === 'email'
          ? <Mail className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
          : <MessageSquare className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0 mt-0.5" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">{attempt.to}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${deliveryStyle}`}>
              {deliveryLabel}
            </span>
            <span className="text-[10px] text-zinc-400">{PROVIDER_LABELS[attempt.provider] ?? attempt.provider}</span>
          </div>
          {attempt.entityName && <p className="text-[11px] text-zinc-500 mt-0.5">{attempt.entityName}</p>}
          {attempt.errorReason && (
            <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5">Error: {attempt.errorReason}</p>
          )}
          <p className="text-[10px] text-zinc-400 mt-0.5">{attempt.sentAt} · {attempt.sentBy}</p>
          {attempt.messageId && (
            <p className="text-[10px] font-mono text-zinc-400 truncate mt-0.5">ID: {attempt.messageId}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProviderStatusPanel() {
  const { orgId } = useAuth();

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<ProviderHealthSummary>({
    queryKey: [`/api/orgs/${orgId}/send/status`],
    enabled: !!orgId,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{ attempts: SendAttemptRecord[] }>({
    queryKey: [`/api/orgs/${orgId}/send/history`],
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const attempts: SendAttemptRecord[] = historyData?.attempts ?? [];
  const emailHealth = healthData?.email;
  const smsHealth   = healthData?.sms;

  const emailConfigured = emailHealth?.configured ?? false;
  const smsConfigured   = smsHealth?.configured ?? false;

  const recentFailures = attempts.filter(a => a.deliveryStatus === 'failed' || a.deliveryStatus === 'bounced' || a.deliveryStatus === 'rejected');

  return (
    <div className="space-y-6">

      {/* Provider config */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Provider Configuration</p>
          <button
            onClick={() => refetchHealth()}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            data-testid="provider-refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {healthLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <div key={i} className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-3">
            <ConfigRow
              label="Email — Resend"
              configured={emailConfigured}
              missing={emailHealth?.missing ?? ['RESEND_API_KEY', 'RESEND_FROM_EMAIL']}
            />
            <ConfigRow
              label="SMS — Twilio"
              configured={smsConfigured}
              missing={smsHealth?.missing ?? ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']}
            />
          </div>
        )}
      </div>

      {/* Webhook URLs */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">Webhook Endpoints</p>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-0.5">Resend Delivery Events</p>
            <p className="text-[11px] font-mono text-zinc-500 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 rounded">
              POST /api/send/webhook/resend
            </p>
            <p className="text-[10px] text-zinc-400 mt-1">
              Configure in Resend dashboard → Webhooks. Add your domain + this path.
              Events: email.sent, email.delivered, email.bounced.
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-0.5">Twilio Status Callbacks</p>
            <p className="text-[11px] font-mono text-zinc-500 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 rounded">
              POST /api/send/webhook/twilio
            </p>
            <p className="text-[10px] text-zinc-400 mt-1">
              Configure in Twilio console → Phone Numbers → Active Numbers → SMS Status Callback.
            </p>
          </div>
        </div>
      </div>

      {/* Fallback summary */}
      <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
        <p className="font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Fallback behaviour</p>
        <p>· <strong>Email not configured</strong> → falls back to your local email client (mailto:)</p>
        <p>· <strong>SMS not configured</strong> → falls back to SMS app or clipboard</p>
        <p>· <strong>Call / Voicemail</strong> → always manual reference + outcome log (no provider available)</p>
        <p>· All fallbacks are explicit — nothing is faked or hidden</p>
      </div>

      {/* Recent failures */}
      {recentFailures.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-500 dark:text-red-400 mb-2">
            Recent Failures ({recentFailures.length})
          </p>
          <div className="bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-800 rounded-xl overflow-hidden">
            {recentFailures.map((a, i) => <AttemptRow key={a.id ?? i} attempt={a} />)}
          </div>
        </div>
      )}

      {/* Send history */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-3">
          Recent Send Attempts ({attempts.length})
        </p>
        {historyLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />)}
          </div>
        ) : attempts.length === 0 ? (
          <div className="text-center py-10">
            <Clock className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No send attempts yet</p>
            <p className="text-xs text-zinc-400 mt-1">Provider sends are tracked here automatically.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            {attempts.map((a, i) => <AttemptRow key={a.id ?? i} attempt={a} />)}
          </div>
        )}
      </div>

    </div>
  );
}
