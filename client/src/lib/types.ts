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

export type ActivityType = 'call' | 'email' | 'sms' | 'meeting' | 'dropin' | 'followup' | 'proposal' | 'deal' | 'nba_completed' | 'nba_dismissed' | 'stage_change';

export type TaskStatus = 'pending' | 'completed' | 'snoozed';

// Task types for Daily Plan revenue lanes
export type TaskType = 
  | 'prospecting'    // New business outreach
  | 'follow_up'      // Pipeline follow-ups
  | 'meeting'        // Discovery/client meetings
  | 'delivery'       // Deliverable updates
  | 'renewal'        // Contract renewals
  | 'upsell'         // Expansion opportunities
  | 'referral'       // Referral asks
  | 'admin'          // Admin tasks
  | 'check_in';      // Client check-ins (legacy compatibility)

// Time slots for task scheduling (simple version)
export type TaskTimeSlot = 'morning' | 'afternoon' | 'evening';

// Daily Time Block state for focus management (distinct from legacy TimeBlock)
export type DailyTimeBlockStatus = 'not_started' | 'active' | 'paused' | 'completed';

export interface DailyTimeBlock {
  slot: TaskTimeSlot;
  status: DailyTimeBlockStatus;
  startedAt?: Date;
  pausedAt?: Date;
  completedAt?: Date;
  totalActiveMinutes: number;  // Accumulated active time
  focusScore?: number;         // 1-100 score based on completion rate
}

export const DAILY_TIME_BLOCK_LABELS: Record<TaskTimeSlot, string> = {
  morning: 'Morning Block',
  afternoon: 'Afternoon Block',
  evening: 'Evening Block',
};

export const DAILY_TIME_BLOCK_RANGES: Record<TaskTimeSlot, string> = {
  morning: '8:00 AM - 12:00 PM',
  afternoon: '12:00 PM - 5:00 PM',
  evening: '5:00 PM - 8:00 PM',
};

// Create default daily time blocks for a day
export function createDefaultDailyTimeBlocks(): Record<TaskTimeSlot, DailyTimeBlock> {
  return {
    morning: { slot: 'morning', status: 'not_started', totalActiveMinutes: 0 },
    afternoon: { slot: 'afternoon', status: 'not_started', totalActiveMinutes: 0 },
    evening: { slot: 'evening', status: 'not_started', totalActiveMinutes: 0 },
  };
}

// Calculate focus score based on task completion within a time block
export function calculateBlockFocusScore(
  completedTasks: number,
  totalTasks: number,
  activeMinutes: number,
  expectedMinutes: number = 120
): number {
  if (totalTasks === 0) return 100;
  const completionRate = completedTasks / totalTasks;
  const timeEfficiency = Math.min(1, activeMinutes / expectedMinutes);
  return Math.round((completionRate * 0.7 + timeEfficiency * 0.3) * 100);
}

// Revenue lane classification
export type RevenueLane = 'client' | 'new_business';

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
  leadId?: string;
  clientId?: string;
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
  clientId?: string;
  title: string;
  dueAt: Date;
  status: TaskStatus;
  createdAt: Date;
  // Daily Plan integration (DD-MM-YYYY format for UI, YYYY-MM-DD for internal sorting)
  planDate?: string;         // DD-MM-YYYY (user-facing)
  planDateKey?: string;      // YYYY-MM-DD (internal sorting key)
  planBlockId?: string | null;
  // Enhanced task typing for revenue lanes
  taskType?: TaskType;
  timeSlot?: TaskTimeSlot;
  // Revenue lane classification (derived from taskType if not set)
  revenueLane?: RevenueLane;
  // Meeting-driven automation
  revenueExtended?: boolean;         // Did this task result in revenue extension?
  replacementTaskId?: string;        // If no revenue extended, linked replacement task
  sourceTaskId?: string;             // Task that triggered this one (for automation tracking)
  // Outcomes
  outcome?: 'no_answer' | 'conversation' | 'meeting_booked' | 'completed' | null;
  completedAt?: Date;
  sortOrder?: number;
  // AI-enhanced task fields
  aiEnhanced?: boolean;              // Was this task enhanced by AI?
  outcomeStatement?: string;         // What "done" looks like
  checklist?: TaskChecklistItem[];   // Step-by-step checklist
  priority?: TaskPriority;           // AI-suggested priority
  suggestedFollowUp?: string;        // AI-suggested follow-up if no response
  emailTemplate?: string;            // AI-generated email draft
  callScript?: string;               // AI-generated call script
  notes?: string;                    // Additional notes or context
}

// AI-generated checklist item
export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

// Task priority levels
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// AI Task Assist response shape
export interface AITaskAssistResponse {
  enhancedTitle: string;
  outcomeStatement: string;
  checklist: string[];
  suggestedDueDate: string;  // DD-MM-YYYY
  priority: TaskPriority;
  suggestedTaskType: TaskType;
  suggestedFollowUp: string;
  emailTemplate?: string;
  callScript?: string;
}

// Map ActivityType to TaskType for Pipeline → Daily Plan integration
export function activityTypeToTaskType(activityType: ActivityType): TaskType {
  switch (activityType) {
    case 'call':
    case 'sms':
    case 'email':
      return 'prospecting';
    case 'meeting':
      return 'meeting';
    case 'dropin':
      return 'check_in';
    case 'followup':
      return 'follow_up';
    case 'proposal':
      return 'delivery';
    case 'deal':
      return 'meeting';
    default:
      return 'admin';
  }
}

