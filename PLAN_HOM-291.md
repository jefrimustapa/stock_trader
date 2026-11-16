# Plan: Ujian Simulasi Hujung-ke-Hujung (Paper Trading) & Koordinasi Pasukan Ejen (HOM-291)

- **Branch**: `feat/hom-291-e2e-paper-trading-simulation` (berasaskan `main`)
- **Issue**: [HOM-291](https://crew.julietmike.net/HOM/issues/HOM-291) (Parent: [HOM-290](https://crew.julietmike.net/HOM/issues/HOM-290), Ancestor: [HOM-47](https://crew.julietmike.net/HOM/issues/HOM-47), Blueprint: [HOM-114](https://crew.julietmike.net/HOM/issues/HOM-114))
- **Author**: Fakhri, Senior Software Engineer (Core AI & Architecture)
- **Status**: waiting for go (implementation NOT started)

---

## 1. Analisis Keperluan & Maklum Balas Pemohon (Requirements Analysis)

### 1.1 Konteks & Objektif Utama
Berdasarkan arahan tugasan HOM-291 dan maklum balas pemohon (Jefri) pada HOM-290:
> *"kalau ikut blueprint boleh pantau aktiviti ejen dari dashboard trader. tapi aku tak nmpk ni dalam sistem trader."*

Sistem sedia ada (`stock_trader`) telah mempunyai:
1. Enjin saringan L0 dwi-lorong (`screener-daemon`) yang menjana `watchlist.json`.
2. Jambatan keselamatan L4 (`mcp-bridge` di port 8000/8005) dengan penguatkuasaan 8 Hard Rules dan sambungan ke Moomoo OpenD (port 11111 / telnet port 22222).
3. Papan pemuka visual React/Express (`trading-dashboard` dan `trading-dashboard-beta`) yang memaparkan Overview, OpenD, Funnel, Watchlist, Settings, dan Quota.
4. Empat ejen pakar yang telah di-hire dalam Paperclip (HOM-279):
   - **Tariq** (L1 Technical Analyst): Analisis Wyckoff, Elliott Wave, SMC, skor $S_{tech} \in [0, 100]$.
   - **Nawwar** (L1 Sentiment & News Scout): Berita, earnings, makro, skor $S_{sent} \in [-100, +100]$.
   - **Haziq** (L2 Portfolio & Strategy Lead): Sintesis skor $S_{total} = (0.65 \times S_{tech}) + (0.35 \times S_{sent\_norm})$, saiz modal 1.5% ekuiti, sasaran TP/SL.
   - **Danial** (L3 Risk & Execution Officer): Audit 8 Hard Rules, penghantaran pesanan simulasi ke Bridge.

### 1.2 Jurang Sistem Sedia Ada (Gaps Identified)
1. **Tiada Antaramuka Pemantauan Ejen di Dashboard**: Papan pemuka belum mempunyai tab/halaman khusus untuk memantau status saluran paip ejen, justifikasi keputusan setiap ejen, dan sejarah pesanan dagangan simulasi (paper trading).
2. **Tiada Enjin Orkestrasi Saluran Paip Simulasi (Pipeline Orchestrator)**: Belum ada modul orkestrator yang menghubungkan output L0 Watchlist -> penilaian L1 (Tariq & Nawwar) -> sintesis L2 (Haziq) -> audit L3 (Danial) -> penghantaran pesanan simulasi ke Moomoo OpenD secara berulang dan boleh dipantau.
3. **Tiada API Query Transaksi & Aktiviti Ejen**: `bridge/src/routes/trade.py` hanya mempunyai endpoint `submit`, `positions`, `accounts`, dan `kill-switch`, tetapi tiada `GET /api/v1/trade/orders` atau `GET /api/v1/agents/activity` untuk memaparkan log transaksi yang telah dilaksanakan di akaun simulasi OpenD.

### 1.3 Kriteria Penerimaan Pengguna (User Acceptance Criteria - SDLC #2)
> **Bila pengguna membuka halaman 'Aktiviti Ejen' (`#/agents`) pada Web Dashboard (https://stock-trader.beta.julietmike.net/#/agents) dan mencetuskan kitaran simulasi dagangan, pengguna nampak carta saluran paip (pipeline flow) visual L0 -> L1 -> L2 -> L3 -> L4, kad analisis terperinci setiap ejen (skor teknikal Tariq, sentimen Nawwar, tesis strategi Haziq, dan semakan 8 Hard Rules Danial), serta jadual pesanan simulasi Moomoo OpenD terkini dengan status pengesahan risiko yang jelas.**

---

## 2. Reka Bentuk Seni Bina & Aliran Kerja (Architecture & Design)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 L0 SCREENER ENGINE                                     │
│  - Dual-Lane Candidates: MOMENTUM & SETUP (watchlist.json)                             │
│  - Quota Protection: MAX_CANDIDATES_PER_LANE (1-20, default 5)                         │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     L1 INTELLIGENCE ANALYSIS (Tariq & Nawwar)                         │
│  ┌─────────────────────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │ Tariq (Technical Analyst)           │  │ Nawwar (Sentiment & Macro Scout)         │ │
│  │ - Wyckoff Phase (Accumulation/Markup)│  │ - News Sentiment Analysis                │ │
│  │ - Elliott Wave & SMC FVG Confluence │  │ - Earnings & Macro Risk Gate             │ │
│  │ - Score: S_tech in [0, 100]         │  │ - Score: S_sent in [-100, +100]          │ │
│  └──────────────────┬──────────────────┘  └────────────────────┬─────────────────────┘ │
└─────────────────────┼──────────────────────────────────────────┼───────────────────────┘
                      │                                          │
                      └────────────────────┬─────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        L2 STRATEGY & PORTFOLIO LEAD (Haziq)                            │
│  - Score Normalization: S_sent_norm = (S_sent + 100) / 2                               │
│  - Composite Score: S_total = (0.65 * S_tech) + (0.35 * S_sent_norm)                   │
│  - Entry Gate: S_total >= 65.0 (with S_tech >= 60.0 and S_sent_norm >= 80.0)           │
│  - Position Sizing: RiskAmount = TotalEquity * 1.5%, StopLoss = 1.5 * ATR_14           │
│  - Exit Policy: TP1 (50% at 1:1.5 R:R), BE move on TP1, Chandelier Trailing Stop       │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   L3 RISK & COMPLIANCE GATEKEEPER (Danial & Hard Rules)                │
│  - Mandatori 8 Hard Rules (Enforced deterministically by Python Bridge L4):            │
│    1. Risk per trade <= 2.0% equity          5. Order volume <= 1.0% ADV20             │
│    2. Daily drawdown <= 5.0% circuit breaker 6. Market time window 09:45 - 15:45 NY    │
│    3. PDT guard (< $25k, max 3 day trades)   7. Idempotency key (UUID + hash)          │
│    4. Penny stock filter (Price >= $5.00)    8. Manual kill switch & OpenD alive       │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     L4 EXECUTION & OBSERVABILITY (Bridge & Dashboard)                  │
│  - Moomoo OpenD Paper Trading (MOOMOO_TRD_ENV=SIMULATE, Port 11111)                    │
│  - Shared SQLite Audit & Order Log (shared_data/agent_activity.sqlite)                 │
│  - Operations Dashboard: Aktiviti Ejen, Log Deliberasi, Status Pesanan                 │
│    (trade.julietmike.net / stock-trader.beta.julietmike.net/#/agents)                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Komponen & Modul yang Akan Diubah / Ditambah (Proposed Changes)

### 3.1 Komponen Backend (`bridge/`)
1. **[NEW] `bridge/src/agent_pipeline.py`**:
   - Enjin orkestrasi saluran paip simulasi hujung-ke-hujung:
     - Membaca calon terkini daripada `watchlist.json`.
     - Mengira analisis dan skor teknikal $S_{tech}$ (Tariq) berasaskan metrik OHLCV, Wyckoff, dan pengesahan fasa pasaran.
     - Mengira analisis sentimen dan makro $S_{sent}$ (Nawwar) berserta tapisan earnings/FOMC.
     - Melaksanakan sintesis skor komposit $S_{total}$ dan saiz modal formula berhemah (Haziq).
     - Menjalankan audit pematuhan 8 Hard Rules dan pendaftaran audit trail (Danial).
     - Menghantar pesanan ke `moomoo_client.place_order()` dalam persekitaran `SIMULATE` (Moomoo Paper Trading).
     - Menyimpan setiap langkah aktiviti dan deliberasi ke pangkalan data `shared_data/agent_activity.sqlite` (mod WAL).
2. **[NEW] `bridge/src/routes/agents.py`**:
   - `GET /api/v1/agents/activity`: Mengembalikan senarai kitaran simulasi terkini, status saluran paip (L0-L4), kad deliberasi ejen (Tariq, Nawwar, Haziq, Danial), serta statistik kejayaan/penolakan.
   - `POST /api/v1/agents/simulate-run`: Mencetuskan kitaran simulasi saluran paip dagangan (sama ada menggunakan data live `watchlist.json` atau senario ujian terkawal).
3. **[MODIFY] `bridge/src/routes/trade.py`**:
   - Menambah endpoint `GET /api/v1/trade/orders` untuk memulangkan senarai pesanan aktif dan sejarah transaksi paper trading (menggabungkan rekod `processed_orders` dari SQLite dan query OpenD `query_orders`).
4. **[MODIFY] `bridge/src/main.py`**:
   - Mendaftarkan router `agents.router` ke dalam aplikasi FastAPI Bridge.

### 3.2 Komponen Frontend (`dashboard/`)
1. **[NEW] `dashboard/src/pages/AgentsPage.jsx`**:
   - Halaman khusus "Aktiviti Pasukan Ejen & Paper Trading":
     - **Visual Pipeline Stepper**: Petunjuk status setiap lapisan (L0 Screener -> L1 Tariq & Nawwar -> L2 Haziq -> L3 Danial -> L4 Broker OpenD).
     - **Kad Deliberasi Ejen (Agent Cards)**:
       - **Tariq**: Skor $S_{tech}$, Wyckoff Phase, status Fail-Fast, zon sokongan/rintangan.
       - **Nawwar**: Skor $S_{sent}$, sentimen pasaran, status tapisan earnings/makro.
       - **Haziq**: Skor komposit $S_{total}$, status pintu masuk (Pelepasan $\ge 65.0$), saiz lot, risiko per saham, nisbah TP/SL.
       - **Danial**: Matriks semakan 8 Hard Rules (Jadual tanda hijau/merah bagi setiap satu daripada 8 peraturan risiko).
     - **Jadual Transaksi Paper Trading (Orders Table)**:
       - Memaparkan Order ID, Simbol, Tindakan (BUY), Kuantiti, Harga Entri, Stop Loss, Status OpenD (`PENDING`, `FILLED`, `REJECTED`, `CANCELLED`), dan cap masa.
     - **Kawalan Simulasi (Simulation Controls)**:
       - Butang *"Jalankan Simulasi Pipeline"* untuk mencetuskan kitaran semakan masa nyata dan mengemas kini kad deliberasi.
2. **[MODIFY] `dashboard/src/components/Layout.jsx`**:
   - Menambah ikon dan pautan menu nav *"Aktiviti Ejen"* (`#/agents`) pada bahagian atas bar navigasi desktop dan mobile drawer.
3. **[MODIFY] `dashboard/src/App.jsx`**:
   - Mendaftarkan `'agents'` ke dalam `VALID_PAGES` dan merender `AgentsPage` apabila hash `# /agents` aktif.
4. **[MODIFY] `dashboard/server.js`**:
   - Menambah laluan proksi selamat ke backend Bridge:
     - `GET /api/agents/activity` -> `http://mcp-bridge:8000/api/v1/agents/activity`
     - `POST /api/agents/simulate-run` -> `http://mcp-bridge:8000/api/v1/agents/simulate-run`
     - `GET /api/trade/orders` -> `http://mcp-bridge:8000/api/v1/trade/orders`

---

## 4. Pendekatan Alternatif yang Ditolak (Rejected Alternatives)

1. **Memanggil LLM Secara Langsung Setiap 5 Minit untuk Semua Kaunter Watchlist**:
   - *Sebab Ditolak*: Memanggil 4 model LLM untuk puluhan kaunter setiap 5 minit akan mengakibatkan kos token yang melambung tinggi, latensi tinggi (>45 saat), dan risiko kegagalan pematuhan kerana output LLM tidak deterministik. Mengikut Blueprint HOM-114 (Prinsip Teras 1), formula matematik, normalisasi skor, dan 8 Hard Rules dikodkan secara **deterministik Python-first**, manakala logik taakulan kualitatif ejen dipetakan secara berstruktur.
2. **Menjalankan Pesanan Terus ke Akaun Sebenar (Real-Money Production)**:
   - *Sebab Ditolak*: Sangat berisiko tinggi sebelum fasa simulasi terbukti stabil. Fasa 3 dihadkan secara tegas kepada Moomoo OpenD Paper Trading (`MOOMOO_TRD_ENV=SIMULATE`).
3. **Memaparkan Status Ejen Hanya Melalui Log Konsol / CLI Terminal**:
   - *Sebab Ditolak*: Tidak memenuhi keperluan pemohon (Jefri: *"kalau ikut blueprint boleh pantau aktiviti ejen dari dashboard trader. tapi aku tak nmpk ni dalam sistem trader."*). Dashboard berasaskan web diperlukan untuk visualisasi holistik.

---

## 5. Analisis Risiko & Rancangan Mitigasi (Risks & Mitigations)

| Risiko Teknikal | Tahap | Impak | Langkah Mitigasi |
| :--- | :--- | :--- | :--- |
| **OpenD Terputus Sesi (Gateway Disconnected)** | Sederhana | Pesanan simulasi gagal dihantar ke broker. | Prinsip **Fail-Closed**: Pesanan ditolak serta-merta tanpa orphan order. Status gateway dipaparkan secara langsung pada kad Danial/L4 di dashboard. Butang sambung semula disediakan di halaman OpenD. |
| **Keletihan Kuota K-line Moomoo (100 simbol / 30 hari)** | Tinggi | Screener tidak dapat memuat turun K-line baharu. | Calon yang diproses dihadkan ketat oleh `MAX_CANDIDATES_PER_LANE` (lalai 5 per lorong). Penjejak kuota menyemak baki kuota sebelum K-line diminta; jika kuota kritikal, saluran paip beroperasi dalam mod snapshot tanpa K-line. |
| **Pesanan Berganda / Race Conditions** | Sederhana | Saham yang sama dibeli dua kali dalam satu kitaran. | **Rule 7 (Idempotency Key)**: Menggunakan UUID dan hash tesis unik (`symbol + timestamp_window`). Pangkalan data SQLite menolak pesanan pendua melalui indeks `client_order_id PRIMARY KEY`. |
| **Pelanggaran Had Modal & Circuit Breaker** | Tinggi | Kerugian simulasi melebihi had keselamatan. | **Rule 1 (Maksimum 2% risiko modal)** dan **Rule 2 (5% Daily Drawdown Circuit Breaker)** dihitung daripada baseline ekuiti jam 09:30 NY (`equity_baseline.sqlite`). Jika circuit breaker aktif, semua pesanan beli baharu disekat secara mutlak. |
| **Penyegerakan Status Pesanan (Order Desync)** | Rendah | Status pesanan di UI tidak sama dengan status broker. | Modul `PositionReconciler` (`reconciliation.py`) menyegerakkan status pesanan dan posisi terbuka setiap 60 saat dan mengemas kini fail status sentinels. |

---

## 6. Apa yang Tidak Termasuk (Explicitly Out of Scope)

- Perdagangan menggunakan wang sebenar (Live Real-Money Trading).
- Pengubahsuaian konfigurasi rangkaian port hos OpenD (port 11111/22222 kekal terasing dalam Docker network `stock_network`).
- Mengubah prompt sistem atau izin Paperclip agent di luar kod projek `stock_trader`.
- Borang fallback autentikasi dalaman / token input di web UI (Dimansuhkan mengikut arahan Jefri: Capaian web 100% menggunakan Authentik SSO `auth.julietmike.net` dengan lencongan 302 terus tanpa borang login tempatan).

---

## 7. Rancangan Pengujian & Verifikasi (Test Plan & SDLC Checklist)

Mengikut piawaian SDLC Jefri (Langkah 1 hingga 8 serta 5a):

### 7.1 SDLC Langkah 3: Ujian Kod Ringkas (Unit & BVA)
- **Fail Ujian**: `tests/test_agent_pipeline_bva.py`
  - **BVA Skor & Normalisasi Sentimen (Nawwar & Haziq)**:
    - Ujian nilai sempadan sentimen mentah $S_{sent} \in [-100, -99, 0, +59, +60, +61, +100]$.
    - Pengesahan formula normalisasi $S_{sent\_norm} = (S_{sent} + 100) / 2 \in [0, 100]$.
    - Pengesahan ambang saringan awal Nawwar (tolak $S_{sent} < +60$, terima $S_{sent} \ge +60$).
  - **BVA Skor Komposit & Pintu Kelulusan Entri (Haziq)**:
    - Pengesahan formula $S_{total} = (0.65 \times S_{tech}) + (0.35 \times S_{sent\_norm})$.
    - Ujian sempadan pintu entri: $S_{total} = 64.9$ (Ditolak), $S_{total} = 65.0$ (Diterima), $S_{total} = 65.1$ (Diterima).
    - Ujian sempadan syarat wajib: $S_{tech} = 59.9$ walaupun $S_{total} \ge 65.0$ (Ditolak kerana $S_{tech} < 60$).
  - **BVA Saiz Posisi & Exit Formula (Haziq)**:
    - Saiz risiko modal 1.5% ekuiti.
    - Siling saiz posisi maksimum 20% daripada jumlah ekuiti.
    - Pengiraan Stop Loss ($1.5 \times ATR_{14}$) dan Take Profit 1 ($1:1.5$ R:R).
  - **Ujian 8 Hard Rules (Danial L3)**:
    - Menjalankan semula matriks 8 Hard Rules untuk memastikan tiada regresi (Rule 1: 2% risiko, Rule 2: 5% drawdown, Rule 3: PDT, Rule 4: Penny stock < $5, Rule 5: >1% ADV20, Rule 6: Luar waktu dagangan NY 09:45-15:45, Rule 7: Duplicate idempotency key, Rule 8: Kill-switch).
- **Fail Ujian Dashboard API**: `dashboard/test_agents_api.js`
  - Ujian status endpoint `/api/agents/activity`, `/api/agents/simulate-run`, dan `/api/trade/orders`.

### 7.2 SDLC Langkah 4: Ujian Hujung-ke-Hujung (E2E Integration & Playwright)
- **Ujian Integrasi Python**: `tests/test_paper_trading_pipeline_e2e.py`
  - Menguji saluran paip lengkap dari data calon `watchlist.json` sehingga pesanan diterima oleh OpenD SIMULATE account.
- **Ujian E2E Playwright Browser**: `dashboard/test_agents_page_e2e.js`
  - Dijalankan dalam kontena `playwright-inno-x` melalui `/paperclip/bin/pw-browser run`.
  - Menguji antaramuka `https://stock-trader.beta.julietmike.net/#/agents`:
    - Pengesahan paparan tab menu *"Aktiviti Ejen"*.
    - Pengesahan paparan kad Tariq, Nawwar, Haziq, dan Danial.
    - Pengesahan interaksi butang *"Jalankan Simulasi Pipeline"*.
    - Pengesahan jadual transaksi paper trading.
    - Tangkapan skrin bukti pada resolusi Desktop (1280x800) dan Mobile (390x844).

### 7.3 SDLC Langkah 5 & 5a: Semakan Keselamatan & Auth Cloudflare (QA Zahrin)
- Sahkan domain `https://stock-trader.beta.julietmike.net`.
- Sahkan sijil SSL sah `*.beta.julietmike.net`, Force SSL aktif, protokol HTTP/2 aktif.
- Sahkan pengesahan keselamatan origin origin header / token.

### 7.4 SDLC Langkah 7 & 7a: Rujukan Fizikal untuk Semakan Pemohon
- **URL Rasmi**: `https://stock-trader.beta.julietmike.net/#/agents` (Proxy Host 26 pada rangkaian `npm_default`).
- **Artifak Ujian**:
  - Tangkapan skrin Playwright dalam `qa-artifacts/` (Desktop & Mobile).
  - Rekod pesanan simulasi dalam pangkalan data `shared_data/agent_activity.sqlite`.
  - Laporan ringkas 3 baris mengikut format SDLC #7.

---
**Fakhri, Senior Software Engineer (Core AI & Architecture), Home (Fakhri@home-crew.lan)**
