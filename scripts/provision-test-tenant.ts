/**
 * Provision Test Tenant — End-to-End
 *
 * Sends a real provisioning request from Momentum → AI Systems.
 * Uses realistic test data for "Smith's Plumbing" in Parramatta.
 *
 * Prerequisites:
 *   1. AI Systems running on port 5001 (./start-local.sh)
 *   2. Momentum .env loaded (source .env)
 *
 * Usage:
 *   set -a && source .env && set +a && npx tsx scripts/provision-test-tenant.ts
 */

const AI_SYSTEMS_BASE_URL = process.env.AI_SYSTEMS_BASE_URL || 'http://localhost:5001';
const AI_SYSTEMS_API_KEY = process.env.AI_SYSTEMS_API_KEY;

if (!AI_SYSTEMS_API_KEY) {
  console.error('ERROR: AI_SYSTEMS_API_KEY not set. Run: set -a && source .env && set +a');
  process.exit(1);
}

// ── Build the payload using Momentum's own transform pipeline ───────────────

import { randomUUID } from 'crypto';
import {
  mapBusiness, mapHandoverSnapshot, mapTargetMarket, mapStrategy,
  mapResearchArtifacts, mapKeywords, mapCapabilities, mapModules,
  mapAgents, mapOnboarding, mapMetadata,
} from '../server/integration/mappers';
import { buildProvisioningRequestBlock } from '../server/integration/provisioning';
import { toAiSystemsPayload } from '../server/integration/ai-systems-transform';
import type { TenantProvisionPayload } from '../server/integration/types';

// ── Test data: Smith's Plumbing in Parramatta ───────────────────────────────

const clientDoc = {
  legalName: "Smith's Plumbing Pty Ltd",
  tradingName: 'Smith Plumbing',
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
  serviceModel: 'mobile_service',
  serviceAreas: ['Parramatta', 'Sydney CBD', 'Blacktown', 'Castle Hill', 'Penrith'],
  targetServices: [
    { name: 'Emergency Plumbing', category: 'Plumbing', urgencyLevel: 'emergency', avgJobValue: 450 },
    { name: 'Hot Water Repairs', category: 'Plumbing', urgencyLevel: 'planned', avgJobValue: 800 },
    { name: 'Blocked Drains', category: 'Plumbing', urgencyLevel: 'emergency', avgJobValue: 350 },
  ],
  lat: -33.8148,
  lng: 151.0017,
};

const leadDoc = {
  id: 'test-lead-001',
  businessName: "Smith's Plumbing",
  stage: 'Won',
  createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  touchpoints: 12,
  momentumScore: 85,
  source: 'google_ads',
};

const strategyDoc = {
  id: 'test-strat-001',
  createdAt: new Date().toISOString(),
  agentId: 'strategy-specialist',
  strategyHash: 'a'.repeat(64),
  strategySummary: 'Focus on local SEO and GBP optimisation to dominate plumbing searches in Western Sydney.',
  growthDiagnosis: 'Low organic visibility but strong review profile. Quick wins in GBP and local keywords.',
  keyRisks: ['High competitor density in Parramatta'],
  keyOpportunities: ['Untapped emergency plumbing keyword cluster', 'Strong review profile for trust signals'],
  startingPosition: 'Page 2-3 for primary keywords, 4.8 star GBP rating',
  priorityModules: ['gbp', 'seo'] as ('gbp' | 'seo')[],
  firstFocusArea: 'GBP optimisation and review velocity',
  timeline: { week1: 'GBP profile audit + optimisation', month1: 'SEO keyword targeting + content plan', month3: 'Content expansion + location pages' },
  recommendations: [
    { title: 'Optimise GBP profile', rationale: 'Incomplete profile losing map pack visibility', module: 'gbp', priority: 'urgent' as const, timeframe: 'immediate' as const },
    { title: 'Target emergency plumbing keywords', rationale: 'High intent, low competition cluster', module: 'seo', priority: 'high' as const, timeframe: 'week1' as const },
    { title: 'Build location-specific service pages', rationale: 'No suburb pages = missing local search traffic', module: 'seo', priority: 'medium' as const, timeframe: 'month1' as const },
  ],
};

const scoringDoc = {
  confidenceScore: 72,
  dataCompleteness: 80,
  strategyClarity: 75,
  marketOpportunity: 85,
  executionRisk: 40,
  scoringRationale: 'Strong market opportunity, moderate data gaps. GBP strength is an asset.',
  primaryMetric: 'gbp_rank',
  month1Targets: [{ metric: 'gbp_rank', target: 5, unit: 'rank', direction: 'down' as const }],
  month3Targets: [{ metric: 'gbp_rank', target: 3, unit: 'rank', direction: 'down' as const }],
  month6Targets: [{ metric: 'gbp_rank', target: 1, unit: 'rank', direction: 'down' as const }],
};

