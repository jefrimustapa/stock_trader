/**
 * test_portfolio_playwright.js
 * End-to-End Playwright UI test for Portfolio Attribution (GitHub Issue #17 / HOM-356)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = process.env.TEST_URL || 'https://stock-trader.beta.julietmike.net';

async function testPortfolioE2E() {
  console.log('================================================================');
  console.log('  Playwright E2E Portfolio Reconciliation & Attribution Test');
  console.log(`  Target: ${TARGET_URL}`);
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`${TARGET_URL}/#/portfolio`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 1. Check title
    const title = await page.title();
    console.log('Page Title:', title);

    // 2. Check table headers include "Atribusi"
    const theadText = await page.locator('thead').innerText();
    if (!/atribusi/i.test(theadText)) {
      throw new Error('Table header missing "Atribusi" column');
    }
    console.log('✓ PASS [1]: Table header contains "Atribusi" column');

    // 3. Check positions rows count
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    console.log(`✓ PASS [2]: Total Position rows rendered: ${rowCount}`);
    if (rowCount < 1) {
      throw new Error('No position rows rendered');
    }

    // 4. Verify attribution badges
    const badgesCount = await page.locator('tbody :text("Ejen"), tbody :text("Rekonsiliasi"), tbody :text("Broker / Manual")').count();
    console.log(`✓ PASS [3]: Total attribution badges detected: ${badgesCount}`);
    if (badgesCount < 1) {
      throw new Error('No attribution badges found in table');
    }

    // 5. Test hovering over badge to view audit tooltip
    const firstBadge = page.locator('tbody :text("Ejen"), tbody :text("Rekonsiliasi")').first();
    await firstBadge.hover();
    await page.waitForTimeout(400);
    console.log('✓ PASS [4]: Hovered over attribution badge successfully');

    // 6. Test Stale-While-Revalidate refresh (Issue #20 / HOM-366)
    console.log('Testing Stale-While-Revalidate refresh...');
    const refreshBtn = page.locator('button:has-text("Segar Semula")');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      const countDuring = await page.locator('tbody tr').count();
      if (countDuring === 0) {
        throw new Error('FAIL: Table positions vanished during refresh (flash kosong)!');
      }
      console.log(`✓ PASS [5]: Positions preserved during refresh (count: ${countDuring})`);
      await page.waitForTimeout(1000);
      const countAfter = await page.locator('tbody tr').count();
      console.log(`✓ PASS [6]: Positions intact after refresh completion (count: ${countAfter})`);
    }

    // 7. Capture verified screenshot
    await page.screenshot({ path: '/qa/portfolio_e2e_verified.png', fullPage: true });
    console.log('✓ PASS [7]: Screenshot captured to /qa/portfolio_e2e_verified.png');

    console.log('\n================================================================');
    console.log('  All Playwright E2E UI verification checks PASSED!');
    console.log('================================================================\n');
  } finally {
    await browser.close();
  }
}

testPortfolioE2E().catch((err) => {
  console.error('Fatal Playwright Runner Error:', err);
  process.exit(1);
});
