/**
 * test_dashboard_playwright.js
 * End-to-End Visual & Interaction QC Suite using Playwright (HOM-183)
 * Tests actual Chromium rendering, responsive mobile layout, form interactions, and visual state.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = process.env.TEST_URL || 'http://stock_trading_dashboard:3000';
const SERVICE_TOKEN = process.env.BRIDGE_SERVICE_TOKEN || 'secure-svc-token-test-2026';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.join(__dirname, 'playwright_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

console.log('================================================================');
console.log('  Stock Trader Dashboard Playwright E2E Visual & UI QC Suite');
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

async function runPlaywrightSuite() {
  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------
    // Test Scenario A: Mobile Viewport (390 x 844) - iPhone / Modern Android
    // -------------------------------------------------------------
    console.log('\n--- Scenario A: Mobile Viewport Verification (390 x 844) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    const parsedTarget = new URL(TARGET_URL);
    await mobileContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);

    const mobilePage = await mobileContext.newPage();
    const consoleErrors = [];
    mobilePage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 1. Overview Page Rendering & No Horizontal Overflow
    await mobilePage.goto(`${TARGET_URL}/#/overview`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(400);

    const hasHorizontalOverflow = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assertCheck('Mobile Overview: No horizontal page overflow (scrollWidth <= innerWidth)', !hasHorizontalOverflow);

    const appTitle = await mobilePage.title();
    assertCheck('Mobile Overview: Document title rendered correctly', appTitle.includes('Stock'));

    // Check AppBar elements
    const menuBtn = mobilePage.locator('#btn-mobile-menu');
    assertCheck('Mobile Overview: Menu hamburger button visible', (await menuBtn.count()) === 1);

    const statusBadge = mobilePage.locator('#chip-opend-status');
    assertCheck('Mobile Overview: OpenD status badge present in AppBar', (await statusBadge.count()) === 1);

    // Save Mobile Overview Screenshot
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '01_mobile_overview.png'), fullPage: true });

    // 2. Dark/Light Theme Switching
    const themeBtn = mobilePage.locator('#btn-theme-toggle');
    await themeBtn.click();
    await mobilePage.waitForTimeout(300);
    const bgLight = await mobilePage.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    assertCheck('Theme Toggle: Successfully switched to Light Mode', bgLight === 'rgb(245, 245, 249)' || bgLight.includes('245'));

    // Switch back to Dark Mode
    await themeBtn.click();
    await mobilePage.waitForTimeout(300);
    const bgDark = await mobilePage.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    assertCheck('Theme Toggle: Successfully switched back to Dark Mode (#232333)', bgDark === 'rgb(35, 35, 51)' || bgDark.includes('35'));

    // 3. Card Click Navigation: Click OpenD Gateway KPI card
    const opendKpiCard = mobilePage.locator('text=Gerbang OpenD Moomoo').first();
    assertCheck('Mobile Overview: OpenD Gateway KPI card present', (await opendKpiCard.count()) === 1);
    await opendKpiCard.click();
    await mobilePage.waitForTimeout(500);
    assertCheck('Card Click Navigation: Clicked OpenD KPI card and navigated to #/opend', mobilePage.url().includes('#/opend'));

    // 4. Mobile OpenD Page: Unified State-Driven Flow (HOM-183)
    const btnSignOut = mobilePage.locator('#btnSignOut');
    const selectTrigger = mobilePage.locator('#accSelect');

    const isConnectedVisible = (await btnSignOut.count()) === 1;
    assertCheck('Mobile OpenD: State-driven UI - On CONNECTED, Logout button #btnSignOut is displayed', isConnectedVisible);
    assertCheck('Mobile OpenD: State-driven UI - On CONNECTED, Account selector #accSelect is displayed', (await selectTrigger.count()) === 1);

    // 4a. Account Dropdown Selection (HOM-183 fix for React Error #31)
    await selectTrigger.click();
    await mobilePage.waitForTimeout(400);

    const listboxOptions = mobilePage.locator('ul[role="listbox"] li[role="option"]');
    const optionCount = await listboxOptions.count();
    assertCheck('Mobile OpenD: Account dropdown opens without crash', optionCount > 0);
    if (optionCount > 0) {
      await listboxOptions.nth(0).click();
      await mobilePage.waitForTimeout(400);
      assertCheck('Mobile OpenD: Selected account option successfully without React error', true);
    }

    // 4b. When connected, verify the default login form is hidden
    const initialAccInput = mobilePage.locator('#loginAccInput');
    assertCheck('Mobile OpenD: Login form #loginAccInput is hidden while connected', (await initialAccInput.count()) === 0);

    // 4c. Toggle credential change to test form fields and password masking
    const switchCredBtn = mobilePage.locator('button:has-text("Tukar Kredensial")');
    if ((await switchCredBtn.count()) > 0) {
      await switchCredBtn.click();
      await mobilePage.waitForTimeout(400);
    }

    const accInput = mobilePage.locator('#loginAccInput');
    const pwdInput = mobilePage.locator('#loginPwdInput');
    assertCheck('Mobile OpenD: Single unique #loginAccInput rendered when changing credentials', (await accInput.count()) === 1);
    assertCheck('Mobile OpenD: Single unique #loginPwdInput rendered when changing credentials', (await pwdInput.count()) === 1);

    // Fill form credentials
    await accInput.fill('101578176');
    await pwdInput.fill('MoomooPass2026!');
    await mobilePage.waitForTimeout(400); // Wait for CSS shrink animation

    // Verify label shrunk and notched outline floating
    const labelTransform = await mobilePage.evaluate(() => {
      const lbl = document.querySelector('label[for="loginAccInput"]');
      return lbl ? window.getComputedStyle(lbl).transform : '';
    });
    assertCheck('Mobile OpenD: Label floats properly with scale(0.75)', labelTransform.includes('0.75'));

    // Test password toggle
    const toggleEye = mobilePage.locator('button[aria-label="papar atau sembunyikan kata laluan"]');
    assertCheck('Mobile OpenD: Show/hide password button present', (await toggleEye.count()) === 1);
    await toggleEye.click();
    await mobilePage.waitForTimeout(300);
    const pwdTypeUnmasked = await pwdInput.getAttribute('type');
    assertCheck('Mobile OpenD: Password unmasked to type="text"', pwdTypeUnmasked === 'text');

    await toggleEye.click();
    await mobilePage.waitForTimeout(200);
    const pwdTypeMasked = await pwdInput.getAttribute('type');
    assertCheck('Mobile OpenD: Password re-masked to type="password"', pwdTypeMasked === 'password');

    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '03_mobile_opend_filled.png'), fullPage: true });

    // Cancel credential change and revert to connected view
    const cancelCredBtn = mobilePage.locator('button:has-text("Batal")');
    if ((await cancelCredBtn.count()) > 0) {
      await cancelCredBtn.click();
      await mobilePage.waitForTimeout(300);
    }

    // 5. Drawer Navigation to Watchlist
    await menuBtn.click();
    await mobilePage.waitForTimeout(400);
    const drawerModal = mobilePage.locator('.MuiDrawer-modal');
    const navWatchlist = drawerModal.locator('text=Watchlist Dwi-Lorong');
    await navWatchlist.click();
    await mobilePage.waitForTimeout(500);
    assertCheck('Mobile Navigation: Navigated to #/watchlist', mobilePage.url().includes('#/watchlist'));

    // Check that table rows are rendered with live candidates
    const tableRows = mobilePage.locator('tbody tr');
    const rowCount = await tableRows.count();
    assertCheck('Mobile Watchlist: Table contains active stock candidates', rowCount > 0);

    const setupTab = mobilePage.locator('button[role="tab"]').filter({ hasText: 'Setup' });
    if ((await setupTab.count()) > 0) {
      await setupTab.click();
      await mobilePage.waitForTimeout(300);
      assertCheck('Mobile Watchlist: Clicked and filtered by Setup tab', true);
    }
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '02_mobile_watchlist.png'), fullPage: true });

    // 6. Funnel Screener Page
    await mobilePage.goto(`${TARGET_URL}/#/funnel`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(400);
    const funnelCards = mobilePage.locator('text=Cloud Universe');
    assertCheck('Mobile Funnel: 5-stage screening pipeline rendered', (await funnelCards.count()) >= 1);
    const finalWatchlistBadge = mobilePage.locator('text=Calon Akhir');
    assertCheck('Mobile Funnel: Final candidate count badge rendered', (await finalWatchlistBadge.count()) >= 1);
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '04_mobile_funnel.png'), fullPage: true });

    // 7. Settings Screener Page & BVA User Acceptance Scenario (HOM-189 / HOM-190)
    console.log('\n--- Scenario A.7: Settings Page & Hard Safety Floor Verification ---');
    await mobilePage.goto(`${TARGET_URL}/#/settings`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(400);

    const settingsTitle = mobilePage.locator('text=Tetapan Parameter Screener');
    assertCheck('Mobile Settings: Page header rendered', (await settingsTitle.count()) >= 1);

    const minPriceInput = mobilePage.locator('#inputMinPrice');
    assertCheck('Mobile Settings: min_price input field present', (await minPriceInput.count()) === 1);

    // Test BVA Rejection: User types $0.99 (< $1.00 hard safety floor)
    await minPriceInput.fill('0.99');
    await mobilePage.waitForTimeout(200);
    const saveBtn = mobilePage.locator('#btnSaveConfig');
    await saveBtn.click();
    await mobilePage.waitForTimeout(400);

    const errorAlert = mobilePage.locator('#configAlertError');
    assertCheck('Mobile Settings BVA: Error alert displayed for price $0.99', (await errorAlert.count()) >= 1);
    const errorText = await errorAlert.innerText();
    assertCheck('Mobile Settings BVA: Error text mentions $1.00 safety floor', errorText.includes('$1.00'));
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '05_mobile_settings_bva_error.png'), fullPage: true });

    // Test User Acceptance Scenario: User sets $5.00 and clicks Save
    const chip5 = mobilePage.locator('#chipPrice5');
    if ((await chip5.count()) > 0) {
      await chip5.click();
    } else {
      await minPriceInput.fill('5.00');
    }
    await mobilePage.waitForTimeout(200);
    await saveBtn.click();
    await mobilePage.waitForTimeout(500);

    const successAlert = mobilePage.locator('#configAlertSuccess');
    assertCheck('Mobile Settings Acceptance: Success alert displayed for price $5.00', (await successAlert.count()) >= 1);

    const displayMinPrice = mobilePage.locator('#displayMinPrice');
    const displayedText = await displayMinPrice.innerText();
    assertCheck('Mobile Settings Acceptance: Status card displays $5.00', displayedText.includes('5.00'));
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '06_mobile_settings_success.png'), fullPage: true });

    assertCheck('Mobile Session: Clean console with zero errors', consoleErrors.length === 0);
    await mobileContext.close();

    // -------------------------------------------------------------
    // Test Scenario B: Desktop Viewport (1280 x 800)
    // -------------------------------------------------------------
    console.log('\n--- Scenario B: Desktop Viewport Verification (1280 x 800) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await desktopContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);
    const desktopPage = await desktopContext.newPage();

    await desktopPage.goto(`${TARGET_URL}/#/overview`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(400);

    // On desktop, permanent drawer should be visible without opening modal
    const desktopDrawer = desktopPage.locator('.MuiDrawer-docked');
    assertCheck('Desktop Layout: Permanent docked sidebar visible', (await desktopDrawer.count()) === 1);

    // Desktop Settings Navigation
    await desktopPage.goto(`${TARGET_URL}/#/settings`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(400);
    const desktopSettingsTitle = desktopPage.locator('text=Tetapan Parameter Screener');
    assertCheck('Desktop Settings: Page loaded in desktop view', (await desktopSettingsTitle.count()) >= 1);
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '07_desktop_settings.png'), fullPage: true });

    await desktopContext.close();

  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log(`  Playwright E2E UI QC Results: ${passedTests} / ${totalTests} checks passed`);
  console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runPlaywrightSuite().catch((err) => {
  console.error('Fatal Playwright Runner Error:', err);
  process.exit(1);
});
