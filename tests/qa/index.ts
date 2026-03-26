#!/usr/bin/env tsx
/**
 * Momentum QA Runner — entry point
 *
 * Usage:
 *   npx tsx tests/qa/index.ts
 *   QA_EMAIL=you@example.com QA_PASSWORD=secret npx tsx tests/qa/index.ts
 *   npx tsx tests/qa/index.ts --headful --skip /routes,/openclaw-setup
 */

import { format } from 'date-fns';
import type { QAConfig, QAReport } from './types';
import { getRoutesToTest } from './routes';
import { runQASweep } from './runner';
import { normaliseIssues } from './issues';
import { extractTopFivePriorities, generateMasterRepairPrompt } from './prompts';
import { writeJsonReport, writeMarkdownReport } from './report';

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const headless = !args.includes('--headful');
const skipArg = args.find(a => a.startsWith('--skip=') || a.startsWith('--skip '));
const skipRoutes = skipArg
  ? skipArg.replace('--skip=', '').replace('--skip ', '').split(',').map(s => s.trim())
  : [];

const config: QAConfig = {
  baseUrl: process.env.QA_BASE_URL ?? 'http://localhost:5000',
  qaEmail: process.env.QA_EMAIL,
  qaPassword: process.env.QA_PASSWORD,
  headless,
  slowMo: headless ? 0 : 100,
  screenshotDir: 'tests/qa/screenshots',
  desktopWidth: 1280,
  desktopHeight: 800,
  mobileWidth: 390,
  mobileHeight: 844,
  pageTimeout: 20000,
  skipRoutes,
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║      Momentum Autonomous QA Runner       ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`App URL:     ${config.baseUrl}`);
  console.log(`Auth:        ${config.qaEmail ? `${config.qaEmail} (email/password)` : 'None — unauthenticated routes only'}`);
  console.log(`Headless:    ${config.headless}`);
  console.log(`Skip routes: ${config.skipRoutes.length > 0 ? config.skipRoutes.join(', ') : 'none'}`);
  console.log('');

  // Discover routes — start with all (will filter once we know auth/manager status)
  const allRoutes = getRoutesToTest({
    authenticated: true,
    isManager: true,
    skipRoutes: config.skipRoutes,
  });

  console.log(`Discovered ${allRoutes.length} routes to test\n`);

  // Run the sweep
  const { authenticated, isManager, results } = await runQASweep(allRoutes, config, msg => console.log(msg));

  // Filter results to only those matching actual auth level
  const validResults = results.filter(r => r.status !== 'skipped');

  // Normalise into structured issues
  console.log('\n🔍  Normalising issues...');
  const issues = normaliseIssues(results);

  const critical = issues.filter(i => i.severity === 'critical').length;
  const high = issues.filter(i => i.severity === 'high').length;
  const medium = issues.filter(i => i.severity === 'medium').length;
  const low = issues.filter(i => i.severity === 'low').length;

  const routesTested = [...new Set(validResults.map(r => r.route.path))];

  // Build report
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

  // Write reports
  console.log('\n📝  Writing reports...');
  const jsonPath = writeJsonReport(report);
  const mdPath = writeMarkdownReport(report);

  // Print summary
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║              QA Sweep Complete           ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`Routes tested:    ${routesTested.length}`);
  console.log(`Total issues:     ${issues.length}`);
  console.log(`  🔴 Critical:    ${critical}`);
  console.log(`  🟠 High:        ${high}`);
  console.log(`  🟡 Medium:      ${medium}`);
  console.log(`  ⚪ Low:         ${low}`);
  console.log('');
  console.log(`Reports written:`);
  console.log(`  JSON:     ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);

  if (report.topFivePriorities.length > 0) {
    console.log('\n🎯  Top 5 priorities:');
    for (const p of report.topFivePriorities) {
      console.log(`   ${p}`);
    }
  }

  if (critical > 0) {
    console.log('\n⛔  CRITICAL ISSUES FOUND — see the Markdown report for repair prompts');
    process.exitCode = 1;
  } else if (high > 0) {
    console.log('\n⚠️   High-severity issues found — review the report before next deploy');
    process.exitCode = 0;
  } else {
    console.log('\n✅  No critical or high-severity issues found');
    process.exitCode = 0;
  }
}

main().catch(err => {
  console.error('\n❌  QA runner crashed:', err);
  process.exit(2);
});
