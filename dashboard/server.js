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

// --- Screener Configuration Engine (node:sqlite) ---
const { DatabaseSync } = require('node:sqlite');

const SCREENER_CONFIG_LIMITS = {
    min_price: { min: 1.0, max: 10000.0 },
    min_market_cap: { min: 10000000.0, max: 10000000000000.0 }, // $10M to $10T
    min_volume: { min: 50000.0, max: 1000000000.0 },            // 50k to 1B
    min_rvol: { min: 0.0, max: 50.0 },
    max_rvol: { min: 0.1, max: 100.0 }
};

let screenerDbInstance = null;

function getScreenerDb() {
    if (!screenerDbInstance) {
        if (!fs.existsSync(SHARED_DATA_DIR)) {
            fs.mkdirSync(SHARED_DATA_DIR, { recursive: true });
        }
        const dbPath = path.join(SHARED_DATA_DIR, 'screener_config.sqlite');
        screenerDbInstance = new DatabaseSync(dbPath);
        screenerDbInstance.exec('PRAGMA journal_mode = WAL;');
        screenerDbInstance.exec(`
            CREATE TABLE IF NOT EXISTS screener_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                min_price REAL NOT NULL CHECK (min_price >= 1.0),
                min_market_cap REAL NOT NULL CHECK (min_market_cap >= 10000000.0),
                min_volume REAL NOT NULL CHECK (min_volume >= 50000.0),
                min_rvol REAL NOT NULL CHECK (min_rvol >= 0.0),
                max_rvol REAL NOT NULL CHECK (max_rvol >= min_rvol),
                updated_at TEXT NOT NULL,
                updated_by TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS screener_config_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                user TEXT NOT NULL,
                action TEXT NOT NULL,
                previous_values TEXT,
                new_values TEXT NOT NULL
            );
        `);

        const row = screenerDbInstance.prepare('SELECT * FROM screener_config WHERE id = 1').get();
        if (!row) {
            const initStmt = screenerDbInstance.prepare(`
                INSERT INTO screener_config (id, min_price, min_market_cap, min_volume, min_rvol, max_rvol, updated_at, updated_by)
                VALUES (1, 10.0, 1000000000.0, 1000000.0, 0.50, 20.00, ?, 'system')
            `);
            initStmt.run(new Date().toISOString());
        }
    }
    return screenerDbInstance;
}

app.get('/api/screener/config', authenticateDashboard, (req, res) => {
    try {
        const db = getScreenerDb();
        const row = db.prepare('SELECT min_price, min_market_cap, min_volume, min_rvol, max_rvol, updated_at, updated_by FROM screener_config WHERE id = 1').get();
        if (!row) {
            return res.status(500).json({ error: 'Konfigurasi screener tidak dijumpai dalam SQLite' });
        }
        return res.json({
            config: {
                min_price: Number(row.min_price),
                min_market_cap: Number(row.min_market_cap),
                min_volume: Number(row.min_volume),
                min_rvol: Number(row.min_rvol),
                max_rvol: Number(row.max_rvol)
            },
            limits: SCREENER_CONFIG_LIMITS,
            updated_at: row.updated_at,
            updated_by: row.updated_by
        });
    } catch (err) {
        console.error('[Dashboard] Error fetching screener config:', err);
        return res.status(500).json({ error: 'Gagal membaca konfigurasi screener: ' + err.message });
    }
});

function parseStrictNumericField(val, fieldName) {
    if (typeof val !== 'number' && typeof val !== 'string') {
        return { error: `${fieldName} mestilah nombor atau string berangka yang sah.` };
    }
    if (typeof val === 'string' && val.trim() === '') {
        return { error: `${fieldName} tidak boleh kosong.` };
    }
    const num = Number(val);
    if (!Number.isFinite(num)) {
        return { error: `${fieldName} mestilah nombor yang sah.` };
    }
    return { value: num };
}

