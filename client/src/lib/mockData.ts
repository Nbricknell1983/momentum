// todo: remove mock functionality
import { Lead, Activity, Task, DailyMetrics, UserProfile, Stage, ActivityType } from './types';
import { v4 as uuidv4 } from 'uuid';

const userId = 'demo-user-1';

// Helper to create dates
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

// todo: remove mock functionality
export const mockUser: UserProfile = {
  id: userId,
  name: 'Alex Thompson',
  email: 'alex@momentum.io',
  territory: 'West Coast',
  targets: {
    calls: 25,
    doors: 5,
    meetings: 3,
    followups: 15,
    proposals: 2,
    deals: 1,
  },
  workingHours: {
    start: '09:00',
    end: '17:00',
  },
  momentumWeights: {
    call: 1,
    email: 1,
    sms: 1,
    dropin: 2,
    meeting: 5,
    proposal: 6,
    deal: 15,
  },
};

// todo: remove mock functionality
export const mockLeads: Lead[] = [
  {
    id: uuidv4(),
    userId,
    companyName: 'TechFlow Solutions',
    territory: 'West Coast',
    address: '123 Innovation Dr, San Francisco, CA',
    phone: '(415) 555-0100',
    email: 'info@techflow.com',
    website: 'https://techflow.com',
    stage: 'discovery',
    mrr: 5000,
    nepqLabel: 'Solution Aware',
    nextContactDate: daysFromNow(0),
    lastContactDate: daysAgo(2),
    lastActivityAt: daysAgo(2),
    createdAt: daysAgo(14),
    updatedAt: daysAgo(2),
    archived: false,
    contactName: 'Sarah Chen',
    notes: 'Very interested in our enterprise plan. Needs approval from CTO.',
    crmLink: 'https://crm.example.com/leads/123',
  },
  {
    id: uuidv4(),
    userId,
    companyName: 'DataPrime Inc',
    territory: 'West Coast',
    address: '456 Data Way, Los Angeles, CA',
    phone: '(310) 555-0200',
    email: 'contact@dataprime.io',
    stage: 'proposal',
    mrr: 8500,
    nepqLabel: 'Commitment Ready',
    nextContactDate: daysAgo(1),
    lastContactDate: daysAgo(3),
    lastActivityAt: daysAgo(3),
    createdAt: daysAgo(21),
    updatedAt: daysAgo(3),
    archived: false,
    contactName: 'Michael Roberts',
    notes: 'Proposal sent. Waiting for budget approval from finance.',
  },
  {
    id: uuidv4(),
    userId,
    companyName: 'CloudNine Systems',
    territory: 'West Coast',
    phone: '(408) 555-0300',
    email: 'hello@cloudnine.com',
    stage: 'contacted',
    nextContactDate: daysFromNow(2),
    lastContactDate: daysAgo(1),
    lastActivityAt: daysAgo(1),
    createdAt: daysAgo(7),
    updatedAt: daysAgo(1),
    archived: false,
    contactName: 'Jennifer Wu',
  },
  {
    id: uuidv4(),
    userId,
    companyName: 'Innovate Labs',
    territory: 'Pacific Northwest',
    phone: '(503) 555-0400',
    stage: 'suspect',
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    archived: false,
    contactName: 'David Park',
  },
  {
    id: uuidv4(),
    userId,
    companyName: 'Quantum Dynamics',
    territory: 'West Coast',
    address: '789 Tech Blvd, Seattle, WA',
    phone: '(206) 555-0500',
    email: 'info@quantumdyn.com',
    stage: 'qualified',
    mrr: 3200,
    nepqLabel: 'Problem Aware',
    nextContactDate: daysFromNow(1),
    lastContactDate: daysAgo(4),
    lastActivityAt: daysAgo(4),
    createdAt: daysAgo(10),
    updatedAt: daysAgo(4),
    archived: false,
    contactName: 'Lisa Martinez',
    notes: 'Strong fit for mid-tier package.',
  },
  {
    id: uuidv4(),
    userId,
    companyName: 'Apex Ventures',
    territory: 'West Coast',
    phone: '(650) 555-0600',
    stage: 'engaged',
    nextContactDate: daysFromNow(0),
    lastContactDate: daysAgo(5),
    lastActivityAt: daysAgo(5),
    createdAt: daysAgo(12),
    updatedAt: daysAgo(5),
    archived: false,
    contactName: 'Robert Johnson',
  },
  {
    id: uuidv4(),
    userId,
    companyName: 'Stellar Media',
    territory: 'Pacific Northwest',
    stage: 'verbal_commit',
    mrr: 12000,
    nextContactDate: daysFromNow(3),
    lastContactDate: daysAgo(1),
    lastActivityAt: daysAgo(1),
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
    archived: false,
    contactName: 'Amanda Foster',
    notes: 'Contract review in progress. Legal signoff expected this week.',
  },
  {
    id: uuidv4(),
    userId,
    companyName: 'NextGen Software',
    territory: 'West Coast',
    stage: 'won',
    mrr: 4500,
    lastContactDate: daysAgo(7),
    lastActivityAt: daysAgo(7),
    createdAt: daysAgo(45),
    updatedAt: daysAgo(7),
    archived: false,
    contactName: 'Chris Taylor',
  },
  {
    id: uuidv4(),
    userId,
    companyName: 'Bright Ideas Co',
    territory: 'Mountain',
    stage: 'nurture',
    nextContactDate: daysFromNow(30),
    lastContactDate: daysAgo(14),
    lastActivityAt: daysAgo(14),
    createdAt: daysAgo(60),
    updatedAt: daysAgo(14),
    archived: false,
    contactName: 'Emily Davis',
    notes: 'Not ready now. Follow up next quarter.',
  },
];

