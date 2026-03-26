// =============================================================================
// ERICA SCHEDULED CALLING CAMPAIGNS — DOMAIN TYPES
// =============================================================================
// All typed models for the Erica campaign scheduling and execution layer.
//
// KEY DESIGN RULES:
//   - Campaigns are ALWAYS created from existing approved Erica batches
//   - Targets are never created autonomously — they come from batch items
//   - Calling requires valid brief + phone + policy eligibility
//   - Human controls (pause/stop) are first-class
//   - Every decision is auditable
// =============================================================================

// ---------------------------------------------------------------------------
// Campaign lifecycle status
// ---------------------------------------------------------------------------

export type EricaCampaignStatus =
  | 'draft'           // Created, not yet scheduled
  | 'scheduled'       // Waiting for scheduled start time
  | 'running'         // Actively processing targets
  | 'paused'          // Operator paused
  | 'completed'       // All eligible targets processed
  | 'cancelled'       // Operator cancelled
  | 'error';          // Unrecoverable failure

// ---------------------------------------------------------------------------
// Per-target execution state
// ---------------------------------------------------------------------------

export type EricaCampaignTargetStatus =
  | 'queued'          // Waiting to be called
  | 'calling'         // Call in progress
  | 'called'          // Call completed (any outcome)
  | 'booked'          // Booking confirmed
  | 'skipped'         // Manually skipped
  | 'suppressed'      // Auto-suppressed by policy/rules
  | 'failed'          // Technical failure
  | 'retry_queued';   // Failed, queued for retry

// ---------------------------------------------------------------------------
// Calling window — when Erica is allowed to call
// ---------------------------------------------------------------------------

export interface EricaCampaignWindow {
  startHour:   number;   // 0-23 (e.g. 9 = 9am)
  startMinute: number;   // 0-59
  endHour:     number;
  endMinute:   number;
  timezone:    string;   // IANA timezone, e.g. 'Australia/Sydney'
  allowedDays: number[]; // 0=Sun, 1=Mon ... 6=Sat (default [1,2,3,4,5])
}

// ---------------------------------------------------------------------------
// Throttle rules — how many calls per period
// ---------------------------------------------------------------------------

export interface EricaCampaignThrottleRule {
  maxCallsPerHour:   number;   // Hard cap per hour (default 10)
  maxCallsPerDay:    number;   // Hard cap per day (default 50)
  secondsBetweenCalls: number; // Minimum gap between consecutive launches (default 90)
  mode:              'sequential' | 'controlled_batch';
  batchSize?:        number;   // Only for controlled_batch mode
}

// ---------------------------------------------------------------------------
// Schedule — when this campaign should run
// ---------------------------------------------------------------------------

export type EricaCampaignScheduleType =
  | 'immediate'        // Start now
  | 'scheduled_start'  // Start at specific datetime
  | 'date_range';      // Run between fromDate and toDate

export interface EricaCampaignSchedule {
  type:         EricaCampaignScheduleType;
  startAt?:     string;   // ISO datetime for scheduled_start
  fromDate?:    string;   // ISO date for date_range
  toDate?:      string;   // ISO date for date_range
  window:       EricaCampaignWindow;
  throttle:     EricaCampaignThrottleRule;
}

// ---------------------------------------------------------------------------
// Health warnings surfaced to operators
// ---------------------------------------------------------------------------

export type EricaCampaignHealthFlag =
  | 'outside_calling_window'
  | 'throttle_limit_reached_hour'
  | 'throttle_limit_reached_day'
  | 'no_eligible_targets'
  | 'all_targets_called'
  | 'batch_not_found'
  | 'batch_not_launched'
  | 'schedule_not_started'
  | 'schedule_expired';

export interface EricaCampaignHealth {
  healthy:      boolean;
  flags:        EricaCampaignHealthFlag[];
  nextEligible: string | null;   // ISO datetime when campaign can next run
  checkedAt:    string;
}

// ---------------------------------------------------------------------------
// A single campaign runner execution record
// ---------------------------------------------------------------------------

