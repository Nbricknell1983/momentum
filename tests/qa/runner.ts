import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';
import type { QAConfig, RouteDefinition, RouteResult } from './types';
import {
  attachConsoleCollector,
  attachNetworkCollector,
  checkBlankScreen,
  checkReactCrash,
  checkStuckLoading,
  checkScrollLock,
  checkClippedUI,
  checkRouteFailure,
  scrollPage,
  clickVisibleTabs,
  clickSafeButtons,
} from './checks';
import { loginWithCredentials, waitForAuthReady } from './auth';

const SCREENSHOTS_DIR = join(process.cwd(), 'tests', 'qa', 'screenshots');

export type ViewportPreset = { width: number; height: number; name: 'desktop' | 'mobile' };

const VIEWPORTS: ViewportPreset[] = [
  { width: 1280, height: 800, name: 'desktop' },
  { width: 390, height: 844, name: 'mobile' },
];

export interface RunnerResult {
  authenticated: boolean;
  isManager: boolean;
  results: RouteResult[];
}

export async function runQASweep(
  routes: RouteDefinition[],
  config: QAConfig,
  onProgress?: (msg: string) => void,
): Promise<RunnerResult> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const log = onProgress ?? ((msg: string) => console.log(msg));

  let browser: Browser | null = null;
  let authenticated = false;
  let isManager = false;
  const allResults: RouteResult[] = [];

  try {
    log('🚀  Launching browser...');
    browser = await chromium.launch({
      headless: config.headless,
      slowMo: config.slowMo,
    });

    // ── Auth pass ───────────────────────────────────────────────────────────
    if (config.qaEmail && config.qaPassword) {
      log(`🔐  Authenticating as ${config.qaEmail}...`);
      const authCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const authPage = await authCtx.newPage();

      const authResult = await loginWithCredentials(
        authPage,
        config.qaEmail,
        config.qaPassword,
        config.baseUrl,
      );

      if (authResult.success) {
        authenticated = true;
        isManager = authResult.isManager;
        log(`✅  Authenticated — isManager=${isManager}`);

        // ── Run desktop + mobile passes with authenticated context ──────────
        for (const vp of VIEWPORTS) {
          log(`\n📐  Running ${vp.name} pass (${vp.width}×${vp.height})...`);

          for (const route of routes) {
            if (!route.requiresAuth) continue; // skip public routes on auth pass
            if (route.requiresManager && !isManager) {
              allResults.push(skipped(route, vp.name));
              continue;
            }
            if (config.skipRoutes.includes(route.path)) {
              allResults.push(skipped(route, vp.name));
              continue;
            }

            const page = await authCtx.newPage();
            await page.setViewportSize({ width: vp.width, height: vp.height });

            const result = await testRoute(page, route, vp.name, config);
            allResults.push(result);
            log(`  ${statusIcon(result.status)} ${route.label} (${vp.name}) — ${result.rawIssues.length + result.consoleErrors.length + result.networkErrors.length} issues`);

            await page.close();
          }
        }

        await authCtx.close();
      } else {
        log(`❌  Authentication failed: ${authResult.error}`);
        log('    Continuing with unauthenticated routes only...');
      }
    } else {
      log('⚠️   No QA_EMAIL/QA_PASSWORD provided — testing unauthenticated routes only');
    }

    // ── Unauthenticated routes (always tested) ──────────────────────────────
    log('\n🌐  Running unauthenticated route checks...');
    const unauthRoutes = routes.filter(r => !r.requiresAuth);

    for (const vp of VIEWPORTS) {
      for (const route of unauthRoutes) {
        if (config.skipRoutes.includes(route.path)) continue;
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await ctx.newPage();

        const result = await testRoute(page, route, vp.name, config);
        allResults.push(result);
        log(`  ${statusIcon(result.status)} ${route.label} (${vp.name})`);

        await page.close();
        await ctx.close();
      }
    }

    return { authenticated, isManager, results: allResults };
  } finally {
    await browser?.close();
  }
}

async function testRoute(
  page: Page,
  route: RouteDefinition,
  viewport: 'desktop' | 'mobile',
  config: QAConfig,
): Promise<RouteResult> {
  const startTime = Date.now();
  const { getErrors: getConsoleErrors } = attachConsoleCollector(page);
  const { getErrors: getNetworkErrors } = attachNetworkCollector(page);

  const result: RouteResult = {
    route,
    viewport,
    status: 'ok',
    loadTimeMs: 0,
    consoleErrors: [],
    networkErrors: [],
    rawIssues: [],
    screenshotPath: undefined,
  };

  try {
    // Navigate
    const url = `${config.baseUrl}${route.path}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.pageTimeout });

    // Wait for network to settle
    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}),
      page.waitForTimeout(5000),
    ]);

    await waitForAuthReady(page);

    // Check for route failure (redirect to login)
    const routeFailure = await checkRouteFailure(page, route.path);
    if (routeFailure) {
      result.rawIssues.push(routeFailure);
      result.status = 'error';
    }

    // Generic content checks
    const blank = await checkBlankScreen(page);
    if (blank) { result.rawIssues.push(blank); result.status = 'error'; }

    const crash = await checkReactCrash(page);
    if (crash) { result.rawIssues.push(crash); result.status = 'error'; }

    // Scroll the page
    await scrollPage(page);

    // Check for stuck loading
    const stuck = await checkStuckLoading(page);
    if (stuck) { result.rawIssues.push(stuck); result.status = 'error'; }

    // Click through visible tabs
    await clickVisibleTabs(page);
    await page.waitForTimeout(500);

    // Click safe buttons
    await clickSafeButtons(page);
    await page.waitForTimeout(400);

    // Check for scroll lock after any modal interactions
    const scrollLock = await checkScrollLock(page);
    if (scrollLock) { result.rawIssues.push(scrollLock); result.status = 'error'; }

    // Check for clipped UI (desktop only — mobile is expected to scroll)
    if (viewport === 'desktop') {
      const clipped = await checkClippedUI(page);
      if (clipped) { result.rawIssues.push(clipped); result.status = 'error'; }
    }

    // Scroll back to top for screenshot
    await page.evaluate(() => window.scrollTo(0, 0));

    // Take screenshot
    const screenshotName = `${viewport}-${route.path.replace(/\//g, '-')}-${Date.now()}.jpeg`;
    const screenshotPath = join(SCREENSHOTS_DIR, screenshotName);
    await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 80, fullPage: false });
    result.screenshotPath = screenshotPath;

    result.loadTimeMs = Date.now() - startTime;
    result.consoleErrors = getConsoleErrors();
    result.networkErrors = getNetworkErrors();

    if (result.consoleErrors.length > 0 || result.networkErrors.length > 0) {
      result.status = 'error';
    }

    return result;
  } catch (err: any) {
    result.status = 'error';
    result.loadTimeMs = Date.now() - startTime;
    result.consoleErrors = getConsoleErrors();
    result.networkErrors = getNetworkErrors();
    result.rawIssues.push({
      type: 'render_error',
      detail: `Playwright error navigating to ${route.path}: ${err?.message ?? String(err)}`,
    });
    return result;
  }
}

function skipped(route: RouteDefinition, viewport: 'desktop' | 'mobile'): RouteResult {
  return {
    route,
    viewport,
    status: 'skipped',
    loadTimeMs: 0,
    consoleErrors: [],
    networkErrors: [],
    rawIssues: [],
  };
}

function statusIcon(status: string): string {
  if (status === 'ok') return '✅';
  if (status === 'error') return '⚠️ ';
  return '⏭️ ';
}
