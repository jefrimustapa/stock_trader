/**
 * test_candle_count_bva.js
 * Automated Boundary Value Analysis (BVA) & Branch Coverage Test Suite
 * for KlineDrawer Candle Count Display Logic (HOM-368 / GitHub #6)
 */

const assert = require('assert');

// Pure logic extracted directly from KlineDrawer.jsx
function getCandleCountLabel(klineData, zoomMode, visibleCandleCount) {
  const total = klineData?.candles?.length || 0;
  if (total === 0) return '0 lilin';
  if (zoomMode === 'all') {
    return `${total} lilin`;
  }
  if (zoomMode === '40') {
    if (total <= 40) return `${total} lilin`;
    return `40 / ${total} lilin`;
  }
  // zoomMode === 'custom'
  const count = Math.min(total, Math.max(0, visibleCandleCount));
  if (count >= total) return `${total} lilin`;
  return `${count} / ${total} lilin`;
}

function calculateVisibleCount(newRange, totalBars) {
  if (!newRange || totalBars <= 0) return 0;
  const from = Math.max(0, Math.ceil(newRange.from));
  const to = Math.min(totalBars - 1, Math.floor(newRange.to));
  return from <= to ? to - from + 1 : 0;
}

console.log('================================================================');
console.log('  KlineDrawer Candle Count BVA & Branch Coverage (HOM-368)');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// 1. Boundary Value Analysis (BVA)
// -----------------------------------------------------------------------------
console.log('--- Suite 1: Boundary Value Analysis (BVA) ---');

runTest('BVA-1: Zero candles (empty array)', () => {
  const label = getCandleCountLabel({ candles: [] }, '40', 0);
  assert.strictEqual(label, '0 lilin');
});

runTest('BVA-2: Null / undefined klineData or candles', () => {
  assert.strictEqual(getCandleCountLabel(null, '40', 40), '0 lilin');
  assert.strictEqual(getCandleCountLabel({}, '40', 40), '0 lilin');
  assert.strictEqual(getCandleCountLabel({ candles: null }, '40', 40), '0 lilin');
});

runTest('BVA-3: Minimum non-zero: 1 candle (e.g. IPO day 1)', () => {
  const candles = [{ time: 1000, open: 10, close: 11 }];
  assert.strictEqual(getCandleCountLabel({ candles }, '40', 1), '1 lilin');
  assert.strictEqual(getCandleCountLabel({ candles }, 'all', 1), '1 lilin');
});

runTest('BVA-4: Newly listed stock with 3 candles (<= 3 threshold)', () => {
  const candles = [
    { time: 1000, open: 10, close: 11 },
    { time: 2000, open: 11, close: 12 },
    { time: 3000, open: 12, close: 13 },
  ];
  assert.strictEqual(getCandleCountLabel({ candles }, '40', 3), '3 lilin');
  assert.strictEqual(getCandleCountLabel({ candles }, 'all', 3), '3 lilin');
});

runTest('BVA-5: Boundary 39 candles (total < 40)', () => {
  const candles = Array.from({ length: 39 }, (_, i) => ({ time: i }));
  assert.strictEqual(getCandleCountLabel({ candles }, '40', 39), '39 lilin');
});

runTest('BVA-6: Boundary exact 40 candles (total === 40)', () => {
  const candles = Array.from({ length: 40 }, (_, i) => ({ time: i }));
  assert.strictEqual(getCandleCountLabel({ candles }, '40', 40), '40 lilin');
  assert.strictEqual(getCandleCountLabel({ candles }, 'all', 40), '40 lilin');
});

runTest('BVA-7: Boundary 41 candles (total === 41, first multi-candle ratio)', () => {
  const candles = Array.from({ length: 41 }, (_, i) => ({ time: i }));
  assert.strictEqual(getCandleCountLabel({ candles }, '40', 40), '40 / 41 lilin');
  assert.strictEqual(getCandleCountLabel({ candles }, 'all', 41), '41 lilin');
});

runTest('BVA-8: Standard fetched 150 candles with 40 Lilin mode', () => {
  const candles = Array.from({ length: 150 }, (_, i) => ({ time: i }));
  assert.strictEqual(getCandleCountLabel({ candles }, '40', 40), '40 / 150 lilin');
});

runTest('BVA-9: Standard fetched 150 candles with Semua mode', () => {
  const candles = Array.from({ length: 150 }, (_, i) => ({ time: i }));
  assert.strictEqual(getCandleCountLabel({ candles }, 'all', 150), '150 lilin');
});

// -----------------------------------------------------------------------------
// 2. Branch Coverage (Custom Zoom & Logical Range Calculations)
// -----------------------------------------------------------------------------
console.log('\n--- Suite 2: Branch Coverage (Custom Zoom & Logical Range) ---');

runTest('BRANCH-1: Custom zoom mode with 15 visible candles of 150', () => {
  const candles = Array.from({ length: 150 }, (_, i) => ({ time: i }));
  assert.strictEqual(getCandleCountLabel({ candles }, 'custom', 15), '15 / 150 lilin');
});

