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
