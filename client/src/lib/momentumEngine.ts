import type { Lead, Activity, Stage, ActivityType } from './types';

export type MomentumStatus = 'healthy' | 'stable' | 'at_risk' | 'critical';

export interface MomentumBreakdown {
  replacementScore: number;
  replacementRate: number;
  newDealsCreated: number;
  dealsRemoved: number;
  activityScore: number;
  activityIndex: number;
  targetActivityIndex: number;
  pipelineHealthScore: number;
  earlyStagePercent: number;
  lateStagePercent: number;
  adjustments: string[];
}

export interface MomentumResult {
  score: number;
  status: MomentumStatus;
  statusLabel: string;
  statusColor: string;
  breakdown: MomentumBreakdown;
  constraint: 'replacement' | 'activity' | 'pipeline' | null;
  trend: 'up' | 'down' | 'flat';
}

export interface ActivityCounts {
  calls: number;
  sms: number;
  emails: number;
  dropins: number;
  meetings: number;
}

export interface ActivityTargets {
  calls: number;
  sms: number;
  emails: number;
  dropins: number;
  meetings: number;
}

const ACTIVITY_WEIGHTS = {
  call: 1.0,
  sms: 0.6,
  email: 0.4,
  dropin: 1.2,
  meeting: 0.5,
};

const EARLY_STAGES: Stage[] = ['suspect', 'contacted', 'engaged'];
const LATE_STAGES: Stage[] = ['proposal', 'verbal_commit', 'won'];

export function getMomentumStatus(score: number): MomentumStatus {
  if (score >= 80) return 'healthy';
  if (score >= 65) return 'stable';
  if (score >= 50) return 'at_risk';
  return 'critical';
}

export function getMomentumStatusLabel(status: MomentumStatus): string {
  switch (status) {
    case 'healthy': return 'Healthy Momentum';
    case 'stable': return 'Stable, But At Risk';
    case 'at_risk': return 'At Risk';
    case 'critical': return 'Critical';
  }
}

export function getMomentumStatusColor(status: MomentumStatus): string {
  switch (status) {
    case 'healthy': return 'hsl(142, 76%, 36%)';
    case 'stable': return 'hsl(48, 96%, 53%)';
    case 'at_risk': return 'hsl(25, 95%, 53%)';
    case 'critical': return 'hsl(0, 84%, 60%)';
  }
}

export function calculateReplacementScore(
  leads: Lead[],
  windowDays: number = 7
): { score: number; rate: number; newDeals: number; removed: number } {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const newDeals = leads.filter(lead => {
    const createdAt = new Date(lead.createdAt);
    return createdAt >= windowStart && !lead.archived;
  }).length;

  const closedWon = leads.filter(lead => {
    const updatedAt = new Date(lead.updatedAt);
    return lead.stage === 'won' && updatedAt >= windowStart;
  }).length;

  const closedLost = leads.filter(lead => {
    const updatedAt = new Date(lead.updatedAt);
    return lead.stage === 'lost' && updatedAt >= windowStart;
  }).length;

  const archived = leads.filter(lead => {
    const updatedAt = new Date(lead.updatedAt);
    return lead.archived && updatedAt >= windowStart;
  }).length;

  const removed = closedWon + closedLost + archived;
  
  if (removed === 0) {
    return { score: newDeals > 0 ? 100 : 70, rate: newDeals > 0 ? 200 : 100, newDeals, removed };
  }

  const rate = (newDeals / removed) * 100;

  let score: number;
  if (rate >= 120) score = 100;
  else if (rate >= 100) score = 90;
  else if (rate >= 80) score = 70;
  else if (rate >= 60) score = 50;
  else score = 30;

  return { score, rate, newDeals, removed };
}

export function calculateActivityIndex(counts: ActivityCounts): number {
  return (
    (counts.calls * ACTIVITY_WEIGHTS.call) +
    (counts.sms * ACTIVITY_WEIGHTS.sms) +
    (counts.emails * ACTIVITY_WEIGHTS.email) +
    (counts.dropins * ACTIVITY_WEIGHTS.dropin) +
    (counts.meetings * ACTIVITY_WEIGHTS.meeting)
  );
}

export function calculateTargetActivityIndex(targets: ActivityTargets): number {
  return (
    (targets.calls * ACTIVITY_WEIGHTS.call) +
    (targets.sms * ACTIVITY_WEIGHTS.sms) +
    (targets.emails * ACTIVITY_WEIGHTS.email) +
    (targets.dropins * ACTIVITY_WEIGHTS.dropin) +
    (targets.meetings * ACTIVITY_WEIGHTS.meeting)
  );
}

