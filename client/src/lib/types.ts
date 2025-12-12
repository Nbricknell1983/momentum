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

export type ActivityType = 'call' | 'email' | 'sms' | 'meeting' | 'dropin' | 'followup' | 'proposal' | 'deal';

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
