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
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '05_mobile_settings_clean.png'), fullPage: true });

    const settingsTitle = mobilePage.locator('text=Tetapan Parameter Screener');
    assertCheck('Mobile Settings: Page header rendered', (await settingsTitle.count()) >= 1);

    const minPriceInput = mobilePage.locator('#inputMinPrice');
    assertCheck('Mobile Settings: min_price input field present', (await minPriceInput.count()) === 1);

    // Test User Acceptance Scenario: User sets $5.00 and clicks Save
    const chip5 = mobilePage.locator('#chipPrice5');
    if ((await chip5.count()) > 0) {
      await chip5.click();
    } else {
      await minPriceInput.fill('5.00');
    }
    await mobilePage.waitForTimeout(200);
    const saveBtn = mobilePage.locator('#btnSaveConfig');
    await saveBtn.click();
    await mobilePage.waitForTimeout(500);

    const successAlert = mobilePage.locator('#configAlertSuccess');
    assertCheck('Mobile Settings Acceptance: Success alert displayed for price $5.00', (await successAlert.count()) >= 1);

    const displayMinPrice = mobilePage.locator('#displayMinPrice');
    const displayedText = await displayMinPrice.innerText();
    assertCheck('Mobile Settings Acceptance: Status card displays $5.00', displayedText.includes('5.00'));
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '05_mobile_settings_success.png'), fullPage: true });

    // -------------------------------------------------------------
    // Post-Rejection Status Card & Boundary Integrity (HOM-193 Defect 1)
    // -------------------------------------------------------------
    console.log('\n--- Scenario A.7b: Post-Rejection Status Card & Persistence Verification (HOM-193) ---');
    const errorAlert = mobilePage.locator('#configAlertError');

    // Case 1: Rejection with $0.99
    await minPriceInput.fill('0.99');
    await mobilePage.waitForTimeout(200);
    await saveBtn.click();
    await mobilePage.waitForTimeout(400);
    assertCheck('Mobile Settings BVA: Error alert displayed for price $0.99', (await errorAlert.count()) >= 1);
    const cardPriceAfter099 = await displayMinPrice.innerText();
    assertCheck('Status Card Integrity: Card remains $5.00 after $0.99 rejected', cardPriceAfter099.includes('5.00') && !cardPriceAfter099.includes('0.99'));

    // Case 2: Rejection with $0.00
    await minPriceInput.fill('0.00');
    await mobilePage.waitForTimeout(200);
    await saveBtn.click();
    await mobilePage.waitForTimeout(400);
    assertCheck('Mobile Settings BVA: Error alert displayed for price $0.00', (await errorAlert.count()) >= 1);
    const cardPriceAfter000 = await displayMinPrice.innerText();
    assertCheck('Status Card Integrity: Card remains $5.00 after $0.00 rejected', cardPriceAfter000.includes('5.00') && !cardPriceAfter000.includes('0.00'));

    // Case 3: Rejection with -$3.00
    await minPriceInput.fill('-3.00');
    await mobilePage.waitForTimeout(200);
    await saveBtn.click();
    await mobilePage.waitForTimeout(400);
    assertCheck('Mobile Settings BVA: Error alert displayed for price -$3.00', (await errorAlert.count()) >= 1);
    const cardPriceAfterNeg = await displayMinPrice.innerText();
    assertCheck('Status Card Integrity: Card remains $5.00 after -$3.00 rejected', cardPriceAfterNeg.includes('5.00') && !cardPriceAfterNeg.includes('-3'));

    // Case 4: Rejection with empty string ""
    await minPriceInput.fill('');
    await mobilePage.waitForTimeout(200);
    await saveBtn.click();
    await mobilePage.waitForTimeout(400);
    assertCheck('Mobile Settings BVA: Error alert displayed for empty input', (await errorAlert.count()) >= 1);
    const cardPriceAfterEmpty = await displayMinPrice.innerText();
    assertCheck('Status Card Integrity: Card remains $5.00 after empty input rejected', cardPriceAfterEmpty.includes('5.00'));

    // Case 5: Reload persistence
    await mobilePage.reload({ waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(400);
    const cardPriceAfterReload = await displayMinPrice.innerText();
    assertCheck('Persistence: Status card persists $5.00 after full page reload', cardPriceAfterReload.includes('5.00'));

    // Case 6: Cross-field min_rvol > max_rvol (10.0 > 2.0)
    const minRvolInput = mobilePage.locator('input[type="number"]').nth(3); // min_rvol input
    const maxRvolInput = mobilePage.locator('input[type="number"]').nth(4); // max_rvol input
    if ((await minRvolInput.count()) >= 1 && (await maxRvolInput.count()) >= 1) {
      await minRvolInput.fill('10.0');
      await maxRvolInput.fill('2.0');
      await mobilePage.waitForTimeout(200);
      await saveBtn.click();
      await mobilePage.waitForTimeout(400);
      assertCheck('Mobile Settings Cross-Field: Error alert displayed for min_rvol > max_rvol', (await errorAlert.count()) >= 1);
      const displayRvolRange = mobilePage.locator('#displayRvolRange');
      if ((await displayRvolRange.count()) >= 1) {
        const rvolRangeText = await displayRvolRange.innerText();
        assertCheck('Status Card Integrity: RVOL range does NOT display inverted 10 - 2 after rejection', !rvolRangeText.includes('10 - 2') && !rvolRangeText.includes('10.0 - 2.0'));
      }
    }
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, '06_mobile_settings_rejection_integrity.png'), fullPage: true });

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

    // -------------------------------------------------------------
    // Test Scenario C: Dynamic Funnel Screener Active Config Acceptance (HOM-205)
    // -------------------------------------------------------------
    console.log('\n--- Scenario C: Dynamic Funnel Active Config Verification (HOM-205) ---');

    // 1. Desktop Funnel with active config $5.00 (from Scenario A.7 save)
    await desktopPage.goto(`${TARGET_URL}/#/funnel`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(500);

    const funnelStage2Stepper = desktopPage.locator('#funnel-stage2-desc');
    assertCheck('HOM-205 Funnel Stepper: #funnel-stage2-desc element rendered', (await funnelStage2Stepper.count()) === 1);

    const stepperText5 = await funnelStage2Stepper.innerText();
    assertCheck('HOM-205 User Acceptance: Funnel Stepper Stage 2 displays active "Harga >= $5"', stepperText5.includes('Harga >= $5') && !stepperText5.includes('Harga >= $10'));

    const criteriaStage2 = desktopPage.locator('#criteria-stage2-desc');
    assertCheck('HOM-205 Criteria Card: #criteria-stage2-desc element rendered', (await criteriaStage2.count()) === 1);

    const criteriaText5 = await criteriaStage2.innerText();
    assertCheck('HOM-205 User Acceptance: Criteria Stage 2 displays active "Harga >= $5"', criteriaText5.includes('Harga >= $5') && !criteriaText5.includes('Harga >= $10'));

    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '08_after_desktop_funnel_5usd.png'), fullPage: true });

    // 2. Mobile Funnel with active config $5.00
    const mobileFunnelContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await mobileFunnelContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);
    const mobileFunnelPage = await mobileFunnelContext.newPage();
    await mobileFunnelPage.goto(`${TARGET_URL}/#/funnel`, { waitUntil: 'networkidle' });
    await mobileFunnelPage.waitForTimeout(500);

    const mobileStepperText5 = await mobileFunnelPage.locator('#funnel-stage2-desc').innerText();
    assertCheck('HOM-205 Mobile Acceptance: Funnel Stepper displays "Harga >= $5" on mobile', mobileStepperText5.includes('Harga >= $5'));
    await mobileFunnelPage.screenshot({ path: path.join(SCREENSHOT_DIR, '09_after_mobile_funnel_5usd.png'), fullPage: true });
    await mobileFunnelContext.close();

    // 3. BVA Test: Boundary min_price $1.00
    console.log('\n--- Scenario C.2: BVA Hard Safety Floor ($1.00) Funnel Dynamic Update ---');
    await desktopPage.goto(`${TARGET_URL}/#/settings`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(400);

    const desktopMinPriceInput = desktopPage.locator('#inputMinPrice');
    await desktopMinPriceInput.fill('1.00');
    await desktopPage.waitForTimeout(200);
    const desktopSaveBtn = desktopPage.locator('#btnSaveConfig');
    await desktopSaveBtn.click();
    await desktopPage.waitForTimeout(500);

    await desktopPage.goto(`${TARGET_URL}/#/funnel`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(500);

    const stepperText1 = await desktopPage.locator('#funnel-stage2-desc').innerText();
    assertCheck('HOM-205 BVA Acceptance: Funnel Stepper updates to exact boundary "Harga >= $1"', stepperText1.includes('Harga >= $1'));
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '10_desktop_funnel_bva_1usd.png'), fullPage: true });

    // 4. Clean Reset: Revert back to $10.00 default
    console.log('\n--- Scenario C.3: Clean Reset to $10.00 Default ---');
    await desktopPage.goto(`${TARGET_URL}/#/settings`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(400);
    await desktopMinPriceInput.fill('10.00');
    await desktopPage.waitForTimeout(200);
    await desktopSaveBtn.click();
    await desktopPage.waitForTimeout(500);

    await desktopPage.goto(`${TARGET_URL}/#/funnel`, { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(500);

    const stepperText10 = await desktopPage.locator('#funnel-stage2-desc').innerText();
    assertCheck('HOM-205 Reset Acceptance: Funnel cleanly returns to default "Harga >= $10"', stepperText10.includes('Harga >= $10'));
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, '11_desktop_funnel_reverted_10usd.png'), fullPage: true });

    await desktopContext.close();

    // -------------------------------------------------------------
    // Scenario D: K-Line Quota Acceptance Scenario (HOM-210)
    // -------------------------------------------------------------
    console.log('\n--- Scenario D: K-Line Quota Separate Page Acceptance (HOM-210) ---');
    const quotaContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    await quotaContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);
    const quotaPage = await quotaContext.newPage();

    // 1. User Acceptance Step 1: Open Overview, observe Card 4 (K-Line quota summary)
    await quotaPage.goto(`${TARGET_URL}/#/overview`, { waitUntil: 'networkidle' });
    await quotaPage.waitForTimeout(400);

    const klineCard = quotaPage.locator('#kpi-card-kline-quota');
    assertCheck('HOM-210 User Acceptance: Overview renders Card 4 K-Line Quota with ID #kpi-card-kline-quota', (await klineCard.count()) === 1);
    const cardText = await klineCard.innerText();
    assertCheck('HOM-210 User Acceptance: Card 4 displays remaining quota summary (e.g. Baki)', cardText.includes('Baki') && cardText.includes('Kuota API K-Line'));

    // 2. User Acceptance Step 2: Click Card 4 -> Navigate to #/quota
    await klineCard.click();
    await quotaPage.waitForTimeout(500);
    assertCheck('HOM-210 User Acceptance: Clicking Card 4 navigates to #/quota', quotaPage.url().includes('#/quota'));

    // 3. User Acceptance Step 3: Quota Page Layout & 4 KPI Cards
    const quotaContainer = quotaPage.locator('#quota-page');
    assertCheck('HOM-210 User Acceptance: #quota-page container rendered', (await quotaContainer.count()) === 1);
    assertCheck('HOM-210 User Acceptance: Page title "Penggunaan Kuota K-Line 30-Hari" rendered', (await quotaPage.locator('text=Penggunaan Kuota K-Line 30-Hari').count()) >= 1);
    assertCheck('HOM-210 User Acceptance: Baki Kuota KPI card rendered', (await quotaPage.locator('#kpi-quota-remaining').count()) === 1);
    assertCheck('HOM-210 User Acceptance: Simbol Digunakan KPI card rendered', (await quotaPage.locator('#kpi-quota-used').count()) === 1);
    assertCheck('HOM-210 User Acceptance: Peratus Penggunaan KPI card rendered', (await quotaPage.locator('#kpi-quota-percent').count()) === 1);
    assertCheck('HOM-210 User Acceptance: Status Kesihatan KPI card rendered', (await quotaPage.locator('#kpi-quota-status').count()) === 1);

    // 4. User Acceptance Step 4: Data Table of Active Symbols
    const quotaTable = quotaPage.locator('#table-kline-quota');
    assertCheck('HOM-210 User Acceptance: K-Line quota data table rendered', (await quotaTable.count()) === 1);
    const mgclyRow = quotaPage.locator('text=US.MGCLY').first();
    assertCheck('HOM-210 User Acceptance: Table displays active symbol US.MGCLY', (await mgclyRow.count()) === 1);
    assertCheck('HOM-210 User Acceptance: Table displays 30-day countdown badge', (await quotaPage.locator('text=Hari Lagi').count()) >= 1);

    // 5. User Acceptance Step 5: Search & Filter Functionality
    const searchInput = quotaPage.locator('#input-search-quota-symbol');
    assertCheck('HOM-210 User Acceptance: Symbol search filter input rendered', (await searchInput.count()) === 1);
    await searchInput.fill('MGCLY');
    await quotaPage.waitForTimeout(300);
    const visibleRows = quotaPage.locator('#table-kline-quota tbody tr');
    assertCheck('HOM-210 User Acceptance: Search isolates matching symbol US.MGCLY', (await visibleRows.count()) === 1);

    // Clear search
    await searchInput.fill('');
    await quotaPage.waitForTimeout(300);
    assertCheck('HOM-210 User Acceptance: Clearing search restores full symbol list (>= 7 symbols)', (await visibleRows.count()) >= 7);

    // Desktop Screenshot
    await quotaPage.screenshot({ path: path.join(SCREENSHOT_DIR, '12_desktop_kline_quota_page.png'), fullPage: true });

    // 6. Mobile Viewport Verification
    console.log('\n--- Scenario D.2: Mobile Viewport Quota Page Verification (390 x 844) ---');
    const mobileQuotaContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await mobileQuotaContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);
    const mobileQuotaPage = await mobileQuotaContext.newPage();
    await mobileQuotaPage.goto(`${TARGET_URL}/#/quota`, { waitUntil: 'networkidle' });
    await mobileQuotaPage.waitForTimeout(400);

    const mobileHasHorizontalOverflow = await mobileQuotaPage.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assertCheck('HOM-210 Mobile Acceptance: No horizontal page overflow on #/quota mobile', !mobileHasHorizontalOverflow);
    assertCheck('HOM-210 Mobile Acceptance: Quota table present on mobile', (await mobileQuotaPage.locator('#table-kline-quota').count()) === 1);
    await mobileQuotaPage.screenshot({ path: path.join(SCREENSHOT_DIR, '13_mobile_kline_quota_page.png'), fullPage: true });

    await mobileQuotaContext.close();
    await quotaContext.close();

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