app.patch('/api/screener/config', authenticateDashboard, (req, res) => {
    try {
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return res.status(400).json({ error: 'Body mestilah objek JSON yang sah.' });
        }
        const body = req.body;
        const db = getScreenerDb();
        const current = db.prepare('SELECT min_price, min_market_cap, min_volume, min_rvol, max_rvol FROM screener_config WHERE id = 1').get();
        if (!current) {
            return res.status(500).json({ error: 'Konfigurasi screener asal tidak dijumpai' });
        }

        let newMinPrice = current.min_price;
        let newMinMarketCap = current.min_market_cap;
        let newMinVolume = current.min_volume;
        let newMinRvol = current.min_rvol;
        let newMaxRvol = current.max_rvol;

        if (body.min_price !== undefined) {
            const parsed = parseStrictNumericField(body.min_price, 'Harga minimum');
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            const val = parsed.value;
            if (val < SCREENER_CONFIG_LIMITS.min_price.min) {
                return res.status(400).json({ error: 'Harga minimum tidak boleh kurang daripada $1.00 (Had Keselamatan).' });
            }
            if (val > SCREENER_CONFIG_LIMITS.min_price.max) {
                return res.status(400).json({ error: `Harga minimum tidak boleh melebihi $${SCREENER_CONFIG_LIMITS.min_price.max.toLocaleString()}.` });
            }
            newMinPrice = val;
        }

        if (body.min_market_cap !== undefined) {
            const parsed = parseStrictNumericField(body.min_market_cap, 'Permodalan pasaran minimum');
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            const val = parsed.value;
            if (val < SCREENER_CONFIG_LIMITS.min_market_cap.min) {
                return res.status(400).json({ error: `Permodalan pasaran minimum tidak boleh kurang daripada $${SCREENER_CONFIG_LIMITS.min_market_cap.min.toLocaleString()}.` });
            }
            if (val > SCREENER_CONFIG_LIMITS.min_market_cap.max) {
                return res.status(400).json({ error: `Permodalan pasaran minimum tidak boleh melebihi $${SCREENER_CONFIG_LIMITS.min_market_cap.max.toLocaleString()}.` });
            }
            newMinMarketCap = val;
        }

        if (body.min_volume !== undefined) {
            const parsed = parseStrictNumericField(body.min_volume, 'Volum minimum');
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            const val = parsed.value;
            if (val < SCREENER_CONFIG_LIMITS.min_volume.min) {
                return res.status(400).json({ error: `Volum ADV20 minimum tidak boleh kurang daripada ${SCREENER_CONFIG_LIMITS.min_volume.min.toLocaleString()} saham.` });
            }
            if (val > SCREENER_CONFIG_LIMITS.min_volume.max) {
                return res.status(400).json({ error: `Volum ADV20 minimum tidak boleh melebihi ${SCREENER_CONFIG_LIMITS.min_volume.max.toLocaleString()} saham.` });
            }
            newMinVolume = val;
        }

        if (body.min_rvol !== undefined) {
            const parsed = parseStrictNumericField(body.min_rvol, 'RVOL minimum');
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            const val = parsed.value;
            if (val < SCREENER_CONFIG_LIMITS.min_rvol.min || val > SCREENER_CONFIG_LIMITS.min_rvol.max) {
                return res.status(400).json({ error: `RVOL minimum mestilah antara ${SCREENER_CONFIG_LIMITS.min_rvol.min} dan ${SCREENER_CONFIG_LIMITS.min_rvol.max}.` });
            }
            newMinRvol = val;
        }

        if (body.max_rvol !== undefined) {
            const parsed = parseStrictNumericField(body.max_rvol, 'RVOL maksimum');
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            const val = parsed.value;
            if (val < SCREENER_CONFIG_LIMITS.max_rvol.min || val > SCREENER_CONFIG_LIMITS.max_rvol.max) {
                return res.status(400).json({ error: `RVOL maksimum mestilah antara ${SCREENER_CONFIG_LIMITS.max_rvol.min} dan ${SCREENER_CONFIG_LIMITS.max_rvol.max}.` });
            }
            newMaxRvol = val;
        }

        // Cross-field validation: min_rvol <= max_rvol
        if (newMinRvol > newMaxRvol) {
            return res.status(400).json({ error: 'RVOL minimum tidak boleh melebihi RVOL maksimum.' });
        }

        const hasChanges = (
            newMinPrice !== current.min_price ||
            newMinMarketCap !== current.min_market_cap ||
            newMinVolume !== current.min_volume ||
            newMinRvol !== current.min_rvol ||
            newMaxRvol !== current.max_rvol
        );

        if (!hasChanges) {
            return res.json({
                message: 'Tiada perubahan konfigurasi',
                config: {
                    min_price: current.min_price,
                    min_market_cap: current.min_market_cap,
                    min_volume: current.min_volume,
                    min_rvol: current.min_rvol,
                    max_rvol: current.max_rvol
                },
                limits: SCREENER_CONFIG_LIMITS,
                updated_at: current.updated_at,
                updated_by: current.updated_by
            });
        }

        const now = new Date().toISOString();
        const user = String(req.authUser || 'anonymous').replace(/[\r\n]/g, '').slice(0, 100);

        const prevValues = JSON.stringify({
            min_price: current.min_price,
            min_market_cap: current.min_market_cap,
            min_volume: current.min_volume,
            min_rvol: current.min_rvol,
            max_rvol: current.max_rvol
        });

        const newValues = JSON.stringify({
            min_price: newMinPrice,
            min_market_cap: newMinMarketCap,
            min_volume: newMinVolume,
            min_rvol: newMinRvol,
            max_rvol: newMaxRvol
        });

        const updateStmt = db.prepare(`
            UPDATE screener_config
            SET min_price = ?, min_market_cap = ?, min_volume = ?, min_rvol = ?, max_rvol = ?, updated_at = ?, updated_by = ?
            WHERE id = 1
        `);
        updateStmt.run(newMinPrice, newMinMarketCap, newMinVolume, newMinRvol, newMaxRvol, now, user);

        const auditStmt = db.prepare(`
            INSERT INTO screener_config_audit (timestamp, user, action, previous_values, new_values)
            VALUES (?, ?, 'UPDATE_CONFIG', ?, ?)
        `);
        auditStmt.run(now, user, prevValues, newValues);

        return res.json({
            message: 'Konfigurasi screener berjaya dikemas kini',
            config: {
                min_price: newMinPrice,
                min_market_cap: newMinMarketCap,
                min_volume: newMinVolume,
                min_rvol: newMinRvol,
                max_rvol: newMaxRvol
            },
            limits: SCREENER_CONFIG_LIMITS,
            updated_at: now,
            updated_by: user
        });
    } catch (err) {
        console.error('[Dashboard] Error updating screener config:', err);
        return res.status(500).json({ error: 'Gagal mengemas kini konfigurasi screener: ' + err.message });
    }
});

