# Architectural Blueprint Option A (L0 -> L4): US Stock Analyst & Trader (Version 3.5 Definitive (Authentik Integration))

**Task Reference:** HOM-114 (Parent: HOM-47, QA Audit: HOM-118, HOM-119, HOM-121, HOM-122, HOM-123)  
**Status:** Research & Planning Mode (Zero-Code Planning)  
**Requester:** Jefri  
**Architect / Software Lead:** Hakeem  
**Independent Reviewer / QA Gatekeeper:** Zahrin  

---

## 1. Executive Summary & Architectural Principles (Option A)

This Blueprint Version 3.5 Definitive (Authentik Integration) consolidates all L0 to L4 architectural specifications into a single official reference document. It resolves 100% of issues M1–M4 and QA audit reviews by Zahrin (HOM-118, HOM-119, HOM-121, HOM-122, and HOM-123) with zero configuration discrepancies, zero security gaps, and zero syntax flaws.

### Core Architectural Principles:
1. **Decoupled & Deterministic-First (Python First):**
   - 80% of heavy data processing, volume calculation, safety filters, capital risk limits, and fast execution loops run in deterministic Python code without LLMs.
   - AI agents are called only for qualitative reasoning on the top 3–5 candidates.
2. **Realistic Moomoo OpenAPI Quota Management:**
   - Real-time quotation quota is calculated per *(symbol $\times$ data type)*.
   - Historical K-line quota is capped at 100 unique symbols per 30-day rolling window.
   - Uses official Moomoo API `get_stock_screen` (Stock Screening V2, 244+ cloud server-side factors) for initial Universe filtering without consuming local K-line quota.
3. **L3 Safety Enforcement in Bridge Code (Not Dependent on LLMs):**
   - All Hard Rules (2% capital risk, 5% daily drawdown, penny stock restrictions, market trading hours, and PDT rules) are mandatorily enforced in Python Bridge backend code before `place_order`.
   - Danial acts as an audit and compliance officer, not a single point of failure or sole veto gate.
4. **Client-Side Exit Management (Exit Sentinel Daemon):**
   - OpenAPI does not natively support Bracket/OCO order parameters.
   - Partial TP (50%), Break-Even Move, Chandelier Trailing Stop, and Time-based exit logic are managed by a dedicated **L4 Exit Sentinel Python Daemon**.
5. **Dual-Focus L1 Agents (Discovery vs Active Portfolio Watch):**
   - Tariq and Nawwar inspect new candidates from L0 (Discovery Loop).
   - They also monitor active holdings (Active Position Watch) for early reversal warnings or breaking news threats.
6. **Layered Defense-in-Depth Security:**
   - Authentik SSO (`auth.julietmike.net` / OIDC & Forward Auth).
   - Cryptographic JWT verification (`Cf-Access-Jwt-Assertion`) at Dashboard and Bridge origin to prevent internal network bypass.
   - Port isolation & focused verification: Ports 11111/22222 of OpenD are isolated inside internal `stock_internal` network (no host publication).
   - Web Dashboard verifies Authentik JWT (`auth.julietmike.net`) at origin.
   - Bridge port 8000 is published exclusively to host loopback (`127.0.0.1:8000`) protected by a Shared Secret Token (`PAPERCLIP_BRIDGE_SECRET`) for Paperclip agents (Haziq, Danial, Tariq, Nawwar).
   - Internal calls from Dashboard are verified via `X-Service-Token`.

---

## 2. End-to-End Architectural Overview (L0 -> L4)

```text
                  ┌────────────────────────────────────────────────────────┐
                  │                 US Equities Stock Market               │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L0: DETERMINISTIC INFRASTRUCTURE & SCREENER (Docker Stack)                               │
│  - Moomoo OpenD Daemon (Container 1: Headless Linux CLI, Port 11111/22222)              │
│  - Python L0 Screener (Container 2: get_stock_screen V2 + Quota Budget Manager)          │
│  - Output: /data/watchlist/us_active_watchlist.json (Top 10-20 candidates)               │
└───────────────────────┬──────────────────────────────────────┬───────────────────────────┘
                        │ New Watchlist (Discovery)            │ Active Position Data
                        ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L1: INTELLIGENCE & ANALYSIS LAYER (Dual-Focus Intelligence Agents - Paperclip)           │
│  - Tariq (Technical Analyst): Fail-Fast Confluence (Wyckoff + Wave + SMC + VPVR + ATR)   │
│    * Input: OHLCV JSON + Precomputed Python Metrics (Not chart screenshots)              │
│    * Pipeline A: Evaluate entry candidates (top 3-5 candidates)                          │
│    * Pipeline B: Monitor active positions for exhaustion/reversal signals                │
│  - Nawwar (Sentiment Scout): 4-Pillar Analysis (SEC EDGAR, Earnings Beat, Macro, Radar)  │
└───────────────────────┬──────────────────────────────────────┬───────────────────────────┘
                        │ Technical Report (JSON)              │ Sentiment Report (JSON)
                        └──────────────────────┬───────────────┘
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L2: PORTFOLIO LEAD & STRATEGY (Portfolio Lead - Paperclip)                               │
│  - Haziq: Thesis synthesis, scoring (0-100), Fractional Risk capital sizing               │
│  - Exit Policy Parameters: Defines TP1, Trailing Offset, and early cancellation rules    │
└──────────────────────────────────────────────┬───────────────────────────────────────────┘
                                               │ Order Proposal (Order Proposal + Rules)
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L3: RISK GATEKEEPER & COMPLIANCE (Risk Gatekeeper Agent + Hard Code Enforcer)            │
│  - Danial: Thesis compliance audit, risk logic verification, audit trail logging         │
└──────────────────────────────────────────────┬───────────────────────────────────────────┘
                                               │ Approved Order
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L4: BROKER INTERFACE, EXIT ENGINE & DASHBOARD                                            │
│  - Python Bridge Enforcer: Mandatory Hard Rules Verification (BVA 2% risk, 5% DD, PDT)   │
│  - Moomoo OpenAPI Execution: Normal/Limit Order + Idempotency Key (CltOrderID)           │
│  - Exit Sentinel Daemon (Python): Order state loop, TP1 (50%), Trailing Stop,            │
│    Break-Even shift, and mandatory Time-Exit (15:45 America/New_York)                    │
│  - Dedicated Web Dashboard (FastAPI + React / Streamlit):                                │
│    * Authentik SSO (auth.julietmike.net) + Origin JWT Assertion Verification             │
│    * PnL display, Open Trades, Watchlist, Agent Logs & Manual Kill Switch                │
│    * OpenD Session Panel: Status, Switch Account (acc_id), and Telnet 2FA OTP Relay      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Specifications per Layer

### 3.1. L0: Infrastructure, Quota Management & Deterministic Screener

#### A. Dockerfile & Docker Compose Stack Specifications
Because Moomoo does not supply an official Docker image, the system uses a **custom Dockerfile** based on official Debian/Ubuntu that downloads the official OpenD Linux binary from Moomoo portal:

```dockerfile
# Dockerfile.opend
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y wget ca-certificates telnet netcat curl && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/opend
# Download stable OpenD Linux x86_64 binary with SHA256 integrity verification (Resolution P2 HOM-123)
ARG OPEND_VERSION=8.2.3708
ARG OPEND_SHA256
RUN test -n "$OPEND_SHA256" || (echo "SECURITY ERROR: OPEND_SHA256 is required during Phase 1 build!" && exit 1)     && wget -q https://software-file.moomoo.com/OpenD_${OPEND_VERSION}_Linux.tar.gz -O OpenD.tar.gz     && echo "${OPEND_SHA256}  OpenD.tar.gz" | sha256sum -c -     && tar -zxvf OpenD.tar.gz     && rm OpenD.tar.gz
EXPOSE 11111 22222
# IMPORTANT (Fix M3): -telnet_ip=0.0.0.0 inside container so Bridge on stock_internal can reach port 22222 for 2FA OTP relay.
# Port 22222 is NOT published to host to avoid unauthorized external access.
CMD ["./OpenD", "-api_ip=0.0.0.0", "-api_port=11111", "-telnet_ip=0.0.0.0", "-telnet_port=22222"]
```

Orchestration file `docker-compose.yml`:
```yaml
version: '3.8'

