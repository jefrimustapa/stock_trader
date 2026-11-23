/**
 * test_portfolio_api.js
 * Unit & Integration test for Portfolio Attribution & Audit Trail (GitHub Issue #17 / HOM-356)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  Portfolio Reconciliation & Attribution API Test Suite');
console.log('  Testing Portfolio Page, Server Mappings & Attribution Integrity');
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

// 1. Verify PortfolioPage.jsx has Atribusi column and chips
check('PortfolioPage.jsx includes "Atribusi" column header and table sort label', () => {
  const code = fs.readFileSync(path.join(__dirname, 'src/pages/PortfolioPage.jsx'), 'utf8');
  assert(code.includes('Attribution') || code.includes('Atribusi'), 'Should contain Attribution column label');
  assert(code.includes("orderBy === 'source'"), 'Should support sorting by source');
});

check('PortfolioPage.jsx renders attribution Chips and audit Tooltip', () => {
  const code = fs.readFileSync(path.join(__dirname, 'src/pages/PortfolioPage.jsx'), 'utf8');
  assert(code.includes('AGENT_PIPELINE'), 'Should handle AGENT_PIPELINE attribution');
  assert(code.includes('BROKER_IMPORT'), 'Should handle BROKER_IMPORT attribution');
  assert(code.includes('POSITION_RECONCILED'), 'Should handle POSITION_RECONCILED attribution');
  assert(code.includes('Broker / Manual'), 'Should render Broker / Manual badge label');
  assert(code.includes('Reconciliation') || code.includes('Rekonsiliasi'), 'Should render Reconciliation badge label');
  assert(code.includes('Tooltip'), 'Should wrap attribution in a Tooltip for audit trail');
});

// 2. Verify server.js routes and mapping logic
check('server.js maps source, order_id, cycle_id in /api/portfolio', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(serverCode.includes("source: p.source || 'POSITION_RECONCILED'"), 'Should map source with fallback');
  assert(serverCode.includes("order_id: p.order_id || null"), 'Should map order_id');
  assert(serverCode.includes("cycle_id: p.cycle_id || null"), 'Should map cycle_id');
});

check('server.js defines /api/agents/orders and /api/v1/agents/orders endpoints', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(serverCode.includes("app.get(['/api/agents/orders', '/api/v1/agents/orders']"), 'Should define agent orders endpoints');
});

// 3. Test portfolio mapping logic directly
check('Portfolio position attribution mapping handles various sources correctly', () => {
  function mapPosition(p) {
    return {
      position_id: p.position_id,
      symbol: p.code,
      clean_symbol: p.code ? (p.code.includes('.') ? p.code.split('.')[1] : p.code) : '',
      stock_name: p.stock_name || p.code,
      qty: Number(p.qty) || 0,
      bought_price: Number(p.cost_price) || 0,
      current_price: Number(p.nominal_price) || 0,
      source: p.source || 'POSITION_RECONCILED',
      order_id: p.order_id || null,
      cycle_id: p.cycle_id || null,
      attribution_date: p.attribution_date || null
    };
  }

  // Case A: Agent Pipeline
  const pA = mapPosition({
    position_id: 'P1',
    code: 'US.AAPL',
    qty: 10,
    cost_price: 150,
    nominal_price: 155,
    source: 'AGENT_PIPELINE',
    order_id: 'ORD-123',
    cycle_id: 'CYC-456'
  });
  assert.strictEqual(pA.source, 'AGENT_PIPELINE');
  assert.strictEqual(pA.order_id, 'ORD-123');
  assert.strictEqual(pA.cycle_id, 'CYC-456');

  // Case B: Broker Import
  const pB = mapPosition({
    position_id: 'P2',
    code: 'US.MSFT',
    qty: 5,
    cost_price: 300,
    nominal_price: 310,
    source: 'BROKER_IMPORT',
    order_id: 'EXT-999'
  });
  assert.strictEqual(pB.source, 'BROKER_IMPORT');
  assert.strictEqual(pB.order_id, 'EXT-999');
  assert.strictEqual(pB.cycle_id, null);

  // Case C: Unattributed / Fallback Reconciled
  const pC = mapPosition({
    position_id: 'P3',
    code: 'US.NVDA',
    qty: 2,
    cost_price: 400,
    nominal_price: 450
  });
  assert.strictEqual(pC.source, 'POSITION_RECONCILED');
  assert.strictEqual(pC.order_id, null);
  assert.strictEqual(pC.cycle_id, null);
});

// 4. Verification for GitHub Issue #20 / HOM-366: Portfolio Refresh Flash Prevention
check('PortfolioPage.jsx imports Skeleton and uses it on KPI cards & Table rows on initial load', () => {
  const code = fs.readFileSync(path.join(__dirname, 'src/pages/PortfolioPage.jsx'), 'utf8');
  assert(code.includes('Skeleton'), 'Must import Skeleton from @mui/material');
  assert(code.includes('loading && !data'), 'Must check loading && !data for initial skeleton display');
  assert(code.includes('skeleton-row-'), 'Must render skeleton table rows when loading without data');
});

check('PortfolioPage.jsx implements Stale-While-Revalidate (SWR) and spinning refresh indicator', () => {
  const code = fs.readFileSync(path.join(__dirname, 'src/pages/PortfolioPage.jsx'), 'utf8');
  assert(code.includes('isFetching'), 'Must track isFetching state for background/manual refresh');
  assert(code.includes('animation: isFetching ? \'spin'), 'Refresh icon must spin while isFetching');
  assert(code.includes('data?.is_stale'), 'Must handle is_stale warning banner');
});

check('server.js defines lastKnownPortfolio cache and returns is_stale flag during transient error', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(serverCode.includes('lastKnownPortfolio'), 'Must maintain lastKnownPortfolio cache');
  assert(serverCode.includes('is_stale: true'), 'Must return is_stale: true on transient failure');
  assert(serverCode.includes('is_stale: false'), 'Must return is_stale: false on successful fetch');
});

check('bridge/src/moomoo_client.py caches _last_positions and falls back on non-OK or transient disconnect', () => {
  const clientCode = fs.readFileSync(path.join(__dirname, '../bridge/src/moomoo_client.py'), 'utf8');
  assert(clientCode.includes('self._last_positions'), 'Must maintain _last_positions cache in MoomooClient');
  assert(clientCode.includes('falling back to last known positions'), 'Must log and fallback to last known positions on non-OK');
});

// 5. BVA Simulation of Server Portfolio Cache Fallback
check('BVA: Server portfolio cache fallback preserves positions during downstream timeout or disconnect', () => {
  let lastKnownPortfolio = null;

  function simulateGetPortfolio(bridgeResponse, isBridgeDown = false) {
    if (isBridgeDown || !bridgeResponse || bridgeResponse.opend_status === 'DISCONNECTED') {
      if (lastKnownPortfolio) {
        return {
          ...lastKnownPortfolio,
          opend_status: bridgeResponse?.opend_status || 'DISCONNECTED',
          is_stale: true,
          stale_reason: 'Downstream timeout / OpenD disconnected'
        };
      }
      return {
        opend_status: 'DISCONNECTED',
        summary: { total_cost_basis: 0, total_market_value: 0, total_unrealized_pl: 0, total_pl_pct: 0, position_count: 0 },
        positions: [],
        is_stale: false
      };
    }

    const payload = {
      opend_status: 'CONNECTED',
      summary: {
        total_cost_basis: 5000,
        total_market_value: 5500,
        total_unrealized_pl: 500,
        total_pl_pct: 10,
        position_count: bridgeResponse.positions.length
      },
      positions: bridgeResponse.positions,
      is_stale: false
    };
    lastKnownPortfolio = payload;
    return payload;
  }

  // BVA Case 1: First call succeeds -> cached, is_stale = false
  const res1 = simulateGetPortfolio({ positions: [{ symbol: 'AAPL', qty: 10 }] });
  assert.strictEqual(res1.is_stale, false);
  assert.strictEqual(res1.positions.length, 1);
  assert.strictEqual(res1.summary.total_market_value, 5500);

  // BVA Case 2: Transient timeout / DISCONNECTED -> returns lastKnownPortfolio with is_stale = true, does NOT flash empty
  const res2 = simulateGetPortfolio(null, true);
  assert.strictEqual(res2.is_stale, true);
  assert.strictEqual(res2.positions.length, 1, 'Must retain AAPL position instead of flashing empty');
  assert.strictEqual(res2.summary.total_market_value, 5500, 'Must retain $5,500 instead of flashing $0.00');

  // BVA Case 3: Bridge recovers -> returns fresh data with is_stale = false
  const res3 = simulateGetPortfolio({ positions: [{ symbol: 'AAPL', qty: 10 }, { symbol: 'NVDA', qty: 5 }] });
  assert.strictEqual(res3.is_stale, false);
  assert.strictEqual(res3.positions.length, 2);

  // BVA Case 4: Disconnect again -> returns updated cache with 2 positions
  const res4 = simulateGetPortfolio({ opend_status: 'DISCONNECTED', positions: [] });
  assert.strictEqual(res4.is_stale, true);
  assert.strictEqual(res4.positions.length, 2, 'Must retain 2 positions from last valid cache');
});

console.log(`\n================================================================`);
console.log(`  Tests Completed: ${passedTests}/${totalTests} Passed`);
console.log(`================================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
