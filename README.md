# US Stock Analyst & Trader (STOCK-TRADER)

Sistem saringan pasaran saham AS (L0 Screener), jambatan komunikasi ejen (MCP Bridge), dan papan pemuka operasi (Operations Dashboard) yang berintegrasi dengan broker Moomoo OpenAPI.

---

## 1. Senibina Sistem (Architecture Overview)

Sistem ini terdiri daripada beberapa komponen teras yang diorkestrasikan melalui Docker Compose:

1. **Moomoo OpenD Gateway (`moomoo-opend`)**:
   - Kontena `stock_moomoo_opend` mengendalikan sambungan gateway broker Moomoo OpenAPI (protokol binari port 11111 dan telnet port 22222).
   - Diasingkan sepenuhnya dalam rangkaian dalaman `stock_network` tanpa pendedahan port ke hos awam.

2. **L0 Screener Daemon (`screener-daemon`)**:
   - Kontena `stock_screener_daemon` yang menjalankan enjin Python saringan saham automatik (Dual-Lane: MOMENTUM dan SETUP).
   - Dilengkapi penjejak kuota keras broker Moomoo OpenAPI (`quota_tracker.py` - had 100 simbol / 30 hari rolling window).
   - Menyokong bacaan dinamik (*hot-read*) had konfigurasi saringan daripada pangkalan data SQLite WAL (`screener_config.sqlite`).

3. **MCP Bridge (`mcp-bridge`)**:
   - Kontena `stock_mcp_bridge` (FastAPI / FastMCP) menyediakan antara muka integrasi dan alatan analisis untuk pasukan ejen (Tariq, Nawwar, Haziq, Danial).
   - Terikat secara eksklusif ke gelung balik hos (`127.0.0.1:8005`) untuk komunikasi selamat ejen Paperclip.

4. **Trading Dashboard (`trading-dashboard`)**:
   - Papan pemuka visual berasaskan React, Vite, dan Express.js untuk pemantauan sebut harga masa nyata, status kuota, watchlist, dan konfigurasi had saringan L0.

---

## 2. Persekitaran Pengeluaran vs Beta (Environment Topology)

Sistem ini mematuhi dasar pengasingan ketat antara persekitaran Pengeluaran (Production) dan Pengujian Beta (Beta Testing):

### 2.1 Persekitaran Pengeluaran (Production)
- **Subdomain Rasmi**: `https://trade.julietmike.net/`
- **Kontena Aplikasi**: `stock_trading_dashboard` (port 3000)
- **Kawalan Akses / Autentikasi**: Dilindungi oleh **Authentik SSO Outpost** (`auth.julietmike.net`). Pengguna diwajibkan melalui aliran pengesahan identiti korporat sebelum dibenarkan mencapai papan pemuka.
- **Routing NPM**: Proxy Host 23 (Sijil Let's Encrypt `trade.julietmike.net`, Force SSL, HTTP/2).

### 2.2 Persekitaran Pengujian Beta (Beta Testing)
- **Subdomain Rasmi**: `https://stock-trader.beta.julietmike.net/`
- **Kontena Khusus Beta**:
  - Servis `trading-dashboard-beta` ditambah ke `docker-compose.yml` (`container_name: stock_trading_dashboard_beta`).
  - Beroperasi pada rangkaian `stock_network` dan `npm_default`.
  - Ditetapkan pembolehubah `DISABLE_AUTHENTIK_AUTH=true` bagi melumpuhkan semakan Authentik SSO Outpost khusus untuk beta supaya tidak mengganggu pengujian atau bertembung dengan routing pengeluaran.
- **Routing NPM**: Proxy Host 26 (Sijil Let's Encrypt `*.beta.julietmike.net`, Force SSL, HTTP/2, WebSocket Upgrade aktif). Dikonfigurasikan untuk memproksi terus (`proxy_pass`) ke kontena `stock_trading_dashboard_beta:3000` tanpa alihan 302.

---

## 3. Menjalankan Perkhidmatan (Docker Compose)

### Menjalankan Persekitaran Pengeluaran:
```bash
docker compose up -d moomoo-opend screener-daemon mcp-bridge trading-dashboard
```

### Menjalankan Persekitaran Beta untuk Pengujian:
```bash
docker compose up -d --build trading-dashboard-beta
```

---

## 4. Konfigurasi Saringan Saham L0 (Screener Config)

Konfigurasi parameter saringan L0 disimpan secara dinamik dalam `shared_data/screener_config.sqlite` (mod WAL):
- `min_price`: Had harga minimum kaunter (had sempadan: $1.00 hingga $10,000.00).
- `min_market_cap`: Permodalan pasaran minimum (lalai: $1B).
- `min_volume`: Volum dagangan harian purata (ADV20).
- `min_rvol` & `max_rvol`: Julat Volum Relatif (RVOL).
- `max_candidates_per_lane`: Had maksimum calon yang diproses ke Stage 3 K-line enrichment bagi setiap lorong (julat sempadan sah: **1 hingga 20 kaunter**). Dikawal rapi bagi melindungi bajet kuota K-line Moomoo OpenAPI (100 simbol / 30 hari).

---

## 5. Pengujian & Jaminan Kualiti (QA)

- **Ujian Unit & BVA**:
  ```bash
  python3 -m pytest tests/test_max_candidates_lane_bva.py -v
  node dashboard/test_screener_config.js
  ```
- **Ujian E2E Playwright**:
  ```bash
  /paperclip/bin/pw-browser run dashboard/test_screener_settings_e2e.js
  ```
