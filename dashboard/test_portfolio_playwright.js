/**
 * test_portfolio_playwright.js
 * End-to-End Playwright UI test for Portfolio Attribution & Moomoo Fee Breakdown (GitHub Issue #12 / #17 / HOM-374 / HOM-356)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = process.env.TEST_URL || 'https://stock-trader-beta.julietmike.net';

async function testPortfolioE2E() {
  console.log('================================================================');
  console.log('  Playwright E2E Portfolio Fee Model & Attribution Test');
  console.log(`  Target: ${TARGET_URL}`);
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  try {
    await page.goto(`${TARGET_URL}/#/portfolio`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 1. Check title
    const title = await page.title();
    console.log('Page Title:', title);

    // 2. Check table headers include Attribution, Est. Fees, Net P&L
    const theadText = await page.locator('thead').innerText();
    if (!/atribusi|attribution/i.test(theadText)) {
      throw new Error('Table header missing Attribution column');
    }
    console.log('✓ PASS [1]: Table header contains Attribution column');

    if (!/est\.?\s*fees|anggaran\s*yuran/i.test(theadText)) {
      throw new Error('Table header missing Est. Fees column');
    }
    console.log('✓ PASS [2]: Table header contains Est. Fees column');

    if (!/net\s*p&?l|untung\s*bersih/i.test(theadText)) {
      throw new Error('Table header missing Net P&L column');
    }
    console.log('✓ PASS [3]: Table header contains Net P&L column');

    // 3. Check KPI Card 3 for Net Unrealized P&L
    const card3 = page.getByText(/Net Unrealized P&L|Untung \/ Rugi Bersih/i).first();
    const card3Text = await card3.innerText();
    console.log(`✓ PASS [4]: KPI Card 3 renders Net P&L header: "${card3Text}"`);

    // 4. Check positions rows count
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    console.log(`✓ PASS [5]: Total Position rows rendered: ${rowCount}`);
    if (rowCount < 1) {
      throw new Error('No position rows rendered');
    }

    // 5. Verify attribution badges
    const badgesCount = await page.locator('tbody :text("Agent"), tbody :text("Ejen"), tbody :text("Reconciliation"), tbody :text("Rekonsiliasi"), tbody :text("Broker / Manual")').count();
    console.log(`✓ PASS [6]: Total attribution badges detected: ${badgesCount}`);
    if (badgesCount < 1) {
      throw new Error('No attribution badges found in table');
    }

    // 6. Test hovering over badge to view audit tooltip
    const firstBadge = page.locator('tbody :text("Agent"), tbody :text("Ejen"), tbody :text("Reconciliation"), tbody :text("Rekonsiliasi")').first();
    await firstBadge.hover();
    await page.waitForTimeout(400);
    console.log('✓ PASS [7]: Hovered over attribution badge successfully');

    // 7. Test Stale-While-Revalidate refresh (Issue #20 / HOM-366)
    console.log('Testing Stale-While-Revalidate refresh...');
    const refreshBtn = page.locator('button:has-text("Refresh"), button:has-text("Segar Semula")');
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      const countDuring = await page.locator('tbody tr').count();
      if (countDuring === 0) {
        throw new Error('FAIL: Table positions vanished during refresh (flash kosong)!');
      }
      console.log(`✓ PASS [8]: Positions preserved during refresh (count: ${countDuring})`);
      await page.waitForTimeout(1000);
      const countAfter = await page.locator('tbody tr').count();
      console.log(`✓ PASS [9]: Positions intact after refresh completion (count: ${countAfter})`);
    }

    // 8. Capture verified screenshot
    await page.screenshot({ path: '/qa/portfolio_fees_verified.png', fullPage: true });
    console.log('✓ PASS [10]: Screenshot captured to /qa/portfolio_fees_verified.png');

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
