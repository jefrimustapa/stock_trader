/**
 * test_screener_settings_e2e.js
 * E2E Playwright test suite for Configurable Max Candidates Per Lane (HOM-282 / Issue #3).
 * Validates UAC 1, UAC 2, UAC 3, and responsive rendering on container playwright-inno-x per HOM-237.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TEST_URL || 'http://stock_trading_dashboard:3000';
const SERVICE_TOKEN = process.env.BRIDGE_SERVICE_TOKEN;
if (!SERVICE_TOKEN) {
  console.error('Fatal Configuration Error: BRIDGE_SERVICE_TOKEN environment variable is required.');
  process.exit(1);
}
const QA_DIR = '/qa';

if (!fs.existsSync(QA_DIR)) {
  fs.mkdirSync(QA_DIR, { recursive: true });
}

console.log('================================================================');
console.log('  Screener Max Candidates Per Lane Settings E2E Suite (HOM-282)');
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

async function runSuite() {
  const browser = await chromium.launch({ headless: true });

  try {
    // -------------------------------------------------------------------------
    // Scenario 1: Desktop Viewport (1280 x 800) - Settings Page UI & BVA
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 1: Desktop Settings Page (1280 x 800) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const parsedTarget = new URL(TARGET_URL);
    await desktopContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);

    const page = await desktopContext.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // 1. Navigate to Settings page
    await page.goto(`${TARGET_URL}/#/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // Verify Title and Subtitle
    const heading = page.locator('#page-settings h5');
    assertCheck('Settings Page title rendered', (await heading.count()) > 0);

    // UAC 1: Verify max_candidates_per_lane input field and Moomoo quota notice
    const laneInput = page.locator('#inputMaxCandidatesPerLane');
    assertCheck('Input field #inputMaxCandidatesPerLane is visible', await laneInput.isVisible());

    const initialVal = await laneInput.inputValue();
    console.log(`  Current initial max_candidates_per_lane: ${initialVal}`);
    assertCheck('Initial value is a valid number between 1 and 20', Number(initialVal) >= 1 && Number(initialVal) <= 20);

    // Verify Moomoo quota safety notice card
    const quotaNotice = page.locator('text=Kuota K-line Moomoo OpenAPI (100 / 30 Hari)');
    assertCheck('Moomoo quota safety notice card rendered', (await quotaNotice.count()) >= 1);

    // Verify Presets exist
    const presetKonservatif = page.locator('text=Konservatif (3 kaunter / 6 maks)');
    const presetLalai = page.locator('text=Lalai (5 kaunter / 10 maks)');
    const presetAgresif = page.locator('text=Agresif (10 kaunter / 20 maks)');
    assertCheck('Preset Konservatif rendered', (await presetKonservatif.count()) >= 1);
    assertCheck('Preset Lalai rendered', (await presetLalai.count()) >= 1);
    assertCheck('Preset Agresif rendered', (await presetAgresif.count()) >= 1);

    // Verify Sidebar summary card displays Calon Per Lorong
    const summaryCardDisplay = page.locator('#displayMaxCandidatesPerLane');
    assertCheck('Sidebar summary displays Calon Per Lorong', await summaryCardDisplay.isVisible());

    const btnSave = page.locator('#btnSaveConfig');
    assertCheck('Save button #btnSaveConfig is visible', await btnSave.isVisible());

    // UAC 3: Negative / Out-of-bounds validation test (< 1)
    console.log('\n  Testing invalid value (0 kaunter)...');
    await laneInput.fill('0');
    await page.waitForTimeout(300);

    await btnSave.click();
    await page.waitForTimeout(500);

    // Check error message displayed
    const errorNotice = page.locator('text=Had calon per lorong mestilah antara 1 dan 20 kaunter');
    assertCheck('Error validation displayed for 0 kaunter', (await errorNotice.count()) >= 1);

    // UAC 3: Out-of-bounds validation test (> 20)
    console.log('  Testing invalid value (25 kaunter)...');
    await laneInput.fill('25');
    await page.waitForTimeout(300);
    await btnSave.click();
    await page.waitForTimeout(500);
    assertCheck('Error validation displayed for 25 kaunter', (await page.locator('text=Had calon per lorong mestilah antara 1 dan 20 kaunter').count()) >= 1);

    // UAC 2: Valid configuration update (e.g. 8 kaunter)
    console.log('\n  Testing valid configuration update (8 kaunter)...');
    await laneInput.fill('8');
    await page.waitForTimeout(300);
    await btnSave.click();
    await page.waitForTimeout(1000);

    // Verify Success alert
    const successAlert = page.locator('text=Tetapan screener berjaya dikemas kini!');
    assertCheck('Success alert displayed after saving valid config', (await successAlert.count()) >= 1);

    // Verify summary card updated
    const updatedSummary = await summaryCardDisplay.textContent();
    console.log(`  Updated summary card text: ${updatedSummary}`);
    assertCheck('Summary card updated to 8 kaunter', updatedSummary.includes('8'));

    // Capture desktop screenshot
    const desktopScreenshot = path.join(QA_DIR, 'screener-settings-desktop.png');
    await page.screenshot({ path: desktopScreenshot, fullPage: true });
    assertCheck(`Captured desktop screenshot to ${desktopScreenshot}`, fs.existsSync(desktopScreenshot));

    await desktopContext.close();

    // -------------------------------------------------------------------------
    // Scenario 2: Mobile Viewport (390 x 844) - Responsive Layout Verification
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Mobile Viewport (390 x 844) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await mobileContext.addCookies([
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);

    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${TARGET_URL}/#/settings`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(600);

    const mobileLaneInput = mobilePage.locator('#inputMaxCandidatesPerLane');
    assertCheck('Mobile: Input field #inputMaxCandidatesPerLane visible', await mobileLaneInput.isVisible());

    // Test clicking preset Agresif (10)
    console.log('  Testing Mobile: clicking Preset Agresif (10)...');
    await mobilePage.locator('text=Agresif (10 kaunter / 20 maks)').click();
    await mobilePage.waitForTimeout(300);

    const mobileVal = await mobileLaneInput.inputValue();
    assertCheck('Mobile: Preset Agresif populated input with 10', mobileVal === '10');

    // Save configuration
    await mobilePage.locator('#btnSaveConfig').click();
    await mobilePage.waitForTimeout(1000);
    assertCheck('Mobile: Success alert displayed after saving config', (await mobilePage.locator('text=Tetapan screener berjaya dikemas kini!').count()) >= 1);

    // Capture mobile screenshot
    const mobileScreenshot = path.join(QA_DIR, 'screener-settings-mobile.png');
    await mobilePage.screenshot({ path: mobileScreenshot, fullPage: true });
    assertCheck(`Captured mobile screenshot to ${mobileScreenshot}`, fs.existsSync(mobileScreenshot));

    await mobileContext.close();

    console.log('\n================================================================');
    console.log(`  E2E Test Suite Completed: ${passedTests}/${totalTests} Passed`);
    console.log('================================================================\n');

  } catch (err) {
    console.error('Test run error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runSuite();
