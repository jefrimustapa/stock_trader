/**
 * test_logs_ui_bva.js
 * Unit & Boundary Value Analysis (BVA) test suite for Logs Viewer line separation,
 * agent component syntax color coding (L0-L4), and mobile responsiveness (HOM-413 / HOM-415).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  Logs Viewer UI BVA Test Suite: Color Coding & Mobile View');
console.log('  HOM-415: Agent Component Tiers (L0-L4) & Responsive Console');
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

// Emulate agent tiers mapping and detection from LogsPage.jsx
const AGENT_COMPONENT_TIERS = {
  EXIT_SENTINEL: {
    id: 'exit_sentinel',
    tier: 'L4-Exit',
    label: 'Exit Sentinel',
    regex: /(?:\[EXIT SENTINEL\]|EXIT SENTINEL)/i,
    text: '#f0883e', // Coral
    bg: 'rgba(240, 136, 62, 0.15)',
    border: 'rgba(240, 136, 62, 0.35)',
  },
  L4: {
    id: 'l4',
    tier: 'L4',
    label: 'Bridge & Order Execution',
    regex: /(?:\[(?:BridgeL4|L4)\]|Order placed)/i,
    text: '#58a6ff', // Sky Blue
    bg: 'rgba(88, 166, 255, 0.15)',
    border: 'rgba(88, 166, 255, 0.35)',
  },
  L3: {
    id: 'l3',
    tier: 'L3',
    label: 'Danial (Risk Auditor)',
    regex: /(?:\[(?:L3|Danial)\]|Audit Danial)/i,
    text: '#3fb950', // Emerald / Green
    bg: 'rgba(63, 185, 80, 0.15)',
    border: 'rgba(63, 185, 80, 0.35)',
  },
  L2: {
    id: 'l2',
    tier: 'L2',
    label: 'Haziq (Strategy Evaluator)',
    regex: /(?:\[(?:L2|Haziq)\])/i,
    text: '#d29922', // Amber / Gold
    bg: 'rgba(210, 153, 34, 0.15)',
    border: 'rgba(210, 153, 34, 0.35)',
  },
  L1: {
    id: 'l1',
    tier: 'L1',
    label: 'Dispatcher & Analysis (Tariq/Nawwar)',
    regex: /(?:\[(?:Dispatcher|L1|Tariq|Nawwar)\])/i,
    text: '#bc8cff', // Violet / Purple
    bg: 'rgba(188, 140, 255, 0.15)',
    border: 'rgba(188, 140, 255, 0.35)',
  },
  L0: {
    id: 'l0',
    tier: 'L0',
    label: 'Screener Daemon',
    regex: /(?:\[(?:ScreenerDaemon|L0)\])/i,
    text: '#39c5bb', // Teal / Cyan
    bg: 'rgba(57, 197, 187, 0.15)',
    border: 'rgba(57, 197, 187, 0.35)',
  },
};

function detectAgentTier(message) {
  if (!message) return null;
  const tiers = [
    AGENT_COMPONENT_TIERS.EXIT_SENTINEL,
    AGENT_COMPONENT_TIERS.L4,
    AGENT_COMPONENT_TIERS.L3,
    AGENT_COMPONENT_TIERS.L2,
    AGENT_COMPONENT_TIERS.L1,
    AGENT_COMPONENT_TIERS.L0,
  ];
  for (const t of tiers) {
    if (t.regex.test(message)) {
      return t;
    }
  }
  return null;
}

// Emulate parse logic from LogsPage.jsx
function parseMessage(message, query) {
  if (!message) return [];
  const parts = message.split(/(\[[^\]]+\]|\bAudit Danial\b|\bOrder placed\b|\bEXIT SENTINEL\b)/gi);
  return parts
    .filter((chunk) => Boolean(chunk))
    .map((chunk) => {
      const isBracketTag = chunk.startsWith('[') && chunk.endsWith(']');
      const isSpecialPhrase = /^(Audit Danial|Order placed|EXIT SENTINEL)$/i.test(chunk);
      const tier = (isBracketTag || isSpecialPhrase) ? detectAgentTier(chunk) : null;
      return {
        text: chunk,
        isTag: isBracketTag || isSpecialPhrase,
        tier: tier ? tier.id : null,
      };
    });
}

function highlightMatch(text, query) {
  if (!query || !query.trim() || !text) return [{ text, match: false }];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts
    .filter((p) => Boolean(p))
    .map((part) => ({
      text: part,
      match: part.toLowerCase() === query.toLowerCase(),
    }));
}

// BVA 1: Zero bracketed tags (plain text message)
check('BVA 1: Plain text with zero tags produces 1 non-tag token', () => {
  const result = parseMessage('Standard plain log message with no bracket');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].isTag, false);
  assert.strictEqual(result[0].text, 'Standard plain log message with no bracket');
});

// BVA 2: Single bracketed tag at beginning
check('BVA 2: Single tag at beginning parses tag and remaining message', () => {
  const result = parseMessage('[STREAM] Connected to broker websocket');
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].isTag, true);
  assert.strictEqual(result[0].text, '[STREAM]');
  assert.strictEqual(result[1].isTag, false);
  assert.strictEqual(result[1].text, ' Connected to broker websocket');
});

// BVA 3: Multiple bracketed tags in sequence
check('BVA 3: Multiple bracketed tags parse distinct tag tokens', () => {
  const result = parseMessage('[PIPELINE CLOSED] [2nd Screen] Order sent');
  assert.strictEqual(result[0].isTag, true);
  assert.strictEqual(result[0].text, '[PIPELINE CLOSED]');
  assert.strictEqual(result[1].isTag, false); // whitespace separator
  assert.strictEqual(result[2].isTag, true);
  assert.strictEqual(result[2].text, '[2nd Screen]');
  assert.strictEqual(result[3].isTag, false);
  assert.strictEqual(result[3].text, ' Order sent');
});

// BVA 4: Unclosed or malformed bracket
check('BVA 4: Malformed unclosed bracket does not produce a tag', () => {
  const result = parseMessage('Warning: [Unclosed bracket in message');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].isTag, false);
  assert.strictEqual(result[0].text, 'Warning: [Unclosed bracket in message');
});

// BVA 5: Empty message boundary
check('BVA 5: Empty message returns empty array', () => {
  const result = parseMessage('');
  assert.strictEqual(result.length, 0);
  const resultNull = parseMessage(null);
  assert.strictEqual(resultNull.length, 0);
});

// BVA 6: Search highlight with special regex characters
check('BVA 6: Search highlight safely escapes regex characters', () => {
  const res = highlightMatch('[STREAM]', '[');
  assert.strictEqual(res[0].match, true);
  assert.strictEqual(res[0].text, '[');
});

// BVA 7: Search keyword matching inside bracket tag
check('BVA 7: Search term matches keyword inside bracket tag without crashing', () => {
  const res = highlightMatch('[STREAM]', 'stream');
  assert.strictEqual(res.length, 3);
  assert.strictEqual(res[0].text, '[');
  assert.strictEqual(res[0].match, false);
  assert.strictEqual(res[1].text, 'STREAM');
  assert.strictEqual(res[1].match, true);
  assert.strictEqual(res[2].text, ']');
  assert.strictEqual(res[2].match, false);
});

// BVA 8: Verify LogsPage.jsx contains row border and blue accent styles
check('BVA 8: LogsPage.jsx defines line separation and responsive styling', () => {
  const pageCode = fs.readFileSync(path.join(__dirname, 'src/pages/LogsPage.jsx'), 'utf8');
  assert(pageCode.includes("borderBottom: '1px solid #21262d'"), 'Should have horizontal border separation');
  assert(pageCode.includes("borderLeft: `3px solid ${borderLeftColor}`"), 'Should have dynamic/accent borderLeft');
  assert(pageCode.includes("className=\"log-row\""), 'Should have log-row class');
  assert(pageCode.includes("className={`log-bracket-tag"), 'Should have log-bracket-tag class');
  assert(pageCode.includes("color: '#79c0ff'"), 'Should use cyan color for timestamps & tags');
});

// BVA 9: L0 ScreenerDaemon and L0 tier detection and color tokens
check('BVA 9: L0 tags ([ScreenerDaemon], [L0]) match Teal/Cyan color tokens', () => {
  const t1 = detectAgentTier('[ScreenerDaemon] Scanning 250 tickers');
  const t2 = detectAgentTier('[L0] Screen pass: AAPL, MSFT');
  assert(t1 && t1.id === 'l0', 'Should detect ScreenerDaemon as L0');
  assert(t2 && t2.id === 'l0', 'Should detect [L0] as L0');
  assert.strictEqual(t1.text, '#39c5bb');
  assert.strictEqual(t1.bg, 'rgba(57, 197, 187, 0.15)');
  assert.strictEqual(t1.border, 'rgba(57, 197, 187, 0.35)');
});

// BVA 10: L1 Dispatcher, L1, Tariq, Nawwar tier detection and color tokens
check('BVA 10: L1 tags ([Dispatcher], [L1], [Tariq], [Nawwar]) match Violet color tokens', () => {
  const tags = ['[Dispatcher]', '[L1]', '[Tariq]', '[Nawwar]'];
  for (const tag of tags) {
    const t = detectAgentTier(`${tag} Dispatched opportunity`);
    assert(t && t.id === 'l1', `Should detect ${tag} as L1`);
    assert.strictEqual(t.text, '#bc8cff');
    assert.strictEqual(t.bg, 'rgba(188, 140, 255, 0.15)');
    assert.strictEqual(t.border, 'rgba(188, 140, 255, 0.35)');
  }
});

// BVA 11: L2 Haziq and L2 tier detection and color tokens
check('BVA 11: L2 tags ([L2], [Haziq]) match Amber/Gold color tokens', () => {
  const tags = ['[L2]', '[Haziq]'];
  for (const tag of tags) {
    const t = detectAgentTier(`${tag} Strategy evaluation positive`);
    assert(t && t.id === 'l2', `Should detect ${tag} as L2`);
    assert.strictEqual(t.text, '#d29922');
    assert.strictEqual(t.bg, 'rgba(210, 153, 34, 0.15)');
    assert.strictEqual(t.border, 'rgba(210, 153, 34, 0.35)');
  }
});

// BVA 12: L3 Danial and Audit Danial tier detection and color tokens
check('BVA 12: L3 tags ([L3], [Danial], Audit Danial) match Emerald color tokens', () => {
  const cases = ['[L3] Audit passed', '[Danial] Position sizing approved', 'Audit Danial: risk check complete'];
  for (const c of cases) {
    const t = detectAgentTier(c);
    assert(t && t.id === 'l3', `Should detect "${c}" as L3`);
    assert.strictEqual(t.text, '#3fb950');
    assert.strictEqual(t.bg, 'rgba(63, 185, 80, 0.15)');
    assert.strictEqual(t.border, 'rgba(63, 185, 80, 0.35)');
  }
});

// BVA 13: L4 BridgeL4, L4, Order placed tier detection and color tokens
check('BVA 13: L4 tags ([BridgeL4], [L4], Order placed) match Sky Blue color tokens', () => {
  const cases = ['[BridgeL4] Executing trade', '[L4] Sending to broker', 'Order placed: BUY 10 AAPL @ 150'];
  for (const c of cases) {
    const t = detectAgentTier(c);
    assert(t && t.id === 'l4', `Should detect "${c}" as L4`);
    assert.strictEqual(t.text, '#58a6ff');
    assert.strictEqual(t.bg, 'rgba(88, 166, 255, 0.15)');
    assert.strictEqual(t.border, 'rgba(88, 166, 255, 0.35)');
  }
});

// BVA 14: Exit Sentinel tier detection and color tokens
check('BVA 14: Exit Sentinel tags ([EXIT SENTINEL], EXIT SENTINEL) match Coral color tokens', () => {
  const cases = ['[EXIT SENTINEL] Stop loss triggered', 'EXIT SENTINEL: Target reached, liquidated'];
  for (const c of cases) {
    const t = detectAgentTier(c);
    assert(t && t.id === 'exit_sentinel', `Should detect "${c}" as Exit Sentinel`);
    assert.strictEqual(t.text, '#f0883e');
    assert.strictEqual(t.bg, 'rgba(240, 136, 62, 0.15)');
    assert.strictEqual(t.border, 'rgba(240, 136, 62, 0.35)');
  }
});

// BVA 15: Mobile responsiveness attributes in LogsPage.jsx
check('BVA 15: Mobile responsive CSS properties (overflowX, minWidth, flexWrap, flexShrink)', () => {
  const pageCode = fs.readFileSync(path.join(__dirname, 'src/pages/LogsPage.jsx'), 'utf8');
  assert(pageCode.includes("overflowX: 'auto'"), 'Terminal container should have overflowX: auto');
  assert(pageCode.includes("overflowY: 'auto'"), 'Terminal container should have overflowY: auto');
  assert(pageCode.includes("minWidth: 'max-content'"), 'Row should have minWidth: max-content');
  assert(pageCode.includes("flexWrap: 'nowrap'"), 'Row should have flexWrap: nowrap');
  assert(pageCode.includes("flexShrink: 0"), 'Line number & timestamp should have flexShrink: 0');
});

// BVA 16: Fallback for messages with no agent tier
check('BVA 16: Plain log without agent tier returns null from detectAgentTier', () => {
  const res = detectAgentTier('Standard system message without agent tags');
  assert.strictEqual(res, null);
});

console.log(`\nResults: ${passedTests}/${totalTests} BVA tests passed.`);
if (passedTests === totalTests) {
  console.log('ALL BVA TESTS PASSED SUCCESSFULLY! ✓\n');
} else {
  process.exit(1);
}