app.get('/api/screener/config/audit', authenticateDashboard, (req, res) => {
    try {
        const db = getScreenerDb();
        const rows = db.prepare('SELECT id, timestamp, user, action, previous_values, new_values FROM screener_config_audit ORDER BY id DESC LIMIT 20').all();
        return res.json({ audit: rows || [] });
    } catch (err) {
        console.error('[Dashboard] Error fetching screener config audit:', err);
        return res.status(500).json({ error: 'Gagal membaca log audit: ' + err.message });
    }
});

// --- K-Line Quota Reader (node:sqlite) & Moomoo Quota Normalizer ---
function getActiveWatchlistSymbols(customWatchlistPath = null) {
    const watchlistFilePath = customWatchlistPath || path.join(SHARED_DATA_DIR, 'watchlist.json');
    const activeWatchlistSymbols = new Set();
    if (fs.existsSync(watchlistFilePath)) {
        try {
            const rawWl = JSON.parse(fs.readFileSync(watchlistFilePath, 'utf8'));
            const wlArr = Array.isArray(rawWl?.watchlist) ? rawWl.watchlist : [];
            for (const item of wlArr) {
                if (item && item.symbol) {
                    activeWatchlistSymbols.add(String(item.symbol).trim().toUpperCase());
                }
            }
        } catch (e) {
            console.warn('[Dashboard] Could not parse watchlist.json for quota status:', e.message);
        }
    }
    return activeWatchlistSymbols;
}

