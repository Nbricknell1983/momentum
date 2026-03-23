export type AgentJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'failed_validation'  // output failed Zod validation; raw preserved
  | 'pending_deps'       // waiting for dependency jobs to complete
  | 'skipped';           // skipped due to TTL guard or idempotency

export type AgentTaskType =
  | 'strategy'
  | 'seo'
  | 'gbp'
  | 'ads'
  | 'website'
  | 'website_xray'
  | 'serp'
  | 'growth_prescription'
  | 'enrichment'
  | 'prep'
  | string;

export type EntityType = 'lead' | 'client' | 'org';

export interface DependsOnEntry {
  taskType: string;
}

export interface AgentJob {
  id?: string;

  // ── Identity ──────────────────────────────────────────────────────────────
  orgId:          string;
  taskType:       AgentTaskType;
  agentId:        string;
  entityType:     EntityType;    // 'lead' | 'client' | 'org'
  entityId:       string;        // leadId or clientId
  version:        string;        // contract version, e.g. '1.0'
  idempotencyKey: string;        // SHA-256 of { taskType, entityType, entityId, normalizedInput, ttlBucket }

  // ── Payload ───────────────────────────────────────────────────────────────
  input:  Record<string, any>;
  output: Record<string, any> | null;
  raw:    string | null;
  error:  string | null;

  // ── Scheduling ────────────────────────────────────────────────────────────
  force:          boolean;                // bypass TTL guard
  dependsOn:      DependsOnEntry[];       // prerequisite task types
  retryCount:     number;
  maxRetries:     number;
  nextAttemptAt:  string | null;          // ISO timestamp — don't process before this

  // ── Status lifecycle ──────────────────────────────────────────────────────
  status:       AgentJobStatus;
  createdAt:    string;
  startedAt:    string | null;
  completedAt:  string | null;
}

// ─── Engine history record ────────────────────────────────────────────────────
// Immutable record written to engineHistory subcollection on every run.
// Path: orgs/{orgId}/{leads|clients}/{entityId}/engineHistory/{runId}

export interface EngineHistoryRecord {
  runId:           string;
  agentId:         string;
  taskType:        string;
  version:         string;
  idempotencyKey:  string;
  status:          AgentJobStatus;
  input:           Record<string, any>;
  output:          Record<string, any> | null;
  raw:             string | null;
  error:           string | null;
  sourceRefs:      string[];   // e.g. ["jobs/abc123"]
  createdAt:       string;
  startedAt:       string | null;
  completedAt:     string | null;
  durationMs:      number | null;
}
