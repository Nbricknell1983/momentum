#!/usr/bin/env tsx
/**
 * Momentum QA Runner v2 — entry point
 *
 * Orchestrates three phases in order:
 *   Phase 1 — Selector contract check (static, no browser)
 *   Phase 2 — Page contract tests (Playwright, authenticated)
 *   Phase 3 — Route sweep (Playwright, 31 routes, desktop + mobile)
 *
 * Usage:
 *   npx tsx tests/qa/index.ts
 *   QA_EMAIL=you@example.com QA_PASSWORD=secret npx tsx tests/qa/index.ts
 *   npx tsx tests/qa/index.ts --headful --skip /routes,/openclaw-setup
 *   npx tsx tests/qa/index.ts --phase=sweep       (skip phases 1 + 2)
 *   npx tsx tests/qa/index.ts --phase=contracts   (run only phase 2)
 *   npx tsx tests/qa/index.ts --phase=selector    (run only phase 1)
 */

import { format } from 'date-fns';
import { execSync, spawnSync } from 'child_process';
import { chromium } from 'playwright';
import type { QAConfig, QAReport } from './types';
import { getRoutesToTest } from './routes';
import { runQASweep } from './runner';
import { normaliseIssues } from './issues';
import { extractTopFivePriorities, generateMasterRepairPrompt } from './prompts';
import { writeJsonReport, writeMarkdownReport } from './report';
import { loginWithCredentials } from './auth';
import { PAGE_CONTRACTS, runPageContracts, type ContractResult } from './registry';

const CHROME = '/home/runner/workspace/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';

// ── Parse CLI args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const headless   = !args.includes('--headful');
const skipArg    = args.find(a => a.startsWith('--skip=') || a.startsWith('--skip '));
const skipRoutes = skipArg
  ? skipArg.replace('--skip=', '').replace('--skip ', '').split(',').map(s => s.trim())
  : [];
const phaseArg  = args.find(a => a.startsWith('--phase='))?.split('=')[1] ?? 'all';

const RUN_SELECTOR  = phaseArg === 'all' || phaseArg === 'selector';
const RUN_CONTRACTS = phaseArg === 'all' || phaseArg === 'contracts';
const RUN_SWEEP     = phaseArg === 'all' || phaseArg === 'sweep';

const config: QAConfig = {
  baseUrl:      process.env.QA_BASE_URL ?? 'http://localhost:5000',
  qaEmail:      process.env.QA_EMAIL,
  qaPassword:   process.env.QA_PASSWORD,
  headless,
  slowMo:       headless ? 0 : 100,
  screenshotDir: 'tests/qa/screenshots',
  desktopWidth:  1280,
  desktopHeight: 800,
  mobileWidth:   390,
  mobileHeight:  844,
  pageTimeout:   20000,
  skipRoutes,
};

// ── Phase summary tracking ────────────────────────────────────────────────────

type PhaseSummary = {
  name: string;
  passed: boolean;
  detail: string;
};
const phaseSummaries: PhaseSummary[] = [];

// ── Phase 1: Selector contract check ─────────────────────────────────────────

async function runSelectorCheck(): Promise<boolean> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 1 — Selector Contract Check (static)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    execSync('node tools/eslint-rules/no-direct-state-access.js', { stdio: 'inherit' });
    phaseSummaries.push({ name: 'Selector Contract', passed: true, detail: 'No direct state.leads/state.clients access found' });
    return true;
  } catch {
    phaseSummaries.push({ name: 'Selector Contract', passed: false, detail: 'Direct state.leads/state.clients access detected — use appSelectors.ts' });
    return false;
  }
}

// ── Phase 2: Page contract tests ──────────────────────────────────────────────

async function runContractTests(): Promise<boolean> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 2 — Page Contract Tests (Playwright)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!config.qaEmail || !config.qaPassword) {
    console.log('  Skipping — no QA_EMAIL/QA_PASSWORD set\n');
    phaseSummaries.push({ name: 'Page Contracts', passed: true, detail: 'Skipped (no credentials)' });
    return true;
  }

  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page    = await browser.newPage();

  const auth = await loginWithCredentials(page, config.qaEmail, config.qaPassword, config.baseUrl);
  if (!auth.success) {
    await browser.close();
    phaseSummaries.push({ name: 'Page Contracts', passed: false, detail: `Login failed: ${auth.error}` });
    return false;
  }

  const contracts = PAGE_CONTRACTS.filter(c => {
    if (c.requiresManager && !auth.isManager) return false;
    return true;
  });

  console.log(`  Running ${contracts.length} contracts...\n`);
  const results: ContractResult[] = await runPageContracts(page, config.baseUrl, contracts, msg => console.log(msg));
  await browser.close();

  const failed = results.filter(r => !r.passed);
  const passed = results.filter(r => r.passed).length;

  if (failed.length === 0) {
    phaseSummaries.push({ name: 'Page Contracts', passed: true, detail: `${passed}/${results.length} contracts passed` });
    return true;
  } else {
    const detail = failed.map(r => `${r.contract}: ${r.failures[0]}`).join('; ');
    phaseSummaries.push({ name: 'Page Contracts', passed: false, detail: `${failed.length} failed — ${detail}` });
    return false;
  }
}

