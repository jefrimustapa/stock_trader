# Blueprint Seni Bina Pilihan A (L0 -> L4): US Stock Analyst & Trader (Versi 3.5 Definitif (Authentik Integration))

**Rujukan Tugasan:** HOM-114 (Induk: HOM-47, Audit QA: HOM-118, HOM-119, HOM-121, HOM-122, HOM-123)  
**Status:** Mod Penyelidikan & Perancangan (Research & Planning Sifar Kod)  
**Pemohon:** Jefri  
**Arkitek / Software Lead:** Hakeem  
**Penyemak Bebas / QA Gatekeeper:** Zahrin  

---

## 1. Ringkasan Eksekutif & Prinsip Seni Bina (Pilihan A)

Blueprint Versi 3.5 Definitif (Authentik Integration) ini menyatukan keseluruhan spesifikasi seni bina L0 hingga L4 ke dalam satu dokumen rasmi lengkap. Dokumen ini menyelesaikan 100% isu M1–M4 dan semakan audit QA Zahrin (HOM-118, HOM-119, HOM-121, HOM-122, dan HOM-123) tanpa sebarang percanggahan konfigurasi, isu keselamatan, atau kecacatan sintaks.

### Prinsip Teras Seni Bina:
1. **Decoupled & Deterministik-Dahulu (Python First):** 80% pemprosesan data berat, pengiraan volum, penapisan keselamatan, had risiko modal, dan loop eksekusi pantas diselesaikan oleh kod Python deterministik tanpa LLM. Ejen AI hanya dipanggil untuk taakulan kualitatif pada 3–5 kaunter terbaik.
2. **Pengurusan Kuota Realistik Moomoo OpenAPI:** Mematuhi had sebenar OpenAPI:
   - Kuota kuotasi masa nyata dikira per *(simbol $\times$ jenis data)*.
   - Kuota K-line sejarah dihadkan kepada 100 simbol unik per 30 hari bergolek.
   - Menggunakan API rasmi Moomoo `get_stock_screen` (Stock Screening V2, 244+ faktor di pelayan broker) untuk tapisan Universe awal tanpa menghabiskan kuota K-line tempatan.
3. **Penguatkuasaan Keselamatan L3 dalam Kod Bridge (Bukan Bergantung pada LLM):** Semua Hard Rules (2% risiko modal, 5% daily drawdown, sekatan penny stock, waktu pasaran, dan peraturan PDT) dikuatkuasakan secara mandatori dalam kod backend Python Bridge sebelum `place_order`. Ejen Danial bertindak sebagai pegawai audit dan pematuhan, bukan pintu veto tunggal.
4. **Pengurusan Exit Client-Side (Exit Sentinel Daemon):** OpenAPI tidak menyokong parameter Bracket/OCO secara natif. Logik Partial TP (50%), Break-Even Move, Chandelier Trailing Stop, dan Time-based exit diuruskan secara berdedikasi oleh **L4 Exit Sentinel Python Daemon**.
5. **Dwi-Fokus Ejen L1 (Discovery vs Active Portfolio Watch):** Ejen Tariq dan Nawwar meneliti calon baharu dari L0 (Discovery Loop) serta memantau saham aktif dalam pegangan (Active Position Watch) untuk mengesan amaran awal pembalikan arah atau berita kecemasan.
6. **Keselamatan Infrastruktur Berlapis (Defense-in-Depth):**
   - Authentik SSO (auth.julietmike.net / OIDC & Forward Auth).
   - Pengesahan token JWT (`Cf-Access-Jwt-Assertion`) di peringkat origin Dashboard/Bridge bagi menghalang pintasan rangkaian dalaman.
   - Pengasingan port & pengesahan berfokus: Port 11111/22222 OpenD terasing sepenuhnya dalam rangkaian dalaman `stock_internal` (tanpa terbitan ke hos). Web Dashboard mengesahkan JWT Authentik (auth.julietmike.net) di origin. Port 8000 Bridge diterbitkan khusus ke loopback hos sahaja (`127.0.0.1:8000`) dan dilindungi sepenuhnya oleh Shared Secret Token (`PAPERCLIP_BRIDGE_SECRET`) bagi capaian ejen Paperclip (Haziq, Danial, Tariq, Nawwar), manakala panggilan dalaman daripada Dashboard disahkan melalui `X-Service-Token`.

---

## 2. Gambaran Seni Bina End-to-End (L0 -> L4)

```text
                  ┌────────────────────────────────────────────────────────┐
                  │                 Pasaran Saham US Equities              │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L0: INFRASTRUKTUR & SCREENER DETERMINISTIK (Docker Stack)                                │
│  - Moomoo OpenD Daemon (Container 1: Headless Linux CLI, Port 11111/22222)              │
│  - Python L0 Screener (Container 2: get_stock_screen V2 + Quota Budget Manager)           │
│  - Output: /data/watchlist/us_active_watchlist.json (Top 10-20 kaunter)                  │
└───────────────────────┬──────────────────────────────────────┬───────────────────────────┘
                        │ Watchlist Baru (Discovery)           │ Data Posisi Semasa
                        ▼                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L1: LAPISAN KECERDASAN & ANALISIS (Dual-Focus Intelligence Agents - Paperclip)           │
│  - Tariq (Technical Analyst): Fail-Fast Confluence (Wyckoff + Wave + SMC + VPVR + ATR)   │
│    * Input: OHLCV JSON + Metrik Prakira Python (Bukan tangkapan skrin imej)              │
│    * Pipeline A: Kaji calon entri (3-5 kaunter terbaik)                                  │
│    * Pipeline B: Pantau kaunter aktif untuk tanda-tanda keletihan/reversal               │
│  - Nawwar (Sentiment Scout): 4-Teras Analisis (SEC EDGAR, Earnings Beat, Macro, Radar)   │
└───────────────────────┬──────────────────────────────────────┬───────────────────────────┘
                        │ Laporan Teknikal (JSON)              │ Laporan Sentimen (JSON)
                        └──────────────────────┬───────────────┘
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L2: KETUA STRATEGI & PORTFOLIO (Portfolio Lead - Paperclip)                              │
│  - Haziq: Sintesis tesis, pemarkahan (0-100), saiz modal Fractional Risk                 │
│  - Parameter Exit Policy: Menetapkan TP1, Trailing Offset, dan syarat pembatalan awal    │
└──────────────────────────────────────────────┬───────────────────────────────────────────┘
                                               │ Cadangan Pesanan (Order Proposal + Rules)
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L3: PENGAWAL RISIKO & PEMATUHAN (Risk Gatekeeper Agent + Hard Code Enforcer)            │
│  - Danial: Audit pematuhan tesis, semakan logik risiko, pendaftaran audit trail          │
└──────────────────────────────────────────────┬───────────────────────────────────────────┘
                                               │ Pesanan Diluluskan
                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ L4: ANTARA MUKA BROKER, ENJIN EXIT & DASHBOARD                                           │
│  - Python Bridge Enforcer: Semakan Hard Rules Mandatori (BVA 2% risk, 5% drawdown, PDT)  │
│  - Moomoo OpenAPI Execution: Normal/Limit Order + Idempotency Key (CltOrderID)           │
│  - Exit Sentinel Daemon (Python): Kitaran semakan status order, TP1 (50%), Trailing Stop,│
│    Break-Even shift, dan Time-Exit mandatori (15:45 America/New_York)                              │
│  - Web Dashboard Dedicated (FastAPI + React / Streamlit):                                │
│    * Authentik SSO (auth.julietmike.net) + Pengesahan JWT Assertion di Origin                      │
│    * Paparan PnL, Open Trades, Watchlist, Ejen Logs & Manual Kill Switch                 │
│    * Panel Sesi OpenD: Status, Tukar Akaun (acc_id), dan Relay OTP 2FA Telnet            │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Spesifikasi Terperinci Setiap Lapisan

### 3.1. L0: Infrastruktur, Pengurusan Kuota & Screener Deterministik

#### A. Spesifikasi Dockerfile & Docker Compose Stack
Memandangkan Moomoo tidak menyediakan imej Docker rasmi, sistem menggunakan **Dockerfile tersuai** berasaskan Debian/Ubuntu rasmi yang memuat turun binari OpenD Linux daripada portal rasmi Moomoo:

```dockerfile
# Dockerfile.opend
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y wget ca-certificates telnet netcat curl && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/opend
# Muat turun OpenD versi stabil Linux x86_64 berserta semakan integriti SHA256 (Penyelesaian P2 HOM-123)
ARG OPEND_VERSION=8.2.3708
ARG OPEND_SHA256
RUN test -n "$OPEND_SHA256" || (echo "RALAT KESELAMATAN: OPEND_SHA256 wajib dibekalkan semasa build Fasa 1!" && exit 1) \
    && wget -q https://software-file.moomoo.com/OpenD_${OPEND_VERSION}_Linux.tar.gz -O OpenD.tar.gz \
    && echo "${OPEND_SHA256}  OpenD.tar.gz" | sha256sum -c - \
    && tar -zxvf OpenD.tar.gz \
    && rm OpenD.tar.gz
