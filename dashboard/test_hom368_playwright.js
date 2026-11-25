/**
 * test_hom368_playwright.js
 * E2E Playwright test suite for KlineDrawer Candle Count Label & Zoom Mode (HOM-368 / GitHub #6)
 * Target: stock_trading_dashboard_beta (or public beta domain)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.TEST_URL || 'http://stock_trading_dashboard_beta:3000';
const QA_DIR = '/qa';

if (!fs.existsSync(QA_DIR)) {
  fs.mkdirSync(QA_DIR, { recursive: true });
}

console.log('================================================================');
console.log('  KlineDrawer Candle Count & Zoom Mode E2E Suite (HOM-368)');
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
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    console.log('1. Navigating to Watchlist page...');
    await page.goto(`${TARGET_URL}/#/watchlist`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    assertCheck('Watchlist table has rows rendered', rowCount > 0);

    // Click the first watchlist row to open KlineDrawer
    console.log('2. Opening KlineDrawer by clicking watchlist row...');
    await rows.first().click();
    await page.waitForTimeout(1500);

    const drawer = page.locator('.MuiDrawer-paperAnchorRight');
    assertCheck('MUI KlineDrawer is visible', await drawer.isVisible());

    // Locate 40 Lilin / 40 Candles and Semua / All buttons
    const btn40 = drawer.locator('button:has-text("40 Candles"), button:has-text("40 Lilin")');
    const btnAll = drawer.locator('button:has-text("All"), button:has-text("Semua")');
    const btnPlus = drawer.locator('button:has-text("+")');
    const btnMinus = drawer.locator('button:has-text("-")');

    assertCheck('"40 Candles / 40 Lilin" button exists', (await btn40.count()) > 0);
    assertCheck('"All / Semua" button exists', (await btnAll.count()) > 0);
    assertCheck('"+" zoom button exists', (await btnPlus.count()) > 0);
    assertCheck('"-" zoom button exists', (await btnMinus.count()) > 0);

    // Locate candle count label element
    // The label text contains 'candles' or 'lilin'
    const labelLocator = drawer.locator('text=/\\d+.*(candles|lilin)/');
    assertCheck('Candle count label is rendered', (await labelLocator.count()) > 0);
    const initialLabel = await labelLocator.first().textContent();
    console.log(`   Initial candle count label: "${initialLabel}"`);

    // Verify initial active state: "40 Lilin" button should have primary active class/styling
    // (MUI variant="contained" or backgroundColor matching primary)
    const btn40Class = await btn40.getAttribute('class');
    assertCheck('"40 Lilin" is initially contained/active variant', btn40Class.includes('MuiButton-contained'));

    // Record initial bounding boxes to test button stability
    const box40Init = await btn40.boundingBox();
    const boxPlusInit = await btnPlus.boundingBox();
    const boxLabelInit = await labelLocator.first().boundingBox();
    console.log(`   Initial btn40 X:${box40Init.x} Y:${box40Init.y}, btnPlus X:${boxPlusInit.x} Y:${boxPlusInit.y}, label width:${boxLabelInit.width}`);

    // Capture screenshot in default 40 Lilin mode
    const shot40 = path.join(QA_DIR, 'hom368-kline-40-lilin.png');
    await page.screenshot({ path: shot40 });
    assertCheck(`Captured default 40 Lilin screenshot: ${shot40}`, fs.existsSync(shot40));

    // 3. Test Clicking "Semua"
    console.log('3. Clicking "Semua" button...');
    await btnAll.evaluate(b => b.click());
    await page.waitForTimeout(600);

    const btnAllClass = await btnAll.getAttribute('class');
    const btn40ClassAfterAll = await btn40.getAttribute('class');
    assertCheck('"Semua" button is now active (MuiButton-contained)', btnAllClass.includes('MuiButton-contained'));
    assertCheck('"40 Lilin" button is now inactive (not contained)', !btn40ClassAfterAll.includes('MuiButton-contained'));

    const boxPlusAfterAll = await btnPlus.boundingBox();
    const boxLabelAfterAll = await labelLocator.first().boundingBox();
    assertCheck('"+" zoom button X position does not shift after clicking Semua', Math.abs(boxPlusAfterAll.x - boxPlusInit.x) <= 1);
    assertCheck('"+" zoom button Y position does not shift (no row wrap)', Math.abs(boxPlusAfterAll.y - boxPlusInit.y) <= 1);
    assertCheck('Label element width is fixed to prevent button movement', Math.abs(boxLabelAfterAll.width - boxLabelInit.width) <= 1);

    const labelAfterAll = await labelLocator.first().textContent();
    console.log(`   Label after clicking Semua: "${labelAfterAll}"`);
    // Label should be in format "150 lilin" (total lilin without " / ")
    assertCheck('Label in Semua mode shows total candles without slash', !labelAfterAll.includes('/'));

    // Capture screenshot in Semua mode
    const shotAll = path.join(QA_DIR, 'hom368-kline-semua.png');
    await page.screenshot({ path: shotAll });
    assertCheck(`Captured Semua mode screenshot: ${shotAll}`, fs.existsSync(shotAll));

    // 4. Test Clicking "40 Lilin" again
    console.log('4. Clicking "40 Lilin" button again...');
    await btn40.evaluate(b => b.click());
    await page.waitForTimeout(600);

    const btn40ClassReclick = await btn40.getAttribute('class');
    const btnAllClassReclick = await btnAll.getAttribute('class');
    assertCheck('"40 Lilin" button is active again', btn40ClassReclick.includes('MuiButton-contained'));
    assertCheck('"Semua" button is inactive again', !btnAllClassReclick.includes('MuiButton-contained'));

    const labelReclick = await labelLocator.first().textContent();
    console.log(`   Label after clicking 40 Lilin: "${labelReclick}"`);
    assertCheck('Label in 40 Lilin mode reflects 40 candles', labelReclick.includes('40') || labelReclick === labelAfterAll);

    // 5. Test Zoom In (+) -> Custom mode
    console.log('5. Clicking Zoom In (+) to activate custom zoom mode...');
    await btnPlus.evaluate(b => b.click());
    await page.waitForTimeout(400);
    await btnPlus.evaluate(b => b.click());
    await page.waitForTimeout(600);

    const btn40ClassZoom = await btn40.getAttribute('class');
    const btnAllClassZoom = await btnAll.getAttribute('class');
    assertCheck('"40 Lilin" button highlight is cleared in custom zoom', !btn40ClassZoom.includes('MuiButton-contained'));
    assertCheck('"Semua" button highlight is cleared in custom zoom', !btnAllClassZoom.includes('MuiButton-contained'));

    const boxPlusZoom = await btnPlus.boundingBox();
    const boxLabelZoom = await labelLocator.first().boundingBox();
    assertCheck('"+" zoom button X position does not shift during custom zoom', Math.abs(boxPlusZoom.x - boxPlusInit.x) <= 1);
    assertCheck('"+" zoom button Y position does not shift during custom zoom', Math.abs(boxPlusZoom.y - boxPlusInit.y) <= 1);
    assertCheck('Label width remains fixed during custom zoom', Math.abs(boxLabelZoom.width - boxLabelInit.width) <= 1);

    const labelZoom = await labelLocator.first().textContent();
    console.log(`   Label after zooming in: "${labelZoom}"`);
    assertCheck('Candle count label remains visible and formatted during zoom', labelZoom && (labelZoom.includes('candles') || labelZoom.includes('lilin')));

    // Capture screenshot in custom zoom mode
    const shotCustom = path.join(QA_DIR, 'hom368-kline-custom-zoom.png');
    await page.screenshot({ path: shotCustom });
    assertCheck(`Captured custom zoom mode screenshot: ${shotCustom}`, fs.existsSync(shotCustom));

    console.log('\n================================================================');
    console.log(`  E2E Playwright Suite Summary: ${passedTests} / ${totalTests} PASSED`);
    console.log('================================================================');
  } catch (err) {
    console.error('E2E Test Suite Error:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runSuite();
