# Plan: Halaman Berasingan 'Kuota K-line' di Dashboard
Branch: feat/hom-189-screener-settings-panel
Issue: https://crew.julietmike.net/HOM/issues/HOM-210 (Induk: HOM-189)
Status: waiting for go (implementation NOT started)

## 1. Goal & Requirements

### Permintaan Pemohon (Jefri, HOM-189)
> *"A + B (tapi perlu ada page berasingan - xsesuai nak penuhkan di dashboard - dashboard tunjuk remaining then boleh klik untuk tgk detail)"*

### Latar Belakang & Masalah
- Dashboard paparan utama (*Overview*) kini memaparkan kad ringkas Penjejak Kuota API K-Line 30-Hari yang menunjukkan baki kuota (contoh: 93/100).
- Apabila kad ini diklik pada masa sekarang, ia membawa pengguna ke `#/watchlist` dan bukan ke paparan perincian kuota.
- Pengguna tidak mempunyai paparan khusus untuk melihat senarai simbol yang sedang menggunakan kuota Moomoo OpenAPI (had 100 simbol unik bergolek 30 hari), bila ia mula dikira, bila ia luput, berapa hari tinggal, dan kekerapan permintaannya.
- Memaparkan keseluruhan jadual perincian kuota pada halaman utama *Overview* akan memenuhkan susun atur papan pemuka yang sepatutnya ringkas dan fokus kepada KPI sistem.

### Objektif Utama
1. **Kad Ringkas di Overview**: Kekalkan paparan kad ringkas kuota di halaman Overview (baki / 100) dan pastikan klik pada kad tersebut membawa pengguna ke halaman baharu `#/quota`.
2. **Halaman Berasingan (`#/quota`)**: Halaman khusus bertema Sneat (MUI v6) dengan susun atur responsif (Desktop & Mobile) yang memaparkan:
   - Metrik ringkasan (Baki Kuota, Simbol Aktif, Peratus Penggunaan, Status Enjin).
   - Jadual terperinci simbol yang memakan kuota: Ticker Simbol, Tarikh Mula Dikira (ISO UTC & paparan tempatan), Tarikh Luput (+30 hari), Baki Hari / Hari Tinggal (*countdown*), Kekerapan Permintaan (*request count*), dan Status Kuota.
3. **Endpoint API Baca-Sahaja (`GET /api/screener/kline-quota`)**:
   - Dibina dalam `dashboard/server.js` dengan pengesahan keselamatan sesi sedia ada (`authenticateDashboard`).
   - Membaca terus dari fail pangkalan data SQLite `quota_tracker.sqlite` (jadual `kline_quota_history`) menggunakan mod baca-sahaja (`readOnly: true`) melalui enjin bawaan Node 24 `node:sqlite`.
   - **TIDAK mengubah** sebarang logik, skema, atau fail `screener/src/quota_tracker.py`.

---

## 2. Kriteria Penerimaan Pengguna (Acceptance Criteria)

> **Kriteria Pengguna:** Bila pengguna buka Overview, pengguna nampak kad ringkas kuota K-line (baki/100); bila klik kad itu, pengguna dibawa ke halaman berasingan yang papar senarai simbol yang makan kuota beserta tarikh dikira dan tarikh luput (+30 hari), baki, dan hari tinggal.

---

## 3. Seni Bina & Sumber Data (Architecture & Ground Truth)

### Punca Data Tunggal (Single Source of Truth)
- Berdasarkan siasatan Subtask A (Prakash - HOM-209), rekod kuota disimpan dalam pangkalan data SQLite di volum berkongsi Docker:
  - Lokasi hos / volum: `shared_trading_data` -> `/app/shared_data/quota_tracker.sqlite`.
  - Jadual: `kline_quota_history`.
  - Skema jadual:
    ```sql
    CREATE TABLE IF NOT EXISTS kline_quota_history (
        symbol TEXT PRIMARY KEY,
        first_requested_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 1
    );
    ```
  - Data semasa yang disahkan aktif (7 simbol):
    - `US.MGCLY` (Luput: 2026-12-15T02:34:16Z)
    - `US.VVVV` (Luput: 2026-12-15T02:34:16Z)
    - `US.SMA` (Luput: 2026-12-15T02:34:16Z)
    - `US.SMPNY` (Luput: 2026-12-15T02:34:16Z)
    - `US.ONC` (Luput: 2026-12-15T02:34:16Z)
    - `US.JPPTY` (Luput: 2026-12-15T11:05:43Z)
    - `US.GFR` (Luput: 2026-12-15T11:05:43Z)
  - Had kuota Moomoo OpenAPI: 100 simbol unik dalam tetingkap bergolek 30 hari.

