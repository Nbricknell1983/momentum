/**
 * QA Audit shim — dev/test only.
 *
 * Attaches window.__qaAudit to the global scope so E2E tests can
 * push domain events and assert on them without network calls.
 *
 * Usage in tests:
 *   const events = await page.evaluate(() => window.__qaAudit ?? []);
 *
 * Usage in app code (dev/test only):
 *   import { qaAuditPush } from '@/lib/devMocks/qaAudit';
 *   qaAuditPush({ type: 'call_launched', payload: { batchId } });
 */

export type QADomainEvent = {
  type: string;
  payload?: Record<string, unknown>;
  ts: number;
};

declare global {
  interface Window {
    __qaAudit?: QADomainEvent[];
  }
}

export function qaAuditPush(event: Omit<QADomainEvent, 'ts'>): void {
  if (typeof window === 'undefined') return;
  if (import.meta.env.PROD) return;
  if (!window.__qaAudit) window.__qaAudit = [];
  window.__qaAudit.push({ ...event, ts: Date.now() });
}

export function qaAuditGet(): QADomainEvent[] {
  if (typeof window === 'undefined') return [];
  return window.__qaAudit ?? [];
}

export function qaAuditClear(): void {
  if (typeof window === 'undefined') return;
  window.__qaAudit = [];
}

// Auto-init on import in non-production environments
if (typeof window !== 'undefined' && !import.meta.env.PROD) {
  window.__qaAudit = window.__qaAudit ?? [];
}
