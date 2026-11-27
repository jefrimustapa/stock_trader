const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('--- Starting Playwright E2E Test for Container Logs Viewer ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  const targetUrl = process.env.TARGET_URL || 'https://hom-408-stock-trader-beta.julietmike.net/#/logs';
  console.log(`Navigating to ${targetUrl}...`);

  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // 1. Verify Page Title / Header
  const titleText = await page.textContent('h5');
  console.log(`Header found: "${titleText}"`);
  if (!titleText || !titleText.includes('Container Logs Viewer')) {
    throw new Error(`Expected 'Container Logs Viewer' in header, got: ${titleText}`);
  }
  console.log('✓ Header verified: Container Logs Viewer');

  // 2. Verify all container selectors exist
  const bodyText = await page.textContent('body');
  for (const label of ['Bridge (L1-L4)', 'Daemon (L0)', 'Dashboard', 'OpenD']) {
    if (!bodyText.includes(label)) {
      throw new Error(`Expected container selector label '${label}' not found on page`);
    }
  }
  console.log('✓ All 4 service container selectors present');

  // 3. Verify log viewer console rendered lines
  const initialLinesCount = await page.locator('span:has-text("[INFO]"), span:has-text("[ERROR]"), span:has-text("[WARN]")').count();
  console.log(`Log level indicators detected in console: ${initialLinesCount}`);
  if (initialLinesCount === 0) {
    throw new Error('No log lines rendered in console');
  }
  console.log('✓ Console actively renders formatted log lines');

  // 4. Test Switching Container (click Daemon L0)
  console.log('Testing container switch to Daemon (L0)...');
  await page.click('text=Daemon (L0)');
  await page.waitForTimeout(2000);
  const daemonBody = await page.textContent('body');
  if (!daemonBody.includes('stock_screener_daemon')) {
    throw new Error('Container switch failed: stock_screener_daemon not active');
  }
  console.log('✓ Successfully switched container to stock_screener_daemon');

  // 5. Test Keyword Search Filter
  console.log('Testing keyword search filter...');
  const searchInput = page.locator('input[placeholder*="Filter by keyword"]');
  await searchInput.fill('screener');
  await page.waitForTimeout(1000);
  console.log('✓ Search input filled with "screener"');

  // 6. Test Level Filter (click ALL)
  await page.click('button:has-text("ALL")');
  await page.waitForTimeout(1000);

  // Clear search
  await searchInput.fill('');
  await page.waitForTimeout(1000);

  // 7. Capture Screenshot
  const screenshotPath = '/work/hom408_logs_viewer_verified.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`✓ Screenshot captured to ${screenshotPath}`);

  await browser.close();
  console.log('--- Playwright E2E Test Succeeded! ---');
})().catch((err) => {
  console.error('Playwright Test Failed:', err);
  process.exit(1);
});
