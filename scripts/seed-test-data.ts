#!/usr/bin/env tsx
/**
 * Firestore test data seed — creates a minimal dataset for QA/E2E tests.
 *
 * Creates:
 *   orgs/testco                   — test organisation
 *   orgs/testco/members/qa-rep    — rep user membership
 *   orgs/testco/leads/{3-5}       — sample leads for Erica selection
 *
 * Prerequisites:
 *   - GOOGLE_APPLICATION_CREDENTIALS set, or Firebase Admin SDK env vars
 *   - Run BEFORE your E2E test suite
 *
 * Usage:
 *   npx tsx scripts/seed-test-data.ts
 *   npx tsx scripts/seed-test-data.ts --org myOrg --clear
 *
 * Flags:
 *   --org <orgId>   Target org (default: testco)
 *   --clear         Delete existing seed data before inserting
 *   --dryrun        Print what would be written, but don't write
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const ORG_ID  = args.find(a => a.startsWith('--org='))?.split('=')[1] ?? 'testco';
const CLEAR   = args.includes('--clear');
const DRYRUN  = args.includes('--dryrun');

// ── Firebase admin init ───────────────────────────────────────────────────────

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId:   process.env.VITE_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      }),
    });
  } catch (e: any) {
    console.error(`[seed] Firebase admin init failed: ${e.message}`);
    process.exit(1);
  }
}

const db = getFirestore();

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_ORG = {
  orgId: ORG_ID,
  name: 'Test Co (QA Seed)',
  plan: 'pro',
  createdAt: Timestamp.now(),
  seeded: true,
};

const SEED_MEMBER = {
  uid: 'qa-rep-uid',
  email: process.env.QA_EMAIL ?? 'qa@testco.com',
  role: 'member',
  active: true,
  isManager: true,
  joinedAt: Timestamp.now(),
};

const SEED_LEADS = [
  {
    id: 'seed-lead-001',
    businessName: 'Alpha Plumbing',
    contactName: 'James Nguyen',
    email: 'james@alphaplumbing.com.au',
    phone: '+61412000001',
    stage: 'prospect',
    territory: 'metro',
    nurtureStatus: 'active',
    nurtureMode: 'standard',
    source: 'seed',
    createdAt: Timestamp.now(),
  },
  {
    id: 'seed-lead-002',
    businessName: 'Bright Electricians',
    contactName: 'Sarah Kim',
    email: 'sarah@brightelectric.com.au',
    phone: '+61412000002',
    stage: 'qualified',
    territory: 'metro',
    nurtureStatus: 'active',
    nurtureMode: 'standard',
    source: 'seed',
    createdAt: Timestamp.now(),
  },
  {
    id: 'seed-lead-003',
    businessName: 'Clean Roof Co',
    contactName: 'Tom Walsh',
    email: 'tom@cleanroof.com.au',
    phone: '+61412000003',
    stage: 'proposal',
    territory: 'regional',
    nurtureStatus: 'active',
    nurtureMode: 'high_touch',
    source: 'seed',
    createdAt: Timestamp.now(),
  },
  {
    id: 'seed-lead-004',
    businessName: 'Delta Landscaping',
    contactName: 'Priya Sharma',
    email: 'priya@deltalandscaping.com.au',
    phone: '+61412000004',
    stage: 'prospect',
    territory: 'metro',
    nurtureStatus: 'active',
    nurtureMode: 'standard',
    source: 'seed',
    createdAt: Timestamp.now(),
  },
  {
    id: 'seed-lead-005',
    businessName: 'Echo Painting',
    contactName: 'Mark Chen',
    email: 'mark@echopainting.com.au',
    phone: '+61412000005',
    stage: 'qualified',
    territory: 'metro',
    nurtureStatus: 'passive',
    nurtureMode: 'standard',
    source: 'seed',
    createdAt: Timestamp.now(),
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function clearSeedData() {
  console.log(`  Clearing existing seed data for org: ${ORG_ID}...`);
  const leadsSnap = await db.collection(`orgs/${ORG_ID}/leads`).where('source', '==', 'seed').get();
  const batch = db.batch();
  leadsSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(db.doc(`orgs/${ORG_ID}/members/qa-rep-uid`));
  if (!DRYRUN) await batch.commit();
  console.log(`  Cleared ${leadsSnap.size} seed leads.`);
}

async function seed() {
  console.log(`\n── Momentum Firestore Seed ──`);
  console.log(`  Org:    ${ORG_ID}`);
  console.log(`  Clear:  ${CLEAR}`);
  console.log(`  Dryrun: ${DRYRUN}\n`);

  if (CLEAR) await clearSeedData();

  // Org doc
  console.log(`  Writing org: orgs/${ORG_ID}`);
  if (!DRYRUN) await db.doc(`orgs/${ORG_ID}`).set(SEED_ORG, { merge: true });

  // Member doc
  console.log(`  Writing member: orgs/${ORG_ID}/members/qa-rep-uid`);
  if (!DRYRUN) await db.doc(`orgs/${ORG_ID}/members/qa-rep-uid`).set(SEED_MEMBER, { merge: true });

  // Leads
  const batch = db.batch();
  for (const lead of SEED_LEADS) {
    const ref = db.doc(`orgs/${ORG_ID}/leads/${lead.id}`);
    console.log(`  Writing lead: ${lead.businessName} (${lead.id})`);
    if (!DRYRUN) batch.set(ref, lead, { merge: true });
  }
  if (!DRYRUN) await batch.commit();

  console.log(`\n\u2705 Seed complete — ${SEED_LEADS.length} leads written to orgs/${ORG_ID}/leads\n`);
}

seed().catch(e => {
  console.error(`\u274C Seed failed: ${e.message}`);
  process.exit(1);
});