// ── Phase 3: Full route sweep ─────────────────────────────────────────────────

async function runRouteSweep() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Phase 3 — Full Route Sweep (31 routes)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const allRoutes = getRoutesToTest({ authenticated: true, isManager: true, skipRoutes: config.skipRoutes });
  console.log(`  Discovered ${allRoutes.length} routes to test\n`);

  const { authenticated, isManager, results } = await runQASweep(allRoutes, config, msg => console.log(msg));
  const validResults = results.filter(r => r.status !== 'skipped');
  const issues = normaliseIssues(results);

  const critical = issues.filter(i => i.severity === 'critical').length;
  const high     = issues.filter(i => i.severity === 'high').length;
  const medium   = issues.filter(i => i.severity === 'medium').length;
  const low      = issues.filter(i => i.severity === 'low').length;
  const routesTested = [...new Set(validResults.map(r => r.route.path))];

  const report: QAReport = {
    runAt: format(new Date(), 'dd/MM/yyyy HH:mm:ss'),
    appUrl: config.baseUrl,
    authenticated,
    totalRoutesTested: routesTested.length,
    totalIssues: issues.length,
    criticalCount: critical,
    highCount: high,
    mediumCount: medium,
    lowCount: low,
    routesTested,
    issues,
    topFivePriorities: extractTopFivePriorities(issues),
    masterRepairPrompt: generateMasterRepairPrompt(issues),
  };

  console.log('\n📝  Writing reports...');
  const jsonPath = writeJsonReport(report);
  const mdPath   = writeMarkdownReport(report);

  const sweptOk = critical === 0;
  phaseSummaries.push({
    name: 'Route Sweep',
    passed: sweptOk,
    detail: `${routesTested.length} routes — ${critical} critical, ${high} high, ${medium} medium, ${low} low`,
  });

  return { report, jsonPath, mdPath, issues };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║    Momentum QA Runner v2 — Full Sweep    ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`App URL:     ${config.baseUrl}`);
  console.log(`Auth:        ${config.qaEmail ?? 'None'}`);
  console.log(`Headless:    ${config.headless}`);
  console.log(`Phases:      ${phaseArg}`);
  console.log(`Skip routes: ${config.skipRoutes.length > 0 ? config.skipRoutes.join(', ') : 'none'}\n`);

  let selectorOk  = true;
  let contractsOk = true;
  let sweepIssues: any[] = [];
  let jsonPath = '', mdPath = '';

  if (RUN_SELECTOR) selectorOk  = await runSelectorCheck();
  if (RUN_CONTRACTS) contractsOk = await runContractTests();

  if (RUN_SWEEP) {
    const sweep = await runRouteSweep();
    sweepIssues = sweep.issues;
    jsonPath = sweep.jsonPath;
    mdPath   = sweep.mdPath;
  }

  // ── Final summary ───────────────────────────────────────────────────────────

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║            QA v2 Sweep Summary           ║');
  console.log('╚══════════════════════════════════════════╝\n');

  for (const p of phaseSummaries) {
    const icon = p.passed ? '✅' : '❌';
    console.log(`  ${icon}  ${p.name}`);
    console.log(`       ${p.detail}\n`);
  }

  if (jsonPath) console.log(`  Reports: ${jsonPath}\n           ${mdPath}\n`);

  const topPriorities = sweepIssues
    .filter(i => i.severity === 'critical' || i.severity === 'high')
    .slice(0, 5);

  if (topPriorities.length > 0) {
    console.log('🎯  Top priorities from sweep:');
    for (const p of topPriorities) {
      console.log(`   [${p.severity.toUpperCase()}] ${p.issueTitle} — ${p.route}`);
    }
    console.log('');
  }

  const overallPassed = selectorOk && contractsOk && sweepIssues.filter(i => i.severity === 'critical').length === 0;

  if (!overallPassed) {
    console.log('⛔  QA FAILED — fix issues above before deploying');
    process.exitCode = 1;
  } else if (!contractsOk || sweepIssues.filter(i => i.severity === 'high').length > 0) {
    console.log('⚠️   High-severity issues found — review before next deploy');
    process.exitCode = 0;
  } else {
    console.log('✅  All QA phases passed');
    process.exitCode = 0;
  }
}

main().catch(err => {
  console.error('\n❌  QA runner crashed:', err);
  process.exit(2);
});
