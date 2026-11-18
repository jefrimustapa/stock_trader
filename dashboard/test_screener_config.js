/**
 * test_screener_config.js
 * Comprehensive Unit, Boundary Value Analysis (BVA), and Integration Test Suite
 * for Screener Configuration API & SQLite Persistence (HOM-189 / HOM-190).
 */

const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('================================================================');
console.log('  Screener Configuration Backend API & BVA Test Suite (HOM-190)  ');
console.log('================================================================\n');

const TEST_PORT = 3888;
const TEST_SHARED_DATA_DIR = path.join(__dirname, 'test_shared_data_' + Date.now());
const TEST_SERVICE_TOKEN = 'test-token-hom-190';

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
        // Start dashboard server in test mode
        console.log('--- 1. Starting Dashboard Server on port ' + TEST_PORT + ' ---');
        serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
            env: {
                ...process.env,
                PORT: String(TEST_PORT),
                SHARED_DATA_DIR: TEST_SHARED_DATA_DIR,
                AUTHENTIK_CLIENT_ID: 'test-client-id',
                BRIDGE_SERVICE_TOKEN: TEST_SERVICE_TOKEN,
                NODE_ENV: 'test'
            }
        });

        serverProcess.stdout.on('data', d => {
            // Uncomment for debugging: console.log('[Server stdout]', d.toString());
        });
        serverProcess.stderr.on('data', d => {
            // Uncomment for debugging: console.error('[Server stderr]', d.toString());
        });

        // Wait for server to be responsive
        let connected = false;
        for (let i = 0; i < 30; i++) {
            try {
                const res = await makeRequest('/api/data', 'GET', { 'x-service-token': TEST_SERVICE_TOKEN });
                if (res.statusCode === 200) {
                    connected = true;
                    break;
                }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 200));
        }
        assert(connected, 'Server failed to start within 6 seconds');
        console.log('  ✓ Server started successfully.\n');

        const authHeader = { 'x-service-token': TEST_SERVICE_TOKEN };

        // Test 1: Authentication enforcement
        console.log('--- 2. Auth Guard & Security Enforcement ---');
        const unauthGet = await makeRequest('/api/screener/config', 'GET');
        check('GET /api/screener/config rejects unauthenticated requests (HTTP 401)', unauthGet.statusCode === 401);

        const unauthPatch = await makeRequest('/api/screener/config', 'PATCH', {}, { min_price: 5.0 });
        check('PATCH /api/screener/config rejects unauthenticated requests (HTTP 401)', unauthPatch.statusCode === 401);

        // Test 2: GET default config
        console.log('\n--- 3. Default Configuration & Limits ---');
        const defaultRes = await makeRequest('/api/screener/config', 'GET', authHeader);
        check('GET /api/screener/config returns HTTP 200', defaultRes.statusCode === 200);
        check('Default min_price is 10.0', defaultRes.data.config.min_price === 10.0);
        check('Default min_market_cap is 1,000,000,000', defaultRes.data.config.min_market_cap === 1000000000.0);
        check('Default min_volume is 1,000,000', defaultRes.data.config.min_volume === 1000000.0);
        check('Default max_candidates_per_lane is 5', defaultRes.data.config.max_candidates_per_lane === 5);
        check('Safety limit min_price.min is 1.0', defaultRes.data.limits.min_price.min === 1.0);
        check('Limit max_candidates_per_lane is 1 to 20', defaultRes.data.limits.max_candidates_per_lane.min === 1 && defaultRes.data.limits.max_candidates_per_lane.max === 20);

        // Test 3: Boundary Value Analysis (BVA) on min_price
        console.log('\n--- 4. BVA: min_price Boundary ($0.99 vs $1.00 vs $1.01) ---');
        // $0.99 -> Must be rejected (HTTP 400)
        const bvaBelow = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: 0.99 });
        check('BVA: $0.99 rejected with HTTP 400', bvaBelow.statusCode === 400);
        check('BVA: Error message explicitly mentions $1.00 hard safety floor', 
            bvaBelow.data && bvaBelow.data.error && bvaBelow.data.error.includes('$1.00'));

        // Negative value -> Must be rejected
        const bvaNeg = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: -5.0 });
        check('BVA: Negative price (-$5.00) rejected with HTTP 400', bvaNeg.statusCode === 400);

        // Non-number string -> Must be rejected
        const bvaStr = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: 'invalid' });
        check('BVA: String price ("invalid") rejected with HTTP 400', bvaStr.statusCode === 400);

        // $1.00 -> Lowest valid boundary: Must be accepted (HTTP 200)
        const bvaExact = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: 1.00 });
        check('BVA: $1.00 (exact boundary) accepted with HTTP 200', bvaExact.statusCode === 200);
        check('BVA: Updated min_price is exactly 1.00', bvaExact.data.config.min_price === 1.00);

        // $1.01 -> Just above boundary: Must be accepted (HTTP 200)
        const bvaAbove = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: 1.01 });
        check('BVA: $1.01 accepted with HTTP 200', bvaAbove.statusCode === 200);
        check('BVA: Updated min_price is 1.01', bvaAbove.data.config.min_price === 1.01);

        // $5.00 -> User Acceptance Scenario value: Must be accepted (HTTP 200)
        const bvaUserScenario = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: 5.00 });
        check('BVA: $5.00 (User acceptance scenario) accepted with HTTP 200', bvaUserScenario.statusCode === 200);
        check('BVA: Updated min_price is 5.00', bvaUserScenario.data.config.min_price === 5.00);

        // Test 4: BVA on min_market_cap & min_volume
        console.log('\n--- 5. BVA: Market Cap & Volume Boundaries ---');
        // Cap < $10M -> Reject
        const bvaCapBelow = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_market_cap: 9999999 });
        check('BVA: Market Cap < $10M rejected with HTTP 400', bvaCapBelow.statusCode === 400);

        // Cap $500M -> Accept
        const bvaCapValid = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_market_cap: 500000000 });
        check('BVA: Market Cap $500M accepted with HTTP 200', bvaCapValid.statusCode === 200);

        // Volume < 50,000 -> Reject
        const bvaVolBelow = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_volume: 49999 });
        check('BVA: ADV20 < 50,000 rejected with HTTP 400', bvaVolBelow.statusCode === 400);

        // Volume 500,000 -> Accept
        const bvaVolValid = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_volume: 500000 });
        check('BVA: ADV20 500,000 accepted with HTTP 200', bvaVolValid.statusCode === 200);

        // Test 5: BVA on RVOL & Cross-field Validation
        console.log('\n--- 6. BVA: RVOL Range & Cross-Field Validation ---');
        // min_rvol > max_rvol -> Reject
        const bvaRvolInverted = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_rvol: 10.0, max_rvol: 2.0 });
        check('Cross-field: min_rvol > max_rvol rejected with HTTP 400', bvaRvolInverted.statusCode === 400);

        // Negative RVOL -> Reject
        const bvaRvolNeg = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_rvol: -1.0 });
        check('BVA: Negative min_rvol rejected with HTTP 400', bvaRvolNeg.statusCode === 400);

        // Valid RVOL range -> Accept
        const bvaRvolValid = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_rvol: 0.8, max_rvol: 15.0 });
        check('BVA: Valid RVOL range (0.8 - 15.0) accepted with HTTP 200', bvaRvolValid.statusCode === 200);

        // Test 6b: Type Validation & Empty Payload Handling (HOM-193 Defect 3)
        console.log('\n--- 6b. Strict Type Validation & Empty Payload Handling (HOM-193) ---');
        const boolReject = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: true });
        check('Strict Type: Boolean { min_price: true } rejected with HTTP 400', boolReject.statusCode === 400);

        const boolFalseReject = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: false });
        check('Strict Type: Boolean { min_price: false } rejected with HTTP 400', boolFalseReject.statusCode === 400);

        const arrayFieldReject = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: [7] });
        check('Strict Type: Array { min_price: [7] } rejected with HTTP 400', arrayFieldReject.statusCode === 400);

        const emptyStringReject = await makeRequest('/api/screener/config', 'PATCH', authHeader, { min_price: "" });
        check('Strict Type: Empty string { min_price: "" } rejected with HTTP 400', emptyStringReject.statusCode === 400);

        const arrayBodyReject = await makeRequest('/api/screener/config', 'PATCH', authHeader, [7]);
        check('Strict Type: Array body [7] rejected with HTTP 400', arrayBodyReject.statusCode === 400);

        // Record audit count before empty PATCH
        const auditBefore = await makeRequest('/api/screener/config/audit', 'GET', authHeader);
        const countBefore = Array.isArray(auditBefore.data.audit) ? auditBefore.data.audit.length : 0;

        // Empty PATCH {}
        const emptyPatchRes = await makeRequest('/api/screener/config', 'PATCH', authHeader, {});
        const auditAfter = await makeRequest('/api/screener/config/audit', 'GET', authHeader);
        const countAfter = Array.isArray(auditAfter.data.audit) ? auditAfter.data.audit.length : 0;
        check('Empty Payload {}: Does NOT write audit entry', countAfter === countBefore);

        // Test 6c: BVA on max_candidates_per_lane (HOM-282)
        console.log('\n--- 6c. BVA: max_candidates_per_lane (0 vs 1 vs 20 vs 21 & decimals) (HOM-282) ---');
        // Below minimum (0) -> Reject
        const bvaLaneZero = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: 0 });
        check('BVA: max_candidates_per_lane 0 rejected with HTTP 400', bvaLaneZero.statusCode === 400);

        // Negative (-1) -> Reject
        const bvaLaneNeg = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: -1 });
        check('BVA: Negative max_candidates_per_lane (-1) rejected with HTTP 400', bvaLaneNeg.statusCode === 400);

        // Above maximum (21) -> Reject
        const bvaLane21 = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: 21 });
        check('BVA: max_candidates_per_lane 21 rejected with HTTP 400', bvaLane21.statusCode === 400);

        // Extreme value (100) -> Reject
        const bvaLane100 = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: 100 });
        check('BVA: Extreme max_candidates_per_lane (100) rejected with HTTP 400', bvaLane100.statusCode === 400);

        // Decimal (5.5) -> Reject (must be strict integer)
        const bvaLaneDecimal = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: 5.5 });
        check('BVA: Decimal max_candidates_per_lane (5.5) rejected with HTTP 400', bvaLaneDecimal.statusCode === 400);

        // String non-number -> Reject
        const bvaLaneStr = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: 'invalid' });
        check('BVA: String max_candidates_per_lane ("invalid") rejected with HTTP 400', bvaLaneStr.statusCode === 400);

        // Boolean -> Reject
        const bvaLaneBool = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: true });
        check('BVA: Boolean max_candidates_per_lane (true) rejected with HTTP 400', bvaLaneBool.statusCode === 400);

        // Boundary Minimum (1) -> Accept
        const bvaLaneMin = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: 1 });
        check('BVA: Minimum boundary (1) accepted with HTTP 200', bvaLaneMin.statusCode === 200);
        check('BVA: Config updated max_candidates_per_lane to 1', bvaLaneMin.data.config.max_candidates_per_lane === 1);

        // Boundary Maximum (20) -> Accept
        const bvaLaneMax = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: 20 });
        check('BVA: Maximum boundary (20) accepted with HTTP 200', bvaLaneMax.statusCode === 200);
        check('BVA: Config updated max_candidates_per_lane to 20', bvaLaneMax.data.config.max_candidates_per_lane === 20);

        // Target Value (8) -> Accept
        const bvaLaneTarget = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_candidates_per_lane: 8 });
        check('BVA: Target value (8) accepted with HTTP 200', bvaLaneTarget.statusCode === 200);
        check('BVA: Config updated max_candidates_per_lane to 8', bvaLaneTarget.data.config.max_candidates_per_lane === 8);

        // Verify GET persistence
        const verifyGet = await makeRequest('/api/screener/config', 'GET', authHeader);
        check('Persistence: GET /api/screener/config confirms max_candidates_per_lane is 8', verifyGet.data.config.max_candidates_per_lane === 8);

        // Test 6d: BVA max_buying_power (499.99 vs 500.00 vs 50,000 vs >100M) (HOM-302)
        console.log('\n--- 6d. BVA: max_buying_power ($499.99 vs $500.00 vs $50,000) (HOM-302) ---');
        const bvaBpBelow = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_buying_power: 499.99 });
        check('BVA: max_buying_power $499.99 rejected with HTTP 400', bvaBpBelow.statusCode === 400);

        const bvaBpNeg = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_buying_power: -100.0 });
        check('BVA: Negative max_buying_power rejected with HTTP 400', bvaBpNeg.statusCode === 400);

        const bvaBpOver = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_buying_power: 100000001.0 });
        check('BVA: max_buying_power > $100M rejected with HTTP 400', bvaBpOver.statusCode === 400);

        const bvaBpMin = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_buying_power: 500.0 });
        check('BVA: Exact floor $500.00 accepted with HTTP 200', bvaBpMin.statusCode === 200);
        check('BVA: Config updated max_buying_power to 500.0', bvaBpMin.data.config.max_buying_power === 500.0);

        const bvaBpTarget = await makeRequest('/api/screener/config', 'PATCH', authHeader, { max_buying_power: 50000.0 });
        check('BVA: Target buying power ($50,000) accepted with HTTP 200', bvaBpTarget.statusCode === 200);
        check('BVA: Config updated max_buying_power to 50000.0', bvaBpTarget.data.config.max_buying_power === 50000.0);

        const verifyBpGet = await makeRequest('/api/screener/config', 'GET', authHeader);
        check('Persistence: GET /api/screener/config confirms max_buying_power is 50000.0', verifyBpGet.data.config.max_buying_power === 50000.0);

        // Test 6e: BVA agent_orders_per_page (4 vs 5 vs 10 vs 25 vs 50 vs 51 vs invalid) (HOM-305)
        console.log('\n--- 6e. BVA: agent_orders_per_page (5, 10, 25, 50) (HOM-305) ---');
        const bvaPageBelow = await makeRequest('/api/screener/config', 'PATCH', authHeader, { agent_orders_per_page: 4 });
        check('BVA: agent_orders_per_page 4 rejected with HTTP 400', bvaPageBelow.statusCode === 400);

        const bvaPageNeg = await makeRequest('/api/screener/config', 'PATCH', authHeader, { agent_orders_per_page: -5 });
        check('BVA: Negative agent_orders_per_page rejected with HTTP 400', bvaPageNeg.statusCode === 400);

        const bvaPageOver = await makeRequest('/api/screener/config', 'PATCH', authHeader, { agent_orders_per_page: 51 });
        check('BVA: agent_orders_per_page 51 rejected with HTTP 400', bvaPageOver.statusCode === 400);

        const bvaPageDecimal = await makeRequest('/api/screener/config', 'PATCH', authHeader, { agent_orders_per_page: 10.5 });
        check('BVA: Decimal agent_orders_per_page rejected with HTTP 400', bvaPageDecimal.statusCode === 400);

        const bvaPageStr = await makeRequest('/api/screener/config', 'PATCH', authHeader, { agent_orders_per_page: 'invalid' });
        check('BVA: String agent_orders_per_page rejected with HTTP 400', bvaPageStr.statusCode === 400);

        const bvaPage5 = await makeRequest('/api/screener/config', 'PATCH', authHeader, { agent_orders_per_page: 5 });
        check('BVA: Option 5 accepted with HTTP 200', bvaPage5.statusCode === 200);
        check('BVA: Config updated agent_orders_per_page to 5', bvaPage5.data.config.agent_orders_per_page === 5);

        const bvaPage25 = await makeRequest('/api/screener/config', 'PATCH', authHeader, { agent_orders_per_page: 25 });
        check('BVA: Option 25 accepted with HTTP 200', bvaPage25.statusCode === 200);
        check('BVA: Config updated agent_orders_per_page to 25', bvaPage25.data.config.agent_orders_per_page === 25);

        const bvaPage50 = await makeRequest('/api/screener/config', 'PATCH', authHeader, { agent_orders_per_page: 50 });
        check('BVA: Option 50 accepted with HTTP 200', bvaPage50.statusCode === 200);
        check('BVA: Config updated agent_orders_per_page to 50', bvaPage50.data.config.agent_orders_per_page === 50);

        const verifyPageGet = await makeRequest('/api/screener/config', 'GET', authHeader);
        check('Persistence: GET /api/screener/config confirms agent_orders_per_page is 50', verifyPageGet.data.config.agent_orders_per_page === 50);

        // Test 7: Audit Trail & Data Integrity
        console.log('\n--- 7. Audit Trail & SQLite Persistence Verification ---');
        const auditRes = await makeRequest('/api/screener/config/audit', 'GET', authHeader);
        check('GET /api/screener/config/audit returns HTTP 200', auditRes.statusCode === 200);
        check('Audit log contains history records', Array.isArray(auditRes.data.audit) && auditRes.data.audit.length >= 4);

        const latestAudit = auditRes.data.audit[0];
        check('Audit entry includes timestamp', Boolean(latestAudit.timestamp));
        check('Audit entry includes action UPDATE_CONFIG', latestAudit.action === 'UPDATE_CONFIG');
        check('Audit entry does NOT leak secret or authorization tokens', 
            !JSON.stringify(latestAudit).includes(TEST_SERVICE_TOKEN));

        // Test 7: Verify SQLite file exists and can be read by external Python-compatible query
        const sqlitePath = path.join(TEST_SHARED_DATA_DIR, 'screener_config.sqlite');
        check('SQLite database file exists on disk', fs.existsSync(sqlitePath));

    } finally {
        if (serverProcess) {
            serverProcess.kill('SIGTERM');
        }
        // Cleanup test directory
        try {
            fs.rmSync(TEST_SHARED_DATA_DIR, { recursive: true, force: true });
        } catch (e) {}
    }

    console.log('\n================================================================');
    console.log(`  Screener Config Test Results: ${passedChecks} / ${totalChecks} passed`);
    console.log('================================================================\n');

    if (passedChecks !== totalChecks) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal Test Suite Error:', err);
    if (serverProcess) serverProcess.kill('SIGTERM');
    process.exit(1);
});
