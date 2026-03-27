/**
 * Integration Contract Tests — Momentum → AI Systems
 *
 * Validates that:
 * 1. Momentum's transformed payload passes AI Systems' Zod validation
 * 2. Subdomain generation produces valid values
 * 3. Category mapping resolves correctly
 * 4. Capabilities/modules/agents arrays are correctly formed
 * 5. Auth tokens are aligned
 * 6. Status response shape is handled correctly
 * 7. Patch payload shape matches AI Systems' contract
 * 8. Failure scenarios are handled gracefully
 *
 * Usage:
 *   npx tsx tests/e2e/integration-contracts.ts
 *
 * No external dependencies required — runs against the code directly.
 */

import { randomUUID } from 'crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Momentum imports ────────────────────────────────────────────────────────
import {
  toAiSystemsPayload,
  generateSubdomain,
  mapCategoryToEnum,
} from '../../server/integration/ai-systems-transform';
import { mapBusiness, mapHandoverSnapshot, mapTargetMarket, mapStrategy, mapResearchArtifacts, mapKeywords, mapCapabilities, mapModules, mapAgents, mapOnboarding, mapMetadata } from '../../server/integration/mappers';
import { buildProvisioningRequestBlock } from '../../server/integration/provisioning';
import { buildBusinessPatch, buildStrategyPatch, buildModuleAddPatch } from '../../server/integration/patch';
import type { TenantProvisionPayload } from '../../server/integration/types';

// ── AI Systems imports (for Zod validation) ─────────────────────────────────
// Use dynamic path since these are in a different project
import { TenantProvisionPayloadSchema, TenantPatchPayloadSchema } from '../../../AI_Systems/server/integration/schemas';

// ── Test harness ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ── Test fixtures ───────────────────────────────────────────────────────────

function makeClientDoc() {
  return {
    legalName: "Smith's Plumbing Pty Ltd",
    tradingName: "Smith Plumbing",
    businessName: "Smith's Plumbing",
    abn: '12345678901',
    phone: '0412345678',
    email: 'john@smithplumbing.com.au',
    website: 'https://smithplumbing.com.au',
    suburb: 'Parramatta',
    state: 'NSW',
    postcode: '2150',
    address: {
      street: '42 Station St',
      suburb: 'Parramatta',
      state: 'NSW',
      postcode: '2150',
      fullFormatted: '42 Station St, Parramatta NSW 2150',
    },
    primaryContact: {
      firstName: 'John',
      lastName: 'Smith',
      role: 'Owner',
      phone: '0412345678',
      email: 'john@smithplumbing.com.au',
    },
    gbpCategory: 'Plumbing Services',
    industry: 'Trades & Services',
    serviceModel: 'mobile_service' as const,
    serviceAreas: ['Parramatta', 'Sydney CBD', 'Blacktown'],
    targetServices: [
      { name: 'Emergency Plumbing', category: 'Plumbing', urgencyLevel: 'emergency', avgJobValue: 450 },
      { name: 'Hot Water Repairs', category: 'Plumbing', urgencyLevel: 'planned', avgJobValue: 800 },
    ],
    lat: -33.8148,
    lng: 151.0017,
  };
}

function makeLeadDoc() {
  return {
    id: 'lead-001',
    businessName: "Smith's Plumbing",
    stage: 'Won',
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    touchpoints: 12,
    momentumScore: 85,
    source: 'google_ads',
  };
}

