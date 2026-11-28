/**
 * test_orders_audit_trail_proxy.js
 * Integration test suite for Dashboard Proxy /api/agents/orders and /api/agents/closed-trades (HOM-417/418)
 */

const axios = require('axios');
const assert = require('assert');

const DASHBOARD_URL = process.env.TEST_URL || 'http://localhost:3000';
const SERVICE_TOKEN = process.env.BRIDGE_SERVICE_TOKEN || 'c7fed05ca5e657d0a08e187e9b36755db8eeb7cf76b82648dc6d60d278a19def';

async function runTests() {
  console.log('================================================================');
  console.log('  Orders Audit Trail Dashboard Proxy Integration Tests');
  console.log(`  Target URL: ${DASHBOARD_URL}`);
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  function check(desc, condition) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ PASS [${totalTests}]: ${desc}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL [${totalTests}]: ${desc}`);
      process.exitCode = 1;
    }
  }

  const headers = { 'X-Service-Token': SERVICE_TOKEN };

  // 1. GET /api/agents/orders pagination & metadata
  try {
    const res = await axios.get(`${DASHBOARD_URL}/api/agents/orders?page=1&limit=5`, { headers });
    check('GET /api/agents/orders returns 200', res.status === 200);
    check('Response status is OK', res.data.status === 'OK');
    check('Response contains total count', typeof res.data.total === 'number');
    check('Response contains total_pages', typeof res.data.total_pages === 'number');
    check('Response returns orders list', Array.isArray(res.data.orders));
    if (res.data.orders.length > 0) {
      const ord = res.data.orders[0];
      check('Order contains thesis', ord.thesis !== undefined);
      check('Order contains thesis_detail', typeof ord.thesis_detail === 'object');
      check('Order contains side and price', ord.side !== undefined && ord.price !== undefined);
    }
  } catch (err) {
    check('GET /api/agents/orders returns 200', false);
    console.error('  Error:', err.message);
  }

  // 2. GET /api/agents/orders with filter=closed
  try {
    const res = await axios.get(`${DASHBOARD_URL}/api/agents/orders?filter=closed&limit=5`, { headers });
    check('GET /api/agents/orders?filter=closed returns 200', res.status === 200);
    check('Orders returned match closed filter', res.data.orders.every(o => o.order_side === 'SELL' && o.status === 'FILLED'));
  } catch (err) {
    check('GET /api/agents/orders?filter=closed returns 200', false);
    console.error('  Error:', err.message);
  }

  // 3. GET /api/agents/closed-trades
  try {
    const res = await axios.get(`${DASHBOARD_URL}/api/agents/closed-trades?page=1&limit=5`, { headers });
    check('GET /api/agents/closed-trades returns 200', res.status === 200);
    check('Closed trades response status is OK', res.data.status === 'OK');
    check('Response contains total trades count', typeof res.data.total === 'number');
    check('Response contains total_pages', typeof res.data.total_pages === 'number');
    check('Trades array present', Array.isArray(res.data.trades));
    if (res.data.trades.length > 0) {
      const trd = res.data.trades[0];
      check('Trade contains symbol', typeof trd.symbol === 'string');
      check('Trade contains buy_price', trd.buy_price !== undefined);
      check('Trade contains sell_price', typeof trd.sell_price === 'number');
      check('Trade contains realized_pnl_usd', typeof trd.realized_pnl_usd === 'number');
      check('Trade contains realized_pnl_pct', typeof trd.realized_pnl_pct === 'number');
      check('Trade contains hold_duration', typeof trd.hold_duration === 'string');
      check('Trade contains thesis', typeof trd.thesis === 'string');
    }
  } catch (err) {
    check('GET /api/agents/closed-trades returns 200', false);
    console.error('  Error:', err.message);
  }

  // 4. GET /api/agents/closed-trades with symbol and result filters
  try {
    const res = await axios.get(`${DASHBOARD_URL}/api/agents/closed-trades?symbol=DSGR&result=all`, { headers });
    check('GET /api/agents/closed-trades?symbol=DSGR returns 200', res.status === 200);
    check('Filtered trades only contain requested symbol', res.data.trades.every(t => t.symbol.includes('DSGR')));
  } catch (err) {
    check('GET /api/agents/closed-trades with filter returns 200', false);
    console.error('  Error:', err.message);
  }

  console.log('\n================================================================');
  console.log(`  Tests Passed: ${passedTests} / ${totalTests}`);
  console.log('================================================================');
  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runTests();