services:
  moomoo-opend:
    build:
      context: ./opend
      dockerfile: Dockerfile.opend
    container_name: stock_moomoo_opend
    restart: unless-stopped
    # Ports 11111 and 22222 are only exposed inside internal stock_internal network (no host publication).
    expose:
      - "11111"
      - "22222"
    volumes:
      - opend_session_data:/root/.com.moomoo.OpenD
    networks:
      - stock_internal

  screener-daemon:
    build:
      context: ./screener
      dockerfile: Dockerfile.screener
    container_name: stock_l0_screener
    restart: unless-stopped
    depends_on:
      - moomoo-opend
    volumes:
      - shared_trading_data:/app/shared_data
    environment:
      - OPEND_HOST=moomoo-opend
      - OPEND_PORT=11111
      - SCREENER_INTERVAL_SEC=300
      - OUTPUT_PATH=/app/shared_data/watchlist.json
    networks:
      - stock_internal

  trading-dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile.dashboard
    container_name: stock_trading_dashboard
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - BRIDGE_URL=http://mcp-bridge:8000
      - CLOUDFLARE_AUD_TAG=${CF_ACCESS_AUD_TAG}
    networks:
      - stock_internal
      - npm_default

  mcp-bridge:
    build:
      context: ./bridge
      dockerfile: Dockerfile.bridge
    container_name: stock_mcp_bridge
    restart: unless-stopped
    depends_on:
      - moomoo-opend
    # IMPORTANT (Coordination M2 HOM-121): Published ONLY to localhost loopback (127.0.0.1)
    # to allow Paperclip agents (Haziq/Danial) to connect from outside Docker stack.
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      - OPEND_HOST=moomoo-opend
      - OPEND_PORT=11111
      - OPEND_TELNET_PORT=22222
      - MOOMOO_TRD_ENV=SIMULATE
      - MOOMOO_ACC_ID=${MOOMOO_ACC_ID}
      - BRIDGE_SERVICE_TOKEN=${BRIDGE_SERVICE_TOKEN}
      - PAPERCLIP_BRIDGE_SECRET=${PAPERCLIP_BRIDGE_SECRET}
      - CF_ACCESS_AUD=${CF_ACCESS_AUD_TAG}
      - CF_ACCESS_TEAM_DOMAIN=${CF_ACCESS_TEAM_DOMAIN}
    networks:
      - stock_internal

volumes:
  opend_session_data:
    driver: local
  shared_trading_data:
    driver: local

networks:
  stock_internal:
    driver: bridge
  npm_default:
    external: true
```

#### B. Container Isolation Topology: Moomoo OpenD vs Trading Dashboard (Separation of Concerns & Defense-in-Depth)
Moomoo OpenD broker gateway and Trading Dashboard run in separate, isolated containers:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ External Isolated Network (npm_default / Cloudflare Tunnel)            │
│   └── stock_trading_dashboard (Node.js Express, Port 3000)             │
│         - Web UI https://stock-trader.beta.julietmike.net/             │
│         - Protected by Authentik SSO & Forward Auth                    │
│         - Fetches data via internal HTTP with X-Service-Token          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Internal HTTP
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Internal Isolated Network (stock_internal / stock_network)             │
│                                                                        │
│   ├── stock_mcp_bridge (Python FastAPI, Port 8000)                     │
│   │     - Enforces 8 capital Hard Rules                                │
│   │     - Communicates with OpenD API (11111) & Telnet CLI (22222)     │
│   │     - Feeds OpenD status & account balances to Dashboard           │
│   │                                                                    │
│   ├── stock_screener_daemon (Python Background Daemon)                 │
│   │     - Pulls real market data via OpenQuoteContext (11111)          │
│   │     - Writes active watchlist to /app/shared_data/watchlist        │
│   │                                                                    │
│   └── stock_moomoo_opend (Headless Linux CLI Daemon)                   │
│         - Official Moomoo OpenD binary (Port 11111 API, Port 22222 CLI)│
│         - 100% isolated from public web access                         │
│         - Persistent volume: opend_session_data -> /root/.com.moomoo...│
└────────────────────────────────────────────────────────────────────────┘
```

**Roles of 4 Separate Containers:**
1. **`stock_moomoo_opend` (OpenD Daemon)**:
   - Official headless Linux CLI container.
   - 100% isolated inside internal network `stock_internal` (no host or public exposure).
   - Stores session files and broker tokens in named volume `opend_session_data` (`/root/.com.moomoo.OpenD`).
2. **`stock_trading_dashboard` (Trading Dashboard)**:
   - Node.js Express web application (port 3000) connected to `npm_default`.
   - Accessible at `https://stock-trader.beta.julietmike.net/` behind Authentik SSO.
   - Dashboard **never talks directly to OpenD**.
   - Fetches status metrics, environment (`SIMULATE`), account ID, and balances from `mcp-bridge` via internal HTTP with `X-Service-Token`.
3. **`stock_mcp_bridge` (REST Bridge)**:
   - Python FastAPI backend enforcing 8 Hard Rules.
   - Manages API connections (port 11111) and Telnet CLI (port 22222) to OpenD.
4. **`stock_screener_daemon` (Screener Daemon)**:
   - Background Python daemon pulling Universe stocks from OpenD using quota-safe calls.
   - Writes candidate stocks to `watchlist.json`.

**Reasons & Benefits of Container Isolation:**
1. **Layered Security (Defense-in-Depth)**:
   - If public web dashboard is accessed, no direct path exists to OpenD broker ports or process.
2. **Lifecycle Isolation**:
   - Updating dashboard code or restarting dashboard container does not terminate active OpenD session.
   - OpenD restart tests do not disrupt web dashboard availability.

#### C. Moomoo OpenAPI Quota Budget Management (Realities vs Constraints)
1. **30-Day K-line Limit Solution (100 Rolling Symbols):**
   - L0 is **STRICTLY FORBIDDEN** from calling `request_history_kline` across thousands of market stocks.
   - Stage 1 filtering uses **Official API `get_stock_screen` (Stock Screening V2)**.
   - Executes quantitative filters directly on Moomoo cloud servers without consuming local K-line quota.
   - Calling `request_history_kline` is **allowed only for Top 10–20 candidates** passing Stage 2.
   - Local SQLite database (`quota_tracker.db`) tracks 100-symbol rolling 30-day quota and displays balance on dashboard.
2. **Subscribed Data Quota Breakdown:**
   - Maximum limit: 100 concurrent quotas.
   - Prudent Subscription Strategy: Each stock subscribes only `SubType.QUOTE` (1 unit) and `SubType.K_15M` (1 unit) = 2 quota units per stock.
   - For 15 active stocks: $15 \times 2 = 30$ quota units used.
   - Leaves 70 safety buffer units for active open positions and system headroom.

#### D. Multi-Stage Screening Formulas
1. **Stage 1: Cloud Stock Screening (`get_stock_screen` V2):**
   - Current Price ($P$): $P \ge \$5.00$
   - Market Capitalization: $MarketCap \ge \$500\text{ M}$
   - Average Daily Volume: $ADV_{20} \ge 1,000,000$ shares
   - Daily Price Change ($\Delta P\%$): $+2.0\% \le \Delta P \le +12.0\%$
