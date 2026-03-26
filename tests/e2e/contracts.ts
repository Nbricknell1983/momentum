/**
 * Page contract test runner.
 *
 * Runs all page contracts defined in tests/qa/registry.ts against
 * a live app instance.
 *
 * Usage:
 *   QA_EMAIL=... QA_PASSWORD=... npx tsx tests/e2e/contracts.ts
 *
 * Exit code 1 if any contract fails.
 */

import { chromium } from 'playwright';
import { loginWithCredentials } from '../qa/auth';
import { PAGE_CONTRACTS, runPageContracts, type ContractResult } from '../qa/registry';

const BASE   = process.env.QA_BASE_URL ?? 'http://localhost:5000';
const EMAIL  = process.env.QA_EMAIL!;
const PASS   = process.env.QA_PASSWORD!;
const CHROME = '/home/runner/workspace/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';

(async () => {
  console.log('\n\u2500\u2500\u2500 Page Contract Tests \u2500\u2500\u2500\n');

  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page    = await browser.newPage();

  // Authenticate
  const auth = await loginWithCredentials(page, EMAIL, PASS, BASE);
  if (!auth.success) {
    console.error(`\u274C Login failed: ${auth.error}`);
    await browser.close();
    process.exit(1);
  }
  console.log(`Authenticated: isManager=${auth.isManager}\n`);

  // Filter contracts by auth level
  const contracts = PAGE_CONTRACTS.filter(c => {
    if (c.requiresAuth && !auth.success) return false;
    if (c.requiresManager && !auth.isManager) return false;
    return true;
  });

  console.log(`Running ${contracts.length} page contracts...\n`);

  const results: ContractResult[] = await runPageContracts(
    page,
    BASE,
    contracts,
    msg => console.log(msg),
  );

  await browser.close();

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n\u2500\u2500 Contract Summary \u2500\u2500');
  console.log(`  Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.log(`  Failed: ${failed}\n`);
    for (const r of results.filter(r => !r.passed)) {
      console.error(`  \u274C ${r.contract} (${r.route})`);
      for (const f of r.failures) console.error(`      ${f}`);
    }
    console.error('\n\u274C Contract tests FAILED\n');
    process.exit(1);
  } else {
    console.log('\n\u2705 All contract tests PASSED\n');
    process.exit(0);
  }
})();
