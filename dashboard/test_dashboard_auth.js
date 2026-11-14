const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const jwt = require('jsonwebtoken');

console.log('[Test Suite] Dashboard Authentication & Fail-Fast Regressions (HOM-129)');

// Test 1: Fail-fast when CF_ACCESS_AUD is missing
function testFailFastWhenCfAudMissing() {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join('/app', 'server.js')], {
            env: {
                ...process.env,
                PORT: '3999',
                CF_ACCESS_AUD: '', // empty
                BRIDGE_SERVICE_TOKEN: 'test-token'
            }
        });

        const timer = setTimeout(() => {
            child.kill();
            reject(new Error("FAIL: Server did not fail fast when CF_ACCESS_AUD was empty (kept running)"));
        }, 2000);

        child.on('exit', (code) => {
            clearTimeout(timer);
            try {
                assert.notStrictEqual(code, 0, 'Server must fail-fast with non-zero exit code when CF_ACCESS_AUD is empty');
                console.log('✓ PASS: Server failed fast when CF_ACCESS_AUD is empty (Exit code:', code, ')');
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
}

// Helper to make HTTP request
function makeRequest(port, headers = {}, pathStr = '/api/data') {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: pathStr,
            method: 'GET',
            headers: headers
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function runDashboardTests() {
    console.log('--- 1. Testing Fail-Fast ---');
    await testFailFastWhenCfAudMissing();

    console.log('--- 2. Testing Running Server Auth Enforcements ---');
    const testPort = 3998;
    const testAud = 'test-aud-12345';
    const testServiceToken = 'secret-svc-token-abcde';

    const serverProc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        env: {
            ...process.env,
            PORT: String(testPort),
            CF_ACCESS_AUD: testAud,
            BRIDGE_SERVICE_TOKEN: testServiceToken
        }
    });

    serverProc.stdout.on('data', (d) => console.log('[Server stdout]', d.toString().trim()));
    serverProc.stderr.on('data', (d) => console.error('[Server stderr]', d.toString().trim()));

    // Wait for server to start
    await new Promise(r => setTimeout(r, 1000));

    try {
        // Test 2a: Missing auth headers must return 401 (NOT 200 with Local Sandbox User)
        const unauthRes = await makeRequest(testPort, {});
        assert.strictEqual(unauthRes.statusCode, 401, `Expected 401 for unauthenticated request, got ${unauthRes.statusCode}: ${unauthRes.body}`);
        assert.ok(!unauthRes.body.includes('Local Sandbox User'), 'Must not contain Local Sandbox User');
        console.log('✓ PASS: Missing auth returns 401 Unauthorized (Sandbox fallback eliminated)');

        // Test 2b: Fake alg:none JWT must return 401
        // Create an unsigned JWT header: { alg: "none", typ: "JWT" }
        const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
        const fakePayload = Buffer.from(JSON.stringify({ aud: testAud, email: "attacker@fake.local", sub: "fake" })).toString('base64url');
        const fakeNoneJwt = `${fakeHeader}.${fakePayload}.`;

        const algNoneRes = await makeRequest(testPort, {
            'cf-access-jwt-assertion': fakeNoneJwt
        });
        assert.strictEqual(algNoneRes.statusCode, 401, `Expected 401 for alg:none JWT, got ${algNoneRes.statusCode}: ${algNoneRes.body}`);
        console.log('✓ PASS: Fake alg:none JWT rejected with 401');

        // Test 2c: Valid service token must return 200
        const validSvcRes = await makeRequest(testPort, {
            'x-service-token': testServiceToken
        });
        assert.strictEqual(validSvcRes.statusCode, 200, `Expected 200 for valid service token, got ${validSvcRes.statusCode}`);
        console.log('✓ PASS: Valid service token authenticated successfully with 200');

        // Test 2d: Invalid service token must return 401 or 403
        const invalidSvcRes = await makeRequest(testPort, {
            'x-service-token': 'wrong-token'
        });
        assert.strictEqual(invalidSvcRes.statusCode, 401, `Expected 401 for invalid service token, got ${invalidSvcRes.statusCode}`);
        console.log('✓ PASS: Invalid service token rejected');

        // Test 2e: Real RS256 JWT verification with valid signature
        const crypto = require('crypto');
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        // Launch server with test public key enabled
        const testPort2 = 3997;
        const serverProc2 = spawn(process.execPath, [path.join('/app', 'server.js')], {
            env: {
                ...process.env,
                PORT: String(testPort2),
                CF_ACCESS_AUD: testAud,
                CF_ACCESS_TEAM_DOMAIN: 'julietmike.cloudflareaccess.com',
                CF_ACCESS_TEST_PUBLIC_KEY: publicKey,
                BRIDGE_SERVICE_TOKEN: testServiceToken
            }
        });
        await new Promise(r => setTimeout(r, 1000));

        try {
            // Valid RS256 token
            const validJwt = jwt.sign(
                { email: "trader@home-crew.lan", sub: "trader-sub-1" },
                privateKey,
                {
                    algorithm: 'RS256',
                    keyid: 'test-kid-1',
                    audience: testAud,
                    issuer: 'https://julietmike.cloudflareaccess.com',
                    expiresIn: '1h'
                }
            );

            const rs256Res = await makeRequest(testPort2, {
                'cf-access-jwt-assertion': validJwt
            });
            assert.strictEqual(rs256Res.statusCode, 200, `Expected 200 for valid RS256 token, got ${rs256Res.statusCode}: ${rs256Res.body}`);
            const body = JSON.parse(rs256Res.body);
            assert.strictEqual(body.user, 'trader@home-crew.lan', 'Authenticated user must match JWT email claim');
            console.log('✓ PASS: Valid RS256 JWT verified against JWKS public key with 200 OK');

            // Token with wrong audience
            const wrongAudJwt = jwt.sign(
                { email: "hacker@evil.com", sub: "evil-sub" },
                privateKey,
                {
                    algorithm: 'RS256',
                    keyid: 'test-kid-1',
                    audience: 'wrong-audience',
                    issuer: 'https://julietmike.cloudflareaccess.com',
                    expiresIn: '1h'
                }
            );
            const wrongAudRes = await makeRequest(testPort2, {
                'cf-access-jwt-assertion': wrongAudJwt
            });
            assert.strictEqual(wrongAudRes.statusCode, 401, `Expected 401 for wrong audience, got ${wrongAudRes.statusCode}`);
            console.log('✓ PASS: RS256 JWT with mismatched audience rejected with 401');
        } finally {
            serverProc2.kill();
        }

    } finally {
        serverProc.kill();
    }
}

runDashboardTests().then(() => {
    console.log('[ALL DASHBOARD TESTS PASSED]');
    process.exit(0);
}).catch(err => {
    console.error('[TEST FAILED]', err);
    process.exit(1);
});
