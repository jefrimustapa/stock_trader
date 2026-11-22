# Pelan Pelaksanaan: Ciri TRADING_MODE (Day vs Swing Trading)

**Rujukan Tugasan:** HOM-328 (Induk: HOM-327, Nenek Moyang: HOM-47, GitHub Issue: #14)  
**Arkitek / Software Lead:** Fakhri (Senior Software Engineer - Core AI & Architecture)  
**Pemohon / Pengesah:** Jefri  
**Penyemak Bebas / QA Gatekeeper:** Zahrin  
**Branch:** `feat/issue-14-trading-mode-support` (Base: `main`)  
**Status:** Menunggu Kelulusan Pemohon (Fasa 1: Perancangan Seni Bina)  

---

## 1. Kriteria Penerimaan Pengguna (Acceptance Criteria)

1. **Bila pengguna menetapkan `TRADING_MODE=DAY`:**
   - Sistem beroperasi dalam mod Intraday: L0 mengimbas pasaran setiap 300s dengan kriteria momentum 5M; Tariq menggunakan K-line 5M/15M Wyckoff; Nawwar menyekat saham dengan earnings < 5 hari; Haziq mengehadkan risiko kepada 1.5%–2.0% ekuiti dan sasaran R:R min 1:2; Danial menguatkuasakan had PDT (< $25k), Time-Exit mandatori 15:45 NY, dan `time_in_force=TimeInForce.DAY`; Exit Sentinel membatalkan pesanan belum diisi pada jam 16:00 NY; Dashboard memaparkan lencana status `[MOD: DAY (INTRADAY)]` dan countdown 5-minit.

2. **Bila pengguna menetapkan `TRADING_MODE=SWING`:**
   - Sistem beroperasi dalam mod Multi-Day Swing: L0 menjalankan kitaran asas berjadual struktur 4H/Daily (09:00, 13:00, 16:30 NY) berpandukan 20-EMA breakout dan 50-SMA volume surge serta pengesanan zon minat; Tariq menggunakan analisis makro Top-Down 4H/Daily dan pemicu adaptif 1H (`KLType.K_60M`) apabila harga menghampiri zon tindakan (maks 3–5 simbol) dengan SL $1.5 \times ATR_{1H}$; Nawwar menguatkuasakan sekatan earnings < 14 hari dan kalendar makro 14 hari; Haziq mengehadkan risiko kepada maks 1.0% ekuiti dan sasaran R:R min 1:3; Danial mengecualikan had PDT untuk pegangan > 1 hari, menyahaktifkan Time-Exit 15:45 NY bagi membenarkan pegangan semalaman, dan menetapkan `time_in_force=TimeInForce.GTC`; Exit Sentinel mendaftarkan Hard Stop Loss GTC terus di pelayan broker Moomoo sebaik sahaja pesanan diisi, mengekalkan pesanan GTC merentas hari, dan menjalankan pemantauan adaptif (09:00, 13:00, 16:30 NY + 1H 10:30–15:30 NY serta amaran volatiliti > 2.5x ATR); Dashboard memaparkan lencana status `[MOD: SWING (MULTI-DAY)]` dan status radar pemantauan adaptif top-down.

3. **Bila pengguna tidak menetapkan pembolehubah `TRADING_MODE` (atau nilai tidak sah):**
   - Sistem bertindak secara selamat (*fail-safe fallback*) kepada mod `DAY` tanpa sebarang ralat atau regresi fungsi sedia ada.

---

## 2. Keperluan & Analisis Spesifikasi (Requirements Analysis)

Berasaskan `BLUEPRINT.md` Seksyen 7 dan GitHub Issue #14:

| Lapisan Sistem | Parameter / Komponen | Mod DAY (`TRADING_MODE=DAY`) | Mod SWING (`TRADING_MODE=SWING`) |
| :--- | :--- | :--- | :--- |
| **Konfigurasi** | Pembolehubah Persekitaran | `TRADING_MODE=DAY` (Lalai) | `TRADING_MODE=SWING` |
| **L0 Screener** | Kekerapan Imbasan | Setiap 300 saat (5 minit) | Jadual 4H/Daily (09:00, 13:00, 16:30 NY) + semakan adaptif 1H zon minat |
| | Kriteria Saringan | Momentum 5M, RVOL intraday, julat sesi | 20-EMA breakout, 50-SMA volume surge harian, pengesanan Order Block/SR |
| **L1 Tariq** | Timeframe & Analisis | `KLType.K_5M`, `KLType.K_15M` (Wyckoff) | `KLType.K_DAY`, `KLType.K_60M` adaptif (Top-Down Wyckoff & SMC CHoCH) |
| | Kuota K-line | Saringan awan berkala | Maks 3–5 simbol serentak dalam zon tindakan 1H; unsubs serta-merta bila keluar zon |
| **L1 Nawwar** | Sekatan Earnings & Berita | `days_to_earnings < 5` hari, berita 24j | `days_to_earnings < 14` hari, kalendar makro 14 hari (FOMC/CPI/PPI) |
| **L2 Haziq** | Had Risiko Modal | 1.5% – 2.0% nilai ekuiti | Maksimum 1.0% nilai ekuiti (mitigasi overnight gap) |
| | Sasaran Nisbah R:R | Minimum 1:2 | Minimum 1:3 (SL persis 1.5x ATR 1H) |
| **L3 Danial** | Semakan Had PDT | Wajib (< $25k maks 3 day trades / 5 hari) | Dikecualikan untuk pegangan > 1 hari perniagaan |
| | Time-Exit 15:45 NY | **Wajib Aktif** (Tutup semua posisi) | **Dinyahaktifkan** (Membenarkan pegangan semalaman) |
| | Sifat Pesanan Broker | `TimeInForce.DAY` | `TimeInForce.GTC` (Good-Til-Cancelled) |
| **L4 Sentinel** | Trailing Stop & Perlindungan | Intraday Chandelier (tick-by-tick) | Daily/4H Bar-Close Trailing + pengetatan adaptif 1H; Hard SL GTC di pelayan broker |
| | Rekonsiliasi Pesanan | Pembatalan pesanan belum diisi 16:00 NY | Mengekalkan pesanan GTC aktif merentas hari |
| **Dashboard UI** | Bar Status & Pemantauan | Lencana `[MOD: DAY (INTRADAY)]`, countdown 5M | Lencana `[MOD: SWING (MULTI-DAY)]`, status pemantauan adaptif 4H/1H |

---

## 3. Fail & Modul yang Akan Diubah

1. **Konfigurasi & Orkestrasi:**
   - `.env`, `.env.example`: Tambah baris `TRADING_MODE=DAY`.
   - `docker-compose.yml`: Suntik `TRADING_MODE=${TRADING_MODE:-DAY}` ke servis `screener-daemon`, `mcp-bridge`, dan `dashboard`.

2. **L0 Screener (`screener/`):**
   - `screener/src/config.py`:
     - Tambah `TRADING_MODE` (default `"DAY"`).
     - Tambah parameter konfigurasi Swing: `SWING_BASELINE_SCHEDULE` ("09:00,13:00,16:30"), `SWING_EMA_PERIOD` (20), `SWING_VOL_SMA_PERIOD` (50).
   - `screener/src/cloud_screener.py`:
     - Tambah kaedah saringan struktur 4H/Daily untuk mod Swing.
     - Tambah logik pengesanan zon minat / Order Block.
   - `screener/src/main.py`:
     - Pengesanan mod: Kitaran 300s untuk `DAY` vs kitaran berasaskan jadual waktu NY untuk `SWING`.
     - Logik pemicu adaptif 1H untuk simbol dalam zon tindakan.

3. **L1 - L4 Bridge (`bridge/`):**
   - `bridge/src/config.py`:
     - Tambah `TRADING_MODE` (default `"DAY"`).
   - `bridge/src/hard_rules.py`:
     - Model `OrderRequest`: Tambah `time_in_force: Literal["DAY", "GTC"] = "DAY"`, `trading_mode: Literal["DAY", "SWING"] = "DAY"`, `holding_days: int = 0`.
     - `validate_rule1_max_risk`: Had risiko 2.0% untuk `DAY` vs 1.0% untuk `SWING`.
     - `validate_rule3_pdt`: Pengecualian jika `trading_mode == "SWING"` dan `holding_days >= 1`.
     - `validate_rule6_trading_window`: Laraskan tetingkap dagangan untuk `SWING` (membenarkan entri merentas waktu pasaran dan tidak memaksa pembatalan/penutupan 15:45 NY).
   - `bridge/src/agent_pipeline.py`:
     - Tariq: Pelarasan timeframe `5M/15M` vs `4H/Daily + 1H adaptif`.
     - Nawwar: Had `days_to_earnings < 5` vs `< 14`.
     - Haziq: Pengiraan saiz risiko 1.5%–2.0% vs 1.0% dan sasaran R:R min 1:2 vs 1:3.
     - Danial: Penetapan `time_in_force = TimeInForce.GTC` (Swing) vs `TimeInForce.DAY` (Day).
   - `bridge/src/reconciliation.py`:
     - Pendaftaran Hard Stop Loss GTC di pelayan broker sebaik sahaja fill berlaku.
     - Trailing stop berasaskan bar close Daily/4H untuk Swing.
     - Kitaran pemantauan adaptif 09:00, 13:00, 16:30 NY + pemicu 1H (10:30–15:30 NY) serta amaran volatiliti > 2.5x ATR.
   - `bridge/src/routes/health.py`:
     - Tambah `trading_mode: BridgeConfig.TRADING_MODE` dalam respons `/status`.

4. **Dashboard Frontend & Backend (`dashboard/`):**
   - `dashboard/server.js`: Sertakan `trading_mode` daripada persekitaran atau bridge status ke respons `/api/status`.
   - `dashboard/src/components/Layout.jsx`:
     - Paparkan lencana status `[MOD: DAY (INTRADAY)]` (warna info/primary) atau `[MOD: SWING (MULTI-DAY)]` (warna secondary/purple) bersebelahan lencana OpenD.
   - `dashboard/src/pages/OverviewPage.jsx` & `dashboard/src/pages/L0Page.jsx`:
     - Tambah paparan mod pemantauan (countdown 5 minit untuk Day vs status top-down 4H/1H radar untuk Swing).

5. **Ujian Automasi (`tests/`):**
   - `tests/test_trading_mode_bva.py`: Ujian BVA konfigurasi, had risiko (1.0% vs 2.0%), had earnings (5 vs 14 hari), had PDT (0 hari vs >= 1 hari), dan tingkap masa (15:45 NY).
   - `tests/test_trading_mode_pipeline.py`: Ujian integrasi pipeline L0 -> L4 bagi mod `DAY` dan `SWING`.
   - `tests/test_trading_mode_dashboard_e2e.js`: Ujian Playwright untuk paparan UI lencana dan kad status mod.

---

## 4. Pendekatan Reka Bentuk & Alternatif yang Ditolak

- **Pendekatan Dipilih:**
  - *Single Source of Truth via Environment Toggle:* `TRADING_MODE=DAY|SWING`. Semua lapisan merujuk konfigurasi yang sama secara berpusat, mengekalkan struktur kod modular tanpa penduaan kod (*zero duplication*). Mod lalai `DAY` menjamin *backward compatibility* sepenuhnya.
  - *Adaptive Top-Down Multi-Timeframe Monitoring:* Dalam mod Swing, pemantauan makro 4H/Daily dijalankan berkala, manakala langganan K-line 1H diaktifkan secara adaptif dan terhad kepada calon dalam zon tindakan (maks 3–5 simbol serentak), serta dibatalkan serta-merta apabila keluar zon. Ini menjimatkan >75% kuota K-line Moomoo OpenAPI.

- **Alternatif yang Ditolak:**
  - *Alternatif 1: Memisahkan kod kepada dua perkhidmatan mikro berasingan (Screener Day vs Screener Swing).*  
    *Sebab Ditolak:* Menghasilkan penduaan kod (*code duplication*), meningkatkan kos penyelenggaraan dan beban operasi pelayan.
  - *Alternatif 2: Langganan berterusan K-line 1H untuk semua saham dalam watchlist Swing.*  
    *Sebab Ditolak:* Membazir kuota 100 simbol 30-hari Moomoo OpenAPI dan berisiko melanggar had kadar API (10 req/s). Pendekatan adaptif jauh lebih efisien.
  - *Alternatif 3: Pertukaran mod melalui parameter URL klien secara ad-hoc.*  
    *Sebab Ditolak:* Menimbulkan risiko keselamatan persekutuan data dan integriti keputusan ejen. Mod mesti ditentukan secara deterministik di peringkat persekitaran pelayan.

---

## 5. Analisis Risiko & Mitigasi

1. **Risiko Jurang Harga Semalaman (Overnight Gap Down) dalam Mod Swing:**
   - *Impak:* Kerugian melebihi had henti rugi sekiranya pasaran dibuka menjunam.
   - *Mitigasi:* Had risiko Haziq diturunkan daripada 2.0% kepada maks 1.0% ekuiti; Exit Sentinel segera mendaftarkan pesanan Hard Stop Loss GTC di pelayan Moomoo sebaik sahaja fill; Nawwar menguatkuasakan larangan ketat saham menjelang pengumuman pendapatan (`days_to_earnings < 14`).

2. **Risiko Pelanggaran Peraturan PDT jika Posisi Swing Ditutup Hari Sama:**
   - *Impak:* Pembekuan akaun perdagangan margin jika ekuiti < $25,000.
   - *Mitigasi:* Danial menjejaki tarikh pembukaan posisi (`holding_days`); jika posisi dibuka dan ditutup pada tarikh dagangan yang sama, kiraan PDT direkodkan; jika dipegang merentas malam (`holding_days >= 1`), kiraan PDT dikecualikan.

3. **Risiko Kebocoran Kuota K-line Moomoo OpenAPI:**
   - *Impak:* Kuota 100 simbol bulanan habis sebelum tempoh 30 hari.
   - *Mitigasi:* K-line 1H dikawal ketat oleh `QuotaTracker` dengan kuota dinamik maksimum 3–5 simbol aktif, dan dibatalkan serta-merta apabila keluar daripada zon minat.

4. **Risiko Regresi Tingkah Laku Sedia Ada:**
   - *Impak:* Gangguan kepada operasi dagangan intraday sedia ada.
   - *Mitigasi:* Nilai lalai kekal `TRADING_MODE=DAY`; suite ujian pytest sedia ada mesti lulus 100% tanpa sebarang pengubahsuaian jangkaan.

---

## 6. Rancangan Pengujian & Pengesahan SDLC

### Langkah 3(a): BVA (Boundary Value Analysis) & Liputan Cawangan
- Pengesahan input `TRADING_MODE`: `DAY`, `SWING`, nilai tidak sah / kosong -> fallback `DAY`.
- BVA Had Risiko Haziq: Nilai tepat pada sempadan 1.000% vs 1.001% (Swing), 2.000% vs 2.001% (Day).
- BVA Earnings Gate Nawwar: 13 hari vs 14 hari vs 15 hari (Swing), 4 hari vs 5 hari vs 6 hari (Day).
- BVA Peraturan PDT Danial: Posisi intraday (0 hari) vs posisi overnight (1 hari, 2 hari) pada ekuiti $24,999 vs $25,000.
- BVA Waktu Dagangan Rule 6: 15:44:59 vs 15:45:00 NY dalam mod `DAY` (ditolak) vs `SWING` (diterima).

### Langkah 3(b): Ujian Mutasi & Property-Based
- Mutasi manual pada syarat cawangan `if trading_mode == "SWING":` dalam `hard_rules.py` dan `agent_pipeline.py`.
- Pengujian parser format masa jadwal saringan Swing (09:00, 13:00, 16:30 NY).

### Langkah 4: Ujian Hujung-ke-Hujung (E2E)
- Simulasi kitaran penuh mod `DAY`: Screener 5M -> Tariq 5M/15M -> Nawwar (< 5 hari) -> Haziq (2.0%, R:R 1:2) -> Danial (DAY, PDT, Time-Exit) -> L4 Order execution.
- Simulasi kitaran penuh mod `SWING`: Screener 4H/Daily -> Tariq (4H + adaptif 1H) -> Nawwar (< 14 hari) -> Haziq (1.0%, R:R 1:3) -> Danial (GTC, exempt PDT overnight, no 15:45 kill) -> L4 GTC order + broker hard SL.

### Langkah 5 & 5a: QA Bebas Zahrin & Semakan Keselamatan Cloudflare
- Zahrin mengesahkan kedua-dua mod secara bebas melalui ujian konsol / API.
- Semakan Keselamatan Cloudflare (5a): Mengesahkan sijil SSL `*.beta.julietmike.net`, Force SSL, HTTP/2, serta validasi dwiarah JWT header `cf-access-jwt-assertion` dan kuki `CF_Authorization`.

### Langkah 7 & 7a: Rujukan Fizikal & Semakan Pemohon
- Servis web dashboard dijalankan pada rangkaian Docker `npm_default`.
- URL rasmi Cloudflare Named Tunnel: `https://stock-trader.beta.julietmike.net`.
- Semakan visual Playwright melalui kontena `playwright-inno-x` membuktikan paparan lencana `[MOD: DAY (INTRADAY)]` dan `[MOD: SWING (MULTI-DAY)]`.

---

## 7. Apa yang Tidak Termasuk (Explicit Non-Goals)

1. Dagangan langsung (*live trading*) dengan wang sebenar — sistem kekal di bawah persekitaran simulasi kertas (*Paper Trading* / `MOOMOO_TRD_ENV=SIMULATE`).
2. Sokongan mod Scalping (sub-minit) dan Position Trading (pelaburan jangka panjang berbulan-bulan) — seperti yang diperincikan dalam Seksyen 7.1 `BLUEPRINT.md`, gaya ini tidak sesuai dengan latensi dan kekerapan sistem ejen.
3. Mengubah kata laluan atau kunci kriptografi akaun Moomoo OpenD.
