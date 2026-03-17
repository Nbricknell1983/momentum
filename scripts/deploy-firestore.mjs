import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  console.error('Missing required env vars: VITE_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/firebase',
  'https://www.googleapis.com/auth/datastore',
];

async function getAccessToken() {
  const auth = new GoogleAuth({
    credentials: {
      client_email: CLIENT_EMAIL,
      private_key: PRIVATE_KEY,
    },
    scopes: SCOPES,
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

async function apiRequest(url, method, body, token) {
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ─── Deploy Security Rules ───────────────────────────────────────────────────

async function deployRules(token) {
  const rulesPath = join(__dirname, '..', 'firestore.rules');
  const rulesContent = readFileSync(rulesPath, 'utf8');

  console.log('\n📋 Deploying Firestore security rules...');

  const rulesetRes = await apiRequest(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`,
    'POST',
    {
      source: {
        files: [{ name: 'firestore.rules', content: rulesContent }],
      },
    },
    token
  );

  const rulesetName = rulesetRes.name;
  console.log(`   ✓ Ruleset created: ${rulesetName}`);

  await apiRequest(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases/cloud.firestore`,
    'PATCH',
    {
      release: {
        name: `projects/${PROJECT_ID}/releases/cloud.firestore`,
        rulesetName,
      },
    },
    token
  );

  console.log('   ✓ Rules release updated');
}

// ─── Deploy Indexes ───────────────────────────────────────────────────────────

async function deployIndexes(token) {
  const indexesPath = join(__dirname, '..', 'firestore.indexes.json');
  const indexConfig = JSON.parse(readFileSync(indexesPath, 'utf8'));

  console.log('\n📑 Deploying Firestore indexes...');

  const listRes = await apiRequest(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/-/indexes`,
    'GET',
    null,
    token
  );

  const existingIndexes = listRes.indexes || [];

  function indexExists(desired) {
    return existingIndexes.some(existing => {
      if (existing.queryScope !== desired.queryScope) return false;
      const eFields = existing.fields?.filter(f => f.fieldPath !== '__name__') || [];
      const dFields = desired.fields || [];
      if (eFields.length !== dFields.length) return false;
      return dFields.every((df, i) => {
        const ef = eFields[i];
        return ef.fieldPath === df.fieldPath && ef.order === df.order;
      });
    });
  }

  let created = 0;
  let skipped = 0;

  for (const index of indexConfig.indexes) {
    const collectionGroup = index.collectionGroup;
    const desired = {
      queryScope: index.queryScope,
      fields: index.fields,
    };

    if (indexExists(desired)) {
      console.log(`   ⤷ Skipped (exists): ${collectionGroup} [${index.fields.map(f => f.fieldPath).join(', ')}]`);
      skipped++;
      continue;
    }

    try {
      await apiRequest(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/collectionGroups/${collectionGroup}/indexes`,
        'POST',
        {
          queryScope: index.queryScope,
          fields: index.fields,
        },
        token
      );
      console.log(`   ✓ Creating: ${collectionGroup} [${index.fields.map(f => f.fieldPath).join(', ')}]`);
      created++;
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('ALREADY_EXISTS')) {
        console.log(`   ⤷ Already exists: ${collectionGroup} [${index.fields.map(f => f.fieldPath).join(', ')}]`);
        skipped++;
      } else {
        console.error(`   ✗ Failed: ${collectionGroup} — ${err.message}`);
      }
    }
  }

  console.log(`\n   Summary: ${created} created, ${skipped} skipped`);
  if (created > 0) {
    console.log('   ℹ  Indexes build in the background — may take 1–5 minutes to become active.');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔥 Deploying Firestore config to project: ${PROJECT_ID}`);
  const token = await getAccessToken();
  console.log('   ✓ Authenticated');

  await deployRules(token);
  await deployIndexes(token);

  console.log('\n✅ Firestore deploy complete.\n');
}

main().catch(err => {
  console.error('\n❌ Deploy failed:', err.message);
  process.exit(1);
});