EXPOSE 11111 22222
# PENTING (Pembetulan M3): -telnet_ip=0.0.0.0 dalam kontena supaya Bridge pada rangkaian stock_internal boleh capai port 22222 bagi relay OTP 2FA.
# Port 22222 TIDAK diterbitkan ke hos luar bagi mengelakkan capaian tidak sah dari luar kontena.
CMD ["./OpenD", "-api_ip=0.0.0.0", "-api_port=11111", "-telnet_ip=0.0.0.0", "-telnet_port=22222"]
```

Fail orkestrasi `docker-compose.yml`:
```yaml
version: '3.8'

services:
  moomoo-opend:
    build:
      context: ./opend
      dockerfile: Dockerfile.opend
    container_name: stock_moomoo_opend
    restart: unless-stopped
    # Port 11111 dan 22222 hanya didedahkan dalam rangkaian dalaman stock_internal (tiada terbitan ke hos).
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
    # PENTING (Penyelarasan M2 HOM-121): Diterbitkan HANYA ke loopback localhost hos (127.0.0.1)
    # untuk membolehkan ejen Paperclip (Haziq/Danial) berhubung dari luar Docker stack.
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

#### B. Topologi Pengasingan Kontena: Moomoo OpenD vs Trading Dashboard (Pemisahan Tanggungjawab & Keselamatan Berlapis)
Berdasarkan keputusan seni bina dan arahan Jefri, gateway broker Moomoo OpenD dan Trading Dashboard dijalankan di dalam **kontena yang berbeza (terpisah sepenuhnya)** mengikut prinsip keselamatan berlapis (*Defense-in-Depth*):

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Rangkaian Terasing Luaran (npm_default / Cloudflare Tunnel)             │
│   └── stock_trading_dashboard (Node.js Express, Port 3000)             │
│         - Web UI https://stock-trader.beta.julietmike.net/             │
│         - Dilindungi Authentik SSO & Forward Auth                      │
│         - Mengambil data melalui HTTP dalaman dengan X-Service-Token   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP Internal
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Rangkaian Terpencil Dalaman (stock_internal / stock_network)           │
│                                                                        │
│   ├── stock_mcp_bridge (Python FastAPI, Port 8000)                     │
│   │     - Menguatkuasakan 8 Hard Rules modal                           │
│   │     - Berhubung dengan OpenD API (11111) & Telnet CLI (22222)      │
│   │     - Menyalurkan status OpenD & baki akaun ke Dashboard           │
│   │                                                                    │
│   ├── stock_screener_daemon (Python Background Daemon)                 │
│   │     - Menarik data pasaran sebenar melalui OpenQuoteContext (11111)│
│   │     - Menulis senarai kaunter aktif ke /app/shared_data/watchlist  │
│   │                                                                    │
│   └── stock_moomoo_opend (Headless Linux CLI Daemon)                   │
│         - Binari rasmi Moomoo OpenD (Port 11111 API, Port 22222 Telnet)│
│         - Terpencil 100% daripada akses web awam                       │
│         - Volume persisten: opend_session_data -> /root/.com.moomoo... │
└────────────────────────────────────────────────────────────────────────┘
```

**Peranan 4 Kontena Berasingan:**
1. **`stock_moomoo_opend` (OpenD Daemon)**:
   - Kontena *headless Linux CLI* rasmi Moomoo.
   - Terpencil 100% dalam rangkaian dalaman `stock_internal` (tiada pendedahan port ke hos atau internet awam).
   - Menyimpan fail sesi dan token broker di Docker named volume `opend_session_data` (`/root/.com.moomoo.OpenD`).
2. **`stock_trading_dashboard` (Trading Dashboard)**:
   - Aplikasi web Node.js Express (port 3000) yang disambungkan ke rangkaian `npm_default` bagi capaian pengguna di `https://stock-trader.beta.julietmike.net/` di bawah perlindungan Authentik SSO.
   - Dashboard **tidak bercakap terus dengan OpenD**, sebaliknya mengambil metrik paparan status, persekitaran (`SIMULATE`), nombor akaun, dan baki tunai/ekuiti daripada `mcp-bridge` melalui HTTP dalaman dengan `X-Service-Token`.
3. **`stock_mcp_bridge` (REST Bridge)**:
   - Backend Python FastAPI yang menguatkuasakan 8 Hard Rules dan menguruskan perhubungan API (port 11111) serta Telnet CLI (port 22222) ke OpenD.
4. **`stock_screener_daemon` (Screener Daemon)**:
   - Daemon latar belakang Python yang menarik kaunter Universe daripada OpenD melalui kuota selamat dan menulis ke `watchlist.json`.

**Sebab & Kelebihan Pengasingan Kontena:**
1. **Keselamatan Berlapis (Defense-in-Depth)**: Sekiranya dashboard web diakses di internet, pengguna tiada sebarang laluan langsung ke port atau proses OpenD broker.
2. **Kemandirian Kitaran Hayat (Lifecycle Isolation)**: Mengemas kini kod dashboard atau merestart kontena dashboard tidak memutuskan sesi aktif OpenD. Sebaliknya, ujian restart OpenD untuk mengesahkan sesi kekal boleh dijalankan tanpa meranapkan Dashboard web.

#### C. Pengurusan Bajet Kuota Moomoo OpenAPI (Realiti vs Batasan)
1. **Penyelesaian Had K-line 30-Hari (100 Simbol Bergolek):**
   - L0 **DILARANG** memanggil `request_history_kline` untuk ribuan saham pasaran.
   - Sebaliknya, tapisan Stage 1 menggunakan **API Rasmi `get_stock_screen` (Stock Screening V2)**. Fungsi ini menghantar kriteria kuantitatif terus ke pelayan awan Moomoo, dan pelayan memulangkan senarai simbol yang telah siap ditapis tanpa menggunakan sebarang kuota K-line tempatan.
   - Panggilan `request_history_kline` **hanya dibenarkan untuk Top 10–20 kaunter** yang melepasi tapisan Stage 2.
   - Sistem merekod pangkalan data tempatan SQLite (`quota_tracker.db`) untuk menjejak baki kuota 100 simbol 30-hari dan memaparkannya di Dashboard.
2. **Pecahan Bajet Kuota Masa Nyata (Subscribed Data Quota):**
   - Had maksimum: 100 kuota serentak.
   - Strategi Langganan Berhemah: Setiap kaunter hanya melanggan `SubType.QUOTE` (1 unit) dan `SubType.K_15M` (1 unit) = 2 kuota per kaunter.
   - Untuk 15 kaunter aktif: $15 \times 2 = 30$ kuota terpakai (meninggalkan 70 kuota simpanan selamat bagi kaunter posisi aktif dan buffer sistem).

#### D. Formula Penapisan Multi-Stage
1. **Stage 1: Cloud Stock Screening (`get_stock_screen` V2):**
   - Harga Semasa ($P$): $P \ge \$5.00$
   - Permodalan Pasaran: $MarketCap \ge \$500\text{ M}$
   - Volum Harian Purata: $ADV_{20} \ge 1,000,000$ saham
   - Perubahan Harga Harian ($\Delta P\%$): $+2.0\% \le \Delta P \le +12.0\%$
2. **Stage 2: Relative Strength vs Benchmark (RS to SPY):**
   - Menghitung nisbah kekuatan relatif: $RS = \frac{\Delta P_{stock}}{\Delta P_{SPY}}$. Saham yang bertahan hijau ketika SPY merah diberikan keutamaan.
3. **Stage 3: Volume Spread & Squeeze Detection (Python Math):**
   - $RVOL \ge 2.0$ berbanding purata waktu sama.
   - Bollinger Band Squeeze (lebar band 20-period berada dalam persentil 20 terendah menandakan letusan volatiliti bakal bermula).

#### E. Struktur Data Watchlist (JSON Schema Rasmi)
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

### 3.2. L1: Lapisan Kecerdasan AI — Dwi-Fokus & Fail-Fast Confluence Stack

#### A. Format Input Tariq (Bukan Imej Carta)
Tariq menerima input berstruktur **OHLCV JSON berserta metrik prakira Python** (Support/Resistance, Squeeze, POC, ATR). Ini menjimatkan 90% kos token dan membolehkan ujian automasi unit dijalankan tanpa bergantung pada pemprosesan visi imej yang perlahan dan mahal.