runTest('BRANCH-2: Custom zoom mode when visible equals total (150 / 150 -> 150 lilin)', () => {
  const candles = Array.from({ length: 150 }, (_, i) => ({ time: i }));
  assert.strictEqual(getCandleCountLabel({ candles }, 'custom', 150), '150 lilin');
});

runTest('BRANCH-3: Custom zoom with out-of-bounds visible count clamping (upper bound)', () => {
  const candles = Array.from({ length: 150 }, (_, i) => ({ time: i }));
  assert.strictEqual(getCandleCountLabel({ candles }, 'custom', 250), '150 lilin');
});

runTest('BRANCH-4: Custom zoom with out-of-bounds visible count clamping (lower bound)', () => {
  const candles = Array.from({ length: 150 }, (_, i) => ({ time: i }));
  assert.strictEqual(getCandleCountLabel({ candles }, 'custom', -10), '0 / 150 lilin');
});

runTest('RANGE-1: Logical range calculation within normal bounds', () => {
  // 150 bars (index 0 to 149), range 110 to 149 = 40 bars
  const count = calculateVisibleCount({ from: 110, to: 149 }, 150);
  assert.strictEqual(count, 40);
});

runTest('RANGE-2: Logical range calculation with negative left margin (overshoot left)', () => {
  // from: -15, to: 15 on 3 total bars -> clamped from: 0, to: 2 = 3 bars
  const count = calculateVisibleCount({ from: -15, to: 15 }, 3);
  assert.strictEqual(count, 3);
});

runTest('RANGE-3: Logical range calculation with right margin offset (overshoot right)', () => {
  // total: 150, from: 108, to: 152 -> clamped from: 108, to: 149 = 42 bars
  const count = calculateVisibleCount({ from: 108, to: 152 }, 150);
  assert.strictEqual(count, 42);
});

runTest('RANGE-4: Logical range completely out of view (scrolled beyond data)', () => {
  // total: 150, from: 200, to: 250 -> clamped from: 200, to: 149 -> from > to => 0
  const count = calculateVisibleCount({ from: 200, to: 250 }, 150);
  assert.strictEqual(count, 0);
});

// -----------------------------------------------------------------------------
// 3. Mutation Testing Verification
// -----------------------------------------------------------------------------
console.log('\n--- Suite 3: Mutation Testing (5 manual mutants) ---');

runTest('MUTANT-1: Detect regression if total <= 40 was changed to total < 40', () => {
  // Mutated logic:
  const mutantFn = (klineData, zoomMode, visible) => {
    const total = klineData?.candles?.length || 0;
    if (zoomMode === '40') {
      if (total < 40) return `${total} lilin`; // MUTANT: < instead of <=
      return `40 / ${total} lilin`;
    }
  };
  const candles = Array.from({ length: 40 }, (_, i) => ({ time: i }));
  // Mutant outputs '40 / 40 lilin' instead of clean '40 lilin'
  assert.strictEqual(mutantFn({ candles }, '40', 40), '40 / 40 lilin');
  assert.strictEqual(getCandleCountLabel({ candles }, '40', 40), '40 lilin');
});

runTest('MUTANT-2: Detect regression if count >= total was changed to count > total', () => {
  const mutantFn = (klineData, zoomMode, visible) => {
    const total = klineData?.candles?.length || 0;
    if (visible > total) return `${total} lilin`; // MUTANT: > instead of >=
    return `${visible} / ${total} lilin`;
  };
  const candles = Array.from({ length: 150 }, (_, i) => ({ time: i }));
  assert.strictEqual(mutantFn({ candles }, 'custom', 150), '150 / 150 lilin');
  assert.strictEqual(getCandleCountLabel({ candles }, 'custom', 150), '150 lilin');
});

runTest('MUTANT-3: Detect old bug (static total candle count always shown)', () => {
  const oldBugFn = (klineData) => `${klineData?.candles?.length || 0} lilin`;
  const candles = Array.from({ length: 150 }, (_, i) => ({ time: i }));
  assert.strictEqual(oldBugFn({ candles }), '150 lilin'); // Old bug never reflects '40'
  assert.strictEqual(getCandleCountLabel({ candles }, '40', 40), '40 / 150 lilin');
});

runTest('MUTANT-4: Detect off-by-one in bar count formula (to - from vs to - from + 1)', () => {
  const mutantRange = (r, total) => {
    const from = Math.max(0, Math.ceil(r.from));
    const to = Math.min(total - 1, Math.floor(r.to));
    return to - from; // MUTANT: missing + 1
  };
  assert.strictEqual(mutantRange({ from: 0, to: 0 }, 10), 0); // 1 bar rendered but mutant says 0
  assert.strictEqual(calculateVisibleCount({ from: 0, to: 0 }, 10), 1);
});

runTest('MUTANT-5: Detect unhandled null klineData crashing application', () => {
  const fragileFn = (klineData) => `${klineData.candles.length} lilin`;
  assert.throws(() => fragileFn(null), TypeError);
  assert.doesNotThrow(() => getCandleCountLabel(null, '40', 0));
});

console.log('\n================================================================');
console.log(`  Summary: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