### Topologi Aliran Data
```text
┌────────────────────────────────────────────────────────────────────────┐
│ stock_trading_dashboard (Node 24 Alpine, Express Port 3000)            │
│   ├── Frontend Route: Hash #/quota -> QuotaPage.jsx (MUI v6 Sneat)    │
│   ├── Overview Card: KpiCards.jsx Card 4 onClick -> #/quota            │
│   └── API: GET /api/screener/kline-quota (readOnly: true)             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Membaca secara baca-sahaja (0 write)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Docker Shared Volume: /app/shared_data/quota_tracker.sqlite            │
│   └── Table: kline_quota_history                                       │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ Dikemas kini semasa kitaran screener
┌───────────────────────────────────┴────────────────────────────────────┐
│ stock_screener_daemon (Python 3.11/3.13)                               │
│   └── screener/src/quota_tracker.py (QuotaTracker Engine)              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Fail & Modul yang Terlibat

### 1. Backend (`dashboard/server.js`) - [MODIFY]
- Tambah fungsi pembaca pangkalan data `quota_tracker.sqlite` menggunakan `DatabaseSync(quotaDbPath, { readOnly: true })`.
- Tambah endpoint baca-sahaja berotentikasi:
  - `GET /api/screener/kline-quota`
  - Mengira baki hari (*days_remaining*) bagi setiap simbol berasaskan waktu UTC semasa.
  - Memulangkan struktur JSON yang lengkap dengan data ringkasan dan senarai simbol teratur mengikut tarikh luput terdekat.

### 2. Frontend Navigation (`dashboard/src/App.jsx` & `dashboard/src/components/Layout.jsx`) - [MODIFY]
- Kemas kini senarai halaman sah:
  `const VALID_PAGES = ['overview', 'opend', 'funnel', 'watchlist', 'settings', 'quota'];`
- Tambah pautan navigasi dalam bar sisi (*Sidebar drawer*) di `Layout.jsx`:
  - ID: `quota`
  - Label: `Kuota K-Line`
  - Subtitle: `Penggunaan 30-Hari & Luput`
  - Ikon: `QueryStatsIcon` atau `PieChartIcon`.
- Render `QuotaPage` apabila `currentPage === 'quota'`.

### 3. Kad KPI Utama (`dashboard/src/components/KpiCards.jsx` & `OverviewPage.jsx`) - [MODIFY]
- Ubah Card 4 (Penjejak Kuota K-Line) di `KpiCards.jsx`:
  - Navigasi `onClick`: Tukar daripada `#/watchlist` kepada `#/quota`.
  - Tooltip/Title: Kemas kini kepada *"Klik untuk lihat perincian kuota K-Line 30-hari"*.
  - Kekalkan elemen penunjuk baki (contoh: "93 Baki / 100 Guna") dan *progress bar* supaya Overview kekal kemas tanpa jadual panjang.
- Ubah pautan/kad rujukan kecil di `OverviewPage.jsx` jika berkaitan supaya konsisten menghala ke `#/quota`.

### 4. Halaman Baharu (`dashboard/src/pages/QuotaPage.jsx`) - [NEW]
- Halaman baharu berasaskan komponen MUI v6 dengan gaya tema Sneat:
  - **Header Halaman**: Tajuk `Penggunaan Kuota K-Line 30-Hari`, lencana had 100 simbol, dan butang Muat Semula (*Refresh*).
  - **Kad KPI Metrik Ringkas**:
    - Kad 1: Baki Kuota (contoh: 93 Baki).
    - Kad 2: Simbol Digunakan (contoh: 7 / 100).
    - Kad 3: Peratus Penggunaan (7%).
    - Kad 4: Status Kesihatan Kuota (SIHAT / AMARAN).
  - **Jadual Data (*Data Table*)**:
    - Kolum: Simbol (Ticker + Chip), Tarikh Permohonan Pertama, Tarikh Luput (+30 Hari), Hari Tinggal (Lencana Hari), Kekerapan Panggilan, dan Status.
    - Ciri carian/tapis simbol pantas.
    - Sokongan paparan responsif desktop & mudah alih (jadual mendatar lancar dengan `overflowX: 'auto'`).
    - Keadaan kosong (*Empty state*) jika tiada simbol direkodkan.

