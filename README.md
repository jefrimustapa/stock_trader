# US Stock Analyst & Trader (STOCK-TRADER)

US market stock screening system (L0 Screener), agent communication bridge (MCP Bridge), and operations dashboard integrated with Moomoo OpenAPI broker.

---

> [!IMPORTANT]
> **Official Source of Truth Document**:
> Refer to [BLUEPRINT.md](BLUEPRINT.md) as the core reference document for overall system architecture, agent hierarchy and responsibilities (L0 Screener, L1 Tariq, L1 Nawwar, L2 Haziq, L3 Danial, L4 Exit Sentinel), Moomoo OpenAPI quota orchestration, database, and API specifications.
>
> All branch-specific implementation plans are archived in [`plan/`](plan/).

---

## 1. System Architecture Overview

The system consists of core components orchestrated via Docker Compose:

1. **Moomoo OpenD Gateway (`moomoo-opend`)**:
   - Container `stock_moomoo_opend`.
   - Handles Moomoo OpenAPI broker gateway connections.
   - Binary protocol on port 11111, Telnet on port 22222.
   - Fully isolated inside internal `stock_network`.
   - No ports exposed to the public host.

2. **L0 Screener Daemon (`screener-daemon`)**:
   - Container `stock_screener_daemon`.
   - Runs automated Python stock screening engine.
   - Dual-lane screening: MOMENTUM and SETUP.
   - Includes hard quota tracker (`quota_tracker.py`).
   - Tracks Moomoo limit: 100 symbols per 30-day rolling window.
   - Supports dynamic hot-read of filter config from SQLite WAL (`screener_config.sqlite`).

3. **MCP Bridge (`mcp-bridge`)**:
   - Container `stock_mcp_bridge` (FastAPI / FastMCP).
   - Provides integration interface and analysis tools for agent team (Tariq, Nawwar, Haziq, Danial).
   - Bound exclusively to host loopback (`127.0.0.1:8005`).
   - Ensures secure Paperclip agent communication.

4. **Trading Dashboard (`trading-dashboard`)**:
   - Visual web dashboard built with React, Vite, and Express.js.
   - Real-time quotes monitoring, quota status, watchlist, and L0 screener configuration.

---

## 2. Environment Topology: Production vs Beta

The system enforces strict isolation between Production and Beta environments:

### 2.1 Production Environment
- **Official Subdomain**: `https://trade.julietmike.net/`
- **Application Container**: `stock_trading_dashboard` (port 3000).
- **Access Control / Authentication**: Protected by **Authentik SSO Outpost** (`auth.julietmike.net`). Users must authenticate through corporate identity flow before accessing dashboard.
- **NPM Routing**: Proxy Host 23 (Let's Encrypt certificate for `trade.julietmike.net`, Force SSL, HTTP/2).

### 2.2 Beta Testing Environment
- **Official Subdomain**: `https://stock-trader.beta.julietmike.net/`
- **Dedicated Beta Container**:
  - Service `trading-dashboard-beta` in `docker-compose.yml`.
  - Container name: `stock_trading_dashboard_beta`.
  - Runs on `stock_network` and `npm_default` networks.
  - Sets `DISABLE_AUTHENTIK_AUTH=true` to disable Authentik SSO checks for beta.
  - Prevents interference with production routing or test workflows.
- **NPM Routing**: Proxy Host 26 (Let's Encrypt wildcard `*.beta.julietmike.net`, Force SSL, HTTP/2, WebSocket Upgrade enabled). Configured to proxy directly (`proxy_pass`) to container `stock_trading_dashboard_beta:3000` without 302 redirects.

---

## 3. Running Services (Docker Compose)

### Run Production Environment:
```bash
docker compose up -d moomoo-opend screener-daemon mcp-bridge trading-dashboard
```

### Run Beta Environment for Testing:
```bash
docker compose up -d --build trading-dashboard-beta
```

---

## 4. L0 Stock Screener Configuration

L0 screening parameters are stored dynamically in `shared_data/screener_config.sqlite` (WAL mode):
- `min_price`: Minimum stock price limit ($1.00 to $10,000.00).
- `min_market_cap`: Minimum market capitalization (default: $1B).
- `min_volume`: Average daily volume (ADV20).
- `min_rvol` & `max_rvol`: Relative Volume (RVOL) range.
- `max_candidates_per_lane`: Maximum candidates processed into Stage 3 K-line enrichment per lane (valid range: **1 to 20 stocks**). Strictly controlled to protect Moomoo OpenAPI K-line quota budget (100 symbols / 30 days).

---

## 5. Testing & Quality Assurance (QA)

- **Unit & BVA Tests**:
  ```bash
  python3 -m pytest tests/test_max_candidates_lane_bva.py -v
  node dashboard/test_screener_config.js
  ```
- **Playwright E2E Tests**:
  ```bash
  /paperclip/bin/pw-browser run dashboard/test_screener_settings_e2e.js
  ```