function makeStrategyDoc() {
  return {
    id: 'strat-001',
    createdAt: new Date().toISOString(),
    agentId: 'strategy-specialist',
    strategyHash: 'a'.repeat(64),
    strategySummary: 'Focus on local SEO and GBP optimisation to dominate plumbing searches in Western Sydney.',
    growthDiagnosis: 'Low organic visibility but strong review profile.',
    keyRisks: ['High competitor density in Parramatta'],
    keyOpportunities: ['Untapped emergency plumbing keyword cluster'],
    startingPosition: 'Page 2-3 for primary keywords',
    priorityModules: ['gbp', 'seo'],
    firstFocusArea: 'GBP optimisation and review velocity',
    timeline: { week1: 'GBP audit', month1: 'SEO keyword targeting', month3: 'Content expansion' },
    recommendations: [
      { title: 'Optimise GBP profile', rationale: 'Incomplete profile losing map pack visibility', module: 'gbp', priority: 'urgent', timeframe: 'immediate' },
      { title: 'Target emergency plumbing keywords', rationale: 'High intent, low competition cluster', module: 'seo', priority: 'high', timeframe: 'week1' },
    ],
  };
}

function makeScoringDoc() {
  return {
    confidenceScore: 72,
    dataCompleteness: 80,
    strategyClarity: 75,
    marketOpportunity: 85,
    executionRisk: 40,
    scoringRationale: 'Strong market opportunity, moderate data gaps',
    primaryMetric: 'gbp_rank',
    month1Targets: [{ metric: 'gbp_rank', target: 5, unit: 'rank', direction: 'down' as const }],
    month3Targets: [{ metric: 'gbp_rank', target: 3, unit: 'rank', direction: 'down' as const }],
    month6Targets: [{ metric: 'gbp_rank', target: 1, unit: 'rank', direction: 'down' as const }],
  };
}

function makeKeywordDoc() {
  return {
    keywords: [
      { term: 'emergency plumber parramatta', volume: 320, difficulty: 25, cpc: 12.5, intent: 'transactional', isLocal: true, isPrimary: true },
      { term: 'plumber near me', volume: 2400, difficulty: 55, cpc: 8.0, intent: 'transactional', isLocal: true, isPrimary: true },
      { term: 'hot water repair sydney', volume: 140, difficulty: 30, cpc: 10.0, intent: 'transactional', isLocal: true, isPrimary: false },
    ],
    clusters: [
      { id: 'emergency', name: 'Emergency Plumbing', intent: 'transactional', category: 'Plumbing', keywords: [{ term: 'emergency plumber parramatta' }], volume: 500, opportunityScore: 85 },
    ],
    priorityKeywordTargets: [
      { term: 'emergency plumber parramatta', reason: 'High intent, low difficulty', targetPage: '/', currentRank: 15, targetRank: 3 },
    ],
    researchedAt: new Date().toISOString(),
    researchSource: 'serpapi',
  };
}

function buildFullInternalPayload(): TenantProvisionPayload {
  const scopeSelection = { website: true, seo: true, gbp: true, ads: false, portal: true, autopilot: true };
  const clientDoc = makeClientDoc();
  const leadDoc = makeLeadDoc();
  const strategyDoc = makeStrategyDoc();
  const scoringDoc = makeScoringDoc();
  const keywordDoc = makeKeywordDoc();

  const provisioningRequest = buildProvisioningRequestBlock({
    orgId: 'org-001',
    clientId: 'client-001',
    userId: 'user-001',
    displayName: 'Nathan Bricknell',
    role: 'admin',
    schemaVersion: '1.0',
  });

  const capabilities = mapCapabilities(scopeSelection);
  const modules = mapModules(scopeSelection);
  const agents = mapAgents(modules, scopeSelection.autopilot);

  return {
    provisioningRequest,
    business: mapBusiness(clientDoc),
    handoverSnapshot: mapHandoverSnapshot({
      snapshotId: randomUUID(),
      leadDoc,
      strategyDoc,
      scoringDoc,
      archetype: 'local_anchor',
    }),
    targetMarket: mapTargetMarket(clientDoc),
    strategy: mapStrategy(strategyDoc),
    researchArtifacts: mapResearchArtifacts(clientDoc, {}),
    keywords: mapKeywords(keywordDoc),
    requestedCapabilities: capabilities,
    requestedModules: modules,
    requestedAgents: agents,
    onboarding: mapOnboarding({
      planTier: 'growth',
      agreedScope: ['seo', 'gbp', 'website', 'portal', 'autopilot'],
      handoverNotes: 'Strong candidate for GBP growth',
      portal: true,
      sendInvite: true,
      inviteEmail: 'john@smithplumbing.com.au',
      expectedStartDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    }),
    metadata: mapMetadata({ clientDoc, userId: 'user-001', displayName: 'Nathan Bricknell', userEmail: 'nathan@sark.com.au' }),
  };
}