#### B. Hierarki Pelaksanaan Fail-Fast 5-Lapisan
Urutan pelaksanaan diatur dari yang paling murah/pantas kepada analisis kognitif tinggi:
1. **Langkah 1 (Deterministik Python - Lapisan 4 & 5):**
   - Menghitung *Volume Profile (POC)* dan *ATR-14*.
   - Menapis keluar saham yang mempunyai jurang spread harga tidak wajar (*illiquid bid-ask spread*).
2. **Langkah 2 (Wyckoff Screening Cepat oleh Tariq - Lapisan 1):**
   - Menilai fasa pasaran. Jika carta berada dalam fasa *Distribution* atau *Markdown*, kaunter **DITOLAK SERTA-MERTA** (*Fail-Fast*).
3. **Langkah 3 (Elliott Wave & SMC In-Depth Analysis - Lapisan 2 & 3):**
   - Hanya **3 hingga 5 kaunter terbaik** yang melepasi Langkah 2 akan dianalisis gelombang motifnya (mencari permulaan Wave 3, mengelak Wave 5) dan paras masuk sniper (zon *Fair Value Gap / Order Block*).

#### C. Spesifikasi Nawwar (Sentiment & Macro Intelligence) & Skema JSON Penuh

1. **Katalis Berita & SEC Filings:**
   - Menyemak Form 8-K (peristiwa material: kelulusan FDA, perkongsian AI, kontrak bernilai tinggi), Form 4 (pembelian saham oleh orang dalam / *insider buying*), dan Form 10-Q/K.
   - **Gate Earnings Mandatori:** Menolak kaunter sekiranya tarikh laporan pendapatan dijadualkan dalam tempoh < 48 jam akan datang bagi mengelakkan kejutan jurang harga (*earnings gap risk*).

2. **Pemarkahan Sentimen Kuantitatif ($S_{sent}$):**
   - Skala markah: **-100 (Sangat Panik / Berisiko Ekstrem) hingga +100 (Sangat Bullish / Katalis Kuat)**.
   - Ambang Entri: Hanya kaunter dengan skor sentimen $S_{sent} \ge +60$ layak dipertimbangkan untuk portfolio.

3. **Pengawal Kalendar Makro (Macro Gatekeeper):**
   - Memantau kalendar peristiwa ekonomi berimpak tinggi US (Mesyuarat Kadar Faedah Fed / FOMC, CPI, NFP).
   - Menyekat pembukaan posisi baharu dalam tempoh 30 minit sebelum dan selepas pengumuman data makro berimpak tinggi.

4. **Radar Berita Tergempar (Active Breaking News Sentinel):**
   - Beroperasi secara deterministik melalui padanan kata kunci negatif (*SEC investigation, fraud, CEO resignation, lawsuit*) pada suapan berita RSS.
   - Panggilan LLM hanya dicetuskan apabila padanan berita ditemui bagi mengesahkan tahap ancaman dan menjana isyarat `EMERGENCY_CATALYST_THREAT`.

5. **Skema JSON Lengkap Output Nawwar:**
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

#### D. Pemantauan Dwi-Fokus (Active Portfolio Watch)
Tariq dan Nawwar mengulang semakan bagi setiap kaunter yang sedang dibuka posisinya dalam portfolio (setiap 15 minit untuk Day Trading, atau 4 jam untuk Swing Trading) bagi mengesan keletihan trend atau ancaman luar jangka.

---

### 3.3. L2: Ketua Portfolio, Strategi & Pengurusan Exit

`Haziq` bertanggungjawab menggabungkan analisis L1 dan mengeluarkan cadangan pesanan berstruktur:

#### A. Pemarkahan Tesis Gabungan & Normalisasi Markah (Penyelesaian N2)
- **Normalisasi Markah Sebelum Gabungan:**
  - $S_{tech}$ dijana oleh Tariq dalam skala **0 hingga +100** (0 = Lemah/Tiada Struktur, 100 = Konfluen Wyckoff + Wave 3 + FVG Sempurna).
  - $S_{sent}$ dijana oleh Nawwar dalam julat asal **-100 hingga +100**. Sebelum disintesis, $S_{sent}$ dinormalisasikan ke skala 0-100 menggunakan formula:
    $$S_{sent\_norm} = \frac{S_{sent} + 100}{2}$$
  - **Formula Sintesis Pemarkahan Akhir:**
    $$S_{total} = (0.65 \times S_{tech}) + (0.35 \times S_{sent\_norm})$$
  - **Penyelarasan Pagar Kelulusan Entri (Penyelesaian N2 HOM-121):**
    - **Pagar 1 (Saringan Awal Nawwar L1):** Nawwar menolak sebarang kaunter yang mempunyai skor sentimen $S_{sent} < +60$ (bersamaan nilai ternormal $S_{sent\_norm} < 80$). Hanya kaunter dengan sentimen positif kukuh dibawa ke mesyuarat portfolio Haziq.
    - **Pagar 2 (Sintesis Portfolio Haziq L2):** Ambang mutlak adalah $S_{total} \ge 65.0$, dengan syarat minimum teknikal $S_{tech} \ge 60.0$ dan sentimen $S_{sent\_norm} \ge 80.0$ (iaitu $S_{sent} \ge +60$). Mana-mana kaunter di bawah ambang ini ditolak serta-merta.

#### B. Penentuan Saiz Posisi (Fixed Fractional Risk) & Penyelarasan Risiko
$$RiskAmount = TotalEquity \times 0.015\ (1.5\%\ \text{risk per trade})$$
$$PerShareRisk = |EntryPrice - StopLossPrice|$$
$$\text{PositionSize (Shares)} = \min\left(\left\lfloor \frac{RiskAmount}{PerShareRisk} \right\rfloor,\ \left\lfloor \frac{0.20 \times TotalEquity}{EntryPrice} \right\rfloor\right)$$
- Maksimum pendedahan satu kaunter tidak melebihi 20% daripada jumlah ekuiti portfolio.
- **Penyelarasan Nilai Risiko (Penyelesaian N2 HOM-121):** Nilai $StopLossPrice$ dalam formula saiz posisi di atas adalah **sama dan selaras secara eksplisit** dengan $\text{Broker Hard Stop Loss}$ ($EntryPrice - 1.5 \times ATR_{14}$), memastikan nilai $PerShareRisk = 1.5 \times ATR_{14}$ tepat sama dalam perancangan risiko mahupun pelaksanaan broker.

#### C. Penyelarasan Pemilikan Exit Strategy (Exit Owner Matrix)
Untuk menghapuskan pertindihan pemilikan, tanggungjawab keluar posisi ditetapkan secara tegas:
- **Haziq (L2):** Menetapkan **polisi dan formula exit** semasa cadangan pesanan dijana.
- **Danial (L3):** Mengesahkan polisi exit mematuhi Hard Rules.
- **Exit Sentinel Daemon (L4):** **PEMILIK EKSEKUSI TUNGGAL.** Daemon Python ini memantau pasaran setiap saat dan menghantar pesanan jual sebenar.

#### D. Formula Exit 4-Tier Definitif
1. **Tier 1 (Partial TP 50% & Risk-Free Shift):**
   - Sasaran: $TP_1 = Entry + (1.5 \times |Entry - SL|)$ (Berasaskan nisbah R:R 1:1.5).
   - Apabila $TP_1$ tercapai, Exit Sentinel menjual 50% saham dan menaikkan Stop Loss baki saham ke **Break-Even ($Entry + komisen$)**.
2. **Tier 2 (Chandelier Trailing Exit):**
   - Baki 50% saham dikawal oleh formula trailing: $TrailingStop = HighestHigh_{intraday} - (2.0 \times ATR_{14})$.
3. **Tier 3 (Early Exhaustion Exit / Emergency Threat Exit):**
   - Selaras dengan prinsip pemilikan exit tunggal (Exit Sentinel sebagai eksekutif), Haziq, Tariq atau Nawwar **tidak menghantar pesanan jualan terus ke broker**.
   - Sebaliknya, mereka menghantar isyarat `EXIT_REQUEST` berstruktur (dengan alasan dan ID posisi) ke endpoint Bridge L4 (`/api/v1/trade/exit-request`) menggunakan token pengesahan rasmi `Authorization: Bearer <PAPERCLIP_BRIDGE_SECRET>`. Exit Sentinel yang menerima isyarat ini akan mengesahkan kesahihan token, membatalkan pesanan stop tertunda di broker, dan menutup posisi pada harga pasaran (*market exit*).
4. **Tier 4 (Time-Based Day Trading Exit):**
   - Tepat jam **15:45 America/New_York**, Exit Sentinel menutup mandatori semua posisi terbuka bagi mod Day Trading.

---

### 3.4. L3: Pengawal Risiko, Pematuhan & Pintu Keselamatan Modal

**PERUBAHAN STRUKTUR PENTING:** Kawalan Hard Rules tidak lagi diserahkan semata-mata kepada LLM Danial. Kesemua 8 Hard Rules dikodkan secara **deterministik dalam Python Bridge L4** sebagai penguatkuasa mutlak. Danial bertindak sebagai pegawai audit dan dokumentasi pematuhan.

