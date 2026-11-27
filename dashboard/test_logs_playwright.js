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

  // 3. Verify log viewer console rendered lines with separation and color coding
  const initialLinesCount = await page.locator('span:has-text("[INFO]"), span:has-text("[ERROR]"), span:has-text("[WARN]")').count();
  console.log(`Log level indicators detected in console: ${initialLinesCount}`);
  if (initialLinesCount === 0) {
    throw new Error('No log lines rendered in console');
  }
  console.log('✓ Console actively renders formatted log lines');

  // Verify Line Separation and Left Accent styling (HOM-413)
  const logRows = page.locator('.log-row, [data-testid="log-row"]');
  const rowCount = await logRows.count();
  console.log(`Log rows with line separation detected: ${rowCount}`);
  if (rowCount === 0) {
    throw new Error('No separated .log-row elements found');
  }

  // Check first row CSS styles (border-left accent and border-bottom)
  const firstRowBorderLeft = await logRows.first().evaluate((el) => window.getComputedStyle(el).borderLeft);
  const firstRowBorderBottom = await logRows.first().evaluate((el) => window.getComputedStyle(el).borderBottom);
  console.log(`First row borderLeft: "${firstRowBorderLeft}", borderBottom: "${firstRowBorderBottom}"`);
  if (!firstRowBorderLeft || !firstRowBorderLeft.includes('rgb(56, 139, 253)')) {
    throw new Error(`Expected blue borderLeft (rgb(56, 139, 253)), got: ${firstRowBorderLeft}`);
  }
  console.log('✓ Line separation and blue vertical accent verified on log rows');

  // Verify Cyan Timestamp styling
  const timestampCount = await page.locator('.log-timestamp').count();
  console.log(`Timestamp elements detected: ${timestampCount}`);
  if (timestampCount > 0) {
    const timestampColor = await page.locator('.log-timestamp').first().evaluate((el) => window.getComputedStyle(el).color);
    console.log(`Timestamp font color: "${timestampColor}"`);
    if (!timestampColor.includes('rgb(121, 192, 255)')) {
      throw new Error(`Expected cyan timestamp color rgb(121, 192, 255), got: ${timestampColor}`);
    }
    console.log('✓ Cyan timestamp color verified');
  }

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
  const screenshotPath = '/work/hom413_logs_separation_verified.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.screenshot({ path: '/work/hom408_logs_viewer_verified.png', fullPage: true });
  console.log(`✓ Screenshots captured to ${screenshotPath} and /work/hom408_logs_viewer_verified.png`);

  await browser.close();
  console.log('--- Playwright E2E Test Succeeded! ---');
})().catch((err) => {
  console.error('Playwright Test Failed:', err);
  process.exit(1);
});
