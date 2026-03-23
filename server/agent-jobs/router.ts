import type { AgentTaskType, EntityType } from './types';
import { TASK_TYPES, getTtlMs, TASK_DEPENDENCIES, DEFAULT_MAX_RETRIES } from './contracts';
import { computeIdempotencyKey } from './hash';

// ─── Task → OpenClaw agent ID mapping ──────────────────────────────────────────

const TASK_AGENT_MAP: Record<string, string> = {
  [TASK_TYPES.STRATEGY]:            'strategy-specialist',
  [TASK_TYPES.WEBSITE_XRAY]:        'website-specialist',
  [TASK_TYPES.SERP]:                'seo-specialist',
  [TASK_TYPES.GBP]:                 'gbp-specialist',
  [TASK_TYPES.ADS]:                 'google-ads-specialist',
  [TASK_TYPES.GROWTH_PRESCRIPTION]: 'strategy-specialist',
  [TASK_TYPES.ENRICHMENT]:          'strategy-specialist',
  [TASK_TYPES.PREP]:                'strategy-specialist',
  // Legacy aliases (kept for backward compat)
  strategy:  'strategy-specialist',
  seo:       'seo-specialist',
  gbp:       'gbp-specialist',
  ads:       'google-ads-specialist',
  website:   'website-specialist',
};

const DEFAULT_AGENT = 'strategy-specialist';

export function resolveAgentId(taskType: AgentTaskType): string {
  return TASK_AGENT_MAP[taskType] ?? DEFAULT_AGENT;
}

export function getSupportedTaskTypes(): string[] {
  return [...new Set(Object.keys(TASK_AGENT_MAP))];
}

// ─── Idempotency key generation ────────────────────────────────────────────────

/**
 * Compute the idempotency key for a new job creation request.
 * Strips any fields that vary between runs but don't change the work unit
 * (e.g. timestamps, requesterId) before hashing.
 */
export function makeIdempotencyKey(params: {
  taskType:   string;
  entityType: EntityType;
  entityId:   string;
  input:      Record<string, any>;
}): string {
  const ttlMs = getTtlMs(params.taskType);

  // Normalise input: drop runtime-only fields that vary between calls
  const { orgId: _orgId, requestedAt: _ra, ...normalizedInput } = params.input as any;
  void _orgId; void _ra;

  return computeIdempotencyKey({
    taskType:       params.taskType,
    entityType:     params.entityType,
    entityId:       params.entityId,
    normalizedInput: normalizedInput as Record<string, unknown>,
    ttlMs,
  });
}

// ─── Dependency resolution ─────────────────────────────────────────────────────

/** Return the prerequisite task types for a given task, if any. */
export function getDependencies(taskType: string): string[] {
  return TASK_DEPENDENCIES[taskType] ?? [];
}

// ─── Job defaults ──────────────────────────────────────────────────────────────

export { DEFAULT_MAX_RETRIES };
