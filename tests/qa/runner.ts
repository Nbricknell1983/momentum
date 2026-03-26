import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
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

// Network hosts to suppress — external services that produce false positives
const NOISE_HOSTS = [
  'googleapis.com',
  'identitytoolkit.googleapis.com',
  'firebaseio.com',
  'firebase.googleapis.com',
  'firestore.googleapis.com',
  'accounts.google.com',
  'sentry.io',
  'analytics.google.com',
  'hot-update',
  'favicon',
  '__webpack',
  'sockjs',
];

function isNoisyUrl(url: string): boolean {
  return NOISE_HOSTS.some(h => url.includes(h));
}

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

      // Create ONE context for all authenticated route passes
      const authCtx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      const authLoginPage = await authCtx.newPage();

      const authResult = await loginWithCredentials(
        authLoginPage,
        config.qaEmail,
        config.qaPassword,
        config.baseUrl,
      );

      if (authResult.success) {
        authenticated = true;
        isManager = authResult.isManager;
        log(`✅  Authenticated — isManager=${isManager}`);

        // ── Use one persistent page per viewport to stay authenticated ──────
        for (const vp of VIEWPORTS) {
          log(`\n📐  Running ${vp.name} pass (${vp.width}×${vp.height})...`);

          // Create one persistent page for this viewport sweep
          // Use `let` so we can swap to a recovery page if the browser crashes mid-route
          let activePage = await authCtx.newPage();
          await activePage.setViewportSize({ width: vp.width, height: vp.height });

          for (const route of routes) {
            if (!route.requiresAuth) continue;
            if (route.requiresManager && !isManager) {
              allResults.push(skipped(route, vp.name));
              continue;
            }
            if (config.skipRoutes.includes(route.path)) {
              allResults.push(skipped(route, vp.name));
              continue;
            }

            let result: RouteResult;
            try {
              result = await testRouteOnPage(activePage, route, vp.name, config);
            } catch (outerErr: any) {
              // Browser/page crashed mid-route — record error, then recover with a fresh page
              log(`  ⚠️  ${route.label} (${vp.name}) — browser crash, recovering...`);
              result = {
                route,
                viewport: vp.name,
                status: 'error',
                loadTimeMs: 0,
                consoleErrors: [],
                networkErrors: [],
                rawIssues: [{ type: 'render_error', detail: `Browser crash on ${route.path}: ${outerErr?.message ?? String(outerErr)}` }],
              };
              try {
                await activePage.close().catch(() => {});
                activePage = await authCtx.newPage();
                await activePage.setViewportSize({ width: vp.width, height: vp.height });
                const reAuth = await loginWithCredentials(activePage, config.qaEmail!, config.qaPassword!, config.baseUrl);
                if (reAuth.success) {
                  log(`     ↩️  Recovery OK — continuing sweep`);
                } else {
                  log(`     ❌  Recovery auth failed — remaining routes may show errors`);
                }
              } catch {
                log(`     ❌  Recovery failed — continuing without page reset`);
              }
            }
            allResults.push(result);
            log(
              `  ${statusIcon(result.status)} ${route.label} (${vp.name}) — ` +
              `${result.rawIssues.length + result.consoleErrors.length + result.networkErrors.length} issues`,
            );
          }

          await activePage.close().catch(() => {});
        }

        await authLoginPage.close();
      } else {
        log(`❌  Authentication failed: ${authResult.error}`);
        log('    Continuing with unauthenticated routes only...');
      }

      await authCtx.close();
    } else {
      log('⚠️   No QA_EMAIL/QA_PASSWORD provided — testing unauthenticated routes only');
    }

    // ── Unauthenticated routes (always tested) ──────────────────────────────
    log('\n🌐  Running unauthenticated route checks...');
    const unauthRoutes = routes.filter(r => !r.requiresAuth);

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();

      for (const route of unauthRoutes) {
        if (config.skipRoutes.includes(route.path)) continue;
        const result = await testRouteOnPage(page, route, vp.name, config);
        allResults.push(result);
        log(`  ${statusIcon(result.status)} ${route.label} (${vp.name})`);
      }

      await page.close();
      await ctx.close();
    }

    return { authenticated, isManager, results: allResults };
  } finally {
    await browser?.close();
  }
}

/**
 * Test a single route on an already-open page.
 * The page is reused across routes to preserve Firebase auth state.
 * Collectors are freshly created per route by wrapping the page listeners.
 */