const keywordDoc = {
  keywords: [
    { term: 'emergency plumber parramatta', volume: 320, difficulty: 25, cpc: 12.5, intent: 'transactional', isLocal: true, isPrimary: true },
    { term: 'plumber near me parramatta', volume: 480, difficulty: 35, cpc: 8.0, intent: 'transactional', isLocal: true, isPrimary: true },
    { term: 'hot water repair western sydney', volume: 140, difficulty: 30, cpc: 10.0, intent: 'transactional', isLocal: true, isPrimary: false },
    { term: 'blocked drain plumber sydney', volume: 210, difficulty: 40, cpc: 9.5, intent: 'transactional', isLocal: true, isPrimary: false },
  ],
  clusters: [
    { id: 'emergency', name: 'Emergency Plumbing', intent: 'transactional', category: 'Plumbing', keywords: [{ term: 'emergency plumber parramatta' }], volume: 500, opportunityScore: 85 },
    { id: 'hot-water', name: 'Hot Water', intent: 'transactional', category: 'Plumbing', keywords: [{ term: 'hot water repair western sydney' }], volume: 200, opportunityScore: 70 },
  ],
  priorityKeywordTargets: [
    { term: 'emergency plumber parramatta', reason: 'Highest intent, best conversion potential', targetPage: '/', currentRank: 15, targetRank: 3 },
    { term: 'plumber near me parramatta', reason: 'High volume local search', targetPage: '/', currentRank: 22, targetRank: 5 },
  ],
  researchedAt: new Date().toISOString(),
  researchSource: 'serpapi',
};

const scopeSelection = { website: true, seo: true, gbp: true, ads: false, portal: true, autopilot: true };

// ── Build internal payload ──────────────────────────────────────────────────

const provisioningRequest = buildProvisioningRequestBlock({
  orgId: 'test-org-001',
  clientId: 'test-client-001',
  userId: 'nathan',
  displayName: 'Nathan Bricknell',
  role: 'admin',
  schemaVersion: '1.0',
});

const capabilities = mapCapabilities(scopeSelection);
const modules = mapModules(scopeSelection);
const agents = mapAgents(modules, scopeSelection.autopilot);

const internalPayload: TenantProvisionPayload = {
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
    handoverNotes: 'Strong candidate — high GBP rating, needs SEO lift',
    portal: true,
    sendInvite: true,
    inviteEmail: 'john@smithplumbing.com.au',
    expectedStartDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  }),
  metadata: mapMetadata({ clientDoc, userId: 'nathan', displayName: 'Nathan Bricknell', userEmail: 'nathan@sark.com.au' }),
};

// ── Transform to AI Systems format ──────────────────────────────────────────

const aiPayload = toAiSystemsPayload(internalPayload);

// ── Send to AI Systems ──────────────────────────────────────────────────────

async function run() {
  console.log('\n═══ Provisioning Test Tenant ═══\n');
  console.log(`Target:    ${AI_SYSTEMS_BASE_URL}`);
  console.log(`Tenant:    ${aiPayload.tenant.name}`);
  console.log(`Subdomain: ${aiPayload.tenant.subdomain}`);
  console.log(`Category:  ${aiPayload.tenant.category}`);
  console.log(`Modules:   ${aiPayload.modules.map(m => m.moduleId).join(', ')}`);
  console.log(`Agents:    ${aiPayload.agents.map(a => a.agentId).join(', ')}`);
  console.log(`Request:   ${aiPayload.provisioningRequestId}`);
  console.log('');

  // Step 1: Provision
  console.log('Step 1 — Sending provisioning request...');
  const provisionUrl = `${AI_SYSTEMS_BASE_URL}/api/integration/tenants`;
  const provisionRes = await fetch(provisionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_SYSTEMS_API_KEY}`,
      'X-Source-System': 'momentum',
    },
    body: JSON.stringify(aiPayload),
  });

  const provisionBody = await provisionRes.json().catch(() => ({}));
  console.log(`  Status: ${provisionRes.status} ${provisionRes.ok ? 'OK' : 'FAILED'}`);
  console.log(`  Body:`, JSON.stringify(provisionBody, null, 2));

  if (!provisionRes.ok) {
    console.error('\nProvisioning FAILED. Check AI Systems logs for details.');
    process.exit(1);
  }

  const tenantId = (provisionBody as any).tenantId;
  console.log(`\n  Tenant ID: ${tenantId}`);

  // Step 2: Trigger startup
  console.log('\nStep 2 — Triggering startup...');
  const startupUrl = `${AI_SYSTEMS_BASE_URL}/api/startup/tenants/${tenantId}/run`;
  const startupRes = await fetch(startupUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AI_SYSTEMS_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Source-System': 'momentum',
    },
  });

  const startupBody = await startupRes.json().catch(() => ({}));
  console.log(`  Status: ${startupRes.status} ${startupRes.ok ? 'OK' : 'FAILED'}`);
  console.log(`  Body:`, JSON.stringify(startupBody, null, 2));

  // Step 3: Poll status
  console.log('\nStep 3 — Checking tenant status...');
  const statusUrl = `${AI_SYSTEMS_BASE_URL}/api/integration/tenants/${tenantId}/status`;
  const statusRes = await fetch(statusUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${AI_SYSTEMS_API_KEY}`,
      'X-Source-System': 'momentum',
    },
  });

  const statusBody = await statusRes.json().catch(() => ({}));
  console.log(`  Status: ${statusRes.status}`);
  console.log(`  Body:`, JSON.stringify(statusBody, null, 2));

  // Summary
  console.log('\n═══ Provisioning Complete ═══');
  console.log(`  Tenant ID:       ${tenantId}`);
  console.log(`  Lifecycle State:  ${(statusBody as any).lifecycleState || (provisionBody as any).lifecycleState}`);
  console.log(`  Active Modules:   ${JSON.stringify((statusBody as any).modules || [])}`);
  console.log(`  Active Agents:    ${JSON.stringify((statusBody as any).activeAgents || [])}`);
  console.log(`  Active Workflows: ${JSON.stringify((statusBody as any).activeWorkflows?.length || 0)} queued`);
  console.log('');
}

run().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
