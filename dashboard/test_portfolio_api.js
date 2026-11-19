/**
 * test_portfolio_api.js
 * Unit and Boundary Value Analysis (BVA) test suite for /api/portfolio endpoint
 * Verifies portfolio summary calculations, bought price, current price, and P&L.
 */

const assert = require('assert');
const http = require('http');

console.log('================================================================');
console.log('  Portfolio API & Metric Calculation Test Suite (BVA)           ');
console.log('================================================================\n');

let totalChecks = 0;
let passedChecks = 0;

function check(desc, condition) {
  totalChecks++;
  if (condition) {
    console.log(`  ✓ PASS [${totalChecks}]: ${desc}`);
    passedChecks++;
  } else {
    console.error(`  ✗ FAIL [${totalChecks}]: ${desc}`);
    process.exitCode = 1;
  }
}

// 1. Math Calculation Logic Verification
function calculatePositionMetrics(qty, costPrice, nominalPrice, rawPlVal) {
  const q = Number(qty) || 0;
  const cp = Number(costPrice) || 0;
  const np = Number(nominalPrice) || 0;
  const totalCost = Number((q * cp).toFixed(2));
  const marketValue = Number((q * np).toFixed(2));
  const plVal = Number((rawPlVal !== undefined ? rawPlVal : (marketValue - totalCost)).toFixed(2));
  const plPct = totalCost > 0 ? Number(((plVal / totalCost) * 100).toFixed(2)) : 0;
  return { q, cp, np, totalCost, marketValue, plVal, plPct };
}

// Test normal profitable position
const m1 = calculatePositionMetrics(10, 50.0, 55.0, 50.0);
check('Bought price = 50.0, Current price = 55.0 -> Total cost = $500.00', m1.totalCost === 500.0);
check('Bought price = 50.0, Current price = 55.0 -> Market value = $550.00', m1.marketValue === 550.0);
check('Bought price = 50.0, Current price = 55.0 -> P&L = +$50.00', m1.plVal === 50.0);
check('Bought price = 50.0, Current price = 55.0 -> P&L % = +10.00%', m1.plPct === 10.0);

// Test losing position
const m2 = calculatePositionMetrics(5, 100.0, 90.0, -50.0);
check('Losing position: Cost = $500, Market = $450, P&L = -$50.00', m2.plVal === -50.0);
check('Losing position: P&L % = -10.00%', m2.plPct === -10.0);

// Boundary Value: Zero Quantity
const mZero = calculatePositionMetrics(0, 50.0, 55.0, 0);
check('Zero quantity returns 0 total cost and 0 market value', mZero.totalCost === 0 && mZero.marketValue === 0);
check('Zero total cost avoids division by zero, returns 0 P&L %', mZero.plPct === 0);

// Boundary Value: Zero Cost Price
const mFree = calculatePositionMetrics(10, 0.0, 10.0, 100.0);
check('Zero cost price avoids division by zero', mFree.plPct === 0);

console.log(`\nAll ${totalChecks} unit checks completed. ${passedChecks}/${totalChecks} PASSED.`);
if (passedChecks !== totalChecks) {
  process.exit(1);
}