#### Senarai 8 Hard Rules Deterministik & Matriks Ujian BVA Penuh (Penyelesaian N3)
*Nota Waktu: Seluruh logik waktu menggunakan zon waktu rasmi pasaran New York: `America/New_York` (menangani peralihan Daylight Saving Time EST/EDT secara automatik).*

1. **Maksimum Risiko per Dagangan:** Had risiko modal per dagangan $\le 2.0\%$ daripada ekuiti semasa.
2. **Daily Drawdown Limit (Circuit Breaker):** Kerugian terkumpul harian $\le 5.0\%$ daripada ekuiti pembukaan hari (nilai ekuiti pembukaan disimpan secara kekal dalam `equity_baseline.sqlite` tepat jam 09:30:00 `America/New_York`).
3. **Peraturan PDT (Pattern Day Trader Guard):** Untuk ekuiti margin < USD 25,000, maksimum **3 transaksi day trade dalam 5 hari dagangan bergolek**. Transaksi ke-4 ditolak terus.
4. **Penapisan Penny Stock:** Harga belian wajib $\ge \$5.00$.
5. **Had Saiz Pesanan vs Kecairan:** Saiz pesanan $\le 1.0\%$ daripada $ADV_{20}$ kaunter.
6. **Sekatan Waktu Dagangan Entri:** Pesanan entri baharu hanya dibenarkan dari jam 09:45:00 hingga 15:44:59 `America/New_York`. Tepat jam 15:45:00, entri disekat dan mod Time-Exit diaktifkan.
7. **Idempotensi Pesanan (Duplicate Prevention):** Setiap pesanan membawa `CltOrderID` berasaskan UUID + Hash Tesis. Percubaan menghantar pesanan sama ditolak dengan kod HTTP 409 Conflict.
8. **Manual Kill Switch:** Endpoint `/api/v1/trade/kill-switch` yang membatalkan semua pesanan aktif dan mencetuskan pesanan jualan pasaran bagi semua pegangan dalam masa $< 3$ saat.

#### Matriks Ujian Nilai Sempadan (BVA Test Matrix) untuk 8 Peraturan:
| No | Peraturan | Nilai Sempadan Diuji (Boundary Values) | Jangkaan Hasil |
| :--- | :--- | :--- | :--- |
| **R1** | Risiko Modal (2.0%) | 1.99%, 2.00% vs 2.01% | 1.99% & 2.00% LULUS; 2.01% DITOLAK |
| **R2** | Daily Drawdown (5.0%) | 4.99%, 5.00% vs 5.01% | 4.99% & 5.00% LULUS; 5.01% CIRCUIT BREAKER AKTIF |
| **R3** | Had PDT (< USD 25k) | Transaksi ke-3 vs Transaksi ke-4 | Transaksi ke-3 LULUS; Transaksi ke-4 DITOLAK KERAS |
| **R4** | Penny Stock Filter | USD 5.00 vs USD 4.99 | USD 5.00 LULUS; USD 4.99 DITOLAK |
| **R5** | Saiz vs ADV20 (1.0%) | 1.00% daripada ADV vs 1.01% | 1.00% LULUS; 1.01% DITOLAK |
| **R6a** | Waktu Entri Awal | 09:44:59 vs 09:45:00 NY | 09:44:59 DITOLAK; 09:45:00 LULUS |
| **R6b** | Waktu Entri Akhir | 15:44:59 vs 15:45:00 NY | 15:44:59 LULUS; 15:45:00 DITOLAK |
| **R7** | Idempotensi CltOrderID | CltOrderID Baru vs CltOrderID Berulang | Baru LULUS; Berulang DITOLAK (409) |
| **R8** | Kill Switch Latency | Pencetus Kill Switch semasa ada 5 posisi aktif | Semua pesanan batal + posisi rata dalam < 3s |

---

### 3.5. L4: Antara Muka Broker, Pengendalian Sesi & Web Dashboard

#### A. Kitaran Status Pesanan, Broker Hard SL & Rekonsiliasi Posisi (Penyelesaian M1)

1. **State Machine Kitaran Pesanan Lengkap (Termasuk Pengendalian Kegagalan):**
   ```text
   [SUBMITTED] ──(Ditolak broker/risk)──> [REJECTED]
       │
   (Diterima OpenD)
       ▼
   [PENDING] ──(Dibatalkan pengguna/timeout)──> [CANCELLED]
       │
   (Pelaksanaan Isian)
       ├─────────────────────────────────> [PARTIAL_FILL] ──(Isian baki tamat)──┐
       │                                                                        │
       ▼                                                                        ▼
   [FILLED] ──> [LET_BROKER_HARD_SL] ──> [MONITORING_BY_SENTINEL]
                                               │
                                 ┌─────────────┴─────────────┐
                                 ▼                           ▼
                     [TP1_REACHED] (Jual 50%)        [EARLY_EXIT_SIGNAL] (Tariq/Nawwar)
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

2. **Perlindungan Stop di Peringkat Broker (Broker Hard SL):**
   - OpenAPI `place_order` menyokong pesanan jenis `STOP` / `STOP_LIMIT`.
   - **Mekanisme Keselamatan Failsafe:** Sebaik sahaja pesanan belian disahkan `FILLED`, Bridge **serta-merta mendaftarkan pesanan Hard Stop Loss di pelayan broker Moomoo** pada paras risiko maksimum ($Entry - 1.5 \times ATR$).
   - Dengan kaedah ini, sekiranya kontena Exit Sentinel, OpenD, atau sambungan internet terputus, modal tetap **100% dilindungi oleh pelayan broker Moomoo**.
   - Exit Sentinel hanya mengemas kini (*modify / replace order*) had pesanan stop tersebut di broker apabila $TP_1$ tercapai (ke paras Break-Even) atau semasa Trailing Stop mendaki.

3. **Protokol Rekonsiliasi Posisi Pos-Restart (Position Reconciliation Engine):**
   - Semasa startup kontena `mcp-bridge` / `exit-sentinel`, atau selepas berlaku gangguan/sambungan semula (*reconnect*):
     a. Sentinel memanggil `position_list_query` untuk mendapatkan senarai kedudukan sebenar di akaun broker.
     b. Sentinel memanggil `order_list_query` untuk mendapatkan status semua pesanan aktif/tertunda.
     c. Sentinel membandingkan posisi sebenar dengan pangkalan data tempatan (`positions_state.sqlite`).
     d. Sekiranya terdapat kedudukan terbuka tanpa rekod pemantauan Sentinel, sistem secara automatik membina semula penjejak posisi (*re-hydrate state*) dan mendaftarkan pelan exit yang sepadan.
     e. Rekonsiliasi berkala dijalankan setiap **60 saat** bagi memastikan tiada jurang antara rekod lokal dan baki broker.

4. **Sentinel Heartbeat & Dead Man's Switch:**
   - Exit Sentinel menghantar denyutan nadi (*heartbeat timestamp*) setiap 5 saat ke Redis/fail status berkongsi.
   - Sekiranya tiada heartbeat melebihi 15 saat, Bridge membunyikan amaran kritikal ke Dashboard dan menyekat pembukaan posisi baharu secara automatik.

5. **Jurang Perbezaan Mod SIMULATE vs REAL:**
   - *SIMULATE (Paper):* Pesanan adalah *Good-for-Day*, tiada sokongan transaksi luar waktu (*pre/post-market*), dan tiada *deals push*.
   - *Rancangan Ujian Menutup Jurang:* Pengujian integrasi Fasa 3 mengesahkan status isian melalui kaedah polling berkala `get_order_list` (bukan semata-mata bergantung pada push stream deals), memastikan kod yang sama berfungsi 100% tanpa perubahan apabila beralih ke mod REAL.

6. **Pertukaran Mod Selamat:**
   - Suis mod dikawal oleh variabel `MOOMOO_TRD_ENV=SIMULATE|REAL`.
   - Mod `REAL` terkunci dan memerlukan suntikan kata laluan dagangan melalui pemboleh ubah rahsia peribadi (*Paperclip Secret*), bukan fail konfigurasi terbuka.

#### B. Pengurusan Log Masuk, Log Keluar & Tukar Akaun OpenD
- **Satu Proses OpenD = Satu Akaun Moomoo.**
- **Tukar Akaun Dagangan (`acc_id`):** Dibuat terus melalui panggilan SDK tanpa me-restart kontena (contoh: bertukar antara akaun Paper Trading 1 dan 2).
- **Prosedur Sign-Out Sesi OpenD (Penyelesaian N7):**
  - Panel tetapan Web Dashboard menyediakan butang *Sign-Out Sesi OpenD*.
  - Apabila diklik, backend Bridge menghantar arahan telnet penamatan sesi (arahan `logout` atau penutupan sesi soket Telnet rasmi yang disahkan semasa Fasa 1) ke OpenD Port 22222, mematikan sambungan aktif ke pelayan Moomoo, dan membersihkan fail token sesi sementara dalam folder `opend_session_data`.
  - Kontena OpenD direstart secara terkawal dalam mod terputus (*disconnected idle state*) sehingga log masuk baharu dimulakan oleh pengguna.
- **Tukar Akaun Log Masuk Moomoo Berbeza:** Memerlukan proses Sign-Out di atas, pengemaskinian konfigurasi akaun log masuk, dan restart kontena OpenD.
- **Aliran OTP 2FA:** Backend Bridge menyediakan modul *Telnet Relay* yang menghubungkan port 22222 OpenD (melalui rangkaian `stock_internal`) ke antaramuka Web Dashboard. Pengguna memasukkan kod OTP pada kotak dialog web, dan Bridge menghantar arahan `input_phone_verify_code -code=XXXXXX` ke OpenD.

#### C. Keselamatan Asal, Pengesahan JWT Cloudflare & Laluan Ejen Paperclip (Penyelesaian M2)

1. **Pengehosan Berfasa & Domain:**
   - Fasa 1 hingga 3 (Sandbox/Pengujian): `https://stock-trader.beta.julietmike.net/` (Mematuhi piawaian subdomain sandbox syarikat).
   - Fasa 4 (Produksi Nyata): `https://stock.julietmike.net` (Hanya selepas kelulusan bertulis eksplisit Jefri).

