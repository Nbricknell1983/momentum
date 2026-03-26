import type { Page, ConsoleMessage, Request, Response } from 'playwright';
import type { NetworkError, RawIssue } from './types';

// ── Console error collector ───────────────────────────────────────────────────

export function attachConsoleCollector(page: Page): { getErrors: () => string[] } {
  const errors: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out known benign noise
      if (
        text.includes('favicon') ||
        text.includes('[vite]') ||
        text.includes('PostCSS') ||
        text.includes('ResizeObserver loop')
      ) return;
      errors.push(text);
    }
  });

  page.on('pageerror', (err: Error) => {
    errors.push(`[pageerror] ${err.message}`);
  });

  return { getErrors: () => [...errors] };
}

// ── Network failure collector ─────────────────────────────────────────────────

export function attachNetworkCollector(page: Page): { getErrors: () => NetworkError[] } {
  const errors: NetworkError[] = [];

  page.on('response', (res: Response) => {
    const status = res.status();
    const url = res.url();
    // Ignore expected non-errors and external noise
    if (status < 400) return;
    if (url.includes('favicon')) return;
    if (url.includes('hot-update')) return;
    if (url.includes('firebase') && status === 400) return; // Firebase auth polls can 400 safely
    errors.push({ url, status, method: res.request().method() });
  });

  page.on('requestfailed', (req: Request) => {
    const url = req.url();
    if (url.includes('favicon') || url.includes('hot-update')) return;
    errors.push({ url, status: 0, method: req.method() });
  });

  return { getErrors: () => [...errors] };
}

// ── Blank screen check ────────────────────────────────────────────────────────

export async function checkBlankScreen(page: Page): Promise<RawIssue | null> {
  try {
    const bodyText = await page.evaluate(() => document.body?.innerText?.trim() ?? '');
    const bodyHtml = await page.evaluate(() => document.body?.innerHTML?.length ?? 0);

    if (bodyHtml < 200 || bodyText.length < 10) {
      return {
        type: 'blank_screen',
        detail: `Page appears blank — body has ${bodyHtml} chars of HTML and ${bodyText.length} chars of visible text`,
      };
    }
  } catch { /* ignore */ }
  return null;
}

// ── React crash / error boundary check ───────────────────────────────────────

export async function checkReactCrash(page: Page): Promise<RawIssue | null> {
  try {
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    const crashPatterns = [
      'Something went wrong',
      'Unexpected Application Error',
      'Application error',
      'Error: Minified React error',
      'ChunkLoadError',
      'Cannot read properties of undefined',
      'Cannot read properties of null',
      'is not a function',
      'is not defined',
    ];
    for (const pattern of crashPatterns) {
      if (text.includes(pattern)) {
        return {
          type: 'react_crash',
          detail: `React crash pattern detected: "${pattern}"`,
          context: text.slice(0, 300),
        };
      }
    }
  } catch { /* ignore */ }
  return null;
}

// ── Stuck loading spinner check ───────────────────────────────────────────────

export async function checkStuckLoading(page: Page): Promise<RawIssue | null> {
  try {
    // Look for spinning loaders visible after 5 seconds
    const spinnerSelectors = [
      '[class*="animate-spin"]',
      '[class*="spinner"]',
      '[class*="loading"]',
      '[aria-label*="loading" i]',
      '[data-testid*="loading"]',
    ];

    for (const sel of spinnerSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        // Wait 1.5s and re-check — if still spinning, it's likely stuck
        await page.waitForTimeout(1500);
        const stillCount = await page.locator(sel).count();
        if (stillCount > 0) {
          return {
            type: 'stuck_loading',
            detail: `Potential stuck loading spinner detected: ${count} element(s) matching "${sel}"`,
          };
        }
      }
    }
  } catch { /* ignore */ }
  return null;
}

// ── Scroll check ─────────────────────────────────────────────────────────────

export async function scrollPage(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      await new Promise<void>(resolve => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 60);
        // Timeout failsafe at 3 seconds (down from 8)
        setTimeout(() => { clearInterval(timer); resolve(); }, 3000);
      });
    });
  } catch { /* ignore */ }
}

// ── Scroll lock check (after modal close) ────────────────────────────────────

