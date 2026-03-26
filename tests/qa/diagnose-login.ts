import { chromium } from 'playwright';

const CHROME = '/home/runner/workspace/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome';
const EMAIL = process.env.QA_EMAIL!;
const PASS  = process.env.QA_PASSWORD!;
const BASE  = 'http://localhost:5000';

(async () => {
  const br = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await br.newPage();

  const consoleMsgs: string[] = [];
  page.on('console', m => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleMsgs.push(`[pageerror] ${e.message}`));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const emailEl = await page.$('[data-testid="input-signin-email"]');
  const passEl  = await page.$('[data-testid="input-signin-password"]');
  const btnEl   = await page.$('[data-testid="button-signin"]');
  console.log(`email input found: ${!!emailEl}`);
  console.log(`pass input found:  ${!!passEl}`);
  console.log(`signin btn found:  ${!!btnEl}`);

  if (emailEl) await emailEl.fill(EMAIL);
  if (passEl)  await passEl.fill(PASS);
  if (btnEl) {
    await btnEl.click();
    console.log('Clicked signin');
  }

  // Poll for URL change every 2 seconds for 30 seconds
  let urlChanged = false;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log(`  t=${i*2+2}s: URL=${url}`);
    if (!url.includes('/login')) { urlChanged = true; break; }
    // Print any new console messages
    while (consoleMsgs.length > 0) console.log(' ', consoleMsgs.shift());
  }

  if (!urlChanged) {
    console.log('\nFinal URL still /login after 30s');
    const body = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('Body:', body);
  }

  while (consoleMsgs.length > 0) console.log(' ', consoleMsgs.shift());
  await br.close();
})().catch(e => { console.error(e.message); process.exit(1); });