2. **Pengesahan JWT Authentik (auth.julietmike.net) di Peringkat Origin (Dashboard & Bridge):**
   - Setiap permintaan masuk melalui Authentik (auth.julietmike.net) disahkan tandatangan kriptografinya menggunakan sijil awam Cloudflare (`https://<team-domain>.cloudflareaccess.com/cdn-cgi/access/certs`).
   - Semakan mandatori pada token `Cf-Access-Jwt-Assertion`:
     - Pengesahan **Audience Tag (`aud`)**: Mesti sepadan dengan AUD aplikasi Authentik (auth.julietmike.net).
     - Pengesahan **Issuer (`iss`)**: Mesti sepadan dengan `https://<team-domain>.cloudflareaccess.com`.
     - Pengesahan Tarikh Luput (`exp`) dan caching JWKS tempatan selama 1 jam.
     - Sekiranya pengepala tiada atau tidak sah: Akses ditolak serta-merta dengan HTTP 403 Forbidden.

3. **Kawalan Keselamatan Bridge (Port 8000) & Laluan Dwi-Capaian (Penyelarasan M2 HOM-121):**
   - **Pendedahan Terhad:** Port 8000 **TIDAK didedahkan kepada internet atau antaramuka awam (0.0.0.0)**. Port ini dipetakan secara eksklusif ke loopback hos sahaja (`127.0.0.1:8000:8000`) serta rangkaian dalaman Docker `stock_internal`.
   - **Laluan 1 — Web Dashboard ke Bridge (Rangkaian `stock_internal`):**
     - Dashboard berhubung terus ke `http://mcp-bridge:8000` melalui DNS dalaman Docker.
     - Setiap permintaan wajib menyertakan pengepala servis dalaman: `X-Service-Token: Bearer <BRIDGE_SERVICE_TOKEN>`.
   - **Laluan 2 — Ejen Paperclip (Haziq, Danial, Tariq, & Nawwar) ke Bridge (Localhost Loopback):**
     - Ejen Paperclip yang beroperasi di peringkat hos mencapai Bridge melalui `http://127.0.0.1:8000`.
     - Setiap permintaan daripada ejen wajib menyertakan pengepala kebenaran rahsia: `Authorization: Bearer <PAPERCLIP_BRIDGE_SECRET>`.
     - Setiap endpoint sensitif (`/api/v1/trade/submit`, `/api/v1/trade/kill-switch`) mengesahkan token `PAPERCLIP_BRIDGE_SECRET` ini. Percubaan capaian tanpa token sah ditolak serta-merta dengan kod HTTP 401 Unauthorized atau 403 Forbidden.

---

### 3.6. Anggaran Kos Token & Kecekapan Sistem (Token & Latency Budget)

| Komponen | Peranan | Model / Enjin | Anggaran Kekerapan | Kos Token per Hari | Kependaman (*Latency*) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **L0 Screener** | Imbasan pasaran & POC | Python Math | Setiap 5 minit | **0 Token ($0.00)** | ~0.05 saat |
| **L1 Tariq** | Fasa Wyckoff & Wave | Claude 3.5 Sonnet | 3-5 kaunter, 4x sehari | ~12,000 token (~$0.04) | ~4-6 saat |
| **L1 Nawwar** | Katalis & Kalendar | Gemini 1.5 Flash | 5 kaunter, 4x sehari | ~8,000 token (~$0.002) | ~1-2 saat |
| **L2 Haziq** | Sintesis Tesis | Claude 3.5 Sonnet | 2 cadangan per hari | ~4,000 token (~$0.015) | ~3-5 saat |
| **L3 Danial** | Semakan Audit | Claude 3.5 Haiku | 2 audit per hari | ~2,000 token (~$0.002) | ~1 saat |
| **L4 Sentinel** | Trailing Stop & Exit | Python Daemon | Setiap saat | **0 Token ($0.00)** | < 0.01 saat |
| **JUMLAH** | - | - | - | **~26,000 token (~$0.06/hari)** | **Sangat Cekap & Pantas** |

---

## 4. Kriteria Penerimaan Boleh Uji & Pelan Berfasa (Roadmap)

| Fasa | Skop & Komponen | Kriteria Penerimaan Boleh Uji & Terukur (Measurable Acceptance Criteria) | Pagar Kelulusan |
| :--- | :--- | :--- | :--- |
| **Fasa 1: L0 Infra & Screener** | Setup Docker Compose (OpenD Linux CLI, Screener V2, Bridge REST, Quota Tracker, & Recon Engine). | 1. Fail `watchlist.json` dijana tepat setiap 300s $\pm$ 5s dan 100% lulus validasi skema JSON Schema validator.<br>2. Kuota K-line 30-hari kekal terhad: penambahan simbol baharu $\le 5$ simbol/hari dan penggunaan kuota K-line $\le 15$ simbol selepas 3 hari ujian.<br>3. Ujian BVA Python Bridge melepasi 100% kes ujian bagi kesemua 8 peraturan keselamatan modal (termasuk kes sempadan 2.01%, 5.01%, USD 4.99, transaksi PDT ke-4, dan sempadan waktu 15:44:59 vs 15:45:00).<br>4. Ujian Kill Switch: arahan `/kill-switch` berjaya membatalkan pesanan tertunda dan menutup kedudukan dalam masa $< 3.0$ saat.<br>5. Ujian Keselamatan Dwi-Laluan Bridge Port 8000: (a) Capaian daripada Web Dashboard tanpa `X-Service-Token` ditolak 401 Unauthorized; (b) Capaian daripada Ejen Paperclip di `127.0.0.1:8000` tanpa `Authorization: Bearer <PAPERCLIP_BRIDGE_SECRET>` ditolak 401/403; (c) Capaian Web Dashboard dari luar tanpa `Cf-Access-Jwt-Assertion` yang sah ditolak 403 Forbidden di origin (0% kebocoran).<br>6. Ujian Sesi Telnet OpenD: Arahan penamatan sesi/logout Telnet pada OpenD sebenar disahkan berfungsi dengan sesi broker tamat sepenuhnya dan fail sesi sementara dibersihkan. | Lulus semakan kod & laporan bukti ujian BVA oleh Zahrin (QA). |
| **Fasa 2: Ejen Analisis & Exit Engine** | Prompt Tariq, Nawwar, Haziq, pendaftaran MCP Tools, dan logik Exit Sentinel. | 1. Tariq menghasilkan penilaian teknikal berstruktur JSON dengan nilai $S_{tech} \in [0, 100]$ dalam masa $\le 8.0$ saat tanpa kegagalan parsing.<br>2. Nawwar menolak 100% kaunter simulasi yang mempunyai earnings $< 48$ jam atau amaran makro FOMC/CPI.<br>3. Normalisasi $S_{sent\_norm}$ dan sintesis $S_{total}$ mematuhi formula matematik dengan ketepatan perpuluhan 100%.<br>4. Ujian rekonsiliasi: apabila kontena Sentinel direstart secara paksa semasa ada 2 posisi aktif simulasi, Sentinel berjaya menemui semula (*re-hydrate*) posisi tersebut melalui `position_list_query` dalam masa $< 5.0$ saat dan meletakkan Hard SL semula. | Kelulusan prompt ejen & reka bentuk oleh Jefri. |
| **Fasa 3: Dagangan Kertas Automatik (Paper Trading)** | Automasi penuh hujung-ke-hujung di akaun Moomoo Paper Trading (Mod `SIMULATE`). | 1. Jurang SIMULATE vs REAL ditutup: status isian disahkan melalui kaedah berkala `get_order_list` (polling 2 saat) dengan kelewatan pengesanan $< 3$ saat.<br>2. Ujian eksekusi TP1: Apabila harga mencapai $TP_1$, Exit Sentinel berjaya menjual tepat 50% kuantiti dan memindahkan stop order broker ke paras Break-Even.<br>3. Ujian Time-Exit: Tepat jam 15:45:00 `America/New_York`, kesemua posisi terbuka mod Day Trading ditutup 100% sebelum jam 15:46:00.<br>4. Dashboard memaparkan metrik PnL dan status OpenD secara masa nyata di `https://stock-trader.beta.julietmike.net/` di bawah perlindungan Cloudflare SSO. | Semakan metrik prestasi & pematuhan risiko oleh Jefri. |
| **Fasa 4: Pengaktifan Akaun Sebenar (Live Switch)** | Pertukaran tetapan `MOOMOO_TRD_ENV=REAL` dengan modal permulaan konservatif. | 1. 100% pematuhan peraturan PDT (transaksi ke-4 dalam 5 hari dihalang secara keras).<br>2. Kata laluan dagangan disuntik selamat melalui secret Paperclip tanpa rekod plain-text dalam log, commit, atau komen task.<br>3. Broker Hard Stop Loss disahkan aktif di pelayan broker sejurus selepas isian pertama pada akaun nyata. | Kelulusan bertulis eksplisit Jefri dalam thread task. |

