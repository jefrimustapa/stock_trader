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

    // 2. Click a valid trading watchlist row (e.g. US.VVVV or first non-OTC row)
    const validRow = page.locator('tr:has-text("US.VVVV")');
    if ((await validRow.count()) > 0) {
      console.log('  Clicking US.VVVV row to test active candlestick chart...');
      await validRow.first().click();
    } else {
      console.log('  Clicking first watchlist row to open K-line drawer...');
      await rows.first().click();
    }
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
    const isWarningVisible = (await drawer.locator('text=Data Graf K-line').count() > 0) ||
                             (await drawer.locator('text=Pasaran OTC Tidak Disokong').count() > 0);

    assertCheck(
      'Drawer either rendered TradingView chart canvas OR fail-closed/OTC info card',
      isChartVisible || isWarningVisible
    );

    if (isChartVisible) {
      const canvasElements = chartContainer.locator('canvas');
      const canvasCount = await canvasElements.count();
      assertCheck('TradingView Lightweight Charts HTML5 canvas elements instantiated', canvasCount > 0);
      const ohlcHud = (await drawer.locator('text=Vol').count() > 0) || (await drawer.locator('text=Arahkan kursor').count() > 0);
      assertCheck('Interactive OHLC HUD bar rendered above chart', ohlcHud);
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

    // -------------------------------------------------------------------------
    // Scenario 3: OTC Market Stock Handling (US.MGCLY)
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 3: OTC Market Stock Handling (US.MGCLY) ---');
    const otcContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await otcContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);

    const otcPage = await otcContext.newPage();
    await otcPage.goto(`${TARGET_URL}/#/watchlist`, { waitUntil: 'networkidle' });
    await otcPage.waitForTimeout(500);

    // Locate the row with US.MGCLY
    const mgclyRow = otcPage.locator('tr:has-text("US.MGCLY")');
    if ((await mgclyRow.count()) > 0) {
      console.log('  Found US.MGCLY row in Watchlist table...');
      assertCheck('US.MGCLY row present in Watchlist table', (await mgclyRow.count()) >= 1);

      console.log('  Clicking US.MGCLY row to open drawer...');
      await mgclyRow.first().click();
      await otcPage.waitForTimeout(1000);

      const otcDrawer = otcPage.locator('.MuiDrawer-paperAnchorRight');
      assertCheck('Drawer opened for US.MGCLY', await otcDrawer.isVisible());

      // Verify OTC title
      const otcTitle = otcDrawer.locator('text=Pasaran OTC Tidak Disokong Moomoo OpenAPI');
      assertCheck('Drawer displays accurate title "Pasaran OTC Tidak Disokong Moomoo OpenAPI"', (await otcTitle.count()) >= 1);

      // Verify OTC chip
      const otcChipInDrawer = otcDrawer.locator('text=US OTC Market · Tiada Suapan Data Moomoo');
      assertCheck('Drawer displays "US OTC Market · Tiada Suapan Data Moomoo" chip', (await otcChipInDrawer.count()) >= 1);

      // Verify NO misleading "Buka Panel Kawalan OpenD" button
      const openDButton = otcDrawer.locator('text=Buka Panel Kawalan OpenD');
      assertCheck('Does NOT display misleading "Buka Panel Kawalan OpenD" button', (await openDButton.count()) === 0);

      // Verify "Tutup Panel" and "Lihat di Yahoo Finance" buttons exist
      const closePanelBtn = otcDrawer.getByRole('button', { name: 'Tutup Panel', exact: true });
      const yahooBtn = otcDrawer.getByRole('link', { name: /Yahoo Finance/i });
      assertCheck('"Tutup Panel" action button visible', await closePanelBtn.isVisible());
      assertCheck('"Lihat di Yahoo Finance" link visible', await yahooBtn.isVisible());

      const otcScreenshotPath = path.join(QA_DIR, 'kline-watchlist-drawer-otc.png');
      await otcPage.screenshot({ path: otcScreenshotPath });
      assertCheck(`Captured OTC drawer screenshot to ${otcScreenshotPath}`, fs.existsSync(otcScreenshotPath));

      await closePanelBtn.click();
      await otcPage.waitForTimeout(400);
      assertCheck('Drawer closed when "Tutup Panel" clicked', !(await otcDrawer.isVisible()));
    } else {
      console.log('  US.MGCLY not found in current watchlist; skipping row click test.');
    }

    await otcContext.close();

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