export function calculateActivityScore(
  activities: Activity[],
  targets: ActivityTargets,
  windowDays: number = 1
): { score: number; index: number; targetIndex: number } {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - windowDays);
  windowStart.setHours(0, 0, 0, 0);

  const recentActivities = activities.filter(a => {
    const createdAt = new Date(a.createdAt);
    return createdAt >= windowStart;
  });

  const counts: ActivityCounts = {
    calls: recentActivities.filter(a => a.type === 'call').length,
    sms: recentActivities.filter(a => a.type === 'sms').length,
    emails: recentActivities.filter(a => a.type === 'email').length,
    dropins: recentActivities.filter(a => a.type === 'dropin').length,
    meetings: recentActivities.filter(a => a.type === 'meeting').length,
  };

  const actualIndex = calculateActivityIndex(counts);
  const targetIndex = calculateTargetActivityIndex(targets);

  if (targetIndex === 0) {
    return { score: 100, index: actualIndex, targetIndex: 0 };
  }

  const score = Math.min(100, Math.round((actualIndex / targetIndex) * 100));
  return { score, index: actualIndex, targetIndex };
}

export function calculatePipelineHealthScore(
  leads: Lead[],
  replacementScore: number
): { score: number; earlyPercent: number; latePercent: number; adjustments: string[] } {
  const activeLeads = leads.filter(l => !l.archived && l.stage !== 'lost' && l.stage !== 'nurture');
  const totalActive = activeLeads.length;

  if (totalActive === 0) {
    return { score: 50, earlyPercent: 0, latePercent: 0, adjustments: ['No active leads in pipeline'] };
  }

  const earlyCount = activeLeads.filter(l => EARLY_STAGES.includes(l.stage)).length;
  const lateCount = activeLeads.filter(l => LATE_STAGES.includes(l.stage)).length;

  const earlyPercent = (earlyCount / totalActive) * 100;
  const latePercent = (lateCount / totalActive) * 100;

  let score = 100;
  const adjustments: string[] = [];

  if (earlyPercent < 55) {
    score -= 15;
    adjustments.push('Early-stage pipeline below 55%');
  }

  if (latePercent > 45) {
    score -= 10;
    adjustments.push('Late-stage pipeline exceeds 45%');
  }

  const stageCounts: Record<string, number> = {};
  activeLeads.forEach(l => {
    stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1;
  });

  const maxStagePercent = Math.max(...Object.values(stageCounts).map(c => (c / totalActive) * 100));
  if (maxStagePercent > 40) {
    score -= 10;
    adjustments.push('Over 40% of deals in one stage (clumping)');
  }

  const now = new Date();
  let stagnantCount = 0;
  activeLeads.forEach(l => {
    const lastActivity = l.lastActivityAt ? new Date(l.lastActivityAt) : new Date(l.createdAt);
    const daysSinceActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceActivity > 14) {
      stagnantCount++;
    }
  });

  if (stagnantCount > totalActive * 0.3) {
    score -= 10;
    adjustments.push('Many deals stagnant (no activity >14 days)');
  }

  if (latePercent > 45 && replacementScore < 70) {
    score -= 15;
    adjustments.push('Late-stage heavy but replacement weak');
  }

  return { 
    score: Math.max(0, score), 
    earlyPercent: Math.round(earlyPercent), 
    latePercent: Math.round(latePercent), 
    adjustments 
  };
}

export function calculateMomentum(
  leads: Lead[],
  activities: Activity[],
  activityTargets: ActivityTargets,
  previousScores: number[] = []
): MomentumResult {
  const replacement = calculateReplacementScore(leads);
  const activity = calculateActivityScore(activities, activityTargets);
  const pipelineHealth = calculatePipelineHealthScore(leads, replacement.score);

  const score = Math.round(
    (replacement.score * 0.40) +
    (activity.score * 0.35) +
    (pipelineHealth.score * 0.25)
  );
  
  // Ensure score is within bounds 0-100
  const clampedScore = Math.max(0, Math.min(100, score));

  const status = getMomentumStatus(clampedScore);
  const statusLabel = getMomentumStatusLabel(status);
  const statusColor = getMomentumStatusColor(status);

  let constraint: 'replacement' | 'activity' | 'pipeline' | null = null;
  if (replacement.score < activity.score && replacement.score < pipelineHealth.score) {
    constraint = 'replacement';
  } else if (activity.score < 100 && activity.score <= replacement.score) {
    constraint = 'activity';
  } else if (pipelineHealth.score < 60) {
    constraint = 'pipeline';
  }

  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (previousScores.length >= 2) {
    const recentAvg = previousScores.slice(-2).reduce((a, b) => a + b, 0) / 2;
    if (score > recentAvg + 3) trend = 'up';
    else if (score < recentAvg - 3) trend = 'down';
  }

  return {
    score,
    status,
    statusLabel,
    statusColor,
    breakdown: {
      replacementScore: replacement.score,
      replacementRate: Math.round(replacement.rate),
      newDealsCreated: replacement.newDeals,
      dealsRemoved: replacement.removed,
      activityScore: activity.score,
      activityIndex: Math.round(activity.index * 10) / 10,
      targetActivityIndex: Math.round(activity.targetIndex * 10) / 10,
      pipelineHealthScore: pipelineHealth.score,
      earlyStagePercent: pipelineHealth.earlyPercent,
      lateStagePercent: pipelineHealth.latePercent,
      adjustments: pipelineHealth.adjustments,
    },
    constraint,
    trend,
  };
}