async function testRouteOnPage(
  page: Page,
  route: RouteDefinition,
  viewport: 'desktop' | 'mobile',
  config: QAConfig,
): Promise<RouteResult> {
  const startTime = Date.now();

  // Per-route collectors — only capture events AFTER navigation starts
  const consoleErrors: string[] = [];
  const networkErrors: { url: string; status: number; method: string }[] = [];

  const consoleHandler = (msg: any) => {
    if (msg.type() !== 'error') return;
    const text: string = msg.text();
    if (
      text.includes('favicon') ||
      text.includes('[vite]') ||
      text.includes('PostCSS') ||
      text.includes('ResizeObserver loop') ||
      isNoisyUrl(text)
    ) return;
    consoleErrors.push(text);
  };

  const responseHandler = (res: any) => {
    const status = res.status();
    const url = res.url();
    if (status < 400) return;
    if (isNoisyUrl(url)) return;
    networkErrors.push({ url, status, method: res.request().method() });
  };

  const requestFailHandler = (req: any) => {
    const url = req.url();
    if (isNoisyUrl(url)) return;
    networkErrors.push({ url, status: 0, method: req.method() });
  };

  const pageErrorHandler = (err: Error) => {
    if (!isNoisyUrl(err.message)) {
      consoleErrors.push(`[pageerror] ${err.message}`);
    }
  };

  page.on('console', consoleHandler);
  page.on('response', responseHandler);
  page.on('requestfailed', requestFailHandler);
  page.on('pageerror', pageErrorHandler);

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
    const url = `${config.baseUrl}${route.path}`;

    // Navigate to the route
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.pageTimeout });

    // Wait for sidebar to be visible — this confirms the app is fully loaded
    // (Sidebar only renders after Firebase auth + membership + leads/clients all ready)
    try {
      await page.waitForSelector('[data-sidebar="sidebar"]', { timeout: 15000 });
    } catch {
      // No sidebar — could be a route failure or unauthenticated page
    }

    // Extra settle time for Firestore data to populate
    await page.waitForTimeout(800);

    // Check if we got redirected (route failure)
    const routeFailure = await checkRouteFailure(page, route.path);
    if (routeFailure) {
      result.rawIssues.push(routeFailure);
      result.status = 'error';
      // No point in running further checks on a redirect
      result.loadTimeMs = Date.now() - startTime;
      result.consoleErrors = [...consoleErrors];
      result.networkErrors = [...networkErrors];
      await takeScreenshot(page, route, viewport, result);
      return result;
    }

    // Content checks
    const blank = await checkBlankScreen(page);
    if (blank) { result.rawIssues.push(blank); result.status = 'error'; }

    const crash = await checkReactCrash(page);
    if (crash) { result.rawIssues.push(crash); result.status = 'error'; }

    // Scroll through the page
    await scrollPage(page);

    // Check for stuck loading spinner
    const stuck = await checkStuckLoading(page);
    if (stuck) { result.rawIssues.push(stuck); result.status = 'error'; }

    // Click through visible tabs
    await clickVisibleTabs(page);
    await page.waitForTimeout(150);

    // Click safe buttons (non-destructive)
    await clickSafeButtons(page);
    await page.waitForTimeout(150);

    // Check scroll lock (after any modal interactions)
    const scrollLock = await checkScrollLock(page);
    if (scrollLock) { result.rawIssues.push(scrollLock); result.status = 'error'; }

    // Check for clipped UI (desktop only)
    if (viewport === 'desktop') {
      const clipped = await checkClippedUI(page);
      if (clipped) { result.rawIssues.push(clipped); result.status = 'error'; }
    }

    result.loadTimeMs = Date.now() - startTime;
    result.consoleErrors = [...consoleErrors];
    result.networkErrors = [...networkErrors];

    if (result.consoleErrors.length > 0 || result.networkErrors.length > 0) {
      result.status = 'error';
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await takeScreenshot(page, route, viewport, result);

    return result;
  } catch (err: any) {
    result.status = 'error';
    result.loadTimeMs = Date.now() - startTime;
    result.consoleErrors = [...consoleErrors];
    result.networkErrors = [...networkErrors];
    result.rawIssues.push({
      type: 'render_error',
      detail: `Playwright error on ${route.path}: ${err?.message ?? String(err)}`,
    });
    return result;
  } finally {
    // Always remove listeners to avoid accumulating handlers across routes
    page.off('console', consoleHandler);
    page.off('response', responseHandler);
    page.off('requestfailed', requestFailHandler);
    page.off('pageerror', pageErrorHandler);
  }
}

async function takeScreenshot(
  page: Page,
  route: RouteDefinition,
  viewport: 'desktop' | 'mobile',
  result: RouteResult,
): Promise<void> {
  try {
    const screenshotName = `${viewport}-${route.path.replace(/\//g, '-')}-${Date.now()}.jpeg`;
    const screenshotPath = join(SCREENSHOTS_DIR, screenshotName);
    await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 80, fullPage: false });
    result.screenshotPath = screenshotPath;
  } catch { /* ignore screenshot failures */ }
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