### 5. Ujian & Skrip Ujian - [NEW / MODIFY]
- `dashboard/test_kline_quota_api.js` - [NEW]: Ujian unit & BVA bagi endpoint API kuota baca-sahaja.
- `dashboard/test_dashboard_playwright.js` - [MODIFY]: Tambah senario ujian Playwright untuk klik kad kuota di Overview dan pengesahan paparan jadual di `#/quota` (memastikan 49/49 ujian sedia ada kekal lulus).

---

## 5. Spesifikasi Endpoint API (`GET /api/screener/kline-quota`)

### Request
- **Kaedah**: `GET`
- **Laluan**: `/api/screener/kline-quota`
- **Auth**: Authentik Forward Auth / Sesi Dashboard (`authenticateDashboard`)

### Response Format (JSON)
```json
{
  "total_quota": 100,
  "used_quota": 7,
  "remaining_quota": 93,
  "percent_used": 7.0,
  "status": "HEALTHY",
  "as_of": "2026-11-15T14:10:00.000Z",
  "symbols": [
    {
      "symbol": "US.MGCLY",
      "first_requested_at": "2026-11-15T02:34:16.974954+00:00",
      "expires_at": "2026-12-15T02:34:16.974954+00:00",
      "request_count": 139,
      "days_remaining": 30,
      "status": "ACTIVE"
    },
    {
      "symbol": "US.VVVV",
      "first_requested_at": "2026-11-15T02:34:16.978465+00:00",
      "expires_at": "2026-12-15T02:34:16.978465+00:00",
      "request_count": 139,
      "days_remaining": 30,
      "status": "ACTIVE"
    }
  ]
}
```

### Logik Pengiraan
- `days_remaining = Math.max(0, Math.ceil((new Date(expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))`
- Jika `days_remaining === 0` atau waktu luput telah berlalu: status = `"EXPIRED"`.
- Jika tiada fail atau pangkalan data kosong: kembalikan `used_quota: 0`, `remaining_quota: 100`, `symbols: []` dengan status HTTP 200 (kalis ralat/fail-soft).

---

## 6. Pendekatan & Alternatif yang Ditolak

1. **Alternatif Ditolak 1: Memasukkan jadual simbol terus ke dalam halaman Overview**
   - *Sebab Ditolak*: Jefri memberikan arahan jelas: *"A + B (tapi perlu ada page berasingan - xsesuai nak penuhkan di dashboard - dashboard tunjuk remaining then boleh klik untuk tgk detail)"*. Memasukkan jadual sehingga 100 baris merosakkan visual hierarchy dan membebankan skrin utama.
2. **Alternatif Ditolak 2: Mengubah suai skema atau logik `screener/src/quota_tracker.py`**
   - *Sebab Ditolak*: Arahan menyatakan dengan tegas: *"jangan ubah logik QuotaTracker"*. Skema SQLite sedia ada telah merekodkan semua medan yang diperlukan (`symbol`, `first_requested_at`, `expires_at`, `request_count`). Tiada sebab untuk mengubah modul Python teras.
3. **Alternatif Ditolak 3: Menghantar panggilan API ke Bridge daemon sebelum ke SQLite**
   - *Sebab Ditolak*: Menambah lapisan rangkaian (*network hop*) dan kebergantungan yang tidak perlu. Dashboard dan screener berkongsi volum Docker `/app/shared_data`. Pembacaan terus SQLite menggunakan pemacu Node 24 native `node:sqlite` dengan bendera `readOnly: true` adalah jauh lebih pantas (<1 milisaat) dan terasing sepenuhnya daripada proses lain.

---

## 7. Analisis Risiko & Langkah Pencegahan (Risks & Mitigations)

| Risiko | Keterukan | Langkah Pencegahan |
|---|---|---|
| **Akses Konkuren SQLite (Database Lock)** | Rendah | Menggunakan bendera `readOnly: true` semasa membuka `quota_tracker.sqlite`. Pembaca tidak akan mengenakan kunci eksklusif ke atas pangkalan data, membolehkan `stock_screener_daemon` menulis tanpa sebarang gangguan. |
| **Ketiadaan Fail Pangkalan Data Semasa Mula** | Sederhana | Kod backend menyemak kewujudan fail (`fs.existsSync`). Sekiranya fail belum wujud atau kosong, sistem memulangkan data lalai yang sah (100 baki, 0 diguna) tanpa meletupkan aplikasi (*fail-safe zero crash*). |
| **Isu Perbezaan Zon Masa (*Timezone Offsets*)** | Sederhana | Tarikh disimpan dan dihantar dalam format standard ISO 8601 UTC. Pengiraan baki hari menggunakan perbezaan milisaat UTC mutlak, dan UI memaparkan format mesra pengguna. |
| **Regresi Ujian E2E Playwright Sedia Ada (49/49)** | Tinggi | Melindungi semua atribut ID dan selector sedia ada (`#overview`, `#chip-opend-status`, `#btnSignOut`, dll). Menjalankan kitaran penuh `test:playwright` untuk memastikan tiada sebarang regresi berlaku. |

