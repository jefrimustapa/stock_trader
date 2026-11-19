# Plan: Sambung Moomoo OpenD (Login + OTP 2FA + Sesi Kekal + Data Sebenar)
Branch: feat/hom-161-moomoo-opend-connection
Issue: https://crew.julietmike.net/HOM/issues/HOM-161
Status: waiting for go (implementation NOT started)

## 1. Goal & Requirements

### Latar Belakang & Matlamat
Menyempurnakan penutup Fasa 1 Seni Bina Pilihan A (HOM-114) berdasarkan Kriteria 7 & 8 Blueprint Seksyen 4. Fasa 1 sebelum ini telah menyediakan infrastruktur kontena, penguatkuasaan 8 Hard Rules keselamatan modal, dan papan pemuka Dashboard dengan Authentik SSO, tetapi gateway broker `moomoo-opend` belum dihubungkan ke akaun sebenar Moomoo. Akibatnya, Dashboard memaparkan status terputus, baki akaun tiada, senarai pantau (watchlist) hanya menggunakan data mock/kosong, dan Sentinel berada dalam mod `OFFLINE`.

Tugasan ini melaksanakan integrasi sambungan Moomoo OpenD sebenar:
1. Log masuk OpenD melalui Telnet CLI (port 22222) berserta pengendalian kod 2FA OTP.
2. Penyimpanan token sesi secara persisten dalam Docker volume `opend_session_data` (`/root/.com.moomoo.OpenD`) supaya sesi kekal bertahan merentasi restart kontena tanpa login semula.
3. Paparan status OpenD `CONNECTED`, mod `SIMULATE`, ID akaun, dan baki akaun (tunai & ekuiti) pada Trading Dashboard.
4. Pengaktifan Screener daemon untuk menarik data pasaran US sebenar melalui Moomoo OpenAPI (`get_stock_screen` Cloud Screening V2) dan mengisi `watchlist.json` dengan kaunter pasaran sebenar (bukan mock).
5. Pengaktifan Sentinel L4 status kepada `ACTIVE` apabila OpenD disahkan bersambung.

### Kriteria Penerimaan Pengguna (Acceptance Criteria)
> **Kriteria Pengguna:** Bila Jefri membuka Trading Dashboard di `https://stock-trader.beta.julietmike.net/`, Jefri melihat status OpenD `CONNECTED`, mod `SIMULATE`, ID akaun dan baki sebenar, serta Watchlist berisi data kaunter pasaran US sebenar; selepas kontena OpenD atau keseluruhan stack direstart, sesi OpenD kekal bersambung tanpa memerlukan log masuk semula.

---

## 2. Topologi Kontena & Pengasingan Seni Bina (Architecture Topology)

OpenD dan Dashboard berjalan di dalam **kontena yang BERBEZA (terpisah sepenuhnya)** mengikut prinsip keselamatan berlapis (Defense-in-Depth):

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Rangkaian Terasing Luaran (npm_default / Cloudflare Tunnel)             │
│   └── stock_trading_dashboard (Node.js Express, Port 3000)             │
│         - Web UI https://stock-trader.beta.julietmike.net/             │
│         - Dilindungi Authentik SSO & Forward Auth                      │
│         - Mengambil data melalui X-Service-Token                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP Internal
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Rangkaian Terpencil Dalaman (stock_network)                            │
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

**Sebab Pengasingan Kontena:**
1. **Keselamatan Ketat**: `moomoo-opend` menguruskan kredensial broker dan port transaksi. Ia tidak mempunyai sebarang eksposisi ke internet atau rangkaian reverse proxy NPM.
2. **Kemandirian Kitaran Hayat (Lifecycle)**: Dashboard boleh diubah suai atau dimulakan semula tanpa memutuskan sesi aktif OpenD. Ujian restart OpenD juga boleh dijalankan secara berasingan tanpa menjejaskan ketersediaan Dashboard.

---

## 3. Findings / Codebase Analysis

Berdasarkan semakan fail kod sedia ada:
1. **`opend/`**:
   - `opend/Dockerfile.opend` memasang Ubuntu 22.04 dan memuat turun binari OpenD dengan semakan SHA256. Port 11111 (API) dan 22222 (Telnet) diekspos ke rangkaian dalaman `stock_network`.
   - `docker-compose.yml` telah memetakan volume `opend_session_data:/root/.com.moomoo.OpenD`. Ini membolehkan sesi OpenD disimpan secara persisten.
