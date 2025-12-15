// Core types for Momentum Agent

export type Stage = 
  | 'suspect'
  | 'contacted'
  | 'engaged'
  | 'qualified'
  | 'discovery'
  | 'proposal'
  | 'verbal_commit'
  | 'won'
  | 'lost'
  | 'nurture';

export type ActivityType = 'call' | 'email' | 'sms' | 'meeting' | 'dropin' | 'followup' | 'proposal' | 'deal' | 'nba_completed' | 'nba_dismissed';

export type TaskStatus = 'pending' | 'completed' | 'snoozed';

export type TrafficLightStatus = 'green' | 'amber' | 'red';

// Nurture system types
export type NurtureMode = 'none' | 'active' | 'passive';
export type NurtureStatus = 'new' | 'touched_waiting' | 'needs_touch' | 'reengaged' | 'dormant' | 'exit' | null;
export type TouchChannel = 'call' | 'sms' | 'email';

export const NURTURE_STATUS_LABELS: Record<string, string> = {
  new: 'New to Nurture',
  touched_waiting: 'Touched - Awaiting Response',
  needs_touch: 'Needs Next Touch',
  reengaged: 'Re-engaged',
  dormant: 'Dormant',
  exit: 'Exit',
};

export const NURTURE_STATUS_ORDER: NurtureStatus[] = [
  'new',
  'touched_waiting',
  'needs_touch',
  'reengaged',
  'dormant',
  'exit',
];

export interface CadenceStep {
  id: string;
  dayOffset: number;
  channel: TouchChannel;
}

export interface Cadence {
  id: string;
  name: string;
  description?: string;
  mode: 'active' | 'passive';
  steps: CadenceStep[];
  isDefault?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Default cadences as per requirements
export const DEFAULT_CADENCES: Cadence[] = [
  {
    id: 'active_30',
    name: 'Active Nurture (30 days)',
    description: 'Intensive follow-up sequence for warm leads',
    mode: 'active',
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    steps: [
      { id: 's1', dayOffset: 1, channel: 'call' },
      { id: 's2', dayOffset: 3, channel: 'sms' },
      { id: 's3', dayOffset: 5, channel: 'email' },
      { id: 's4', dayOffset: 8, channel: 'call' },
      { id: 's5', dayOffset: 10, channel: 'sms' },
      { id: 's6', dayOffset: 14, channel: 'email' },
      { id: 's7', dayOffset: 17, channel: 'call' },
      { id: 's8', dayOffset: 21, channel: 'sms' },
      { id: 's9', dayOffset: 30, channel: 'call' },
    ],
  },
  {
    id: 'passive_90',
    name: 'Passive Nurture (90 days)',
    description: 'Light touch sequence for parking leads',
    mode: 'passive',
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    steps: [
      { id: 's1', dayOffset: 30, channel: 'email' },
      { id: 's2', dayOffset: 60, channel: 'sms' },
      { id: 's3', dayOffset: 90, channel: 'call' },
    ],
  },
];

// Legacy export for backwards compatibility
export const CADENCES = DEFAULT_CADENCES;

export interface Touch {
  id: string;
  leadId: string;
  userId: string;
  channel: TouchChannel;
  responseReceived: boolean;
  notes?: string;
  createdAt: Date;
}

export interface Lead {
  id: string;
  userId: string;
  companyName: string;
  territory: string;
  regionId?: string;
  regionName?: string;
  areaId?: string | null;
  areaName?: string | null;
  territoryKey?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  stage: Stage;
  mrr?: number;
  nepqLabel?: string;
  nextContactDate?: Date;
  lastContactDate?: Date;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
  contactName?: string;
  notes?: string;
  crmLink?: string;
  // Nurture fields
  nurtureMode: NurtureMode;
  nurtureCadenceId: string | null;
  nurtureStatus: NurtureStatus;
  nurtureStepIndex: number | null;
  enrolledInNurtureAt: Date | null;
  nextTouchAt: Date | null;
  lastTouchAt: Date | null;
  lastTouchChannel: TouchChannel | null;
  touchesNoResponse: number;
  engagementScore: number;
  nurturePriorityScore: number;
}

export interface Activity {
  id: string;
  userId: string;
  leadId: string;
  type: ActivityType;
  notes?: string;
  outcome?: string;
  createdAt: Date;
  nextContactDate?: Date;
  metadata?: Record<string, any>;
}

export interface Task {
  id: string;
  userId: string;
  leadId?: string;
  title: string;
  dueAt: Date;
  status: TaskStatus;
  createdAt: Date;
}

export interface DailyMetrics {
  id: string;
  userId: string;
  date: Date;
  calls: number;
  doors: number;
  meetings: number;
  followups: number;
  proposals: number;
  deals: number;
  momentumScore: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  territory?: string;
  targets: {
    calls: number;
    doors: number;
    meetings: number;
    followups: number;
    proposals: number;
    deals: number;
  };
  workingHours?: {
    start: string;
    end: string;
  };
  momentumWeights: {
    call: number;
    email: number;
    sms: number;
    dropin: number;
    meeting: number;
    proposal: number;
    deal: number;
  };
}

export const STAGE_LABELS: Record<Stage, string> = {
  suspect: 'Suspect',
  contacted: 'Contacted',
  engaged: 'Engaged',
  qualified: 'Qualified',
  discovery: 'Discovery/Meeting',
  proposal: 'Proposal/Solution',
  verbal_commit: 'Verbal Commit',
  won: 'Won',
  lost: 'Lost',
  nurture: 'Nurture (Parking)',
};

export const STAGE_ORDER: Stage[] = [
  'suspect',
  'contacted',
  'engaged',
  'qualified',
  'discovery',
  'proposal',
  'won',
  'lost',
  'nurture',
];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  call: 'Call',
  email: 'Email',
  sms: 'SMS',
  meeting: 'Meeting',
  dropin: 'Drop-in',
  followup: 'Follow-up',
  proposal: 'Proposal',
  deal: 'Deal',
};

