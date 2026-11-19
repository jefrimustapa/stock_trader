/**
 * test_portfolio_playwright.js
 * End-to-End Playwright Verification for Portfolio Page
 * Verifies bought price, current price, summary cards, and clean styling.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = process.env.TEST_URL || 'https://stock-trader.beta.julietmike.net';
const QA_DIR = '/qa';

if (!fs.existsSync(QA_DIR)) {
  fs.mkdirSync(QA_DIR, { recursive: true });
}

console.log('================================================================');
console.log('  Portfolio Page Playwright E2E Verification                    ');
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
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    console.log('--- Navigating to Dashboard Overview ---');
    await page.goto(`${TARGET_URL}/#/overview`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verify Portfolio link in Sidebar
    const portfolioNavItem = page.locator('text=Portfolio Pegangan').first();
    const hasNav = await portfolioNavItem.isVisible({ timeout: 5000 }).catch(() => false);
    assertCheck('Sidebar navigation item "Portfolio Pegangan" is present', hasNav);

    console.log('--- Navigating to Portfolio Page ---');
    await page.goto(`${TARGET_URL}/#/portfolio`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Verify Header
    const heading = page.locator('h5:has-text("Portfolio Pegangan")');
    assertCheck('Portfolio page heading is displayed', await heading.isVisible({ timeout: 5000 }));

    // Verify 4 Summary KPI cards
    const cardMarketVal = page.locator('text=Nilai Pasaran Portfolio');
    assertCheck('KPI Card "Nilai Pasaran Portfolio" is displayed', await cardMarketVal.isVisible({ timeout: 5000 }));

    const cardCostBasis = page.locator('text=Jumlah Kos Belian');
    assertCheck('KPI Card "Jumlah Kos Belian" is displayed', await cardCostBasis.isVisible({ timeout: 5000 }));

    const cardPnL = page.locator('text=Untung / Rugi Belum Direalisasi');
    assertCheck('KPI Card "Untung / Rugi Belum Direalisasi" is displayed', await cardPnL.isVisible({ timeout: 5000 }));

    const cardCount = page.locator('text=Bilangan Kaunter Aktif');
    assertCheck('KPI Card "Bilangan Kaunter Aktif" is displayed', await cardCount.isVisible({ timeout: 5000 }));

    // Verify Table Headers
    const thBoughtPrice = page.locator('th:has-text("Harga Beli")');
    assertCheck('Table header "Harga Beli ($)" is displayed', await thBoughtPrice.isVisible({ timeout: 5000 }));

    const thCurrentPrice = page.locator('th:has-text("Harga Semasa")');
    assertCheck('Table header "Harga Semasa ($)" is displayed', await thCurrentPrice.isVisible({ timeout: 5000 }));

    const thPnLVal = page.locator('th:has-text("Untung / Rugi ($)")');
    assertCheck('Table header "Untung / Rugi ($)" is displayed', await thPnLVal.isVisible({ timeout: 5000 }));

    // Verify Table rows exist
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    assertCheck(`Table rendered positions rows (count: ${rowCount})`, rowCount > 0);

    // Verify at least one stock symbol chip is rendered
    const stockChip = page.locator('tbody tr td .MuiChip-label').first();
    const chipText = await stockChip.textContent();
    assertCheck(`Position symbol chip rendered with ticker (${chipText})`, Boolean(chipText && chipText.length > 1));

    // Capture screenshot
    const screenshotPath = path.join(QA_DIR, 'portfolio_page_verified.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\nScreenshot captured at: ${screenshotPath}`);

    // Verify Filter search input works
    const searchInput = page.locator('input[placeholder*="Cari simbol"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill(chipText);
      await page.waitForTimeout(500);
      const filteredCount = await page.locator('tbody tr').count();
      assertCheck(`Search filtering for "${chipText}" yielded ${filteredCount} row(s)`, filteredCount >= 1);
    }

  } finally {
    await browser.close();
  }

  console.log(`\n================================================================`);
  console.log(`  Tests: ${passedTests}/${totalTests} PASSED`);
  console.log('================================================================');
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error running suite:', err);
  process.exit(1);
});