2. **Stage 2: Relative Strength vs Benchmark (RS to SPY):**
   - Relative Strength ratio: $RS = \frac{\Delta P_{stock}}{\Delta P_{SPY}}$.
   - Stocks holding green while SPY is red are prioritized.
3. **Stage 3: Volume Spread & Squeeze Detection (Python Math):**
   - $RVOL \ge 2.0$ compared to same-time historical average.
   - Bollinger Band Squeeze (20-period bandwidth in lowest 20th percentile signals imminent volatility expansion).

#### E. Watchlist Data Structure (Official JSON Schema)
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "StockTraderWatchlist",
  "type": "object",
  "required": ["timestamp", "market_session", "watchlist_count", "quota_30d_used", "stocks"],
  "properties": {
    "timestamp": { "type": "string", "format": "date-time" },
    "market_session": { "type": "string", "enum": ["PRE_MARKET", "REGULAR", "AFTER_HOURS", "CLOSED"] },
    "watchlist_count": { "type": "integer", "maximum": 20 },
    "quota_30d_used": { "type": "integer", "maximum": 100 },
    "stocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["symbol", "name", "price", "change_pct", "volume", "rvol", "rsi_14", "atr_14", "support", "resistance", "screen_trigger", "poc_price"],
        "properties": {
          "symbol": { "type": "string" },
          "name": { "type": "string" },
          "price": { "type": "number" },
          "change_pct": { "type": "number" },
          "volume": { "type": "integer" },
          "rvol": { "type": "number" },
          "rsi_14": { "type": "number" },
          "atr_14": { "type": "number" },
          "support": { "type": "number" },
          "resistance": { "type": "number" },
          "poc_price": { "type": "number" },
          "screen_trigger": { "type": "string" }
        }
      }
    }
  }
}
```

---

### 3.2. L1: AI Intelligence Layer — Dual-Focus & Fail-Fast Confluence Stack

#### A. Tariq Input Format (Structured JSON, Not Chart Images)
- Tariq receives structured **OHLCV JSON with precomputed Python metrics** (Support/Resistance, Squeeze, POC, ATR).
- Saves 90% token costs.
- Enables automated unit testing without relying on slow, expensive visual processing.

#### B. 5-Layer Fail-Fast Execution Hierarchy
Execution order runs from cheapest/fastest to highest cognitive analysis:
1. **Step 1 (Deterministic Python - Layers 4 & 5):**
   - Computes *Volume Profile (POC)* and *ATR-14*.
   - Filters out stocks with illiquid bid-ask spreads.
2. **Step 2 (Fast Wyckoff Screening by Tariq - Layer 1):**
   - Assesses market phase.
   - If chart is in *Distribution* or *Markdown*, candidate is **REJECTED IMMEDIATELY** (*Fail-Fast*).
3. **Step 3 (Elliott Wave & SMC In-Depth Analysis - Layers 2 & 3):**
   - Only **top 3 to 5 candidates** passing Step 2 undergo motive wave analysis (identifying Wave 3 start, avoiding Wave 5).
   - Determines sniper entry levels (Fair Value Gap / Order Block zones).

#### C. Nawwar Specifications (Sentiment & Macro Intelligence) & Full JSON Schema

1. **News Catalysts & SEC Filings:**
   - Evaluates Form 8-K (material events: FDA approval, AI partnership, high-value contracts).
   - Evaluates Form 4 (insider buying) and Form 10-Q/K.
   - **Mandatory Earnings Gate:** Rejects candidate if earnings report date is within < 48 hours to prevent earnings gap risk.

2. **Quantitative Sentiment Scoring ($S_{sent}$):**
   - Score range: **-100 (Extreme Panic / Risk) to +100 (Strongly Bullish / High Catalyst)**.
   - Entry Threshold: Only candidates with $S_{sent} \ge +60$ qualify for portfolio consideration.

3. **Macro Calendar Gatekeeper:**
   - Tracks high-impact US economic events (Fed FOMC, CPI, NFP).
   - Blocks opening new positions 30 minutes before and after high-impact macro announcements.

4. **Active Breaking News Sentinel:**
   - Operates deterministically via negative keyword matching (*SEC investigation, fraud, CEO resignation, lawsuit*) on RSS feeds.
   - Calls LLM only when a keyword match is found to assess threat severity and emit `EMERGENCY_CATALYST_THREAT`.

5. **Full JSON Output Schema for Nawwar:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NawwarSentimentAnalysisOutput",
  "type": "object",
  "required": ["symbol", "sentiment_score", "sentiment_label", "macro_status", "earnings_gate", "key_catalysts", "threat_alerts", "timestamp"],
  "properties": {
    "symbol": { "type": "string" },
    "sentiment_score": { "type": "integer", "minimum": -100, "maximum": 100 },
    "sentiment_label": { "type": "string", "enum": ["EXTREME_BEARISH", "BEARISH", "NEUTRAL", "BULLISH", "STRONG_BULLISH"] },
    "macro_status": { 
      "type": "object",
      "required": ["macro_gate_clear", "upcoming_events"],
      "properties": {
        "macro_gate_clear": { "type": "boolean" },
        "upcoming_events": { "type": "array", "items": { "type": "string" } }
      }
    },
    "earnings_gate": {
      "type": "object",
      "required": ["is_safe", "next_earnings_date", "hours_to_earnings"],
      "properties": {
        "is_safe": { "type": "boolean" },
        "next_earnings_date": { "type": "string" },
        "hours_to_earnings": { "type": "number" }
      }
    },
    "sec_filings_signals": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "form_type": { "type": "string" },
          "description": { "type": "string" },
          "impact": { "type": "string", "enum": ["POSITIVE", "NEUTRAL", "NEGATIVE"] }
        }
      }
    },
    "key_catalysts": { "type": "array", "items": { "type": "string" } },
    "threat_alerts": { "type": "array", "items": { "type": "string" } },
    "timestamp": { "type": "string", "format": "date-time" }
  }
}
```

#### D. Dual-Focus Monitoring (Active Portfolio Watch)
Tariq and Nawwar continuously monitor active portfolio positions:
- **Day Trading Mode:** Periodic review every 15 minutes to detect intraday momentum shifts or micro-trend exhaustion.
- **Swing Trading Mode (Adaptive Top-Down Monitoring):** Structured reviews on 4H / Daily timeframes (3 times daily or on bar close), dynamically switching to 1-hour (1H) intervals when price approaches institutional interest zones, TP targets, or SL levels.

---

### 3.3. L2: Portfolio Lead, Strategy & Exit Management

`Haziq` synthesizes L1 analyses and generates structured order proposals:

#### A. Combined Thesis Scoring & Normalization (Resolution N2)
- **Score Normalization Before Synthesis:**
  - $S_{tech}$ is generated by Tariq on a **0 to +100** scale (0 = Weak/No Structure, 100 = Wyckoff + Wave 3 + FVG Confluence).
  - $S_{sent}$ is generated by Nawwar in range **-100 to +100**.
  - Before synthesis, $S_{sent}$ is normalized to 0–100 scale:
    $$S_{sent\_norm} = \frac{S_{sent} + 100}{2}$$
  - **Final Synthesis Scoring Formula:**
    $$S_{total} = (0.65 \times S_{tech}) + (0.35 \times S_{sent\_norm})$$
  - **Entry Approval Gates (Resolution N2 HOM-121):**
    - **Gate 1 (Nawwar L1 Initial Filter):** Nawwar rejects any candidate with sentiment score $S_{sent} < +60$ ($S_{sent\_norm} < 80$).
    - **Gate 2 (Haziq L2 Portfolio Synthesis):** Absolute threshold is $S_{total} \ge 65.0$, with minimum technical score $S_{tech} \ge 60.0$ and sentiment score $S_{sent\_norm} \ge 80.0$ ($S_{sent} \ge +60$). Candidates below threshold are rejected immediately.