---

## 5. Kesimpulan & Penyerahan

Dokumen Blueprint Versi 3.5 Definitif (Authentik Integration) ini telah menyelesaikan 100% maklum balas audit semakan QA Zahrin (HOM-118, HOM-119, HOM-121, HOM-122, dan HOM-123):
1. **Penyatuan Penuh 16 Item & Skema JSON Lengkap:** Kesemua spesifikasi L0–L4, Docker Compose, formula multi-stage, dan skema JSON rasmi Tariq & Nawwar disatukan dalam satu dokumen utuh.
2. **Pengurusan Kuota & API Rasmi:** Tapisan awan `get_stock_screen` V2 dan penjejakan kuota 30-hari menyelesaikan kekangan kuota K-line Moomoo OpenAPI secara realistik.
3. **Failsafe Broker Hard Stop & Rekonsiliasi:** Pendaftaran serta-merta Hard SL di pelayan Moomoo broker melindungi modal 100% sekiranya kontena terputus, disokong oleh enjin rekonsiliasi 60-saat dan denyutan nadi Sentinel 5-saat.
4. **Seni Bina Keselamatan Dwi-Laluan:** Port 8000 Bridge dihadkan ke loopback hos `127.0.0.1:8000` dengan perlindungan `PAPERCLIP_BRIDGE_SECRET` bagi ejen Paperclip, manakala Web Dashboard dilindungi oleh pengesahan JWT Authentik (auth.julietmike.net) di origin dan token servis dalaman.
5. **Format & Kriteria Terukur:** Formula matematik LaTeX dibetulkan 100% tanpa aksara kawalan, matriks ujian BVA bagi 8 peraturan lengkap, dan kriteria penerimaan terukur kuantitatif disediakan bagi setiap fasa.

Dokumen ini diterbitkan dalam task document **`blueprint-option-a` (Versi 3.5 Definitif (Authentik Integration))** untuk semakan akhir QA Zahrin dan kelulusan rasmi Jefri.


---

## Tambahan v3.8: MEMO Rekabentuk Antaramuka & Integriti Data (Arahan Jefri 2026-11-16)

1. **MEMO Rekabentuk Antaramuka (Dilarang Label Cliché)**:
   - DILARANG menambah label-label cliché, kad penerangan berulang, atau teks hiasan yang tidak mempunyai kegunaan operasi dan tidak diperlukan oleh pengguna (contoh: kad prinsip teori saiz posisi institusi, penjelasan berulang fungsi ejen, atau label bertindan L1/L2/L3 yang mengelirukan).
   - Antaramuka mestilah kemas, padat, berfungsi (*utilitarian*), dan terus memaparkan kawalan atau metrik tindakan pengguna.

2. **MEMO Integriti Data & Visualisasi Ejen (Wajib Data Sebenar)**:
   - Wajib guna DATA SEBENAR daripada saluran paip (`watchlist.json` / broker). DILARANG menggunakan senarai calon mockup/rekaan yang tiada kaitan dengan senarai pantau (*watchlist*) semasa.
   - Buang label kod teknikal dalaman yang tidak diperlukan (seperti `(L1_TECHNICAL)`, `(L4_DISPATCH)` pada chip pilihan kaunter).
   - Halaman pemantauan aktiviti ejen (`#/agents`) wajib memaparkan bilangan sebenar kaunter semasa yang lulus (cth. `Kaunter Semasa Lulus: X / Y`) berserta pengekodan warna (*color-coding*) yang jelas: Hijau (*Success*) bagi kaunter yang lulus/diterima dan Neutral/Muted bagi kaunter yang ditolak.


---

## 6. Seni Bina & Orkestrasi Ejen Paperclip L1–L4 (Fasa 3 Definitif - HOM-317)

### 6.1 Pemetaan Model Ejen Sebenar di Paperclip (Sifar Claude)
Berasaskan ketetapan pemohon (Jefri), sistem menggunakan 100% model Google Gemini yang dikonfigurasikan di Paperclip tanpa sebarang kebergantungan kepada model Claude:

| Ejen | Peranan | ID Ejen Paperclip | Adapter | Model Rasmi Semasa | Tanggungjawab |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Trade: Tariq** | L1 Technical Analyst | `9c686b86-0a97-46ae-9705-edb8840a5440` | Antigravity | `gemini-4-hydrogen-medium` | Fasa Wyckoff, carta candlestick 60-hari Moomoo (`get_history_kline` / `get_cur_kline_with_sub`), aras sokongan/rintangan, skor $S_{tech}$ |
| **Trade: Nawwar** | L1 Sentiment Scout | `82e5a99e-368c-4f5f-b18d-b5ecaafbc40f` | Antigravity | `gemini-3.8-flash-medium` | Sentimen berita Moomoo (`get_news_for_symbol`), pengesahan hard gate tarikh earnings (< 5 hari) (`get_earnings_calendar`), skor $S_{sent}$ |
| **Trade: Haziq** | L2 Portfolio Lead / Trader | `612c7171-d5f1-405b-9be3-aca66e24b7db` | Antigravity | `gemini-4-hydrogen-medium` | Sintesis $S_{total} = 0.65 S_{tech} + 0.35 S_{sent\_norm}$, pemilihan ranking terbaik, formula saiz posisi 1.5% modal, sasaran SL & TP |
| **Trade: Danial** | L3 Risk & Execution Officer | `bcbd0bd4-b10b-4000-b0a7-c21fc6147336` | Antigravity | `gemini-3.8-flash-medium` | Audit ketat 10 Hard Rules (termasuk Pause Buying), penghantaran pesanan belian ke Bridge Port 8000 |

### 6.2 Mekanisme Panggilan Bangun (Wake Chain)
```text
+------------------------------------------------------------------------+
| L0 Screener (Python Daemon)                                            |
| Menjana 3-5 calon saham terbaik (lorong Momentum & Setup)              |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Wake oleh Screener Event)
+------------------------------------------------------------------------+
| Bridge Dispatcher Service (bridge/src/paperclip_dispatcher.py)         |
| Mencetuskan Paperclip wake selari untuk Tariq & Nawwar                 |
+-------------------+--------------------------------+-------------------+
                    |                                |
                    v (Wake L1A)                     v (Wake L1B)
+--------------------------------------+ +-------------------------------+
| L1 Tariq (Technical Analyst)         | | L1 Nawwar (Sentiment Scout)   |
| - Model: gemini-4-hydrogen-medium    | | - Model: gemini-3.8-flash-med |
| - Analisis Wyckoff & K-Line          | | - Semak Earnings & Makro Gate |
| - Pulangkan S_tech [0, 100]          | | - Pulangkan S_sent            |
+-------------------+------------------+ +---------------+---------------+
                    |                                |
                    +----------------+---------------+
                                     | (Kedua-dua L1 siap)
                                     v (WAKE HAZIQ oleh Bridge Dispatcher)
+------------------------------------------------------------------------+
| L2 Haziq (Portfolio Lead / Trader)                                     |
| - Model: gemini-4-hydrogen-medium                                      |
| - Sintesis S_total, pilih ranking tertinggi, saiz posisi, SL & TP      |
+-----------------------------------+------------------------------------+
                                    |
                                    v (WAKE DANIAL oleh Haziq sendiri)
+------------------------------------------------------------------------+
| L3 Danial (Risk & Compliance Officer)                                  |
| - Model: gemini-3.8-flash-medium                                       |
| - Audit ketat 10 Hard Rules (termasuk Pause Buying)                    |
| - Jika Lulus: Danial hantar order ke Bridge Port 8000 via loopback     |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Eksekusi Pesanan)
+------------------------------------------------------------------------+
| L4 Broker Execution (Moomoo OpenD)                                     |
| Laksana pesanan di akaun Paper Trading (TrdEnv.SIMULATE)               |
+------------------------------------------------------------------------+
```

