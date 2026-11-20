const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.text({ type: ['text/plain', 'text/*'] }));
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

// Fail-fast startup validation: AUTHENTIK_CLIENT_ID is mandatory unless disabled for beta testing
if (!AUTHENTIK_CLIENT_ID && process.env.DISABLE_AUTHENTIK_AUTH !== 'true') {
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
    // 0. Check if Authentik authentication is explicitly disabled for beta testing environment
    if (process.env.DISABLE_AUTHENTIK_AUTH === 'true') {
        req.authUser = 'beta-tester';
        return next();
    }
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

    // 4. Browser requests wanting HTML without Authentik session redirect directly to Authentik SSO (No internal fallback form)
    const acceptsHtml = req.headers['accept'] && req.headers['accept'].includes('text/html');
    if (acceptsHtml && req.method === 'GET' && req.path === '/') {
        return res.redirect(302, AUTHENTIK_LOGIN_URL);
    }

    // Strict fail-closed for API/direct requests:
    return res.status(401).json({
        error: 'Authentication required. Authentik session or JWT assertion missing or invalid.'
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

    // 4. Redirect to Authentik SSO invalidation URL (HOM-156) or root for beta
    if (process.env.DISABLE_AUTHENTIK_AUTH === 'true') {
        return res.redirect(302, '/');
    }
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
    const tradingMode = (process.env.TRADING_MODE || (bridgeStatus && bridgeStatus.trading_mode) || 'DAY').toUpperCase();
    res.json({
        status: 'healthy',
        service: 'trading-dashboard',
        user: req.authUser,
        trading_mode: tradingMode,
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
    max_rvol: { min: 0.1, max: 100.0 },
    max_candidates_per_lane: { min: 1, max: 20 },
    max_buying_power: { min: 500.0, max: 100000000.0, default: 100000.0 },
    agent_orders_per_page: { options: [5, 10, 25, 50], default: 10 }
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
                max_candidates_per_lane INTEGER NOT NULL DEFAULT 5 CHECK (max_candidates_per_lane >= 1 AND max_candidates_per_lane <= 20),
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

        // Migration check: ensure max_candidates_per_lane exists in screener_config
        const tableCols = screenerDbInstance.prepare("PRAGMA table_info(screener_config)").all();
        const hasMaxCandidatesPerLane = tableCols.some(col => col.name === 'max_candidates_per_lane');
        if (!hasMaxCandidatesPerLane) {
            screenerDbInstance.exec('ALTER TABLE screener_config ADD COLUMN max_candidates_per_lane INTEGER NOT NULL DEFAULT 5 CHECK (max_candidates_per_lane >= 1 AND max_candidates_per_lane <= 20);');
        }

        // Migration check: ensure max_buying_power exists in screener_config (HOM-302)
        const hasMaxBuyingPower = tableCols.some(col => col.name === 'max_buying_power');
        if (!hasMaxBuyingPower) {
            screenerDbInstance.exec('ALTER TABLE screener_config ADD COLUMN max_buying_power REAL NOT NULL DEFAULT 100000.0 CHECK (max_buying_power >= 500.0);');
        }

        // Migration check: ensure agent_orders_per_page exists in screener_config (HOM-305)
        const hasAgentOrdersPerPage = tableCols.some(col => col.name === 'agent_orders_per_page');
        if (!hasAgentOrdersPerPage) {
            screenerDbInstance.exec('ALTER TABLE screener_config ADD COLUMN agent_orders_per_page INTEGER NOT NULL DEFAULT 10 CHECK (agent_orders_per_page IN (5, 10, 25, 50));');
        }

        // Migration check: ensure pause_buying exists in screener_config
        const hasPauseBuying = tableCols.some(col => col.name === 'pause_buying');
        if (!hasPauseBuying) {
            screenerDbInstance.exec('ALTER TABLE screener_config ADD COLUMN pause_buying INTEGER NOT NULL DEFAULT 0 CHECK (pause_buying IN (0, 1));');
        }

        const row = screenerDbInstance.prepare('SELECT * FROM screener_config WHERE id = 1').get();
        if (!row) {
            const initStmt = screenerDbInstance.prepare(`
                INSERT INTO screener_config (id, min_price, min_market_cap, min_volume, min_rvol, max_rvol, max_candidates_per_lane, max_buying_power, agent_orders_per_page, updated_at, updated_by)
                VALUES (1, 10.0, 1000000000.0, 1000000.0, 0.50, 20.00, 5, 100000.0, 10, ?, 'system')
            `);
            initStmt.run(new Date().toISOString());
        }
    }
    return screenerDbInstance;
}

app.get('/api/screener/config', authenticateDashboard, (req, res) => {
    try {
        const db = getScreenerDb();
        const row = db.prepare('SELECT min_price, min_market_cap, min_volume, min_rvol, max_rvol, max_candidates_per_lane, max_buying_power, agent_orders_per_page, pause_buying, updated_at, updated_by FROM screener_config WHERE id = 1').get();
        if (!row) {
            return res.status(500).json({ error: 'Konfigurasi screener tidak dijumpai dalam SQLite' });
        }
        return res.json({
            config: {
                min_price: Number(row.min_price),
                min_market_cap: Number(row.min_market_cap),
                min_volume: Number(row.min_volume),
                min_rvol: Number(row.min_rvol),
                max_rvol: Number(row.max_rvol),
                max_candidates_per_lane: Number(row.max_candidates_per_lane ?? 5),
                max_buying_power: Number(row.max_buying_power ?? 100000.0),
                agent_orders_per_page: Number(row.agent_orders_per_page ?? 10),
                pause_buying: Boolean(row.pause_buying === 1)
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

function parseStrictIntegerField(val, fieldName) {
    if (typeof val !== 'number' && typeof val !== 'string') {
        return { error: `${fieldName} mestilah nombor bulat (integer) yang sah.` };
    }
    if (typeof val === 'string' && val.trim() === '') {
        return { error: `${fieldName} tidak boleh kosong.` };
    }
    const num = Number(val);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
        return { error: `${fieldName} mestilah nombor bulat (integer) yang sah.` };
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
        const current = db.prepare('SELECT min_price, min_market_cap, min_volume, min_rvol, max_rvol, max_candidates_per_lane, max_buying_power, agent_orders_per_page, pause_buying FROM screener_config WHERE id = 1').get();
        if (!current) {
            return res.status(500).json({ error: 'Konfigurasi screener asal tidak dijumpai' });
        }

        let newMinPrice = current.min_price;
        let newMinMarketCap = current.min_market_cap;
        let newMinVolume = current.min_volume;
        let newMinRvol = current.min_rvol;
        let newMaxRvol = current.max_rvol;
        let newMaxCandidatesPerLane = current.max_candidates_per_lane ?? 5;
        let newMaxBuyingPower = current.max_buying_power ?? 100000.0;
        let newAgentOrdersPerPage = current.agent_orders_per_page ?? 10;
        let newPauseBuying = current.pause_buying ?? 0;

        if (body.pause_buying !== undefined) {
            newPauseBuying = body.pause_buying ? 1 : 0;
        }

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

        if (body.max_candidates_per_lane !== undefined) {
            const parsed = parseStrictIntegerField(body.max_candidates_per_lane, 'Had calon per lorong');
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            const val = parsed.value;
            if (val < SCREENER_CONFIG_LIMITS.max_candidates_per_lane.min || val > SCREENER_CONFIG_LIMITS.max_candidates_per_lane.max) {
                return res.status(400).json({
                    error: `Had calon per lorong mestilah antara ${SCREENER_CONFIG_LIMITS.max_candidates_per_lane.min} dan ${SCREENER_CONFIG_LIMITS.max_candidates_per_lane.max} kaunter (Had Kuota Moomoo OpenAPI).`
                });
            }
            newMaxCandidatesPerLane = val;
        }

        if (body.max_buying_power !== undefined) {
            const parsed = parseStrictNumericField(body.max_buying_power, 'Had buying power maksimum');
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            const val = parsed.value;
            if (val < SCREENER_CONFIG_LIMITS.max_buying_power.min) {
                return res.status(400).json({ error: `Had buying power maksimum tidak boleh kurang daripada $${SCREENER_CONFIG_LIMITS.max_buying_power.min.toLocaleString()}.` });
            }
            if (val > SCREENER_CONFIG_LIMITS.max_buying_power.max) {
                return res.status(400).json({ error: `Had buying power maksimum tidak boleh melebihi $${SCREENER_CONFIG_LIMITS.max_buying_power.max.toLocaleString()}.` });
            }
            newMaxBuyingPower = val;
        }

        if (body.agent_orders_per_page !== undefined) {
            const parsed = parseStrictIntegerField(body.agent_orders_per_page, 'Bilangan entri per halaman');
            if (parsed.error) return res.status(400).json({ error: parsed.error });
            const val = parsed.value;
            if (![5, 10, 25, 50].includes(val)) {
                return res.status(400).json({ error: 'Bilangan entri per halaman mestilah salah satu daripada: 5, 10, 25, atau 50.' });
            }
            newAgentOrdersPerPage = val;
        }

        const hasChanges = (
            newMinPrice !== current.min_price ||
            newMinMarketCap !== current.min_market_cap ||
            newMinVolume !== current.min_volume ||
            newMinRvol !== current.min_rvol ||
            newMaxRvol !== current.max_rvol ||
            newMaxCandidatesPerLane !== (current.max_candidates_per_lane ?? 5) ||
            newMaxBuyingPower !== (current.max_buying_power ?? 100000.0) ||
            newAgentOrdersPerPage !== (current.agent_orders_per_page ?? 10) ||
            newPauseBuying !== (current.pause_buying ?? 0)
        );

        if (!hasChanges) {
            return res.json({
                message: 'Tiada perubahan konfigurasi',
                config: {
                    min_price: current.min_price,
                    min_market_cap: current.min_market_cap,
                    min_volume: current.min_volume,
                    min_rvol: current.min_rvol,
                    max_rvol: current.max_rvol,
                    max_candidates_per_lane: current.max_candidates_per_lane ?? 5,
                    max_buying_power: current.max_buying_power ?? 100000.0,
                    agent_orders_per_page: current.agent_orders_per_page ?? 10,
                    pause_buying: Boolean((current.pause_buying ?? 0) === 1)
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
            max_rvol: current.max_rvol,
            max_candidates_per_lane: current.max_candidates_per_lane ?? 5,
            max_buying_power: current.max_buying_power ?? 100000.0,
            agent_orders_per_page: current.agent_orders_per_page ?? 10,
            pause_buying: current.pause_buying ?? 0
        });

        const newValues = JSON.stringify({
            min_price: newMinPrice,
            min_market_cap: newMinMarketCap,
            min_volume: newMinVolume,
            min_rvol: newMinRvol,
            max_rvol: newMaxRvol,
            max_candidates_per_lane: newMaxCandidatesPerLane,
            max_buying_power: newMaxBuyingPower,
            agent_orders_per_page: newAgentOrdersPerPage,
            pause_buying: newPauseBuying
        });

        const updateStmt = db.prepare(`
            UPDATE screener_config
            SET min_price = ?, min_market_cap = ?, min_volume = ?, min_rvol = ?, max_rvol = ?, max_candidates_per_lane = ?, max_buying_power = ?, agent_orders_per_page = ?, pause_buying = ?, updated_at = ?, updated_by = ?
            WHERE id = 1
        `);
        updateStmt.run(newMinPrice, newMinMarketCap, newMinVolume, newMinRvol, newMaxRvol, newMaxCandidatesPerLane, newMaxBuyingPower, newAgentOrdersPerPage, newPauseBuying, now, user);

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
                max_rvol: newMaxRvol,
                max_candidates_per_lane: newMaxCandidatesPerLane,
                max_buying_power: newMaxBuyingPower,
                agent_orders_per_page: newAgentOrdersPerPage,
                pause_buying: Boolean(newPauseBuying === 1)
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

// In-Memory K-Line Cache
const klineCacheMap = new Map();

function getKlineTtlMs(interval) {
    if (interval === 'day') {
        return 30 * 1000; // 30s
    }
    return 10 * 1000; // 10s for 15m, 5m, 1m
}

app.get('/api/kline', authenticateDashboard, async (req, res) => {
    try {
        const symbol = req.query.symbol;
        if (!symbol || typeof symbol !== 'string') {
            return res.status(400).json({ error: 'Parameter symbol diperlukan' });
        }
        const interval = String(req.query.interval || 'day').toLowerCase();
        const num = parseInt(req.query.num || '100', 10) || 100;

        const cacheKey = `${symbol.toUpperCase()}:${interval}`;
        const cached = klineCacheMap.get(cacheKey);
        const ttl = getKlineTtlMs(interval);
        const now = Date.now();

        if (cached && (now - cached.timestamp < ttl)) {
            return res.json({
                ...cached.data,
                cached: true
            });
        }

        if (!BRIDGE_SERVICE_TOKEN) {
            return res.status(503).json({
                status: 'UNAVAILABLE',
                connected: false,
                symbol,
                interval,
                candles: [],
                error: 'Bridge service token tidak dikonfigurasi'
            });
        }

        const targetUrl = BRIDGE_URL || 'http://mcp-bridge:8000';
        const bridgeRes = await axios.get(`${targetUrl}/api/v1/kline`, {
            params: { symbol, interval, num },
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 6000
        });

        const result = bridgeRes.data;
        if (result.status === 'HEALTHY') {
            klineCacheMap.set(cacheKey, {
                data: result,
                timestamp: now
            });
        }

        return res.json({
            ...result,
            cached: false
        });
    } catch (err) {
        let errMsg = (err.response && err.response.data && (err.response.data.detail || err.response.data.error)) || err.message;
        if (/ECONNREFUSED|Connection refused|not reachable|ENOTFOUND|EAI_AGAIN|connect/i.test(errMsg)) {
            errMsg = 'Moomoo OpenD tidak dapat dihubungi';
        } else if (/ETIMEDOUT|timeout/i.test(errMsg)) {
            errMsg = 'Sambungan ke Moomoo OpenD tamat masa';
        }
        return res.status(200).json({
            status: 'UNAVAILABLE',
            connected: false,
            symbol: req.query.symbol || '',
            interval: req.query.interval || 'day',
            candles: [],
            error: errMsg
        });
    }
});

app.post('/api/kline/release', authenticateDashboard, async (req, res) => {
    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) {}
        }
        const { symbol, interval } = body || {};
        if (!symbol || typeof symbol !== 'string') {
            return res.status(400).json({ error: 'Parameter symbol diperlukan' });
        }
        if (!BRIDGE_SERVICE_TOKEN) {
            return res.status(200).json({ status: 'OK', released: symbol, active: false });
        }
        const targetUrl = BRIDGE_URL || 'http://mcp-bridge:8000';
        const bridgeRes = await axios.post(`${targetUrl}/api/v1/kline/release`, {
            symbol,
            interval: interval || 'day'
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Service-Token': BRIDGE_SERVICE_TOKEN
            },
            timeout: 4000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        return res.status(200).json({ status: 'OK', released: req.body?.symbol, error: err.message });
    }
});

app.get('/api/kline/subscriptions', authenticateDashboard, async (req, res) => {
    try {
        if (!BRIDGE_SERVICE_TOKEN) {
            return res.status(500).json({ error: 'Bridge service token tidak dikonfigurasi' });
        }
        const targetUrl = BRIDGE_URL || 'http://mcp-bridge:8000';
        const bridgeRes = await axios.get(`${targetUrl}/api/v1/kline/subscriptions`, {
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 4000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        console.error('[Dashboard] Error fetching kline subscriptions from bridge:', err.message);
        return res.status(502).json({
            error: 'Gagal menghubungi pelayan Bridge K-line: ' + (err.response?.data?.error || err.message)
        });
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

// Agent Coordination & Paper Trading Simulation Proxy Endpoints (HOM-291)
app.get('/api/agents/activity', authenticateDashboard, async (req, res) => {
    try {
        if (!BRIDGE_SERVICE_TOKEN) {
            return res.status(500).json({ error: 'Bridge service token tidak dikonfigurasi' });
        }
        const targetUrl = BRIDGE_URL || 'http://mcp-bridge:8000';
        const limit = req.query.limit || 10;
        const bridgeRes = await axios.get(`${targetUrl}/api/v1/agents/activity`, {
            params: { limit },
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 5000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        console.error('[Dashboard] Error fetching agent activity from bridge:', err.message);
        return res.status(err.response?.status || 502).json({
            error: 'Gagal menghubungi pelayan Bridge untuk aktiviti ejen: ' + (err.response?.data?.detail || err.message)
        });
    }
});

app.post('/api/agents/simulate-run', authenticateDashboard, async (req, res) => {
    try {
        if (!BRIDGE_SERVICE_TOKEN) {
            return res.status(500).json({ error: 'Bridge service token tidak dikonfigurasi' });
        }
        const targetUrl = BRIDGE_URL || 'http://mcp-bridge:8000';
        const bridgeRes = await axios.post(`${targetUrl}/api/v1/agents/simulate-run`, req.body || {}, {
            headers: {
                'Content-Type': 'application/json',
                'X-Service-Token': BRIDGE_SERVICE_TOKEN
            },
            timeout: 15000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        console.error('[Dashboard] Error triggering agent simulation run:', err.message);
        return res.status(err.response?.status || 502).json({
            error: 'Gagal mencetuskan kitaran simulasi saluran paip: ' + (err.response?.data?.detail || err.message)
        });
    }
});

app.post('/api/agents/orders/:order_id/cancel', authenticateDashboard, async (req, res) => {
    try {
        if (!BRIDGE_SERVICE_TOKEN) {
            return res.status(500).json({ error: 'Bridge service token tidak dikonfigurasi' });
        }
        const targetUrl = BRIDGE_URL || 'http://mcp-bridge:8000';
        const { order_id } = req.params;
        const bridgeRes = await axios.post(`${targetUrl}/api/v1/agents/orders/${encodeURIComponent(order_id)}/cancel`, {}, {
            headers: {
                'Content-Type': 'application/json',
                'X-Service-Token': BRIDGE_SERVICE_TOKEN
            },
            timeout: 10000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        console.error('[Dashboard] Error cancelling agent order via bridge:', err.message);
        return res.status(err.response?.status || 502).json({
            error: 'Gagal membatalkan pesanan ejen: ' + (err.response?.data?.detail || err.message)
        });
    }
});

app.get('/api/agents/pause-buying', authenticateDashboard, (req, res) => {
    try {
        const db = getScreenerDb();
        const row = db.prepare('SELECT pause_buying FROM screener_config WHERE id = 1').get();
        return res.json({
            status: 'OK',
            pause_buying: Boolean(row && row.pause_buying === 1)
        });
    } catch (err) {
        return res.status(500).json({ error: 'Gagal membaca status jeda pembelian: ' + err.message });
    }
});

app.post('/api/agents/pause-buying', authenticateDashboard, async (req, res) => {
    try {
        const { paused } = req.body || {};
        if (typeof paused !== 'boolean') {
            return res.status(400).json({ error: 'Parameter "paused" (boolean) diperlukan.' });
        }
        const db = getScreenerDb();
        const current = db.prepare('SELECT pause_buying FROM screener_config WHERE id = 1').get();
        const prevVal = current ? current.pause_buying : 0;
        const newVal = paused ? 1 : 0;
        const now = new Date().toISOString();
        const user = String(req.authUser || 'anonymous').replace(/[\r\n]/g, '').slice(0, 100);

        db.prepare('UPDATE screener_config SET pause_buying = ?, updated_at = ?, updated_by = ? WHERE id = 1').run(newVal, now, user);
        db.prepare(`
            INSERT INTO screener_config_audit (timestamp, user, action, previous_values, new_values)
            VALUES (?, ?, ?, ?, ?)
        `).run(now, user, paused ? 'PAUSE_BUYING' : 'RESUME_BUYING', JSON.stringify({ pause_buying: prevVal }), JSON.stringify({ pause_buying: newVal }));

        // Also notify bridge daemon if configured
        if (BRIDGE_SERVICE_TOKEN) {
            try {
                const targetUrl = BRIDGE_URL || 'http://mcp-bridge:8000';
                await axios.post(`${targetUrl}/api/v1/agents/pause-buying`, { paused }, {
                    headers: { 'Content-Type': 'application/json', 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
                    timeout: 3000
                }).catch(() => {});
            } catch (_) {}
        }

        return res.json({
            status: 'OK',
            pause_buying: paused,
            message: paused 
                ? 'Pembelian baharu dijeda. Ejen L1-L4 hanya akan menganalisis pasaran dan menjaga kaunter sedia ada.' 
                : 'Pembelian baharu disambung semula secara normal.'
        });
    } catch (err) {
        console.error('[Dashboard] Error toggling pause_buying:', err);
        return res.status(500).json({ error: 'Gagal mengemas kini status jeda pembelian: ' + err.message });
    }
});

app.get('/api/trade/orders', authenticateDashboard, async (req, res) => {
    try {
        if (!BRIDGE_SERVICE_TOKEN) {
            return res.status(500).json({ error: 'Bridge service token tidak dikonfigurasi' });
        }
        const targetUrl = BRIDGE_URL || 'http://mcp-bridge:8000';
        const bridgeRes = await axios.get(`${targetUrl}/api/v1/trade/orders`, {
            headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
            timeout: 5000
        });
        return res.json(bridgeRes.data);
    } catch (err) {
        console.error('[Dashboard] Error fetching trade orders from bridge:', err.message);
        return res.status(err.response?.status || 502).json({
            error: 'Gagal mendapatkan rekod pesanan daripada Bridge: ' + (err.response?.data?.detail || err.message)
        });
    }
});

app.get('/api/portfolio', authenticateDashboard, async (req, res) => {
    try {
        if (!BRIDGE_SERVICE_TOKEN) {
            return res.status(500).json({ error: 'Bridge service token tidak dikonfigurasi' });
        }
        const targetUrl = BRIDGE_URL || 'http://mcp-bridge:8000';
        const [posRes, accRes] = await Promise.all([
            axios.get(`${targetUrl}/api/v1/trade/positions`, {
                headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
                timeout: 5000
            }).catch(e => ({ data: { positions: [], opend_status: 'DISCONNECTED', error: e.message } })),
            axios.get(`${targetUrl}/api/v1/trade/accounts`, {
                headers: { 'X-Service-Token': BRIDGE_SERVICE_TOKEN },
                timeout: 5000
            }).catch(e => ({ data: { accounts: [], current_account_id: 'N/A' } }))
        ]);

        const rawPositions = posRes.data?.positions || [];
        const opendStatus = posRes.data?.opend_status || 'UNKNOWN';

        let totalCostBasis = 0;
        let totalMarketValue = 0;
        let totalPlVal = 0;

        const positions = rawPositions.map(p => {
            const qty = Number(p.qty) || 0;
            const costPrice = Number(p.cost_price) || 0;
            const currentPrice = Number(p.nominal_price) || 0;
            const totalCost = Number((qty * costPrice).toFixed(2));
            const marketValue = Number((qty * currentPrice).toFixed(2));
            const plVal = Number((p.pl_val !== undefined ? p.pl_val : (marketValue - totalCost)).toFixed(2));
            const plPct = totalCost > 0 ? Number(((plVal / totalCost) * 100).toFixed(2)) : 0;

            totalCostBasis += totalCost;
            totalMarketValue += marketValue;
            totalPlVal += plVal;

            return {
                position_id: p.position_id,
                symbol: p.code,
                clean_symbol: p.code ? (p.code.includes('.') ? p.code.split('.')[1] : p.code) : '',
                stock_name: p.stock_name || p.code,
                qty,
                can_sell_qty: p.can_sell_qty !== undefined ? p.can_sell_qty : qty,
                bought_price: costPrice,
                current_price: currentPrice,
                total_cost: totalCost,
                market_value: marketValue,
                unrealized_pl: plVal,
                unrealized_pl_pct: plPct,
            };
        });

        totalCostBasis = Number(totalCostBasis.toFixed(2));
        totalMarketValue = Number(totalMarketValue.toFixed(2));
        totalPlVal = Number(totalPlVal.toFixed(2));
        const totalPlPct = totalCostBasis > 0 ? Number(((totalPlVal / totalCostBasis) * 100).toFixed(2)) : 0;

        return res.json({
            opend_status: opendStatus,
            account_id: accRes.data?.current_account_id || '3123530',
            env: accRes.data?.env || 'SIMULATE',
            summary: {
                total_cost_basis: totalCostBasis,
                total_market_value: totalMarketValue,
                total_unrealized_pl: totalPlVal,
                total_pl_pct: totalPlPct,
                position_count: positions.length,
            },
            positions,
            updated_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Dashboard] Error fetching portfolio:', err.message);
        return res.status(500).json({ error: 'Gagal mendapatkan data portfolio: ' + err.message });
    }
});

const distDir = path.join(__dirname, "dist");
// Robust asset handler for both absolute /assets/ and relative sub-route /portfolio/assets/
app.use((req, res, next) => {
    const assetsIdx = req.path.indexOf("/assets/");
    if (assetsIdx !== -1) {
        const subPath = req.path.substring(assetsIdx + "/assets/".length);
        const targetFile = path.join(distDir, "assets", subPath);
        if (fs.existsSync(targetFile)) {
            return res.sendFile(targetFile);
        }
    }
    next();
});
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

