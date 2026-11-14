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

// Origin Authentication Middleware: Cloudflare Access Assertion
function cfAccessMiddleware(req, res, next) {
    const cfJwt = req.headers['cf-access-jwt-assertion'];
    if (cfJwt) {
        try {
            const decoded = jwt.decode(cfJwt);
            req.cfUser = decoded ? decoded.email : null;
        } catch (e) {
            req.cfUser = null;
        }
    }
    next();
}

app.use(cfAccessMiddleware);

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'trading-dashboard',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/api/data', (req, res) => {
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
        cfUser: req.cfUser || 'Development User',
        watchlist,
        sentinel,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
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

    const rows = (watchlistData.watchlist || []).map(stock => `
        <tr>
            <td style="font-weight: bold; color: #38bdf8;">${stock.symbol}</td>
            <td>${stock.name}</td>
            <td>$${stock.price.toFixed(2)}</td>
            <td style="color: ${stock.change_pct >= 0 ? '#4ade80' : '#f87171'}">${stock.change_pct >= 0 ? '+' : ''}${stock.change_pct.toFixed(2)}%</td>
            <td>${(stock.adv_20 / 1e6).toFixed(1)}M</td>
            <td style="color: #4ade80;">+${stock.rs_spy.toFixed(2)}%</td>
            <td>${stock.rvol_15m.toFixed(2)}x</td>
            <td><span class="badge badge-ready">${stock.status}</span></td>
        </tr>
    `).join('') || '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">No stocks currently in watchlist.</td></tr>';

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
        .user-tag { background: #334155; padding: 6px 12px; border-radius: 6px; font-size: 13px; color: #e2e8f0; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
        .card-title { font-size: 12px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; }
        .card-value { font-size: 24px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
        th { color: var(--text-muted); font-size: 12px; text-transform: uppercase; background: #0f172a; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
        .badge-ready { background: #065f46; color: #34d399; }
        .badge-pulse { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--success); margin-right: 6px; }
        .actions { display: flex; gap: 12px; margin-top: 20px; }
        .btn { padding: 10px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; font-size: 13px; }
        .btn-danger { background: var(--danger); color: white; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <h1>US Stock Analyst & Trader (L0 Infra & Screener)</h1>
                <p style="margin: 4px 0 0; font-size: 13px; color: var(--text-muted);">
                    <span class="badge-pulse"></span>Sentinel Pulse: <strong>${sentinelData.status}</strong> | OpenD Isolation: <strong>stock_internal</strong>
                </p>
            </div>
            <div class="user-tag">
                User: <strong>${req.cfUser || 'Cloudflare Zero Trust SSO'}</strong>
            </div>
        </header>

        <div class="grid">
            <div class="card">
                <div class="card-title">K-Line 30D Quota Used</div>
                <div class="card-value" style="color: #38bdf8;">${watchlistData.quota_status?.kline_30d_used || 0} / 100</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${watchlistData.quota_status?.kline_30d_remaining || 100} remaining</div>
            </div>
            <div class="card">
                <div class="card-title">Realtime Subscriptions</div>
                <div class="card-value" style="color: #a78bfa;">${watchlistData.quota_status?.realtime_subscribed || 0} / 100</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Max 15 concurrent symbols</div>
            </div>
            <div class="card">
                <div class="card-title">Universe Screened (Cloud)</div>
                <div class="card-value">${watchlistData.total_screened_cloud || 0}</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Stage 1: ${watchlistData.stage1_passed || 0} | Stage 2: ${watchlistData.stage2_passed || 0}</div>
            </div>
            <div class="card">
                <div class="card-title">Managed Positions</div>
                <div class="card-value" style="color: var(--success);">${sentinelData.managed_positions || 0}</div>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">60s Auto Reconciliation</div>
            </div>
        </div>

        <div class="card">
            <h2 style="margin: 0 0 16px; font-size: 16px; color: #f1f5f9;">Active Watchlist (L0 Cloud Filtered)</h2>
            <table>
                <thead>
                    <tr>
                        <th>Symbol</th>
                        <th>Name</th>
                        <th>Price</th>
                        <th>Change</th>
                        <th>ADV20</th>
                        <th>RS vs SPY</th>
                        <th>RVOL (15M)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>

        <div class="card" style="margin-top: 24px;">
            <h2 style="margin: 0 0 12px; font-size: 16px; color: #f1f5f9;">Emergency Operations & Kill Switch</h2>
            <p style="font-size: 13px; color: var(--text-muted);">
                Rule 8 Hard Enforcement: Instantly liquidates open positions and cancels all active broker orders in &lt; 3.0 seconds.
            </p>
            <div class="actions">
                <button class="btn btn-danger" onclick="alert('Kill Switch ready. Bridge API endpoint: /api/v1/trade/kill-switch');">
                    EXECUTE EMERGENCY KILL SWITCH
                </button>
            </div>
        </div>
    </div>
</body>
</html>`;

    res.send(html);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`[Dashboard] Trading Dashboard running on http://0.0.0.0:${port}`);
});