#### B. Position Sizing (Fixed Fractional Risk) & Risk Alignment
$$RiskAmount = TotalEquity \times 0.015\ (1.5\%\ \text{risk per trade})$$
$$PerShareRisk = |EntryPrice - StopLossPrice|$$
$$\text{PositionSize (Shares)} = \min\left(\left\lfloor \frac{RiskAmount}{PerShareRisk} \right\rfloor,\ \left\lfloor \frac{0.20 \times TotalEquity}{EntryPrice} \right\rfloor\right)$$
- Maximum single-stock exposure does not exceed 20% of total portfolio equity.
- **Risk Alignment (Resolution N2 HOM-121):** $StopLossPrice$ in formula explicitly matches **Broker Hard Stop Loss** ($EntryPrice - 1.5 \times ATR_{14}$), ensuring $PerShareRisk = 1.5 \times ATR_{14}$ matches in planning and execution.

#### C. Exit Strategy Ownership Matrix
To eliminate ambiguous ownership, exit responsibilities are strictly separated:
- **Haziq (L2):** Defines **exit policies and formulas** during order proposal generation.
- **Danial (L3):** Confirms exit policy complies with Hard Rules.
- **Exit Sentinel Daemon (L4):** **SOLE EXECUTION OWNER.** Python daemon monitors market tick-by-tick and submits actual sell orders.

#### D. Definitive 4-Tier Exit Formula
1. **Tier 1 (Partial TP 50% & Risk-Free Shift):**
   - Target: $TP_1 = Entry + (1.5 \times |Entry - SL|)$ (based on 1:1.5 R:R).
   - When $TP_1$ is reached, Exit Sentinel sells 50% of shares and raises Stop Loss of remaining shares to **Break-Even ($Entry + \text{commissions}$)**.
2. **Tier 2 (Chandelier Trailing Exit):**
   - Remaining 50% shares governed by trailing formula: $TrailingStop = HighestHigh_{intraday} - (2.0 \times ATR_{14})$.
3. **Tier 3 (Early Exhaustion Exit / Emergency Threat Exit):**
   - Agents (Haziq, Tariq, Nawwar) **never submit sell orders directly to broker**.
   - They send a structured `EXIT_REQUEST` signal (with reason and position ID) to L4 Bridge endpoint (`/api/v1/trade/exit-request`) using `Authorization: Bearer <PAPERCLIP_BRIDGE_SECRET>`.
   - Exit Sentinel verifies token, cancels pending stop orders at broker, and closes position at market price.
4. **Tier 4 (Time-Based Day Trading Exit):**
   - Exactly at **15:45 America/New_York**, Exit Sentinel mandatorily closes all open Day Trading positions.

---

### 3.4. L3: Risk Gatekeeper, Compliance & Capital Protection Gate

**CRITICAL STRUCTURAL CHANGE:** Hard Rules enforcement is no longer delegated solely to LLM Danial. All 8 Hard Rules are encoded **deterministically in Python Bridge L4** as absolute enforcers. Danial acts as compliance auditor and audit trail logger.

#### List of 8 Deterministic Hard Rules & Full BVA Test Matrix (Resolution N3)
*Time Note: All time logic uses official New York market time: `America/New_York` (automatically handles EST/EDT transitions).*

1. **Max Risk per Trade:** Capital risk per trade $\le 2.0\%$ of current equity.
2. **Daily Drawdown Limit (Circuit Breaker):** Daily cumulative loss $\le 5.0\%$ of opening equity (opening baseline stored in `equity_baseline.sqlite` at 09:30:00 `America/New_York`).
3. **PDT Rule Guard:** For margin equity < USD 25,000, maximum **3 day trades in 5 rolling trading days**. 4th trade rejected hard.
4. **Penny Stock Filter:** Buy price must be $\ge \$5.00$.
5. **Order Size vs Liquidity:** Order size $\le 1.0\%$ of $ADV_{20}$.
6. **Entry Trading Hours Restriction:** New entry orders allowed only from 09:45:00 to 15:44:59 `America/New_York`. At 15:45:00, entry is blocked and Time-Exit mode is activated.
7. **Order Idempotency (Duplicate Prevention):** Each order carries `CltOrderID` based on UUID + Thesis Hash. Duplicate attempts rejected with HTTP 409 Conflict.
8. **Manual Kill Switch:** Endpoint `/api/v1/trade/kill-switch` cancels all active orders and triggers market sell for all holdings in $< 3$ seconds.

#### Boundary Value Analysis (BVA) Test Matrix for 8 Rules:
| No | Rule | Boundary Values Tested | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **R1** | Capital Risk (2.0%) | 1.99%, 2.00% vs 2.01% | 1.99% & 2.00% PASS; 2.01% REJECTED |
| **R2** | Daily Drawdown (5.0%) | 4.99%, 5.00% vs 5.01% | 4.99% & 5.00% PASS; 5.01% CIRCUIT BREAKER ACTIVE |
| **R3** | PDT Limit (< USD 25k) | 3rd Trade vs 4th Trade | 3rd Trade PASS; 4th Trade HARD REJECT |
| **R4** | Penny Stock Filter | USD 5.00 vs USD 4.99 | USD 5.00 PASS; USD 4.99 REJECTED |
| **R5** | Size vs ADV20 (1.0%) | 1.00% of ADV vs 1.01% | 1.00% PASS; 1.01% REJECTED |
| **R6a** | Early Entry Time | 09:44:59 vs 09:45:00 NY | 09:44:59 REJECTED; 09:45:00 PASS |
| **R6b** | Late Entry Time | 15:44:59 vs 15:45:00 NY | 15:44:59 PASS; 15:45:00 REJECTED |
| **R7** | CltOrderID Idempotency | New CltOrderID vs Duplicate CltOrderID | New PASS; Duplicate REJECTED (409) |
| **R8** | Kill Switch Latency | Trigger Kill Switch with 5 active positions | All orders cancelled + flat positions in < 3s |

---

### 3.5. L4: Broker Interface, Session Handling & Web Dashboard

#### A. Order Status Lifecycle, Broker Hard SL & Position Reconciliation (Resolution M1)

1. **Complete Order State Machine (Including Failure Handling):**
   ```text
   [SUBMITTED] ──(Rejected broker/risk)──> [REJECTED]
       │
   (Accepted OpenD)
       ▼
   [PENDING] ──(Cancelled user/timeout)──> [CANCELLED]
       │
   (Fill Execution)
       ├─────────────────────────────────> [PARTIAL_FILL] ──(Remaining fill expires)──┐
       │                                                                              │
       ▼                                                                              ▼
   [FILLED] ──> [SET_BROKER_HARD_SL] ──> [MONITORING_BY_SENTINEL]
                                               │
                                 ┌─────────────┴─────────────┐
                                 ▼                           ▼
                     [TP1_REACHED] (Sell 50%)        [EARLY_EXIT_SIGNAL] (Tariq/Nawwar)
                                 │                           │
                                 ▼                           ▼
                     [UPDATE_BROKER_SL_TO_BE]        [MARKET_CLOSE_SENTINEL]
                                 │                           │
                                 ▼                           ▼
                     [TRAILING_STOP_ACTIVE]          [POSITION_CLOSED]
                                 │
                                 ▼
                     [TRAILING_HIT_CLOSED] ──> [CANCEL_LEFTOVER_BROKER_ORDERS]
   ```

