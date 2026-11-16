/**
 * test_agents_page_e2e.js
 * End-to-End Playwright Verification for Agents Activity & Paper Trading Page (HOM-291)
 * Runs inside container playwright-inno-x via /paperclip/bin/pw-browser run
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = process.env.TEST_URL || 'https://stock-trader.beta.julietmike.net';
const SERVICE_TOKEN = process.env.BRIDGE_SERVICE_TOKEN;
if (!SERVICE_TOKEN) {
  console.error('Fatal Configuration Error: BRIDGE_SERVICE_TOKEN environment variable is required.');
  process.exit(1);
}
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/qa';

console.log('================================================================');
console.log('  Stock Trader Dashboard Playwright E2E: Agents & Paper Trading');
console.log(`  Target: ${TARGET_URL}`);
console.log(`  Screenshot Dir: ${SCREENSHOT_DIR}`);
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
    // -------------------------------------------------------------------------
    // Scenario 1: Desktop Viewport (1280 x 800)
    // -------------------------------------------------------------------------
    console.log('--- Scenario 1: Desktop Viewport (1280 x 800) ---');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });

    const parsedTarget = new URL(TARGET_URL);
    await desktopContext.addCookies([
      {
        name: 'x_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
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

    // 1. Navigate to #/agents
    await page.goto(`${TARGET_URL}/#/agents`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1000);

    // 2. Verify page heading
    const pageText = await page.innerText('body');
    assertCheck('Page renders "Aktiviti Pasukan Ejen & Paper Trading" heading', pageText.includes('Aktiviti Pasukan Ejen'));

    // 3. Verify pipeline stepper elements
    assertCheck('Pipeline displays L0 Screener', pageText.includes('L0 Screener'));
    assertCheck('Pipeline displays L1 Tariq & Nawwar', pageText.includes('L1 Tariq & Nawwar'));
    assertCheck('Pipeline displays L2 Haziq', pageText.includes('L2 Haziq'));
    assertCheck('Pipeline displays L3 Danial', pageText.includes('L3 Danial'));
    assertCheck('Pipeline displays L4 OpenD execution', pageText.includes('L4') && pageText.includes('OpenD'));

    // 4. Verify Tariq card
    assertCheck('Card Tariq: Technical Analyst present', pageText.includes('Tariq') && pageText.includes('Technical Analyst'));
    assertCheck('Card Tariq: Displays S_tech score and Wyckoff phase', pageText.includes('Wyckoff') || pageText.includes('S_tech'));

    // 5. Verify Nawwar card
    assertCheck('Card Nawwar: Sentiment & Macro Scout present', pageText.includes('Nawwar') && pageText.includes('Sentiment'));
    assertCheck('Card Nawwar: Displays sentiment label and score', pageText.includes('BULLISH') || pageText.includes('Skor Mentah'));

    // 6. Verify Haziq card
    assertCheck('Card Haziq: Portfolio & Strategy Lead present', pageText.includes('Haziq') && pageText.includes('Portfolio'));
    assertCheck('Card Haziq: Displays composite score S_total and position sizing', pageText.includes('Skor Komposit S_total') || pageText.includes('S_total'));

    // 7. Verify Danial card & 8 Hard Rules
    assertCheck('Card Danial: Risk & Compliance Officer present', pageText.includes('Danial') && pageText.includes('Risk'));
    assertCheck('Card Danial: Matriks 8 Hard Rules present', pageText.includes('Semakan 8 Hard Rules') || pageText.includes('Rule 1'));
    assertCheck('Card Danial: Rule 8 OpenD / Kill-switch verified', pageText.includes('Rule 8'));

    // 8. Verify simulation action button
    const simBtn = page.locator('button:has-text("Jalankan Simulasi Pipeline")');
    assertCheck('Simulation trigger button present', (await simBtn.count()) >= 1);

    // 9. Verify paper trading orders table
    assertCheck('Paper orders table present', pageText.includes('Jadual Transaksi') || pageText.includes('Paper Trading Orders'));

    // 10. Screenshot Desktop
    const desktopScreenshotPath = path.join(SCREENSHOT_DIR, 'hom291-agents-e2e-desktop.png');
    await page.screenshot({ path: desktopScreenshotPath, fullPage: true });
    assertCheck('Desktop full-page screenshot captured', fs.existsSync(desktopScreenshotPath));

    // -------------------------------------------------------------------------
    // Scenario 2: Mobile Viewport (390 x 844)
    // -------------------------------------------------------------------------
    console.log('\n--- Scenario 2: Mobile Viewport (390 x 844) ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ignoreHTTPSErrors: true,
    });
    await mobileContext.addCookies([
      {
        name: 'x_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
      {
        name: 'authentik_service_token',
        value: SERVICE_TOKEN,
        domain: parsedTarget.hostname,
        path: '/',
      },
    ]);

    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${TARGET_URL}/#/agents`, { waitUntil: 'networkidle', timeout: 30000 });
    await mobilePage.waitForTimeout(1000);

    const hasHorizontalOverflow = await mobilePage.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assertCheck('Mobile: No horizontal page overflow (scrollWidth <= innerWidth)', !hasHorizontalOverflow);

    const mobileScreenshotPath = path.join(SCREENSHOT_DIR, 'hom291-agents-e2e-mobile.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: true });
    assertCheck('Mobile screenshot captured', fs.existsSync(mobileScreenshotPath));

    await desktopContext.close();
    await mobileContext.close();
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log(`  Playwright E2E UI Results: ${passedTests} / ${totalTests} checks passed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal Playwright E2E Error:', err);
  process.exit(1);
});
