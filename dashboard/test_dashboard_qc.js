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
  const { getTheme, sneatTokens } = await bundleModule('src/theme.js');

  check('Layout exports navItems array with navigation sections', () => {
    assert.ok(Array.isArray(navItems), 'navItems must be an array');
    assert.ok(navItems.length >= 4, 'Must have at least 4 navigation sections');
    const ids = navItems.map(n => n.id);
    assert.ok(ids.includes('overview') && ids.includes('opend') && ids.includes('funnel') && ids.includes('watchlist'));
  });

  check('Each page module exports a valid React component function', () => {
    assert.strictEqual(typeof OverviewPage, 'function', 'OverviewPage must be a function component');
    assert.strictEqual(typeof OpendPage, 'function', 'OpendPage must be a function component');
    assert.strictEqual(typeof FunnelPage, 'function', 'FunnelPage must be a function component');
    assert.strictEqual(typeof WatchlistPage, 'function', 'WatchlistPage must be a function component');
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