export async function checkScrollLock(page: Page): Promise<RawIssue | null> {
  try {
    // First, press Escape to close any open dialogs/modals the runner may have opened
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Check if any Radix dialog is still open (open modals legitimately lock scroll)
    const dialogOpen = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"], [data-radix-dialog-content], [data-state="open"]');
      return dialogs.length > 0;
    });
    if (dialogOpen) return null; // Modal still open — scroll lock is expected

    const bodyOverflow = await page.evaluate(() => {
      const style = window.getComputedStyle(document.body);
      return { overflow: style.overflow, overflowY: style.overflowY };
    });

    const htmlOverflow = await page.evaluate(() => {
      const style = window.getComputedStyle(document.documentElement);
      return { overflow: style.overflow, overflowY: style.overflowY };
    });

    if (
      bodyOverflow.overflow === 'hidden' ||
      bodyOverflow.overflowY === 'hidden' ||
      htmlOverflow.overflow === 'hidden' ||
      htmlOverflow.overflowY === 'hidden'
    ) {
      return {
        type: 'scroll_lock',
        detail: `Body scroll appears locked after modal close — body: overflow=${bodyOverflow.overflow}, html: overflow=${htmlOverflow.overflow}`,
      };
    }
  } catch { /* ignore */ }
  return null;
}

// ── Clipped / off-screen UI check ────────────────────────────────────────────

export async function checkClippedUI(page: Page): Promise<RawIssue | null> {
  try {
    const viewport = page.viewportSize();
    if (!viewport) return null;

    const clipped = await page.evaluate((vp: { width: number; height: number }) => {
      const important = Array.from(
        document.querySelectorAll('main, [role="main"], header, nav, [data-testid]')
      );
      const clippedEls: string[] = [];

      for (const el of important.slice(0, 30)) {
        const rect = el.getBoundingClientRect();
        // Check if element is significantly off-screen to the right
        if (rect.right > vp.width + 50 && rect.width > 50) {
          const label = (el as HTMLElement).dataset?.testid
            || el.tagName.toLowerCase()
            + (el.className ? '.' + String(el.className).split(' ')[0] : '');
          clippedEls.push(`${label} (right=${Math.round(rect.right)}, vpWidth=${vp.width})`);
        }
      }
      return clippedEls;
    }, viewport);

    if (clipped.length > 0) {
      return {
        type: 'clipped_ui',
        detail: `UI elements appear clipped or off-screen: ${clipped.slice(0, 3).join(', ')}`,
      };
    }
  } catch { /* ignore */ }
  return null;
}

// ── Tab interaction check ─────────────────────────────────────────────────────

export async function clickVisibleTabs(page: Page): Promise<void> {
  try {
    // Click through tab triggers (shadcn, radix-style)
    const tabSelectors = [
      '[role="tab"]:not([data-state="active"])',
      '[data-testid*="tab"]',
    ];

    for (const sel of tabSelectors) {
      const tabs = page.locator(sel);
      const count = await tabs.count();
      // Click up to 3 tabs to sweep the interface (reduced from 4 for speed)
      for (let i = 0; i < Math.min(count, 3); i++) {
        try {
          await tabs.nth(i).click({ timeout: 1000 });
          await page.waitForTimeout(200);
        } catch { /* ignore individual tab failures */ }
      }
    }
  } catch { /* ignore */ }
}

// ── Safe button clicking ──────────────────────────────────────────────────────

export async function clickSafeButtons(page: Page): Promise<void> {
  // Only click clearly-safe buttons (refresh, close, cancel)
  // Reduced set to avoid clicking 'open'/'load' which can navigate away
  const safeLabels = ['refresh', 'close', 'cancel', 'collapse', 'expand'];
  try {
    for (const label of safeLabels) {
      const btn = page.locator(`button:has-text("${label}")`).first();
      const visible = await btn.isVisible().catch(() => false);
      if (visible) {
        await btn.click({ timeout: 800 }).catch(() => {});
        await page.waitForTimeout(150);
      }
    }
  } catch { /* ignore */ }
}

// ── Route failure check ───────────────────────────────────────────────────────

export async function checkRouteFailure(page: Page, expectedPath: string): Promise<RawIssue | null> {
  try {
    const currentUrl = page.url();
    let pathname = '';
    try {
      pathname = new URL(currentUrl).pathname;
    } catch { return null; }

    // Redirected to /login — auth gate or unknown route
    if (pathname === '/login' && expectedPath !== '/login') {
      return {
        type: 'route_failure',
        detail: `Route ${expectedPath} redirected to /login — auth gate or not found`,
      };
    }

    // Redirected to /dashboard from a different expected route — likely ManagerGate
    if (pathname === '/dashboard' && expectedPath !== '/dashboard') {
      return {
        type: 'route_failure',
        detail: `Route ${expectedPath} redirected to /dashboard — likely ManagerGate (user lacks manager access)`,
      };
    }

    // 404-like page
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    if (
      (bodyText.toLowerCase().includes('404') ||
       bodyText.toLowerCase().includes('page not found') ||
       bodyText.toLowerCase().includes('not found')) &&
      bodyText.length < 500 // only flag if it's mostly that text, not an app page that mentions 404 incidentally
    ) {
      return {
        type: 'route_failure',
        detail: `Route ${expectedPath} appears to be a 404 — page not found message visible`,
      };
    }
  } catch { /* ignore */ }
  return null;
}