2. **Broker-Side Stop Protection (Broker Hard SL):**
   - OpenAPI `place_order` supports `STOP` / `STOP_LIMIT` order types.
   - **Failsafe Mechanism:** As soon as buy order is confirmed `FILLED`, Bridge **immediately registers Hard Stop Loss on Moomoo broker server** at maximum risk level ($Entry - 1.5 \times ATR$).
   - If Exit Sentinel, OpenD, or internet connection fails, capital remains **100% protected on Moomoo broker servers**.
   - Exit Sentinel modifies or replaces stop orders at broker when $TP_1$ is reached (to Break-Even) or as Trailing Stop ratchets up.

3. **Post-Restart Position Reconciliation Protocol:**
   - On startup of `mcp-bridge` / `exit-sentinel`, or after reconnect:
     a. Sentinel calls `position_list_query` to fetch actual broker positions.
     b. Sentinel calls `order_list_query` to check active/pending orders.
     c. Sentinel compares actual broker positions with local database (`positions_state.sqlite`).
     d. If open positions exist without Sentinel tracking records, system automatically re-hydrates position state and registers exit plans.
     e. Periodic reconciliation runs every **60 seconds** to verify zero drift between local records and broker account.

4. **Sentinel Heartbeat & Dead Man's Switch:**
   - Exit Sentinel sends heartbeat timestamp every 5 seconds to shared status store.
   - If no heartbeat is received for > 15 seconds, Bridge triggers critical dashboard alert and blocks new position openings.

5. **Differences: SIMULATE vs REAL Mode:**
   - *SIMULATE (Paper):* Orders are Good-for-Day, no pre/post-market support, no deals push.
   - *Gap Closing Test Plan:* Integration tests verify fill status using periodic polling `get_order_list` (2-second interval), ensuring identical code functions seamlessly when transitioning to REAL mode.

6. **Safe Mode Switching:**
   - Mode controlled via environment variable `MOOMOO_TRD_ENV=SIMULATE|REAL`.
   - `REAL` mode is locked and requires trading password injection through private Paperclip Secret, never plain-text configuration files.

#### B. OpenD Login, Logout & Account Switching
- **One OpenD Process = One Moomoo Account.**
- **Switch Trading Account (`acc_id`):** Executed directly via SDK calls without restarting container (e.g. switching between Paper Trading accounts 1 and 2).
- **OpenD Session Sign-Out Procedure (Resolution N7):**
  - Web Dashboard settings panel provides *Sign-Out OpenD Session* button.
  - When clicked, Bridge backend sends session termination Telnet command (`logout`) to OpenD Port 22222, closes active broker connections, and clears temporary session tokens in `opend_session_data`.
  - OpenD container restarts in controlled disconnected idle state until user initiates new login.
- **Switch Different Moomoo Login Account:** Requires Sign-Out procedure above, updating login configuration, and restarting OpenD container.
- **2FA OTP Flow:** Bridge backend provides Telnet Relay connecting OpenD port 22222 (via `stock_internal`) to Web Dashboard modal. User enters OTP code in web UI, and Bridge sends `input_phone_verify_code -code=XXXXXX` to OpenD.

#### C. Origin Security, Cloudflare JWT & Paperclip Agent Path (Resolution M2)

1. **Phased Hosting & Domains:**
   - Phases 1 to 3 (Sandbox/Testing): `https://stock-trader.beta.julietmike.net/` (complies with company sandbox standards).
   - Phase 4 (Live Production): `https://stock.julietmike.net` (only after explicit written approval from Jefri).

2. **Authentik JWT Verification (auth.julietmike.net) at Origin (Dashboard & Bridge):**
   - Inbound requests through Authentik (`auth.julietmike.net`) have cryptographic signatures verified via Cloudflare public certificates (`https://<team-domain>.cloudflareaccess.com/cdn-cgi/access/certs`).
   - Mandatory checks on `Cf-Access-Jwt-Assertion`:
     - Audience Tag (`aud`): Must match Authentik application AUD.
     - Issuer (`iss`): Must match `https://<team-domain>.cloudflareaccess.com`.
     - Expiration (`exp`) and local JWKS caching for 1 hour.
     - Missing or invalid header returns immediate HTTP 403 Forbidden.

3. **Bridge Security Controls (Port 8000) & Dual Access Paths (Resolution M2 HOM-121):**
   - **Restricted Exposure:** Port 8000 is **NOT exposed to public interfaces (0.0.0.0)**. Mapped exclusively to host loopback (`127.0.0.1:8000:8000`) and internal Docker network `stock_internal`.
   - **Path 1 — Web Dashboard to Bridge (`stock_internal`):**
     - Dashboard connects directly to `http://mcp-bridge:8000` via internal Docker DNS.
     - Every request must include internal header: `X-Service-Token: Bearer <BRIDGE_SERVICE_TOKEN>`.
   - **Path 2 — Paperclip Agents (Haziq, Danial, Tariq, Nawwar) to Bridge (Localhost Loopback):**
     - Paperclip agents running on host reach Bridge via `http://127.0.0.1:8000`.
     - Every request must include secret authorization header: `Authorization: Bearer <PAPERCLIP_BRIDGE_SECRET>`.
     - Sensitive endpoints (`/api/v1/trade/submit`, `/api/v1/trade/kill-switch`) enforce `PAPERCLIP_BRIDGE_SECRET`. Unauthorized requests return HTTP 401 Unauthorized or 403 Forbidden.

---

### 3.6. Token Cost Estimates & System Efficiency (Token & Latency Budget)

| Component | Role | Model / Engine | Estimated Frequency | Daily Token Cost | Latency |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **L0 Screener** | Market Scan & POC | Python Math | Every 5 minutes | **0 Tokens ($0.00)** | ~0.05 sec |
| **L1 Tariq** | Wyckoff & Wave Phase | Claude 3.5 Sonnet | 3-5 candidates, 4x daily | ~12,000 tokens (~$0.04) | ~4-6 sec |
| **L1 Nawwar** | Catalysts & Calendar | Gemini 1.5 Flash | 5 candidates, 4x daily | ~8,000 tokens (~$0.002) | ~1-2 sec |
| **L2 Haziq** | Thesis Synthesis | Claude 3.5 Sonnet | 2 proposals daily | ~4,000 tokens (~$0.015) | ~3-5 sec |
| **L3 Danial** | Audit Verification | Claude 3.5 Haiku | 2 audits daily | ~2,000 tokens (~$0.002) | ~1 sec |
| **L4 Sentinel** | Trailing Stop & Exit | Python Daemon | Every second | **0 Tokens ($0.00)** | < 0.01 sec |
| **TOTAL** | - | - | - | **~26,000 tokens (~$0.06/day)** | **High Efficiency & Speed** |

---

## 4. Testable Acceptance Criteria & Phased Roadmap

