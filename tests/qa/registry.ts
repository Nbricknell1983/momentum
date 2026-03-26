/**
 * QA Page Contract Registry
 *
 * Defines structural contracts for key routes.
 * Each contract is a sequence of checks run after the page loads.
 * Contracts are lightweight — they don't require seed data unless noted.
 */

import type { Page } from 'playwright';

export type ContractResult = {
  contract: string;
  route: string;
  passed: boolean;
  failures: string[];
  durationMs: number;
};

export type ContractCheck = {
  name: string;
  run: (page: Page) => Promise<void>;
};

export type PageContract = {
  route: string;
  label: string;
  requiresAuth: boolean;
  requiresManager: boolean;
  /** Seed required before running (e.g. 'erica-leads') */
  requiresSeed?: string;
  checks: ContractCheck[];
};

// ── Helper: assert element is visible ─────────────────────────────────────────

async function assertVisible(page: Page, selector: string, label: string) {
  const el = await page.$(selector);
  if (!el) throw new Error(`${label}: element not found — ${selector}`);
  const visible = await el.isVisible();
  if (!visible) throw new Error(`${label}: element exists but is not visible — ${selector}`);
}

async function assertNotBlank(page: Page) {
  const text = await page.evaluate(() => document.body?.innerText?.trim() ?? '');
  if (text.length < 50) throw new Error(`Page appears blank (body text length: ${text.length})`);
}

async function assertNoReactCrash(page: Page) {
  const crashEl = await page.$('[data-reactroot] ~ div[id="root"]:empty, #root:empty');
  if (crashEl) throw new Error('React root appears empty — possible crash');
  const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
  if (bodyText.includes('Cannot read properties of undefined') || bodyText.includes('TypeError:')) {
    throw new Error(`React crash text found in page body`);
  }
}

// ── Contracts ─────────────────────────────────────────────────────────────────