export function calculateRollingAverage(scores: number[], windowSize: number = 3): number[] {
  if (scores.length === 0) return [];
  
  const result: number[] = [];
  for (let i = 0; i < scores.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = scores.slice(start, i + 1);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    result.push(Math.round(avg));
  }
  return result;
}

export function detectTrendAlert(scores: number[]): { alert: boolean; type: 'downtrend' | 'flatline' | null; message: string | null } {
  if (scores.length < 2) {
    return { alert: false, type: null, message: null };
  }

  const recent = scores.slice(-3);
  
  if (recent.length >= 2) {
    let downDays = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] < recent[i - 1]) downDays++;
    }
    if (downDays >= 2) {
      return { 
        alert: true, 
        type: 'downtrend', 
        message: 'Momentum trending down for 2+ days - risk alert' 
      };
    }
  }

  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (avg < 70 && recent.every(s => Math.abs(s - avg) < 5)) {
    return { 
      alert: true, 
      type: 'flatline', 
      message: 'Momentum flatlined below 70 - silent decay warning' 
    };
  }

  return { alert: false, type: null, message: null };
}

export interface CoachingContext {
  momentumResult: MomentumResult;
  callsRemaining: number;
  smsRemaining: number;
  stuckLeads: { companyName: string; stage: Stage; daysSinceActivity: number }[];
  dormantLeadsCount: number;
}

export function buildCoachingPrompt(context: CoachingContext): string {
  const { momentumResult, callsRemaining, smsRemaining, stuckLeads, dormantLeadsCount } = context;
  const { score, status, breakdown, constraint } = momentumResult;

  let prompt = `You are a sales coach in the style of Jeb Blount from "Fanatical Prospecting". Be firm, direct, and focus on inputs that drive outcomes. Never be generic or motivational. Be specific and actionable.

Current Momentum Score: ${score}/100 (${getMomentumStatusLabel(status)})

Breakdown:
- Replacement Score: ${breakdown.replacementScore}/100 (Rate: ${breakdown.replacementRate}%, New: ${breakdown.newDealsCreated}, Removed: ${breakdown.dealsRemoved})
- Activity Score: ${breakdown.activityScore}/100 (Index: ${breakdown.activityIndex}/${breakdown.targetActivityIndex})
- Pipeline Health: ${breakdown.pipelineHealthScore}/100 (Early: ${breakdown.earlyStagePercent}%, Late: ${breakdown.lateStagePercent}%)
${breakdown.adjustments.length > 0 ? `\nPipeline Issues: ${breakdown.adjustments.join('; ')}` : ''}

Primary Constraint: ${constraint || 'None identified'}

Context:
- Calls remaining today: ${callsRemaining}
- SMS follow-ups remaining: ${smsRemaining}
- Leads stuck >14 days: ${stuckLeads.length}
- Dormant leads available: ${dormantLeadsCount}

${stuckLeads.length > 0 ? `Stuck leads: ${stuckLeads.slice(0, 5).map(l => `${l.companyName} (${l.stage}, ${l.daysSinceActivity} days)`).join('; ')}` : ''}

Instructions:
1. Diagnose the single biggest constraint hurting momentum
2. Prescribe 2-3 specific, executable actions (not generic advice)
3. Use Jeb Blount phrases like "Replacement before celebration", "Inputs drive outcomes", "Future pipeline protection"
4. Predict the impact: estimate how many points completing these actions will add to momentum
5. Be firm but supportive - this is about protecting future revenue

Response format:
- Start with a direct statement about the problem
- List specific actions with numbers (e.g., "Make 12 calls", not "make more calls")
- End with predicted momentum impact`;

  return prompt;
}