| Phase | Scope & Components | Measurable Acceptance Criteria | Approval Gate |
| :--- | :--- | :--- | :--- |
| **Phase 1: L0 Infra & Screener** | Docker Compose setup (OpenD Linux CLI, Screener V2, Bridge REST, Quota Tracker, & Recon Engine). | 1. `watchlist.json` generated every 300s $\pm$ 5s passing 100% JSON Schema validation.<br>2. 30-day K-line quota strictly controlled: new symbols added $\le 5$ symbols/day, K-line quota usage $\le 15$ symbols after 3 days.<br>3. Python Bridge BVA tests pass 100% test cases across all 8 capital safety rules (including 2.01%, 5.01%, USD 4.99, 4th PDT trade, and 15:44:59 vs 15:45:00 boundaries).<br>4. Kill Switch test: `/kill-switch` cancels pending orders and closes positions in $< 3.0$ seconds.<br>5. Dual-Path Bridge Port 8000 Security: (a) Dashboard access without `X-Service-Token` rejected 401; (b) Paperclip Agent access on `127.0.0.1:8000` without `Authorization: Bearer <PAPERCLIP_BRIDGE_SECRET>` rejected 401/403; (c) External Dashboard access without valid `Cf-Access-Jwt-Assertion` rejected 403 at origin (0% leak).<br>6. OpenD Telnet Session test: Telnet logout on real OpenD terminates session completely and clears temporary tokens. | Code review pass & BVA test report signed off by Zahrin (QA). |
| **Phase 2: Analysis Agents & Exit Engine** | Prompts for Tariq, Nawwar, Haziq, MCP Tools registration, and Exit Sentinel logic. | 1. Tariq generates structured JSON technical evaluation with $S_{tech} \in [0, 100]$ in $\le 8.0$ seconds without parsing failures.<br>2. Nawwar rejects 100% simulated candidates with earnings $< 48$ hours or FOMC/CPI macro alerts.<br>3. $S_{sent\_norm}$ normalization and $S_{total}$ synthesis match mathematical formulas with 100% decimal accuracy.<br>4. Reconciliation test: Forced restart of Sentinel container with 2 active simulated positions re-hydrates state via `position_list_query` in $< 5.0$ seconds and re-establishes Hard SL. | Agent prompts & design approved by Jefri. |
| **Phase 3: Automated Paper Trading** | End-to-end automation on Moomoo Paper Trading account (`SIMULATE` mode). | 1. SIMULATE vs REAL gap closed: Fill status verified via periodic `get_order_list` (2-second polling) with detection lag $< 3$ seconds.<br>2. TP1 execution test: When price hits $TP_1$, Exit Sentinel sells exactly 50% quantity and moves broker stop order to Break-Even.<br>3. Time-Exit test: At 15:45:00 `America/New_York`, 100% open Day Trading positions closed before 15:46:00.<br>4. Dashboard displays real-time PnL and OpenD status metrics at `https://stock-trader.beta.julietmike.net/` behind Cloudflare SSO. | Performance metrics & risk compliance review signed off by Jefri. |
| **Phase 4: Live Account Activation** | Switch setting to `MOOMOO_TRD_ENV=REAL` with conservative starting capital. | 1. 100% PDT rule compliance (4th trade in 5 days hard blocked).<br>2. Trading password securely injected via Paperclip Secret without plain-text records in logs, commits, or comments.<br>3. Broker Hard Stop Loss confirmed active on broker server immediately after first fill on live account. | Explicit written approval by Jefri in task thread. |

---

## 5. Conclusion & Delivery

This Blueprint Version 3.5 Definitive (Authentik Integration) document resolves 100% of audit feedback from QA Zahrin (HOM-118, HOM-119, HOM-121, HOM-122, and HOM-123):
1. **Full Consolidation of 16 Items & Complete JSON Schemas:** All L0–L4 specifications, Docker Compose, multi-stage formulas, and official JSON schemas for Tariq & Nawwar are integrated into one coherent document.
2. **Quota Management & Official API:** Cloud screening via `get_stock_screen` V2 and 30-day quota tracking resolve Moomoo OpenAPI K-line limits realistically.
3. **Failsafe Broker Hard Stop & Reconciliation:** Immediate registration of Hard SL on Moomoo broker server protects capital 100% during container outages, supported by 60-second reconciliation and 5-second Sentinel heartbeat.
4. **Dual-Path Security Architecture:** Bridge Port 8000 is restricted to host loopback `127.0.0.1:8000` with `PAPERCLIP_BRIDGE_SECRET` protection for Paperclip agents, while Web Dashboard is protected by Authentik JWT verification at origin and internal service tokens.
5. **Standardized Formatting & Measurable Criteria:** Clean LaTeX formulas without control character corruption, complete BVA test matrix for 8 rules, and measurable acceptance criteria for each phase.

Published in task document **`blueprint-option-a` (Version 3.5 Definitive (Authentik Integration))** for final QA sign-off by Zahrin and official approval by Jefri.

---

## Addendum v3.8: UI Design & Data Integrity MEMO (Jefri Directive 2026-11-16)

1. **UI Design MEMO (No Cliché Labels)**:
   - FORBIDDEN to add cliché labels, redundant explanatory cards, or decorative text without operational utility (e.g. theoretical position sizing cards, repetitive agent explanations, or confusing stacked L1/L2/L3 badges).
   - UI must remain clean, dense, utilitarian, and focused directly on user actions and operational metrics.

2. **Data Integrity & Agent Visualization MEMO (Mandatory Real Data)**:
   - Mandatory use of REAL DATA from pipeline (`watchlist.json` / broker). FORBIDDEN to use mocked candidate lists disconnected from active watchlist.
   - Remove unnecessary internal technical labels (such as `(L1_TECHNICAL)`, `(L4_DISPATCH)` on candidate chips).
   - Agent activity page (`#/agents`) must show exact count of passing candidates (e.g. `Passing Candidates: X / Y`) with clear color-coding: Green (*Success*) for passed candidates and Neutral/Muted for rejected candidates.

---

## 6. Paperclip Agent Architecture & Orchestration L1–L4 (Phase 3 Definitive - HOM-317)

### 6.1 Real Agent Model Mapping in Paperclip (Zero Claude)
Per requester (Jefri) directive, the system uses 100% Google Gemini models configured in Paperclip with zero Claude dependencies:

| Agent | Role | Paperclip Agent ID | Adapter | Current Official Model | Responsibilities |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trade: Tariq** | L1 Technical Analyst | `9c686b86-0a97-46ae-9705-edb8840a5440` | Antigravity | `gemini-4-hydrogen-medium` | Wyckoff phase, 60-day candlestick charts via Moomoo (`get_history_kline` / `get_cur_kline_with_sub`), support/resistance levels, $S_{tech}$ score |
| **Trade: Nawwar** | L1 Sentiment Scout | `82e5a99e-368c-4f5f-b18d-b5ecaafbc40f` | Antigravity | `gemini-3.8-flash-medium` | Moomoo news sentiment (`get_news_for_symbol`), earnings gate check (< 5 days) (`get_earnings_calendar`), $S_{sent}$ score |
| **Trade: Haziq** | L2 Portfolio Lead / Trader | `612c7171-d5f1-405b-9be3-aca66e24b7db` | Antigravity | `gemini-4-hydrogen-medium` | Synthesizes $S_{total} = 0.65 S_{tech} + 0.35 S_{sent\_norm}$, top ranking selection, 1.5% capital position sizing, SL & TP targets |
| **Trade: Danial** | L3 Risk & Execution Officer | `bcbd0bd4-b10b-4000-b0a7-c21fc6147336` | Antigravity | `gemini-3.8-flash-medium` | Strict audit of 10 Hard Rules (including Pause Buying), order dispatch to Bridge Port 8000 |

### 6.2 Wake Chain Mechanism
```text
+------------------------------------------------------------------------+
| L0 Screener (Python Daemon)                                            |
| Generates top 3-5 candidates (Momentum & Setup lanes)                  |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Woken by Screener Event)
+------------------------------------------------------------------------+
| Bridge Dispatcher Service (bridge/src/paperclip_dispatcher.py)         |
| Triggers parallel Paperclip wake for Tariq & Nawwar                    |
+-------------------+--------------------------------+-------------------+
                    |                                |
                    v (Wake L1A)                     v (Wake L1B)
+--------------------------------------+ +-------------------------------+
| L1 Tariq (Technical Analyst)         | | L1 Nawwar (Sentiment Scout)   |
| - Model: gemini-4-hydrogen-medium    | | - Model: gemini-3.8-flash-med |
| - Wyckoff & K-Line Analysis          | | - Check Earnings & Macro Gate |
| - Returns S_tech [0, 100]            | | - Returns S_sent              |
+-------------------+------------------+ +---------------+---------------+
                    |                                |
                    +----------------+---------------+
                                     | (Both L1 complete)
                                     v (WAKE HAZIQ by Bridge Dispatcher)
+------------------------------------------------------------------------+
| L2 Haziq (Portfolio Lead / Trader)                                     |
| - Model: gemini-4-hydrogen-medium                                      |
| - Synthesizes S_total, selects top ranking, position sizing, SL & TP   |
+-----------------------------------+------------------------------------+
                                    |
                                    v (WAKE DANIAL by Haziq)
+------------------------------------------------------------------------+
| L3 Danial (Risk & Compliance Officer)                                  |
| - Model: gemini-3.8-flash-medium                                       |
| - Strict audit of 10 Hard Rules (including Pause Buying)               |
| - If Passed: Danial submits order to Bridge Port 8000 via loopback     |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Order Execution)
+------------------------------------------------------------------------+
| L4 Broker Execution (Moomoo OpenD)                                     |
| Executes order in Paper Trading account (TrdEnv.SIMULATE)              |
+------------------------------------------------------------------------+
```

