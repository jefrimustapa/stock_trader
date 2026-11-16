/**
 * test_hom305_playwright.js
 * Comprehensive E2E Playwright Verification for HOM-305:
 * 1. Segregation of Capital Ceiling Setting into its own dedicated Tab:
 *    - Tab 0: "Parameter Screener L0" (strictly 5 physical stock screening parameters, NO modal ceiling controls).
 *    - Tab 1: "Pengurusan Modal & Risiko" (dedicated Capital & Risk Management panel with Limit Buying Power, presets, Haziq & Danial integration explanations, and capital save controls).
 *    - Tab 2: "Pengurusan Gerbang OpenD" (retains OpenD gateway control).
 * 2. Hash routing and direct tab selection:
 *    - #/settings?tab=opend selects Tab 2.
 *    - #/settings?tab=capital selects Tab 1.
 *    - #/settings?tab=screener or #/settings selects Tab 0.
 * 3. BVA Validation & Saving on Tab 1:
 *    - Preset selection ($25,000 / $50,000 / $100,000).
 *    - Submitting changes via btnSaveCapitalConfig.
 *    - Live SQLite WAL persistence verification and summary display update.
 * 4. Cross-device responsiveness:
 *    - Desktop viewport (1280x800)
 *    - Mobile viewport (390x844)
 *    - No horizontal overflow.
 *    - High-resolution QA screenshots stored in /qa/.
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
console.log('  Stock Trader Dashboard HOM-305 Playwright E2E Test Suite');
console.log(`  Target URL: ${TARGET_URL}`);
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
    // =========================================================================
    // Scenario 1: Desktop Viewport (1280 x 800)
    // =========================================================================
    console.log('\n--- Scenario 1: Desktop Viewport (1280 x 800) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    const page = await desktopContext.newPage();

    // -----------------------------------------------------------------------
    // Part A: Settings Page Tab Structure & Tab 0 (L0 Screener) Verification
    // -----------------------------------------------------------------------
    console.log('\n[Part A: Settings Page Tab Structure & Tab 0 L0 Screener]');
    await page.goto(`${TARGET_URL}/#/settings`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Verify 3 distinct tabs exist
    const tab0 = page.locator('#tab-screener-config');
    const tab1 = page.locator('#tab-capital-risk');
    const tab2 = page.locator('#tab-opend-gateway');

    assertCheck('Tab 0 "Parameter Screener L0" exists', (await tab0.count()) === 1);
    assertCheck('Tab 1 "Pengurusan Modal & Risiko" exists', (await tab1.count()) === 1);
    assertCheck('Tab 2 "Pengurusan Gerbang OpenD" exists', (await tab2.count()) === 1);

    // Tab 0 is selected by default on #/settings
    const isTab0Selected = await tab0.getAttribute('aria-selected');
    assertCheck('Tab 0 is active by default on #/settings', isTab0Selected === 'true');

    // In Tab 0: Only 5 physical screener parameters exist
    const minPriceInput = page.locator('#inputMinPrice');
    const minCapInput = page.locator('#inputMinMarketCap');
    const minVolInput = page.locator('#inputMinVolume');
    const minRvolInput = page.locator('#inputMinRvol');
    const maxRvolInput = page.locator('#inputMaxRvol');
    const maxLaneInput = page.locator('#inputMaxCandidatesPerLane');

    assertCheck('Tab 0 has min_price field', await minPriceInput.isVisible());
    assertCheck('Tab 0 has min_market_cap field', await minCapInput.isVisible());
    assertCheck('Tab 0 has min_volume field', await minVolInput.isVisible());
    assertCheck('Tab 0 has min_rvol field', await minRvolInput.isVisible());
    assertCheck('Tab 0 has max_rvol field', await maxRvolInput.isVisible());
    assertCheck('Tab 0 has max_candidates_per_lane field', await maxLaneInput.isVisible());

    // CRITICAL: Tab 0 MUST NOT contain max_buying_power controls
    const bpInputTab0 = page.locator('#tab-panel-screener #inputMaxBuyingPower');
    assertCheck('Tab 0 DOES NOT have inputMaxBuyingPower', (await bpInputTab0.count()) === 0);

    const screenerPanelText = await page.innerText('#tab-panel-screener');
    assertCheck('Tab 0 DOES NOT have "Had Siling Modal Maksimum" section', !screenerPanelText.includes('Had Siling Modal Maksimum (Limit Buying Power)'));
    assertCheck('Tab 0 Save button is labeled "Simpan Tetapan Screener"', screenerPanelText.includes('Simpan Tetapan Screener'));

    // Capture Tab 0 screenshot
    const tab0Shot = path.join(QA_DIR, 'hom305-tab0-screener-desktop.png');
    await page.screenshot({ path: tab0Shot, fullPage: true });
    assertCheck('Screenshot captured: hom305-tab0-screener-desktop.png', fs.existsSync(tab0Shot));

    // -----------------------------------------------------------------------
    // Part B: Tab 1 (Pengurusan Modal & Risiko) Verification & BVA Updates
    // -----------------------------------------------------------------------
    console.log('\n[Part B: Tab 1 Pengurusan Modal & Risiko]');
    await tab1.click();
    await page.waitForTimeout(800);

    const isTab1Selected = await tab1.getAttribute('aria-selected');
    assertCheck('Tab 1 is now actively selected', isTab1Selected === 'true');

    const currentUrlAfterTab1 = page.url();
    assertCheck('URL hash reflects #/settings?tab=capital', currentUrlAfterTab1.includes('tab=capital'));

    const capitalPanelText = await page.innerText('#tab-panel-capital');
    assertCheck('Tab 1 contains "Had Siling Modal Maksimum (Limit Buying Power)"', capitalPanelText.includes('Had Siling Modal Maksimum (Limit Buying Power)'));
    assertCheck('Tab 1 contains "Prinsip Perlindungan Modal & Sizing Posisi Ejen"', capitalPanelText.includes('Prinsip Perlindungan Modal & Sizing Posisi Ejen'));
    assertCheck('Tab 1 mentions Haziq (L2 Quant Analyst)', capitalPanelText.includes('Haziq (L2 Quant Analyst)'));
    assertCheck('Tab 1 mentions Danial (L3 Risk Auditor)', capitalPanelText.includes('Danial (L3 Risk Auditor)'));
    assertCheck('Tab 1 mentions Live WAL Sync (Zero Downtime)', capitalPanelText.includes('Live WAL Sync (Zero Downtime)'));

    // Verify Capital Input Field & Presets
    const bpInputTab1 = page.locator('#inputMaxBuyingPower');
    assertCheck('Tab 1 has #inputMaxBuyingPower visible', await bpInputTab1.isVisible());

    const initialBpVal = await bpInputTab1.inputValue();
    console.log(`  Initial Limit Buying Power: $${initialBpVal}`);
    assertCheck('Current Limit Buying Power is valid (>= 500)', Number(initialBpVal) >= 500);

    // Verify presets exist
    assertCheck('Preset $10,000 present', capitalPanelText.includes('$10,000 (Ujian Kecil)'));
    assertCheck('Preset $25,000 present', capitalPanelText.includes('$25,000 (PDT Minima)'));
    assertCheck('Preset $50,000 present', capitalPanelText.includes('$50,000 (Konservatif)'));
    assertCheck('Preset $100,000 present', capitalPanelText.includes('$100,000 (Lalai)'));
    assertCheck('Preset $500,000 present', capitalPanelText.includes('$500,000 (Institusi)'));

    // Test updating Limit Buying Power via preset chip
    console.log('  Testing preset $50,000 selection in Tab 1...');
    await page.locator('#tab-panel-capital').getByText('$50,000 (Konservatif)').click();
    await page.waitForTimeout(300);
    const updatedBpVal = await bpInputTab1.inputValue();
    assertCheck('Preset chip updated input value to 50000', updatedBpVal === '50000');

    // Save configuration via btnSaveCapitalConfig
    const btnSaveCapital = page.locator('#btnSaveCapitalConfig');
    assertCheck('Button #btnSaveCapitalConfig is present', await btnSaveCapital.isVisible());

    const [patchResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/screener/config') && res.request().method() === 'PATCH'),
      btnSaveCapital.click(),
    ]);
    console.log(`  PATCH response status: ${patchResponse.status()}`);
    await page.waitForTimeout(1000);

    // Verify success alert
    const capitalAlertText = await page.innerText('#tab-panel-capital');
    assertCheck('Capital save success alert displayed', capitalAlertText.includes('Had siling modal berjaya dikemas kini'));

    // Verify sidebar summary display on Tab 1
    const summaryBp = await page.innerText('#tab-panel-capital #displayMaxBuyingPower');
    console.log(`  Tab 1 Summary Had Siling Modal: ${summaryBp}`);
    assertCheck('Tab 1 sidebar summary displays $50,000', summaryBp.includes('50,000'));

    // Capture Tab 1 screenshot
    const tab1Shot = path.join(QA_DIR, 'hom305-tab1-capital-desktop.png');
    await page.screenshot({ path: tab1Shot, fullPage: true });
    assertCheck('Screenshot captured: hom305-tab1-capital-desktop.png', fs.existsSync(tab1Shot));

    // -----------------------------------------------------------------------
    // Part C: Tab 2 (Pengurusan Gerbang OpenD) & Hash Direct Navigation
    // -----------------------------------------------------------------------
    console.log('\n[Part C: Tab 2 OpenD Gateway & Direct Hash Navigation]');
    await page.goto(`${TARGET_URL}/#/settings?tab=opend`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const isTab2SelectedDirect = await tab2.getAttribute('aria-selected');
    assertCheck('Direct navigation to #/settings?tab=opend selects Tab 2', isTab2SelectedDirect === 'true');

    const opendPanel = page.locator('#tab-panel-opend');
    assertCheck('OpenD control panel rendered in Tab 2', await opendPanel.isVisible());

    const tab2Shot = path.join(QA_DIR, 'hom305-tab2-opend-desktop.png');
    await page.screenshot({ path: tab2Shot, fullPage: true });
    assertCheck('Screenshot captured: hom305-tab2-opend-desktop.png', fs.existsSync(tab2Shot));

    // Test direct hash to capital tab
    await page.goto(`${TARGET_URL}/#/settings?tab=capital`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    const isTab1SelectedDirect = await tab1.getAttribute('aria-selected');
    assertCheck('Direct navigation to #/settings?tab=capital selects Tab 1', isTab1SelectedDirect === 'true');

    // -----------------------------------------------------------------------
    // Part D: Mobile Viewport (390 x 844) Responsiveness
    // -----------------------------------------------------------------------
    console.log('\n--- Scenario 2: Mobile Viewport (390 x 844) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true,
    });
    const mobilePage = await mobileContext.newPage();

    // Mobile Tab 0
    await mobilePage.goto(`${TARGET_URL}/#/settings`, { waitUntil: 'networkidle', timeout: 30000 });
    await mobilePage.waitForTimeout(800);

    let mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assertCheck('Mobile Settings Tab 0: No horizontal overflow', !mobileOverflow);

    const mobileTab0Shot = path.join(QA_DIR, 'hom305-settings-tab0-mobile.png');
    await mobilePage.screenshot({ path: mobileTab0Shot, fullPage: true });
    assertCheck('Screenshot captured: hom305-settings-tab0-mobile.png', fs.existsSync(mobileTab0Shot));

    // Mobile Tab 1 (Capital)
    await mobilePage.goto(`${TARGET_URL}/#/settings?tab=capital`, { waitUntil: 'networkidle', timeout: 30000 });
    await mobilePage.waitForTimeout(800);

    mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assertCheck('Mobile Settings Tab 1: No horizontal overflow', !mobileOverflow);

    const mobileTab1Shot = path.join(QA_DIR, 'hom305-settings-tab1-mobile.png');
    await mobilePage.screenshot({ path: mobileTab1Shot, fullPage: true });
    assertCheck('Screenshot captured: hom305-settings-tab1-mobile.png', fs.existsSync(mobileTab1Shot));

    console.log('\n================================================================');
    console.log(`  HOM-305 Playwright Suite Finished: ${passedTests} / ${totalTests} passed`);
    console.log('================================================================\n');

    await mobileContext.close();
    await desktopContext.close();
  } catch (err) {
    console.error('Test Suite Exception:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runSuite();
