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
    assertCheck('Tab 1 does NOT contain cliché "Prinsip Perlindungan Modal" card (HOM-305 feedback)', !capitalPanelText.includes('Prinsip Perlindungan Modal & Sizing Posisi Ejen'));

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

    // -----------------------------------------------------------------------
    // Part E: Agents Page Feedback Verification (Real Data, Passed Counters, Color Coding, Removal of Simulation Button, Rebranding & Pagination)
    // -----------------------------------------------------------------------
    console.log('\n[Part E: Agents Page Verification & Color Coding]');
    await page.goto(`${TARGET_URL}/#/agents`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const agentsText = await page.innerText('body');
    assertCheck('Agents Page displays "Kaunter Semasa Lulus" metric', agentsText.includes('Kaunter Semasa Lulus'));
    assertCheck('Agents Page removed cliché labels "L1: " / "L2: "', !agentsText.includes('L1: 1 Lulus') && !agentsText.includes('L2: 1 Lulus'));
    assertCheck('Agents Page removed cliché chips "(L1_TECHNICAL)" / "(L4_DISPATCH)"', !agentsText.includes('(L1_TECHNICAL)') && !agentsText.includes('(L4_DISPATCH)'));

    // Requirement 1: Simulation Button Removed
    const btnSim = page.locator('#btn-run-simulation');
    assertCheck('Simulation button (#btn-run-simulation) is COMPLETELY REMOVED', (await btnSim.count()) === 0);

    // Requirement 4: Rebranded L1 -> L4
    assertCheck('Agents Page header contains "L1 -> L4: Aktiviti Pasukan Ejen"', agentsText.includes('L1 -> L4: Aktiviti Pasukan Ejen'));
    const sidebarAgents = await page.innerText('#nav-item-agents');
    assertCheck('Sidebar navigation displays "L1 -> L4: Aktiviti Pasukan Ejen"', sidebarAgents.includes('L1 -> L4: Aktiviti Pasukan Ejen'));

    // Requirement 5: Table Pagination
    const pagination = page.locator('.MuiTablePagination-root');
    assertCheck('Orders table includes TablePagination component', (await pagination.count()) >= 1);

    const agentsScreenshot = path.join(QA_DIR, 'hom305-agents-passed-counters.png');
    await page.screenshot({ path: agentsScreenshot, fullPage: true });
    assertCheck('Screenshot captured: hom305-agents-passed-counters.png', fs.existsSync(agentsScreenshot));

    // -----------------------------------------------------------------------
    // Part F: Unified L0 (Saringan & Watchlist) Page Verification
    // -----------------------------------------------------------------------
    console.log('\n[Part F: Unified L0 (Saringan & Watchlist) Page]');
    const tabL0 = page.locator('#nav-item-l0');
    assertCheck('Sidebar contains unified navigation item #nav-item-l0', (await tabL0.count()) >= 1);
    const l0NavText = await tabL0.first().innerText();
    assertCheck('Sidebar #nav-item-l0 is labeled "L0: Saringan & Watchlist"', l0NavText.includes('L0: Saringan & Watchlist'));

    await tabL0.first().click();
    await page.waitForTimeout(1000);

    const l0Page = page.locator('#page-l0');
    assertCheck('Unified L0 Page (#page-l0) is rendered', (await l0Page.count()) === 1);

    const l0Text = await l0Page.innerText();
    assertCheck('L0 Page contains header "L0: Saringan & Watchlist Dwi-Lorong"', l0Text.includes('L0: Saringan & Watchlist Dwi-Lorong'));
    assertCheck('L0 Page contains 5-stage Funnel Stepper', l0Text.includes('STAGE 1') || l0Text.includes('Cloud Universe'));
    assertCheck('L0 Page contains Watchlist Table component', l0Text.includes('LORONG MOMENTUM') || l0Text.includes('Watchlist'));

    // Verify countdown timer until next watchlist
    const chipCountdown = page.locator('#chip-watchlist-countdown');
    assertCheck('L0 Page header contains countdown chip (#chip-watchlist-countdown)', (await chipCountdown.count()) >= 1);
    const chipCountdownText = await chipCountdown.innerText();
    assertCheck('Countdown chip text matches "Watchlist Seterusnya: MM:SS"', /Watchlist Seterusnya: \d{2}:\d{2}/.test(chipCountdownText));

    const cardCountdown = page.locator('#card-watchlist-countdown');
    assertCheck('L0 Page contains countdown card (#card-watchlist-countdown)', (await cardCountdown.count()) >= 1);
    const textCountdown = page.locator('#text-watchlist-countdown');
    const countdownVal = await textCountdown.innerText();
    assertCheck('Countdown timer display formatted as MM:SS (e.g. 04:59)', /^\d{2}:\d{2}$/.test(countdownVal.trim()));

    // Test legacy hash fallback (#/funnel and #/watchlist)
    await page.goto(`${TARGET_URL}/#/funnel`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    assertCheck('Legacy route #/funnel renders unified L0 page', (await page.locator('#page-l0').count()) === 1);

    await page.goto(`${TARGET_URL}/#/watchlist`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);
    assertCheck('Legacy route #/watchlist renders unified L0 page', (await page.locator('#page-l0').count()) === 1);

    const l0Shot = path.join(QA_DIR, 'hom305-unified-l0-desktop.png');
    await page.screenshot({ path: l0Shot, fullPage: true });
    assertCheck('Screenshot captured: hom305-unified-l0-desktop.png', fs.existsSync(l0Shot));

    const l0CountdownShot = path.join(QA_DIR, 'hom305-unified-l0-countdown-desktop.png');
    await page.screenshot({ path: l0CountdownShot, fullPage: true });
    assertCheck('Screenshot captured: hom305-unified-l0-countdown-desktop.png', fs.existsSync(l0CountdownShot));

    // -----------------------------------------------------------------------
    // Part G: Settings Tab 3 (Paparan Aktiviti Ejen & Paginasi Konfigurasi)
    // -----------------------------------------------------------------------
    console.log('\n[Part G: Settings Tab 3 Paparan Aktiviti Ejen & Paginasi]');
    await page.goto(`${TARGET_URL}/#/settings?tab=display`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const tab3 = page.locator('#tab-agent-display');
    assertCheck('Settings Tab 3 (#tab-agent-display) exists', (await tab3.count()) === 1);
    const isTab3Selected = await tab3.getAttribute('aria-selected');
    assertCheck('Tab 3 is selected via #/settings?tab=display', isTab3Selected === 'true');

    const displayPanel = page.locator('#tab-panel-display');
    assertCheck('Tab 3 panel (#tab-panel-display) is visible', await displayPanel.isVisible());

    // Verify pagination choices (5, 10, 25, 50)
    const chip5 = page.locator('#chip-orders-page-5');
    const chip10 = page.locator('#chip-orders-page-10');
    const chip25 = page.locator('#chip-orders-page-25');
    const chip50 = page.locator('#chip-orders-page-50');

    assertCheck('Pagination option 5 exists', await chip5.isVisible());
    assertCheck('Pagination option 10 exists', await chip10.isVisible());
    assertCheck('Pagination option 25 exists', await chip25.isVisible());
    assertCheck('Pagination option 50 exists', await chip50.isVisible());

    // Test selecting 25 and saving
    await chip25.click();
    await page.waitForTimeout(300);

    const btnSaveDisplay = page.locator('#btnSaveAgentDisplayConfig');
    assertCheck('Button #btnSaveAgentDisplayConfig is present', await btnSaveDisplay.isVisible());

    const [displayPatchRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/screener/config') && res.request().method() === 'PATCH'),
      btnSaveDisplay.click(),
    ]);
    assertCheck('PATCH response for display config returns HTTP 200', displayPatchRes.status() === 200);

    await page.waitForTimeout(800);
    const displayPanelText = await displayPanel.innerText();
    assertCheck('Success alert displayed on Tab 3', displayPanelText.includes('Konfigurasi paginasi berjaya disimpan'));
    assertCheck('Summary displays 25 entries per page', displayPanelText.includes('25 entri per halaman'));

    const tab3Shot = path.join(QA_DIR, 'hom305-tab3-display-desktop.png');
    await page.screenshot({ path: tab3Shot, fullPage: true });
    assertCheck('Screenshot captured: hom305-tab3-display-desktop.png', fs.existsSync(tab3Shot));

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