### 6.3 Danial's 10 Safety Hard Rules (L3 Gatekeeper)
1. Capital risk limit per transaction: Maximum 2% of account equity.
2. Daily drawdown limit: Maximum 5% capital loss in a day.
3. Penny stock filter: Stock price must be $\ge \$5.00$.
4. Market liquidity limit: Purchase quantity $\le 1\%$ of average daily volume ($ADV_{20}$).
5. Market trading hours: Operates only during regular US market trading hours (09:45 - 15:45 New York time).
6. Duplicate position prevention: Rejects purchase if stock already has an open position.
7. Earnings gate restriction: Rejects candidate if earnings announcement date is within 5 days.
8. Broker connection health: Verifies Moomoo OpenD session is connected and healthy.
9. Trading environment mode: Must be simulation mode (`TrdEnv.SIMULATE`).
10. Pause Buying control: When `pause_buying = True`, Danial immediately rejects all new BUY orders, while Tariq skips OpenAPI K-line calls to save 30-day quota.

### 6.4 Dashboard & UI (React MUI SPA)
1. **Portfolio Page (`#/portfolio`)**: Displays capital summary, cash, net PnL, and active holdings with bought price and current price.
2. **Pause Buying Toggle**: Allows operator to pause new purchases directly from dashboard.
3. **Notifications & Countdown**: Automated countdown timer showing scheduled time for next L0 scan.

---

## 7. Trading Modes Architecture (Day Trading vs Swing Trading)

**Task Reference:** HOM-319, HOM-320 (Parent: HOM-47, HOM-114)  
**Status:** Multi-Mode Trading Architecture  
**Architect / Software Lead:** Fakhri & Hakeem  
**Independent Reviewer / QA Gatekeeper:** Zahrin  

---

### 7.1 Comparison & Suitability Analysis of 4 Trading Styles

To assess market compatibility with Paperclip agent workflows and Moomoo OpenAPI, an evaluation of 4 primary trading styles was conducted:

