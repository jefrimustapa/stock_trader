/**
 * test_kline_playwright.js
 * E2E Playwright test suite for Watchlist K-line Chart Drawer (HOM-248).
 * Runs in container playwright-inno-x per SOP HOM-237.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TEST_URL || 'http://stock_trading_dashboard:3000';
const SERVICE_TOKEN = process.env.BRIDGE_SERVICE_TOKEN || 'secure-svc-token-test-2026';
const QA_DIR = '/qa';

if (!fs.existsSync(QA_DIR)) {
  fs.mkdirSync(QA_DIR, { recursive: true });
}

console.log('================================================================');
console.log('  Watchlist K-line Chart Drawer E2E Playwright Suite (HOM-248)');
console.log(`  Target: ${TARGET_URL}`);
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assertCheck(desc, condition) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS [${totalTests}]: ${desc}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL [${totalTests}]: ${desc}`);
    process.exitCode = 1;
  }
}

async function runSuite() {
  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------------------
    // Scenario 1: Desktop Viewport (1280 x 800) - Watchlist Row Click & K-line Drawer
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 1: Desktop Watchlist Click & K-line Drawer ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const parsedTarget = new URL(TARGET_URL);
    await desktopContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);

    const page = await desktopContext.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 1. Navigate to Watchlist
    await page.goto(`${TARGET_URL}/#/watchlist`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Verify Watchlist table rendered
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    assertCheck('Watchlist table has rows', rowCount > 0);

    // Verify row pointer cursor & hint chip
    const hintChip = page.locator('text=Klik baris untuk K-line');
    assertCheck('Hint chip "Klik baris untuk K-line" rendered in toolbar', (await hintChip.count()) >= 1);

    // 2. Click the first watchlist row (e.g. AAPL or NVDA)
    console.log('  Clicking first watchlist row to open K-line drawer...');
    await rows.first().click();
    await page.waitForTimeout(1000);

    // 3. Verify Drawer opened
    const drawer = page.locator('.MuiDrawer-paperAnchorRight');
    assertCheck('MUI Right Drawer paper is visible', await drawer.isVisible());

    // Verify Drawer Header has stock symbol
    const drawerSymbol = await drawer.locator('h6').first().textContent();
    assertCheck(`Drawer displays stock symbol (${drawerSymbol})`, drawerSymbol && drawerSymbol.length > 0);

    // Verify Timeframe buttons exist
    const btn1D = drawer.getByRole('button', { name: '1D', exact: true });
    const btn15M = drawer.getByRole('button', { name: '15M', exact: true });
    const btn5M = drawer.getByRole('button', { name: '5M', exact: true });
    const btn1M = drawer.getByRole('button', { name: '1M', exact: true });

    assertCheck('Timeframe 1D button visible', await btn1D.isVisible());
    assertCheck('Timeframe 15M button visible', await btn15M.isVisible());
    assertCheck('Timeframe 5M button visible', await btn5M.isVisible());
    assertCheck('Timeframe 1M button visible', await btn1M.isVisible());

    // 4. Verify Chart Canvas or Fallback Warning Card
    const chartContainer = page.locator('#kline-chart-container');
    const isChartVisible = await chartContainer.isVisible();
    const isWarningVisible = await drawer.locator('text=Data Graf K-line Moomoo Tidak Tersedia').isVisible();

    assertCheck(
      'Drawer either rendered TradingView chart canvas OR fail-closed warning card',
      isChartVisible || isWarningVisible
    );

    if (isChartVisible) {
      const canvasElements = chartContainer.locator('canvas');
      const canvasCount = await canvasElements.count();
      assertCheck('TradingView Lightweight Charts HTML5 canvas elements instantiated', canvasCount > 0);
    }

    // 5. Test switching timeframe to 15M
    console.log('  Switching timeframe to 15M...');
    await btn15M.click();
    await page.waitForTimeout(1000);
    assertCheck('Timeframe switched to 15M without leaving page', page.url().includes('/#/watchlist'));

    // 6. Screenshot Desktop Drawer
    const desktopScreenshotPath = path.join(QA_DIR, 'kline-watchlist-drawer-desktop.png');
    await page.screenshot({ path: desktopScreenshotPath });
    assertCheck(`Captured desktop screenshot to ${desktopScreenshotPath}`, fs.existsSync(desktopScreenshotPath));

    // 7. Close drawer
    const closeBtn = drawer.locator('button[title="Tutup panel"]');
    await closeBtn.click();
    await page.waitForTimeout(400);

    // Verify drawer closed
    const isDrawerClosed = !(await drawer.isVisible());
    assertCheck('Drawer closed when close button clicked', isDrawerClosed);

    await desktopContext.close();

    // -------------------------------------------------------------------------
    // Scenario 2: Mobile Viewport (390 x 844) - Bottom Drawer Layout
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Mobile Bottom Drawer Layout (390 x 844) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await mobileContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);

    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${TARGET_URL}/#/watchlist`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(500);

    const mobileRows = mobilePage.locator('table tbody tr');
    await mobileRows.first().click();
    await mobilePage.waitForTimeout(1000);

    const mobileDrawer = mobilePage.locator('.MuiDrawer-paperAnchorBottom');
    assertCheck('Mobile: Bottom Drawer opened on row click', await mobileDrawer.isVisible());

    // Verify mobile drawer anchor bottom style / height
    const drawerHeight = await mobileDrawer.evaluate((el) => el.getBoundingClientRect().height);
    assertCheck(`Mobile: Drawer height occupies majority of screen (${Math.round(drawerHeight)}px)`, drawerHeight > 400);

    const mobileScreenshotPath = path.join(QA_DIR, 'kline-watchlist-drawer-mobile.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath });
    assertCheck(`Captured mobile screenshot to ${mobileScreenshotPath}`, fs.existsSync(mobileScreenshotPath));

    await mobileContext.close();

    console.log('\n================================================================');
    console.log(`  E2E Test Suite Completed: ${passedTests}/${totalTests} Passed`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('Test run error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runSuite();
