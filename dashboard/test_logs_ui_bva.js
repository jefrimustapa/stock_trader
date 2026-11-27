/**
 * test_logs_ui_bva.js
 * Unit & Boundary Value Analysis (BVA) test suite for Logs Viewer line separation and color coding (HOM-413)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  Logs Viewer UI Line Separation & Color Coding BVA Test Suite');
console.log('  HOM-413: Verification of tag parsing, separation & color tokens');
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

// Emulate parse logic from LogsPage.jsx
function parseMessage(message, query) {
  if (!message) return [];
  const parts = message.split(/(\[[^\]]+\])/g);
  return parts
    .filter((chunk) => Boolean(chunk))
    .map((chunk) => {
      const isBracketTag = chunk.startsWith('[') && chunk.endsWith(']');
      return {
        text: chunk,
        isTag: isBracketTag,
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
check('BVA 8: LogsPage.jsx defines line separation and blue borderLeft accent', () => {
  const pageCode = fs.readFileSync(path.join(__dirname, 'src/pages/LogsPage.jsx'), 'utf8');
  assert(pageCode.includes("borderBottom: '1px solid #21262d'"), 'Should have horizontal border separation');
  assert(pageCode.includes("borderLeft: '3px solid #388bfd'"), 'Should have blue left accent border');
  assert(pageCode.includes("className=\"log-row\""), 'Should have log-row class');
  assert(pageCode.includes("className=\"log-bracket-tag\""), 'Should have log-bracket-tag class');
  assert(pageCode.includes("color: '#79c0ff'"), 'Should use cyan color for timestamps & tags');
});

console.log(`\nResults: ${passedTests}/${totalTests} BVA tests passed.`);
if (passedTests === totalTests) {
  console.log('ALL BVA TESTS PASSED SUCCESSFULLY! ✓\n');
} else {
  process.exit(1);
}
