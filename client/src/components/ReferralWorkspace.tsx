import { useMemo, useState, useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import {
  Users,
  Star,
  TrendingUp,
  MessageSquare,
  Phone,
  Mail,
  CheckCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Send,
  ArrowRight,
  Loader2,
  Info,
  History,
  ShieldCheck,
  RefreshCw,
  X,
} from 'lucide-react';
import type { RootState } from '@/store';
import { useAuth } from '@/contexts/AuthContext';
import { db, collection, addDoc, query, orderBy, limit, onSnapshot, updateDoc, doc } from '@/lib/firebase';
import { deriveReferralMomentumState, generateReferralAskContent } from '@/lib/referralAdapter';
import { REFERRAL_ASK_STYLES } from '@/lib/referralTypes';
import type {
  ReferralCandidate,
  ReferralReadinessTier,
  ReferralAsk,
  ReferralAskStyleId,
} from '@/lib/referralTypes';

// ── helpers ───────────────────────────────────────────────────────────────────

const TIER_STYLES: Record<ReferralReadinessTier, string> = {
  hot: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  ready: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  warming: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  not_ready: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
};

const TIER_LABELS: Record<ReferralReadinessTier, string> = {
  hot: '🔥 Hot',
  ready: '✓ Ready',
  warming: '~ Warming',
  not_ready: 'Not Ready',
};

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  call: Phone,
  sms: MessageSquare,
};

const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  sent: 'Sent',
  responded: 'Responded',
  lead_created: 'Lead Created',
  won: 'Won',
  lost: 'No Referral',
  no_response: 'No Response',
};

const STATUS_STYLES: Record<string, string> = {
  created: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
  sent: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
  responded: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300',
  lead_created: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300',
  won: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold',
  lost: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400',
  no_response: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
};

