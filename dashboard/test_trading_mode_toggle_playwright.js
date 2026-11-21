/**
 * test_trading_mode_toggle_playwright.js
 * End-to-End Playwright Verification for HOM-351 (Rev 5):
 * Mode switching exclusively in Settings page; Header mode badge strictly read-only.
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
console.log('  HOM-351 Playwright E2E: Read-Only Header & Settings Toggle   ');
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

    // 2. Check for Trading Mode Badge (Read-Only)
    const badgeSelector = '#chip-trading-mode';
    await page.waitForSelector(badgeSelector, { timeout: 10000 });

    let initialBadgeText = await page.innerText(badgeSelector);
    console.log(`  [Initial Header Badge]: "${initialBadgeText}"`);
    assertCheck('Trading Mode Badge is visible on Header', initialBadgeText.includes('MOD:'));

    // 3. Verify toggle button has been removed from Header
    const headerToggleBtn = await page.$('#btn-toggle-trading-mode');
    assertCheck('Header toggle button #btn-toggle-trading-mode is NOT present on Header', headerToggleBtn === null);

    // 4. Verify Header Badge is non-interactive (read-only)
    const cursorStyle = await page.$eval(badgeSelector, (el) => window.getComputedStyle(el).cursor);
    console.log(`  [Header Badge Cursor Style]: "${cursorStyle}"`);
    assertCheck('Header badge cursor is "default" (non-interactive)', cursorStyle === 'default' || cursorStyle === 'auto');

    // Click on header badge to ensure no state change happens
    await page.click(badgeSelector);
    await page.waitForTimeout(1000);
    const postClickBadgeText = await page.innerText(badgeSelector);
    assertCheck('Clicking Header badge does NOT trigger mode toggle', postClickBadgeText === initialBadgeText);

    // Screenshot initial state
    const ss1 = path.join(QA_DIR, 'hom351_trading_mode_01_day.png');
    await page.screenshot({ path: ss1, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ss1}`);

    // 5. Mobile Layout & Responsive Check (375 x 667)
    console.log('\n2. Testing Mobile Responsive Layout (375 x 667)...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);

    const mobileMenuBtn = await page.waitForSelector('#btn-mobile-menu', { timeout: 10000 });
    const mobileBadge = await page.waitForSelector(badgeSelector, { timeout: 10000 });

    const menuBox = await mobileMenuBtn.boundingBox();
    const badgeBox = await mobileBadge.boundingBox();

    console.log(`  [Mobile Menu Bounding Box]: x=${menuBox.x}, width=${menuBox.width}`);
    console.log(`  [Mobile Badge Bounding Box]: x=${badgeBox.x}, width=${badgeBox.width}`);

    assertCheck('Mobile menu button and header badge do NOT overlap', (menuBox.x + menuBox.width) <= badgeBox.x);

    const mobileBadgeText = await page.innerText(badgeSelector);
    console.log(`  [Mobile Header Badge Text]: "${mobileBadgeText}"`);
    assertCheck('Mobile Header badge displays compact label', mobileBadgeText.length <= 15);

    // Screenshot mobile view
    const ssMobile = path.join(QA_DIR, 'hom351_trading_mode_02_mobile.png');
    await page.screenshot({ path: ssMobile, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ssMobile}`);

    // Restore desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(1000);

    // 6. Navigate to Settings -> Capital & Risk tab and verify exclusive toggle and interval details
    console.log('\n3. Navigating to Settings tab for mode switching & interval checks...');
    await page.click('#nav-item-settings');
    await page.waitForTimeout(1000);
    await page.click('#tab-capital-risk');
    await page.waitForTimeout(1500);

    const settingsToggleSelector = '#btn-settings-toggle-trading-mode';
    await page.waitForSelector(settingsToggleSelector, { timeout: 10000 });

    // Verify monitoring interval descriptions on Settings page (Rev 6)
    const settingsPageText = await page.innerText('body');
    assertCheck(
      'Settings page contains DAY monitoring interval detail',
      settingsPageText.includes('Interval Pemantauan: Setiap 5 minit (300s) semasa pasaran aktif')
    );
    assertCheck(
      'Settings page contains SWING monitoring interval detail',
      settingsPageText.includes('Interval Pemantauan: Kitaran 4H / Harian (09:00, 13:00, 16:30 NY) + semakan adaptif 1H')
    );

    // Ensure we start from DAY mode in Settings
    let currentSettingsChip = await page.innerText('#chip-settings-trading-mode');
    console.log(`  [Current Settings Chip]: "${currentSettingsChip}"`);
    if (currentSettingsChip.includes('SWING')) {
      console.log('  Normalizing initial Settings state to DAY...');
      await page.click(settingsToggleSelector);
      await page.waitForTimeout(2500);
      currentSettingsChip = await page.innerText('#chip-settings-trading-mode');
    }
    assertCheck('Settings mode initialized to DAY', currentSettingsChip.includes('DAY'));

    // 7. Click Settings toggle button to switch to SWING
    console.log('\n4. Switching mode to SWING via Settings toggle button...');
    await page.click(settingsToggleSelector);
    await page.waitForTimeout(2500);

    const swingHeaderBadge = await page.innerText(badgeSelector);
    const swingSettingsChip = await page.innerText('#chip-settings-trading-mode');
    console.log(`  [Header Badge After Settings Toggle]: "${swingHeaderBadge}"`);
    console.log(`  [Settings Chip After Settings Toggle]: "${swingSettingsChip}"`);

    assertCheck('Header Badge updates dynamically to SWING', swingHeaderBadge.includes('SWING'));
    assertCheck('Settings Card updates to SWING', swingSettingsChip.includes('SWING'));

    // Screenshot SWING state in Settings
    const ss3 = path.join(QA_DIR, 'hom351_trading_mode_03_settings_swing.png');
    await page.screenshot({ path: ss3, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ss3}`);

    // 8. Reload page to verify persistence across sessions
    console.log('\n5. Reloading page to verify persistence across sessions...');
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const reloadedHeaderBadge = await page.innerText(badgeSelector);
    console.log(`  [Header Badge After Reload]: "${reloadedHeaderBadge}"`);
    assertCheck('SWING mode persists across page reload', reloadedHeaderBadge.includes('SWING'));

    // 9. Switch back to DAY via Settings toggle button
    console.log('\n6. Restoring mode to DAY via Settings toggle button...');
    await page.click('#nav-item-settings');
    await page.waitForTimeout(1000);
    await page.click('#tab-capital-risk');
    await page.waitForTimeout(1500);

    await page.click(settingsToggleSelector);
    await page.waitForTimeout(2500);

    const restoredHeaderBadge = await page.innerText(badgeSelector);
    const restoredSettingsChip = await page.innerText('#chip-settings-trading-mode');
    console.log(`  [Header Badge Restored]: "${restoredHeaderBadge}"`);
    console.log(`  [Settings Chip Restored]: "${restoredSettingsChip}"`);

    assertCheck('Header Badge successfully restored to DAY', restoredHeaderBadge.includes('DAY'));
    assertCheck('Settings Chip successfully restored to DAY', restoredSettingsChip.includes('DAY'));

    // Screenshot final DAY state restored
    const ss4 = path.join(QA_DIR, 'hom351_trading_mode_04_day_restored.png');
    await page.screenshot({ path: ss4, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ss4}`);

    // 10. Verify Portfolio page: OpenD chip removed from page header
    console.log('\n7. Navigating to Portfolio page to verify OpenD header chip is removed...');
    await page.click('#nav-item-portfolio');
    await page.waitForTimeout(1500);

    const portfolioPageText = await page.innerText('body');
    // Header should not contain OpenD chip
    const portfolioHeaderArea = await page.$('h5'); // Portfolio Pegangan
    const portfolioHeaderParent = await page.evaluate(() => {
      const h5 = Array.from(document.querySelectorAll('h5')).find(el => el.textContent.includes('Portfolio Pegangan'));
      return h5 && h5.parentElement ? h5.parentElement.innerText : '';
    });
    console.log(`  [Portfolio Header Area Text]: "${portfolioHeaderParent.replace(/\n/g, ' ')}"`);
    assertCheck('Portfolio page header does NOT contain OpenD chip', !portfolioHeaderParent.includes('OpenD:'));

    const ssPortfolio = path.join(QA_DIR, 'hom351_portfolio_opend_removed.png');
    await page.screenshot({ path: ssPortfolio, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ssPortfolio}`);

    // 11. Verify Agents page: Redundant L0 -> L1 -> L2 -> L3 -> L4 chip removed from pipeline header
    console.log('\n8. Navigating to Agents page to verify L0->L4 pipeline chip is removed...');
    await page.click('#nav-item-agents');
    await page.waitForTimeout(1500);

    const pipelineHeaderHasChip = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('h6, .MuiTypography-subtitle1'));
      const pipelineTitle = titles.find(el => el.textContent.includes('Trading Pipeline Flow'));
      if (!pipelineTitle || !pipelineTitle.parentElement) return false;
      return pipelineTitle.parentElement.innerText.includes('L0 → L1 → L2 → L3 → L4');
    });
    console.log(`  [Pipeline Header Has L0->L4 Chip]: ${pipelineHeaderHasChip}`);
    assertCheck('Pipeline header does NOT contain redundant L0->L4 chip', !pipelineHeaderHasChip);

    const ssAgents = path.join(QA_DIR, 'hom351_agents_chip_removed.png');
    await page.screenshot({ path: ssAgents, fullPage: false });
    console.log(`  [Screenshot Saved]: ${ssAgents}`);

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