function enrichMoomooDetailList(detailList, activeWatchlistSymbols, referenceTime = new Date()) {
    if (!Array.isArray(detailList)) return [];
    const nowMs = referenceTime.getTime();
    return detailList.map(item => {
        const rawCode = (item && (item.code || item.symbol)) ? String(item.code || item.symbol) : '';
        const cleanSym = rawCode.trim().toUpperCase();
        const symWithoutPrefix = cleanSym.replace(/^[A-Z]+\./, '');
        const inWatchlist = activeWatchlistSymbols.has(cleanSym) ||
                            activeWatchlistSymbols.has(symWithoutPrefix) ||
                            Array.from(activeWatchlistSymbols).some(s => s.endsWith('.' + cleanSym) || cleanSym.endsWith('.' + s));

        let expiresAt = null;
        let daysRemaining = null;
        let isExpired = false;

        const reqTime = item && item.request_time ? String(item.request_time) : null;
        if (reqTime) {
            const reqDate = new Date(reqTime);
            if (!isNaN(reqDate.getTime())) {
                const expDate = new Date(reqDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                expiresAt = expDate.toISOString();
                const diffMs = expDate.getTime() - nowMs;
                daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                isExpired = diffMs <= 0;
            }
        }

        return {
            symbol: cleanSym,
            code: cleanSym,
            name: (item && item.name) ? item.name : 'N/A',
            request_time: reqTime,
            expires_at: expiresAt,
            days_remaining: daysRemaining,
            in_watchlist: inWatchlist,
            status: isExpired ? 'EXPIRED' : 'ACTIVE'
        };
    });
}

function getKlineQuotaData(customDbPath = null, customWatchlistPath = null) {
    const quotaDbPath = customDbPath || path.join(SHARED_DATA_DIR, 'quota_tracker.sqlite');
    const TOTAL_QUOTA = 100;
    const now = new Date();
    const nowMs = now.getTime();
    const activeWatchlistSymbols = getActiveWatchlistSymbols(customWatchlistPath);

    if (!fs.existsSync(quotaDbPath)) {
        return {
            total_quota: TOTAL_QUOTA,
            used_quota: 0,
            remaining_quota: TOTAL_QUOTA,
            percent_used: 0.0,
            status: 'HEALTHY',
            as_of: now.toISOString(),
            symbols: [],
            db_exists: false
        };
    }

    let db;
    try {
        db = new DatabaseSync(quotaDbPath, { readOnly: true });
        const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kline_quota_history'").get();
        if (!tableCheck) {
            db.close();
            return {
                total_quota: TOTAL_QUOTA,
                used_quota: 0,
                remaining_quota: TOTAL_QUOTA,
                percent_used: 0.0,
                status: 'HEALTHY',
                as_of: now.toISOString(),
                symbols: [],
                db_exists: false
            };
        }

        const rows = db.prepare(`
            SELECT symbol, first_requested_at, expires_at, request_count
            FROM kline_quota_history
            ORDER BY expires_at ASC, symbol ASC
        `).all();

        db.close();

        const symbols = (rows || []).map(row => {
            const expDate = new Date(row.expires_at);
            const expMs = expDate.getTime();
            const diffMs = expMs - nowMs;
            const daysRemaining = Number.isFinite(expMs)
                ? Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
                : 0;
            const isExpired = Number.isFinite(expMs) ? (diffMs <= 0) : true;

            const cleanSym = String(row.symbol || '').trim().toUpperCase();
            const symWithoutPrefix = cleanSym.replace(/^[A-Z]+\./, '');
            const inWatchlist = activeWatchlistSymbols.has(cleanSym) ||
                                activeWatchlistSymbols.has(symWithoutPrefix) ||
                                Array.from(activeWatchlistSymbols).some(s => s.endsWith('.' + cleanSym) || cleanSym.endsWith('.' + s));

            return {
                symbol: row.symbol,
                first_requested_at: row.first_requested_at,
                expires_at: row.expires_at,
                request_count: Number(row.request_count) || 1,
                days_remaining: daysRemaining,
                status: isExpired ? 'EXPIRED' : 'ACTIVE',
                in_watchlist: inWatchlist
            };
        });

        const activeSymbols = symbols.filter(s => s.status === 'ACTIVE');
        const usedQuota = activeSymbols.length;
        const remainingQuota = Math.max(0, TOTAL_QUOTA - usedQuota);
        const percentUsed = Number(((usedQuota / TOTAL_QUOTA) * 100).toFixed(1));

        let status = 'HEALTHY';
        if (percentUsed >= 90) {
            status = 'CRITICAL';
        } else if (percentUsed >= 75) {
            status = 'WARNING';
        }

        return {
            total_quota: TOTAL_QUOTA,
            used_quota: usedQuota,
            remaining_quota: remainingQuota,
            percent_used: percentUsed,
            status,
            as_of: now.toISOString(),
            symbols,
            db_exists: true
        };
    } catch (err) {
        if (db) {
            try { db.close(); } catch (e) {}
        }
        console.error('[Dashboard] Error reading kline quota db:', err);
        throw err;
    }
}

let moomooQuotaCache = {
    data: null,
    cachedAt: 0
};

async function getMoomooOpenApiQuota(customBridgeUrl = null) {
    const now = Date.now();
    if (moomooQuotaCache.data && (now - moomooQuotaCache.cachedAt < 30000)) {
        return moomooQuotaCache.data;
    }
    const targetUrl = customBridgeUrl || BRIDGE_URL;
    if (!BRIDGE_SERVICE_TOKEN) {
        return {
            status: 'UNAVAILABLE',
            connected: false,
            used_quota: null,
            remain_quota: null,
            total_quota: null,
            detail_list: [],
            error: 'Bridge service token not configured'
        };
    }
    try {
        const bridgeRes = await axios.get(`${targetUrl}/api/v1/screener/moomoo-quota`, {
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 2500
        });
        const result = bridgeRes.data;
        moomooQuotaCache = {
            data: result,
            cachedAt: now
        };
        return result;
    } catch (err) {
        let errMsg = (err.response && err.response.data && (err.response.data.detail || err.response.data.error)) || err.message;
        if (/ECONNREFUSED|Connection refused|not reachable|ENOTFOUND|EAI_AGAIN|connect/i.test(errMsg)) {
            errMsg = 'Moomoo OpenD tidak dapat dihubungi';
        } else if (/ETIMEDOUT|timeout/i.test(errMsg)) {
            errMsg = 'Sambungan ke Moomoo OpenD tamat masa';
        }
        return {
            status: 'UNAVAILABLE',
            connected: false,
            used_quota: null,
            remain_quota: null,
            total_quota: null,
            detail_list: [],
            error: errMsg
        };
    }
}

app.get('/api/screener/kline-quota', authenticateDashboard, async (req, res) => {
    try {
        const quotaData = getKlineQuotaData();
        const moomooQuota = await getMoomooOpenApiQuota();
        const activeWatchlistSymbols = getActiveWatchlistSymbols();

        let enrichedMoomooQuota = { ...moomooQuota };
        if (moomooQuota && moomooQuota.connected && Array.isArray(moomooQuota.detail_list)) {
            enrichedMoomooQuota.detail_list = enrichMoomooDetailList(moomooQuota.detail_list, activeWatchlistSymbols);
        } else {
            enrichedMoomooQuota.detail_list = [];
        }

        return res.json({
            ...quotaData,
            moomoo_quota: enrichedMoomooQuota,
            moomoo_counters: enrichedMoomooQuota.detail_list,
            opend_connected: Boolean(moomooQuota && moomooQuota.connected)
        });
    } catch (err) {
        console.error('[Dashboard] Error fetching kline quota data:', err);
        return res.status(500).json({ error: 'Gagal membaca data kuota K-line: ' + err.message });
    }
});

app.get('/api/data', authenticateDashboard, async (req, res) => {
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

    const moomooQuota = await getMoomooOpenApiQuota();

    res.json({
        user: req.authUser,
        watchlist,
        sentinel,
        moomoo_quota: moomooQuota,
        timestamp: new Date().toISOString()
    });
});

const distDir = path.join(__dirname, "dist");
app.use(express.static(distDir, { index: false }));
app.use("/assets", express.static(path.join(distDir, "assets")));

app.get("*", authenticateDashboard, (req, res) => {
    const distIndex = path.join(distDir, "index.html");
    if (fs.existsSync(distIndex)) {
        res.sendFile(distIndex);
    } else {
        res.sendFile(path.join(__dirname, "index.html"));
    }
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`[Dashboard] Trading Dashboard running on port ${port}`);
    });
}

module.exports = {
    app,
    getKlineQuotaData,
    getMoomooOpenApiQuota,
    getActiveWatchlistSymbols,
    enrichMoomooDetailList
};

