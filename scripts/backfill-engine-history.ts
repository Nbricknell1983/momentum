/**
 * backfill-engine-history.ts
 *
 * Migrates existing engine snapshots from entity documents into the
 * engineHistory subcollection so historical runs are queryable.
 *
 * Run with:
 *   npx tsx scripts/backfill-engine-history.ts
 *
 * Reads FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, VITE_FIREBASE_PROJECT_ID
 * from environment (same as the server).
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

// ─── Firebase init ─────────────────────────────────────────────────────────────

const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing VITE_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();

// ─── Engine field → taskType mapping ──────────────────────────────────────────

const SNAPSHOT_FIELDS: Record<string, string> = {
  websiteEngine:    'website_xray',
  seoEngine:        'serp',
  gbpEngine:        'gbp',
  adsEngine:        'ads',
  growthPrescription: 'growth_prescription',
  strategyDiagnosis:  'strategy',
  prepCallPack:       'prep',
};

// ─── Helper: stable hash ───────────────────────────────────────────────────────

function stableHash(value: unknown): string {
  const sortKeys = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v !== null && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return Object.keys(o).sort().reduce<Record<string, unknown>>((a, k) => { a[k] = sortKeys(o[k]); return a; }, {});
    }
    return v;
  };
  return createHash('sha256').update(JSON.stringify(sortKeys(value))).digest('hex');
}

// ─── Backfill a single entity (lead or client) ─────────────────────────────────

async function backfillEntity(
  entityType: 'leads' | 'clients',
  orgId: string,
  entityId: string,
  data: Record<string, any>
): Promise<number> {
  let written = 0;

  for (const [field, taskType] of Object.entries(SNAPSHOT_FIELDS)) {
    const snapshot = data[field];
    if (!snapshot || typeof snapshot !== 'object') continue;

    const generatedAt = snapshot.generatedAt || data.updatedAt || new Date().toISOString();

    // Use a deterministic runId so backfill is idempotent
    const runId = stableHash({ orgId, entityType, entityId, taskType, generatedAt }).slice(0, 20);

    const histRef = db
      .collection('orgs').doc(orgId)
      .collection(entityType).doc(entityId)
      .collection('engineHistory').doc(runId);

    const existing = await histRef.get();
    if (existing.exists) {
      console.log(`  skip ${entityType}/${entityId}/${taskType} (already exists)`);
      continue;
    }

    const record = {
      runId,
      agentId:         'backfill',
      taskType,
      version:         '0.0', // backfill marker
      idempotencyKey:  runId,
      status:          'completed',
      input:           { backfilled: true },
      output:          snapshot,
      raw:             null,
      error:           null,
      sourceRefs:      [`${entityType}/${entityId}.${field}`],
      createdAt:       generatedAt,
      startedAt:       generatedAt,
      completedAt:     generatedAt,
      durationMs:      null,
    };

    await histRef.set(record);
    written++;
    console.log(`  + ${entityType}/${entityId}/${taskType} → engineHistory/${runId}`);
  }

  return written;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== engineHistory backfill ===\n');

  const orgsSnap = await db.collection('orgs').get();
  let totalEntities = 0;
  let totalRecords = 0;

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;
    console.log(`\nOrg: ${orgId}`);

    for (const entityType of ['leads', 'clients'] as const) {
      const entitiesSnap = await db.collection('orgs').doc(orgId).collection(entityType).get();
      console.log(`  ${entityType}: ${entitiesSnap.size} documents`);

      for (const doc of entitiesSnap.docs) {
        const written = await backfillEntity(entityType, orgId, doc.id, doc.data() as Record<string, any>);
        if (written > 0) {
          totalEntities++;
          totalRecords += written;
        }
      }
    }
  }

  console.log(`\n=== Done: ${totalRecords} records written across ${totalEntities} entities ===`);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