### 6.3 10 Hard Rules Keselamatan Danial (L3 Gatekeeper)
1. Had risiko kerugian per transaksi: Maksimum 2% daripada ekuiti akaun.
2. Had kejatuhan harian (Daily Drawdown): Maksimum 5% penurunan modal dalam sehari.
3. Penapisan saham berharga rendah (Penny Stock): Harga saham wajib >= $5.00.
4. Had kecairan pasaran: Kuantiti belian tidak melebihi 1% daripada purata volum dagangan harian kaunter.
5. Waktu operasi pasaran: Hanya beroperasi sewaktu sesi dagangan pasaran US dibuka (09:45 - 15:45 waktu New York).
6. Pencegahan posisi berganda: Menolak pembelian jika saham yang sama telah mempunyai posisi terbuka aktif.
7. Sekatan pendapatan korporat (Earnings Gate): Menolak kaunter sekiranya tarikh pengumuman keputusan pendapatan adalah dalam tempoh 5 hari.
8. Status sambungan broker: Memastikan sambungan sesi Moomoo OpenD hidup dan sihat.
9. Mod persekitaran dagangan: Wajib mod simulasi (`TrdEnv.SIMULATE`).
10. Kawalan Jeda Pembelian (Pause Buying): Apabila status `pause_buying = True`, Danial menolak serta-merta sebarang pesanan BUY baharu, manakala Tariq melangkau panggilan K-line OpenAPI bagi menjimatkan kuota 30-hari.

### 6.4 Antaramuka & Dashboard (React MUI SPA)
1. **Laman Portfolio (`#/portfolio`)**: Memaparkan ringkasan modal, tunai, PnL bersih, dan senarai pegangan kaunter aktif dengan harga belian sebenar (*bought price*) dan harga semasa (*current price*).
2. **Suis Jeda Pembelian (Pause Buying Toggle)**: Membolehkan pengendali menjeda pembelian baharu secara langsung dari papan pemuka.
3. **Pemberitahuan & Countdown**: Pemasa kiraan detik automatik bagi jadual imbasan L0 seterusnya.

---

## 7. Seni Bina Mod Dagangan (Trading Modes: Day Trading vs Swing Trading)

**Rujukan Tugasan:** HOM-319, HOM-320 (Induk: HOM-47, HOM-114)  
**Status:** Mod Dagangan Berbilang (Multi-Mode Trading Architecture)  
**Arkitek / Software Lead:** Fakhri & Hakeem  
**Penyemak Bebas / QA Gatekeeper:** Zahrin  

---

### 7.1 Perbandingan & Analisis Kesesuaian 4 Gaya Dagangan (Trading Styles)

Bagi menentukan keserasian operasi pasaran dengan ekosistem ejen Paperclip dan Moomoo OpenAPI, penilaian menyeluruh dilakukan ke atas 4 gaya dagangan utama:

