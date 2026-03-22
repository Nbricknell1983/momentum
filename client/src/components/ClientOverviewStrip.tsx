import { useMemo } from 'react';
import {
  Globe, Star, Search, BarChart3, TrendingUp, AlertTriangle,
  CheckCircle2, Clock, Zap, Activity,
} from 'lucide-react';
import {
  Client, ChannelStatus, ChannelStatuses, CLIENT_BOARD_STAGE_LABELS,
} from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHANNEL_META: { key: keyof ChannelStatuses; label: string; icon: typeof Globe }[] = [
  { key: 'website', label: 'Website', icon: Globe },
  { key: 'gbp',     label: 'GBP',     icon: Star },
  { key: 'seo',     label: 'SEO',     icon: Search },
  { key: 'ppc',     label: 'Ads',     icon: BarChart3 },
];

const CHANNEL_STATUS_CONFIG: Record<ChannelStatus, { label: string; cls: string; dotColor: string }> = {
  live:        { label: 'Live',         cls: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400', dotColor: 'bg-emerald-500' },
  in_progress: { label: 'In progress',  cls: 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400', dotColor: 'bg-blue-500 animate-pulse' },
  paused:      { label: 'Paused',       cls: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400', dotColor: 'bg-amber-400' },
  not_started: { label: 'Not started',  cls: 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400', dotColor: 'bg-slate-300 dark:bg-slate-600' },
};

function deriveHealthHeadline(client: Client): { text: string; tone: 'positive' | 'caution' | 'risk' } {
  const { healthStatus, healthReasons, totalMRR, boardStage } = client;

  if (healthStatus === 'green') {
    return { text: healthReasons[0] ?? 'Account is healthy and on track.', tone: 'positive' };
  }
  if (healthStatus === 'amber') {
    return { text: healthReasons[0] ?? 'Account needs attention — check in soon.', tone: 'caution' };
  }
  return { text: healthReasons[0] ?? 'Account is at risk — action required.', tone: 'risk' };
}

function deriveKeyAction(client: Client): string {
  if (!client.lastContactDate) return 'Log your first interaction with this client.';

  const daysSince = Math.floor((Date.now() - new Date(client.lastContactDate).getTime()) / 86400000);

  if (client.healthStatus === 'red') return 'At-risk account — book a check-in call this week.';
  if (daysSince > 30) return `No contact in ${daysSince} days — schedule a growth review.`;
  if (daysSince > 14) return 'Follow up to check delivery progress and gather feedback.';

  const channelLive = Object.values(client.channelStatus).filter(s => s === 'live').length;
  if (channelLive === 0) return 'No active delivery channels yet — activate a workstream to begin.';
  if (channelLive === 1) return 'One channel live — consider expanding scope to accelerate results.';

  return 'Continue delivering across active channels and log progress notes.';
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientOverviewStrip({ client }: { client: Client }) {
  const headline = useMemo(() => deriveHealthHeadline(client), [client.healthStatus, client.healthReasons]);
  const keyAction = useMemo(() => deriveKeyAction(client), [client]);

  const channelLiveCount = Object.values(client.channelStatus).filter(s => s === 'live').length;
  const channelTotalCount = Object.values(client.channelStatus).length;
  const lastContact = client.lastContactDate
    ? formatDistanceToNow(new Date(client.lastContactDate), { addSuffix: true })
    : null;

  const toneColors = {
    positive: 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/10',
    caution:  'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10',
    risk:     'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/10',
  };
  const toneIcon = {
    positive: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />,
    caution:  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
    risk:     <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
  };

  return (
    <div
      className={`rounded-xl border overflow-hidden ${toneColors[headline.tone]}`}
      data-testid="client-overview-strip"
    >
      {/* Health headline */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start gap-2 mb-2">
          {toneIcon[headline.tone]}
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">{headline.text}</p>
            {client.healthReasons.length > 1 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{client.healthReasons[1]}</p>
            )}
          </div>
        </div>

        {/* Key next action */}
        <div className="flex items-start gap-1.5 pl-6">
          <Zap className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600 dark:text-slate-400 italic">{keyAction}</p>
        </div>
      </div>

      {/* Channel status + meta row */}
      <div className="px-4 pb-3 pt-1 flex items-center justify-between gap-3 flex-wrap">
        {/* Channel pills */}
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="channel-status-pills">
          {CHANNEL_META.map(({ key, label, icon: Icon }) => {
            const status = client.channelStatus[key];
            const cfg = CHANNEL_STATUS_CONFIG[status] ?? CHANNEL_STATUS_CONFIG.not_started;
            return (
              <div
                key={key}
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}
                data-testid={`channel-pill-${key}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dotColor}`} />
                <Icon className="h-2.5 w-2.5" />
                {label}
              </div>
            );
          })}
        </div>

        {/* Meta: channels live + last contact */}
        <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {channelLiveCount}/{channelTotalCount} live
          </span>
          {lastContact && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastContact}
            </span>
          )}
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {CLIENT_BOARD_STAGE_LABELS[client.boardStage ?? 'onboarding']}
          </span>
        </div>
      </div>
    </div>
  );
}