export const PAGE_CONTRACTS: PageContract[] = [

  // ── Erica Selection Tab ───────────────────────────────────────────────────
  {
    route: '/erica',
    label: 'Erica Selection Tab',
    requiresAuth: true,
    requiresManager: true,
    checks: [
      {
        name: 'Page renders without crash',
        run: async (page) => {
          await assertNotBlank(page);
          await assertNoReactCrash(page);
        },
      },
      {
        name: 'Selection tab is accessible',
        run: async (page) => {
          const selTab = page.locator('[data-testid="tab-selection"], [value="selection"], button:has-text("Selection")').first();
          const visible = await selTab.isVisible().catch(() => false);
          if (!visible) throw new Error('Selection tab button not visible on /erica');
          await selTab.click();
          await page.waitForTimeout(800);
        },
      },
      {
        name: 'Leads and Clients sub-tabs are rendered',
        run: async (page) => {
          const leadsBtn = page.locator('[data-testid="erica-tab-leads"]');
          const visible = await leadsBtn.isVisible().catch(() => false);
          if (!visible) throw new Error('Erica Leads sub-tab not visible');
        },
      },
      {
        name: 'Lead count label is rendered (value may be 0 without seed)',
        run: async (page) => {
          const text = await page.evaluate(() => document.body.innerText);
          const hasLeadLabel = /Leads\s*\(\d+\)/.test(text);
          if (!hasLeadLabel) throw new Error('Could not find "Leads (N)" count label in page text');
        },
      },
      {
        name: 'Batch Name input is rendered in Create panel',
        run: async (page) => {
          // The input uses data-testid="input-batch-name" (placeholder is descriptive, not "Batch")
          const byTestId = page.locator('[data-testid="input-batch-name"]');
          const byPlaceholder = page.locator('input[placeholder*="Batch"], input[placeholder*="batch"]').first();
          const visible = await byTestId.isVisible().catch(() => false)
                       || await byPlaceholder.isVisible().catch(() => false);
          if (!visible) throw new Error('Batch name input not visible in Erica Create panel');
        },
      },
    ],
  },

  // ── Pipeline ──────────────────────────────────────────────────────────────
  {
    route: '/pipeline',
    label: 'Pipeline Board',
    requiresAuth: true,
    requiresManager: false,
    checks: [
      {
        name: 'Page renders without crash',
        run: async (page) => {
          await assertNotBlank(page);
          await assertNoReactCrash(page);
        },
      },
      {
        name: 'Sidebar is rendered',
        run: async (page) => {
          await assertVisible(page, '[data-sidebar="sidebar"]', 'Sidebar');
        },
      },
      {
        name: 'Stage or pipeline board element is visible',
        run: async (page) => {
          const text = await page.evaluate(() => document.body.innerText);
          const hasPipelineContent = text.includes('Pipeline') || text.includes('Leads') || text.includes('Stage');
          if (!hasPipelineContent) throw new Error('Pipeline page does not appear to have pipeline content');
        },
      },
    ],
  },

  // ── Focus View ───────────────────────────────────────────────────────────
  {
    route: '/focus',
    label: 'Focus View',
    requiresAuth: true,
    requiresManager: false,
    checks: [
      {
        name: 'Page renders without crash',
        run: async (page) => {
          await assertNotBlank(page);
          await assertNoReactCrash(page);
        },
      },
      {
        name: 'Sidebar is rendered',
        run: async (page) => {
          await assertVisible(page, '[data-sidebar="sidebar"]', 'Sidebar');
        },
      },
      {
        name: 'Primary focus content visible',
        run: async (page) => {
          const text = await page.evaluate(() => document.body.innerText);
          const hasFocusContent = text.includes('Focus') || text.includes('Today') || text.includes('Plan');
          if (!hasFocusContent) throw new Error('Focus view page has no recognisable focus content');
        },
      },
    ],
  },

  // ── Exec Dashboard ───────────────────────────────────────────────────────
  {
    route: '/exec',
    label: 'Exec Dashboard',
    requiresAuth: true,
    requiresManager: true,
    checks: [
      {
        name: 'Page renders without crash',
        run: async (page) => {
          await assertNotBlank(page);
          await assertNoReactCrash(page);
        },
      },
      {
        name: 'Dashboard tabs or KPIs visible',
        run: async (page) => {
          const text = await page.evaluate(() => document.body.innerText);
          const hasContent = text.includes('Pipeline') || text.includes('KPI') || text.includes('Revenue') || text.includes('Overview');
          if (!hasContent) throw new Error('Exec dashboard appears empty');
        },
      },
    ],
  },

  // ── My Work ──────────────────────────────────────────────────────────────
  {
    route: '/my-work',
    label: 'My Work Queue',
    requiresAuth: true,
    requiresManager: true,
    checks: [
      {
        name: 'Page renders without crash',
        run: async (page) => {
          await assertNotBlank(page);
          await assertNoReactCrash(page);
        },
      },
      {
        name: 'My Work heading or content visible',
        run: async (page) => {
          const text = await page.evaluate(() => document.body.innerText);
          const hasContent = text.includes('Work') || text.includes('Queue') || text.includes('Action');
          if (!hasContent) throw new Error('My Work page has no recognisable content');
        },
      },
    ],
  },
];

// ── Contract runner ───────────────────────────────────────────────────────────

export async function runPageContracts(
  page: Page,
  baseUrl: string,
  contracts: PageContract[],
  onProgress?: (msg: string) => void,
): Promise<ContractResult[]> {
  const results: ContractResult[] = [];

  for (const contract of contracts) {
    const failures: string[] = [];
    const start = Date.now();

    onProgress?.(`  Checking: ${contract.label} (${contract.route})`);

    try {
      await page.goto(`${baseUrl}${contract.route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      // Wait for sidebar to settle
      await page.waitForSelector('[data-sidebar="sidebar"]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
    } catch (e: any) {
      failures.push(`Navigation failed: ${e.message}`);
      results.push({ contract: contract.label, route: contract.route, passed: false, failures, durationMs: Date.now() - start });
      continue;
    }

    for (const check of contract.checks) {
      try {
        await check.run(page);
      } catch (e: any) {
        failures.push(`[${check.name}] ${e.message}`);
      }
    }

    results.push({
      contract: contract.label,
      route: contract.route,
      passed: failures.length === 0,
      failures,
      durationMs: Date.now() - start,
    });

    if (failures.length === 0) {
      onProgress?.(`    \u2705 All checks passed`);
    } else {
      for (const f of failures) onProgress?.(`    \u274C ${f}`);
    }
  }

  return results;
}
