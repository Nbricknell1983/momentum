import type { Page } from 'playwright';

export interface AuthResult {
  success: boolean;
  isManager: boolean;
  error?: string;
}

/**
 * Authenticate via the Momentum login page using email/password.
 * Returns success status and whether the user appears to have manager access.
 */
export async function loginWithCredentials(
  page: Page,
  email: string,
  password: string,
  baseUrl: string,
): Promise<AuthResult> {
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 20000 });

    // Wait for the login form to appear
    await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', {
      timeout: 10000,
    });

    // Fill email
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
    await emailInput.fill(email);

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(password);

    // Click sign-in button
    const signInBtn = page
      .locator('button:has-text("Sign In"), button:has-text("Log In"), button[type="submit"]')
      .first();
    await signInBtn.click();

    // Wait for redirect — either to /dashboard or showing an error
    try {
      await page.waitForURL(`${baseUrl}/dashboard`, { timeout: 15000 });
    } catch {
      // Check if 2FA screen is shown
      const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
      if (bodyText.includes('verification') || bodyText.includes('2FA') || bodyText.includes('code')) {
        return {
          success: false,
          isManager: false,
          error: '2FA is required — QA cannot proceed past a 2FA gate. Disable 2FA for the QA user or provide a bypass.',
        };
      }

      const currentUrl = page.url();
      if (!currentUrl.includes('/dashboard')) {
        const errText = bodyText.slice(0, 200);
        return {
          success: false,
          isManager: false,
          error: `Login did not redirect to /dashboard. Current URL: ${currentUrl}. Page text: ${errText}`,
        };
      }
    }

    // Wait for the sidebar to be visible (confirms full auth hydration)
    await page.waitForSelector('nav, [role="navigation"], aside', { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Detect manager access by checking for manager nav items
    const isManager = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href], [data-testid*="nav"]'));
      const hrefs = links.map(l => (l as HTMLAnchorElement).href || '').join(' ');
      return hrefs.includes('/exec') || hrefs.includes('/cadence') || hrefs.includes('/execution');
    });

    return { success: true, isManager };
  } catch (err: any) {
    return {
      success: false,
      isManager: false,
      error: err?.message ?? String(err),
    };
  }
}

/**
 * Wait for auth state to be ready after navigating.
 * Momentum shows a loading state while Firebase auth initialises.
 */
export async function waitForAuthReady(page: Page, timeoutMs = 8000): Promise<void> {
  try {
    // Wait for the loading overlay to disappear (if present)
    await page.waitForFunction(
      () => {
        const loaders = document.querySelectorAll('[class*="animate-spin"], [aria-label*="loading" i]');
        return loaders.length === 0;
      },
      { timeout: timeoutMs },
    );
  } catch { /* ignore — page may not have a loading state */ }
}
