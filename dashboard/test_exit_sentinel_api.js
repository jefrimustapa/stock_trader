const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  Exit Sentinel & Sales Execution API Test Suite');
console.log('  Testing Exit Sentinel Routes, Chip Styling & Order Attribution');
console.log('================================================================\n');

let passed = 0;
let total = 0;

function test(name, fn) {
    total++;
    try {
        fn();
        console.log(`  ✓ PASS [${total}]: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ FAIL [${total}]: ${name}`);
        console.error(`    ${err.message}`);
    }
}

const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf-8');
const agentsPageCode = fs.readFileSync(path.join(__dirname, 'src/pages/AgentsPage.jsx'), 'utf-8');

test('server.js defines POST /api/trade/exit-request endpoint', () => {
    assert(serverCode.includes("app.post('/api/trade/exit-request'"), 'server.js must define POST /api/trade/exit-request');
});

test('server.js proxies exit-request to Bridge /api/v1/trade/exit-request with X-Service-Token', () => {
    assert(serverCode.includes('/api/v1/trade/exit-request'), 'server.js must target Bridge /api/v1/trade/exit-request');
    assert(serverCode.includes("'X-Service-Token': BRIDGE_SERVICE_TOKEN"), 'server.js must attach X-Service-Token');
});

test('AgentsPage.jsx renders SELL orders with error chip styling and BUY with success', () => {
    assert(agentsPageCode.includes("label={ord.order_side || 'BUY'}"), 'AgentsPage must render order_side label');
    assert(agentsPageCode.includes("ord.order_side === 'SELL' ? sneatTokens.error.soft : sneatTokens.success.soft"), 'SELL order chip must use error soft background');
    assert(agentsPageCode.includes("ord.order_side === 'SELL' ? sneatTokens.error.main : sneatTokens.success.main"), 'SELL order chip must use error main color');
});

test('server.js properly handles exit-request errors and returns informative status', () => {
    assert(serverCode.includes('Gagal melaksanakan pesanan keluar:'), 'server.js must provide detailed error message on exit failure');
});

console.log('\n================================================================');
console.log(`  Tests Completed: ${passed}/${total} Passed`);
console.log('================================================================\n');

if (passed !== total) {
    process.exit(1);
}
