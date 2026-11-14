const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

console.log('[Test Suite] Dashboard Sign-In & Credential Hashing Defect SDLC #8 (HOM-165)');

function makeRequest(port, headers = {}, pathStr = '/', method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: pathStr,
            method: method,
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: data
            }));
        });
        req.on('error', reject);
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

async function runSignInTests() {
    const testPort = 3995;
    const testClientId = 'stock-trader-client';
    const testIssuer = 'https://auth.julietmike.net/application/o/stock-trader/';
    const testServiceToken = 'secret-svc-token-test123';
    const testForwardSecret = 'shared-secret-123';
    const ssoInvalidationUrl = 'https://auth.julietmike.net/flows/-/default/invalidation/';

    const serverProc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        env: {
            ...process.env,
            PORT: String(testPort),
            AUTHENTIK_CLIENT_ID: testClientId,
            AUTHENTIK_ISSUER_URL: testIssuer,
            AUTHENTIK_LOGOUT_URL: ssoInvalidationUrl,
            FORWARD_AUTH_SECRET: testForwardSecret,
            BRIDGE_SERVICE_TOKEN: testServiceToken
        }
    });

    await new Promise(r => setTimeout(r, 1000));

    try {
        console.log('--- 1. Testing UI Form Medan Kata Laluan ---');
        const uiRes = await makeRequest(testPort, {
            'x-service-token': `Bearer ${testServiceToken}`
        }, '/');
        assert.strictEqual(uiRes.statusCode, 200);
        assert.ok(uiRes.body.includes('loginAccInput'), 'UI mesti ada loginAccInput');
        assert.ok(uiRes.body.includes('loginPwdInput'), 'Kecacatan HOM-164: UI mesti ada medan loginPwdInput untuk kata laluan');
        assert.ok(uiRes.body.includes('type="password"'), 'Medan kata laluan mesti jenis type="password"');

        console.log('--- 2. Testing POST /api/opend/sign-in ---');
        // Unauthenticated check
        const unauthRes = await makeRequest(testPort, {
            'content-type': 'application/json'
        }, '/api/opend/sign-in', 'POST', JSON.stringify({ login_account: '12345', password: 'secretpassword' }));
        assert.strictEqual(unauthRes.statusCode, 401, 'Unauthenticated sign-in mesti ditolak 401');

        // Empty account BVA
        const emptyAccRes = await makeRequest(testPort, {
            'x-service-token': `Bearer ${testServiceToken}`,
            'content-type': 'application/json'
        }, '/api/opend/sign-in', 'POST', JSON.stringify({ login_account: '', password: 'secretpassword' }));
        assert.strictEqual(emptyAccRes.statusCode, 400, 'Akaun kosong mesti dipulangkan 400');

        // Empty password BVA
        const emptyPwdRes = await makeRequest(testPort, {
            'x-service-token': `Bearer ${testServiceToken}`,
            'content-type': 'application/json'
        }, '/api/opend/sign-in', 'POST', JSON.stringify({ login_account: '12345', password: '' }));
        assert.strictEqual(emptyPwdRes.statusCode, 400, 'Kata laluan kosong mesti dipulangkan 400');

        console.log('✓ All checks passed in test_dashboard_signin.js');
    } finally {
        serverProc.kill();
    }
}

runSignInTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('TEST FAILED:', err.message);
    process.exit(1);
});