// ── TESTS ───────────────────────────────────────────────────────────────────

console.log('\n─── Integration Contract Tests ───\n');

// ─── 1. Subdomain generation ────────────────────────────────────────────────

console.log('Subdomain Generation:');

test('generates valid subdomain from business name', () => {
  const sub = generateSubdomain("Smith's Plumbing Pty Ltd");
  assert(/^[a-z0-9-]+$/.test(sub), `Invalid chars in "${sub}"`);
  assert(sub.length >= 2 && sub.length <= 63, `Length out of range: ${sub.length}`);
  assert(sub === 'smiths-plumbing-pty-ltd', `Expected "smiths-plumbing-pty-ltd", got "${sub}"`);
});

test('handles & symbol', () => {
  const sub = generateSubdomain('Smith & Sons Electrical');
  assert(sub === 'smith-and-sons-electrical', `Expected "smith-and-sons-electrical", got "${sub}"`);
});

test('handles empty string', () => {
  const sub = generateSubdomain('');
  assert(sub === 'tenant', `Expected "tenant" fallback, got "${sub}"`);
});

test('truncates long names to 63 chars', () => {
  const sub = generateSubdomain('A'.repeat(100));
  assert(sub.length <= 63, `Length ${sub.length} exceeds 63`);
});

// ─── 2. Category mapping ────────────────────────────────────────────────────

console.log('\nCategory Mapping:');

test('maps "Plumbing Services" → plumber', () => {
  assert(mapCategoryToEnum('Plumbing Services') === 'plumber', 'Expected plumber');
});

test('maps "Electrical Contractor" → electrician', () => {
  assert(mapCategoryToEnum('Electrical Contractor') === 'electrician', 'Expected electrician');
});

test('maps "Air Conditioning" → hvac', () => {
  assert(mapCategoryToEnum('Air Conditioning') === 'hvac', 'Expected hvac');
});

test('maps exact match "plumber" → plumber', () => {
  assert(mapCategoryToEnum('plumber') === 'plumber', 'Expected plumber');
});

test('maps unknown category → general', () => {
  assert(mapCategoryToEnum('Underwater Basket Weaving') === 'general', 'Expected general');
});

test('maps empty string → general', () => {
  assert(mapCategoryToEnum('') === 'general', 'Expected general');
});

// ─── 3. Payload transformation ──────────────────────────────────────────────

console.log('\nPayload Transformation:');

const internalPayload = buildFullInternalPayload();
const aiPayload = toAiSystemsPayload(internalPayload);

test('has schemaVersion "1.0"', () => {
  assert(aiPayload.schemaVersion === '1.0', `Got "${aiPayload.schemaVersion}"`);
});

test('has valid UUID provisioningRequestId', () => {
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(aiPayload.provisioningRequestId), 'Not a valid UUID v4');
});

test('sourceSystem is "momentum"', () => {
  assert(aiPayload.sourceSystem === 'momentum', `Got "${aiPayload.sourceSystem}"`);
});

test('tenant.name is populated', () => {
  assert(aiPayload.tenant.name.length > 0, 'tenant.name is empty');
});

test('tenant.subdomain is valid', () => {
  assert(/^[a-z0-9-]+$/.test(aiPayload.tenant.subdomain), `Invalid subdomain: "${aiPayload.tenant.subdomain}"`);
});

test('tenant.category is a valid enum', () => {
  const valid = ['plumber', 'electrician', 'mechanic', 'hvac', 'landscaper', 'cleaner', 'contractor', 'skipbins', 'earthmoving', 'equipmenthire', 'fabrication', 'financial', 'engineering', 'general'];
  assert(valid.includes(aiPayload.tenant.category), `Invalid category: "${aiPayload.tenant.category}"`);
});