export interface EricaCampaignRun {
  runId:        string;
  campaignId:   string;
  orgId:        string;
  startedAt:    string;
  endedAt?:     string;
  targetId:     string;
  targetName:   string;
  batchItemId:  string;
  outcome:      'launched' | 'skipped' | 'suppressed' | 'failed' | 'throttled';
  reason?:      string;
  callId?:      string;
}

// ---------------------------------------------------------------------------
// Pause/resume state
// ---------------------------------------------------------------------------

export interface EricaCampaignPauseState {
  pausedAt:    string;
  pausedBy:    string;
  pauseReason: string;
}

// ---------------------------------------------------------------------------
// Outcome counters (derived from target states)
// ---------------------------------------------------------------------------

export interface EricaCampaignOutcome {
  total:         number;
  queued:        number;
  calling:       number;
  called:        number;
  booked:        number;
  noAnswer:      number;
  failed:        number;
  skipped:       number;
  suppressed:    number;
  retryQueued:   number;
  followUpNeeded: number;
  bookingRate:   number;   // 0–1
  contactRate:   number;   // 0–1
}

// ---------------------------------------------------------------------------
// Per-target state record
// ---------------------------------------------------------------------------

export interface EricaCampaignTargetState {
  targetId:     string;
  campaignId:   string;
  orgId:        string;
  batchItemId:  string;
  batchId:      string;
  entityId:     string;
  entityType:   'lead' | 'client';
  entityName:   string;
  businessName: string;
  phone?:       string;
  status:       EricaCampaignTargetStatus;
  addedAt:      string;
  calledAt?:    string;
  callId?:      string;
  callOutcome?:  string;
  skipReason?:   string;
  failReason?:   string;
  retryCount:   number;
  lastRetryAt?: string;
}

// ---------------------------------------------------------------------------
// The top-level campaign document
// ---------------------------------------------------------------------------

export interface EricaCallingCampaign {
  campaignId:   string;
  orgId:        string;
  name:         string;
  description?: string;
  createdAt:    string;
  createdBy:    string;
  updatedAt:    string;
  status:       EricaCampaignStatus;

  // Source batch
  batchId:      string;
  batchName?:   string;

  // Schedule
  schedule:     EricaCampaignSchedule;

  // Outcome counters (maintained incrementally)
  outcome:      EricaCampaignOutcome;

  // Pause state
  pauseState?:  EricaCampaignPauseState;

  // Timing tracking
  lastRunAt?:   string;
  nextRunAt?:   string;
  startedAt?:   string;
  completedAt?: string;
  cancelledAt?: string;

  // Call throttle tracking (reset hourly/daily)
  callsThisHour:  number;
  callsToday:     number;
  hourBucket:     string;  // ISO date + hour string for reset detection
  dayBucket:      string;  // ISO date string for reset detection

  // Health snapshot
  health?: EricaCampaignHealth;
}

// ---------------------------------------------------------------------------
// Input types for campaign creation
// ---------------------------------------------------------------------------

export interface CreateCampaignInput {
  orgId:        string;
  name:         string;
  description?: string;
  batchId:      string;
  schedule:     EricaCampaignSchedule;
  createdBy:    string;
}

export type UpdateCampaignInput = Partial<
  Pick<EricaCallingCampaign, 'name' | 'description' | 'schedule'>
>;

// ---------------------------------------------------------------------------
// Default schedule helpers
// ---------------------------------------------------------------------------

export function defaultCampaignWindow(): EricaCampaignWindow {
  return {
    startHour:   9,
    startMinute: 0,
    endHour:     17,
    endMinute:   0,
    timezone:    'Australia/Sydney',
    allowedDays: [1, 2, 3, 4, 5],
  };
}

export function defaultThrottleRule(): EricaCampaignThrottleRule {
  return {
    maxCallsPerHour:     10,
    maxCallsPerDay:      50,
    secondsBetweenCalls: 90,
    mode:                'sequential',
  };
}

export function emptyOutcome(): EricaCampaignOutcome {
  return {
    total:          0,
    queued:         0,
    calling:        0,
    called:         0,
    booked:         0,
    noAnswer:       0,
    failed:         0,
    skipped:        0,
    suppressed:     0,
    retryQueued:    0,
    followUpNeeded: 0,
    bookingRate:    0,
    contactRate:    0,
  };
}
