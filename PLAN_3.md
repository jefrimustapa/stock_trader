# Plan & Senibina: Konfigurasi Had Maks Kaunter Per Lorong L0 (#3 / HOM-282)

- **Branch**: `feat/hom-281-max-counter-per-lane` (berasaskan `main`)
- **Issue**: [HOM-282](https://crew.julietmike.net/HOM/issues/HOM-282) (Parent: [HOM-281](https://crew.julietmike.net/HOM/issues/HOM-281))
- **GitHub Issue**: [jefrimustapa/stock_trader#3](https://github.com/jefrimustapa/stock_trader/issues/3)
- **Author**: Fakhri, Senior Software Engineer (Core AI & Architecture)
- **Status**: Menunggu Kelulusan Pemohon (Fasa 1)

---

## 1. Research & Analisis Punca: Mengapa Had Kaunter Per Lorong Ditetapkan Sebegitu?

### 1.1 Hubungkait dengan Kuota K-line Moomoo OpenAPI (100 Simbol / 30 Hari)
Enjin saringan L0 (`screener`) direka bentuk dengan kekangan keras yang dikenakan oleh broker **Moomoo OpenAPI**:
1. **Kuota K-line Sejarah (Historical K-line Quota)**:
   - Moomoo OpenAPI mengehadkan permohonan data K-line sejarah kepada maksimum **100 simbol unik dalam tetingkap gelongsor 30 hari (rolling 30-day window)**.
   - Mengikut rekod pada `screener/src/quota_tracker.py`, setiap simbol baharu yang diminta datanya akan merekodkan tarikh tamat tempoh selama tepat 30 hari (`expires_at = now + timedelta(days=30)`).
   - Selagi tempoh 30 hari belum berlalu, simbol tersebut menduduki satu slot kuota secara aktif.
2. **Purata Hari Dagangan Sebulan**:
   - Dalam sebulan terdapat purata **20 hingga 22 hari dagangan aktif pasaran saham AS**.
   - Bajet simbol baharu harian yang mampan ialah:
     $$\text{Bajet Sehari} = \frac{100 \text{ simbol}}{20 \text{ hari}} \approx 4 \text{ hingga } 5 \text{ simbol baharu/hari}$$
     *(Rujuk pembolehubah `MAX_NEW_SYMBOLS_PER_DAY = 4` dalam `screener/src/config.py`)*.
3. **Senibina Dual-Lane L0 (Approach C)**:
   - Saringan pasaran membahagikan calon melepasi Stage 1 kepada dua lorong pengkhususan:
     - **Lorong 1 (MOMENTUM)**: Kaunter breakout & pengembangan volum tinggi.
     - **Lorong 2 (SETUP)**: Kaunter pembentukan asas penguncupan volatiliti (VCP / Wyckoff).
   - Pada **Stage 3 (`enrich_kline_gate` dalam `cloud_screener.py`)**, sistem mengambil calon teratas daripada setiap lorong sebanyak `MAX_CANDIDATES_PER_LANE`:
     $$\text{Maksimum Calon K-line Per Kitaran} = 2 \times \text{MAX\_CANDIDATES\_PER\_LANE} = 2 \times 5 = 10 \text{ calon}$$
4. **Kekangan Langganan Sebut Harga Masa Nyata (Realtime Subscriptions Cap)**:
   - Moomoo menetapkan kuota langganan serentak (concurrent subscription quota) sebanyak 100 slot kuota subskripsi. Setiap saham memerlukan sekurang-kurangnya 2 slot kuota (sebut harga + bar 15 minit), menjadikan had siling sekitar 15 hingga 50 saham (`max_realtime_symbols: 15`).

### 1.2 Implikasi Had Terlalu Tinggi vs Terlalu Rendah
- **Jika had terlalu tinggi (contoh: > 20 per lorong = > 40 kaunter per imbasan)**:
  - Sekiranya pasaran mengalami putaran sektor (sector rotation) pantas dan saham-saham baharu muncul setiap hari, kuota 100 simbol sebulan boleh habis dalam masa **kurang 2-3 hari dagangan**.
  - Apabila kuota habis, `QuotaExceededError` akan tercetus dan Stage 3 tidak lagi dapat memuat turun K-line bagi sebarang kaunter baharu selama berminggu-minggu, menyebabkan sistem saringan lumpuh.
- **Jika had terlalu rendah (contoh: 1 atau 2 per lorong)**:
  - Kepelbagaian pilihan calon setup untuk ejen L1 (Tariq & Nawwar) menjadi terlalu sempit, dan peluang dagangan berkualiti tinggi yang berada di kedudukan ke-3 hingga ke-5 akan tercicir.
- **Kesimpulan**: Nilai lalai **5 calon per lorong** adalah titik optimum (*sweet spot*) yang mengimbangi kecukupan kepelbagaian setup berkualiti dengan disiplin perlindungan kuota 100 simbol/30 hari.

---

## 2. Keperluan & Skop Tugasan (Requirements)

1. **Jadikan Had Boleh Dikonfigurasikan**:
   - Membolehkan pengguna melaraskan nilai `MAX_CANDIDATES_PER_LANE` melalui UI `SettingsPage.jsx` tanpa perlu menyunting fail kod atau memulakan semula perkhidmatan secara manual.
   - Menyediakan API backend RESTful (`GET` dan `PATCH` di `/api/screener/config`) yang menyokong konfigurasi dinamik ini.
2. **Perlindungan Had Sempadan & Keselamatan (BVA Guards)**:
   - **Had Minimum**: 1 kaunter per lorong (minimum logik operasi lorong).
   - **Had Maksimum**: 20 kaunter per lorong (had siling keselamatan institutional bagi mengelakkan kuota K-line Moomoo 100/30-hari dihabiskan secara mendadak).
   - Validasi jenis data ketat: Nombor integer bulat (bukan perpuluhan, bukan string kosong, bukan boolean).
3. **Penyimpanan Berterusan & Audit Trail**:
   - Nilai konfigurasi disimpan secara selamat dalam pangkalan data SQLite (`screener_config.sqlite`) dengan mod WAL.
   - Sebarang perubahan direkodkan ke dalam `screener_config_audit` (timestamp, pengguna, nilai lama, nilai baharu).
4. **Hot-Reload pada Daemon Screener Python**:
   - Enjin Python `ScreenerConfig.load_active_config()` memuatkan nilai terkini daripada SQLite pada setiap kitaran imbasan tanpa memerlukan proses daemon di-restart.

---

## 3. Kriteria Penerimaan Pengguna (User Acceptance Criteria - UAC)

> **UAC 1**: Bila pengguna melayari Halaman Tetapan (`SettingsPage.jsx`), pengguna nampak input medan "Had Calon Per Lorong L0 (MAX_CANDIDATES_PER_LANE)" dengan nilai semasa dan teks bantuan keselamatan kuota Moomoo.
>
> **UAC 2**: Bila pengguna memasukkan nilai integer antara 1 hingga 20 dan menekan "Simpan Konfigurasi", tetapan disimpan ke SQLite, mesej kejayaan dipaparkan, log audit dikemas kini, dan enjin L0 Screener menggunakan had baharu ini untuk Stage 3 K-line enrichment.
>
> **UAC 3**: Bila pengguna memasukkan nilai di luar julat sah (< 1 atau > 20) atau format tidak sah (perpuluhan/bukan angka), sistem menyekat penyimpanan serta-merta dengan mesej ralat validasi yang jelas.

---

## 4. Modul & Fail yang Akan Diubah

| Modul / Fail | Jenis Perubahan | Deskripsi Perubahan |
| :--- | :--- | :--- |
| `dashboard/server.js` | Modifikasi | Kemas kini skema SQLite `screener_config` (migration kolum `max_candidates_per_lane`), takrifkan had `SCREENER_CONFIG_LIMITS.max_candidates_per_lane` (1-20), kemas kini `GET` & `PATCH` `/api/screener/config`, serta log audit. |
| `dashboard/src/pages/SettingsPage.jsx` | Modifikasi | Tambah kawalan input UI untuk `max_candidates_per_lane`, validasi frontend BVA, paparan ringkasan kad, dan nota penerangan kuota Moomoo. |
| `screener/src/config.py` | Modifikasi | Tambah `DEFAULT_MAX_CANDIDATES_PER_LANE`, sokongan bacaan dinamik `max_candidates_per_lane` dalam `load_active_config()`, `reset_to_defaults()`, dan semakan sempadan selamat. |
| `screener/src/main.py` | Modifikasi | Kemas kini mesej log kitaran imbasan untuk memaparkan nilai aktif `max_candidates_per_lane`. |
| `tests/test_max_candidates_lane_bva.py` | Fail Baharu | Suite ujian unit Python merangkumi BVA had sempadan (0, 1, 5, 20, 21, negatif, perpuluhan), mutation testing fungsi keputusan, dan integrasi pemotongan calon `enrich_kline_gate`. |
| `dashboard/test_screener_config.js` | Modifikasi | Tambah kes ujian BVA, validasi jenis ketat, dan audit log untuk medan `max_candidates_per_lane`. |
| `dashboard/test_screener_settings_e2e.js` | Fail Baharu | Ujian integrasi E2E automatik untuk aliran kemas kini tetapan dan semakan pangkalan data. |

---

## 5. Pendekatan Teknikal & Alternatif yang Ditolak

### Pendekatan Dipilih: Integrasi SQLite Dinamik Berpusat (WAL)
- **Mekanisme**: Menambah kolum `max_candidates_per_lane INTEGER NOT NULL DEFAULT 5 CHECK (max_candidates_per_lane >= 1 AND max_candidates_per_lane <= 20)` pada jadual SQLite kongsi `screener_config.sqlite`.
- **Kelebihan**:
  - Konsisten 100% dengan reka bentuk konfigurasi sedia ada (`min_price`, `min_market_cap`, `min_volume`, `min_rvol`, `max_rvol`).
  - Menyokong mod concurrency tinggi menggunakan SQLite WAL mode.
  - Membolehkan kedua-dua backend Node.js (Dashboard Express) dan daemon Python (`cloud_screener.py`) membaca konfigurasi terkini secara masa nyata (*hot-read*) tanpa perkongsian memori rumit atau IPC berat.

### Alternatif yang Ditolak:
1. **Alternatif A: Pembolehubah Environment Sahaja (`.env`)**:
   - *Ditolak kerana*: Memerlukan restart kontena Docker setiap kali pengguna ingin melaraskan had, tidak memenuhi kehendak tiket GitHub #3 ("configurable via settings page"), dan merosakkan pengalaman pengguna (UX).
2. **Alternatif B: Menyimpan konfigurasi dalam fail JSON mentah**:
   - *Ditolak kerana*: Risiko *race condition* dan *file corruption* apabila diakses serentak oleh Express dan daemon Python berbanding SQLite yang dilengkapi transaksi ACID dan mod WAL.
3. **Alternatif C: Membenarkan had tanpa siling (cth: sehingga 100)**:
   - *Ditolak kerana*: Bertentangan secara langsung dengan perlindungan kuota Moomoo OpenAPI 100 simbol / 30 hari. Satu kitaran imbasan dengan 100 calon boleh membakar seluruh kuota bulanan.

---

## 6. Analisis Risiko & Pelan Mitigasi

| Risiko | Kebarangkalian | Impak | Pelan Mitigasi |
| :--- | :--- | :--- | :--- |
| **Migrasi Pangkalan Data Sedia Ada**: Pangkalan data SQLite sedia ada belum mempunyai kolum `max_candidates_per_lane`. | Sederhana | Tinggi | Jalankan semakan `PRAGMA table_info(screener_config)` semasa inisialisasi di `server.js`. Jika kolum tiada, laksanakan `ALTER TABLE screener_config ADD COLUMN max_candidates_per_lane INTEGER NOT NULL DEFAULT 5;` secara lancar tanpa kehilangan data sedia ada. |
| **Nilai Luar Had Dihantar oleh Pengguna**: Pengguna cuba memasukkan nilai 0, negatif, perpuluhan, atau nilai lampau tinggi (> 20). | Tinggi | Sederhana | Perlindungan berlapis (Defense-in-Depth): Validasi ketat pada UI input, validasi skema pada Express API (`parseStrictInteger`), kekangan `CHECK` pada jadual SQLite, dan semakan sempadan pada Python `load_active_config()`. |
| **Kuota K-line Moomoo Terancam**: Pengguna menetapkan had maksimum 20. | Sederhana | Tinggi | Sertakan nota amaran keselamatan yang jelas pada UI Halaman Tetapan, dan kekalkan had siling mutlak pada 20 calon per lorong. |

---

## 7. Rancangan Ujian (Testing Plan - SDLC 3, 4, 5, 5a)

### 7.1 Ujian Unit & BVA (Boundary Value Analysis - SDLC 3)
- Nilai sempadan diuji pada kedua-dua lapisan Node.js dan Python:
  - **Nilai Sah**: 1 (sempadan minimum), 5 (lalai/default), 20 (sempadan maksimum).
  - **Nilai Tidak Sah**: 0 (bawah minimum), -1 (negatif), 21 (atas maksimum), 100 (lampau tinggi), 5.5 (perpuluhan), `"abc"` (bukan angka), `true`/`false` (boolean), `null`/kosong.
- **Mutation Testing**: Uji logik keputusan pemotongan senarai calon (`candidates[:max_per_lane]`) dan semakan syarat sempadan.

### 7.2 Ujian Integrasi & E2E (SDLC 4)
- **API E2E**:
  - `GET /api/screener/config` memulangkan `max_candidates_per_lane: 5` dan had sempadan `{ min: 1, max: 20 }`.
  - `PATCH /api/screener/config` dengan `{ max_candidates_per_lane: 8 }` berjaya dan merekodkan audit trail.
  - Saringan L0 memuat turun K-line mengikut had baharu (8 calon per lorong).
- **UI Settings E2E**:
  - Membuka halaman tetapan, mengedit nilai had lorong, menyimpan, dan memastikan nilai kekal selepas muat semula.

### 7.3 Semakan Keselamatan & Auth Cloudflare (SDLC 5a)
- Pengesahan keselamatan akses API Dashboard:
  - Semua endpoint `/api/screener/config` kekal dilindungi oleh middleware pengesahan dwiarah (header `cf-access-jwt-assertion` dan token sesi).
  - Tiada rahsia, PAT atau token dibocorkan dalam log audit atau output JSON.

---

## 8. Apa yang TIDAK Termasuk (Out of Scope)

- Mengubah saiz kuota Moomoo OpenAPI itu sendiri (had 100 simbol / 30 hari adalah ketetapan daripada broker Moomoo).
- Mengubah formula pemilihan dan skor lorong MOMENTUM / SETUP (hanya had kuantiti calon yang terlibat).
- Pengubahsuaian komponen di luar skop L0 Screener dan Dashboard Settings.

---

## 9. Pelan Rujukan Fizikal & Persekitaran Beta (SDLC 7)
- **URL Named Tunnel**: `https://stock-trader.beta.julietmike.net`
- **Konfigurasi Rangkaian**: Beroperasi pada rangkaian Docker `npm_default` dengan SSL Force HTTPS & HTTP/2 diaktifkan.
- **Akaun Sandbox**: Kredensial ujian sandbox lokal akan disediakan dalam komen semakan pemohon sebelum penyerahan QA kepada Zahrin.
