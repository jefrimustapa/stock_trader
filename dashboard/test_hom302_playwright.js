/**
 * test_hom302_playwright.js
 * Comprehensive E2E Playwright Verification for HOM-302:
 * 1. OpenD merged into SettingsPage Tab 2; navItems has no OpenD; #/opend redirects to #/settings?tab=opend; KpiCards OpenD navigates to #/settings?tab=opend.
 * 2. Cleaned internal technical labels (Authentik RS256, Sneat MUI v6, SQLite WAL, Gateway Specs card, Sentinel L4 card, 3 stats cards on AgentsPage).
 * 3. Directional Pipeline Flow (L0->L4) with ArrowForward / ArrowDownward.
 * 4. Agent deliberation details: metrics vs threshold and active news link on Nawwar.
 * 5. Limit Buying Power setting in SettingsPage Tab 1, validation, saving, and persistence.
 * 6. High-res Desktop (1280x800) and Mobile (390x844) screenshots.
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
console.log('  Stock Trader Dashboard HOM-302 Playwright E2E Test Suite');
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
    // Part A: OverviewPage Verification
    // -----------------------------------------------------------------------
    console.log('\n[Part A: OverviewPage Verification]');
    await page.goto(`${TARGET_URL}/#/overview`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const overviewBodyText = await page.innerText('body');

    // 1. Navigation menu must NOT have standalone OpenD menu
    const sidebarNavText = await page.innerText('nav, aside, .MuiDrawer-root');
    assertCheck('Sidebar navigation has no standalone "OpenD" item', !sidebarNavText.includes('Pengurusan OpenD') && !sidebarNavText.includes('OpenD Gateway'));

    // 2. Navigation sidebar footer must NOT have Authentik RS256 badge
    assertCheck('Sidebar footer cleaned: No "Authentik RS256 Active" badge', !sidebarNavText.includes('Authentik RS256 Active') && !sidebarNavText.includes('Forward-Auth Protected'));

    // 3. Overview header must NOT have "Sneat MUI v6" chip badge
    assertCheck('Overview header cleaned: No "Sneat MUI v6" pill badge', !overviewBodyText.includes('Sneat MUI v6'));

    // 4. Overview KPI Cards: exactly 3 balanced cards (no Sentinel L4 card)
    assertCheck('Overview KPI Cards: No "Pengawasan Sentinel L4" card', !overviewBodyText.includes('Pengawasan Sentinel L4'));
    assertCheck('Overview KPI Cards: Card 1 Gerbang OpenD present', overviewBodyText.includes('Gerbang OpenD') || overviewBodyText.includes('OpenD'));
    assertCheck('Overview KPI Cards: Card 2 Baki Tunai & Ekuiti present', overviewBodyText.includes('Baki Tunai & Jumlah Ekuiti') || overviewBodyText.includes('Baki Akaun'));
    assertCheck('Overview KPI Cards: Card 3 Kuota K-Line present', overviewBodyText.includes('Kuota API K-Line') || overviewBodyText.includes('Kuota K-Line'));

    // 5. Right column: No "Pematuhan Seni Bina & Keselamatan" card
    assertCheck('Overview cleaned: No "Pematuhan Seni Bina & Keselamatan" card', !overviewBodyText.includes('Pematuhan Seni Bina & Keselamatan'));

    // 6. Screenshot Overview Desktop
    const overviewDesktopShot = path.join(QA_DIR, 'hom302-overview-desktop.png');
    await page.screenshot({ path: overviewDesktopShot, fullPage: true });
    assertCheck('Screenshot captured: hom302-overview-desktop.png', fs.existsSync(overviewDesktopShot));

    // -----------------------------------------------------------------------
    // Part B: Hash Redirect & Navigation to Settings Tab 2
    // -----------------------------------------------------------------------
    console.log('\n[Part B: Hash Redirect & Navigation to Settings Tab 2]');
    // Navigate to #/opend
    await page.goto(`${TARGET_URL}/#/opend`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800);

    const currentUrl = page.url();
    assertCheck('Navigating to #/opend redirects gracefully to #/settings?tab=opend', currentUrl.includes('/settings') && currentUrl.includes('tab=opend'));

    // Verify Tab 2 (Pengurusan Gerbang OpenD) is selected
    const tab2 = page.locator('button[role="tab"]:has-text("Pengurusan Gerbang OpenD")');
    assertCheck('Settings Tab "Pengurusan Gerbang OpenD" is present', (await tab2.count()) >= 1);
    const isTab2Selected = await tab2.getAttribute('aria-selected');
    assertCheck('Tab "Pengurusan Gerbang OpenD" is actively selected', isTab2Selected === 'true');

    // Verify OpenD panel is rendered and Specifications card is REMOVED
    const settingsBodyText = await page.innerText('body');
    assertCheck('OpenD panel rendered inside Settings', settingsBodyText.includes('Sesi Broker') || settingsBodyText.includes('Kawalan Sesi') || settingsBodyText.includes('Moomoo'));
    assertCheck('OpenD specs cleaned: No "Spesifikasi & Diagnostik Gerbang" card', !settingsBodyText.includes('Spesifikasi & Diagnostik Gerbang'));
    assertCheck('OpenD specs cleaned: No MD5 Server Hashing or Telnet Gateway lines', !settingsBodyText.includes('MD5 Server Hashing') && !settingsBodyText.includes('Port 22222 (Telnet Gateway)'));

    // Screenshot Settings OpenD Tab Desktop
    const settingsOpendDesktopShot = path.join(QA_DIR, 'hom302-settings-opend-desktop.png');
    await page.screenshot({ path: settingsOpendDesktopShot, fullPage: true });
    assertCheck('Screenshot captured: hom302-settings-opend-desktop.png', fs.existsSync(settingsOpendDesktopShot));

    // -----------------------------------------------------------------------
    // Part C: SettingsPage Tab 1 (Parameter Screener & Modal)
    // -----------------------------------------------------------------------
    console.log('\n[Part C: SettingsPage Tab 1 & Limit Buying Power]');
    const tab1 = page.locator('button[role="tab"]:has-text("Parameter Screener & Modal")');
    await tab1.click();
    await page.waitForTimeout(600);

    const tab1BodyText = await page.innerText('body');
    // 1. Must NOT have SQLite WAL: Aktif chip badge
    assertCheck('Settings header cleaned: No "SQLite WAL: Aktif" badge', !tab1BodyText.includes('SQLite WAL: Aktif'));

    // 2. Field 6: Had Siling Modal Maksimum (Limit Buying Power)
    assertCheck('Limit Buying Power title rendered', tab1BodyText.includes('Had Siling Modal Maksimum (Limit Buying Power)'));
    const bpInput = page.locator('#inputMaxBuyingPower');
    assertCheck('Input #inputMaxBuyingPower is visible', await bpInput.isVisible());

    const bpVal = await bpInput.inputValue();
    console.log(`  Current Limit Buying Power: $${bpVal}`);
    assertCheck('Limit Buying Power value >= $500', Number(bpVal) >= 500);

    // 3. Preset chips exist
    assertCheck('Preset $10,000 present', tab1BodyText.includes('$10,000 (Ujian Kecil)'));
    assertCheck('Preset $25,000 present', tab1BodyText.includes('$25,000 (PDT Minima)'));
    assertCheck('Preset $50,000 present', tab1BodyText.includes('$50,000 (Konservatif)'));
    assertCheck('Preset $100,000 present', tab1BodyText.includes('$100,000 (Lalai)'));

    // 4. Test updating Limit Buying Power to $50,000
    console.log('  Testing preset $50,000 selection...');
    await page.locator('text=$50,000 (Konservatif)').click();
    await page.waitForTimeout(300);
    const newBpVal = await bpInput.inputValue();
    assertCheck('Preset updated input value to 50000', newBpVal === '50000');

    // 5. Save configuration
    const btnSaveConfig = page.locator('#btnSaveConfig');
    await btnSaveConfig.click();
    await page.waitForTimeout(1000);

    const alertText = await page.innerText('body');
    assertCheck('Save successful alert displayed', alertText.includes('Tetapan screener berjaya dikemas kini'));

    // 6. Sidebar summary displays updated Had Siling Modal
    const summaryBp = await page.innerText('#displayMaxBuyingPower');
    console.log(`  Summary card Had Siling Modal text: ${summaryBp}`);
    assertCheck('Sidebar summary displays $50,000', summaryBp.includes('50,000'));

    // Screenshot Settings Screener Tab Desktop
    const settingsScreenerDesktopShot = path.join(QA_DIR, 'hom302-settings-screener-desktop.png');
    await page.screenshot({ path: settingsScreenerDesktopShot, fullPage: true });
    assertCheck('Screenshot captured: hom302-settings-screener-desktop.png', fs.existsSync(settingsScreenerDesktopShot));

    // -----------------------------------------------------------------------
    // Part D: AgentsPage Verification
    // -----------------------------------------------------------------------
    console.log('\n[Part D: AgentsPage Verification]');
    await page.goto(`${TARGET_URL}/#/agents`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    const agentsBodyText = await page.innerText('body');

    // 1. Verify 3 summary stats cards REMOVED
    assertCheck('Agents cleaned: No "JUMLAH KITARAN SIMULASI" card', !agentsBodyText.includes('JUMLAH KITARAN SIMULASI'));
    assertCheck('Agents cleaned: No "PESANAN SIMULASI DIJANA" card', !agentsBodyText.includes('PESANAN SIMULASI DIJANA'));
    assertCheck('Agents cleaned: No "STATUS KESELAMATAN & RISIKO" card', !agentsBodyText.includes('STATUS KESELAMATAN & RISIKO'));

    // 2. Verify Calon Kitaran Terkini is KEPT
    assertCheck('Agents card kept: "CALON KITARAN TERKINI" present', agentsBodyText.includes('CALON KITARAN TERKINI'));

    // 3. Verify Directional Pipeline Flow (L0->L4)
    assertCheck('Pipeline flow header present', agentsBodyText.includes('Aliran Saluran Paip Keputusan'));
    assertCheck('Pipeline displays L0 SCREENER', agentsBodyText.includes('L0 SCREENER'));
    assertCheck('Pipeline displays L1 KECERDASAN (Tariq & Nawwar)', agentsBodyText.includes('L1 KECERDASAN') && agentsBodyText.includes('Tariq & Nawwar'));
    assertCheck('Pipeline displays L2 STRATEGI & PORTFOLIO', agentsBodyText.includes('L2 STRATEGI & PORTFOLIO'));
    assertCheck('Pipeline displays L3 AUDIT RISIKO', agentsBodyText.includes('L3 AUDIT RISIKO'));
    assertCheck('Pipeline displays L4 PELAKSANAAN', agentsBodyText.includes('L4 PELAKSANAAN'));

    // Directional arrows present in DOM
    const arrowForwardIcons = page.locator('svg[data-testid="ArrowForwardIcon"]');
    assertCheck('Directional ArrowForwardIcons rendered in pipeline flow', (await arrowForwardIcons.count()) >= 4);

    // 4. Verify Tariq deliberation: metrics vs threshold
    assertCheck('Card Tariq present', agentsBodyText.includes('Tariq') && agentsBodyText.includes('Technical Analyst'));
    assertCheck('Card Tariq shows Skor Teknikal S_tech comparison', agentsBodyText.includes('SKOR TEKNIKAL') || agentsBodyText.includes('S_tech'));
    assertCheck('Card Tariq shows threshold comparison (Ambang: >= 60.0)', agentsBodyText.includes('Ambang: ≥ 60.0'));

    // 5. Verify Nawwar deliberation: metrics vs threshold & News link
    assertCheck('Card Nawwar present', agentsBodyText.includes('Nawwar'));
    assertCheck('Card Nawwar shows S_sent_norm comparison', agentsBodyText.includes('SKOR SENTIMEN TERNORMAL') || agentsBodyText.includes('S_sent_norm'));
    assertCheck('Card Nawwar shows threshold comparison (Ambang: >= 80.0)', agentsBodyText.includes('Ambang: ≥ 80.0'));

    const newsLink = page.locator('a[href*="finance.yahoo.com/quote"]');
    assertCheck('Nawwar news external hyperlink is rendered', (await newsLink.count()) >= 1);
    if ((await newsLink.count()) >= 1) {
      const href = await newsLink.first().getAttribute('href');
      const target = await newsLink.first().getAttribute('target');
      console.log(`  Nawwar News Link href: ${href}, target: ${target}`);
      assertCheck('Nawwar news link opens in new tab (target="_blank")', target === '_blank');
      assertCheck('Nawwar news link valid Yahoo Finance URL', href.includes('finance.yahoo.com/quote'));
    }

    // 6. Verify Haziq deliberation: composite score and effective capital basis
    assertCheck('Card Haziq present', agentsBodyText.includes('Haziq'));
    assertCheck('Card Haziq shows Skor Komposit S_total', agentsBodyText.includes('SKOR KOMPOSIT'));
    assertCheck('Card Haziq shows threshold comparison (Ambang: >= 65.0)', agentsBodyText.includes('Ambang: ≥ 65.0'));
    assertCheck('Card Haziq shows Asas Modal Efektif', agentsBodyText.includes('Asas Modal Efektif'));

    // 7. Verify Danial deliberation: 8 Hard Rules matrix
    assertCheck('Card Danial present', agentsBodyText.includes('Danial'));
    assertCheck('Card Danial shows 8 Hard Rules matrix', agentsBodyText.includes('Semakan 8 Hard Rules'));

    // Screenshot Agents Desktop
    const agentsDesktopShot = path.join(QA_DIR, 'hom302-agents-desktop.png');
    await page.screenshot({ path: agentsDesktopShot, fullPage: true });
    assertCheck('Screenshot captured: hom302-agents-desktop.png', fs.existsSync(agentsDesktopShot));

    await desktopContext.close();

    // =========================================================================
    // Scenario 2: Mobile Viewport (390 x 844) - iPhone 12/13/14
    // =========================================================================
    console.log('\n--- Scenario 2: Mobile Viewport (390 x 844) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true,
    });
    const mobilePage = await mobileContext.newPage();

    // Mobile Overview
    await mobilePage.goto(`${TARGET_URL}/#/overview`, { waitUntil: 'networkidle', timeout: 30000 });
    await mobilePage.waitForTimeout(800);

    let mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assertCheck('Mobile Overview: No horizontal overflow', !mobileOverflow);

    const overviewMobileShot = path.join(QA_DIR, 'hom302-overview-mobile.png');
    await mobilePage.screenshot({ path: overviewMobileShot, fullPage: true });
    assertCheck('Screenshot captured: hom302-overview-mobile.png', fs.existsSync(overviewMobileShot));

    // Mobile Settings
    await mobilePage.goto(`${TARGET_URL}/#/settings`, { waitUntil: 'networkidle', timeout: 30000 });
    await mobilePage.waitForTimeout(800);

    mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assertCheck('Mobile Settings: No horizontal overflow', !mobileOverflow);

    const settingsMobileShot = path.join(QA_DIR, 'hom302-settings-mobile.png');
    await mobilePage.screenshot({ path: settingsMobileShot, fullPage: true });
    assertCheck('Screenshot captured: hom302-settings-mobile.png', fs.existsSync(settingsMobileShot));

    // Mobile Agents
    await mobilePage.goto(`${TARGET_URL}/#/agents`, { waitUntil: 'networkidle', timeout: 30000 });
    await mobilePage.waitForTimeout(800);

    mobileOverflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assertCheck('Mobile Agents: No horizontal overflow', !mobileOverflow);

    const arrowDownwardIcons = mobilePage.locator('svg[data-testid="ArrowDownwardIcon"]');
    assertCheck('Mobile: Pipeline flow renders vertical ArrowDownwardIcons', (await arrowDownwardIcons.count()) >= 4);

    const agentsMobileShot = path.join(QA_DIR, 'hom302-agents-mobile.png');
    await mobilePage.screenshot({ path: agentsMobileShot, fullPage: true });
    assertCheck('Screenshot captured: hom302-agents-mobile.png', fs.existsSync(agentsMobileShot));

    await mobileContext.close();

  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log(`  HOM-302 Playwright E2E Results: ${passedTests} / ${totalTests} checks passed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal Playwright E2E Error:', err);
  process.exit(1);
});
