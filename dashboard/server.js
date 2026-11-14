const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SHARED_DATA_DIR = process.env.SHARED_DATA_DIR || '/app/shared_data';
const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD || '';
const BRIDGE_SERVICE_TOKEN = process.env.BRIDGE_SERVICE_TOKEN || '';

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

// Origin Authentication Middleware: Cloudflare Access Assertion & Service Token
function authenticateDashboard(req, res, next) {
    // Check internal service token
    const serviceToken = req.headers['x-service-token'];
    if (serviceToken && BRIDGE_SERVICE_TOKEN && serviceToken.replace('Bearer ', '').trim() === BRIDGE_SERVICE_TOKEN) {
        req.authUser = 'internal-service';
        return next();
    }

    // Check Cloudflare Access JWT Assertion
    const cfJwt = req.headers['cf-access-jwt-assertion'];
    if (cfJwt) {
        try {
            // Verify structure and audience if configured
            const decoded = jwt.decode(cfJwt);
            if (decoded) {
                if (CF_ACCESS_AUD && decoded.aud !== CF_ACCESS_AUD) {
                    return res.status(403).json({ error: 'Cloudflare Access JWT audience mismatch' });
                }
                req.authUser = decoded.email || decoded.sub || 'Cloudflare User';
                return next();
            }
        } catch (e) {
            return res.status(401).json({ error: 'Invalid Cloudflare Access assertion token' });
        }
    }

    // If CF_ACCESS_AUD is enforced and neither CF JWT nor Service Token is present:
    if (CF_ACCESS_AUD && CF_ACCESS_AUD.trim() !== '') {
        return res.status(401).json({
            error: 'Authentication required. Cloudflare Access JWT assertion or X-Service-Token header missing.'
        });
    }

    // Sandbox / local mode fallback when CF_ACCESS_AUD is not configured
    req.authUser = 'Local Sandbox User';
    next();
}

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'trading-dashboard',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
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

app.get('/', authenticateDashboard, (req, res) => {
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
    }).join('') || '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">No stocks currently in watchlist.</td></tr>';

    const safeUser = escapeHtml(req.authUser);
    const sentinelStatus = escapeHtml(sentinelData.status || 'OFFLINE');
    const managedPositions = Number(sentinelData.managed_positions || 0);
    const klineUsed = Number(watchlistData.quota_status ? watchlistData.quota_status.kline_30d_used : 0);
    const klineRemaining = Number(watchlistData.quota_status ? watchlistData.quota_status.kline_30d_remaining : 100);

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
                <div class="meta">Phase 1 Infrastructure & Hard Rules Monitor | Authenticated: ${safeUser}</div>
            </div>
            <div>
                <span class="badge badge-active">Live Dashboard</span>
            </div>
        </header>

        <div class="grid">
            <div class="card">
                <h3>Sentinel L4 Status</h3>
                <div class="value" style="color: var(--success);">${sentinelStatus}</div>
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
</body>
</html>`;

    res.send(html);
});

app.listen(port, () => {
    console.log(`[Dashboard] Trading Dashboard running on port ${port}`);
});
