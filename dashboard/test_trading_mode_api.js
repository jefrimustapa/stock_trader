/**
 * test_trading_mode_api.js
 * Comprehensive Backend API & Boundary Value Analysis (BVA) Test Suite
 * for TRADING_MODE Toggle (HOM-351).
 */

const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('================================================================');
console.log('  TRADING_MODE Toggle API & BVA Test Suite (HOM-351)            ');
console.log('================================================================\n');

const TEST_PORT = 3899;
const TEST_SHARED_DATA_DIR = path.join(__dirname, 'test_shared_data_mode_' + Date.now());
const TEST_SERVICE_TOKEN = 'test-token-hom-351';

if (!fs.existsSync(TEST_SHARED_DATA_DIR)) {
    fs.mkdirSync(TEST_SHARED_DATA_DIR, { recursive: true });
}

let serverProcess = null;
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

function makeRequest(pathStr, method = 'GET', headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const reqHeaders = { ...headers };
        if (payload) {
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(payload);
        }

        const req = http.request({
            hostname: '127.0.0.1',
            port: TEST_PORT,
            path: pathStr,
            method: method,
            headers: reqHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: parsed
                });
            });
        });
        req.on('error', reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

async function runTests() {
    try {
        console.log('--- 1. Starting Dashboard Server on port ' + TEST_PORT + ' ---');
        serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
            env: {
                ...process.env,
                PORT: String(TEST_PORT),
                SHARED_DATA_DIR: TEST_SHARED_DATA_DIR,
                AUTHENTIK_CLIENT_ID: 'test-client-id',
                DISABLE_AUTHENTIK_AUTH: 'true',
                BRIDGE_SERVICE_TOKEN: TEST_SERVICE_TOKEN,
                NODE_ENV: 'test'
            }
        });

        // Wait for server ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Server start timed out')), 8000);
            const interval = setInterval(async () => {
                try {
                    const res = await makeRequest('/health');
                    if (res.statusCode === 200) {
                        clearTimeout(timeout);
                        clearInterval(interval);
                        resolve();
                    }
                } catch (_) {}
            }, 300);
        });
        console.log('  Server is healthy.\n');

        console.log('--- 2. Initial State Verification ---');
        const initialStatus = await makeRequest('/api/status');
        check('Status endpoint returns 200', initialStatus.statusCode === 200);
        check('Default initial trading_mode is DAY', initialStatus.data.trading_mode === 'DAY');

        const initialConfig = await makeRequest('/api/screener/config');
        check('Screener config endpoint returns 200', initialConfig.statusCode === 200);
        check('Screener config includes trading_mode DAY', initialConfig.data.config.trading_mode === 'DAY');

        console.log('\n--- 3. Boundary Value Analysis: POST /api/trading-mode Invalid Inputs ---');
        // Invalid 1: missing body / empty
        const inv1 = await makeRequest('/api/trading-mode', 'POST', {}, {});
        check('Empty body returns 400 Bad Request', inv1.statusCode === 400);

        // Invalid 2: empty string
        const inv2 = await makeRequest('/api/trading-mode', 'POST', {}, { mode: '' });
        check('Empty mode string returns 400 Bad Request', inv2.statusCode === 400);

        // Invalid 3: whitespace only
        const inv3 = await makeRequest('/api/trading-mode', 'POST', {}, { mode: '   ' });
        check('Whitespace mode string returns 400 Bad Request', inv3.statusCode === 400);

        // Invalid 4: unknown mode
        const inv4 = await makeRequest('/api/trading-mode', 'POST', {}, { mode: 'SCALP' });
        check('Invalid mode "SCALP" returns 400 Bad Request', inv4.statusCode === 400);

        // Invalid 5: number
        const inv5 = await makeRequest('/api/trading-mode', 'POST', {}, { mode: 123 });
        check('Numeric mode returns 400 Bad Request', inv5.statusCode === 400);

        // Invalid 6: null
        const inv6 = await makeRequest('/api/trading-mode', 'POST', {}, { mode: null });
        check('Null mode returns 400 Bad Request', inv6.statusCode === 400);

        console.log('\n--- 4. BVA Valid Inputs: Switching to SWING ---');
        // Valid 1: lowercase 'swing' normalized
        const val1 = await makeRequest('/api/trading-mode', 'POST', {}, { mode: 'swing' });
        check('Lowercase "swing" returns 200 OK', val1.statusCode === 200);
        check('Response mode normalized to SWING', val1.data.trading_mode === 'SWING');

        // Verify status endpoint reflects SWING
        const statusAfterSwing = await makeRequest('/api/status');
        check('Status endpoint reflects SWING', statusAfterSwing.data.trading_mode === 'SWING');

        // Verify screener config endpoint reflects SWING
        const configAfterSwing = await makeRequest('/api/screener/config');
        check('Screener config reflects SWING', configAfterSwing.data.config.trading_mode === 'SWING');

        console.log('\n--- 5. BVA Valid Inputs: Switching back to DAY ---');
        // Valid 2: uppercase 'DAY' with whitespace
        const val2 = await makeRequest('/api/trading-mode', 'POST', {}, { mode: '  DAY  ' });
        check('Padded "  DAY  " returns 200 OK', val2.statusCode === 200);
        check('Response mode normalized to DAY', val2.data.trading_mode === 'DAY');

        const statusAfterDay = await makeRequest('/api/status');
        check('Status endpoint reflects DAY', statusAfterDay.data.trading_mode === 'DAY');

        console.log('\n--- 6. PATCH /api/screener/config with trading_mode ---');
        const patchRes = await makeRequest('/api/screener/config', 'PATCH', {}, { trading_mode: 'SWING' });
        check('PATCH config with trading_mode SWING returns 200', patchRes.statusCode === 200);
        check('PATCH returns updated trading_mode SWING', patchRes.data.config.trading_mode === 'SWING');

        // Invalid PATCH trading_mode
        const patchInv = await makeRequest('/api/screener/config', 'PATCH', {}, { trading_mode: 'INVALID' });
        check('PATCH config with invalid mode returns 400', patchInv.statusCode === 400);

        console.log('\n--- 7. Audit Log Verification ---');
        const auditRes = await makeRequest('/api/screener/config/audit');
        check('Audit endpoint returns 200', auditRes.statusCode === 200);
        const audits = auditRes.data.audit || [];
        const modeAudits = audits.filter(a => a.action === 'UPDATE_TRADING_MODE');
        check('Audit log contains UPDATE_TRADING_MODE entries', modeAudits.length >= 2);
        if (modeAudits.length > 0) {
            const latest = modeAudits[0];
            check('Audit log records new_values JSON with trading_mode', latest.new_values.includes('trading_mode'));
        }

        console.log('\n================================================================');
        console.log(`  Tests Completed: ${passedChecks}/${totalChecks} Passed`);
        console.log('================================================================\n');

    } catch (err) {
        console.error('Test failed with error:', err);
        process.exitCode = 1;
    } finally {
        if (serverProcess) {
            serverProcess.kill('SIGTERM');
        }
        try {
            fs.rmSync(TEST_SHARED_DATA_DIR, { recursive: true, force: true });
        } catch (_) {}
    }
}

runTests();
