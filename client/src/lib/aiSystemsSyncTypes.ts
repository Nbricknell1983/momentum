// =============================================================================
// AI SYSTEMS SYNC — DOMAIN TYPES (Momentum client-side)
// =============================================================================
// Typed shape for AI Systems delivery summaries cached in Momentum's Firestore.
// These are intentionally limited cross-system summaries — NOT duplicated admin UI.
// Summary-first, cache-aware, explainable, org-aware, client-safe.
// =============================================================================

// ---------------------------------------------------------------------------
// Sync quality markers
// ---------------------------------------------------------------------------

export type SyncDataSource = 'live' | 'cached' | 'inferred' | 'unavailable';

export type SyncStatus =
  | 'live'          // Synced within stale threshold (4 hours)
  | 'stale'         // Synced > 4h, < 24h ago
  | 'expired'       // Synced > 24h ago
  | 'failed'        // Last attempt failed
  | 'never_synced'; // No sync ever attempted

export const STALE_THRESHOLD_MS  = 4  * 60 * 60 * 1000;  // 4 hours
export const EXPIRED_THRESHOLD_MS = 24 * 60 * 60 * 1000;  // 24 hours

export function deriveSyncStatus(lastSyncedAt: string | null, lastError: string | null): SyncStatus {
  if (!lastSyncedAt) return lastError ? 'failed' : 'never_synced';
  const age = Date.now() - new Date(lastSyncedAt).getTime();
  if (age < STALE_THRESHOLD_MS)  return 'live';
  if (age < EXPIRED_THRESHOLD_MS) return 'stale';
  return 'expired';
}

// ---------------------------------------------------------------------------
// Module delivery status
// ---------------------------------------------------------------------------

export type ModuleDeliveryStatus =
  | 'not_included'
  | 'not_started'
  | 'building'
  | 'review'
  | 'published'
  | 'active'
  | 'paused'
  | 'blocked'
  | 'unknown';

export interface ModuleDeliverySummary {
  key:           string;
  label:         string;
  status:        ModuleDeliveryStatus;
  progressPct?:  number;
  blockers?:     string[];
  lastActivity?: string; // ISO
  nextAction?:   string;
}

// ---------------------------------------------------------------------------
// Milestone
// ---------------------------------------------------------------------------

export type MilestoneType =
  | 'website_live'
  | 'seo_indexed'
  | 'gbp_live'
  | 'content_published'
  | 'portal_live'
  | 'agent_active'
  | 'other';

export interface AISystemsMilestoneSummary {
  milestoneId: string;
  label:       string;
  type:        MilestoneType;
  achievedAt:  string; // ISO
  module:      string;
}

// ---------------------------------------------------------------------------
// Active blocker
// ---------------------------------------------------------------------------

export interface AISystemsBlockerSummary {
  blockerId:   string;
  severity:    'critical' | 'high' | 'medium' | 'low';
  module:      string;
  description: string;
  since:       string; // ISO
  resolveBy?:  string; // ISO
}

// ---------------------------------------------------------------------------
// Next best delivery action
// ---------------------------------------------------------------------------

export interface AISystemsNextActionSummary {
  actionId:    string;
  label:       string;
  module:      string;
  priority:    'critical' | 'high' | 'medium' | 'low';
  dueBy?:      string; // ISO
  assignedTo?: string;
}

// ---------------------------------------------------------------------------
// Delivery summary — the canonical payload AI Systems returns
// This is the summary contract. AI Systems produces this; Momentum consumes it.
// ---------------------------------------------------------------------------

export type TenantDeliveryLifecycle =
  | 'received'
  | 'validated'
  | 'tenant_created'
  | 'modules_configured'
  | 'workflows_queued'
  | 'ready_for_onboarding'
  | 'active'
  | 'paused'
  | 'failed';

export interface AISystemsTenantDeliverySummary {
  // Identity
  tenantId:       string;
  sourceClientId: string;

  // Lifecycle
  lifecycleState:  TenantDeliveryLifecycle;
  isActive:        boolean;
  isOnboarding:    boolean;
  isBlocked:       boolean;

  // Website
  websiteStatus:      ModuleDeliveryStatus;
  websiteUrl?:        string;
  websitePublishedAt?: string;

  // SEO
  seoStatus:          ModuleDeliveryStatus;
  seoIndexedAt?:      string;
  seoKeywordsTracked?: number;

  // GBP
  gbpStatus:    ModuleDeliveryStatus;
  gbpLiveAt?:   string;

  // Content
  contentStatus:     ModuleDeliveryStatus;
  contentPiecesLive?: number;

  // Telemetry
  telemetryStatus:      ModuleDeliveryStatus;
  telemetryConnectedAt?: string;

  // Portal
  portalStatus: ModuleDeliveryStatus;
  portalUrl?:   string;

  // Agents
  activeAgents: string[];

  // Modules (full list)
  modules: ModuleDeliverySummary[];

  // Health
  overallHealth: 'green' | 'amber' | 'red' | 'unknown';
  healthNotes?:  string[];

  // Blockers, milestones, next actions
  activeBlockers:   AISystemsBlockerSummary[];
  recentMilestones: AISystemsMilestoneSummary[];
  nextActions:      AISystemsNextActionSummary[];

  // When AI Systems generated this summary
  summaryGeneratedAt: string;
}

// ---------------------------------------------------------------------------
// Sync snapshot — what Momentum stores in Firestore per client
// Collection: orgs/{orgId}/aiSystemsSync/{clientId}
// ---------------------------------------------------------------------------

export interface AISystemsSyncSnapshot {
  orgId:           string;
  clientId:        string;
  tenantId:        string;
  syncStatus:      SyncStatus;
  lastSyncedAt:    string | null;
  lastAttemptedAt: string | null;
  lastError:       string | null;
  syncCount:       number;
  errorCount:      number;
  summary:         AISystemsTenantDeliverySummary | null;
  syncMethod:      'push' | 'pull' | null;
  schemaVersion:   string;
}

// ---------------------------------------------------------------------------
// Sync run — record of a pull sweep
// Collection: orgs/{orgId}/aiSystemsSyncRuns/{runId}
// ---------------------------------------------------------------------------

export interface AISystemsSyncRunError {
  clientId: string;
  tenantId?: string;
  error:    string;
}

export interface AISystemsSyncRun {
  runId:             string;
  orgId:             string;
  triggeredBy:       'scheduler' | 'manual' | 'push';
  startedAt:         string;
  completedAt?:      string;
  durationMs?:       number;
  clientsAttempted:  number;
  clientsSucceeded:  number;
  clientsFailed:     number;
  clientsSkipped:    number;
  errors:            AISystemsSyncRunError[];
}

// ---------------------------------------------------------------------------
// Org-level sync health
// ---------------------------------------------------------------------------

export interface AISystemsSyncHealth {
  orgId:            string;
  configured:       boolean;
  totalClients:     number;
  liveSynced:       number;
  staleSynced:      number;
  expiredSynced:    number;
  failedSyncs:      number;
  neverSynced:      number;
  skippedNoTenant:  number;
  lastRunAt:        string | null;
  lastRunSummary?:  AISystemsSyncRun;
}

// ---------------------------------------------------------------------------
// API response shapes (used by hooks and workspace)
// ---------------------------------------------------------------------------

export interface SyncRunResponse {
  success:   boolean;
  run:       AISystemsSyncRun;
  log:       string[];
}

export interface SyncHealthResponse {
  health:    AISystemsSyncHealth;
  snapshots: AISystemsSyncSnapshot[];
}