2. **`bridge/`**:
   - `bridge/src/moomoo_client.py` kini hanya melakukan ujian soket TCP ringkas (`socket.create_connection`) dan mengembalikan data olok-olok (`accepted_local_mock`, baki `None`). Perlu dipertingkat untuk menyokong query status OpenD, nombor akaun, dan baki tunai/ekuiti sebenar.
   - `bridge/src/telnet_relay.py` telah mempunyai rangka sambungan Telnet CLI ke port 22222 dengan arahan `input_phone_verify_code` dan `logout`. Perlu disokong arahan semakan status dan aliran login awal.
   - `bridge/src/routes/health.py` memulangkan status umum tanpa butiran sambungan broker terperinci (tiada account ID & baki).
   - `bridge/src/reconciliation.py` menetapkan status Sentinel, tetapi status tidak bertukar secara dinamik mengikut kesiapsiagaan sambungan OpenD.
3. **`screener/`**:
   - `screener/src/main.py` menggunakan `generate_mock_market_data()` statik. Perlu dihubungkan ke `moomoo` SDK / OpenD QuoteContext untuk memanggil `get_stock_screen` sebenar bagi Universe pasaran US mengikut kuota 30 hari.
4. **`dashboard/`**:
   - `dashboard/server.js` memaparkan jadual watchlist dari `shared_data/watchlist.json` dan status sentinel dari `shared_data/sentinel_status.json`. Kad status semasa belum memaparkan status sambungan OpenD `CONNECTED`, mod `SIMULATE`, nombor akaun, dan baki akaun.

---

## 4. User Review Required (Pertimbangan & Keputusan Utama)

1. **Kaedah Log Masuk Awal OpenD & OTP 2FA**:
   - Semasa permulaan pertama (bootstrap), OpenD memerlukan log masuk sekali sahaja. Token sesi akan disimpan dalam `opend_session_data`.
   - Log masuk disokong melalui Telnet CLI (`telnet localhost 22222` atau skrip automasi telnet relay).
   - Kod OTP 2FA (SMS/Emel) boleh dimasukkan melalui Telnet atau melalui endpoint Bridge `/api/v1/telnet/otp`.
2. **Kerahsiaan Kredensial**:
   - Tiada kata laluan atau kod OTP akan disimpan dalam kod, git commit, atau komen task.
   - Token sesi yang dijana disimpan secara selamat di dalam fail binari/XML OpenD di dalam Docker volume sahaja.

---

## 5. Proposed Changes

### [MODIFY] `bridge/src/moomoo_client.py`
- Laksanakan fungsi pertanyaan akaun dagangan Moomoo (`get_account_details`, `get_acc_list`) melalui SDK / API OpenD.
- Ekstrak maklumat akaun: status sambungan (`CONNECTED`), mod (`SIMULATE`), nombor akaun broker, baki tunai (cash), dan nilai ekuiti portfolio.
- Kendalikan ralat sambungan dengan tenang tanpa meranapkan Bridge jika OpenD belum bersedia.

### [MODIFY] `bridge/src/telnet_relay.py`
- Tambah kaedah semakan status Telnet OpenD untuk menyemak sama ada OpenD sedang menunggu log masuk, menunggu kod 2FA, atau sudah berjaya log masuk.
- Sokong aliran penghantaran login parameter atau OTP code secara andal.

### [MODIFY] `bridge/src/routes/health.py` & `bridge/src/routes/telnet.py`
- Kemas kini endpoint `/status` Bridge untuk membekalkan data akaun OpenD (`status`, `env`, `account_id`, `cash_balance`, `total_equity`) kepada Dashboard dan ejen Paperclip.
- Tambah endpoint `/api/v1/telnet/status` bagi menyemak status sesi Telnet gateway.

### [MODIFY] `bridge/src/reconciliation.py`
- Kemas kini `PositionReconciler` untuk merekod status `ACTIVE` pada fail `sentinel_status.json` apabila OpenD disahkan `CONNECTED`.

### [MODIFY] `screener/src/main.py` & `screener/src/cloud_screener.py`
- Gantikan panggilan `generate_mock_market_data()` dengan logik pengambilan data pasaran sebenar daripada Moomoo OpenD (`get_stock_screen` V2) mengikut had kuota selamat.
- Tulis senarai kaunter pasaran US sebenar yang melepasi tapisan ke `/app/shared_data/watchlist.json`.

