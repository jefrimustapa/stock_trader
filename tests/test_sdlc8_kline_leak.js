/**
 * test_sdlc8_kline_leak.js
 * Automated test for SDLC Step 8 (HOM-265):
 * Verifies that opening K-line drawer, switching timeframes (1D -> 15M -> 5M),
 * and closing drawer restores all interval ref_counts back to initial baseline.
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TEST_URL || 'http://stock_trading_dashboard:3000';
const SERVICE_TOKEN = process.env.BRIDGE_SERVICE_TOKEN;

if (!SERVICE_TOKEN) {
  console.error('Fatal: BRIDGE_SERVICE_TOKEN is required.');
  process.exit(1);
}

async function run() {
  console.log('=== SDLC Step 8: K-line Subscription Leak & Timeframe Switch Test ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const parsed = new URL(TARGET_URL);
  await context.addCookies([
    {
      name: 'authentik_service_token',
      value: SERVICE_TOKEN,
      domain: parsed.hostname,
      path: '/',
    },
  ]);

  const page = await context.newPage();

  // 1. Fetch initial subscriptions baseline
  const initialRes = await context.request.get(`${TARGET_URL}/api/kline/subscriptions`);
  if (!initialRes.ok()) {
    console.error('Failed to get /api/kline/subscriptions:', initialRes.status());
    process.exit(1);
  }
  const initialData = await initialRes.json();
  const getSubRef = (data, key) => (data.subscriptions || []).find((s) => s.key === key)?.ref_count || 0;

  const baseDay = getSubRef(initialData, 'US.SMA:day');
  const base15m = getSubRef(initialData, 'US.SMA:15m');
  const base5m = getSubRef(initialData, 'US.SMA:5m');

  console.log(`[Baseline] US.SMA:day=${baseDay}, US.SMA:15m=${base15m}, US.SMA:5m=${base5m}`);

  // 2. Navigate to Watchlist & Open US.SMA
  await page.goto(`${TARGET_URL}/#/watchlist`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const smaRow = page.locator('tr:has-text("US.SMA")');
  if ((await smaRow.count()) === 0) {
    console.error('US.SMA row not found in watchlist');
    process.exit(1);
  }
  await smaRow.first().click();
  await page.waitForTimeout(1000);

  const drawer = page.locator('.MuiDrawer-paperAnchorRight');
  const btn15M = drawer.getByRole('button', { name: '15M', exact: true });
  const btn5M = drawer.getByRole('button', { name: '5M', exact: true });

  // 3. Switch to 15M
  console.log('Switching to 15M...');
  await btn15M.click();
  await page.waitForTimeout(1000);

  // 4. Switch to 5M
  console.log('Switching to 5M...');
  await btn5M.click();
  await page.waitForTimeout(1000);

  // 5. Close drawer
  console.log('Closing drawer...');
  const closeBtn = drawer.locator('button[title="Tutup panel"]');
  await closeBtn.click();
  await page.waitForTimeout(800);

  // 6. Fetch final subscriptions and compare with baseline
  const finalRes = await context.request.get(`${TARGET_URL}/api/kline/subscriptions`);
  const finalData = await finalRes.json();

  const finalDay = getSubRef(finalData, 'US.SMA:day');
  const final15m = getSubRef(finalData, 'US.SMA:15m');
  const final5m = getSubRef(finalData, 'US.SMA:5m');

  console.log(`[Final]    US.SMA:day=${finalDay}, US.SMA:15m=${final15m}, US.SMA:5m=${final5m}`);

  await browser.close();

  const passed = (finalDay === baseDay) && (final15m === base15m) && (final5m === base5m);
  if (passed) {
    console.log('✓ PASS: All interval ref_counts returned exactly to baseline!');
    process.exit(0);
  } else {
    console.error(`✗ FAIL: Subscription leak detected! day: ${baseDay}->${finalDay}, 15m: ${base15m}->${final15m}, 5m: ${base5m}->${final5m}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
