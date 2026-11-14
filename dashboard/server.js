const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHARED_DATA_DIR = process.env.SHARED_DATA_DIR || '/app/shared_data';
const AUTHENTIK_CLIENT_ID = (process.env.AUTHENTIK_CLIENT_ID || '').trim();
const AUTHENTIK_ISSUER_URL = (process.env.AUTHENTIK_ISSUER_URL || 'https://auth.julietmike.net/application/o/stock-trader/').trim();
const AUTHENTIK_JWKS_URL = (process.env.AUTHENTIK_JWKS_URL || 'https://auth.julietmike.net/application/o/stock-trader/jwks/').trim();
const AUTHENTIK_LOGIN_URL = (process.env.AUTHENTIK_LOGIN_URL || 'https://auth.julietmike.net/flows/-/default/authentication/').trim();

// Authentik SSO logout endpoint: defaults to Authentik dedicated stock-trader invalidation flow (HOM-156, HOM-158, HOM-159, HOM-160).
// In Authentik, using the dedicated stock-trader-invalidation-flow ensures that after session invalidation,
// the user is directed back to the stock-trader application flow instead of being dumped at Authentik's /if/user/ portal.
const DEFAULT_AUTHENTIK_LOGOUT_URL = 'https://auth.julietmike.net/if/flow/stock-trader-invalidation-flow/';

let rawLogoutUrl = (process.env.AUTHENTIK_LOGOUT_URL || DEFAULT_AUTHENTIK_LOGOUT_URL).trim();
// If configured with legacy default invalidation flow, normalize to stock-trader-invalidation-flow
if (rawLogoutUrl.includes('/flows/-/default/invalidation') || rawLogoutUrl.includes('/if/flow/default-invalidation-flow')) {
    rawLogoutUrl = DEFAULT_AUTHENTIK_LOGOUT_URL;
}
const AUTHENTIK_LOGOUT_URL = rawLogoutUrl;
const FORWARD_AUTH_SECRET = (process.env.FORWARD_AUTH_SECRET || '').trim();
const BRIDGE_SERVICE_TOKEN = (process.env.BRIDGE_SERVICE_TOKEN || '').trim();
const BRIDGE_URL = (process.env.BRIDGE_URL || 'http://mcp-bridge:8000').trim();

// Fail-fast startup validation: AUTHENTIK_CLIENT_ID is mandatory
if (!AUTHENTIK_CLIENT_ID) {
    console.error('[Dashboard Error] FATAL: Missing AUTHENTIK_CLIENT_ID environment variable. Authentik Client ID must be configured.');
    process.exit(1);
}

// In-memory cache for Authentik JWKS
let jwksKeyCache = {};
let jwksLastFetched = 0;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getSigningKey(kid) {
    // Strictly restrict test public key bypass to NODE_ENV === 'test'
    if (process.env.NODE_ENV === 'test' && process.env.AUTHENTIK_TEST_PUBLIC_KEY) {
        return process.env.AUTHENTIK_TEST_PUBLIC_KEY;
    }

    if (jwksKeyCache[kid] && (Date.now() - jwksLastFetched < JWKS_CACHE_TTL_MS)) {
        return jwksKeyCache[kid];
    }

    try {
        const response = await axios.get(AUTHENTIK_JWKS_URL, { timeout: 4000 });
        if (response.data && Array.isArray(response.data.keys)) {
            const newCache = {};
            for (const jwk of response.data.keys) {
                if (jwk.kid && jwk.kty === 'RSA') {
                    try {
                        const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
                        newCache[jwk.kid] = publicKey.export({ format: 'pem', type: 'spki' });
                    } catch (jwkErr) {
                        console.warn('[Dashboard] Could not parse JWK for kid:', jwk.kid, jwkErr.message);
                    }
                }
            }
            jwksKeyCache = newCache;
            jwksLastFetched = Date.now();
        }
    } catch (fetchErr) {
        console.error('[Dashboard] Error fetching Authentik JWKS:', fetchErr.message);
    }

    return jwksKeyCache[kid] || null;
}

/**
 * Robust HTML escaping for XSS prevention.
 */