### [MODIFY] `dashboard/server.js`
- Tambah kad pemantauan OpenD pada antaramuka Dashboard:
  - Status Sambungan: `CONNECTED` (badge hijau) / `DISCONNECTED` (badge merah).
  - Mod Persekitaran: `SIMULATE` (badge biru).
  - Nombor Akaun & Baki: Paparan tunai dan ekuiti semasa.
- Kemas kini panggilan `/api/status` untuk menggabungkan metrik akaun OpenD daripada Bridge.

---

## 6. Explicitly NOT Changing (Di Luar Skop)

- **Fasa 2 (Ejen Analisis & Exit Engine)**: Prompt dan peranan AI Tariq, Nawwar, Haziq, pendaftaran MCP Tools, dan logik Exit Sentinel tidak disentuh dalam Fasa 1.
- **Fasa 3 (Dagangan Kertas Automatik)**: Penempatan pesanan automatik penuh (auto order placement), eksekusi TP1/Break-Even, dan Time-based exit.
- **Fasa 4 (Pengaktifan Akaun Nyata)**: Perdagangan wang sebenar (`MOOMOO_TRD_ENV=REAL`).
- **Infrastruktur Luaran**: Rangkaian NPM dan Cloudflare Zero Trust sedia ada kekal tidak berubah.

---

## 7. Risks & Mitigations

1. **Risiko: Sesi OpenD luput atau ditamatkan broker.**
   - *Mitigasi*: Bridge memantau status heartbeat OpenD. Jika status bertukar kepada `DISCONNECTED`, amaran visual dipaparkan di Dashboard dan endpoint Telnet bersedia menerima arahan penyambungan semula.
2. **Risiko: Kehilangan data sesi jika Docker volume dipadam.**
   - *Mitigasi*: Named volume `opend_session_data` diasingkan daripada kitaran `docker compose down`. Panduan operasi menegaskan larangan penggunaan flag `-v`.
3. **Risiko: Melebihi kuota 100 kaunter K-line bulanan Moomoo.**
   - *Mitigasi*: `QuotaTracker` deterministik menyekat langganan tempatan melebihi had dan menggunakan `get_stock_screen` awan Moomoo untuk tapisan awal 244+ faktor.
4. **Risiko: Kebocoran kredensial dalam log OpenD atau Telnet.**
   - *Mitigasi*: Semua fungsi telnet relay menapis parameter sensitif daripada log konsol.

---

## 8. Verification Plan & SDLC Checklist

### Langkah SDLC:
- [x] 1. Jalankan `/git-branch`, cipta branch `feat/hom-161-moomoo-opend-connection`.
- [x] 2. Kriteria Penerimaan Pengguna & Reka Bentuk disahkan sebelum kod.
- [ ] 3. Development & Ujian Unit (BVA & Branch Coverage maks 15 min):
  - Ujian BVA pada `TelnetRelayClient` (input OTP kosong, 6 digit, 8 digit, aksara khas).
  - Ujian Branch Coverage pada `MoomooClient` untuk status `CONNECTED` vs `DISCONNECTED`.
  - Ujian penapisan kuota pada `QuotaTracker`.
- [ ] 4. Test Hujung-ke-Hujung (E2E) Melalui Laluan Sebenar:
  - Ujian 1: Jalankan stack kontena `docker compose up -d`.
  - Ujian 2: Masukkan sesi Moomoo & OTP 2FA melalui Telnet relay.
  - Ujian 3: Sahkan status `CONNECTED` dan baki akaun diperoleh dari OpenD.
  - Ujian 4: Sahkan Screener menjana `watchlist.json` dengan kaunter pasaran US sebenar dan Sentinel berstatus `ACTIVE`.
  - Ujian 5: Uji persistensi sesi — jalankan `docker compose restart moomoo-opend`, sahkan sesi kekal `CONNECTED` tanpa login semula.
- [ ] 5. Semakan Bebas QA Zahrin.
- [ ] 5a. Semakan Keselamatan & Auth (SSL *.beta.julietmike.net, HTTP/2, Authentik SSO/Forward Auth, tiada pendedahan kredensial).
- [ ] 6. Kemas kini tiket GitHub / Paperclip.
- [ ] 7. Semakan fizikal di `https://stock-trader.beta.julietmike.net/`.