export function getTrafficLightStatus(lead: Lead): TrafficLightStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (!lead.nextContactDate) {
    return 'red';
  }
  
  const nextDate = new Date(lead.nextContactDate);
  nextDate.setHours(0, 0, 0, 0);
  
  const lastDate = lead.lastContactDate ? new Date(lead.lastContactDate) : null;
  if (lastDate) lastDate.setHours(0, 0, 0, 0);
  
  // Green: today is before nextContactDate OR lastContactDate is after nextContactDate
  if (today < nextDate || (lastDate && lastDate > nextDate)) {
    return 'green';
  }
  
  // Amber: today equals nextContactDate
  if (today.getTime() === nextDate.getTime()) {
    return 'amber';
  }
  
  // Red: today is after nextContactDate AND (lastContactDate missing OR before nextContactDate)
  if (today > nextDate && (!lastDate || lastDate < nextDate)) {
    return 'red';
  }
  
  return 'green';
}

// Calculate nurture priority score based on requirements:
// +5 if response in last 14 days
// +3 if high MRR (>500)
// +2 if previously Qualified/Proposal
// -2 per unanswered touch
// -5 if silent > 45 days
export function calculateNurturePriorityScore(lead: Lead): number {
  let score = 0;
  const now = new Date();
  
  // +5 if response in last 14 days (touchesNoResponse == 0 and lastTouchAt within 14 days)
  if (lead.lastTouchAt && lead.touchesNoResponse === 0) {
    const daysSinceTouch = Math.floor((now.getTime() - new Date(lead.lastTouchAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceTouch <= 14) {
      score += 5;
    }
  }
  
  // +3 if high MRR (>500)
  if (lead.mrr && lead.mrr > 500) {
    score += 3;
  }
  
  // +2 if previously Qualified/Proposal
  if (lead.stage === 'qualified' || lead.stage === 'proposal' || lead.stage === 'discovery') {
    score += 2;
  }
  
  // -2 per unanswered touch
  score -= lead.touchesNoResponse * 2;
  
  // -5 if silent > 45 days
  if (lead.lastTouchAt) {
    const daysSilent = Math.floor((now.getTime() - new Date(lead.lastTouchAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSilent > 45) {
      score -= 5;
    }
  }
  
  return score;
}

// Get cadence by mode
export function getCadenceByMode(mode: 'active' | 'passive'): Cadence | undefined {
  return CADENCES.find(c => c.mode === mode);
}

// Calculate next touch date based on cadence
export function calculateNextTouchDate(enrolledAt: Date, stepIndex: number, cadence: Cadence): Date | null {
  if (stepIndex >= cadence.steps.length) {
    return null; // Cadence complete
  }
  const step = cadence.steps[stepIndex];
  const nextDate = new Date(enrolledAt);
  nextDate.setDate(nextDate.getDate() + step.dayOffset);
  return nextDate;
}

// Default nurture fields for a new lead
export const DEFAULT_NURTURE_FIELDS = {
  nurtureMode: 'none' as NurtureMode,
  nurtureCadenceId: null as string | null,
  nurtureStatus: null as NurtureStatus,
  nurtureStepIndex: null,
  enrolledInNurtureAt: null,
  nextTouchAt: null,
  lastTouchAt: null,
  lastTouchChannel: null as TouchChannel | null,
  touchesNoResponse: 0,
  engagementScore: 0,
  nurturePriorityScore: 0,
};

// ============================================
// Daily Plan Types (Fanatical Prospecting)
// ============================================

export type TimeBlockType = 'prospecting_doors' | 'prospecting_calls' | 'client_management' | 'meetings' | 'admin';
export type ActionType = 'call' | 'door' | 'email' | 'meeting' | 'follow_up' | 'check_in';
export type ActionStatus = 'pending' | 'completed' | 'skipped';
export type Urgency = 'high' | 'medium' | 'low';

export interface TimeBlock {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  type: TimeBlockType;
  activityTarget: number;
  activitiesCompleted: number;
  isLocked: boolean;
}

export interface ActionQueueItem {
  id: string;
  type: ActionType;
  leadId?: string;
  clientId?: string;
  title: string;
  subtitle?: string;
  timeBlockId?: string;
  urgency: Urgency;
  priorityScore: number;
  status: ActionStatus;
  completedAt?: Date;
  battleScorePoints: number;
}

export interface DailyPlanSummary {
  todaysFocus: string;
  nonNegotiableActions: string[];
  riskAreas: string[];
  generatedAt: Date;
}

export interface TargetProgress {
  target: number;
  completed: number;
}

export interface DailyTargets {
  prospecting: {
    calls: TargetProgress;
    doors: TargetProgress;
    conversations: TargetProgress;
    meetingsBooked: TargetProgress;
  };
  clients: {
    checkIns: TargetProgress;
    upsellConversations: TargetProgress;
    renewalActions: TargetProgress;
    followUps: TargetProgress;
  };
}

export interface DailyDebrief {
  completed: boolean;
  aiReview?: string;
  plannedVsCompleted?: {
    planned: number;
    completed: number;
    percentage: number;
  };
  improvements?: string[];
  tomorrowsFocus?: string;
  submittedAt?: Date;
}

export interface RouteStop {
  id: string;
  leadId: string;
  companyName: string;
  address: string;
  priority: number;
  estimatedTime?: string;
  completed: boolean;
}

export interface DailyPlan {
  id: string;
  date: Date;
  summary: DailyPlanSummary | null;
  targets: DailyTargets;
  timeBlocks: TimeBlock[];
  actionQueue: ActionQueueItem[];
  routeStops: RouteStop[];
  debrief: DailyDebrief;
  battleScoreEarned: number;
  hasProspectingBlock: boolean;
  isQueuesInitialized: boolean;
}

export const TIME_BLOCK_LABELS: Record<TimeBlockType, string> = {
  prospecting_doors: 'Door Knocking',
  prospecting_calls: 'Prospecting Calls',
  client_management: 'Client Management',
  meetings: 'Meetings',
  admin: 'Admin',
};

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  call: 'Call',
  door: 'Door Knock',
  email: 'Email',
  meeting: 'Meeting',
  follow_up: 'Follow-up',
  check_in: 'Check-in',
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const BATTLE_SCORE_POINTS: Record<ActionType, number> = {
  call: 5,
  door: 10,
  email: 3,
  meeting: 25,
  follow_up: 5,
  check_in: 5,
};

export function createDefaultDailyPlan(date: Date): DailyPlan {
  return {
    id: `dp-${date.toISOString().split('T')[0]}`,
    date,
    summary: null,
    targets: {
      prospecting: {
        calls: { target: 25, completed: 0 },
        doors: { target: 5, completed: 0 },
        conversations: { target: 10, completed: 0 },
        meetingsBooked: { target: 2, completed: 0 },
      },
      clients: {
        checkIns: { target: 5, completed: 0 },
        upsellConversations: { target: 2, completed: 0 },
        renewalActions: { target: 3, completed: 0 },
        followUps: { target: 10, completed: 0 },
      },
    },
    timeBlocks: [
      {
        id: 'tb-1',
        name: 'Morning Prospecting',
        startTime: '09:00',
        endTime: '11:00',
        type: 'prospecting_calls',
        activityTarget: 15,
        activitiesCompleted: 0,
        isLocked: true,
      },
      {
        id: 'tb-2',
        name: 'Follow-ups',
        startTime: '11:00',
        endTime: '12:00',
        type: 'client_management',
        activityTarget: 8,
        activitiesCompleted: 0,
        isLocked: false,
      },
      {
        id: 'tb-3',
        name: 'Lunch Meetings',
        startTime: '12:00',
        endTime: '14:00',
        type: 'meetings',
        activityTarget: 2,
        activitiesCompleted: 0,
        isLocked: false,
      },
      {
        id: 'tb-4',
        name: 'Afternoon Doors',
        startTime: '14:00',
        endTime: '16:00',
        type: 'prospecting_doors',
        activityTarget: 5,
        activitiesCompleted: 0,
        isLocked: true,
      },
      {
        id: 'tb-5',
        name: 'Admin & Prep',
        startTime: '16:00',
        endTime: '17:00',
        type: 'admin',
        activityTarget: 0,
        activitiesCompleted: 0,
        isLocked: false,
      },
    ],
    actionQueue: [],
    routeStops: [],
    debrief: {
      completed: false,
    },
    battleScoreEarned: 0,
    hasProspectingBlock: true,
    isQueuesInitialized: false,
  };
}

// ============================================
// NBA (Next Best Action) System Types
// ============================================

export type NBAActionType = 'call' | 'sms' | 'email' | 'meeting' | 'dropin' | 'proposal' | 'followup' | 'research';

export type NBAActionStatus = 'open' | 'done' | 'dismissed';

export interface NBAAction {
  id: string;
  targetType: 'lead' | 'deal';
  targetId: string;
  title: string;
  suggestedActionType: NBAActionType;
  suggestedMessage: string;
  suggestedEmail: { subject: string; body: string } | null;
  nepqQuestions: [string, string, string];
  reason: string;
  whyBullets: string[];
  suggestedNextStep: string;
  priorityScore: number;
  points: number;
  dueAt: Date | null;
  status: NBAActionStatus;
  createdAt: Date;
  updatedAt: Date;
  aiModelVersion: string;
  suppressUntil: Date | null;
  dismissedReason: string | null;
  dismissedAt: Date | null;
  fingerprint: string;
}

export interface FocusModeSettings {
  enabled: boolean;
  topActionIds: string[];
  startedAt: Date | null;
  updatedAt: Date | null;
}

export interface LeadHistory {
  id: string;
  leadId: string;
  type: 'created' | 'stage_change' | 'activity' | 'action_queue' | 'note' | 'edit' | 'deleted';
  summary: string;
  createdAt: Date;
  userId?: string;
  userName?: string;
  metadata?: Record<string, any>;
}

export const NBA_ACTION_POINTS: Record<NBAActionType, number> = {
  call: 5,
  sms: 3,
  email: 3,
  meeting: 8,
  dropin: 8,
  proposal: 6,
  followup: 5,
  research: 2,
};

export const NBA_ACTION_LABELS: Record<NBAActionType, string> = {
  call: 'Call',
  sms: 'SMS',
  email: 'Email',
  meeting: 'Meeting',
  dropin: 'Drop-in',
  proposal: 'Proposal',
  followup: 'Follow-up',
  research: 'Research',
};

// Generate fingerprint for NBA action deduplication
export function generateNBAFingerprint(targetId: string, actionType: NBAActionType): string {
  return `${targetId}-${actionType}-${new Date().toISOString().split('T')[0]}`;
}

// Re-export momentum types from momentumEngine
export type { 
  MomentumStatus, 
  MomentumBreakdown, 
  MomentumResult, 
  ActivityCounts, 
  ActivityTargets,
  CoachingContext 
} from './momentumEngine';

export { 
  getMomentumStatus, 
  getMomentumStatusLabel, 
  getMomentumStatusColor,
  calculateMomentum,
  calculateRollingAverage,
  detectTrendAlert,
  buildCoachingPrompt
} from './momentumEngine';