---

## 8. Pelan Ujian Komprehensif (SDLC 1 - SDLC 8)

Mengikut tatacara SDLC yang diluluskan:

1. **SDLC 1 (Branch)**:
   - Branch: `feat/hom-189-screener-settings-panel`.
2. **SDLC 2 (Kriteria Pengguna)**:
   - "Bila pengguna buka Overview, pengguna nampak kad ringkas kuota K-line (baki/100); bila klik kad itu, pengguna dibawa ke halaman berasingan yang papar senarai simbol yang makan kuota beserta tarikh dikira dan tarikh luput (+30 hari), baki, dan hari tinggal."
3. **SDLC 3 (Ujian Unit, BVA & Branch Coverage)**:
   - Fail ujian baharu: `dashboard/test_kline_quota_api.js`.
   - **BVA (Boundary Value Analysis)**:
     - 0 simbol digunakan: `remaining = 100`, `used = 0`.
     - 100 simbol digunakan: `remaining = 0`, `used = 100`.
     - Simbol dengan baki hari sempadan: 0 hari (luput hari ini), 1 hari, 29 hari, 30 hari.
     - Pengendalian fail SQLite tiada / rosak -> memulangkan respons selamat tanpa ranap.
   - **Branch Coverage**: 100% liputan pada fungsi pembaca kuota SQLite dan pengiraan baki hari.
   - **Mutation Testing**: Ujian mutan manual pada perbandingan tarikh luput (`now >= expires_at` vs `now > expires_at`).
   - **Property-based Testing**: Tidak berkenaan (struktur rekod SQLite terurus).
4. **SDLC 4 (Ujian E2E Playwright)**:
   - Menjalankan suite Playwright penuh merentasi Chromium (Mobile 390x844 & Desktop 1280x800):
     - Uji klik Card 4 di Overview -> Sahkan pelayar bertukar ke `#/quota`.
     - Sahkan halaman `#/quota` memaparkan tajuk, 4 kad ringkasan metrik, dan jadual simbol.
     - Sahkan 7 simbol aktif (`US.MGCLY`, `US.VVVV`, `US.SMA`, `US.SMPNY`, `US.ONC`, `US.JPPTY`, `US.GFR`) terpapar dalam jadual bersama tarikh luput dan hari tinggal.
     - Sahkan reka bentuk responsif Sneat tanpa limpahan mendatar (*horizontal overflow*).
     - Kekalkan 49/49 ujian sedia ada dalam keadaan hijau.
5. **SDLC 5 & 5a (QA Zahrin & Semakan Keselamatan)**:
   - Mengesahkan URL `https://stock-trader.beta.julietmike.net/#/quota` dilindungi oleh sijil SSL sah `*.beta.julietmike.net`, protokol HTTP/2 aktif, dan perlindungan Authentik Forward Auth (302 ke outpost login untuk pelawat tanpa sesi).
6. **SDLC 6 (Kemas Kini Tiket)**:
   - Kemas kini status subtask Paperclip dan GitHub jika ada.
7. **SDLC 7 & 7a (Rujukan Fizikal)**:
   - URL Fizikal: `https://stock-trader.beta.julietmike.net/#/quota`.
   - Sediakan laporan semakan pemohon maksima 3 baris.
8. **SDLC 8 (Pengendalian Kecacatan Terlepas)**:
   - Jika terdapat sebarang kecacatan dikesan semasa QA, tulis ujian automatik yang gagal terlebih dahulu sebelum membetulkan kod.

---

## 9. Apa yang Tidak Termasuk (Explicit Out-of-Scope)

1. Mengubah struktur teras atau algoritma Python `QuotaTracker` dalam `screener/src/quota_tracker.py`.
2. Menyediakan butang "Reset Kuota" atau memadam rekod kuota daripada UI (kerana kuota Moomoo OpenAPI adalah hakiki di pelayan broker Moomoo; sebarang pemadaman tempatan akan menyebabkan de-sinkronisasi).
3. Mengubah logik penapisan saham atau pelaksanaan dagangan L1/L2.
4. Mengubah konfigurasi rangkaian infrastruktur Paperclip atau Cloudflare Tunnel di luar skop dashboard.