| Assessment Dimension | 1. Scalping | 2. Day Trading (Intraday) | 3. Swing Trading (Multi-Day) | 4. Position Trading (Investing) |
| :--- | :--- | :--- | :--- | :--- |
| **Holding Horizon** | Few seconds to few minutes | Few minutes to hours (Closed before 15:45 NY) | Few days to few weeks | Several weeks to months/years |
| **K-line Timeframe** | Sub-minute (10s, 30s, 1M) | Minutes (1M, 5M, 15M) | 4H / Daily (D1) with adaptive 1-Hour (1H) trigger | Weekly and Monthly |
| **Paperclip AI Latency** | **UNSUITABLE**<br>Paperclip LLM latency (1–5 sec/agent) too slow for fast order book moves. | **SUITABLE (Default)**<br>5-minute L0 interval provides sufficient time for Tariq/Nawwar/Haziq analysis. | **HIGHLY SUITABLE (Full Support)**<br>4H/Daily structure free from second-level latency pressure; adaptive 1H trigger provides ample analysis time. | **POSSIBLE BUT INEFFICIENT**<br>Trading cycle too slow for active autonomous agent system. |
| **Moomoo OpenAPI Quota** | **EXHAUSTED / FAILS**<br>Exceeds 10 req/s rate limit and consumes real-time quote quota immediately. | **MODERATE / CONTROLLED**<br>Managed via 100-symbol rolling 30-day K-line quota and cloud `get_stock_screen` V2. | **HIGHLY CONSERVATIVE (>75% Savings)**<br>Periodic 4H/Daily macro checks with adaptive 1H activation only near action zones (max 3–5 active symbols). | **MINIMAL**<br>Near-zero K-line quota usage since reviews run weekly. |
| **Token Usage & LLM Cost** | Very High ($5.00–$20.00/day) | Low–Moderate (~$0.06/day per Table 3.5) | Very Low (~$0.015–$0.025/day; periodic 4H/Daily scans with targeted 1H checks) | Very Low (<$0.005/day) |
| **PDT Rule (FINRA) Impact** | **CRITICAL**<br>Strictly bound by PDT rule (max 3 day trades in 5 rolling days if equity < $25k). | **BOUND**<br>Must be enforced by Danial Hard Rule (#5) for accounts under $25,000. | **PDT FREE**<br>Overnight holds closed on different trading days do not count as day trades. | **PDT FREE**<br>Zero PDT constraint issues. |
| **Overnight Gap Risk** | **ZERO**<br>No overnight holdings. | **ZERO**<br>Fully closed before 15:45 NY. | **EXISTS (Requires Mitigation)**<br>Exposed to pre-market gaps from overnight news. | **HIGH**<br>Exposed to macroeconomic cycles and earnings volatility. |
| **Architectural Compatibility** | **STRICTLY REJECTED**<br>Not supported by Paperclip + Moomoo architecture. | **SUPPORTED (MODE: DAY)**<br>Standard active intraday mode. | **SUPPORTED (MODE: SWING)**<br>Highly efficient, economical mode via adaptive top-down monitoring. | **OUT OF SCOPE**<br>Not optimized for active trading agents. |

---

### 7.2 Swing Trading Architecture & Implementation Details

Swing Trading mode (`TRADING_MODE=SWING`) captures multi-day trend swings (3–10 days) by leveraging higher timeframe technical stability, eliminating intraday noise, and minimizing API costs via **Adaptive Top-Down Multi-Timeframe Monitoring (4H/Daily -> 1H)**:

```text
+------------------------------------------------------------------------+
| 1. L0 Screener (Multi-Day Screening & Zone of Interest Detection)      |
|    - 4H / Daily Macro Structure: 20-EMA breakout, volume surge 50-SMA  |
|    - Scan loop: Baseline schedule (09:00, 13:00, 16:30 NY)             |
|    - Zone of Interest: Flags candidates near S/R / Order Blocks        |
+-----------------------------------+------------------------------------+
                                    |
                                    v (4H/Daily Structure Candidates)
+------------------------------------------------------------------------+
| 2. L1 Dual-Agent Analysis (Top-Down 4H/Daily & Adaptive 1H Trigger)    |
|    - Tariq (Technical): Wyckoff & SMC 4H/Daily; 1H Trigger in zone     |
|    - Nawwar (Sentiment): Earnings Gate (< 14 days) & Macro Radar       |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Thesis S_total & Position Sizing)
+------------------------------------------------------------------------+
| 3. L2 Haziq (Swing Trade Planning)                                     |
|    - Capital risk size reduced to 1.0% (Mitigates overnight gap risk)  |
|    - Target R:R expanded (Minimum 1:3; precise SL at 1.5x 1H ATR)      |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Compliance Audit & Protection Limits)
+------------------------------------------------------------------------+
| 4. L3 Danial (Protection Limits Compliance)                            |
|    - Exempts 15:45 NY Time-Exit (Permits overnight holding)            |
|    - Confirms Good-Til-Cancelled orders (TimeInForce.GTC)              |
+-----------------------------------+------------------------------------+
                                    |
                                    v (GTC Order Execution & Monitoring)
+------------------------------------------------------------------------+
| 5. L4 Broker & Exit Sentinel (Continuous Adaptive Monitoring)          |
|    - GTC Hard Stop Loss placed directly on Moomoo broker server        |
|    - 4H/Daily bar-close Trailing Stop + adaptive 1H tightening         |
+------------------------------------------------------------------------+
```

#### 1. Timeframe & Technical Analysis L1 (Tariq): Adaptive Top-Down Approach
- **Adaptive Top-Down Multi-Timeframe Monitoring:**
  - **Top-Down Structure (4H / Daily):**
    - Determines macro trend direction, major Wyckoff accumulation/distribution phases, and institutional S/R zones (SMC Order Blocks, Fair Value Gaps).
    - Minimizes false breakouts and intraday noise while conserving K-line quota.
  - **Adaptive 1H Trigger (Precision Entry & Exit):**
    - When price approaches a Level of Interest (SMC Order Block) on 4H chart, system adaptively switches to 1-hour interval (`KLType.K_60M`).
    - 1H timeframe enables faster entry trigger confirmation (Change of Character / CHoCH), tighter Stop Loss ($1.5 \times ATR_{1H}$) for optimized R:R, and early detection of reversal exhaustion.
- **K-line Quota Management & Dynamic Subscription:**
  - Tariq calls `get_cur_kline_with_sub` for `KLType.K_DAY` and `KLType.K_60M`.
  - 1H K-line calls are activated adaptively and restricted to active candidates in interest zones (max 3–5 symbols concurrently) to protect 100-symbol rolling 30-day quota.
  - 1H subscription is unsubscribed as soon as candidate moves out of action zone or order is filled/cancelled.

#### 2. Catalyst & Calendar Filtering L1 (Nawwar)
- **14-Day Earnings Gate Rule:**
  - Under Day Trading, earnings gate is set to < 5 days.
  - Under Swing Trading, candidate is rejected if earnings date falls within **14 days** of entry (`days_to_earnings < 14`).
  - Prevents multi-day holdings from getting trapped in overnight gap volatility.
- **Sentiment & Macro News Checks:**
  - Nawwar inspects FOMC meetings, CPI/PPI releases, and high-impact sector news across a 7–14 day horizon.

#### 3. Adaptive Wake & Screening Loop
Unlike Day Trading which scans every 300 seconds (5 minutes) during market hours, Swing Trading combines scheduled macro reviews with conditional adaptive monitoring:
- **Baseline Structure Loop (4H / Daily):**
  - **09:00 NY (Pre-Market Sync):** Checks pre-market pricing, verifies overnight position integrity, reviews breaking news alerts.
  - **13:00 NY (Mid-Day 4H Bar Close):** Evaluates first 4H bar close, checks volume momentum, updates candidates nearing action zones.
  - **16:30 NY (Post-Market Daily Bar Close):** Runs end-of-day reconciliation, recalculates Chandelier Trailing Stop off daily close, updates portfolio database.
- **Adaptive 1H Precision Trigger Loop:**
  - Dynamically activated ONLY for active portfolio holdings or radar candidates within price tolerance ($\le 1.0 \times ATR$ from Order Block or target).
  - Operates on each market 1-hour bar close (10:30, 11:30, 12:30, 13:30, 14:30, 15:30 NY).
  - Reverts to baseline 4H/Daily schedule automatically if price moves out of action zone.
- **Volatility Alert Trigger:**
  - If unexpected price movement $> 2.5 \times ATR$ occurs, Exit Sentinel triggers immediate agent wake without waiting for next scheduled hourly bar close.

#### 4. Order Management & Protection Limits (GTC vs Good-For-Day)
- **Transition to GTC (Good-Til-Cancelled) Orders:**
  - Moomoo OpenAPI order parameter switches from `time_in_force = TimeInForce.DAY` to `time_in_force = TimeInForce.GTC`.
  - Limit entry orders and Hard Stop Loss orders remain active on Moomoo server across trading sessions until filled or explicitly cancelled.
- **Mandatory Exemption from 15:45 NY Time-Exit:**
  - Danial Hard Rule #5 adjusts dynamically: 15:45 NY close order is active only when `TRADING_MODE=DAY`. When `TRADING_MODE=SWING`, positions are held overnight.
- **Overnight Gap Risk Mitigation:**
  - **Reduced Capital Risk Sizing:** Maximum risk per transaction reduced from 1.5%–2.0% (Day) to **maximum 1.0% of account equity** (Swing).
  - **Mandatory Broker Hard SL:** Exit Sentinel ensures filled buy orders are immediately followed by GTC Stop Loss orders on Moomoo broker server to guard against severe gap-down opens.

---

### 7.3 `TRADING_MODE` Configuration Toggle (DAY | SWING)

System supports operational mode switching via a single environment variable without changing underlying code:

```bash
# Configuration in .env or Docker Environment
TRADING_MODE=DAY      # Options: DAY (Default Intraday) | SWING (Multi-Day Swing)
```

#### System Behavior Difference Matrix by Layer (L0 -> L4)

| System Layer | Parameter / Component | DAY Mode (`TRADING_MODE=DAY`) | SWING Mode (`TRADING_MODE=SWING`) |
| :--- | :--- | :--- | :--- |
| **L0 Screener** | Scan Frequency | Every 300 seconds (5 minutes) | Baseline 4H / Daily; Adaptive 1H scan for active interest zones |
| | Screening Criteria | 5M Momentum, Intraday RVOL, Session Range | 4H/Daily structure (20-EMA, 50-SMA) + Institutional Zones of Interest |
| **L1 Tariq** | Moomoo K-line Types | `KLType.K_5M`, `KLType.K_15M` | `KLType.K_DAY`, `KLType.K_60M` (Adaptive trigger in action zone) |
| | Wyckoff Horizon | Intraday Accumulation/Spring Phase | Top-Down: 4H/Daily macro structure + precise 1H CHoCH |
| **L1 Nawwar** | Earnings Date Restriction | `days_to_earnings < 5` days | `days_to_earnings < 14` days |
| | Sentiment Analysis Scope | 24-hour news sentiment & daily calendar | 14-day industry trends & FOMC/CPI macro schedules |
| **L2 Haziq** | Risk:Reward (R:R) Ratio | Minimum 1:2 | Minimum 1:3 (Precise SL based on 1H ATR) |
| | Capital Risk Limit | 1.5% of account equity | 1.0% of account equity (Conservative) |
| **L3 Danial** | PDT Limit Checks | Strictly enforced (Max 3 trades if < $25k) | Exempt for positions held > 1 business day |
| | Time-Exit Enforcement | **Mandatory Active** (Close all positions at 15:45 NY) | **Disabled** (Permits overnight holding) |
| | Parameter `time_in_force` | `TimeInForce.DAY` | `TimeInForce.GTC` |
| **L4 Sentinel** | Trailing Stop Logic | Intraday Chandelier Trailing (Tick-by-tick) | Daily/4H Bar-Close Trailing + adaptive 1H tightening |
| | Order Reconciliation | Cancels unfilled orders at 16:00 NY | Keeps GTC orders active across days |
| **Dashboard UI** | Status Bar Badge | Badge `[MODE: DAY (INTRADAY)]` | Badge `[MODE: SWING (MULTI-DAY)]` |
| | Monitoring Tab | 5-minute countdown to next scan | Adaptive top-down status (4H baseline & 1H radar) |
