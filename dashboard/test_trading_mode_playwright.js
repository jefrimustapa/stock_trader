/**
 * test_trading_mode_playwright.js
 * End-to-End Playwright Verification for HOM-328:
 * Verification of TRADING_MODE Status Badge and Monitoring Display.
 * Runs in container playwright-inno-x via /paperclip/bin/pw-browser run
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TEST_URL || 'https://stock-trader.beta.julietmike.net';
const QA_DIR = '/qa';

if (!fs.existsSync(QA_DIR)) {
  fs.mkdirSync(QA_DIR, { recursive: true });
}

console.log('================================================================');
console.log('  HOM-328 Playwright E2E: TRADING_MODE Badge & Radar Verification');
console.log(`  Target: ${TARGET_URL}`);
console.log(`  QA Dir: ${QA_DIR}`);
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
    console.log('--- Desktop Viewport (1280 x 800) ---');
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 1. Navigate to Overview Dashboard
    await page.goto(`${TARGET_URL}/#/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 2. Check for Trading Mode Chip in Layout
    const chipText = await page.innerText('#chip-trading-mode');
    console.log(`  [Chip Content]: "${chipText}"`);
    assertCheck('Trading Mode Badge present on top bar', chipText.includes('MOD:'));
    assertCheck('Trading Mode Badge indicates DAY or SWING', 
      chipText.includes('MOD: DAY (INTRADAY)') || chipText.includes('MOD: SWING (MULTI-DAY)'));

    // 3. Take screenshot of Overview Page with Badge
    const screenshotOverview = path.join(QA_DIR, 'hom328_trading_mode_overview.png');
    await page.screenshot({ path: screenshotOverview, fullPage: false });
    console.log(`  [Screenshot Saved]: ${screenshotOverview}`);

    // 4. Navigate to L0 Screener Page
    await page.goto(`${TARGET_URL}/#/l0`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const l0Text = (await page.innerText('#page-l0')).toUpperCase();
    assertCheck('L0 Screener page renders monitoring card (Countdown / Radar)',
      l0Text.includes('IMBASAN L0 SCREENER') || l0Text.includes('RADAR PEMANTAUAN'));

    const screenshotL0 = path.join(QA_DIR, 'hom328_trading_mode_l0.png');
    await page.screenshot({ path: screenshotL0, fullPage: false });
    console.log(`  [Screenshot Saved]: ${screenshotL0}`);

    console.log('\n================================================================');
    console.log(`  Test Suite Completed: ${passedTests}/${totalTests} Passed`);
    console.log(`  Console Errors: ${consoleErrors.length}`);
    console.log('================================================================');

  } catch (err) {
    console.error('Test Suite Failed with Exception:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runSuite();