function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Origin Authentication Middleware: Authentik JWT Assertion & Service Token
async function authenticateDashboard(req, res, next) {
    // 1. Check internal service token using timing-safe comparison (Header or Cookie)
    let serviceToken = req.headers['x-service-token'];
    if (!serviceToken && req.headers.cookie) {
        const match = req.headers.cookie.match(/(?:^|;\s*)(?:authentik_service_token|x_service_token)=([^;]+)/);
        if (match) {
            serviceToken = decodeURIComponent(match[1]);
        }
    }
    if (serviceToken && BRIDGE_SERVICE_TOKEN) {
        const token = serviceToken.replace(/^Bearer\s+/i, '').trim();
        const a = Buffer.from(token, 'utf8');
        const b = Buffer.from(BRIDGE_SERVICE_TOKEN, 'utf8');
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            req.authUser = 'internal-service';
            return next();
        }
        return res.status(401).json({ error: 'Invalid service token' });
    }

    // 2. Check Authentik Forward Auth Headers (injected by NPM / Authentik Outpost)
    const forwardAuthUsername = (req.headers['x-authentik-username'] || '').trim();
    const forwardAuthEmail = (req.headers['x-authentik-email'] || '').trim();
    const forwardAuthName = (req.headers['x-authentik-name'] || '').trim();
    if (forwardAuthUsername || forwardAuthEmail || forwardAuthName) {
        // Anti-spoofing verification: Forward Auth headers MUST be accompanied by a valid shared secret
        const providedSecret = (req.headers['x-forward-auth-secret'] || '').trim();
        if (FORWARD_AUTH_SECRET && providedSecret) {
            const a = Buffer.from(providedSecret, 'utf8');
            const b = Buffer.from(FORWARD_AUTH_SECRET, 'utf8');
            if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
                req.authUser = forwardAuthUsername || forwardAuthEmail || forwardAuthName;
                return next();
            }
        }
        return res.status(401).json({
            error: 'Unauthorized: Invalid or missing Forward Auth shared secret header'
        });
    }

    // 3. Check Authentik JWT Assertion (Header X-authentik-jwt, Authorization Bearer, or Cookie)
    let authJwt = req.headers['x-authentik-jwt'];
    if (!authJwt && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        authJwt = req.headers.authorization.slice(7).trim();
    }
    if (!authJwt && req.headers.cookie) {
        const match = req.headers.cookie.match(/(?:^|;\s*)(?:authentik_jwt|authentik_session|x_authentik_jwt)=([^;]+)/);
        if (match) {
            authJwt = match[1];
        }
    }

    if (authJwt) {
        try {
            const completeDecoded = jwt.decode(authJwt, { complete: true });
            if (!completeDecoded || !completeDecoded.header) {
                return res.status(401).json({ error: 'Malformed Authentik assertion token' });
            }

            const { alg, kid } = completeDecoded.header;
            if (alg !== 'RS256' || !kid) {
                return res.status(401).json({
                    error: 'Invalid token header: Only RS256 signed Authentik assertions with valid kid are accepted.'
                });
            }

            const publicKeyPem = await getSigningKey(kid);
            if (!publicKeyPem) {
                return res.status(401).json({
                    error: `Signing key (kid: ${kid}) could not be resolved from Authentik JWKS.`
                });
            }

            const verifiedPayload = jwt.verify(authJwt, publicKeyPem, {
                algorithms: ['RS256'],
                audience: AUTHENTIK_CLIENT_ID,
                issuer: AUTHENTIK_ISSUER_URL
            });

            req.authUser = verifiedPayload.email || verifiedPayload.preferred_username || verifiedPayload.sub || 'Authentik User';
            return next();
        } catch (err) {
            console.warn('[Dashboard] Authentik JWT verification failed:', err.message);
            return res.status(401).json({
                error: 'Authentik JWT verification failed'
            });
        }
    }

    // 3. If request is from a browser wanting HTML, render an interactive Access Login / Token form
    const acceptsHtml = req.accepts && req.accepts('html');
    if (acceptsHtml && req.method === 'GET' && req.path === '/') {
        return res.status(401).send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Required | STOCK-TRADER</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 440px; width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        h2 { margin-top: 0; color: #38bdf8; font-size: 22px; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
        .input-group { margin: 20px 0; }
        label { display: block; font-size: 13px; margin-bottom: 6px; color: #cbd5e1; }
        input[type="text"], input[type="password"] { width: 100%; box-sizing: border-box; padding: 10px 12px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: #fff; font-size: 14px; }
        button, a.btn-login { display: block; text-align: center; box-sizing: border-box; text-decoration: none; width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 15px; margin-bottom: 12px; }
        button:hover, a.btn-login:hover { background: #0369a1; }
        .note { margin-top: 16px; font-size: 12px; color: #64748b; border-top: 1px solid #334155; padding-top: 12px; }
    </style>
</head>
<body>
    <div class="card">
        <h2>STOCK-TRADER Access</h2>
        <p>This operations dashboard is protected by <strong>Authentik SSO (auth.julietmike.net)</strong>. Please log in or enter your <strong>Service Token</strong>.</p>
        <a href="${escapeHtml(AUTHENTIK_LOGIN_URL)}" class="btn-login" target="_blank" rel="noopener noreferrer">Log Masuk Authentik SSO</a>
        <form onsubmit="handleToken(event)">
            <div class="input-group">
                <label for="token">Internal Service Token / JWT:</label>
                <input type="password" id="token" placeholder="Masukkan token pengesahan..." required />
            </div>
            <button type="submit">Log Masuk dengan Token</button>
        </form>
        <div class="note">
            SSO Endpoint: ${escapeHtml(AUTHENTIK_LOGIN_URL)}
        </div>
    </div>
    <script>
        function handleToken(e) {
            e.preventDefault();
            const val = document.getElementById('token').value.trim();
            if (!val) return;
            if (val.includes('.')) {
                document.cookie = "authentik_jwt=" + encodeURIComponent(val) + "; path=/; max-age=86400; SameSite=Lax";
            } else {
                document.cookie = "x_service_token=" + encodeURIComponent(val) + "; path=/; max-age=86400; SameSite=Lax";
            }
            window.location.reload();
        }
    </script>
</body>
</html>`);
    }

    // Strict fail-closed for API/direct requests:
    return res.status(401).json({
        error: 'Authentication required. Authentik JWT assertion or X-Service-Token header missing or invalid.'
    });
}

// One-Click Logout route: Clears application & outpost session cookies and redirects to single-app logout endpoint
app.get('/logout', (req, res) => {
    // 1. Explicitly clear known stock-trader session and auth cookies
    const knownCookies = [
        'authentik_jwt',
        'authentik_session',
        'x_service_token'
    ];
    for (const cookieName of knownCookies) {
        res.clearCookie(cookieName, { path: '/' });
    }

    // 2. Dynamically clear incoming outpost cookies (strictly matching authentik_proxy_*)
    // Do not clear parent domain or other application cookies (e.g. Paperclip session cookies or CF_Authorization)
    const rawCookieHeader = req.headers.cookie;
    if (rawCookieHeader) {
        const parts = rawCookieHeader.split(';');
        for (const part of parts) {
            const trimmed = part.trim();
            const eqIdx = trimmed.indexOf('=');
            const name = (eqIdx === -1 ? trimmed : trimmed.substring(0, eqIdx)).trim();
            if (name && name.startsWith('authentik_proxy_')) {
                res.clearCookie(name, { path: '/' });
            }
        }
    }

    // 3. Purge site data for stock-trader domain without clearing registrable domain cookies
    // Note (HOM-154): "cookies" directive must NOT be included as it purges all cookies for .julietmike.net
    res.setHeader('Clear-Site-Data', '"cache", "storage"');

    // 4. Redirect to Authentik SSO invalidation URL (HOM-156)
    res.redirect(302, AUTHENTIK_LOGOUT_URL);
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'trading-dashboard',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/api/status', authenticateDashboard, async (req, res) => {
    let bridgeStatus = null;
    if (BRIDGE_SERVICE_TOKEN) {
        try {
            const bridgeRes = await axios.get(`${BRIDGE_URL}/status`, {
                headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
                timeout: 5000
            });
            bridgeStatus = bridgeRes.data;
        } catch (err) {
            bridgeStatus = { error: err.message, status: 'unavailable' };
        }
    }
    res.json({
        status: 'healthy',
        service: 'trading-dashboard',
        user: req.authUser,
        bridge: bridgeStatus,
        timestamp: new Date().toISOString()
    });
});

app.post('/api/telnet/otp', authenticateDashboard, async (req, res) => {
    const { otp_code } = req.body || {};
    if (!otp_code || typeof otp_code !== 'string') {
        return res.status(400).json({ error: 'Kod OTP diperlukan' });
    }
    if (!BRIDGE_SERVICE_TOKEN) {
        return res.status(503).json({ error: 'Bridge service token tidak dikonfigurasi' });
    }
    try {
        const bridgeRes = await axios.post(`${BRIDGE_URL}/api/v1/telnet/otp`, {
            otp_code: otp_code.trim()
        }, {
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 5000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        const msg = (err.response && err.response.data && (err.response.data.detail || err.response.data.error)) || err.message;
        return res.status(err.response ? err.response.status : 502).json({ error: msg });
    }
});

// Seksyen 3.5.B Blueprint: OpenD Session Sign-Out, Dynamic Account Switch, and Login Switch
app.post('/api/opend/sign-out', authenticateDashboard, async (req, res) => {
    if (!BRIDGE_SERVICE_TOKEN) {
        return res.status(503).json({ error: 'Bridge service token tidak dikonfigurasi' });
    }
    try {
        const bridgeRes = await axios.post(`${BRIDGE_URL}/api/v1/telnet/sign-out`, {}, {
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 10000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        const msg = (err.response && err.response.data && (err.response.data.detail || err.response.data.error)) || err.message;
        return res.status(err.response ? err.response.status : 502).json({ error: msg });
    }
});

app.get('/api/opend/accounts', authenticateDashboard, async (req, res) => {
    if (!BRIDGE_SERVICE_TOKEN) {
        return res.status(503).json({ error: 'Bridge service token tidak dikonfigurasi' });
    }
    try {
        const bridgeRes = await axios.get(`${BRIDGE_URL}/api/v1/trade/accounts`, {
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 5000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        const msg = (err.response && err.response.data && (err.response.data.detail || err.response.data.error)) || err.message;
        return res.status(err.response ? err.response.status : 502).json({ error: msg });
    }
});

app.post('/api/opend/switch-account', authenticateDashboard, async (req, res) => {
    const { account_id } = req.body || {};
    if (!account_id || typeof account_id !== 'string' || !account_id.trim()) {
        return res.status(400).json({ error: 'Account ID diperlukan' });
    }
    if (!BRIDGE_SERVICE_TOKEN) {
        return res.status(503).json({ error: 'Bridge service token tidak dikonfigurasi' });
    }
    try {
        const bridgeRes = await axios.post(`${BRIDGE_URL}/api/v1/trade/switch-account`, {
            account_id: account_id.trim()
        }, {
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 5000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        const msg = (err.response && err.response.data && (err.response.data.detail || err.response.data.error)) || err.message;
        return res.status(err.response ? err.response.status : 502).json({ error: msg });
    }
});

app.post('/api/opend/sign-in', authenticateDashboard, async (req, res) => {
    const { login_account, password } = req.body || {};
    if (!login_account || typeof login_account !== 'string' || !login_account.trim()) {
        return res.status(400).json({ error: 'Login account ID diperlukan' });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
        return res.status(400).json({ error: 'Kata laluan diperlukan untuk log masuk' });
    }

    if (!BRIDGE_SERVICE_TOKEN) {
        return res.status(503).json({ error: 'Bridge service token tidak dikonfigurasi' });
    }

    try {
        const bridgeRes = await axios.post(`${BRIDGE_URL}/api/v1/telnet/sign-in`, {
            login_account: login_account.trim(),
            password: password.trim()
        }, {
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 25000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        const msg = (err.response && err.response.data && (err.response.data.detail || err.response.data.error)) || err.message;
        return res.status(err.response ? err.response.status : 502).json({ error: msg });
    }
});

app.post('/api/opend/switch-login', authenticateDashboard, async (req, res) => {
    const { login_account, password } = req.body || {};
    if (!login_account || typeof login_account !== 'string' || !login_account.trim()) {
        return res.status(400).json({ error: 'Login account ID diperlukan' });
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
        return res.status(400).json({ error: 'Kata laluan diperlukan untuk tukar akaun' });
    }
    if (!BRIDGE_SERVICE_TOKEN) {
        return res.status(503).json({ error: 'Bridge service token tidak dikonfigurasi' });
    }
    try {
        const bridgeRes = await axios.post(`${BRIDGE_URL}/api/v1/telnet/switch-login`, {
            login_account: login_account.trim(),
            password: password.trim()
        }, {
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 25000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        const msg = (err.response && err.response.data && (err.response.data.detail || err.response.data.error)) || err.message;
        return res.status(err.response ? err.response.status : 502).json({ error: msg });
    }
});

app.get('/api/data', authenticateDashboard, (req, res) => {
    const watchlistFile = path.join(SHARED_DATA_DIR, 'watchlist.json');
    const sentinelFile = path.join(SHARED_DATA_DIR, 'sentinel_status.json');

    let watchlist = null;
    let sentinel = null;

    if (fs.existsSync(watchlistFile)) {
        try {
            watchlist = JSON.parse(fs.readFileSync(watchlistFile, 'utf8'));
        } catch (e) {}
    }

    if (fs.existsSync(sentinelFile)) {
        try {
            sentinel = JSON.parse(fs.readFileSync(sentinelFile, 'utf8'));
        } catch (e) {}
    }

    res.json({
        user: req.authUser,
        watchlist,
        sentinel,
        timestamp: new Date().toISOString()
    });
});

app.get('/', authenticateDashboard, async (req, res) => {
    const watchlistFile = path.join(SHARED_DATA_DIR, 'watchlist.json');
    const sentinelFile = path.join(SHARED_DATA_DIR, 'sentinel_status.json');

    let watchlistData = { watchlist: [], quota_status: { kline_30d_used: 0, kline_30d_remaining: 100 } };
    let sentinelData = { status: 'OFFLINE', managed_positions: 0 };

    if (fs.existsSync(watchlistFile)) {
        try { watchlistData = JSON.parse(fs.readFileSync(watchlistFile, 'utf8')); } catch (e) {}
    }
    if (fs.existsSync(sentinelFile)) {
        try { sentinelData = JSON.parse(fs.readFileSync(sentinelFile, 'utf8')); } catch (e) {}
    }

    // Query live OpenD connection and account metrics from Bridge
    // Fail-closed defaults: UNKNOWN/N/A and Sentinel OFFLINE
    let opendStatus = 'UNKNOWN';
    let opendEnv = 'N/A';
    let accountId = 'N/A';
    let cashBalance = null;
    let totalEquity = null;

    let availableAccounts = [];
    let opendErrorMessage = null;
    if (BRIDGE_SERVICE_TOKEN) {
        try {
            const bridgeRes = await axios.get(`${BRIDGE_URL}/status`, {
                headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
                timeout: 5000
            });
            if (bridgeRes.data) {
                if (bridgeRes.data.opend_status) opendStatus = bridgeRes.data.opend_status;
                if (bridgeRes.data.environment) opendEnv = bridgeRes.data.environment;
                if (bridgeRes.data.account_id) accountId = bridgeRes.data.account_id;
                if (bridgeRes.data.cash_balance != null) cashBalance = Number(bridgeRes.data.cash_balance);
                if (bridgeRes.data.total_equity != null) totalEquity = Number(bridgeRes.data.total_equity);
                if (bridgeRes.data.sentinel && bridgeRes.data.sentinel.status) {
                    sentinelData.status = bridgeRes.data.sentinel.status;
                }
                if (bridgeRes.data.account_info) {
                    if (Array.isArray(bridgeRes.data.account_info.available_accounts)) {
                        availableAccounts = bridgeRes.data.account_info.available_accounts;
                    }
                    if (bridgeRes.data.account_info.error_message) {
                        opendErrorMessage = bridgeRes.data.account_info.error_message;
                    }
                }
            }
        } catch (err) {
            console.warn('[Dashboard] Could not query Bridge status for dashboard render (marking UNREACHABLE):', err.message);
            opendStatus = 'UNREACHABLE';
        }
    } else {
        opendStatus = 'UNKNOWN';
    }

    const safeUser = escapeHtml(req.authUser);
    const safeOpendStatus = escapeHtml(opendStatus);
    const safeOpendEnv = escapeHtml(opendEnv);
    const safeAccountId = escapeHtml(accountId);
    const safeCash = cashBalance != null ? '$' + cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    const safeEquity = totalEquity != null ? '$' + totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    const sentinelStatus = escapeHtml(sentinelData.status || 'OFFLINE');
    const managedPositions = Number(sentinelData.managed_positions || 0);
    const klineUsed = Number(watchlistData.quota_status ? watchlistData.quota_status.kline_30d_used : 0);
    const klineRemaining = Number(watchlistData.quota_status ? watchlistData.quota_status.kline_30d_remaining : 100);

    // Color definitions
    let opendColor = '#f87171';
    if (safeOpendStatus === 'CONNECTED') {
        opendColor = 'var(--success)';
    } else if (safeOpendStatus === 'UNREACHABLE' || safeOpendStatus === 'CONNECT_ERROR') {
        opendColor = 'var(--danger)';
    } else if (safeOpendStatus === 'WAIT_OTP') {
        opendColor = '#fbbf24';
    } else if (safeOpendStatus === 'WAIT_LOGIN') {
        opendColor = '#f59e0b';
    } else if (safeOpendStatus === 'IDLE' || safeOpendStatus === 'SIGNED_OUT') {
        opendColor = '#94a3b8';
    }

    let sentinelColor = '#94a3b8';
    if (sentinelStatus === 'ACTIVE') {
        sentinelColor = 'var(--success)';
    } else if (sentinelStatus === 'CIRCUIT_BREAKER_TRIGGERED' || sentinelStatus === 'EMERGENCY_STOP') {
        sentinelColor = 'var(--danger)';
    }

    const isOpendUnavailable = (watchlistData.source === 'OPEND_UNAVAILABLE') || (safeOpendStatus !== 'CONNECTED');
    const warningMessage = watchlistData.warning || (
        safeOpendStatus === 'CONNECT_ERROR' ? `Ralat sambungan OpenD API: ${escapeHtml(opendErrorMessage || 'Gagal memulakan sesi dagangan rentas rangkaian.')}` :
        safeOpendStatus === 'WAIT_OTP' ? 'OpenD daemon memerlukan kod pengesahan 2FA (OTP SMS/Emel). Sila masukkan kod OTP 4-8 digit pada kotak OTP di bawah untuk melengkapkan sambungan.' :
        safeOpendStatus === 'WAIT_LOGIN' ? 'OpenD daemon sedang menunggu log masuk broker yang sah daripada pemohon. Sila lengkapkan Account ID dan kata laluan di bawah.' :
        safeOpendStatus === 'IDLE' || safeOpendStatus === 'SIGNED_OUT' ? 'Sesi OpenD telah di-sign-out (mod idle). Masukkan Account ID dan kata laluan untuk memulakan sesi baharu.' :
        safeOpendStatus === 'UNREACHABLE' ? 'Sambungan ke MCP Bridge gagal (UNREACHABLE). Semak kontena Bridge.' :
        safeOpendStatus === 'DISCONNECTED' ? 'OpenD daemon tidak bersambung (DISCONNECTED).' : null
    );

    const rows = (watchlistData.watchlist || []).map(stock => {
        const symbol = escapeHtml(stock.symbol || 'N/A');
        const name = escapeHtml(stock.name || '');
        const price = Number(stock.price || 0).toFixed(2);
        const changePct = Number(stock.change_pct || 0);
        const adv20Millions = (Number(stock.adv_20 || 0) / 1e6).toFixed(1);
        const rsSpy = Number(stock.rs_spy || 0).toFixed(2);
        const rvol15m = Number(stock.rvol_15m || 0).toFixed(2);
        const status = escapeHtml(stock.status || 'READY');

        return `
        <tr>
            <td style="font-weight: bold; color: #38bdf8;">${symbol}</td>
            <td>${name}</td>
            <td>$${price}</td>
            <td style="color: ${changePct >= 0 ? '#4ade80' : '#f87171'}">${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%</td>
            <td>${adv20Millions}M</td>
            <td style="color: #4ade80;">+${rsSpy}%</td>
            <td>${rvol15m}x</td>
            <td><span class="badge badge-ready">${status}</span></td>
        </tr>`;
    }).join('') || `<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">${isOpendUnavailable ? 'Tiada data kaunter (OpenD belum sah / fail-closed aktif)' : 'No stocks currently in watchlist.'}</td></tr>`;

    const accountOptions = (availableAccounts.length > 0 ? availableAccounts : [
        { account_id: safeAccountId !== 'N/A' ? safeAccountId : '1001', sim_acc_type: 'Paper Trading 1 (US Equities)' },
        { account_id: '1002', sim_acc_type: 'Paper Trading 2 (US Equities)' }
    ]).map(acc => {
        const accId = escapeHtml(acc.account_id);
        const label = `${accId} (${escapeHtml(acc.sim_acc_type || acc.trd_env || 'Paper')})`;
        const isSelected = String(acc.account_id) === String(safeAccountId) ? 'selected' : '';
        return `<option value="${accId}" ${isSelected}>${label}</option>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>STOCK-TRADER Dashboard | Phase 1 L0 Infra</title>
    <style>
        :root {
            --bg-main: #0f172a;
            --bg-card: #1e293b;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent: #38bdf8;
            --success: #4ade80;
            --danger: #ef4444;
            --border: #334155;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-main);
            color: var(--text-main);
            margin: 0;
            padding: 24px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; }
        h1 { margin: 0; font-size: 22px; color: var(--accent); }
        .meta { color: var(--text-muted); font-size: 14px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .card { background-color: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
        .card h3 { margin-top: 0; font-size: 14px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .card .value { font-size: 28px; font-weight: bold; margin: 8px 0; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
        .badge-active { background-color: rgba(74, 222, 128, 0.15); color: var(--success); border: 1px solid var(--success); }
        .badge-ready { background-color: rgba(56, 189, 248, 0.15); color: var(--accent); border: 1px solid var(--accent); }
        .badge-user { background-color: rgba(56, 189, 248, 0.15); color: var(--accent); border: 1px solid var(--accent); }
        .btn-logout {
            background-color: #dc2626;
            color: #ffffff;
            padding: 6px 14px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            transition: background-color 0.15s ease;
        }
        .btn-logout:hover {
            background-color: #b91c1c;
        }
        table { width: 100%; border-collapse: collapse; background-color: var(--bg-card); border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); }
        th { background-color: rgba(0, 0, 0, 0.2); color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
        tr:last-child td { border-bottom: none; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>STOCK-TRADER L0 / L4 Operations</h1>
                <div class="meta">Phase 1 Infrastructure & Hard Rules Monitor | Log Masuk: ${safeUser}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <span class="badge badge-user">Authentik: ${safeUser}</span>
                <span class="badge badge-active">Live Dashboard</span>
                <a href="/logout" class="btn-logout" title="Log Keluar daripada Dashboard & Authentik SSO (Sesi Paperclip kekal aktif)">Log Keluar (Logout)</a>
            </div>
        </header>

        <div class="grid">
            <div class="card">
                <h3>OpenD Gateway</h3>
                <div class="value" style="color: ${opendColor};">${safeOpendStatus}</div>
                <div class="meta">Mode: <strong style="color: var(--accent);">${safeOpendEnv}</strong></div>
            </div>
            <div class="card">
                <h3>Moomoo Account</h3>
                <div class="value" style="color: var(--accent); font-size: 20px; margin: 10px 0;">ID: ${safeAccountId}</div>
                <div class="meta">Cash: <strong>${safeCash}</strong> | Equity: <strong>${safeEquity}</strong></div>
            </div>
            <div class="card">
                <h3>Sentinel L4 Status</h3>
                <div class="value" style="color: ${sentinelColor};">${sentinelStatus}</div>
                <div class="meta">${managedPositions} managed positions</div>
            </div>
            <div class="card">
                <h3>Moomoo API Quota</h3>
                <div class="value" style="color: var(--accent);">${klineUsed} / 100</div>
                <div class="meta">${klineRemaining} symbols remaining in 30d window</div>
            </div>
            <div class="card">
                <h3>Security Enforcer</h3>
                <div class="value" style="color: var(--text-main);">8 Hard Rules</div>
                <div class="meta">Deterministic BVA Checked</div>
            </div>
        </div>

        ${warningMessage ? `
        <div class="card" style="border-left: 4px solid var(--danger); margin-bottom: 24px; background: rgba(239, 68, 68, 0.1);">
            <h3 style="color: #f87171; margin-bottom: 6px;">Amaran Integriti OpenD (Fail-Closed)</h3>
            <div style="color: #fca5a5; font-size: 14px; line-height: 1.5;">${escapeHtml(warningMessage)}</div>
        </div>` : ''}

        <div class="card" style="margin-bottom: 24px; border: 1px solid #0284c7;">
            <h3 style="color: #38bdf8; font-size: 15px; margin-bottom: 12px;">Pengurusan Sesi & Akaun OpenD (Seksyen 3.5.B Blueprint)</h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                <!-- 1. Tukar acc_id dinamik tanpa restart -->
                <div style="background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: 6px; border: 1px solid var(--border);">
                    <h4 style="margin: 0 0 8px 0; font-size: 14px; color: var(--accent);">Tukar Akaun Dagangan (acc_id)</h4>
                    <p style="color: var(--text-muted); font-size: 12px; margin: 0 0 10px 0;">
                        Tukar antara Paper Trading 1 dan 2 terus melalui SDK tanpa me-restart kontena.
                    </p>
                    <div style="display: flex; gap: 8px;">
                        <select id="accSelect" style="flex: 1; padding: 8px 10px; background: #0f172a; border: 1px solid var(--border); border-radius: 6px; color: #fff; font-size: 13px;">
                            ${accountOptions}
                        </select>
                        <button onclick="handleSwitchAccount()" style="padding: 8px 14px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Tukar Akaun</button>
                    </div>
                    <div id="switchAccResult" style="margin-top: 8px; font-size: 12px; min-height: 16px;"></div>
                </div>

                <!-- 2. Sign-Out Sesi OpenD -->
                <div style="background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: 6px; border: 1px solid var(--border);">
                    <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #f87171;">Sign-Out Sesi OpenD (Telnet & Idle Reset)</h4>
                    <p style="color: var(--text-muted); font-size: 12px; margin: 0 0 10px 0;">
                        Menamatkan sesi broker, membersihkan fail token sesi sementara, dan restart OpenD ke mod idle terputus.
                    </p>
                    <button id="btnOpenDSignOut" onclick="handleOpenDSignOut()" style="padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Sign-Out Sesi OpenD</button>
                    <div id="signOutResult" style="margin-top: 8px; font-size: 12px; min-height: 16px;"></div>
                </div>

                <!-- 3. Tukar Akaun Log Masuk / Sign-In Moomoo -->
                <div style="background: rgba(15, 23, 42, 0.6); padding: 16px; border-radius: 6px; border: 1px solid var(--border);">
                    <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #f59e0b;">Log Masuk / Tukar Akaun Moomoo</h4>
                    <p style="color: var(--text-muted); font-size: 12px; margin: 0 0 10px 0;">
                        Konfigurasi Moomoo Account ID dan kata laluan. Hash MD5 dijana di pelayan; kata laluan plaintext tidak disimpan atau di-log.
                    </p>
                    <form onsubmit="handleOpenDSignIn(event)" style="display: flex; flex-direction: column; gap: 8px;">
                        <input type="text" id="loginAccInput" placeholder="Moomoo Login Account ID..." style="padding: 8px 10px; background: #0f172a; border: 1px solid var(--border); border-radius: 6px; color: #fff; font-size: 13px;" required />
                        <input type="password" id="loginPwdInput" placeholder="Kata Laluan Moomoo..." style="padding: 8px 10px; background: #0f172a; border: 1px solid var(--border); border-radius: 6px; color: #fff; font-size: 13px;" required />
                        <button type="submit" id="btnOpenDSignIn" style="padding: 8px 14px; background: #d97706; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Log Masuk OpenD</button>
                    </form>
                    <div id="switchLoginResult" style="margin-top: 8px; font-size: 12px; min-height: 16px;"></div>
                    <div id="signInResult" style="margin-top: 4px; font-size: 12px; min-height: 16px;"></div>
                </div>
            </div>
        </div>

        <div id="otpCard" class="card" style="margin-bottom: 24px; ${safeOpendStatus === 'WAIT_OTP' ? 'border: 2px solid #f59e0b; box-shadow: 0 0 15px rgba(245, 158, 11, 0.3);' : ''}">
            <h3 style="${safeOpendStatus === 'WAIT_OTP' ? 'color: #fbbf24;' : ''}">Moomoo OpenD 2FA OTP Relay (Port 22222)</h3>
            <p style="color: var(--text-muted); font-size: 13px; margin: 6px 0 12px 0;">
                Kredensial broker diurus terus ke OpenD tanpa rekod peribadi. Masukkan kod pengesahan SMS/Emel (4-8 digit) di sini untuk disambung ke OpenD Telnet CLI secara selamat.
            </p>
            <form onsubmit="handleOtpSubmit(event)" style="display: flex; gap: 10px; max-width: 440px;">
                <input type="text" id="otpInput" placeholder="Masukkan 4-8 digit kod OTP..." maxlength="8" style="flex: 1; padding: 8px 12px; background: #0f172a; border: 1px solid var(--border); border-radius: 6px; color: #fff; font-size: 14px;" required />
                <button type="submit" id="btnSubmitOtp" style="padding: 8px 16px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Hantar OTP</button>
            </form>
            <div id="otpResult" style="margin-top: 8px; font-size: 13px; min-height: 18px;"></div>
        </div>

        <h2 style="font-size: 18px; margin-bottom: 12px;">Active Watchlist (Stage 1 & 2 Screens)</h2>
        <table>
            <thead>
                <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Change</th>
                    <th>ADV20</th>
                    <th>RS vs SPY</th>
                    <th>RVOL 15m</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    </div>

    <script>
        async function handleOtpSubmit(e) {
            e.preventDefault();
            const otp = document.getElementById('otpInput').value.trim();
            const resDiv = document.getElementById('otpResult');
            if (!otp) return;
            resDiv.innerText = "Menghantar OTP ke OpenD...";
            resDiv.style.color = "var(--accent)";
            try {
                const resp = await fetch('/api/telnet/otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ otp_code: otp })
                });
                const data = await resp.json();
                if (resp.ok) {
                    resDiv.innerText = "OTP berjaya dihantar ke OpenD: " + (data.message || 'OK');
                    resDiv.style.color = "var(--success)";
                    document.getElementById('otpInput').value = '';
                    setTimeout(() => window.location.reload(), 2000);
                } else {
                    resDiv.innerText = "Gagal: " + (data.error || data.detail || 'Ralat');
                    resDiv.style.color = "var(--danger)";
                }
            } catch (err) {
                resDiv.innerText = "Ralat komunikasi: " + err.message;
                resDiv.style.color = "var(--danger)";
            }
        }

        async function handleSwitchAccount() {
            const accSelect = document.getElementById('accSelect');
            const targetAcc = accSelect ? accSelect.value : '';
            const resDiv = document.getElementById('switchAccResult');
            if (!targetAcc) return;
            resDiv.innerText = "Menukar akaun dagangan via SDK...";
            resDiv.style.color = "var(--accent)";
            try {
                const resp = await fetch('/api/opend/switch-account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_id: targetAcc })
                });
                const data = await resp.json();
                if (resp.ok) {
                    resDiv.innerText = "Akaun berjaya ditukar: " + (data.message || 'OK');
                    resDiv.style.color = "var(--success)";
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    resDiv.innerText = "Gagal: " + (data.error || 'Ralat');
                    resDiv.style.color = "var(--danger)";
                }
            } catch (err) {
                resDiv.innerText = "Ralat komunikasi: " + err.message;
                resDiv.style.color = "var(--danger)";
            }
        }

        async function handleOpenDSignOut() {
            if (!confirm("Adakah anda pasti mahu Sign-Out sesi OpenD? Tindakan ini akan memutuskan sambungan broker, membersihkan fail token sesi, dan me-restart OpenD ke mod idle.")) {
                return;
            }
            const resDiv = document.getElementById('signOutResult');
            resDiv.innerText = "Menjalankan sign-out sesi OpenD & pembersihan token...";
            resDiv.style.color = "var(--accent)";
            try {
                const resp = await fetch('/api/opend/sign-out', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await resp.json();
                if (resp.ok) {
                    resDiv.innerText = "Sesi OpenD berjaya ditamatkan & direstart ke mod idle: " + (data.message || 'OK');
                    resDiv.style.color = "var(--success)";
                    setTimeout(() => window.location.reload(), 2500);
                } else {
                    resDiv.innerText = "Gagal: " + (data.error || 'Ralat');
                    resDiv.style.color = "var(--danger)";
                }
            } catch (err) {
                resDiv.innerText = "Ralat komunikasi: " + err.message;
                resDiv.style.color = "var(--danger)";
            }
        }

        async function handleOpenDSignIn(e) {
            e.preventDefault();
            const loginAcc = document.getElementById('loginAccInput').value.trim();
            const loginPwd = document.getElementById('loginPwdInput') ? document.getElementById('loginPwdInput').value.trim() : '';
            const resDiv = document.getElementById('signInResult') || document.getElementById('switchLoginResult');
            if (!loginAcc || !loginPwd) {
                resDiv.innerText = "Sila lengkapkan Account ID dan kata laluan.";
                resDiv.style.color = "var(--danger)";
                return;
            }
            resDiv.innerText = "Menghubungi OpenD Telnet gateway & memulakan proses log masuk...";
            resDiv.style.color = "var(--accent)";
            try {
                const resp = await fetch('/api/opend/sign-in', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ login_account: loginAcc, password: loginPwd })
                });
                const data = await resp.json();
                if (resp.ok) {
                    if (document.getElementById('loginPwdInput')) document.getElementById('loginPwdInput').value = '';
                    if (data.status === 'WAIT_OTP') {
                        resDiv.innerText = "Kredensial disahkan! Kod SMS/OTP 2FA diperlukan. Sila masukkan kod OTP dalam borang di bawah.";
                        resDiv.style.color = "#f59e0b";
                        const otpCard = document.getElementById('otpCard');
                        if (otpCard) {
                            otpCard.scrollIntoView({ behavior: 'smooth' });
                            const otpInput = document.getElementById('otpInput');
                            if (otpInput) otpInput.focus();
                        }
                    } else if (data.status === 'CONNECTED') {
                        resDiv.innerText = "Log masuk berjaya! Status OpenD kini CONNECTED.";
                        resDiv.style.color = "var(--success)";
                        setTimeout(() => window.location.reload(), 2000);
                    } else {
                        resDiv.innerText = data.message || "Status OpenD dikemas kini: " + (data.status || 'OK');
                        resDiv.style.color = "var(--accent)";
                        setTimeout(() => window.location.reload(), 2500);
                    }
                } else {
                    resDiv.innerText = "Log masuk gagal: " + (data.error || data.detail || 'Kata laluan atau akaun tidak sepadan.');
                    resDiv.style.color = "var(--danger)";
                }
            } catch (err) {
                resDiv.innerText = "Ralat komunikasi: " + err.message;
                resDiv.style.color = "var(--danger)";
            }
        }

        async function handleSwitchLogin(e) {
            return handleOpenDSignIn(e);
        }
    </script>
</body>
</html>`;

    res.send(html);
});

app.listen(port, () => {
    console.log(`[Dashboard] Trading Dashboard running on port ${port}`);
});
