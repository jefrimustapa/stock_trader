const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

console.log('[Test Suite] Authentik Dashboard Authentication & Fail-Fast Regressions (HOM-142)');

// Test 1: Fail-fast when AUTHENTIK_CLIENT_ID is missing
function testFailFastWhenClientIdMissing() {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
            env: {
                ...process.env,
                PORT: '3999',
                AUTHENTIK_CLIENT_ID: '', // empty
                BRIDGE_SERVICE_TOKEN: 'test-token'
            }
        });

        const timer = setTimeout(() => {
            child.kill();
            reject(new Error("FAIL: Server did not fail fast when AUTHENTIK_CLIENT_ID was empty (kept running)"));
        }, 2000);

        child.on('exit', (code) => {
            clearTimeout(timer);
            try {
                assert.notStrictEqual(code, 0, 'Server must fail-fast with non-zero exit code when AUTHENTIK_CLIENT_ID is empty');
                console.log('✓ PASS: Server failed fast when AUTHENTIK_CLIENT_ID is empty (Exit code:', code, ')');
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
}

// Helper to make HTTP request
function makeRequest(port, headers = {}, pathStr = '/api/data', method = 'GET', body = null) {
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

async function runDashboardTests() {
    console.log('--- 1. Testing Fail-Fast ---');
    await testFailFastWhenClientIdMissing();

    console.log('--- 2. Testing Running Server Auth Enforcements ---');
    const testPort = 3998;
    const testClientId = 'stock-trader-client';
    const testIssuer = 'https://auth.julietmike.net/application/o/stock-trader/';
    const testServiceToken = 'secret-svc-token-abcde';
    const testForwardSecret = 'test-forward-auth-shared-secret-xyz123';
    const testLogoutUrl = 'https://auth.julietmike.net/flows/-/default/invalidation/';
    const ssoInvalidationUrl = 'https://auth.julietmike.net/flows/-/default/invalidation/';

    const serverProc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        env: {
            ...process.env,
            PORT: String(testPort),
            AUTHENTIK_CLIENT_ID: testClientId,
            AUTHENTIK_ISSUER_URL: testIssuer,
            AUTHENTIK_LOGOUT_URL: ssoInvalidationUrl, // Authentik SSO invalidation URL must be allowed without override
            FORWARD_AUTH_SECRET: testForwardSecret,
            BRIDGE_SERVICE_TOKEN: testServiceToken
        }
    });

    serverProc.stdout.on('data', (d) => console.log('[Server stdout]', d.toString().trim()));
    serverProc.stderr.on('data', (d) => console.error('[Server stderr]', d.toString().trim()));

    // Wait for server to start
    await new Promise(r => setTimeout(r, 1000));

    try {
        // Test 2a: Missing auth headers must return 401
        const unauthRes = await makeRequest(testPort, {});
        assert.strictEqual(unauthRes.statusCode, 401, `Expected 401 for unauthenticated request, got ${unauthRes.statusCode}: ${unauthRes.body}`);
        console.log('✓ PASS: Missing auth returns 401 Unauthorized');

        // Test 2a2: Browser HTML request without Authentik session must redirect 302 directly to Authentik SSO (no internal fallback form)
        const browserUnauthRes = await makeRequest(testPort, {
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }, '/');
        assert.strictEqual(browserUnauthRes.statusCode, 302, `Expected 302 redirect for browser HTML request, got ${browserUnauthRes.statusCode}`);
        assert.ok(browserUnauthRes.headers['location'], 'Redirect location header must be present');
        assert.ok(browserUnauthRes.headers['location'].includes('auth.julietmike.net'), `Redirect must point to Authentik SSO, got: ${browserUnauthRes.headers['location']}`);
        assert.ok(!browserUnauthRes.body.includes('STOCK-TRADER Access'), 'Must not render internal fallback token form');
        console.log('✓ PASS: Browser HTML unauthenticated request redirects 302 directly to Authentik SSO without internal fallback form');

        // Test 2b: Fake alg:none JWT must return 401
        const fakeHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
        const fakePayload = Buffer.from(JSON.stringify({ aud: testClientId, email: "attacker@fake.local", sub: "fake" })).toString('base64url');
        const fakeNoneJwt = `${fakeHeader}.${fakePayload}.`;

        const algNoneRes = await makeRequest(testPort, {
            'x-authentik-jwt': fakeNoneJwt
        });
        assert.strictEqual(algNoneRes.statusCode, 401, `Expected 401 for alg:none JWT, got ${algNoneRes.statusCode}: ${algNoneRes.body}`);
        console.log('✓ PASS: Fake alg:none JWT rejected with 401');

        // Test 2c: Valid service token must return 200
        const validSvcRes = await makeRequest(testPort, {
            'x-service-token': testServiceToken
        });
        assert.strictEqual(validSvcRes.statusCode, 200, `Expected 200 for valid service token, got ${validSvcRes.statusCode}`);
        console.log('✓ PASS: Valid service token authenticated successfully with 200');

        // Test 2d: Invalid service token must return 401
        const invalidSvcRes = await makeRequest(testPort, {
            'x-service-token': 'wrong-token'
        });
        assert.strictEqual(invalidSvcRes.statusCode, 401, `Expected 401 for invalid service token, got ${invalidSvcRes.statusCode}`);
        console.log('✓ PASS: Invalid service token rejected');

        // Test 2p (SDLC #8 defect regression - HOM-148): Spoofed X-authentik-username without shared secret MUST return 401
        const spoofedWithoutSecretRes = await makeRequest(testPort, {
            'x-authentik-username': 'spoofer'
        });
        assert.strictEqual(spoofedWithoutSecretRes.statusCode, 401, `Expected 401 when X-authentik-username is sent without shared secret, got ${spoofedWithoutSecretRes.statusCode}`);
        console.log('✓ PASS: Spoofed X-authentik-username without secret rejected with 401');

        // Test 2q (HOM-148 BVA): Spoofed X-authentik-username with invalid shared secret (length mismatch) MUST return 401
        const spoofedWrongSecretRes = await makeRequest(testPort, {
            'x-authentik-username': 'spoofer',
            'x-forward-auth-secret': 'wrong-secret'
        });
        assert.strictEqual(spoofedWrongSecretRes.statusCode, 401, `Expected 401 for wrong shared secret, got ${spoofedWrongSecretRes.statusCode}`);
        console.log('✓ PASS: Spoofed X-authentik-username with wrong length shared secret rejected with 401');

        // Test 2q2 (HOM-148 BVA): Spoofed with same length but differing by 1 char MUST return 401 (timingSafeEqual branch)
        const sameLengthWrongSecret = testForwardSecret.slice(0, -1) + (testForwardSecret.endsWith('0') ? '1' : '0');
        const spoofedSameLenRes = await makeRequest(testPort, {
            'x-authentik-username': 'spoofer',
            'x-forward-auth-secret': sameLengthWrongSecret
        });
        assert.strictEqual(spoofedSameLenRes.statusCode, 401, `Expected 401 for same length wrong secret, got ${spoofedSameLenRes.statusCode}`);
        console.log('✓ PASS: Spoofed X-authentik-username with same-length wrong shared secret rejected with 401');

        // Test 2q3 (HOM-148 BVA): Whitespace-only shared secret header MUST return 401
        const spoofedWhitespaceSecretRes = await makeRequest(testPort, {
            'x-authentik-username': 'spoofer',
            'x-forward-auth-secret': '   '
        });
        assert.strictEqual(spoofedWhitespaceSecretRes.statusCode, 401, `Expected 401 for whitespace-only shared secret, got ${spoofedWhitespaceSecretRes.statusCode}`);
        console.log('✓ PASS: Spoofed X-authentik-username with whitespace-only shared secret rejected with 401');

        // Test 2m (HOM-148): Valid Forward Auth via X-authentik-username WITH valid X-Forward-Auth-Secret
        const forwardAuthRes = await makeRequest(testPort, {
            'x-authentik-username': 'jefri',
            'x-forward-auth-secret': testForwardSecret
        });
        assert.strictEqual(forwardAuthRes.statusCode, 200, `Expected 200 for Authentik Forward Auth header with valid secret, got ${forwardAuthRes.statusCode}: ${forwardAuthRes.body}`);
        const forwardAuthBody = JSON.parse(forwardAuthRes.body);
        assert.strictEqual(forwardAuthBody.user, 'jefri', `Expected user 'jefri', got '${forwardAuthBody.user}'`);
        console.log('✓ PASS: Authentik Forward Auth (X-authentik-username + valid secret) authenticated with 200 OK');

        // Test 2n (HOM-148): Forward Auth via X-authentik-email fallback WITH valid X-Forward-Auth-Secret
        const forwardAuthEmailRes = await makeRequest(testPort, {
            'x-authentik-email': 'jefri@home-crew.lan',
            'x-forward-auth-secret': testForwardSecret
        });
        assert.strictEqual(forwardAuthEmailRes.statusCode, 200, `Expected 200 for Authentik Forward Auth email fallback with valid secret, got ${forwardAuthEmailRes.statusCode}`);
        const forwardAuthEmailBody = JSON.parse(forwardAuthEmailRes.body);
        assert.strictEqual(forwardAuthEmailBody.user, 'jefri@home-crew.lan');
        console.log('✓ PASS: Authentik Forward Auth (X-authentik-email fallback + valid secret) authenticated with 200 OK');

        // Test 2o (HOM-146 BVA): Empty / whitespace-only X-authentik-username rejected with 401
        const emptyUsernameRes = await makeRequest(testPort, {
            'x-authentik-username': '   '
        });
        assert.strictEqual(emptyUsernameRes.statusCode, 401, `Expected 401 for whitespace-only username, got ${emptyUsernameRes.statusCode}`);
        console.log('✓ PASS: Whitespace-only X-authentik-username rejected with 401');

        // Test 2e: Real RS256 JWT verification with test public key in NODE_ENV === 'test'
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        const testPort2 = 3997;
        const serverProc2 = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
            env: {
                ...process.env,
                NODE_ENV: 'test',
                PORT: String(testPort2),
                AUTHENTIK_CLIENT_ID: testClientId,
                AUTHENTIK_ISSUER_URL: testIssuer,
                AUTHENTIK_LOGOUT_URL: testLogoutUrl,
                AUTHENTIK_TEST_PUBLIC_KEY: publicKey,
                BRIDGE_SERVICE_TOKEN: testServiceToken
            }
        });
        await new Promise(r => setTimeout(r, 1000));

        try {
            // Valid RS256 token via X-authentik-jwt
            const validJwt = jwt.sign(
                { email: "trader@home-crew.lan", preferred_username: "trader", sub: "trader-sub-1" },
                privateKey,
                {
                    algorithm: 'RS256',
                    keyid: 'test-kid-authentik',
                    audience: testClientId,
                    issuer: testIssuer,
                    expiresIn: '1h'
                }
            );

            const rs256Res = await makeRequest(testPort2, {
                'x-authentik-jwt': validJwt
            });
            assert.strictEqual(rs256Res.statusCode, 200, `Expected 200 for valid RS256 token, got ${rs256Res.statusCode}: ${rs256Res.body}`);
            const body = JSON.parse(rs256Res.body);
            assert.strictEqual(body.user, 'trader@home-crew.lan', 'Authenticated user must match JWT email claim');
            console.log('✓ PASS: Valid RS256 JWT via X-authentik-jwt verified with 200 OK');

            // Valid RS256 token via Authorization: Bearer
            const bearerRes = await makeRequest(testPort2, {
                'authorization': `Bearer ${validJwt}`
            });
            assert.strictEqual(bearerRes.statusCode, 200, `Expected 200 for valid Bearer token, got ${bearerRes.statusCode}`);
            console.log('✓ PASS: Valid RS256 JWT via Authorization Bearer verified with 200 OK');

            // Valid RS256 token via Cookie
            const cookieRes = await makeRequest(testPort2, {
                'cookie': `authentik_jwt=${validJwt}; session=xyz`
            });
            assert.strictEqual(cookieRes.statusCode, 200, 'Expected 200 for valid RS256 token in cookie');
            const cookieBody = JSON.parse(cookieRes.body);
            assert.strictEqual(cookieBody.user, 'trader@home-crew.lan');
            console.log('✓ PASS: Valid RS256 JWT verified via authentik_jwt cookie with 200 OK');

            // Token with wrong audience
            const wrongAudJwt = jwt.sign(
                { email: "hacker@evil.com", sub: "evil-sub" },
                privateKey,
                {
                    algorithm: 'RS256',
                    keyid: 'test-kid-authentik',
                    audience: 'wrong-audience',
                    issuer: testIssuer,
                    expiresIn: '1h'
                }
            );
            const wrongAudRes = await makeRequest(testPort2, {
                'x-authentik-jwt': wrongAudJwt
            });
            assert.strictEqual(wrongAudRes.statusCode, 401, `Expected 401 for wrong audience, got ${wrongAudRes.statusCode}`);
            console.log('✓ PASS: RS256 JWT with mismatched audience rejected with 401');

            // Token with wrong issuer
            const wrongIssJwt = jwt.sign(
                { email: "hacker@evil.com", sub: "evil-sub" },
                privateKey,
                {
                    algorithm: 'RS256',
                    keyid: 'test-kid-authentik',
                    audience: testClientId,
                    issuer: 'https://attacker-idp.evil.com/',
                    expiresIn: '1h'
                }
            );
            const wrongIssRes = await makeRequest(testPort2, {
                'x-authentik-jwt': wrongIssJwt
            });
            assert.strictEqual(wrongIssRes.statusCode, 401, `Expected 401 for wrong issuer, got ${wrongIssRes.statusCode}`);
            console.log('✓ PASS: RS256 JWT with mismatched issuer rejected with 401');

            // Test 2f (HOM-156, HOM-158, HOM-159 & HOM-160): GET /logout endpoint must redirect to Authentik
            // stock-trader specific invalidation flow: https://auth.julietmike.net/if/flow/stock-trader-invalidation-flow/
            const expectedLogoutRedirect = 'https://auth.julietmike.net/if/flow/stock-trader-invalidation-flow/';
            const logoutRes = await makeRequest(testPort2, {
                cookie: 'authentik_proxy_session=mock-proxy-cookie; authentik_jwt=mock-jwt; paperclip_session=safe-paperclip-token; CF_Authorization=safe-cf-token; other_user_cookie=keep-me; ; =malformed'
            }, '/logout');
            assert.strictEqual(logoutRes.statusCode, 302, `Expected 302 for /logout, got ${logoutRes.statusCode}`);
            assert.ok(logoutRes.headers.location, 'Location header must be present');
            assert.strictEqual(logoutRes.headers.location, expectedLogoutRedirect,
                `HOM-160: Expected redirect to stock-trader-invalidation-flow, got: ${logoutRes.headers.location}`);
            assert.ok(logoutRes.headers['clear-site-data'], 'Clear-Site-Data header must be set');
            assert.ok(!logoutRes.headers['clear-site-data'].includes('cookies'),
                `Security violation (HOM-154): Clear-Site-Data must NOT include "cookies", got: ${logoutRes.headers['clear-site-data']}`);
            assert.strictEqual(logoutRes.headers['clear-site-data'], '"cache", "storage"',
                `Expected Clear-Site-Data to be '"cache", "storage"', got ${logoutRes.headers['clear-site-data']}`);
            const setCookies = logoutRes.headers['set-cookie'] || [];
            assert.ok(setCookies.some(c => c.startsWith('authentik_jwt=')), 'Must clear authentik_jwt cookie');
            assert.ok(setCookies.some(c => c.startsWith('authentik_session=')), 'Must clear authentik_session cookie');
            assert.ok(setCookies.some(c => c.startsWith('x_service_token=')), 'Must clear x_service_token cookie');
            assert.ok(setCookies.some(c => c.startsWith('authentik_proxy_session=')), 'Must dynamically clear authentik_proxy_session cookie');
            assert.ok(!setCookies.some(c => c.startsWith('paperclip_session=')), 'Must NOT clear paperclip_session cookie');
            assert.ok(!setCookies.some(c => c.startsWith('CF_Authorization=')), 'Must NOT clear CF_Authorization cookie');
            assert.ok(!setCookies.some(c => c.startsWith('other_user_cookie=')), 'Must NOT clear other_user_cookie');
            console.log('✓ PASS: /logout redirects to Authentik stock-trader invalidation flow, omits "cookies" from Clear-Site-Data, and preserves Paperclip/CF cookies');

            // Test 2f-BVA: Boundary Value Analysis for /logout cookie parsing & preservation
            const bvaEmptyCookieRes = await makeRequest(testPort2, {}, '/logout');
            assert.strictEqual(bvaEmptyCookieRes.statusCode, 302);
            assert.strictEqual(bvaEmptyCookieRes.headers.location, expectedLogoutRedirect);
            assert.strictEqual(bvaEmptyCookieRes.headers['clear-site-data'], '"cache", "storage"');
            const bvaCookies = bvaEmptyCookieRes.headers['set-cookie'] || [];
            assert.ok(bvaCookies.some(c => c.startsWith('authentik_jwt=')), 'Must still clear authentik_jwt');
            assert.ok(bvaCookies.some(c => c.startsWith('authentik_session=')), 'Must still clear authentik_session');
            assert.ok(bvaCookies.some(c => c.startsWith('x_service_token=')), 'Must still clear x_service_token');
            console.log('✓ PASS: BVA - /logout handles request with no cookie header safely and preserves stock-trader invalidation flow');

            // Test 2f-2 (HOM-160): Configured legacy invalidation URL automatically normalizes to stock-trader-invalidation-flow
            const ssoLogoutRes = await makeRequest(testPort, {}, '/logout');
            assert.strictEqual(ssoLogoutRes.statusCode, 302, `Expected 302 for /logout, got ${ssoLogoutRes.statusCode}`);
            assert.strictEqual(ssoLogoutRes.headers.location, expectedLogoutRedirect,
                `HOM-160: Configured invalidation URL must automatically normalize to stock-trader-invalidation-flow, got: ${ssoLogoutRes.headers.location}`);
            console.log('✓ PASS: Legacy Authentik invalidation URL normalizes to stock-trader-invalidation-flow');

            // Test 2f-3 (HOM-160): Legacy invalidation URL with external next param is normalized to stock-trader-invalidation-flow
            const testPortLegacy = 3995;
            const legacyLogoutProc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
                env: {
                    ...process.env,
                    PORT: String(testPortLegacy),
                    AUTHENTIK_CLIENT_ID: testClientId,
                    AUTHENTIK_ISSUER_URL: testIssuer,
                    AUTHENTIK_LOGOUT_URL: 'https://auth.julietmike.net/flows/-/default/invalidation/?next=https%3A%2F%2Fstock-trader.beta.julietmike.net%2F',
                    AUTHENTIK_TEST_PUBLIC_KEY: publicKey
                }
            });
            await new Promise(r => setTimeout(r, 1000));
            try {
                const legacyLogoutRes = await makeRequest(testPortLegacy, {}, '/logout');
                assert.strictEqual(legacyLogoutRes.statusCode, 302);
                assert.strictEqual(legacyLogoutRes.headers.location, expectedLogoutRedirect,
                    `HOM-160: Configured invalidation URL with legacy external next param must normalize to stock-trader-invalidation-flow, got: ${legacyLogoutRes.headers.location}`);
                console.log('✓ PASS: Legacy default invalidation URL is normalized to stock-trader-invalidation-flow');
            } finally {
                legacyLogoutProc.kill();
            }

            // Test 2f-4 (HOM-160): Default AUTHENTIK_LOGOUT_URL when unset defaults to stock-trader-invalidation-flow
            const testPortDefault = 3994;
            const defaultLogoutEnv = { ...process.env };
            delete defaultLogoutEnv.AUTHENTIK_LOGOUT_URL;
            const defaultLogoutProc = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
                env: {
                    ...defaultLogoutEnv,
                    PORT: String(testPortDefault),
                    AUTHENTIK_CLIENT_ID: testClientId,
                    AUTHENTIK_ISSUER_URL: testIssuer,
                    AUTHENTIK_TEST_PUBLIC_KEY: publicKey
                }
            });
            await new Promise(r => setTimeout(r, 1000));
            try {
                const defaultLogoutRes = await makeRequest(testPortDefault, {}, '/logout');
                assert.strictEqual(defaultLogoutRes.statusCode, 302);
                assert.strictEqual(defaultLogoutRes.headers.location, expectedLogoutRedirect,
                    `HOM-160: Unset AUTHENTIK_LOGOUT_URL must default to stock-trader-invalidation-flow, got: ${defaultLogoutRes.headers.location}`);
                console.log('✓ PASS: Unset AUTHENTIK_LOGOUT_URL defaults to stock-trader-invalidation-flow');
            } finally {
                defaultLogoutProc.kill();
            }

            // Test 2h (SDLC #8 defect regression): 401 on invalid/expired JWT must NOT leak err.message
            const expiredJwt = jwt.sign(
                { email: "trader@home-crew.lan", preferred_username: "trader", sub: "trader-sub-1" },
                privateKey,
                {
                    algorithm: 'RS256',
                    keyid: 'test-kid-authentik',
                    audience: testClientId,
                    issuer: testIssuer,
                    expiresIn: '-10s' // already expired
                }
            );
            const expiredRes = await makeRequest(testPort2, {
                'x-authentik-jwt': expiredJwt
            });
            assert.strictEqual(expiredRes.statusCode, 401, `Expected 401 for expired JWT, got ${expiredRes.statusCode}`);
            const expiredBody = JSON.parse(expiredRes.body);
            assert.strictEqual(expiredBody.error, 'Authentik JWT verification failed', `Expected sanitized error without raw err.message, got: ${expiredBody.error}`);
            assert.ok(!expiredRes.body.includes('jwt expired'), 'Response body must not leak raw jwt expired message');
            console.log('✓ PASS: Expired/invalid JWT returns sanitized 401 without leaking raw error message');

            // Test 2i (SDLC #8 defect regression): CF_Authorization cookie must be strictly rejected
            const cfAuthRes = await makeRequest(testPort2, {
                'Cookie': `CF_Authorization=${testServiceToken}`
            });
            assert.strictEqual(cfAuthRes.statusCode, 401, `Expected 401 when using deprecated CF_Authorization cookie, got ${cfAuthRes.statusCode}`);
            console.log('✓ PASS: Deprecated CF_Authorization cookie rejected fail-closed');

            // Test 2j (SDLC #8 defect regression): GET /api/status endpoint must exist and return 200
            const statusRes = await makeRequest(testPort2, {
                'x-service-token': testServiceToken
            }, '/api/status');
            assert.strictEqual(statusRes.statusCode, 200, `Expected 200 for /api/status, got ${statusRes.statusCode}`);
            const statusBody = JSON.parse(statusRes.body);
            assert.strictEqual(statusBody.service, 'trading-dashboard', 'Expected trading-dashboard service name in status');
            console.log('✓ PASS: /api/status returns 200 with service status payload');

            // Test 2k (Timing-safe service token in cookie): Valid cookie returns 200
            const validCookieSvcRes = await makeRequest(testPort2, {
                'Cookie': `x_service_token=${testServiceToken}`
            });
            assert.strictEqual(validCookieSvcRes.statusCode, 200, `Expected 200 for valid cookie service token, got ${validCookieSvcRes.statusCode}`);
            console.log('✓ PASS: Timing-safe cookie service token (x_service_token) authenticated with 200 OK');

            // Test 2l (Timing-safe service token in cookie): Invalid cookie returns 401
            const invalidCookieSvcRes = await makeRequest(testPort2, {
                'Cookie': `x_service_token=wrong-service-token`
            });
            assert.strictEqual(invalidCookieSvcRes.statusCode, 401, `Expected 401 for invalid cookie service token, got ${invalidCookieSvcRes.statusCode}`);
            console.log('✓ PASS: Invalid cookie service token rejected with 401 Unauthorized');

            // Test 2s (HOM-148 BVA): When server has NO FORWARD_AUTH_SECRET configured, forward auth headers must be rejected fail-closed
            const unconfiguredForwardAuthRes = await makeRequest(testPort2, {
                'x-authentik-username': 'jefri',
                'x-forward-auth-secret': 'any-secret'
            });
            assert.strictEqual(unconfiguredForwardAuthRes.statusCode, 401, `Expected 401 when FORWARD_AUTH_SECRET is unconfigured on server, got ${unconfiguredForwardAuthRes.statusCode}`);
            console.log('✓ PASS: Forward auth rejected fail-closed with 401 when FORWARD_AUTH_SECRET is not configured');

            // Test 2t (HOM-164): Verify Seksyen 3.5.B Blueprint UI Elements in GET /
            const uiRes = await makeRequest(testPort, {
                'x-service-token': `Bearer ${testServiceToken}`
            }, '/');
            assert.strictEqual(uiRes.statusCode, 200);
            assert.ok(uiRes.body.includes('Sign-Out Sesi OpenD'), 'Dashboard UI must include Sign-Out Sesi OpenD button');
            assert.ok(uiRes.body.includes('accSelect'), 'Dashboard UI must include acc_id dropdown');
            assert.ok(uiRes.body.includes('handleSwitchAccount'), 'Dashboard UI must include handleSwitchAccount script');
            assert.ok(uiRes.body.includes('handleOpenDSignOut'), 'Dashboard UI must include handleOpenDSignOut script');
            assert.ok(uiRes.body.includes('loginAccInput'), 'Dashboard UI must include login account input');
            console.log('✓ PASS: Dashboard renders Seksyen 3.5.B Blueprint UI (Sign-Out OpenD button, acc_id dropdown, and login account switch)');

            // Test 2u (HOM-164): Verify BVA validation on OpenD management endpoints
            const switchAccEmptyRes = await makeRequest(testPort, {
                'x-service-token': `Bearer ${testServiceToken}`,
                'content-type': 'application/json'
            }, '/api/opend/switch-account', 'POST', JSON.stringify({ account_id: '   ' }));
            assert.strictEqual(switchAccEmptyRes.statusCode, 400, 'Empty account_id must return 400 Bad Request');
            console.log('✓ PASS: POST /api/opend/switch-account validates empty account_id with 400');

            const switchLoginEmptyRes = await makeRequest(testPort, {
                'x-service-token': `Bearer ${testServiceToken}`,
                'content-type': 'application/json'
            }, '/api/opend/switch-login', 'POST', JSON.stringify({ login_account: '' }));
            assert.strictEqual(switchLoginEmptyRes.statusCode, 400, 'Empty login_account must return 400 Bad Request');
            console.log('✓ PASS: POST /api/opend/switch-login validates empty login_account with 400');

            // Unauthenticated checks for OpenD management routes
            const unauthSignOut = await makeRequest(testPort, {}, '/api/opend/sign-out', 'POST');
            assert.strictEqual(unauthSignOut.statusCode, 401, 'Unauthenticated /api/opend/sign-out must return 401');
            console.log('✓ PASS: Unauthenticated /api/opend/sign-out rejected with 401');

            const unauthAccounts = await makeRequest(testPort, {}, '/api/opend/accounts', 'GET');
            assert.strictEqual(unauthAccounts.statusCode, 401, 'Unauthenticated /api/opend/accounts must return 401');
            console.log('✓ PASS: Unauthenticated /api/opend/accounts rejected with 401');

            const unauthSwitchAcc = await makeRequest(testPort, {
                'content-type': 'application/json'
            }, '/api/opend/switch-account', 'POST', JSON.stringify({ account_id: '1002' }));
            assert.strictEqual(unauthSwitchAcc.statusCode, 401, 'Unauthenticated /api/opend/switch-account must return 401');
            console.log('✓ PASS: Unauthenticated /api/opend/switch-account rejected with 401');

            const unauthSwitchLogin = await makeRequest(testPort, {
                'content-type': 'application/json'
            }, '/api/opend/switch-login', 'POST', JSON.stringify({ login_account: '99999' }));
            assert.strictEqual(unauthSwitchLogin.statusCode, 401, 'Unauthenticated /api/opend/switch-login must return 401');
            console.log('✓ PASS: Unauthenticated /api/opend/switch-login rejected with 401');

        } finally {
            serverProc2.kill();
        }

        // Test 2g: In NODE_ENV === 'production', AUTHENTIK_TEST_PUBLIC_KEY must be ignored
        const testPort3 = 3996;
        const serverProc3 = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
            env: {
                ...process.env,
                NODE_ENV: 'production',
                PORT: String(testPort3),
                AUTHENTIK_CLIENT_ID: testClientId,
                AUTHENTIK_ISSUER_URL: testIssuer,
                AUTHENTIK_JWKS_URL: 'https://invalid-jwks-endpoint.local/jwks/',
                AUTHENTIK_TEST_PUBLIC_KEY: publicKey,
                BRIDGE_SERVICE_TOKEN: testServiceToken
            }
        });
        await new Promise(r => setTimeout(r, 1000));

        try {
            const validJwt = jwt.sign(
                { email: "trader@home-crew.lan", sub: "trader-sub-1" },
                privateKey,
                {
                    algorithm: 'RS256',
                    keyid: 'test-kid-authentik',
                    audience: testClientId,
                    issuer: testIssuer,
                    expiresIn: '1h'
                }
            );
            const prodRes = await makeRequest(testPort3, {
                'x-authentik-jwt': validJwt
            });
            assert.strictEqual(prodRes.statusCode, 401, `Expected 401 in production when JWKS endpoint is unreachable even if AUTHENTIK_TEST_PUBLIC_KEY is provided`);
            console.log('✓ PASS: In production NODE_ENV, AUTHENTIK_TEST_PUBLIC_KEY is ignored (401 rejected)');
        } finally {
            serverProc3.kill();
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
