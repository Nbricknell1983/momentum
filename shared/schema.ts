// =============================================================================
// SHARED TYPES — Used by server/nbaEngine.ts for type-safe priority scoring
// =============================================================================
// The live application uses Firebase Firestore for all data.
// These are TypeScript interfaces only — no database dependency.
// =============================================================================

export type Stage =
  | 'suspect' | 'contacted' | 'engaged' | 'qualified' | 'discovery'
  | 'proposal' | 'verbal_commit' | 'won' | 'lost' | 'nurture';

export type NurtureMode = 'none' | 'active' | 'passive';

export type NurtureStatus =
  | 'new' | 'touched_waiting' | 'needs_touch' | 'reengaged' | 'dormant' | 'exit';

export type TouchChannel = 'call' | 'sms' | 'email';

export interface Lead {
  id: string;
  userId: string;
  companyName: string;
  territory: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  stage: Stage;
  mrr: number | null;
  nepqLabel: string | null;
  nextContactDate: Date | null;
  lastContactDate: Date | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  archived: boolean;
  contactName: string | null;
  notes: string | null;
  crmLink: string | null;
  nurtureMode: NurtureMode;
  nurtureCadenceId: string | null;
  nurtureStatus: NurtureStatus | null;
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
  type: string;
  notes: string | null;
  outcome: string | null;
  createdAt: Date;
  nextContactDate: Date | null;
}
