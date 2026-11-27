/**
 * test_logs_api.js
 * Verification test suite for Container Logs Viewer page & API routing (HOM-408 / Issue #36)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  Container Logs Viewer UI & Server Integration Test Suite');
console.log('  Testing Navigation, Page Routing, Controls & API Proxying');
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

// 1. Verify Layout.jsx navigation
check('Layout.jsx defines Container Logs navigation item with TerminalIcon', () => {
  const code = fs.readFileSync(path.join(__dirname, 'src/components/Layout.jsx'), 'utf8');
  assert(code.includes("id: 'logs'"), 'Should contain logs nav item id');
  assert(code.includes('Container Logs'), 'Should contain label Container Logs');
  assert(code.includes('TerminalIcon'), 'Should import and use TerminalIcon');
});

// 2. Verify App.jsx page routing
check('App.jsx registers logs in VALID_PAGES and renders LogsPage', () => {
  const code = fs.readFileSync(path.join(__dirname, 'src/App.jsx'), 'utf8');
  assert(code.includes("'logs'"), 'VALID_PAGES should include logs');
  assert(code.includes("import { LogsPage } from './pages/LogsPage'"), 'Should import LogsPage');
  assert(code.includes("case 'logs':"), 'Should handle case logs in switch statement');
  assert(code.includes('<LogsPage />'), 'Should render LogsPage component');
});

// 3. Verify server.js proxy routes
check('server.js defines /api/system/logs and /api/system/containers endpoints', () => {
  const code = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert(code.includes("app.get('/api/system/logs'"), 'Should have /api/system/logs route');
  assert(code.includes("app.get('/api/system/containers'"), 'Should have /api/system/containers route');
  assert(code.includes('authenticateDashboard'), 'Should protect routes with authenticateDashboard middleware');
  assert(code.includes('BRIDGE_SERVICE_TOKEN'), 'Should forward BRIDGE_SERVICE_TOKEN to bridge');
});

// 4. Verify LogsPage.jsx UI controls and structure
check('LogsPage.jsx contains multi-container selectors for bridge, daemon, dashboard, and opend', () => {
  const code = fs.readFileSync(path.join(__dirname, 'src/pages/LogsPage.jsx'), 'utf8');
  assert(code.includes("id: 'bridge'"), 'Should support bridge container');
  assert(code.includes("id: 'daemon'"), 'Should support daemon container');
  assert(code.includes("id: 'dashboard'"), 'Should support dashboard container');
  assert(code.includes("id: 'opend'"), 'Should support opend container');
  assert(code.includes('stock_mcp_bridge'), 'Should reference stock_mcp_bridge container name');
  assert(code.includes('stock_screener_daemon'), 'Should reference stock_screener_daemon container name');
  assert(code.includes('stock_trading_dashboard'), 'Should reference stock_trading_dashboard container name');
  assert(code.includes('stock_moomoo_opend'), 'Should reference stock_moomoo_opend container name');
});

check('LogsPage.jsx provides log level filtering, keyword search, auto-refresh, and tail limits', () => {
  const code = fs.readFileSync(path.join(__dirname, 'src/pages/LogsPage.jsx'), 'utf8');
  assert(code.includes("['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG']"), 'Should define standard log levels');
  assert(code.includes('searchTerm'), 'Should have searchTerm state for search filtering');
  assert(code.includes('tailLimit'), 'Should have tailLimit state');
  assert(code.includes('autoRefreshInterval'), 'Should have autoRefreshInterval state');
  assert(code.includes('autoScroll'), 'Should support auto-scroll toggle');
  assert(code.includes('handleCopyLogs'), 'Should have copy-to-clipboard functionality');
});

// 5. Verify bridge routes/logs.py exists and handles security
check('bridge/src/routes/logs.py enforces secret sanitization and container whitelisting', () => {
  const code = fs.readFileSync(path.join(__dirname, '../bridge/src/routes/logs.py'), 'utf8');
  assert(code.includes('def sanitize_log_text'), 'Should define sanitize_log_text function');
  assert(code.includes('[REDACTED'), 'Should use [REDACTED] tokens');
  assert(code.includes('CONTAINER_MAP'), 'Should define CONTAINER_MAP whitelist');
  assert(code.includes('demux_docker_stream'), 'Should demux Docker 8-byte frames');
  assert(code.includes('authenticate_request'), 'Should enforce authenticate_request security dependency');
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('ALL TESTS PASSED SUCCESSFULLY! ✓\n');
} else {
  process.exit(1);
}