// Infer time slot from current time
export function getCurrentTimeSlot(): TaskTimeSlot {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// Helper to determine revenue lane from task type
export function getRevenueLane(taskType?: TaskType): RevenueLane {
  if (!taskType) return 'new_business';
  const clientTasks: TaskType[] = ['meeting', 'delivery', 'renewal', 'upsell', 'check_in'];
  return clientTasks.includes(taskType) ? 'client' : 'new_business';
}

// Task types that require replacement enforcement when no revenue extended
export const REPLACEMENT_REQUIRED_TYPES: TaskType[] = ['meeting', 'delivery', 'check_in'];

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
  nba_completed: 'NBA Completed',
  nba_dismissed: 'NBA Dismissed',
  stage_change: 'Stage Change',
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

export type RouteStopType = 'lead' | 'client';
export type RouteActionType = 'dropin' | 'meeting';

export interface RouteStop {
  id: string;
  targetType: RouteStopType;
  leadId?: string;
  clientId?: string;
  companyName: string;
  address: string;
  phone?: string;
  actionType: RouteActionType;
  priority: number;
  estimatedTime?: string;
  notes?: string;
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
// DD-MM-YYYY Date Format Utilities (NON-NEGOTIABLE)
// ============================================

export function formatDateDDMMYYYY(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function parseDateDDMMYYYY(dateStr: string): Date {
  const [day, month, year] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isValidDDMMYYYY(dateStr: string): boolean {
  const regex = /^\d{2}-\d{2}-\d{4}$/;
  if (!regex.test(dateStr)) return false;
  const parsed = parseDateDDMMYYYY(dateStr);
  return !isNaN(parsed.getTime());
}

export function getTodayDDMMYYYY(): string {
  return formatDateDDMMYYYY(new Date());
}

// Convert DD-MM-YYYY to YYYY-MM-DD for internal sorting (planDateKey)
export function toPlanDateKey(ddmmyyyy: string): string {
  const [day, month, year] = ddmmyyyy.split('-');
  return `${year}-${month}-${day}`;
}

// Convert YYYY-MM-DD back to DD-MM-YYYY if needed
export function fromPlanDateKey(yyyymmdd: string): string {
  const [year, month, day] = yyyymmdd.split('-');
  return `${day}-${month}-${year}`;
}

// ============================================
// Firestore-Backed Daily Plan Types
// ============================================

export type PlanTaskType = 'call' | 'door_knock' | 'meeting' | 'follow_up' | 'check_in' | 'renewal' | 'upsell' | 'other';
export type PlanTaskOutcome = 'no_answer' | 'conversation' | 'meeting_booked' | 'completed' | null;
export type PlanBlockCategory = 'prospecting_calls' | 'prospecting_doors' | 'client_management' | 'meetings' | 'admin';

export interface PlanTimeBlock {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  category: PlanBlockCategory;
  capacity: number;
  isLocked: boolean;
}

export interface AIBrief {
  id: string;
  planDate: string;
  todaysFocus: string;
  focusModeTop3: string[];
  targets: {
    calls: number;
    doorKnocks: number;
    conversations: number;
    meetingsBooked: number;
    clientCheckIns: number;
    upsellConvos: number;
    renewalActions: number;
    followUps: number;
  };
  riskList: {
    type: 'overdue_client' | 'neglected_client' | 'renewal_due' | 'upsell_opportunity' | 'overdue_task';
    targetId: string;
    targetName: string;
    reason: string;
  }[];
  suggestedTimeAllocation: {
    blockId: string;
    blockName: string;
    suggestedTasks: number;
  }[];
  generatedAt: Date;
  aiModelVersion: string;
}

export interface AIDebrief {
  id: string;
  planDate: string;
  summary: {
    planned: number;
    completed: number;
    percentage: number;
  };
  whatSlipped: {
    taskId: string;
    title: string;
    reason: 'overdue' | 'rescheduled' | 'no_response' | 'skipped';
  }[];
  tomorrowPriorities: string[];
  rollForwardTasks: {
    taskId: string;
    title: string;
    newPlanDate: string;
  }[];
  aiReview: string;
  improvements: string[];
  generatedAt: Date;
  aiModelVersion: string;
}

export interface PlanActionRecommendation {
  id: string;
  targetType: 'lead' | 'client';
  targetId: string;
  targetName: string;
  reason: string;
  expectedImpact: string;
  suggestedBlockId: string;
  suggestedBlockName: string;
  taskType: PlanTaskType;
  linkedTaskId?: string;
  priorityScore: number;
  status: 'recommended' | 'accepted' | 'dismissed';
}

export interface DailyPlanDoc {
  id: string;
  planDate: string;
  orgId: string;
  userId: string;
  timeBlocks: PlanTimeBlock[];
  targets: DailyTargets;
  routeStops: RouteStop[];
  battleScoreEarned: number;
  briefId?: string;
  debriefId?: string;
  lastGeneratedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDailySettings {
  id: string;
  userId: string;
  orgId: string;
  dailyTargets: {
    calls: number;
    doorKnocks: number;
    conversations: number;
    meetingsBooked: number;
    clientCheckIns: number;
    upsellConvos: number;
    renewalActions: number;
    followUps: number;
  };
  defaultTimeBlocks: PlanTimeBlock[];
  workingHours: {
    start: string;
    end: string;
  };
  territory?: string;
  updatedAt: Date;
}

export const DEFAULT_PLAN_TIME_BLOCKS: PlanTimeBlock[] = [
  { id: 'block-morning-prospecting', name: 'Morning Prospecting', startTime: '09:00', endTime: '11:00', category: 'prospecting_calls', capacity: 15, isLocked: true },
  { id: 'block-follow-ups', name: 'Follow-ups', startTime: '11:00', endTime: '12:00', category: 'client_management', capacity: 8, isLocked: false },
  { id: 'block-lunch-meetings', name: 'Lunch Meetings', startTime: '12:00', endTime: '14:00', category: 'meetings', capacity: 2, isLocked: false },
  { id: 'block-afternoon-doors', name: 'Afternoon Doors', startTime: '14:00', endTime: '16:00', category: 'prospecting_doors', capacity: 5, isLocked: true },
  { id: 'block-admin-prep', name: 'Admin & Prep', startTime: '16:00', endTime: '17:00', category: 'admin', capacity: 0, isLocked: false },
];

export const DEFAULT_DAILY_TARGETS = {
  calls: 25,
  doorKnocks: 5,
  conversations: 10,
  meetingsBooked: 2,
  clientCheckIns: 5,
  upsellConvos: 2,
  renewalActions: 3,
  followUps: 10,
};

export const PLAN_BLOCK_CATEGORY_LABELS: Record<PlanBlockCategory, string> = {
  prospecting_calls: 'Prospecting Calls',
  prospecting_doors: 'Door Knocking',
  client_management: 'Client Management',
  meetings: 'Meetings',
  admin: 'Admin',
};

export const PLAN_TASK_TYPE_LABELS: Record<PlanTaskType, string> = {
  call: 'Call',
  door_knock: 'Door Knock',
  meeting: 'Meeting',
  follow_up: 'Follow-up',
  check_in: 'Check-in',
  renewal: 'Renewal Action',
  upsell: 'Upsell Conversation',
  other: 'Other',
};

export function createDefaultDailyPlanDoc(planDate: string, orgId: string, userId: string): DailyPlanDoc {
  return {
    id: `${orgId}_${userId}_${planDate}`,
    planDate,
    orgId,
    userId,
    timeBlocks: [...DEFAULT_PLAN_TIME_BLOCKS],
    targets: {
      prospecting: {
        calls: { target: DEFAULT_DAILY_TARGETS.calls, completed: 0 },
        doors: { target: DEFAULT_DAILY_TARGETS.doorKnocks, completed: 0 },
        conversations: { target: DEFAULT_DAILY_TARGETS.conversations, completed: 0 },
        meetingsBooked: { target: DEFAULT_DAILY_TARGETS.meetingsBooked, completed: 0 },
      },
      clients: {
        checkIns: { target: DEFAULT_DAILY_TARGETS.clientCheckIns, completed: 0 },
        upsellConversations: { target: DEFAULT_DAILY_TARGETS.upsellConvos, completed: 0 },
        renewalActions: { target: DEFAULT_DAILY_TARGETS.renewalActions, completed: 0 },
        followUps: { target: DEFAULT_DAILY_TARGETS.followUps, completed: 0 },
      },
    },
    routeStops: [],
    battleScoreEarned: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ============================================
// NBA (Next Best Action) System Types
// ============================================

export type NBAActionType = 'call' | 'sms' | 'email' | 'meeting' | 'dropin' | 'proposal' | 'followup' | 'research';

export type NBAActionStatus = 'open' | 'done' | 'dismissed';

export interface NBAAction {
  id: string;
  targetType: 'lead' | 'deal' | 'client';
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

// ============================================
// Client Management Types
// ============================================

export type HealthStatus = 'green' | 'amber' | 'red';
export type ProductStatus = 'active' | 'paused' | 'cancelled';
export type DeliverableStatus = 'not_started' | 'in_progress' | 'blocked' | 'completed';
export type StrategyStatus = 'not_started' | 'in_progress' | 'completed' | 'needs_review';
export type ChannelStatus = 'not_started' | 'in_progress' | 'live' | 'paused';
export type CadenceTier = 'high_touch' | 'standard' | 'low_touch';
export type ServiceAreaType = 'local' | 'regional' | 'multi-location';
export type StrategyPlanStatus = 'active' | 'superseded';
export type ContentDraftType = 'seoBlog' | 'gbpPost' | 'facebookPost' | 'landingPageOutline' | 'reviewRequestTemplate';
export type ContentDraftStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'published';
export type PrimaryGoal = 'map_pack' | 'more_leads' | 'organic_rankings' | 'lower_cpl';

export interface BusinessProfile {
  industry: string;
  primaryServices: string[];
  secondaryServices: string[];
  primaryLocations: string[];
  secondaryLocations: string[];
  serviceAreaType: ServiceAreaType;
  idealJobType: string;
  averageJobValue: number | null;
  seasonalityNotes: string | null;
  primaryGoal: PrimaryGoal | null;
  websiteUrl?: string;
  gbpUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  workingWell: string[];
  notWorkingWell: string[];
  additionalNotes?: string;
}

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  industry: '',
  primaryServices: [],
  secondaryServices: [],
  primaryLocations: [],
  secondaryLocations: [],
  serviceAreaType: 'local',
  idealJobType: '',
  averageJobValue: null,
  seasonalityNotes: null,
  primaryGoal: null,
  workingWell: [],
  notWorkingWell: [],
};

export const PRIMARY_GOAL_LABELS: Record<PrimaryGoal, string> = {
  map_pack: 'Map Pack (Top 3)',
  more_leads: 'More Calls/Leads',
  organic_rankings: 'Organic Rankings',
  lower_cpl: 'Lower CPL / Better Lead Quality',
};

export interface Product {
  id: string;
  productType: string;
  status: ProductStatus;
  monthlyValue: number;
  startDate: Date;
  endDate?: Date;
  notes?: string;
}

export interface ChannelStatuses {
  website: ChannelStatus;
  gbp: ChannelStatus;
  seo: ChannelStatus;
  ppc: ChannelStatus;
}

export type HealthContributorType = 'visibility' | 'leads' | 'conversion' | 'delivery' | 'engagement' | 'billing' | 'reputation' | 'retention' | 'contact' | 'strategy' | 'products' | 'channels';
export type HealthContributorStatus = 'bad' | 'ok' | 'good';

export interface HealthContributor {
  type: HealthContributorType;
  status: HealthContributorStatus;
  label: string;
  metricKey?: string;
  metricValue?: string | number;
  updatedAt: Date;
  evidenceRefs?: string[];
}

export const HEALTH_CONTRIBUTOR_LABELS: Record<HealthContributorType, string> = {
  visibility: 'Visibility',
  leads: 'Leads',
  conversion: 'Conversion',
  delivery: 'Delivery',
  engagement: 'Engagement',
  billing: 'Billing',
  reputation: 'Reputation',
  retention: 'Retention',
  contact: 'Contact',
  strategy: 'Strategy',
  products: 'Products',
  channels: 'Channels',
};

export interface ClientTaskStats {
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  lastTaskDueAt?: Date;
}

export interface Client {
  id: string;
  userId: string;
  businessName: string;
  primaryContactName: string;
  phone?: string;
  email?: string;
  address?: string;
  regionId?: string;
  regionName?: string;
  areaId?: string | null;
  areaName?: string | null;
  territoryKey?: string;
  ownerId: string;
  products: Product[];
  businessProfile: BusinessProfile | null;
  strategyStatus: StrategyStatus;
  activeStrategyPlanId?: string;
  lastStrategyReviewAt?: Date;
  nextStrategyReviewAt?: Date;
  healthStatus: HealthStatus;
  churnRiskScore: number;
  healthReasons: string[];
  healthContributors?: HealthContributor[];
  taskStats?: ClientTaskStats;
  channelStatus: ChannelStatuses;
  cadenceTier: CadenceTier;
  preferredContactCadenceDays: number;
  sourceType: 'deal' | 'manual';
  sourceDealId?: string;
  totalMRR: number;
  lastContactDate?: Date;
  nextContactDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
  // Client Health Engine fields
  upsellReadiness?: 'not_ready' | 'warming' | 'ready' | 'hot';
  deliveryStatus?: 'onboarding' | 'active' | 'blocked' | 'complete';
  daysSinceContact?: number;  // Computed field for quick access
}

export interface Deliverable {
  id: string;
  clientId: string;
  productType: string;
  title: string;
  status: DeliverableStatus;
  milestones: { id: string; title: string; completed: boolean; completedAt?: Date }[];
  nextFollowUpAt?: Date;
  blocker?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WizardAnswers {
  industry: string;
  primaryServices: string[];
  primaryLocations: string[];
  serviceAreaType: ServiceAreaType;
  idealJobType: string;
  averageJobValue: number | null;
  seasonalityNotes: string | null;
  primaryGoal: PrimaryGoal | null;
  websiteUrl?: string;
  gbpUrl?: string;
  workingWell: string[];
  notWorkingWell: string[];
  additionalNotes?: string;
}

export interface StrategySession {
  id: string;
  clientId: string;
  sessionDate: Date;
  attendees: string[];
  agenda: string;
  notes: string;
  actionItems: string[];
  wizardAnswers?: WizardAnswers;
  assetLinks?: {
    websiteUrl?: string;
    gbpUrl?: string;
    facebookUrl?: string;
    instagramUrl?: string;
  };
  createdAt: Date;
}

export interface ChannelPlan {
  channel: 'website' | 'gbp' | 'seo' | 'ppc' | 'social';
  objective: string;
  keyResults: string[];
  tactics: string[];
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  description: string;
  phase: '30' | '60' | '90';
  channel: string;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: Date;
}

export interface StrategyPlan {
  id: string;
  clientId: string;
  status: StrategyPlanStatus;
  goal: PrimaryGoal | null;
  currentState: {
    summary: string;
    strengths: string[];
    weaknesses: string[];
  };
  targetState: {
    summary: string;
    outcomes: string[];
  };
  gapSummary: string;
  channelPlan: ChannelPlan[];
  roadmap_30_60_90: RoadmapMilestone[];
  coreStrategy: string;
  channelOKRs: { channel: string; objective: string; keyResults: string[] }[];
  roadmap30: string[];
  roadmap60: string[];
  roadmap90: string[];
  initiatives: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentDraft {
  id: string;
  clientId: string;
  strategyPlanId: string;
  type: ContentDraftType;
  title: string;
  content: string;
  status: ContentDraftStatus;
  feedback?: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

export interface ClientHistory {
  id: string;
  clientId: string;
  type: 'created' | 'converted' | 'activity' | 'health_change' | 'product_change' | 'strategy' | 'note' | 'edit';
  summary: string;
  createdAt: Date;
  userId?: string;
  userName?: string;
  metadata?: Record<string, any>;
}

// ============================================
// Evidence-Driven Strategy Types
// ============================================

export type InsightChannel = 'website' | 'seo' | 'gbp' | 'content' | 'ppc' | 'analytics';
export type AnalysisStatus = 'assumed' | 'evidence_provided' | 'verified';
export type EvidenceConfidence = 'low' | 'medium' | 'high';

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  assumed: 'Assumed (no evidence)',
  evidence_provided: 'Evidence Provided',
  verified: 'Verified by Analysis',
};

export const INSIGHT_CHANNEL_LABELS: Record<InsightChannel, string> = {
  website: 'Website',
  seo: 'SEO',
  gbp: 'Google Business Profile',
  content: 'Content',
  ppc: 'PPC/Paid Ads',
  analytics: 'Analytics',
};

export interface EvidenceItem {
  id: string;
  type: 'screenshot' | 'url' | 'text' | 'note';
  url?: string;
  label: string;
  content?: string;
  createdAt: Date;
}

export interface ChannelEvidence {
  screenshots: EvidenceItem[];
  urls: string[];
  pastedText: string;
  notes: string;
}

export interface AIAnalysis {
  summary: string;
  score: number;
  confidence: EvidenceConfidence;
  reasoning: string[];
  gaps: string[];
  recommendations: string[];
  analyzedAt: Date;
}

export interface ChannelInsight {
  id: string;
  clientId: string;
  channel: InsightChannel;
  analysisStatus: AnalysisStatus;
  evidence: ChannelEvidence;
  providedBy: string | null;
  providedAt: Date | null;
  aiAnalysis: AIAnalysis | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_CHANNEL_EVIDENCE: ChannelEvidence = {
  screenshots: [],
  urls: [],
  pastedText: '',
  notes: '',
};

export const DEFAULT_CHANNEL_INSIGHT = (channel: InsightChannel, clientId: string): Omit<ChannelInsight, 'id'> => ({
  clientId,
  channel,
  analysisStatus: 'assumed',
  evidence: { ...DEFAULT_CHANNEL_EVIDENCE },
  providedBy: null,
  providedAt: null,
  aiAnalysis: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Analytics Snapshot for manual input
export interface AnalyticsSnapshot {
  id: string;
  clientId: string;
  dateRange: string;
  sessions: number | null;
  users: number | null;
  conversions: number | null;
  conversionRate: number | null;
  topPages: string[];
  topKeywords: string[];
  notes: string;
  screenshotUrl?: string;
  createdAt: Date;
}

export interface AnalyticsComparison {
  previousSnapshot: AnalyticsSnapshot | null;
  currentSnapshot: AnalyticsSnapshot;
  changes: {
    sessions: { value: number; percent: number } | null;
    conversions: { value: number; percent: number } | null;
  };
  aiInsights: string[];
  recommendations: string[];
  generatedAt: Date;
}

// Evidence-Driven Task (replaces generic tasks)
export type EvidenceTaskStatus = 'pending' | 'in_progress' | 'completed' | 'verified';

export interface EvidenceTask {
  id: string;
  clientId: string;
  task: string;
  channel: InsightChannel;
  definition: string;
  evidenceRequired: ('screenshot' | 'text' | 'url')[];
  evidenceProvided: EvidenceItem[];
  status: EvidenceTaskStatus;
  impactMetric: string;
  aiValidation?: {
    validated: boolean;
    feedback: string;
    validatedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  verifiedAt?: Date;
}

// Strategy Wizard Answers - Canonical Type (per spec)
export interface StrategyWizardAnswers {
  // Step 1: Business Basics
  industry: string;
  primaryServices: string[];
  secondaryServices: string[];
  serviceAreaType: ServiceAreaType;
  primaryLocations: string[];
  secondaryLocations: string[];
  idealJobType: string;
  averageJobValue: number | null;
  seasonalityNotes: string | null;

  // Step 2: Goal
  primaryGoal: PrimaryGoal | null;
  definitionOfSuccess: string;

  // Step 3: Current Marketing
  whatsWorking: string[];
  whatsNotWorking: string[];
  notes: string;

  // Step 4: Assets
  assetLinks: {
    websiteUrl: string;
    gbpUrl: string;
    placeId: string;
    facebookUrl: string;
    instagramUrl: string;
  };

  // Step 5: Competitors
  competitors: {
    provided: { name: string; websiteUrl: string; placeId: string }[];
  };

  // Step 6: Preferences
  preferences: {
    cadenceTier: CadenceTier;
    productsEnabled: { gbp: boolean; website: boolean; seo: boolean; ppc: boolean };
  };

  // Analytics baseline (optional)
  analyticsBaseline: AnalyticsSnapshot | null;
}

export const DEFAULT_STRATEGY_WIZARD_ANSWERS: StrategyWizardAnswers = {
  industry: '',
  primaryServices: [],
  secondaryServices: [],
  serviceAreaType: 'local',
  primaryLocations: [],
  secondaryLocations: [],
  idealJobType: '',
  averageJobValue: null,
  seasonalityNotes: null,
  primaryGoal: null,
  definitionOfSuccess: '',
  whatsWorking: [],
  whatsNotWorking: [],
  notes: '',
  assetLinks: {
    websiteUrl: '',
    gbpUrl: '',
    placeId: '',
    facebookUrl: '',
    instagramUrl: '',
  },
  competitors: {
    provided: [],
  },
  preferences: {
    cadenceTier: 'standard',
    productsEnabled: { gbp: true, website: true, seo: true, ppc: false },
  },
  analyticsBaseline: null,
};

// Helper to convert legacy BusinessProfile to StrategyWizardAnswers
export function businessProfileToWizardAnswers(profile: BusinessProfile | null): StrategyWizardAnswers {
  if (!profile) return { ...DEFAULT_STRATEGY_WIZARD_ANSWERS };
  return {
    industry: profile.industry || '',
    primaryServices: profile.primaryServices || [],
    secondaryServices: profile.secondaryServices || [],
    serviceAreaType: profile.serviceAreaType || 'local',
    primaryLocations: profile.primaryLocations || [],
    secondaryLocations: profile.secondaryLocations || [],
    idealJobType: profile.idealJobType || '',
    averageJobValue: profile.averageJobValue ?? null,
    seasonalityNotes: profile.seasonalityNotes ?? null,
    primaryGoal: profile.primaryGoal ?? null,
    definitionOfSuccess: '',
    whatsWorking: profile.workingWell || [],
    whatsNotWorking: profile.notWorkingWell || [],
    notes: profile.additionalNotes || '',
    assetLinks: {
      websiteUrl: profile.websiteUrl || '',
      gbpUrl: profile.gbpUrl || '',
      placeId: '',
      facebookUrl: profile.facebookUrl || '',
      instagramUrl: profile.instagramUrl || '',
    },
    competitors: { provided: [] },
    preferences: {
      cadenceTier: 'standard',
      productsEnabled: { gbp: true, website: true, seo: true, ppc: false },
    },
    analyticsBaseline: null,
  };
}

// Helper to convert StrategyWizardAnswers back to BusinessProfile for backwards compatibility
export function wizardAnswersToBusinessProfile(answers: StrategyWizardAnswers): BusinessProfile {
  return {
    industry: answers.industry,
    primaryServices: answers.primaryServices,
    secondaryServices: answers.secondaryServices,
    primaryLocations: answers.primaryLocations,
    secondaryLocations: answers.secondaryLocations,
    serviceAreaType: answers.serviceAreaType,
    idealJobType: answers.idealJobType,
    averageJobValue: answers.averageJobValue,
    seasonalityNotes: answers.seasonalityNotes,
    primaryGoal: answers.primaryGoal,
    websiteUrl: answers.assetLinks.websiteUrl,
    gbpUrl: answers.assetLinks.gbpUrl,
    facebookUrl: answers.assetLinks.facebookUrl,
    instagramUrl: answers.assetLinks.instagramUrl,
    workingWell: answers.whatsWorking,
    notWorkingWell: answers.whatsNotWorking,
    additionalNotes: answers.notes,
  };
}

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  green: 'Healthy',
  amber: 'At Risk',
  red: 'Critical',
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
};

export const CADENCE_TIER_LABELS: Record<CadenceTier, string> = {
  high_touch: 'High Touch',
  standard: 'Standard',
  low_touch: 'Low Touch',
};

export const CADENCE_TIER_DAYS: Record<CadenceTier, number> = {
  high_touch: 7,
  standard: 14,
  low_touch: 30,
};

export interface ClientHealthResult {
  churnRiskScore: number;
  healthStatus: HealthStatus;
  healthReasons: string[];
  healthContributors: HealthContributor[];
}

export function calculateClientHealth(client: Client): ClientHealthResult {
  let score = 0;
  const reasons: string[] = [];
  const contributors: HealthContributor[] = [];
  const now = new Date();
  
  // Contact health
  if (client.lastContactDate) {
    const daysSinceContact = Math.floor((now.getTime() - new Date(client.lastContactDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceContact > client.preferredContactCadenceDays * 2) {
      score += 35;
      reasons.push(`Severely overdue for contact (${daysSinceContact} days since last contact)`);
      contributors.push({ type: 'contact', status: 'bad', label: `${daysSinceContact}d since contact`, metricKey: 'days_since_contact', metricValue: daysSinceContact, updatedAt: now });
    } else if (daysSinceContact > client.preferredContactCadenceDays) {
      score += 20;
      reasons.push(`Overdue for contact (${daysSinceContact} days since last contact)`);
      contributors.push({ type: 'contact', status: 'bad', label: `Overdue: ${daysSinceContact}d`, metricKey: 'days_since_contact', metricValue: daysSinceContact, updatedAt: now });
    } else {
      contributors.push({ type: 'contact', status: 'good', label: `Contact OK (${daysSinceContact}d)`, metricKey: 'days_since_contact', metricValue: daysSinceContact, updatedAt: now });
    }
  } else {
    score += 25;
    reasons.push('No contact date recorded');
    contributors.push({ type: 'contact', status: 'bad', label: 'No contact recorded', updatedAt: now });
  }
  
  // Strategy health
  if (client.strategyStatus === 'needs_review') {
    score += 10;
    reasons.push('Strategy needs review');
    contributors.push({ type: 'strategy', status: 'ok', label: 'Strategy needs review', updatedAt: now });
  } else if (client.strategyStatus === 'not_started') {
    score += 20;
    reasons.push('No strategy plan started');
    contributors.push({ type: 'strategy', status: 'bad', label: 'No strategy started', updatedAt: now });
  } else if (client.strategyStatus === 'completed') {
    contributors.push({ type: 'strategy', status: 'good', label: 'Strategy active', updatedAt: now });
  }
  
  // Products health
  const pausedProducts = client.products.filter(p => p.status === 'paused').length;
  const activeProducts = client.products.filter(p => p.status === 'active').length;
  if (pausedProducts > 0) {
    score += pausedProducts * 5;
    reasons.push(`${pausedProducts} product(s) paused`);
    contributors.push({ type: 'products', status: 'ok', label: `${pausedProducts} paused`, metricValue: pausedProducts, updatedAt: now });
  }
  if (activeProducts === 0 && client.products.length === 0) {
    score += 10;
    reasons.push('No products assigned');
    contributors.push({ type: 'products', status: 'bad', label: 'No products', updatedAt: now });
  } else if (activeProducts > 0) {
    contributors.push({ type: 'products', status: 'good', label: `${activeProducts} active`, metricValue: activeProducts, updatedAt: now });
  }
  
  // Channels health
  const allChannelsLive = Object.values(client.channelStatus).every(s => s === 'live');
  const channelsNotStarted = Object.entries(client.channelStatus).filter(([, status]) => status === 'not_started');
  if (allChannelsLive && Object.keys(client.channelStatus).length > 0) {
    score -= 10;
    contributors.push({ type: 'channels', status: 'good', label: 'All channels live', updatedAt: now });
  } else if (channelsNotStarted.length === Object.keys(client.channelStatus).length) {
    score += 5;
    reasons.push('No channels have been started');
    contributors.push({ type: 'channels', status: 'bad', label: 'No channels started', updatedAt: now });
  } else {
    const liveCount = Object.values(client.channelStatus).filter(s => s === 'live').length;
    contributors.push({ type: 'channels', status: 'ok', label: `${liveCount}/${Object.keys(client.channelStatus).length} live`, updatedAt: now });
  }
  
  const finalScore = Math.max(0, Math.min(100, score));
  const healthStatus = getClientHealthStatus(finalScore);
  
  // Sort contributors: bad first, then ok, then good
  const statusOrder = { bad: 0, ok: 1, good: 2 };
  contributors.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  
  return {
    churnRiskScore: finalScore,
    healthStatus,
    healthReasons: reasons,
    healthContributors: contributors,
  };
}

export function calculateChurnRiskScore(client: Client): number {
  return calculateClientHealth(client).churnRiskScore;
}

export function getClientHealthStatus(churnRiskScore: number): HealthStatus {
  if (churnRiskScore < 30) return 'green';
  if (churnRiskScore < 60) return 'amber';
  return 'red';
}

export const DEFAULT_CLIENT_FIELDS = {
  products: [] as Product[],
  strategyStatus: 'not_started' as StrategyStatus,
  healthStatus: 'green' as HealthStatus,
  churnRiskScore: 0,
  healthReasons: [] as string[],
  channelStatus: {
    website: 'not_started' as ChannelStatus,
    gbp: 'not_started' as ChannelStatus,
    seo: 'not_started' as ChannelStatus,
    ppc: 'not_started' as ChannelStatus,
  },
  cadenceTier: 'standard' as CadenceTier,
  preferredContactCadenceDays: 14,
  sourceType: 'manual' as const,
  totalMRR: 0,
  archived: false,
};

// Client Health Engine - Automatic Task Injection

export interface ClientTaskRecommendation {
  clientId: string;
  clientName: string;
  taskType: TaskType;
  title: string;
  reason: string;
  priority: number;  // 1-100, higher = more urgent
  totalMRR: number;
}

export function generateClientTaskRecommendations(clients: Client[], maxTasks: number = 5): ClientTaskRecommendation[] {
  const recommendations: ClientTaskRecommendation[] = [];
  const now = new Date();
  const seenClientTasks = new Set<string>(); // Dedupe by clientId+taskType
  
  for (const client of clients) {
    if (client.archived) continue;
    
    // Safe access with defaults
    const cadenceDays = client.preferredContactCadenceDays || 14;
    const daysSinceContact = client.lastContactDate 
      ? Math.floor((now.getTime() - new Date(client.lastContactDate).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    // Check-in needed (overdue contact)
    const checkInKey = `${client.id}-check_in`;
    if (daysSinceContact > cadenceDays && !seenClientTasks.has(checkInKey)) {
      const severityMultiplier = daysSinceContact > cadenceDays * 2 ? 1.5 : 1;
      recommendations.push({
        clientId: client.id,
        clientName: client.businessName,
        taskType: 'check_in',
        title: `Check in with ${client.businessName}`,
        reason: `${daysSinceContact} days since last contact`,
        priority: Math.min(100, Math.round(((client.churnRiskScore || 0) + ((client.totalMRR || 0) / 100)) * severityMultiplier)),
        totalMRR: client.totalMRR || 0,
      });
      seenClientTasks.add(checkInKey);
    }
    
    // Upsell opportunity (ready or hot)
    const upsellKey = `${client.id}-upsell`;
    if ((client.upsellReadiness === 'ready' || client.upsellReadiness === 'hot') && !seenClientTasks.has(upsellKey)) {
      recommendations.push({
        clientId: client.id,
        clientName: client.businessName,
        taskType: 'upsell',
        title: `Upsell opportunity: ${client.businessName}`,
        reason: client.upsellReadiness === 'hot' ? 'Hot upsell opportunity' : 'Ready for upsell conversation',
        priority: client.upsellReadiness === 'hot' ? 90 : 70,
        totalMRR: client.totalMRR || 0,
      });
      seenClientTasks.add(upsellKey);
    }
    
    // Renewal coming up (within 30 days of any product end date)
    const renewalKey = `${client.id}-renewal`;
    const upcomingRenewals = (client.products || []).filter(p => {
      if (!p.endDate || p.status !== 'active') return false;
      const daysToEnd = Math.floor((new Date(p.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysToEnd > 0 && daysToEnd <= 30;
    });
    
    if (upcomingRenewals.length > 0 && !seenClientTasks.has(renewalKey)) {
      const daysToRenewal = Math.min(...upcomingRenewals.map(p => 
        Math.floor((new Date(p.endDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      ));
      recommendations.push({
        clientId: client.id,
        clientName: client.businessName,
        taskType: 'renewal',
        title: `Renewal discussion: ${client.businessName}`,
        reason: `Renewal in ${daysToRenewal} days`,
        priority: Math.max(65, 95 - daysToRenewal), // More urgent as date approaches
        totalMRR: client.totalMRR || 0,
      });
      seenClientTasks.add(renewalKey);
    }
    
    // High churn risk client needs attention (only if not already check_in)
    if (client.healthStatus === 'red' && !seenClientTasks.has(checkInKey)) {
      recommendations.push({
        clientId: client.id,
        clientName: client.businessName,
        taskType: 'check_in',
        title: `Urgent: Review ${client.businessName} account`,
        reason: 'High churn risk',
        priority: 85 + ((client.totalMRR || 0) / 1000), // Weight by revenue
        totalMRR: client.totalMRR || 0,
      });
      seenClientTasks.add(checkInKey);
    }
  }
  
  // Sort by priority (highest first), then by MRR (highest first)
  recommendations.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.totalMRR - a.totalMRR;
  });
  
  return recommendations.slice(0, maxTasks);
}

// Replacement Rate Calculation

export interface ReplacementRateResult {
  required: number;       // Number of new qualified conversations needed
  achieved: number;       // Number achieved today
  deficit: number;        // required - achieved (0 if achieved >= required)
  pipelineDecayRate: number;  // Daily pipeline decay estimate
}

export function calculateReplacementRate(
  clientMeetingsToday: number,
  revenueExtendedCount: number,
  qualifiedConversationsToday: number,
  avgConversionRate: number = 0.2  // 20% conversion default
): ReplacementRateResult {
  // Each client meeting without revenue extension needs replacement
  const meetingsNeedingReplacement = clientMeetingsToday - revenueExtendedCount;
  
  // Assume each non-extended meeting represents potential pipeline decay
  // Need enough new conversations to maintain pipeline
  const required = Math.max(0, Math.ceil(meetingsNeedingReplacement / avgConversionRate));
  
  return {
    required,
    achieved: qualifiedConversationsToday,
    deficit: Math.max(0, required - qualifiedConversationsToday),
    pipelineDecayRate: meetingsNeedingReplacement,
  };
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

// ============================================
// Strategy Engine Types (Decision Engine)
// ============================================

export type StrategyQuestionCategory = 'foundations' | 'acquisition' | 'retention' | 'growth' | 'risks';

export interface StrategyQuestion {
  id: string;
  category: StrategyQuestionCategory;
  question: string;
  description?: string;
  answerType: 'text' | 'select' | 'multi_select' | 'number' | 'boolean';
  options?: string[];
  required: boolean;
  priority: number;  // Higher = more important for strategy generation
}

export interface StrategyQuestionAnswer {
  questionId: string;
  answer: string | string[] | number | boolean;
  confidence: 'low' | 'medium' | 'high';
  source?: string;  // Where the answer came from (e.g., "client call", "analytics", "assumption")
  updatedAt: Date;
}

export type StrategyEngineStatus = 'not_started' | 'gathering_intel' | 'strategy_generated' | 'needs_refresh';

export interface StrategyEngineState {
  status: StrategyEngineStatus;
  answers: StrategyQuestionAnswer[];
  pendingQuestionIds: string[];
  lastEvaluatedAt?: Date;
  engineVersion?: string;
}

export interface StrategyPillar {
  id: string;
  name: string;
  goal: string;
  rationale: string;
  kpi?: string;
  kpiTarget?: string;
  risk?: string;
  priority: number;  // 1 = highest priority
}

export type StrategyActionType = 'call' | 'email' | 'meeting' | 'task' | 'review' | 'follow_up';
export type StrategyActionUrgency = 'immediate' | 'this_week' | 'this_month' | 'ongoing';

export interface StrategyAction {
  id: string;
  clientId: string;
  actionType: StrategyActionType;
  title: string;
  reason: string;
  urgency: StrategyActionUrgency;
  priority: number;  // 1 = highest
  suggestedDueDate?: string;  // YYYY-MM-DD format
  status: 'pending' | 'converted_to_task' | 'dismissed';
  convertedTaskId?: string;
  createdAt: Date;
}

export interface StrategyEngineOutput {
  id: string;
  clientId: string;
  strategySummary: string;
  pillars: StrategyPillar[];
  actions: StrategyAction[];
  narrativeGuidance: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  inputsUsed: string[];  // List of question IDs used
  generatedAt: Date;
  modelVersion: string;
  tokenUsage?: number;
}

// Strategy Question Catalog - defines the structured questions for each client
export const STRATEGY_QUESTIONS: StrategyQuestion[] = [
  // Foundations
  { id: 'primary_goal', category: 'foundations', question: 'What is the client\'s primary business goal right now?', answerType: 'select', options: ['More leads/calls', 'Better lead quality', 'Higher conversion rate', 'Increase average job value', 'Expand service area', 'Build brand awareness'], required: true, priority: 10 },
  { id: 'main_challenge', category: 'foundations', question: 'What is their biggest marketing challenge?', answerType: 'text', required: true, priority: 9 },
  { id: 'target_customer', category: 'foundations', question: 'Who is their ideal customer?', answerType: 'text', required: true, priority: 8 },
  { id: 'competitive_advantage', category: 'foundations', question: 'What makes them different from competitors?', answerType: 'text', required: false, priority: 6 },
  
  // Acquisition
  { id: 'lead_sources', category: 'acquisition', question: 'Where do most of their leads currently come from?', answerType: 'multi_select', options: ['Google Search', 'Google Maps', 'Facebook/Social', 'Referrals', 'Repeat customers', 'Door knocking', 'Print/Radio', 'Unknown'], required: true, priority: 8 },
  { id: 'monthly_lead_volume', category: 'acquisition', question: 'Approximately how many leads do they get per month?', answerType: 'number', required: false, priority: 7 },
  { id: 'lead_quality_issue', category: 'acquisition', question: 'Are they having lead quality issues?', answerType: 'boolean', required: false, priority: 6 },
  { id: 'conversion_rate', category: 'acquisition', question: 'What\'s their approximate quote-to-close rate?', answerType: 'select', options: ['Under 20%', '20-40%', '40-60%', '60-80%', 'Over 80%', 'Unknown'], required: false, priority: 5 },
  
  // Retention
  { id: 'repeat_business', category: 'retention', question: 'How much of their business is repeat vs new customers?', answerType: 'select', options: ['Mostly repeat (70%+)', 'Mix of both (30-70% repeat)', 'Mostly new (under 30% repeat)', 'Unknown'], required: false, priority: 5 },
  { id: 'reviews_strategy', category: 'retention', question: 'Do they actively collect reviews?', answerType: 'boolean', required: false, priority: 4 },
  { id: 'referral_program', category: 'retention', question: 'Do they have a referral program?', answerType: 'boolean', required: false, priority: 3 },
  
  // Growth
  { id: 'growth_timeline', category: 'growth', question: 'What\'s their growth timeline expectation?', answerType: 'select', options: ['Immediate (1-3 months)', 'Short-term (3-6 months)', 'Medium-term (6-12 months)', 'Long-term (12+ months)'], required: false, priority: 6 },
  { id: 'budget_flexibility', category: 'growth', question: 'Is there budget flexibility for new initiatives?', answerType: 'select', options: ['Very flexible', 'Some flexibility', 'Tight budget', 'Unknown'], required: false, priority: 4 },
  { id: 'expansion_plans', category: 'growth', question: 'Any plans to expand services or locations?', answerType: 'text', required: false, priority: 3 },
  
  // Risks
  { id: 'churn_signals', category: 'risks', question: 'Are there any signs they might leave?', answerType: 'multi_select', options: ['Complaining about results', 'Slow to respond', 'Budget concerns mentioned', 'Competitor inquiries', 'Team changes', 'None observed'], required: false, priority: 7 },
  { id: 'expectations_alignment', category: 'risks', question: 'Are their expectations realistic?', answerType: 'select', options: ['Well aligned', 'Slightly misaligned', 'Significantly misaligned', 'Unsure'], required: false, priority: 6 },
];

export const STRATEGY_QUESTION_CATEGORY_LABELS: Record<StrategyQuestionCategory, string> = {
  foundations: 'Business Foundations',
  acquisition: 'Lead Acquisition',
  retention: 'Client Retention',
  growth: 'Growth Plans',
  risks: 'Risk Signals',
};

export const STRATEGY_ENGINE_STATUS_LABELS: Record<StrategyEngineStatus, string> = {
  not_started: 'Not Started',
  gathering_intel: 'Gathering Intelligence',
  strategy_generated: 'Strategy Active',
  needs_refresh: 'Needs Refresh',
};

export const STRATEGY_ACTION_URGENCY_LABELS: Record<StrategyActionUrgency, string> = {
  immediate: 'Immediate',
  this_week: 'This Week',
  this_month: 'This Month',
  ongoing: 'Ongoing',
};

// Default empty strategy engine state
export const DEFAULT_STRATEGY_ENGINE_STATE: StrategyEngineState = {
  status: 'not_started',
  answers: [],
  pendingQuestionIds: STRATEGY_QUESTIONS.filter(q => q.required).map(q => q.id),
};

// ============================================
// Client App Integration System
// ============================================

export interface PairingCode {
  id: string;
  code: string; // Short 6-character alphanumeric code
  clientId: string;
  clientName: string;
  orgId: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
  usedByAppId?: string;
  status: 'pending' | 'used' | 'expired';
}

export interface ClientIntegration {
  id: string;
  clientId: string;
  clientName: string;
  orgId: string;
  appId: string; // Unique ID of the connected app
  appName: string; // Display name (e.g., "Automotive All-Stars")
  appUrl?: string; // Base URL of the connected app
  integrationSecret: string; // Permanent secret for API authentication
  status: 'active' | 'paused' | 'disconnected';
  createdAt: Date;
  lastEventAt?: Date;
  eventCount: number;
}

export interface IntegrationEvent {
  id: string;
  integrationId: string;
  clientId: string;
  eventType: 'kpi_snapshot' | 'booking' | 'revenue' | 'customer_activity' | 'job_completed' | 'custom';
  payload: Record<string, any>;
  receivedAt: Date;
  processedAt?: Date;
}

// KPI snapshot structure that external apps can send
export interface KPISnapshot {
  period: 'daily' | 'weekly' | 'monthly';
  periodStart: string; // DD-MM-YYYY
  periodEnd: string; // DD-MM-YYYY
  metrics: {
    revenue?: number;
    bookings?: number;
    newCustomers?: number;
    repeatCustomers?: number;
    averageJobValue?: number;
    completedJobs?: number;
    cancelledJobs?: number;
    customerSatisfaction?: number; // 1-5 scale
    [key: string]: any; // Allow custom metrics
  };
}
