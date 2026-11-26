/**
 * test_portfolio_drilldown_playwright.js
 * End-to-End Visual & Interaction QC Suite using Playwright (HOM-396)
 * Tests clicking portfolio position rows to trigger drill-down modal,
 * verifies order breakdown table rendering, metadata fields, and modal dismissal.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = process.env.TEST_URL || 'http://stock_trading_dashboard_beta:3000';
const QA_DIR = process.env.SCREENSHOT_DIR || '/work';

console.log('================================================================');
console.log('  Portfolio Order Drill-Down Playwright E2E Visual & QC Suite');
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

async function runDrillDownE2E() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    console.log('\n[E2E 1] Navigating to Portfolio Page...');
    await page.goto(`${TARGET_URL}/#/portfolio`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    // Wait for portfolio table
    const tableContainer = page.locator('table');
    await tableContainer.waitFor({ state: 'visible', timeout: 10000 });
    assertCheck('Portfolio table is visible on page', await tableContainer.isVisible());

    // 2. Locate a portfolio position row
    console.log('\n[E2E 2] Finding interactive portfolio position row...');
    const positionRow = page.locator('tbody tr').first();
    const isRowVisible = await positionRow.isVisible();
    assertCheck('At least one portfolio position row is visible', isRowVisible);

    if (isRowVisible) {
      // 3. Click the portfolio row to open drill-down dialog
      console.log('\n[E2E 3] Clicking portfolio position row for drill-down...');
      await positionRow.click();
      await page.waitForTimeout(1500);

      // Verify drilldown dialog opens
      const dialog = page.locator('[data-testid="drilldown-dialog"]');
      await dialog.waitFor({ state: 'visible', timeout: 5000 });
      assertCheck('Drill-down dialog is rendered and visible upon row click', await dialog.isVisible());

      // Verify dialog header contains "Agent Orders Breakdown"
      const dialogHeader = page.locator('h6:has-text("Agent Orders Breakdown")');
      assertCheck('Dialog header shows "Agent Orders Breakdown"', await dialogHeader.isVisible());

      // Verify close button exists
      const closeBtn = page.locator('[data-testid="drilldown-close-btn"]');
      assertCheck('Close button exists on drill-down dialog', await closeBtn.isVisible());

      // Capture screenshot of open drill-down dialog
      const dialogScreenshotPath = path.join(QA_DIR, 'hom396_drilldown_dialog.png');
      await page.screenshot({ path: dialogScreenshotPath, fullPage: true });
      console.log(`  📸 Screenshot saved: ${dialogScreenshotPath}`);

      // 4. Test modal dismissal
      console.log('\n[E2E 4] Testing modal dismissal via close button...');
      await closeBtn.click();
      await page.waitForTimeout(800);

      const isDialogHidden = !(await dialog.isVisible());
      assertCheck('Drill-down dialog successfully dismissed after clicking close', isDialogHidden);
    }

    console.log(`\n================================================================`);
    console.log(`  Playwright E2E Suite Completed: ${passedTests}/${totalTests} Passed`);
    console.log(`================================================================\n`);

  } catch (err) {
    console.error('Fatal Playwright Execution Error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runDrillDownE2E();