// todo: remove mock functionality
export const mockActivities: Activity[] = [
  {
    id: uuidv4(),
    userId,
    leadId: mockLeads[0].id,
    type: 'call',
    notes: 'Discussed requirements. They need SSO integration.',
    outcome: 'positive',
    createdAt: daysAgo(2),
  },
  {
    id: uuidv4(),
    userId,
    leadId: mockLeads[0].id,
    type: 'email',
    notes: 'Sent follow-up with pricing details.',
    createdAt: daysAgo(3),
  },
  {
    id: uuidv4(),
    userId,
    leadId: mockLeads[1].id,
    type: 'proposal',
    notes: 'Sent enterprise proposal for $8,500/mo.',
    createdAt: daysAgo(3),
  },
  {
    id: uuidv4(),
    userId,
    leadId: mockLeads[1].id,
    type: 'meeting',
    notes: 'Product demo with full team. Very engaged.',
    outcome: 'positive',
    createdAt: daysAgo(5),
  },
  {
    id: uuidv4(),
    userId,
    leadId: mockLeads[2].id,
    type: 'call',
    notes: 'Initial discovery call. Interested in automation features.',
    createdAt: daysAgo(1),
  },
];

// todo: remove mock functionality
export const mockTasks: Task[] = [
  {
    id: uuidv4(),
    userId,
    leadId: mockLeads[0].id,
    title: 'Follow up on SSO requirements',
    dueAt: daysFromNow(0),
    status: 'pending',
    createdAt: daysAgo(2),
  },
  {
    id: uuidv4(),
    userId,
    leadId: mockLeads[1].id,
    title: 'Check on proposal status',
    dueAt: daysAgo(1),
    status: 'pending',
    createdAt: daysAgo(3),
  },
  {
    id: uuidv4(),
    userId,
    title: 'Prepare weekly pipeline review',
    dueAt: daysFromNow(2),
    status: 'pending',
    createdAt: daysAgo(1),
  },
  {
    id: uuidv4(),
    userId,
    leadId: mockLeads[4].id,
    title: 'Send case study',
    dueAt: daysFromNow(1),
    status: 'pending',
    createdAt: daysAgo(4),
  },
];

// todo: remove mock functionality
export const mockDailyMetrics: DailyMetrics[] = [
  {
    id: uuidv4(),
    userId,
    date: daysAgo(0),
    calls: 12,
    doors: 2,
    meetings: 1,
    followups: 8,
    proposals: 1,
    deals: 0,
    momentumScore: 28,
  },
  {
    id: uuidv4(),
    userId,
    date: daysAgo(1),
    calls: 18,
    doors: 3,
    meetings: 2,
    followups: 10,
    proposals: 0,
    deals: 0,
    momentumScore: 36,
  },
  {
    id: uuidv4(),
    userId,
    date: daysAgo(2),
    calls: 22,
    doors: 4,
    meetings: 3,
    followups: 12,
    proposals: 1,
    deals: 1,
    momentumScore: 68,
  },
  {
    id: uuidv4(),
    userId,
    date: daysAgo(3),
    calls: 15,
    doors: 2,
    meetings: 2,
    followups: 9,
    proposals: 0,
    deals: 0,
    momentumScore: 31,
  },
  {
    id: uuidv4(),
    userId,
    date: daysAgo(4),
    calls: 20,
    doors: 3,
    meetings: 1,
    followups: 11,
    proposals: 2,
    deals: 0,
    momentumScore: 43,
  },
  {
    id: uuidv4(),
    userId,
    date: daysAgo(5),
    calls: 25,
    doors: 5,
    meetings: 3,
    followups: 15,
    proposals: 1,
    deals: 1,
    momentumScore: 72,
  },
  {
    id: uuidv4(),
    userId,
    date: daysAgo(6),
    calls: 19,
    doors: 4,
    meetings: 2,
    followups: 13,
    proposals: 0,
    deals: 0,
    momentumScore: 39,
  },
];

// Helper to get activities for a lead
export function getLeadActivities(leadId: string): Activity[] {
  return mockActivities.filter(a => a.leadId === leadId);
}

// Helper to get tasks for a lead
export function getLeadTasks(leadId: string): Task[] {
  return mockTasks.filter(t => t.leadId === leadId);
}

// Helper to count activities by type for a lead
export function countActivitiesByType(leadId: string): Record<ActivityType, number> {
  const activities = getLeadActivities(leadId);
  const counts: Record<ActivityType, number> = {
    call: 0,
    email: 0,
    sms: 0,
    meeting: 0,
    dropin: 0,
    followup: 0,
    proposal: 0,
    deal: 0,
  };
  activities.forEach(a => {
    counts[a.type]++;
  });
  return counts;
}
