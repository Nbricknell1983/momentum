import { Lead, Activity, Stage } from './types';

export type DealMomentumStatus = 'strong' | 'active' | 'at_risk' | 'stalled';

export interface DealMomentumResult {
  score: number;
  status: DealMomentumStatus;
  label: string;
  reasons: string[];
  suggestedNextStep: string;
}

const STATUS_BANDS: { min: number; max: number; status: DealMomentumStatus; label: string }[] = [
  { min: 80, max: 100, status: 'strong', label: 'Strong' },
  { min: 60, max: 79, status: 'active', label: 'Active' },
  { min: 35, max: 59, status: 'at_risk', label: 'At Risk' },
  { min: 0, max: 34, status: 'stalled', label: 'Stalled' },
];

export const MOMENTUM_STATUS_COLORS: Record<DealMomentumStatus, string> = {
  strong: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  at_risk: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  stalled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const ADVANCED_STAGES: Stage[] = ['qualified', 'discovery', 'proposal', 'verbal_commit'];

function daysSince(date: Date | undefined | null): number | null {
  if (!date) return null;
  const d = new Date(date);
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function calculateDealMomentumScore(
  lead: Lead,
  activities: Activity[]
): DealMomentumResult {
  let score = 50;
  const reasons: string[] = [];
  const leadActivities = activities.filter(a => a.leadId === lead.id);
  const sortedActivities = [...leadActivities].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const daysSinceLastActivity = daysSince(lead.lastActivityAt);
  if (daysSinceLastActivity !== null) {
    if (daysSinceLastActivity <= 3) {
      score += 15;
      reasons.push('Activity in last 3 days');
    } else if (daysSinceLastActivity <= 7) {
      score += 10;
      reasons.push('Activity in last week');
    } else if (daysSinceLastActivity <= 14) {
      score += 5;
      reasons.push('Activity in last 2 weeks');
    } else if (daysSinceLastActivity <= 30) {
      score -= 10;
      reasons.push(`No activity for ${daysSinceLastActivity} days`);
    } else {
      score -= 20;
      reasons.push(`Stale — ${daysSinceLastActivity} days since last activity`);
    }
  } else {
    score -= 15;
    reasons.push('No activity recorded');
  }

  if (ADVANCED_STAGES.includes(lead.stage)) {
    score += 10;
    reasons.push('Advanced pipeline stage');
  } else if (lead.stage === 'won') {
    score += 20;
    reasons.push('Deal won');
  } else if (lead.stage === 'lost') {
    score -= 30;
    reasons.push('Deal lost');
  } else if (lead.stage === 'nurture') {
    score -= 5;
    reasons.push('In nurture');
  }

  const recentActivities = sortedActivities.filter(a => {
    const d = daysSince(a.createdAt);
    return d !== null && d <= 14;
  });
  if (recentActivities.length >= 5) {
    score += 10;
    reasons.push('High activity volume (5+ in 2 weeks)');
  } else if (recentActivities.length >= 3) {
    score += 5;
    reasons.push('Moderate activity volume');
  } else if (recentActivities.length === 0 && leadActivities.length > 0) {
    score -= 5;
    reasons.push('No recent activity');
  }

  const hasFollowUp = sortedActivities.some(a => a.type === 'followup');
  const hasMeeting = sortedActivities.some(a => a.type === 'meeting' || a.type === 'meeting_booked');
  const hasProposal = sortedActivities.some(a => a.type === 'proposal' || a.type === 'proposal_sent');

  if (hasMeeting) {
    score += 5;
    reasons.push('Meeting logged');
  }
  if (hasProposal) {
    score += 5;
    reasons.push('Proposal sent');
  }
  if (hasFollowUp) {
    score += 3;
  }

  if (lead.nextContactDate) {
    const daysUntilNext = -1 * (daysSince(lead.nextContactDate) || 0);
    if (daysUntilNext < 0) {
      score -= 10;
      reasons.push('Overdue follow-up');
    } else if (daysUntilNext <= 3) {
      score += 5;
      reasons.push('Follow-up scheduled soon');
    }
  } else if (lead.stage !== 'won' && lead.stage !== 'lost') {
    score -= 5;
    reasons.push('No next contact date set');
  }

  if (lead.mrr && lead.mrr > 0) {
    score += 5;
    reasons.push(`MRR: $${lead.mrr}`);
  }

  score = Math.max(0, Math.min(100, score));

  const band = STATUS_BANDS.find(b => score >= b.min && score <= b.max) || STATUS_BANDS[STATUS_BANDS.length - 1];

  const suggestedNextStep = getSuggestedNextStep(lead, band.status, daysSinceLastActivity);

  return {
    score,
    status: band.status,
    label: band.label,
    reasons: reasons.slice(0, 3),
    suggestedNextStep,
  };
}

function getSuggestedNextStep(
  lead: Lead,
  status: DealMomentumStatus,
  daysSinceLastActivity: number | null
): string {
  if (lead.stage === 'won') return 'Send onboarding materials';
  if (lead.stage === 'lost') return 'Consider re-engagement in 30 days';

  if (status === 'stalled') {
    return 'Re-engage with a value-add call or email';
  }

  if (status === 'at_risk') {
    if (daysSinceLastActivity && daysSinceLastActivity > 14) {
      return 'Schedule a check-in call immediately';
    }
    return 'Send a follow-up with a compelling reason to connect';
  }

  switch (lead.stage) {
    case 'suspect':
    case 'contacted':
      return 'Make initial contact or follow up on outreach';
    case 'engaged':
      return 'Book a discovery meeting';
    case 'qualified':
    case 'discovery':
      return 'Present a tailored proposal';
    case 'proposal':
      return 'Follow up on proposal and handle objections';
    case 'verbal_commit':
      return 'Send contract and close the deal';
    default:
      return 'Follow up and advance the conversation';
  }
}