test('capabilities is a string array', () => {
  assert(Array.isArray(aiPayload.capabilities), 'capabilities is not an array');
  assert(aiPayload.capabilities.every(c => typeof c === 'string'), 'capabilities contains non-strings');
});

test('capabilities includes seo and gbp', () => {
  assert(aiPayload.capabilities.includes('seo'), 'Missing seo');
  assert(aiPayload.capabilities.includes('gbp'), 'Missing gbp');
});

test('modules is an array of ModuleSpec', () => {
  assert(Array.isArray(aiPayload.modules), 'modules is not an array');
  assert(aiPayload.modules.every(m => typeof m.moduleId === 'string'), 'modules missing moduleId');
});

test('modules includes seo_autopilot', () => {
  assert(aiPayload.modules.some(m => m.moduleId === 'seo_autopilot'), 'Missing seo_autopilot module');
});

test('agents is an array of AgentSpec', () => {
  assert(Array.isArray(aiPayload.agents), 'agents is not an array');
  assert(aiPayload.agents.every(a => typeof a.agentId === 'string'), 'agents missing agentId');
});

test('handoverSnapshot has keyword strategy', () => {
  assert(!!aiPayload.handoverSnapshot, 'handoverSnapshot missing');
  assert(Array.isArray(aiPayload.handoverSnapshot!.keywordStrategy), 'keywordStrategy not an array');
  assert(aiPayload.handoverSnapshot!.keywordStrategy!.length > 0, 'keywordStrategy is empty');
});

test('handoverSnapshot has service areas', () => {
  assert(Array.isArray(aiPayload.handoverSnapshot!.serviceAreas), 'serviceAreas not an array');
  assert(aiPayload.handoverSnapshot!.serviceAreas!.length > 0, 'serviceAreas is empty');
});

test('nextBestActions derived from strategy recommendations', () => {
  assert(!!aiPayload.nextBestActions, 'nextBestActions missing');
  assert(aiPayload.nextBestActions!.length > 0, 'nextBestActions is empty');
  assert(aiPayload.nextBestActions![0].priority === 'critical', `First NBA should be critical, got "${aiPayload.nextBestActions![0].priority}"`);
});

// ─── 4. AI Systems Zod validation ───────────────────────────────────────────

console.log('\nAI Systems Zod Validation:');

test('transformed payload passes AI Systems TenantProvisionPayloadSchema', () => {
  const result = TenantProvisionPayloadSchema.safeParse(aiPayload);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Validation failed: ${errors}`);
  }
});

// ─── 5. Patch contract ──────────────────────────────────────────────────────

console.log('\nPatch Contract:');

test('buildBusinessPatch produces valid AI Systems patch format', () => {
  const patch = buildBusinessPatch(randomUUID(), { phone: '0400000000' });
  assert(patch.schemaVersion === '1.0', 'Missing schemaVersion');
  assert(patch.sourceSystem === 'momentum', 'Wrong sourceSystem');
  assert(Array.isArray(patch.fields), 'fields not an array');
  assert(patch.fields.length > 0, 'fields is empty');
  assert(patch.fields[0].path === 'tenant.phone', `Expected "tenant.phone", got "${patch.fields[0].path}"`);
  assert(patch.fields[0].mergeMode === 'merge', `Expected "merge", got "${patch.fields[0].mergeMode}"`);
});

test('buildBusinessPatch passes AI Systems TenantPatchPayloadSchema', () => {
  const patch = buildBusinessPatch(randomUUID(), { phone: '0400000000' });
  const result = TenantPatchPayloadSchema.safeParse(patch);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Patch validation failed: ${errors}`);
  }
});

