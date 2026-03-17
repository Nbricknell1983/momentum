/**
 * deploy-firestore.mjs
 *
 * Deploys Firestore security rules using the Firebase Rules REST API.
 * Requires: VITE_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY env vars.
 *
 * Run: node scripts/deploy-firestore.mjs
 *
 * Note: Composite indexes cannot be created via API with the Firebase Admin SDK service account.
 * Create/manage indexes manually at:
 *   https://console.firebase.google.com/project/<PROJECT_ID>/firestore/indexes
 * The required index definitions are in firestore.indexes.json.
 */

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  console.error('❌ Missing env vars: VITE_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

async function getAccessToken() {
  const auth = new GoogleAuth({
    credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
    scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function apiRequest(url, method, body, token) {
  const res = await fetch(url, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function deployRules(token) {
  const rulesPath = join(__dirname, '..', 'firestore.rules');
  const rulesContent = readFileSync(rulesPath, 'utf8');

  console.log('\n📋 Deploying Firestore security rules...');

  const ruleset = await apiRequest(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`,
    'POST',
    { source: { files: [{ name: 'firestore.rules', content: rulesContent }] } },
    token
  );

  console.log(`   ✓ Ruleset created: ${ruleset.name}`);

  await apiRequest(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/cloud.firestore`,
    'PATCH',
    { release: { name: `projects/${PROJECT_ID}/releases/cloud.firestore`, rulesetName: ruleset.name } },
    token
  );

  console.log('   ✓ Rules are now live');
}

function printIndexSummary() {
  const indexesPath = join(__dirname, '..', 'firestore.indexes.json');
  const { indexes } = JSON.parse(readFileSync(indexesPath, 'utf8'));

  console.log('\n📑 Firestore indexes (manage manually in Firebase console):');
  console.log(`   🔗 https://console.firebase.google.com/project/${PROJECT_ID}/firestore/indexes`);
  console.log(`\n   Required indexes (from firestore.indexes.json):`);
  for (const idx of indexes) {
    const fields = idx.fields.map(f => `${f.fieldPath} ${f.order === 'ASCENDING' ? '↑' : '↓'}`).join(', ');
    console.log(`   • ${idx.collectionGroup}: ${fields}`);
  }
}

async function main() {
  console.log(`🔥 Firestore deploy — project: ${PROJECT_ID}`);

  const token = await getAccessToken();
  console.log('   ✓ Authenticated');

  await deployRules(token);
  printIndexSummary();

  console.log('\n✅ Rules deployed. Review indexes at the link above if needed.\n');
}

main().catch(err => {
  console.error('\n❌ Deploy failed:', err.message);
  process.exit(1);
});