| Dimensi Penilaian | 1. Scalping | 2. Day Trading (Intraday) | 3. Swing Trading (Multi-Day) | 4. Position Trading (Investing) |
| :--- | :--- | :--- | :--- | :--- |
| **Horizon Masa Pegangan** | Beberapa saat hingga beberapa minit | Beberapa minit hingga jam (Ditutup sebelum 15:45 NY) | Beberapa hari hingga beberapa minggu | Beberapa minggu hingga beberapa bulan/tahun |
| **Timeframe Analisis K-line** | Sub-minit (10s, 30s, 1M) | Minit (1M, 5M, 15M) | 1-Jam (1H) dan Harian (Daily/1D) | Mingguan (Weekly) dan Bulanan (Monthly) |
| **Latensi & Respons AI Paperclip** | **TIDAK SESUAI**<br>Latensi LLM Paperclip (1–5 saat per ejen) terlalu perlahan untuk pergerakan pantas order book. | **SESUAI (Lalai Asal)**<br>Pemantauan selang 5-minit L0 screener memberi masa mencukupi bagi analisis Tariq/Nawwar/Haziq. | **SANGAT SESUAI (Disokong Penuh)**<br>Latensi beberapa saat langsung tidak memberi kesan kepada struktur carta 1H dan Daily. | **BOLEH TETAPI KURANG EFISIEN**<br>Kitaran dagangan terlalu perlahan untuk utiliti sistem ejen aktif berautonomi. |
| **Penggunaan Kuota Moomoo OpenAPI** | **MEMBAZIR / GAGAL**<br>Melepasi had kadar 10 req/s dan menghabiskan kuota kuotasi masa nyata serta-merta. | **SEDERHANA / TERKAWAL**<br>Dipantau rapi melalui kuota 100 simbol K-line 30-hari dan saringan awan `get_stock_screen` V2. | **SANGAT JIMAT (>75% Penjimatan)**<br>Panggilan K-line berkala (setiap 4 jam atau bar-close) mengurangkan penggunaan kuota secara drastik. | **MINIMUM**<br>Penggunaan kuota K-line hampir sifar kerana semakan hanya berlaku seminggu sekali. |
| **Penggunaan Token & Kos LLM** | Sangat Tinggi ($5.00–$20.00/hari) | Rendah–Sederhana (~$0.06/hari mengikut Jadual 3.5) | Sangat Rendah (~$0.015/hari; panggilan dikurangkan kepada 3-4 kali sehari) | Sangat Rendah (<$0.005/hari) |
| **Implikasi Peraturan PDT (FINRA)** | **KRITIKAL**<br>Terikat ketat peraturan Pattern Day Trader (maks 3 day trades dalam 5 hari bergolek jika ekuiti < $25k). | **TERIKAT**<br>Wajib dipantau oleh Hard Rule Danial (#5) bagi akaun bawah $25,000. | **BEBAS PDT**<br>Posisi yang dipegang merentas malam (*overnight hold*) dan ditutup pada hari berlainan tidak dikira sebagai day trade. | **BEBAS PDT**<br>Tiada sebarang isu berkaitan had PDT. |
| **Risiko Pasaran Luar Waktu (Overnight Gap)** | **SIFAR**<br>Tiada pegangan semalaman. | **SIFAR**<br>Ditutup sepenuhnya sebelum jam 15:45 NY. | **ADA (Perlu Mitigasi)**<br>Terdedah kepada lonjakan/kejatuhan harga pra-pasaran (*pre-market gap*) akibat berita semalaman. | **TINGGI**<br>Terdedah kepada kitaran makro ekonomi dan turun naik pendapatan suku tahunan. |
| **Status Keserasian Seni Bina** | **DITOLAK SECARA TEGAS**<br>Tidak disokong oleh seni bina Paperclip + Moomoo. | **DISOKONG (MOD: DAY)**<br>Mod operasi standard intraday yang aktif. | **DISOKONG (MOD: SWING)**<br>Mod pilihan baharu yang sangat efisien dan ekonomik. | **DI LUAR SKOP UTAMA**<br>Tidak dioptimumkan untuk ejen perdagangan aktif. |

---

### 7.2 Perincian Seni Bina & Pelaksanaan Swing Trading

Mod Swing Trading (`TRADING_MODE=SWING`) direka untuk menangkap pergerakan gelombang trend harga sederhana (3–10 hari) dengan memanfaatkan kestabilan teknikal timeframe lebih tinggi dan mengurangkan kos operasi API:

```text
+------------------------------------------------------------------------+
| 1. L0 Screener (Saringan Multi-Day)                                    |
|    - Saringan berasaskan carta Daily: 20-EMA breakout, volume surge    |
|    - Kitaran imbasan: 4 jam sekali (atau selepas penutupan bar harian) |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Calon Saringan 1H/Daily)
+------------------------------------------------------------------------+
| 2. L1 Analisis Dwi-Ejen (Timeframe 1H & Daily)                         |
|    - Tariq (Teknikal): Analisis Wyckoff & SMC pada carta 1H & D1       |
|    - Nawwar (Sentimen): Saringan Earnings Gate diperketat (< 14 hari)  |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Tesis S_total & Saiz Posisi)
+------------------------------------------------------------------------+
| 3. L2 Haziq (Perancangan Perdagangan Swing)                            |
|    - Saiz risiko modal dikurangkan kepada 1.0% (Mitigasi overnight gap)|
|    - Nisbah R:R sasaran diperluas (Minimum 1:3)                        |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Audit Pematuhan & Had Perlindungan)
+------------------------------------------------------------------------+
| 4. L3 Danial (Pematuhan Had Perlindungan)                              |
|    - Pengecualian Time-Exit 15:45 NY (Membenarkan pegangan semalaman)  |
|    - Pengesahan pesanan Good-Til-Cancelled (TimeInForce.GTC)           |
+-----------------------------------+------------------------------------+
                                    |
                                    v (Eksekusi Pesanan GTC)
+------------------------------------------------------------------------+
| 5. L4 Broker & Exit Sentinel (Pemantauan Berterusan)                   |
|    - Hard Stop Loss GTC diletakkan terus di pelayan broker Moomoo      |
|    - Chandelier Trailing Stop dikemas kini pada setiap bar-close harian|
+------------------------------------------------------------------------+
```

#### 1. Timeframe & Analisis Teknikal L1 (Tariq)
- **Gabungan Timeframe (Multi-Timeframe Confluence):**
  - **Daily (D1):** Digunakan untuk menentukan trend makro, zon pengumpulan/pengagihan Wyckoff utama, dan aras sokongan/rintangan institusi (SMC Order Blocks).
  - **1-Jam (1H):** Digunakan untuk memperincikan titik pemicu kemasukan (*entry trigger*), pembentukan struktur *Change of Character* (CHoCH), dan penentuan aras henti rugi berasaskan $1.5 \times ATR_{1H}$.
- **Pengurusan Kuota K-line:**
  - Tariq memanggil `get_cur_kline_with_sub` bagi `KLType.K_60M` (1-Jam) dan `KLType.K_DAY` (Harian).
  - Panggilan hanya dibuat apabila ada calon baharu daripada L0 atau pada jadual semakan 4-jam, mengelakkan panggilan berulang yang membazirkan kuota 100 simbol bulanan.

#### 2. Penapisan Katalis & Kalendar L1 (Nawwar)
- **Peraturan Sekatan Pendapatan (Earnings Gate) 14-Hari:**
  - Di bawah Day Trading, sekatan pendapatan ditetapkan pada < 5 hari.
  - Di bawah Swing Trading, kaunter ditolak sekiranya tarikh pengumuman pendapatan syarikat berada dalam tempoh **14 hari** dari tarikh kemasukan (`days_to_earnings < 14`). Ini mengelakkan pegangan multi-day terperangkap dalam lonjakan volatiliti *Earnings Announcement* yang boleh menembusi Stop Loss melalui jurang harga semalaman (*overnight price gap*).
- **Semakan Sentimen & Berita Makro:**
  - Nawwar menyemak kalendar mesyuarat FOMC, pelepasan data CPI/PPI, dan berita sektor berimpak tinggi yang merangkumi horizon 7–14 hari.

#### 3. Jadual Pemantauan Berkala (Periodic Wake Loop)
Berbanding Day Trading yang menjalankan imbasan setiap 300 saat (5 minit) semasa pasaran aktif, Swing Trading menggunakan kitaran pemantauan berkala:
- **09:00 NY (Pra-Pasaran / Pre-Market Sync):** Memeriksa harga pra-pasaran, mengesahkan integriti posisi semalaman, dan menyemak sebarang amaran berita mendadak.
- **13:00 NY (Pertengahan Sesi / Mid-Day Review):** Menilai momentum volum sesi tengah dan mengimbas calon kemasukan baharu pada carta 1H.
- **16:30 NY (Pasca-Pasaran / Post-Market Bar Close):** Menjalankan rekonsiliasi harian selepas pasaran ditutup, mengira semula paras Chandelier Trailing Stop berasaskan harga penutup harian, dan mengemas kini pangkalan data portfolio.
- **Pemicu Amaran Harga Bersyarat (Price Alert Trigger):** Sekiranya berlaku pergerakan luar biasa melebihi $2.5 \times ATR$, Exit Sentinel membina pemicu pantas untuk membangunkan ejen pemantau tanpa menunggu kitaran 4 jam.

#### 4. Pengurusan Pesanan & Had Perlindungan (GTC vs Good-For-Day)
- **Peralihan ke Pesanan GTC (Good-Til-Cancelled):**
  - Parameter pesanan Moomoo OpenAPI ditukar daripada `time_in_force = TimeInForce.DAY` kepada `time_in_force = TimeInForce.GTC`.
  - Pesanan had (*limit entry*) dan pesanan henti rugi (*Hard Stop Loss*) kekal aktif di pelayan broker Moomoo merentas sesi dagangan sehingga dipenuhi atau dibatalkan secara eksplisit oleh sistem.
- **Pengecualian Mandatori Peraturan Time-Exit 15:45 NY:**
  - Hard Rule #5 Danial diubahsuai secara dinamik: Arahan tutup automatik pada jam 15:45 NY hanya diaktifkan sekiranya `TRADING_MODE=DAY`. Bagi `TRADING_MODE=SWING`, kedudukan dibenarkan untuk dipegang semalaman (*overnight hold*).
- **Mitigasi Risiko Jurang Harga Semalaman (Overnight Gap Risk Mitigation):**
  - **Pengurangan Saiz Risiko Modal:** Saiz risiko maksimum per transaksi dikurangkan daripada 1.5%–2.0% (Day) kepada **maksimum 1.0% daripada nilai ekuiti akaun** (Swing).
  - **Hard SL Wajib di Broker:** Exit Sentinel memastikan setiap kedudukan belian yang berjaya diisi disusuli serta-merta dengan pesanan *Stop Loss Order* GTC yang berdaftar terus pada pelayan broker Moomoo bagi melindungi modal sekiranya pasaran dibuka menjunam (*gap-down opening*).

---

### 7.3 Penggunaan Toggle Konfigurasi `TRADING_MODE` (DAY | SWING)

Sistem menyokong pertukaran mod operasi melalui pembolehubah persekitaran tunggal tanpa perlu mengubah kod asas:

```bash
# Konfigurasi di .env atau Docker Environment
TRADING_MODE=DAY      # Pilihan: DAY (Lalai Intraday) | SWING (Multi-Day Swing)
```

#### Matriks Perbezaan Tingkah Laku Sistem Mengikut Lapisan (L0 -> L4)

| Lapisan Sistem | Parameter / Komponen | Mod DAY (`TRADING_MODE=DAY`) | Mod SWING (`TRADING_MODE=SWING`) |
| :--- | :--- | :--- | :--- |
| **L0 Screener** | Kekerapan Imbasan | Setiap 300 saat (5 minit) | Setiap 4 jam / Penutupan Bar Harian |
| | Kriteria Saringan | Momentum 5M, Volum Relatif Intraday, Julat Sesi | Penembusan 20-EMA Harian, Tapisan Volum 50-SMA |
| **L1 Tariq** | Jenis K-line Moomoo | `KLType.K_5M`, `KLType.K_15M` | `KLType.K_60M` (1H), `KLType.K_DAY` (Harian) |
| | Horizon Wyckoff | Fasa Intraday Accumulation/Spring | Fasa Re-Accumulation Harian, Zon SMC Utama |
| **L1 Nawwar** | Sekatan Tarikh Earnings | `days_to_earnings < 5` hari | `days_to_earnings < 14` hari |
| | Skop Analisis Sentimen | Sentimen berita 24-jam & kalendar harian | Trend industri 14-hari & jadual makro FOMC/CPI |
| **L2 Haziq** | Nisbah Risiko:Ganjaran (R:R) | Minimum 1:2 | Minimum 1:3 |
| | Had Risiko Modal | 1.5% daripada nilai ekuiti | 1.0% daripada nilai ekuiti (Konservatif) |
| **L3 Danial** | Semakan Had PDT | Wajib dipatuhi (Maks 3 transaksi jika < $25k) | Dikecualikan bagi pegangan > 1 hari perniagaan |
| | Penguatkuasaan Time-Exit | **Aktif Wajib** (Tutup semua posisi pada 15:45 NY) | **Dinyahaktifkan** (Membenarkan pegangan semalaman) |
| | Parameter `time_in_force` | `TimeInForce.DAY` | `TimeInForce.GTC` |
| **L4 Sentinel** | Logik Trailing Stop | Intraday Chandelier Trailing (Tick-by-tick) | Daily Bar-Close Trailing (Dikemas kini jam 16:30 NY) |
| | Rekonsiliasi Pesanan | Menutup pesanan belum diisi jam 16:00 NY | Mengekalkan pesanan GTC aktif merentas hari |
| **Dashboard UI** | Paparan Bar Status | Lencana `[MOD: DAY (INTRADAY)]` | Lencana `[MOD: SWING (MULTI-DAY)]` |
| | Tab Pemantauan | Countdown 5-minit saringan seterusnya | Jadual imbasan sesi 4-jam & amaran threshold |