test('buildModuleAddPatch produces additive merge mode', () => {
  const patch = buildModuleAddPatch(randomUUID(), { booking: { activate: true as const, priority: 'immediate' as const, notes: null } });
  assert(patch.fields[0].mergeMode === 'additive', `Expected "additive", got "${patch.fields[0].mergeMode}"`);
});

// ─── 6. Auth token alignment ────────────────────────────────────────────────

console.log('\nAuth Token Alignment:');

test('AI_SYSTEMS_API_KEY matches MOMENTUM_SHARED_SECRET in .env files', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const momentumEnv = readFileSync(resolve(dir, '../../.env'), 'utf8');
  const aiSystemsEnv = readFileSync(resolve(dir, '../../../AI_Systems/.env'), 'utf8');

  const momentumKey = momentumEnv.match(/AI_SYSTEMS_API_KEY=(.*)/)?.[1]?.trim();
  const aiSystemsSecret = aiSystemsEnv.match(/MOMENTUM_SHARED_SECRET=(.*)/)?.[1]?.trim();

  assert(!!momentumKey, 'AI_SYSTEMS_API_KEY not found in Momentum .env');
  assert(!!aiSystemsSecret, 'MOMENTUM_SHARED_SECRET not found in AI Systems .env');
  assert(momentumKey === aiSystemsSecret, `Keys don't match: "${momentumKey?.slice(0, 10)}..." vs "${aiSystemsSecret?.slice(0, 10)}..."`);
});

// ─── 7. Tenant isolation checks ─────────────────────────────────────────────

console.log('\nTenant Isolation:');

test('payload includes sourceOrgId and sourceClientId', () => {
  assert(!!aiPayload.sourceOrgId, 'sourceOrgId missing');
  assert(!!aiPayload.sourceClientId, 'sourceClientId missing');
});

test('different clients produce different provisioningRequestIds', () => {
  const payload2 = buildFullInternalPayload();
  const ai2 = toAiSystemsPayload(payload2);
  assert(aiPayload.provisioningRequestId !== ai2.provisioningRequestId, 'provisioningRequestIds should be unique');
});

test('different business names produce different subdomains', () => {
  const modified = { ...internalPayload, business: { ...internalPayload.business, legalName: 'Jones Electrical Services' } };
  const ai2 = toAiSystemsPayload(modified);
  assert(aiPayload.tenant.subdomain !== ai2.tenant.subdomain, 'Subdomains should differ for different businesses');
});

// ─── 8. Edge cases ──────────────────────────────────────────────────────────

console.log('\nEdge Cases:');

test('handles missing optional fields gracefully', () => {
  const minimal = { ...internalPayload };
  minimal.business = { ...minimal.business, tradingName: null, abn: null, email: null, website: null };
  const result = toAiSystemsPayload(minimal);
  assert(!!result.tenant.name, 'tenant.name should still be populated');
});

test('handles empty keyword lists', () => {
  const modified = { ...internalPayload };
  modified.keywords = { ...modified.keywords, primaryKeywords: [modified.keywords.primaryKeywords[0]], secondaryKeywords: [] };
  const result = toAiSystemsPayload(modified);
  assert(!!result.handoverSnapshot?.keywordStrategy, 'Should still have keyword strategy');
});

test('capabilities array is empty when nothing is selected', () => {
  const noCaps = { ...internalPayload };
  noCaps.requestedCapabilities = { website: false, localSEO: false, gbpManagement: false, adsStrategy: false, customerPortal: false, agentAutopilot: false };
  const result = toAiSystemsPayload(noCaps);
  assert(result.capabilities.length === 0, `Expected empty capabilities, got ${result.capabilities.length}`);
});

test('modules array is empty when all null', () => {
  const noMods = { ...internalPayload };
  noMods.requestedModules = { website: null, seo: null, gbp: null, ads: null };
  const result = toAiSystemsPayload(noMods);
  assert(result.modules.length === 0, `Expected empty modules, got ${result.modules.length}`);
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n─── Results: ${passed} passed, ${failed} failed ───\n`);
process.exit(failed > 0 ? 1 : 0);
