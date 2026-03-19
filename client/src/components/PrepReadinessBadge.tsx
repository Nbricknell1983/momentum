import { CheckCircle2, Clock, AlertTriangle, XCircle, Loader2 } from 'lucide-react';

export type PrepReadinessState = 'ready' | 'stale' | 'very_stale' | 'not_ready' | 'preparing';

export function getPrepReadinessState(prepCallPack: any, isGenerating?: boolean): PrepReadinessState {
  if (isGenerating) return 'preparing';
  if (!prepCallPack?.generatedAt) return 'not_ready';
  const ageMs = Date.now() - new Date(prepCallPack.generatedAt).getTime();
  if (ageMs < 7 * 86400000) return 'ready';
  if (ageMs < 30 * 86400000) return 'stale';
  return 'very_stale';
}

const STATE_CONFIG: Record<PrepReadinessState, {
  icon: typeof CheckCircle2;
  label: string;
  className: string;
  dotClass: string;
}> = {
  ready: {
    icon: CheckCircle2,
    label: 'Ready',
    className: 'text-green-600 dark:text-green-400',
    dotClass: 'bg-green-500',
  },
  stale: {
    icon: Clock,
    label: 'Stale',
    className: 'text-amber-500 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
  very_stale: {
    icon: AlertTriangle,
    label: 'Outdated',
    className: 'text-red-500 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
  not_ready: {
    icon: XCircle,
    label: 'Not Ready',
    className: 'text-slate-400 dark:text-slate-500',
    dotClass: 'bg-slate-400',
  },
  preparing: {
    icon: Loader2,
    label: 'Preparing…',
    className: 'text-blue-500 dark:text-blue-400',
    dotClass: 'bg-blue-500 animate-pulse',
  },
};

interface PrepReadinessBadgeProps {
  prepCallPack?: any;
  isGenerating?: boolean;
  showLabel?: boolean;
  size?: 'xs' | 'sm';
}

export function PrepReadinessBadge({ prepCallPack, isGenerating, showLabel = false, size = 'xs' }: PrepReadinessBadgeProps) {
  const state = getPrepReadinessState(prepCallPack, isGenerating);
  const cfg = STATE_CONFIG[state];
  const Icon = cfg.icon;
  const isPrep = state === 'preparing';
  const iconSize = size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  if (!showLabel) {
    return (
      <span
        className={`inline-flex items-center gap-1 ${cfg.className}`}
        title={`Prep ${cfg.label}`}
        data-testid={`badge-prep-readiness-${state}`}
      >
        <Icon className={`${iconSize} ${isPrep ? 'animate-spin' : ''}`} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium ${cfg.className}`}
      data-testid={`badge-prep-readiness-${state}`}
    >
      <Icon className={`${iconSize} ${isPrep ? 'animate-spin' : ''} shrink-0`} />
      <span>Prep {cfg.label}</span>
    </span>
  );
}
