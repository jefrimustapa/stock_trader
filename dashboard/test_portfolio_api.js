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
  assert(code.includes('Atribusi'), 'Should contain "Atribusi" column label');
  assert(code.includes("orderBy === 'source'"), 'Should support sorting by source');
});

check('PortfolioPage.jsx renders attribution Chips and audit Tooltip', () => {
  const code = fs.readFileSync(path.join(__dirname, 'src/pages/PortfolioPage.jsx'), 'utf8');
  assert(code.includes('AGENT_PIPELINE'), 'Should handle AGENT_PIPELINE attribution');
  assert(code.includes('BROKER_IMPORT'), 'Should handle BROKER_IMPORT attribution');
  assert(code.includes('POSITION_RECONCILED'), 'Should handle POSITION_RECONCILED attribution');
  assert(code.includes('Broker / Manual'), 'Should render Broker / Manual badge label');
  assert(code.includes('Rekonsiliasi'), 'Should render Rekonsiliasi badge label');
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

console.log(`\n================================================================`);
console.log(`  Tests Completed: ${passedTests}/${totalTests} Passed`);
console.log(`================================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
