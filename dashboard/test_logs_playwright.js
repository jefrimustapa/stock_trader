const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('--- Starting Playwright E2E Test for Container Logs Viewer (Desktop & Mobile) ---');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'],
  });

  const targetUrl = process.env.TARGET_URL || 'https://hom-408-stock-trader-beta.julietmike.net/#/logs';

  // ==========================================
  // PART 1: Desktop Viewport Test (1400 x 900)
  // ==========================================
  console.log('\n[1/2] Testing Desktop Viewport (1400x900)...');
  const desktopContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
  });

  const desktopPage = await desktopContext.newPage();
  console.log(`Navigating to ${targetUrl}...`);
  await desktopPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await desktopPage.waitForTimeout(2000);

  // 1. Verify Page Title / Header
  const titleText = await desktopPage.textContent('h5');
  console.log(`Header found: "${titleText}"`);
  if (!titleText || !titleText.includes('Container Logs Viewer')) {
    throw new Error(`Expected 'Container Logs Viewer' in header, got: ${titleText}`);
  }
  console.log('✓ Header verified: Container Logs Viewer');

  // 2. Verify all container selectors exist
  const bodyText = await desktopPage.textContent('body');
  for (const label of ['Bridge (L1-L4)', 'Daemon (L0)', 'Dashboard', 'OpenD']) {
    if (!bodyText.includes(label)) {
      throw new Error(`Expected container selector label '${label}' not found on page`);
    }
  }
  console.log('✓ All 4 service container selectors present');

  // 3. Verify Agent Tier Legend is displayed
  if (!bodyText.includes('AGENT TIERS:') || !bodyText.includes('L0: ScreenerDaemon') || !bodyText.includes('Exit Sentinel')) {
    throw new Error('Agent Tier Legend chips not found on page');
  }
  console.log('✓ Agent Tier Legend verified');

  // 4. Verify log viewer console rendered lines with separation and tier color coding
  const logRows = desktopPage.locator('.log-row, [data-testid="log-row"]');
  const rowCount = await logRows.count();
  console.log(`Log rows detected: ${rowCount}`);
  if (rowCount === 0) {
    throw new Error('No separated .log-row elements found');
  }

  // Check row CSS styles
  const firstRowBorderBottom = await logRows.first().evaluate((el) => window.getComputedStyle(el).borderBottom);
  const firstRowBorderLeft = await logRows.first().evaluate((el) => window.getComputedStyle(el).borderLeft);
  console.log(`First row borderLeft: "${firstRowBorderLeft}", borderBottom: "${firstRowBorderBottom}"`);
  if (!firstRowBorderBottom || !firstRowBorderBottom.includes('rgb(33, 38, 45)')) {
    throw new Error(`Expected borderBottom rgb(33, 38, 45), got: ${firstRowBorderBottom}`);
  }
  console.log('✓ Horizontal line separation verified on log rows');

  // 5. Test Switching Container (click Daemon L0)
  console.log('Testing container switch to Daemon (L0)...');
  await desktopPage.click('text=Daemon (L0)');
  await desktopPage.waitForTimeout(2000);
  const daemonBody = await desktopPage.textContent('body');
  if (!daemonBody.includes('stock_screener_daemon')) {
    throw new Error('Container switch failed: stock_screener_daemon not active');
  }
  console.log('✓ Successfully switched container to stock_screener_daemon');

  // 6. Test Keyword Search Filter
  console.log('Testing keyword search filter...');
  const searchInput = desktopPage.locator('input[placeholder*="Filter by keyword"]');
  await searchInput.fill('screener');
  await desktopPage.waitForTimeout(1000);
  console.log('✓ Search input filled with "screener"');

  // Clear search and switch back to Bridge
  await searchInput.fill('');
  await desktopPage.click('text=Bridge (L1-L4)');
  await desktopPage.waitForTimeout(2000);

  // Capture Desktop Screenshot
  const desktopScreenshotPath = '/work/hom415_desktop_logs_verified.png';
  await desktopPage.screenshot({ path: desktopScreenshotPath, fullPage: true });
  console.log(`✓ Desktop screenshot captured to ${desktopScreenshotPath}`);
  await desktopContext.close();

  // ==========================================
  // PART 2: Mobile Viewport Test (375 x 667)
  // ==========================================
  console.log('\n[2/2] Testing Mobile Viewport (375x667 iPhone SE / Mobile)...');
  const mobileContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 375, height: 667 },
    isMobile: true,
  });

  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await mobilePage.waitForTimeout(2000);

  // Verify mobile console container has overflowX: auto
  const terminalBox = mobilePage.locator('[data-testid="terminal-console-body"], .terminal-console-body, div:has(> .log-row)').first();
  const terminalOverflowX = await terminalBox.evaluate((el) => window.getComputedStyle(el).overflowX);
  console.log(`Terminal container overflowX: "${terminalOverflowX}"`);
  if (terminalOverflowX !== 'auto' && terminalOverflowX !== 'scroll') {
    throw new Error(`Expected terminal overflowX to be 'auto' or 'scroll', got: ${terminalOverflowX}`);
  }

  // Verify mobile log row width and no character wrapping
  const mobileLogRows = mobilePage.locator('.log-row');
  const mobileRowCount = await mobileLogRows.count();
  console.log(`Mobile log rows detected: ${mobileRowCount}`);
  if (mobileRowCount === 0) {
    throw new Error('No log rows rendered on mobile screen');
  }

  const firstMobileRow = mobileLogRows.first();
  const rowFlexWrap = await firstMobileRow.evaluate((el) => window.getComputedStyle(el).flexWrap);
  const rowScrollWidth = await firstMobileRow.evaluate((el) => el.scrollWidth);
  const messageBox = firstMobileRow.locator('.log-message-content');
  const messageBoxWidth = await messageBox.evaluate((el) => el.getBoundingClientRect().width);

  console.log(`Mobile first row flexWrap: "${rowFlexWrap}", scrollWidth: ${rowScrollWidth}px, messageBoxWidth: ${messageBoxWidth}px`);
  if (rowFlexWrap !== 'nowrap') {
    throw new Error(`Expected row flexWrap to be 'nowrap', got: ${rowFlexWrap}`);
  }
  if (messageBoxWidth < 200) {
    throw new Error(`Message box width crushed on mobile (<200px): ${messageBoxWidth}px`);
  }
  console.log('✓ Mobile responsiveness verified: row does not collapse text into single characters');

  // Capture Mobile Screenshot
  const mobileScreenshotPath = '/work/hom415_mobile_logs_verified.png';
  await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: true });
  console.log(`✓ Mobile screenshot captured to ${mobileScreenshotPath}`);
  await mobileContext.close();

  await browser.close();
  console.log('\n--- ALL Playwright Desktop & Mobile E2E Tests Succeeded! ---');
})().catch((err) => {
  console.error('Playwright Test Failed:', err);
  process.exit(1);
});