function nowLabel(): string {
  return new Date().toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function ScoreBar({ score, tier }: { score: number; tier: ReferralReadinessTier }) {
  const colors: Record<ReferralReadinessTier, string> = {
    hot: 'bg-red-500',
    ready: 'bg-emerald-500',
    warming: 'bg-amber-400',
    not_ready: 'bg-zinc-300 dark:bg-zinc-600',
  };
  return (
    <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${colors[tier]}`} style={{ width: `${score}%` }} />
    </div>
  );
}

// ── Ask creation modal ────────────────────────────────────────────────────────

interface AskModalProps {
  candidate: ReferralCandidate;
  onClose: () => void;
  onSave: (ask: Omit<ReferralAsk, 'id'>) => Promise<void>;
  userName: string;
}

function AskModal({ candidate, onClose, onSave, userName }: AskModalProps) {
  const styleConfig = REFERRAL_ASK_STYLES.find(s => s.id === candidate.recommendedStyle)!;
  const [channel, setChannel] = useState<'call' | 'email' | 'sms'>(candidate.preferredChannel);
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);

  // Regenerate draft when channel changes
  useEffect(() => {
    const content = generateReferralAskContent(candidate, channel);
    setBody(content.body);
    setSubject(content.subject ?? '');
  }, [candidate, channel]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        orgId: '',
        clientId: candidate.clientId,
        clientName: candidate.clientName,
        style: candidate.recommendedStyle,
        channel,
        status: 'created',
        askBody: body,
        createdAt: nowLabel(),
        createdBy: userName,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(body).catch(() => {});
    setCopying(true);
    setTimeout(() => setCopying(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 dark:bg-black/60 z-50 flex items-start justify-end p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl mt-16">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Create Referral Ask</p>
              <p className="text-xs text-zinc-500 mt-0.5">{candidate.clientName} · {styleConfig.label}</p>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Why now */}
            <div className="p-3 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800 rounded-lg">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">Why this ask, why now</p>
              <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">{candidate.styleReason}</p>
            </div>

            {/* Evidence */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">Supporting evidence</p>
              <ul className="space-y-1">
                {candidate.evidencePoints.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>

            {/* Channel selector */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Channel</p>
              <div className="flex gap-2">
                {(['call', 'email', 'sms'] as const).map(ch => {
                  const Icon = CHANNEL_ICONS[ch];
                  const isRec = ch === candidate.preferredChannel;
                  return (
                    <button
                      key={ch}
                      data-testid={`referral-channel-${ch}`}
                      onClick={() => setChannel(ch)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        channel === ch
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-violet-300'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {ch === 'call' ? 'Call Prep' : ch === 'email' ? 'Email' : 'SMS'}
                      {isRec && <span className="text-[9px] opacity-70">★</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject */}
            {channel === 'email' && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Subject</p>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
              </div>
            )}

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  {channel === 'call' ? 'Call Notes' : 'Message'}
                </p>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                >
                  {copying ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copying ? 'Copied' : 'Copy'}
                </button>
              </div>
              <textarea
                data-testid="referral-ask-body"
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={channel === 'sms' ? 3 : 8}
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none font-mono leading-relaxed"
              />
              {channel === 'sms' && (
                <p className={`text-[10px] mt-1 text-right ${body.length > 160 ? 'text-amber-500' : 'text-zinc-400'}`}>
                  {body.length} chars
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                data-testid="referral-ask-save"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Save Ask
              </button>
              <button
                onClick={onClose}
                className="px-3 py-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Candidate card ────────────────────────────────────────────────────────────

interface CandidateCardProps {
  candidate: ReferralCandidate;
  onCreateAsk: (candidate: ReferralCandidate) => void;
  existingAsks: ReferralAsk[];
}

function CandidateCard({ candidate, onCreateAsk, existingAsks }: CandidateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const clientAsks = existingAsks.filter(a => a.clientId === candidate.clientId);
  const hasActiveAsk = clientAsks.some(a => a.status === 'created' || a.status === 'sent');
  const styleConfig = REFERRAL_ASK_STYLES.find(s => s.id === candidate.recommendedStyle);
  const ChannelIcon = CHANNEL_ICONS[candidate.preferredChannel] ?? Phone;

  const isSupressed = candidate.suppressReasons.length > 0;

  return (
    <div
      data-testid={`referral-candidate-${candidate.clientId}`}
      className={`bg-white dark:bg-zinc-900 border rounded-xl overflow-hidden transition-all ${
        isSupressed
          ? 'border-zinc-200 dark:border-zinc-800 opacity-60'
          : candidate.readinessTier === 'hot'
          ? 'border-red-200 dark:border-red-800'
          : candidate.readinessTier === 'ready'
          ? 'border-emerald-200 dark:border-emerald-800'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${TIER_STYLES[candidate.readinessTier]}`}>
              {TIER_LABELS[candidate.readinessTier]}
            </span>
            <span className="text-[10px] text-zinc-400 font-medium">Score: {candidate.readinessScore}/100</span>
            {hasActiveAsk && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                Ask active
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{candidate.clientName}</p>
          <div className="mt-1">
            <ScoreBar score={candidate.readinessScore} tier={candidate.readinessTier} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isSupressed && !hasActiveAsk && (
            <button
              data-testid={`referral-ask-btn-${candidate.clientId}`}
              onClick={() => onCreateAsk(candidate)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
            >
              <Send className="w-3 h-3" />
              Create Ask
            </button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="px-4 pb-3 flex items-center gap-4 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1">
          <ChannelIcon className="w-3 h-3" />
          {styleConfig?.label ?? candidate.recommendedStyle}
        </span>
        <span>Timing: {candidate.suggestedTiming}</span>
        {candidate.suppressReasons.length > 0 && (
          <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {candidate.suppressReasons[0]}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-4 space-y-4">
          {/* Conversation angle */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Conversation angle</p>
            <p className="text-xs text-zinc-700 dark:text-zinc-300 italic leading-relaxed border-l-2 border-violet-300 dark:border-violet-700 pl-3">
              {candidate.conversationAngle}
            </p>
          </div>

          {/* Evidence */}
          {candidate.evidencePoints.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Evidence</p>
              <ul className="space-y-1">
                {candidate.evidencePoints.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Signals breakdown */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Readiness signals</p>
            <div className="space-y-1.5">
              {candidate.signals.map(signal => (
                <div key={signal.id} className="flex items-start gap-2">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${signal.met ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                    {signal.met ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                  </span>
                  <div className="flex-1">
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{signal.label}</span>
                    <span className="text-[10px] text-zinc-500 ml-2">+{signal.met ? signal.score : 0} pts</span>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 leading-relaxed">{signal.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Suppression reasons */}
          {candidate.suppressReasons.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-1">
                Why ask is suppressed
              </p>
              {candidate.suppressReasons.map((r, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-300">• {r}</p>
              ))}
            </div>
          )}

          {/* Existing asks for this client */}
          {clientAsks.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Ask history</p>
              <div className="space-y-1">
                {clientAsks.map((ask, i) => (
                  <div key={ask.id ?? i} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[ask.status] ?? ''}`}>
                      {STATUS_LABELS[ask.status] ?? ask.status}
                    </span>
                    <span>{ask.createdAt}</span>
                    <span>via {ask.channel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ask row ───────────────────────────────────────────────────────────────────

interface AskRowProps {
  ask: ReferralAsk;
  onStatusUpdate: (id: string, status: ReferralAsk['status'], note?: string) => void;
}

function AskRow({ ask, onStatusUpdate }: AskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const ChannelIcon = CHANNEL_ICONS[ask.channel] ?? Phone;

  const nextStatuses: Partial<Record<ReferralAsk['status'], ReferralAsk['status'][]>> = {
    created: ['sent', 'no_response'],
    sent: ['responded', 'no_response'],
    responded: ['lead_created', 'no_response'],
    lead_created: ['won', 'lost'],
  };
  const available = nextStatuses[ask.status] ?? [];

  return (
    <div data-testid={`referral-ask-${ask.id}`} className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div className="flex items-start gap-3">
        <ChannelIcon className="w-4 h-4 text-zinc-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{ask.clientName}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_STYLES[ask.status] ?? ''}`}>
              {STATUS_LABELS[ask.status] ?? ask.status}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {REFERRAL_ASK_STYLES.find(s => s.id === ask.style)?.label ?? ask.style}
            {' · '}{ask.createdAt} by {ask.createdBy}
          </p>
          {ask.responseNote && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 italic">"{ask.responseNote}"</p>
          )}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex-shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 ml-7 space-y-3">
          {ask.askBody && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Draft used</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800 rounded-lg p-3 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
                {ask.askBody}
              </p>
            </div>
          )}

          {available.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Update status</p>
              <input
                type="text"
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                placeholder="Optional note (e.g. 'Client mentioned Jane from Acme')"
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
              />
              <div className="flex gap-2 flex-wrap">
                {available.map(s => (
                  <button
                    key={s}
                    data-testid={`referral-status-${ask.id}-${s}`}
                    onClick={() => { onStatusUpdate(ask.id!, s, noteInput || undefined); setExpanded(false); }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-violet-100 dark:hover:bg-violet-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-colors"
                  >
                    <ArrowRight className="w-3 h-3" />
                    {STATUS_LABELS[s] ?? s}
                  </button>
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

type Tab = 'overview' | 'candidates' | 'asks' | 'outcomes' | 'inspection';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'asks', label: 'Active Asks' },
  { id: 'outcomes', label: 'Outcomes' },
  { id: 'inspection', label: 'Inspection' },
];

// ── Main component ─────────────────────────────────────────────────────────────

export default function ReferralWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [askModal, setAskModal] = useState<ReferralCandidate | null>(null);
  const [asks, setAsks] = useState<ReferralAsk[]>([]);
  const [asksLoading, setAsksLoading] = useState(true);
  const [filterTier, setFilterTier] = useState<'all' | 'hot' | 'ready' | 'warming'>('all');

  const clients = useSelector((s: RootState) => s.app.clients);
  const { orgId, user } = useAuth();
  const userName = (user as { displayName?: string | null })?.displayName ?? user?.email ?? 'Unknown';

  const state = useMemo(() => deriveReferralMomentumState(clients), [clients]);

  // ── Firestore asks ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!orgId || !db) { setAsksLoading(false); return; }
    const ref = collection(db, 'orgs', orgId, 'referralAsks');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, snap => {
      setAsks(snap.docs.map(d => ({ id: d.id, ...d.data() } as ReferralAsk)));
      setAsksLoading(false);
    }, () => setAsksLoading(false));
    return () => unsub();
  }, [orgId]);

  const createAsk = useCallback(async (ask: Omit<ReferralAsk, 'id'>) => {
    if (!orgId || !db) return;
    await addDoc(collection(db, 'orgs', orgId, 'referralAsks'), { ...ask, orgId });
  }, [orgId]);

  const updateAskStatus = useCallback(async (id: string, status: ReferralAsk['status'], note?: string) => {
    if (!orgId || !db) return;
    const ref = doc(db, 'orgs', orgId, 'referralAsks', id);
    await updateDoc(ref, {
      status,
      ...(note ? { responseNote: note } : {}),
      ...(status === 'sent' ? { sentAt: nowLabel() } : {}),
      ...(status === 'responded' ? { respondedAt: nowLabel() } : {}),
    });
  }, [orgId]);

  const filteredCandidates = useMemo(() => {
    if (filterTier === 'all') return state.candidates;
    return state.candidates.filter(c => c.readinessTier === filterTier);
  }, [state.candidates, filterTier]);

  const activeAsks = asks.filter(a => a.status === 'created' || a.status === 'sent' || a.status === 'responded' || a.status === 'lead_created');
  const completedAsks = asks.filter(a => a.status === 'won' || a.status === 'lost' || a.status === 'no_response');

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Referral Engine</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {state.hotCandidates} hot · {state.readyCandidates} ready · {state.warmingCandidates} warming
              · {activeAsks.length} active ask{activeAsks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {state.hotCandidates > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg text-xs font-semibold">
                <Star className="w-3.5 h-3.5" />
                {state.hotCandidates} hot to ask now
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 flex-shrink-0">
        <div className="flex gap-0">
          {TABS.map(tab => {
            const badge =
              tab.id === 'candidates' ? state.totalCandidates
                : tab.id === 'asks' ? activeAsks.length
                : tab.id === 'outcomes' ? completedAsks.length
                : null;
            return (
              <button
                key={tab.id}
                data-testid={`referral-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {tab.label}
                {badge !== null && badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Summary tiles */}
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">Referral Program Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Hot to Ask Now', value: state.hotCandidates, color: 'text-red-600 dark:text-red-400', bg: 'border-t-red-500' },
                  { label: 'Ready This Week', value: state.readyCandidates, color: 'text-emerald-600 dark:text-emerald-400', bg: 'border-t-emerald-500' },
                  { label: 'Warming Up', value: state.warmingCandidates, color: 'text-amber-600 dark:text-amber-400', bg: 'border-t-amber-400' },
                  { label: 'Active Asks', value: activeAsks.length, color: 'text-violet-600 dark:text-violet-400', bg: 'border-t-violet-500' },
                ].map(tile => (
                  <div key={tile.label} className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-t-2 ${tile.bg} rounded-xl p-4`}>
                    <div className={`text-2xl font-bold ${tile.color} mb-1`}>{tile.value}</div>
                    <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{tile.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Top candidates */}
            {state.hotCandidates > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Ask These Now</h2>
                  <button onClick={() => setActiveTab('candidates')} className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
                    All candidates <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-3">
                  {state.candidates.filter(c => c.readinessTier === 'hot').slice(0, 4).map(c => (
                    <CandidateCard key={c.clientId} candidate={c} onCreateAsk={setAskModal} existingAsks={asks} />
                  ))}
                </div>
              </section>
            )}

            {/* Ready accounts */}
            {state.readyCandidates > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">Ready This Week</h2>
                <div className="space-y-3">
                  {state.candidates.filter(c => c.readinessTier === 'ready').slice(0, 3).map(c => (
                    <CandidateCard key={c.clientId} candidate={c} onCreateAsk={setAskModal} existingAsks={asks} />
                  ))}
                </div>
              </section>
            )}

            {/* Active asks */}
            {activeAsks.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Active Asks to Progress</h2>
                  <button onClick={() => setActiveTab('asks')} className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
                    All asks <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  {activeAsks.slice(0, 5).map(a => (
                    <AskRow key={a.id} ask={a} onStatusUpdate={updateAskStatus} />
                  ))}
                </div>
              </section>
            )}

            {state.totalCandidates === 0 && (
              <div className="text-center py-16">
                <Users className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">No referral candidates yet</p>
                <p className="text-sm text-zinc-500 mt-1">As accounts build up health, delivery, and trust signals, referral candidates will appear here.</p>
              </div>
            )}
          </div>
        )}

        {/* Candidates */}
        {activeTab === 'candidates' && (
          <div className="space-y-4">
            {/* Filter */}
            <div className="flex items-center gap-2">
              {(['all', 'hot', 'ready', 'warming'] as const).map(tier => (
                <button
                  key={tier}
                  data-testid={`referral-filter-${tier}`}
                  onClick={() => setFilterTier(tier)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all capitalize ${
                    filterTier === tier
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-violet-300'
                  }`}
                >
                  {tier === 'all' ? 'All' : TIER_LABELS[tier]}
                </button>
              ))}
              <span className="text-xs text-zinc-400 ml-2">{filteredCandidates.length} shown</span>
            </div>

            {filteredCandidates.length === 0 ? (
              <div className="text-center py-16">
                <Users className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No candidates at this tier</p>
              </div>
            ) : (
              filteredCandidates.map(c => (
                <CandidateCard key={c.clientId} candidate={c} onCreateAsk={setAskModal} existingAsks={asks} />
              ))
            )}
          </div>
        )}

        {/* Active asks */}
        {activeTab === 'asks' && (
          <div className="space-y-4">
            {asksLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-zinc-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Loading asks...</span>
              </div>
            ) : activeAsks.length === 0 ? (
              <div className="text-center py-16">
                <Send className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No active asks yet</p>
                <p className="text-xs text-zinc-500 mt-1">Go to Candidates and create a referral ask to get started.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                {activeAsks.map(a => (
                  <AskRow key={a.id} ask={a} onStatusUpdate={updateAskStatus} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Outcomes */}
        {activeTab === 'outcomes' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Asks Made', value: asks.length, sub: 'total tracked' },
                { label: 'Leads Created', value: asks.filter(a => a.status === 'lead_created' || a.status === 'won').length, sub: 'from referrals' },
                { label: 'Converted', value: asks.filter(a => a.status === 'won').length, sub: 'won referrals' },
              ].map(t => (
                <div key={t.label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">{t.value}</div>
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{t.label}</div>
                  <div className="text-[10px] text-zinc-400">{t.sub}</div>
                </div>
              ))}
            </div>

            {completedAsks.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">No completed asks yet</p>
                <p className="text-xs text-zinc-500 mt-1">Progress active asks through their stages to see outcomes here.</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                {completedAsks.map(a => (
                  <AskRow key={a.id} ask={a} onStatusUpdate={updateAskStatus} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inspection */}
        {activeTab === 'inspection' && (
          <div className="space-y-6">
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">Scoring Rules</h2>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Green health:</span> +25 points. Amber: +8. Red: 0 (suppressed)</p>
                <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Delivery complete:</span> +20. Active: +15. Blocked/onboarding: 0 (suppressed)</p>
                <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Churn risk &lt;20%:</span> +20. &lt;30%: +12. &lt;50%: +5. ≥60%: 0 (suppressed)</p>
                <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Contact 7–30 days ago:</span> +18. 31–60d: +12. 61–90d: +8. &gt;90d: suppressed (reconnect first)</p>
                <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Live channels:</span> 3+: +15. 2: +12. 1: +8. 0: +0</p>
                <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Upsell hot/ready:</span> +10/+7. Warming: +3. Not ready: +0</p>
                <p className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Tiers:</span> Hot ≥70 · Ready 50–69 · Warming 30–49 · Not Ready &lt;30
                </p>
                <p><span className="font-medium text-zinc-800 dark:text-zinc-200">Derivation:</span> Pure client data. No AI or API calls. Live from Redux state.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">Ask Style Catalog</h2>
              <div className="space-y-3">
                {REFERRAL_ASK_STYLES.map(style => (
                  <div key={style.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{style.label}</span>
                      <span className="text-[10px] text-zinc-500 capitalize">{style.preferredChannel}</span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1"><span className="font-medium text-zinc-700 dark:text-zinc-300">When:</span> {style.when}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-2"><span className="font-medium text-zinc-700 dark:text-zinc-300">Why:</span> {style.why}</p>
                    <p className="text-xs text-violet-700 dark:text-violet-300 italic border-l-2 border-violet-300 dark:border-violet-700 pl-2">{style.exampleOpener}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-4">Current Program State</h2>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                <p>Total clients analysed: {clients.filter(c => !c.archived).length}</p>
                <p>Candidates (excluding not_ready): {state.totalCandidates}</p>
                <p>Suppressed (conditions not met): {state.suppressedCount}</p>
                <p>Hot: {state.hotCandidates} · Ready: {state.readyCandidates} · Warming: {state.warmingCandidates}</p>
                <p>Active asks in Firestore: {activeAsks.length}</p>
                <p>Completed asks: {completedAsks.length}</p>
                <p>Generated: {state.generatedAt}</p>
              </div>
            </section>
          </div>
        )}

      </div>

      {/* Ask modal */}
      {askModal && (
        <AskModal
          candidate={askModal}
          onClose={() => setAskModal(null)}
          onSave={createAsk}
          userName={userName}
        />
      )}
    </div>
  );
}
