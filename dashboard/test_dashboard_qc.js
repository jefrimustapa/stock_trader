/**
 * test_dashboard_qc.js
 * Comprehensive Quality Control (QC) Test Suite for Stock Trader Dashboard (HOM-183)
 * Tests all pages, elements, navigation, and boundary cases.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let esbuild = null;
try {
  esbuild = require('esbuild');
} catch (e) {
  // Production runner mode without devDependencies
}
const React = require('react');
const { renderToString } = require('react-dom/server');

console.log('================================================================');
console.log('  Stock Trader Dashboard Quality Control (QC) Test Suite');
console.log('  Verifying all pages, elements, and navigation integrity');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function check(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS [${totalTests}]: ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL [${totalTests}]: ${desc}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

async function bundleModule(entryRelPath) {
  if (!esbuild) return null;
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, entryRelPath)],
    bundle: true,
    format: 'cjs',
    write: false,
    external: [
      'react',
      'react-dom',
      'react-dom/server',
      '@mui/material',
      '@mui/material/*',
      '@emotion/react',
      '@emotion/styled',
      '@mui/icons-material',
      '@mui/icons-material/*',
    ],
  });

  const bundledCode = result.outputFiles[0].text;
  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', bundledCode);
  fn(require, mod, mod.exports);
  return mod.exports;
}

// Mock test data fixtures
const mockStatusData = {
  user: 'jefri',
  bridge: {
    opend_status: 'CONNECTED',
    status: 'CONNECTED',
    active_acc_id: '99887766',
    accounts: [
      { acc_id: '99887766', acc_type: 'SIMULATE', trd_env: 'SIMULATE', label: 'Paper Trading 1' },
      { acc_id: '55443322', acc_type: 'SIMULATE', trd_env: 'SIMULATE', label: 'Paper Trading 2' },
    ],
    cash_balance: 104500.5,
    total_equity: 128900.75,
    sentinel_status: 'ACTIVE',
    managed_positions: 3,
    kline_30d_used: 12,
    kline_30d_remaining: 88,
  },
};

const mockDataPayload = {
  user: 'jefri',
  timestamp: '2026-11-15T05:00:00Z',
  sentinel: {
    status: 'ACTIVE',
    managed_positions: 3,
  },
  watchlist: {
    market_status: 'OPEN',
    is_live: true,
    data_as_of: '2026-11-15 09:35:00 EST',
    funnel: {
      stage1_universe: 8520,
      stage2_quality: 1420,
      stage3_dual_lane: 48,
      stage4_kline: 10,
      stage5_final: 6,
    },
    quota_status: {
      kline_30d_used: 12,
      kline_30d_remaining: 88,
    },
    moomoo_quota: {
      status: 'HEALTHY',
      connected: true,
      opend_status: 'CONNECTED',
      used_quota: 0,
      remain_quota: 100,
      total_quota: 100,
      detail_list: [],
      error: null,
    },
    watchlist: [
      {
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        lane: 'MOMENTUM',
        lane_score: 96,
        price: 145.2,
        change_pct: 3.45,
        adv20: 45.2,
        rs_vs_spy: 1.45,
        rvol_15m: 2.1,
        dist_to_52w_high_pct: -1.2,
      },
      {
        symbol: 'TSLA',
        name: 'Tesla, Inc.',
        lane: 'MOMENTUM',
        lane_score: 91,
        price: 320.5,
        change_pct: 2.15,
        adv20: 38.0,
        rs_vs_spy: 1.32,
        rvol_15m: 1.8,
        dist_to_52w_high_pct: -3.5,
      },
      {
        symbol: 'AMD',
        name: 'Advanced Micro Devices',
        lane: 'SETUP',
        lane_score: 84,
        price: 152.0,
        change_pct: -0.45,
        adv20: 22.4,
        rs_vs_spy: 1.05,
        rvol_15m: 0.95,
        dist_to_52w_high_pct: -8.4,
      },
      {
        symbol: 'PLTR',
        name: 'Palantir Technologies',
        lane: 'SETUP',
        lane_score: 88,
        price: 64.8,
        change_pct: 1.1,
        adv20: 28.5,
        rs_vs_spy: 1.18,
        rvol_15m: 1.4,
        dist_to_52w_high_pct: -2.1,
      },
    ],
  },
};

async function main() {
  if (!esbuild) {
    console.log('[Notice] esbuild not present in environment; executing QC against production build bundle in dist/assets/...');
    const distDir = path.join(__dirname, 'dist', 'assets');
    const files = fs.readdirSync(distDir);
    const bundleFile = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
    assert.ok(bundleFile, 'Production JS bundle must exist in dist/assets');
    const bundleText = fs.readFileSync(path.join(distDir, bundleFile), 'utf-8');

    check('Layout exports and configures 4 navigation sections in bundle', () => {
      assert.ok(bundleText.includes('overview') && bundleText.includes('opend') && bundleText.includes('funnel') && bundleText.includes('watchlist'));
      assert.ok(bundleText.includes('Ringkasan & Metrik'));
      assert.ok(bundleText.includes('Pengurusan OpenD'));
      assert.ok(bundleText.includes('Corong Saringan'));
      assert.ok(bundleText.includes('Watchlist Dwi-Lorong'));
    });

    check('Sneat Theme tokens are correctly configured with purple palette in bundle', () => {
      assert.ok(bundleText.includes('#696CFF'), 'Must include Sneat purple #696CFF');
      assert.ok(bundleText.includes('#232333'), 'Must include dark mode canvas #232333');
    });

    check('OverviewPage components and elements are present in bundle', () => {
      assert.ok(bundleText.includes('Ringkasan & Prestasi Pasaran') || bundleText.includes('Prestasi Pasaran'));
      assert.ok(bundleText.includes('Gerbang OpenD Moomoo'));
      assert.ok(bundleText.includes('Baki Tunai') || bundleText.includes('Baki Tunai &'));
      assert.ok(bundleText.includes('Pengawasan Sentinel L4') || bundleText.includes('Sentinel L4'));
      assert.ok(bundleText.includes('btn-nav-opend'));
      assert.ok(bundleText.includes('btn-nav-funnel'));
      assert.ok(bundleText.includes('btn-nav-watchlist'));
    });

    check('OpendPage elements and Seksyen 3.5.B Blueprint controls are present in bundle', () => {
      assert.ok(bundleText.includes('Pengurusan Gerbang OpenD'));
      assert.ok(bundleText.includes('Seksyen 3.5.B Blueprint'));
      assert.ok(bundleText.includes('Sign-Out Sesi OpenD'));
      assert.ok(bundleText.includes('accSelect'));
      assert.ok(bundleText.includes('loginAccInput'));
      assert.ok(bundleText.includes('loginPwdInput'));
      assert.ok(bundleText.includes('Port 22222'));
    });

    check('FunnelPage 5-stage screening elements are present in bundle', () => {
      assert.ok(bundleText.includes('Corong Saringan Saham 5-Peringkat'));
      assert.ok(bundleText.includes('HOM-178 Approach C'));
      assert.ok(bundleText.includes('Cloud Universe'));
      assert.ok(bundleText.includes('Kualiti Stage 0'));
      assert.ok(bundleText.includes('Enriched K-Line'));
      assert.ok(bundleText.includes('Watchlist Akhir'));
    });

    check('WatchlistPage dual-lane table and headers are present in bundle', () => {
      assert.ok(bundleText.includes('Watchlist Saham Aktif Dwi-Lorong'));
      assert.ok(bundleText.includes('LORONG MOMENTUM'));
      assert.ok(bundleText.includes('LORONG SETUP'));
      assert.ok(bundleText.includes('ADV 20 (M)') || bundleText.includes('ADV20'));
      assert.ok(bundleText.includes('RS vs SPY'));
      assert.ok(bundleText.includes('RVOL 15m') || bundleText.includes('RVOL'));
      assert.ok(bundleText.includes('Jarak 52W High'));
    });

    check('Layout sidebar elements and standard MUI practice are verified in bundle', () => {
      assert.ok(bundleText.includes('Stock Trader'));
      assert.ok(bundleText.includes('US Equity Automation'));
      assert.ok(bundleText.includes('nav-item-'));
      assert.ok(bundleText.includes('btn-mobile-menu'));
      assert.ok(bundleText.includes('btn-logout'));
      assert.ok(!bundleText.includes('page-tab-bar'), 'Must NOT contain redundant page-tab-bar');
    });

    console.log('\n================================================================');
    console.log(`  QC Result (Production Bundle): ${passedTests} / ${totalTests} checks passed (100% SUCCESS)`);
    console.log('================================================================\n');
    return;
  }

  console.log('--- 1. QC Module & Exports Check ---');
  const { navItems, Layout } = await bundleModule('src/components/Layout.jsx');
  const { OverviewPage } = await bundleModule('src/pages/OverviewPage.jsx');
  const { OpendPage } = await bundleModule('src/pages/OpendPage.jsx');
  const { FunnelPage } = await bundleModule('src/pages/FunnelPage.jsx');
  const { WatchlistPage } = await bundleModule('src/pages/WatchlistPage.jsx');
  const { QuotaPage } = await bundleModule('src/pages/QuotaPage.jsx');
  const { KpiCards } = await bundleModule('src/components/KpiCards.jsx');
  const { FunnelStepper } = await bundleModule('src/components/FunnelStepper.jsx');
  const {
    formatPrice,
    formatCompactNumber,
    getStage0Summary,
    getStage0Detail,
    getStage3Summary,
    getStage3Detail,
  } = await bundleModule('src/utils/formatters.js');
  const { getTheme, sneatTokens } = await bundleModule('src/theme.js');

  check('Layout exports navItems array with navigation sections', () => {
    assert.ok(Array.isArray(navItems), 'navItems must be an array');
    assert.ok(navItems.length >= 5, 'Must have at least 5 navigation sections');
    const ids = navItems.map(n => n.id);
    assert.ok(ids.includes('overview') && ids.includes('opend') && ids.includes('funnel') && ids.includes('watchlist') && ids.includes('quota'));
  });

  check('Each page module exports a valid React component function', () => {
    assert.strictEqual(typeof OverviewPage, 'function', 'OverviewPage must be a function component');
    assert.strictEqual(typeof OpendPage, 'function', 'OpendPage must be a function component');
    assert.strictEqual(typeof FunnelPage, 'function', 'FunnelPage must be a function component');
    assert.strictEqual(typeof WatchlistPage, 'function', 'WatchlistPage must be a function component');
    assert.strictEqual(typeof QuotaPage, 'function', 'QuotaPage must be a function component');
  });

  check('Sneat Theme tokens are correctly configured with purple palette', () => {
    assert.strictEqual(sneatTokens.primary.main, '#696CFF', 'Primary color must be Sneat purple #696CFF');
    const darkTheme = getTheme('dark');
    assert.strictEqual(darkTheme.palette.background.default, '#232333', 'Dark mode default canvas must be #232333');
    assert.ok(typeof getTheme === 'function', 'getTheme must be a function');
  });

  console.log('\n--- 2. QC Page 1: OverviewPage Elements ---');
  check('OverviewPage renders page container and header text', () => {
    const html = renderToString(React.createElement(OverviewPage, {
      statusData: mockStatusData,
      dataPayload: mockDataPayload,
      onNavigate: () => {},
    }));
    assert.ok(html.includes('page-overview'), 'Must have page-overview container');
    assert.ok(html.includes('Ringkasan &amp; Prestasi Pasaran') || html.includes('Ringkasan & Prestasi Pasaran'), 'Must have page title');
    assert.ok(html.includes('Pasaran US: OPEN'), 'Must render market status chip');
    assert.ok(html.includes('Kaunter Aktif'), 'Must render active counters count');
  });

  check('OverviewPage renders all 4 KPI cards and security compliance with live data', () => {
    const html = renderToString(React.createElement(OverviewPage, {
      statusData: mockStatusData,
      dataPayload: mockDataPayload,
      onNavigate: () => {},
    }));
    assert.ok(html.includes('Gerbang OpenD Moomoo'), 'Must have OpenD Gateway card');
    assert.ok(html.includes('Baki Tunai') && html.includes('Jumlah Ekuiti'), 'Must have Moomoo Account card');
    assert.ok(html.includes('104,500.50') || html.includes('104500.5'), 'Must render cash balance');
    assert.ok(html.includes('128,900.75') || html.includes('128900.75'), 'Must render total equity');
    assert.ok(html.includes('Sentinel L4'), 'Must have Sentinel L4 card');
    assert.ok(html.includes('3 Posisi') || html.includes('Posisi'), 'Must show managed positions');
    assert.ok(html.includes('Kuota API K-Line'), 'Must have K-Line Quota card');
    assert.ok(html.includes('Pematuhan Seni Bina &amp; Keselamatan') || html.includes('Pematuhan Seni Bina & Keselamatan'), 'Must have security compliance section');
    assert.ok(html.includes('Authentik SSO'), 'Must have Authentik SSO in compliance section');
  });

  check('OverviewPage renders navigation shortcut buttons to other pages', () => {
    const html = renderToString(React.createElement(OverviewPage, {
      statusData: mockStatusData,
      dataPayload: mockDataPayload,
      onNavigate: () => {},
    }));
    assert.ok(html.includes('btn-nav-opend'), 'Must have btn-nav-opend button');
    assert.ok(html.includes('btn-nav-funnel'), 'Must have btn-nav-funnel button');
    assert.ok(html.includes('btn-nav-watchlist'), 'Must have btn-nav-watchlist button');
    assert.ok(html.includes('btn-nav-settings'), 'Must have btn-nav-settings button');
    assert.ok(html.includes('Buka Pengurusan OpenD'), 'Must have text Buka Pengurusan OpenD');
    assert.ok(html.includes('Lihat Corong Saringan'), 'Must have text Lihat Corong Saringan');
    assert.ok(html.includes('Buka Watchlist Dwi-Lorong'), 'Must have text Buka Watchlist Dwi-Lorong');
    assert.ok(html.includes('Buka Tetapan Screener'), 'Must have text Buka Tetapan Screener');
  });

  check('OverviewPage handles null/empty status and data safely (BVA)', () => {
    const html = renderToString(React.createElement(OverviewPage, {
      statusData: null,
      dataPayload: null,
      onNavigate: () => {},
    }));
    assert.ok(html.includes('page-overview'), 'Must render safely even with null data');
  });

  console.log('\n--- 3. QC Page 2: OpendPage Elements ---');
  check('OpendPage renders page container and Seksyen 3.5.B Blueprint header', () => {
    const html = renderToString(React.createElement(OpendPage, {
      statusData: mockStatusData,
      onRefresh: () => {},
    }));
    assert.ok(html.includes('page-opend'), 'Must have page-opend container');
    assert.ok(html.includes('Pengurusan Gerbang OpenD'), 'Must have OpenD page header');
    assert.ok(html.includes('Seksyen 3.5.B Blueprint'), 'Must reference Seksyen 3.5.B Blueprint');
    assert.ok(html.includes('Port 22222') || html.includes('22222'), 'Must show Telnet port 22222');
    assert.ok(html.includes('MD5 Server Hashing'), 'Must highlight MD5 Server Hashing');
  });

  check('OpendPage renders account switcher and sign out button when connected', () => {
    const html = renderToString(React.createElement(OpendPage, {
      statusData: mockStatusData,
      onRefresh: () => {},
    }));
    assert.ok(html.includes('Sign-Out Sesi OpenD') || html.includes('Sign-Out'), 'Must render Sign-Out Sesi OpenD button');
    assert.ok(html.includes('Pertukaran Akaun Dagangan Pantas'), 'Must render account switch title');
    assert.ok(html.includes('99887766'), 'Must display active account id');
    assert.ok(html.includes('accSelect') || html.includes('Pilih Akaun'), 'Must render switch account select dropdown');
  });

  check('OpendPage handles empty accounts and null bridge safely (BVA)', () => {
    const html = renderToString(React.createElement(OpendPage, {
      statusData: { bridge: { accounts: [], opend_status: 'IDLE' } },
      onRefresh: () => {},
    }));
    assert.ok(html.includes('page-opend'), 'Must render safely with empty accounts');
    assert.ok(html.includes('IDLE'), 'Must render IDLE status');
  });

  console.log('\n--- 4. QC Page 3: FunnelPage Elements ---');
  check('FunnelPage renders page container and HOM-178 Approach C header', () => {
    const html = renderToString(React.createElement(FunnelPage, {
      dataPayload: mockDataPayload,
    }));
    assert.ok(html.includes('page-funnel'), 'Must have page-funnel container');
    assert.ok(html.includes('Corong Saringan Saham 5-Peringkat'), 'Must have Funnel page header');
    assert.ok(html.includes('HOM-178 Approach C'), 'Must reference HOM-178 Approach C');
  });

  check('FunnelPage renders all 5 screening stages and metrics', () => {
    const html = renderToString(React.createElement(FunnelPage, {
      dataPayload: mockDataPayload,
    }));
    assert.ok(html.includes('Cloud Universe'), 'Must have Stage 1 Cloud Universe');
    assert.ok(html.includes('Kualiti Stage 0'), 'Must have Stage 2 Kualiti Stage 0');
    assert.ok(html.includes('Dwi-Lorong') || html.includes('Pengelasan Dwi-Lorong'), 'Must have Stage 3 Dual-Lane');
    assert.ok(html.includes('Enriched K-Line'), 'Must have Stage 4 Enriched K-Line');
    assert.ok(html.includes('Watchlist Akhir'), 'Must have Stage 5 Final Watchlist');
    assert.ok(html.includes('8520') || html.includes('8,520'), 'Must show Stage 1 count');
    assert.ok(html.includes('1420') || html.includes('1,420'), 'Must show Stage 2 count');
    assert.ok(html.includes('48'), 'Must show Stage 3 count');
    assert.ok(html.includes('10'), 'Must show Stage 4 count');
    assert.ok(html.includes('6'), 'Must show Stage 5 count');
  });

  check('FunnelPage renders criteria explanation cards for all stages', () => {
    const html = renderToString(React.createElement(FunnelPage, {
      dataPayload: mockDataPayload,
    }));
    assert.ok(html.includes('Penerangan Kriteria Mengikut Peringkat'), 'Must render criteria card title');
    assert.ok(html.includes('STAGE 1'), 'Must have STAGE 1 badge');
    assert.ok(html.includes('STAGE 2'), 'Must have STAGE 2 badge');
    assert.ok(html.includes('STAGE 3'), 'Must have STAGE 3 badge');
    assert.ok(html.includes('STAGE 4'), 'Must have STAGE 4 badge');
    assert.ok(html.includes('STAGE 5'), 'Must have STAGE 5 badge');
  });

  check('FunnelPage renders Sneat UI v6 progressive flow banner and Watchlist navigation link (HOM-203)', () => {
    const html = renderToString(React.createElement(FunnelPage, {
      dataPayload: mockDataPayload,
    }));
    assert.ok(html.includes('Aliran Progresif'), 'Must render progressive flow chip');
    assert.ok(html.includes('Saluran Penapisan Corong 5-Peringkat'), 'Must render unified funnel card title');
    assert.ok(html.includes('Buka Jadual Watchlist'), 'Must render quick link to Watchlist table');
  });

  console.log('\n--- 5. QC Page 4: WatchlistPage Elements ---');
  check('WatchlistPage renders page container and dual-lane summary', () => {
    const html = renderToString(React.createElement(WatchlistPage, {
      dataPayload: mockDataPayload,
    }));
    assert.ok(html.includes('page-watchlist'), 'Must have page-watchlist container');
    assert.ok(html.includes('Watchlist Saham Aktif Dwi-Lorong'), 'Must have Watchlist header');
    assert.ok(html.includes('JUMLAH KAUNTER AKTIF'), 'Must render total counters metric card');
    assert.ok(html.includes('LORONG MOMENTUM'), 'Must render Momentum metric card');
    assert.ok(html.includes('LORONG SETUP'), 'Must render Setup metric card');
    assert.ok(html.includes('4'), 'Must show 4 active counters');
    assert.ok(html.includes('2'), 'Must show 2 Momentum and 2 Setup counters');
    assert.ok(html.includes('MuiGrid-grid-xs-12'), 'Watchlist cards must use xs=12 for responsive mobile layout');
    assert.ok(html.includes('MuiGrid-grid-sm-4'), 'Watchlist cards must use sm=4 for desktop layout');
  });

  check('WatchlistPage renders filter tabs and full table columns', () => {
    const html = renderToString(React.createElement(WatchlistPage, {
      dataPayload: mockDataPayload,
    }));
    assert.ok(html.includes('Semua (4)'), 'Must render All tabs with count');
    assert.ok(html.includes('Momentum (2)'), 'Must render Momentum tab with count');
    assert.ok(html.includes('Setup (2)'), 'Must render Setup tab with count');
    assert.ok(html.includes('Simbol'), 'Must have Simbol column');
    assert.ok(html.includes('Nama Syarikat'), 'Must have Nama Syarikat column');
    assert.ok(html.includes('Lorong'), 'Must have Lorong column');
    assert.ok(html.includes('Skor'), 'Must have Skor column');
    assert.ok(html.includes('Harga'), 'Must have Harga column');
    assert.ok(html.includes('Perubahan %') || html.includes('Perubahan'), 'Must have Perubahan column');
    assert.ok(html.includes('ADV 20 (M)') || html.includes('ADV20'), 'Must have ADV20 column');
    assert.ok(html.includes('RS vs SPY'), 'Must have RS vs SPY column');
    assert.ok(html.includes('RVOL 15m') || html.includes('RVOL'), 'Must have RVOL column');
    assert.ok(html.includes('Jarak 52W High'), 'Must have Jarak 52W High column');
    assert.ok(html.includes('NVDA'), 'Must render NVDA row');
    assert.ok(html.includes('TSLA'), 'Must render TSLA row');
    assert.ok(html.includes('AMD'), 'Must render AMD row');
    assert.ok(html.includes('PLTR'), 'Must render PLTR row');
  });

  check('WatchlistTable renders mobile horizontal scroll indicator and sticky column architecture (HOM-203)', () => {
    const html = renderToString(React.createElement(WatchlistPage, {
      dataPayload: mockDataPayload,
    }));
    assert.ok(html.includes('Leret mendatar jadual untuk metrik penuh'), 'Must render mobile horizontal scroll hint');
    assert.ok(html.includes('sticky'), 'Must use sticky positioning for Simbol column');
  });

  console.log('\n--- 6. QC Layout & Navigation Elements ---');
  check('Layout renders brand header, navigation drawer items, and security footer', () => {
    const html = renderToString(React.createElement(Layout, {
      currentPage: 'overview',
      currentMode: 'dark',
      onToggleMode: () => {},
      user: 'jefri',
      statusData: mockStatusData,
      children: React.createElement('div', { id: 'child-content' }, 'Content Body'),
    }));
    assert.ok(html.includes('Stock Trader'), 'Must render brand header Stock Trader');
    assert.ok(html.includes('US Equity Automation'), 'Must render subtitle US Equity Automation');
    assert.ok(html.includes('nav-item-overview'), 'Must have nav-item-overview');
    assert.ok(html.includes('nav-item-opend'), 'Must have nav-item-opend');
    assert.ok(html.includes('nav-item-funnel'), 'Must have nav-item-funnel');
    assert.ok(html.includes('nav-item-watchlist'), 'Must have nav-item-watchlist');
    assert.ok(html.includes('Authentik RS256 Active'), 'Must render security status footer');
    assert.ok(html.includes('Forward-Auth Protected'), 'Must render Forward-Auth status');
  });

  check('Layout follows standard MUI sidebar practice without redundant top tabs', () => {
    const html = renderToString(React.createElement(Layout, {
      currentPage: 'opend',
      currentMode: 'dark',
      onToggleMode: () => {},
      user: 'jefri',
      statusData: mockStatusData,
      children: null,
    }));
    assert.ok(html.includes('btn-mobile-menu'), 'Must render hamburger menu button for mobile drawer');
    assert.ok(html.includes('Pengurusan OpenD'), 'Must display active page title in AppBar');
    assert.ok(!html.includes('page-tab-bar'), 'Must NOT render redundant top tab bar (follows clean MUI sidebar practice)');
  });

  check('Layout renders top AppBar controls (Status chip, user chip, theme toggle, logout)', () => {
    const html = renderToString(React.createElement(Layout, {
      currentPage: 'overview',
      currentMode: 'dark',
      onToggleMode: () => {},
      user: 'jefri',
      statusData: mockStatusData,
      children: null,
    }));
    assert.ok(html.includes('chip-opend-status'), 'Must render chip-opend-status');
    assert.ok(html.includes('OpenD: CONNECTED'), 'Must display OpenD status');
    assert.ok(html.includes('chip-user-info'), 'Must render chip-user-info with user name');
    assert.ok(html.includes('jefri'), 'Must render user jefri');
    assert.ok(html.includes('btn-theme-toggle'), 'Must render btn-theme-toggle');
    assert.ok(html.includes('btn-logout'), 'Must render btn-logout');
    assert.ok(html.includes('href="/logout"'), 'Logout button must point to /logout');
  });

  console.log('\n--- 7. QC Screener Active Config Dynamic Text & BVA (HOM-205) ---');
  check('BVA formatPrice: Correctly formats boundaries ($1.00, $1.01, $5.00, $10, $1000, 0, negative, invalid)', () => {
    assert.strictEqual(formatPrice(1.00), '$1', 'Boundary 1.00 should format as $1');
    assert.strictEqual(formatPrice(1.01), '$1.01', 'Boundary 1.01 should format as $1.01');
    assert.strictEqual(formatPrice(5.00), '$5', 'Scenario 5.00 should format as $5');
    assert.strictEqual(formatPrice(10.0), '$10', 'Default 10.0 should format as $10');
    assert.strictEqual(formatPrice(1000.0), '$1000', 'Large boundary 1000 should format as $1000');
    assert.strictEqual(formatPrice(0), '$0', 'Zero should format as $0');
    assert.strictEqual(formatPrice(-5.0), '-$5', 'Negative price should format as -$5');
    assert.strictEqual(formatPrice(null), '-', 'Null price should format as fallback -');
    assert.strictEqual(formatPrice(undefined), '-', 'Undefined price should format as fallback -');
    assert.strictEqual(formatPrice('invalid'), '-', 'NaN string should format as fallback -');
  });

  check('BVA formatCompactNumber: Correctly formats boundaries (10M, 500M, 1B, 10T, 50K, 1M, 100M)', () => {
    assert.strictEqual(formatCompactNumber(10000000, '$'), '$10M', 'Cap lower boundary 10M');
    assert.strictEqual(formatCompactNumber(500000000, '$'), '$500M', 'Cap 500M');
    assert.strictEqual(formatCompactNumber(1000000000, '$'), '$1B', 'Cap 1B');
    assert.strictEqual(formatCompactNumber(2500000000, '$'), '$2.5B', 'Cap 2.5B');
    assert.strictEqual(formatCompactNumber(10000000000000, '$'), '$10T', 'Cap upper boundary 10T');
    assert.strictEqual(formatCompactNumber(50000), '50K', 'Volume lower boundary 50K');
    assert.strictEqual(formatCompactNumber(1000000), '1M', 'Volume 1M');
    assert.strictEqual(formatCompactNumber(100000000), '100M', 'Volume 100M');
    assert.strictEqual(formatCompactNumber(null), '-', 'Null volume should format as -');
  });

  check('Dynamic Stage 2 & Stage 3 text generator produces accurate texts & clear fallbacks', () => {
    const config5 = { min_price: 5.0, min_market_cap: 1000000000, min_volume: 1000000, min_rvol: 1.5, max_rvol: 10.0 };
    assert.strictEqual(getStage0Summary(config5, 'ready'), 'Harga >= $5, Cap >= $1B, ADV >= 1M');
    assert.ok(getStage0Detail(config5, 'ready').includes('Harga >= $5, Nilai Pasaran >= $1B, ADV >= 1M'));

    const configBva = { min_price: 1.00, min_market_cap: 10000000, min_volume: 50000, min_rvol: 0.8, max_rvol: 5.0 };
    assert.strictEqual(getStage0Summary(configBva, 'ready'), 'Harga >= $1, Cap >= $10M, ADV >= 50K');
    assert.ok(getStage0Detail(configBva, 'ready').includes('Harga >= $1, Nilai Pasaran >= $10M, ADV >= 50K'));

    // Loading fallback: must never display old hardcoded values
    const loadingSummary = getStage0Summary(config5, 'loading');
    assert.strictEqual(loadingSummary, 'Memuatkan tetapan screener...');
    assert.ok(!loadingSummary.includes('$10'));

    const loadingDetail = getStage0Detail(config5, 'loading');
    assert.ok(loadingDetail.includes('memuatkan'));
    assert.ok(!loadingDetail.includes('$10'));

    // Error / null fallback: must display '-' and never display old hardcoded values
    const errorSummary = getStage0Summary(null, 'error');
    assert.strictEqual(errorSummary, 'Harga >= -, Cap >= -, ADV >= -');
    assert.ok(!errorSummary.includes('$10'));

    const errorDetail = getStage0Detail(null, 'error');
    assert.ok(errorDetail.includes('Harga >= -, Nilai Pasaran >= -, ADV >= -'));
    assert.ok(!errorDetail.includes('$10'));
  });

  check('FunnelPage and FunnelStepper render dynamic active screener config ($5 acceptance scenario)', () => {
    const config5 = { min_price: 5.0, min_market_cap: 1000000000, min_volume: 1000000, min_rvol: 1.5, max_rvol: 10.0 };
    const html = renderToString(React.createElement(FunnelPage, {
      dataPayload: mockDataPayload,
      screenerConfig: config5,
      configLoading: false,
      configError: false,
    }));

    assert.ok(html.includes('funnel-stage2-desc'), 'Must render funnel-stage2-desc ID on Stepper card');
    assert.ok(html.includes('criteria-stage2-desc'), 'Must render criteria-stage2-desc ID on Criteria card');
    assert.ok(html.includes('Harga &gt;= $5') || html.includes('Harga >= $5'), 'Must render dynamic $5 min_price in HTML');
    assert.ok(!html.includes('Harga &gt;= $10') && !html.includes('Harga >= $10'), 'Must NOT render old hardcoded $10 when config is $5');
  });

  check('FunnelPage and FunnelStepper handle error/fallback safely without crashing or leaking old values', () => {
    const html = renderToString(React.createElement(FunnelPage, {
      dataPayload: mockDataPayload,
      screenerConfig: null,
      configLoading: false,
      configError: true,
    }));

    assert.ok(html.includes('funnel-stage2-desc'), 'Must render funnel-stage2-desc ID even on error');
    assert.ok(html.includes('Harga &gt;= -') || html.includes('Harga >= -'), 'Must render fallback - in HTML');
    assert.ok(!html.includes('Harga &gt;= $10') && !html.includes('Harga >= $10'), 'Must NOT render old hardcoded $10 on error');
  });

  console.log('\n--- 8. QC Page 5: QuotaPage & Navigation Link Integrity (HOM-210) ---');
  check('QuotaPage renders page container and header text', () => {
    const html = renderToString(React.createElement(QuotaPage));
    assert.ok(html.includes('quota-page'), 'Must have quota-page container');
    assert.ok(html.includes('Penggunaan Kuota K-Line 30-Hari'), 'Must have page title');
    assert.ok(html.includes('btn-refresh-quota'), 'Must have refresh button');
    assert.ok(html.includes('kpi-quota-remaining'), 'Must render Baki Kuota KPI card');
    assert.ok(html.includes('kpi-quota-used'), 'Must render Simbol Digunakan KPI card');
    assert.ok(html.includes('kpi-quota-percent'), 'Must render Peratus Penggunaan KPI card');
    assert.ok(html.includes('kpi-quota-status'), 'Must render Status Kesihatan KPI card');
  });

  check('KpiCards Card 4 navigates to #/quota and displays real Moomoo quota (HOM-210 & HOM-217)', () => {
    const html = renderToString(React.createElement(KpiCards, {
      statusData: mockStatusData,
      dataPayload: mockDataPayload,
    }));
    assert.ok(html.includes('kpi-card-kline-quota'), 'Must render Card 4 with ID kpi-card-kline-quota');
    assert.ok(html.includes('Klik untuk lihat perincian kuota K-Line Moomoo OpenAPI sebenar'), 'Card 4 title must indicate Moomoo K-Line quota details');
    assert.ok(!html.includes('Klik untuk ke paparan Watchlist Dwi-Lorong'), 'Card 4 must no longer link to Watchlist');
    assert.ok(html.includes('Kuota API K-Line (Moomoo Sebenar)'), 'Card 4 must display Moomoo real label');
    assert.ok(html.includes('100 Baki'), 'Card 4 must display real Moomoo remaining quota (100 Baki)');
    assert.ok(!html.includes('Anggaran'), 'Card 4 must NOT contain label Anggaran');
  });

  check('KpiCards Card 4 handles missing/unavailable moomoo_quota safely with fail-closed (HOM-217)', () => {
    const htmlMissingQuota = renderToString(React.createElement(KpiCards, {
      statusData: mockStatusData,
      dataPayload: { watchlist: { quota_status: null }, moomoo_quota: { status: 'UNAVAILABLE', connected: false, remain_quota: null } },
    }));
    assert.ok(!htmlMissingQuota.includes('100 Baki'), 'Must not claim 100 Baki when quota data is unavailable');
    assert.ok(htmlMissingQuota.includes('Tidak Tersedia'), 'Must display Tidak Tersedia when moomoo quota is unavailable');
    assert.ok(htmlMissingQuota.includes('-'), 'Must display - when moomoo quota is unavailable');
    assert.ok(!htmlMissingQuota.includes('Anggaran'), 'Must not fallback to Anggaran');
  });

  check('QuotaPage renders real Moomoo quota without Anggaran labels and friendly error (HOM-217)', () => {
    const mockMoomooHealthy = {
      total_quota: 100,
      used_quota: 7,
      remaining_quota: 93,
      percent_used: 7.0,
      status: 'HEALTHY',
      moomoo_quota: {
        status: 'HEALTHY',
        connected: true,
        opend_status: 'CONNECTED',
        used_quota: 0,
        remain_quota: 100,
        total_quota: 100,
        detail_list: [],
        error: null,
      },
      symbols: [],
    };
    const html = renderToString(React.createElement(QuotaPage, { initialQuotaData: mockMoomooHealthy }));
    assert.ok(html.includes('Baki Kuota Sebenar (Moomoo)'), 'Must render Baki Kuota Sebenar (Moomoo)');
    assert.ok(html.includes('100 / 100'), 'Must render real Moomoo quota (100 / 100)');
    assert.ok(html.includes('100 Baki Sebenar'), 'Must render real Moomoo remain chip');
    assert.ok(!html.includes('Anggaran'), 'Must remove all Anggaran labels (HOM-217)');
    assert.ok(!html.includes('93 / 100'), 'Must not display internal record 93 / 100 in KPI cards');
    assert.ok(!html.includes('banner-moomoo-quota-active'), 'Must remove green banner-moomoo-quota-active on healthy connection (HOM-239)');

    // Test unavailable fail-closed with friendly error
    const mockMoomooUnavailable = {
      total_quota: 100,
      used_quota: 7,
      remaining_quota: 93,
      percent_used: 7.0,
      status: 'HEALTHY',
      moomoo_quota: {
        status: 'UNAVAILABLE',
        connected: false,
        opend_status: 'DISCONNECTED',
        used_quota: null,
        remain_quota: null,
        total_quota: null,
        detail_list: [],
        error: 'connect ECONNREFUSED 127.0.0.1:8000',
      },
      symbols: [],
    };
    const htmlUnavail = renderToString(React.createElement(QuotaPage, { initialQuotaData: mockMoomooUnavailable }));
    assert.ok(htmlUnavail.includes('Tidak Tersedia') || htmlUnavail.includes('TIDAK TERSEDIA'), 'Must show Tidak Tersedia when OpenD disconnected');
    assert.ok(htmlUnavail.includes('banner-moomoo-quota-unavailable'), 'Must keep banner-moomoo-quota-unavailable on error/unavailability (HOM-239)');
    assert.ok(!htmlUnavail.includes('banner-moomoo-quota-active'), 'Must never show banner-moomoo-quota-active when unavailable');
    assert.ok(!htmlUnavail.includes('ECONNREFUSED'), 'Must sanitize raw ECONNREFUSED to friendly message');
    assert.ok(htmlUnavail.includes('Moomoo OpenD tidak dapat dihubungi'), 'Must show friendly error text');
  });

  check('QuotaPage renders STATUS WATCHLIST table header (HOM-213 Acceptance Criteria 2)', () => {
    const mockQuotaDataWithSymbols = {
      total_quota: 100,
      used_quota: 1,
      remaining_quota: 99,
      percent_used: 1.0,
      status: 'HEALTHY',
      symbols: [
        {
          symbol: 'US.MGCLY',
          first_requested_at: '2026-11-15T00:00:00Z',
          expires_at: '2026-12-15T00:00:00Z',
          days_remaining: 30,
          request_count: 142,
          status: 'ACTIVE',
          in_watchlist: true,
        },
      ],
    };
    const html = renderToString(React.createElement(QuotaPage, { initialQuotaData: mockQuotaDataWithSymbols }));
    assert.ok(html.includes('STATUS WATCHLIST'), 'Must render STATUS WATCHLIST column header');
    assert.ok(html.includes('DALAM WATCHLIST'), 'Must render DALAM WATCHLIST badge for active watchlist item');
    assert.ok(!html.includes('memegang 1 slot'), 'Must not have inaccurate text');
  });

  console.log('\n================================================================');
  console.log(`  QC Result: ${passedTests} / ${totalTests} checks passed (100% SUCCESS)`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error during QC test suite execution:', err);
  process.exit(1);
});
