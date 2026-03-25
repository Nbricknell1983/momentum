// =============================================================================
// DIGEST ADAPTER
// =============================================================================
// Pure derivation: ClientDashboardState → ClientUpdateDigest
// Zero AI calls. Zero API calls. Derived from the command centre state.
// =============================================================================

import { format, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import type { ClientDashboardState } from './clientCommandTypes';
import type { ClientUpdateDigest, DigestType } from './portalAccessTypes';

// ─── Period labels ─────────────────────────────────────────────────────────────

function getPeriodLabel(type: DigestType, now: Date): string {
  switch (type) {
    case 'weekly':
      return `Week ending ${format(endOfWeek(now, { weekStartsOn: 1 }), 'dd MMM yyyy')}`;
    case 'monthly':
      return format(now, 'MMMM yyyy');
    case 'milestone':
      return `Milestone update — ${format(now, 'dd MMM yyyy')}`;
    case 'approval_reminder':
      return `Action required — ${format(now, 'dd MMM yyyy')}`;
    case 'missing_input':
      return `Reminder — ${format(now, 'dd MMM yyyy')}`;
    default:
      return format(now, 'dd MMM yyyy');
  }
}

// ─── Subject line ─────────────────────────────────────────────────────────────

function getSubject(type: DigestType, businessName: string): string {
  switch (type) {
    case 'weekly':
      return `Your weekly update — ${businessName}`;
    case 'monthly':
      return `${format(new Date(), 'MMMM')} progress report — ${businessName}`;
    case 'milestone':
      return `Milestone reached — ${businessName}`;
    case 'approval_reminder':
      return `Action needed: your ${businessName} portal`;
    case 'missing_input':
      return `We're waiting on you — ${businessName} portal`;
    default:
      return `Update from your growth team — ${businessName}`;
  }
}

// ─── Preview text ─────────────────────────────────────────────────────────────

function getPreviewText(dashboard: ClientDashboardState, type: DigestType): string {
  const phase = dashboard.delivery.phaseLabel;
  const wins = dashboard.performance.dataAvailable ? ` · ${dashboard.performance.topWin}` : '';
  switch (type) {
    case 'weekly':
      return `${phase}${wins}`;
    case 'monthly':
      return `Your ${format(new Date(), 'MMMM')} digital growth summary is ready to view.`;
    case 'milestone':
      return `A key milestone has been reached in your digital growth journey.`;
    case 'approval_reminder':
      return `There are ${dashboard.nextActions.length} item${dashboard.nextActions.length !== 1 ? 's' : ''} that need your input.`;
    case 'missing_input':
      return `We need something from you to keep your project moving.`;
    default:
      return `Your latest digital growth update is ready.`;
  }
}

// ─── What was completed ───────────────────────────────────────────────────────

function getCompletedThisPeriod(dashboard: ClientDashboardState): string[] {
  const completed: string[] = [];

  // Live/optimising channels
  dashboard.delivery.channels
    .filter(c => ['live', 'optimising'].includes(c.status) && c.isIncluded)
    .forEach(c => { completed.push(c.highlight || `${c.label} is live`); });

  // Recent optimisation actions
  dashboard.optimisation.recentActions
    .slice(0, 2)
    .forEach(a => { if (!completed.includes(a)) completed.push(a); });

  // Achieved milestones (non-trivial ones)
  dashboard.milestones
    .filter(m => m.achieved && m.id !== 'onboarding')
    .slice(0, 2)
    .forEach(m => { if (!completed.some(c => c.toLowerCase().includes(m.title.toLowerCase()))) completed.push(m.title); });

  return completed.slice(0, 5);
}

// ─── What is in progress ──────────────────────────────────────────────────────

function getInProgress(dashboard: ClientDashboardState): string[] {
  const items: string[] = [];

  dashboard.delivery.channels
    .filter(c => c.status === 'in_progress')
    .forEach(c => items.push(`${c.label}: ${c.highlight}`));

  if (dashboard.delivery.phase === 'building') {
    items.push(`Building your digital presence — ${dashboard.delivery.overallProgress}% complete`);
  }

  return items.slice(0, 3);
}

// ─── What is coming next ──────────────────────────────────────────────────────

function getComingNext(dashboard: ClientDashboardState): string[] {
  const items = [
    ...dashboard.strategyAlignment.upcoming.slice(0, 2),
    ...dashboard.optimisation.upcomingWork.slice(0, 2),
  ];

  // Next milestone
  const nextMilestone = dashboard.milestones.find(m => m.isNext && !m.achieved);
  if (nextMilestone) {
    const label = `Next: ${nextMilestone.title}`;
    if (!items.includes(label)) items.unshift(label);
  }

  return items.slice(0, 4);
}

// ─── Client actions needed ────────────────────────────────────────────────────

function getClientActions(dashboard: ClientDashboardState): string[] {
  return dashboard.nextActions
    .map(a => {
      const urgency = a.urgency === 'required_now' ? '⚡ ' : a.urgency === 'this_week' ? '' : '';
      return `${urgency}${a.action}`;
    })
    .slice(0, 4);
}

// ─── Key wins ─────────────────────────────────────────────────────────────────

function getKeyWins(dashboard: ClientDashboardState): string[] {
  const wins: string[] = [];

  if (dashboard.performance.dataAvailable) {
    wins.push(dashboard.performance.topWin);
  }

  dashboard.performance.keyMetrics
    .filter(m => m.trend === 'up')
    .slice(0, 2)
    .forEach(m => wins.push(`${m.label}: ${m.value}${m.detail ? ` — ${m.detail}` : ''}`));

  dashboard.milestones
    .filter(m => m.achieved && m.id !== 'onboarding')
    .slice(0, 1)
    .forEach(m => {
      const label = `${m.title}${m.achievedAt ? ` (${m.achievedAt})` : ''}`;
      if (!wins.some(w => w.includes(m.title))) wins.push(label);
    });

  return wins.slice(0, 4);
}

// ─── Health summary ───────────────────────────────────────────────────────────

function getHealthSummary(dashboard: ClientDashboardState): string {
  const { health } = dashboard;
  const highlights = health.highlights.slice(0, 2).join('. ');
  const alertPart = health.alerts.length > 0 ? ` One thing to watch: ${health.alerts[0].toLowerCase()}.` : '';
  return `Overall: ${health.statusLabel}.${highlights ? ` ${highlights}.` : ''}${alertPart}`;
}

// ─── Snapshot summary (for delivery record) ────────────────────────────────────

export function getSnapshotSummary(dashboard: ClientDashboardState): string {
  const live = dashboard.delivery.liveChannelCount;
  const total = dashboard.delivery.totalChannelCount;
  const pending = dashboard.nextActions.length;
  return `${live}/${total} channels live · ${pending} action${pending !== 1 ? 's' : ''} pending · ${dashboard.health.statusLabel}`;
}

// ─── Main adapter ─────────────────────────────────────────────────────────────

export function deriveClientDigest(
  dashboard: ClientDashboardState,
  type: DigestType = 'weekly',
  portalUrl?: string,
): ClientUpdateDigest {
  const now = new Date();

  return {
    id:                    crypto.randomUUID(),
    clientId:              dashboard.clientId,
    businessName:          dashboard.businessName,
    type,
    period:                getPeriodLabel(type, now),
    subject:               getSubject(type, dashboard.businessName),
    previewText:           getPreviewText(dashboard, type),
    completedThisPeriod:   getCompletedThisPeriod(dashboard),
    inProgress:            getInProgress(dashboard),
    comingNext:            getComingNext(dashboard),
    clientActionsNeeded:   getClientActions(dashboard),
    keyWins:               getKeyWins(dashboard),
    healthSummary:         getHealthSummary(dashboard),
    deliveryPhaseLabel:    dashboard.delivery.phaseLabel,
    ctaPrompt:             'Log in to your growth portal to see the full picture.',
    portalUrl,
    generatedAt:           now.toISOString(),
  };
}
