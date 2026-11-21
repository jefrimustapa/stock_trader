/**
 * test_trading_mode_toggle_playwright.js
 * End-to-End Playwright Verification for HOM-351:
 * Interactive TRADING_MODE Toggle (Day vs Swing) via Dashboard Header & Settings.
 * Executed via /paperclip/bin/pw-browser run
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TEST_URL || 'https://stock-trader-beta.julietmike.net';
const QA_DIR = '/qa';

if (!fs.existsSync(QA_DIR)) {
  try {
    fs.mkdirSync(QA_DIR, { recursive: true });
  } catch (_) {}
}

console.log('================================================================');
console.log('  HOM-351 Playwright E2E: TRADING_MODE Interactive Toggle Test  ');
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
    console.log('1. Navigating to Dashboard...');
    await page.goto(`${TARGET_URL}/#/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 2. Check for Trading Mode Badge and Toggle Button
    const badgeSelector = '#chip-trading-mode';
    const toggleBtnSelector = '#btn-toggle-trading-mode';

    await page.waitForSelector(badgeSelector, { timeout: 10000 });
    await page.waitForSelector(toggleBtnSelector, { timeout: 10000 });

    let initialBadgeText = await page.innerText(badgeSelector);
    console.log(`  [Initial Badge]: "${initialBadgeText}"`);
    assertCheck('Trading Mode Badge is visible on Header', initialBadgeText.includes('MOD:'));

    // If currently SWING, toggle once to ensure starting from DAY
    if (initialBadgeText.includes('SWING')) {
      console.log('  Normalizing initial mode to DAY by clicking toggle...');
      await page.click(toggleBtnSelector);
      await page.waitForTimeout(2000);
      initialBadgeText = await page.innerText(badgeSelector);
      console.log(`  [Normalized Badge]: "${initialBadgeText}"`);
    }

    assertCheck('Badge is in DAY mode initially: "MOD: DAY (INTRADAY)"', initialBadgeText.includes('DAY'));

    // Screenshot initial DAY state
    const ss1 = path.join(QA_DIR, 'hom351_trading_mode_01_day.png');
    await page.screenshot({ path: ss1, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ss1}`);

    // 3. User clicks toggle button to switch to SWING
    console.log('\n2. Clicking #btn-toggle-trading-mode to switch to SWING...');
    await page.click(toggleBtnSelector);
    await page.waitForTimeout(2500);

    const swingBadgeText = await page.innerText(badgeSelector);
    console.log(`  [After Click 1 Badge]: "${swingBadgeText}"`);
    assertCheck('Badge updates to "MOD: SWING (MULTI-DAY)"', swingBadgeText.includes('MOD: SWING (MULTI-DAY)'));

    // Screenshot SWING state
    const ss2 = path.join(QA_DIR, 'hom351_trading_mode_02_swing.png');
    await page.screenshot({ path: ss2, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ss2}`);

    // 4. Reload page to verify persistence across sessions
    console.log('\n3. Reloading page to verify persistence across sessions...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const reloadedBadgeText = await page.innerText(badgeSelector);
    console.log(`  [After Reload Badge]: "${reloadedBadgeText}"`);
    assertCheck('SWING mode persists across page reload', reloadedBadgeText.includes('MOD: SWING (MULTI-DAY)'));

    // 5. Navigate to Settings -> Capital & Risk tab and verify settings card & toggle
    console.log('\n4. Navigating to Settings tab to verify settings card...');
    await page.click('#nav-item-settings');
    await page.waitForTimeout(1000);
    await page.click('#tab-capital-risk');
    await page.waitForTimeout(1500);

    const settingsToggleSelector = '#btn-settings-toggle-trading-mode';
    await page.waitForSelector(settingsToggleSelector, { timeout: 10000 });

    const settingsChipText = await page.innerText('#chip-settings-trading-mode');
    console.log(`  [Settings Chip Content]: "${settingsChipText}"`);
    assertCheck('Settings Card displays active mode SWING', settingsChipText.includes('SWING'));

    // Screenshot Settings Card in SWING mode
    const ss3 = path.join(QA_DIR, 'hom351_trading_mode_03_settings_swing.png');
    await page.screenshot({ path: ss3, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ss3}`);

    // 6. Click settings toggle button to switch back to DAY
    console.log('\n5. Clicking #btn-settings-toggle-trading-mode in Settings tab to switch back to DAY...');
    await page.click(settingsToggleSelector);
    await page.waitForTimeout(2500);

    const finalBadgeText = await page.innerText(badgeSelector);
    const finalSettingsChipText = await page.innerText('#chip-settings-trading-mode');
    console.log(`  [Header Badge After Settings Toggle]: "${finalBadgeText}"`);
    console.log(`  [Settings Chip After Settings Toggle]: "${finalSettingsChipText}"`);

    assertCheck('Badge returns to "MOD: DAY (INTRADAY)"', finalBadgeText.includes('MOD: DAY (INTRADAY)'));
    assertCheck('Settings Chip returns to "MOD: DAY (INTRADAY)"', finalSettingsChipText.includes('DAY'));

    // Screenshot final DAY state in Settings
    const ss4 = path.join(QA_DIR, 'hom351_trading_mode_04_day_restored.png');
    await page.screenshot({ path: ss4, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ss4}`);

    console.log('\n================================================================');
    console.log(`  E2E Test Suite Completed: ${passedTests}/${totalTests} Passed`);
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
