import { createHash } from 'crypto';

/**
 * Produces a stable SHA-256 hex string from any JSON-serialisable value.
 * Object keys are sorted recursively so { a:1, b:2 } and { b:2, a:1 } hash identically.
 */
export function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortKeys(value))).digest('hex');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => { acc[k] = sortKeys(obj[k]); return acc; }, {});
  }
  return value;
}

/**
 * Compute an idempotency key for an agent job.
 * The TTL bucket ensures the key rotates once per TTL period — jobs from different
 * TTL windows are treated as distinct even when all other fields are identical.
 */
export function computeIdempotencyKey(params: {
  taskType: string;
  entityType: 'lead' | 'client' | 'org';
  entityId: string;
  normalizedInput: Record<string, unknown>;
  ttlMs: number;
}): string {
  const ttlBucket = Math.floor(Date.now() / params.ttlMs);
  return stableHash({
    taskType: params.taskType,
    entityType: params.entityType,
    entityId: params.entityId,
    normalizedInput: params.normalizedInput,
    ttlBucket,
  });
}
