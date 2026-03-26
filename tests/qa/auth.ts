import type { Page } from 'playwright';

export interface AuthResult {
  success: boolean;
  isManager: boolean;
  error?: string;
}

/**
 * Authenticate via the Momentum login page using email/password.
 * Uses data-testid selectors to target the correct form fields.
 */
export async function loginWithCredentials(
  page: Page,
  email: string,
  password: string,
  baseUrl: string,
): Promise<AuthResult> {
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // Wait for the login card to render
    await page.waitForSelector('[data-testid="input-signin-email"]', { timeout: 15000 });

    // Make sure the Sign In tab is active (it is by default, but click it to be sure)
    const signinTab = page.locator('[data-testid="tab-signin"]').first();
    if (await signinTab.isVisible().catch(() => false)) {
      await signinTab.click();
      await page.waitForTimeout(300);
    }

    // Fill email using the specific testid
    await page.locator('[data-testid="input-signin-email"]').fill(email);
    await page.waitForTimeout(200);

    // Fill password using the specific testid
    await page.locator('[data-testid="input-signin-password"]').fill(password);
    await page.waitForTimeout(200);

    // Click the submit Sign In button (not the tab) using its specific testid
    await page.locator('[data-testid="button-signin"]').click();

    // Wait up to 20 seconds for redirect to dashboard
    try {
      await page.waitForURL(`${baseUrl}/dashboard`, { timeout: 20000 });
    } catch {
      // Check if 2FA screen appeared
      const is2FA = await page.locator('[data-testid="input-2fa-code"]').isVisible().catch(() => false);
      if (is2FA) {
        return {
          success: false,
          isManager: false,
          error: '2FA is required — QA cannot proceed past a 2FA gate. Disable 2FA for the QA user account.',
        };
      }

      const currentUrl = page.url();
      const bodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');

      // Check for auth error toast
      const toastText = await page.locator('[role="alert"], [data-testid*="toast"]').textContent().catch(() => '');

      if (!currentUrl.includes('/dashboard')) {
        return {
          success: false,
          isManager: false,
          error: `Login did not redirect to /dashboard. URL: ${currentUrl}. Toast: ${toastText.slice(0, 200)}`,
        };
      }
    }

    // Wait for the Momentum app shell to fully hydrate:
    // After Firebase auth, the app goes through up to 3 loading screens:
    //   1. "Verifying access..." (membership check)
    //   2. "Loading pipeline..." (Firestore leads/clients sync)
    //   3. Then renders the sidebar
    // This can take up to 40 seconds on first load with real data.

    // First check for "access not set up" screen
    await page.waitForTimeout(3000);
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    if (bodyText.includes('Access not yet set up') || bodyText.includes("isn't linked to an organisation")) {
      return {
        success: false,
        isManager: false,
        error: 'Account is not linked to an organisation. This account cannot access the app.',
      };
    }

    // Now wait for the actual sidebar to appear (data-sidebar="sidebar" is the shadcn selector)
    await page.waitForSelector('[data-sidebar="sidebar"]', { timeout: 45000 });

    // Extra wait for Firestore listeners to settle
    await page.waitForTimeout(2000);

    // Detect manager-level access by checking nav links
    const isManager = await page.evaluate(() => {
      const allText = document.body?.innerHTML ?? '';
      return (
        allText.includes('/exec') ||
        allText.includes('/cadence') ||
        allText.includes('/execution') ||
        allText.includes('/erica')
      );
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
 * Wait for the loading spinner to disappear after navigation.
 */
export async function waitForAuthReady(page: Page, timeoutMs = 8000): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const loaders = document.querySelectorAll('[class*="animate-spin"]');
        // Allow up to 1 spinner (the sidebar pulse) — block if many
        return loaders.length < 2;
      },
      { timeout: timeoutMs },
    );
  } catch { /* page may not have a loading state */ }
}
