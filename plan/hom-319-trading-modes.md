# Plan: Penambahan Seksyen Mod Dagangan (Trading Modes) ke dalam BLUEPRINT.md
Branch: docs/hom-320-trading-modes
Issue: https://crew.julietmike.net/HOM/issues/HOM-320
Parent Issue: https://crew.julietmike.net/HOM/issues/HOM-319
Status: waiting for go (implementation NOT started)

## 1. Goal & Requirements
Tugasan ini adalah untuk mengemas kini dokumen seni bina induk `BLUEPRINT.md` di repositori `stock_trader` dengan menambah satu seksyen komprehensif berkaitan **Mod Dagangan (Trading Modes)** bagi menyokong fleksibiliti operasi sistem antara Day Trading dan Swing Trading.

### Keperluan Khusus:
1. **Perbandingan & Kesesuaian 4 Gaya Dagangan**:
   - Menganalisis 4 gaya dagangan: Scalping, Day Trading, Swing Trading, dan Position Trading.
   - Menilai kesesuaian setiap gaya terhadap kekangan sebenar sistem: latensi model AI Paperclip, kuota Moomoo OpenAPI (kuota K-line 30-hari, kuota sebut harga masa nyata), kos token LLM, dan had broker (PDT, margin, komisen).
   - Menjelaskan rasional mengapa Day Trading dan Swing Trading adalah dua mod yang disokong secara rasmi, manakala Scalping dan Position Trading tidak disyorkan/di luar skop.
2. **Perincian Pelaksanaan Swing Trading**:
   - Timeframe analisis: Penggunaan K-line 1-Jam (1H) dan Harian (Daily/1D) untuk analisis struktur harga Wyckoff/SMC oleh Tariq.
   - Jadual pemantauan berkala (Periodic Wake Loop): Semakan berkala (setiap 4 jam atau pemicu pra-pasaran 09:00 NY, pertengahan sesi 13:00 NY, pasca-pasaran 16:30 NY) bagi menggantikan gelung 5-minit Day Trading yang membazirkan token dan kuota.
   - Pengurusan Pesanan & Had Perlindungan: Peralihan daripada pesanan Good-For-Day (`TimeInForce.DAY`) kepada Good-Til-Cancelled (`TimeInForce.GTC`), pelarasan Exit Sentinel untuk membenarkan pegangan semalaman (*overnight holding*), dan mitigasi risiko lonjakan harga pembukaan (*overnight gap risk*).
3. **Penggunaan Toggle Konfigurasi `TRADING_MODE` (DAY | SWING)**:
   - Konfigurasi terpusat melalui environment variable `TRADING_MODE` dengan nilai `DAY` atau `SWING`.
   - Pemetaan impak konfigurasi ke atas seluruh lapisan sistem:
     - **L0 (Screener)**: Penyesuaian kriteria saringan volum dan momentum mengikut timeframe.
     - **L1 (Tariq & Nawwar)**: Horizon K-line (1H/Daily vs 5M/15M) dan Earnings Gate (contoh: 14 hari untuk Swing vs 5 hari untuk Day Trading).
     - **L2 (Haziq)**: Formula saiz posisi (1.0% risiko ekuiti untuk Swing vs 1.5% untuk Day Trading) dan unjuran R:R yang lebih luas.
     - **L3 (Danial)**: Pematuhan peraturan PDT (aktif untuk Day, tidak terpakai untuk Swing pegangan > 1 hari); penguatkuasaan `TimeInForce.GTC` vs `DAY`; penggantungan sekatan Time-Exit 15:45 NY untuk Swing.
     - **L4 (Exit Sentinel & Bridge)**: Pengurusan pesanan broker GTC dan logik trailing stop harian.
     - **Dashboard UI**: Lencana status mod dagangan aktif dan penapisan portfolio.

---

## 2. Kriteria Penerimaan Pengguna (User Acceptance Criteria)
1. **Penerokaan Dokumen Blueprint**:
   - Apabila pengguna membuka `BLUEPRINT.md`, pengguna melihat seksyen baharu yang tersusun rapi: `"## 7. Seni Bina Mod Dagangan (Trading Modes: Day Trading vs Swing Trading)"` (atau diletakkan secara logik selaras dengan struktur dokumen).
2. **Matriks Perbandingan Jelas**:
   - Pengguna melihat jadual matriks perbandingan 4 gaya dagangan (Scalping, Day, Swing, Position) yang memperincikan timeframe, latensi Paperclip, impak kuota Moomoo OpenAPI, kos token, peraturan PDT, dan status keserasian seni bina.
3. **Spesifikasi Operasi Swing Trading & Konfigurasi**:
   - Pengguna melihat huraian teknikal lengkap bagaimana aliran kerja L0->L4 beroperasi di bawah mod Swing (1H & Daily, pemantauan 4 jam sekali, pesanan GTC, mitigasi overnight gap).
   - Pengguna melihat definisi tepat toggle `TRADING_MODE=DAY|SWING` berserta impak setiap nilai kepada pembolehubah sistem dan tingkah laku ejen.

---

## 3. Fail / Modul Yang Terlibat
- `BLUEPRINT.md`: Penambahan teks, jadual, rajah aliran teks ASCII/Mermaid bagi Seksyen Mod Dagangan.
- Tiada fail kod Python (`bridge/`, `screener/`) atau JavaScript (`dashboard/`) yang diubah dalam fasa tugasan ini (skop terhad kepada spesifikasi seni bina dokumentasi).

---

## 4. Pendekatan Reka Bentuk & Alternatif Yang Ditolak
### Pendekatan Dipilih:
- Menambah seksyen dedikasi (`## 7. Seni Bina Mod Dagangan (Trading Modes: Day Trading vs Swing Trading)`) di dalam `BLUEPRINT.md` selepas Seksyen 6 (HOM-317) dengan mengekalkan konsistensi terminologi sedia ada (Tariq, Nawwar, Haziq, Danial, Exit Sentinel, Moomoo OpenD, TrdEnv.SIMULATE/REAL, 10 Hard Rules Danial).
- Menyediakan jadual perbandingan terperinci dan pemetaan konfigurasi `TRADING_MODE` yang jelas untuk setiap lapisan L0 hingga L4.

### Alternatif Yang Ditolak:
1. **Menggantikan Day Trading sepenuhnya dengan Swing Trading**:
   - Ditolak kerana Day Trading adalah asas seni bina sedia ada yang telah dibina dan diuji dalam Fasa 1–3. Sistem perlu menyokong kedua-dua mod secara modular melalui suis konfigurasi.
2. **Menyokong Scalping**:
   - Ditolak secara tegas kerana latensi LLM Paperclip (1–5 saat per ejen) dan kekangan API Moomoo (rate limit dan kuota kuotasi) menjadikannya mustahil untuk bersaing secara selamat.
3. **Membuat fail berasingan (contoh `SWING_TRADING.md`)**:
   - Ditolak kerana `BLUEPRINT.md` adalah sumber kebenaran tunggal (*Single Source of Truth*) bagi keseluruhan seni bina projek `stock_trader` (selaras dengan mandat HOM-114 dan HOM-317).

---

## 5. Analisis Risiko & Mitigasi
1. **Risiko Percanggahan dengan 10 Hard Rules Danial (L3)**:
   - *Risiko:* Peraturan #5 sedia ada menetapkan waktu operasi 09:45–15:45 NY dan Time-Exit mandatori 15:45 NY bagi menutup semua posisi intraday. Ini akan bercanggah jika Swing Trading cuba memegang posisi semalaman.
   - *Mitigasi:* Dokumen akan mendefinisikan secara eksplisit bahawa Hard Rule #5 (Time-Exit 15:45 NY) hanya berkuat kuasa apabila `TRADING_MODE=DAY`. Apabila `TRADING_MODE=SWING`, Time-Exit dinyahaktifkan dan digantikan dengan pengesahan Hard Stop Loss GTC di peringkat broker.
2. **Risiko Overnight Gap pada Swing Trading**:
   - *Risiko:* Pasaran boleh dibuka dengan lonjakan harga ke bawah melepasi paras Stop Loss akibat berita mengejut luar waktu pasaran.
   - *Mitigasi:* Dokumen menetapkan saiz risiko lebih konservatif (1.0% ekuiti akaun untuk Swing berbanding 1.5% untuk Day), serta penapisan Earnings Gate yang lebih ketat (tiada earnings dalam 14 hari).
3. **Risiko Letupan Penggunaan Kuota K-line**:
   - *Risiko:* Menambah timeframe 1H dan Daily boleh menghabiskan kuota 100 simbol K-line 30-hari jika dipanggil sewenang-wenangnya.
   - *Mitigasi:* Menggunakan kuota K-line sedia ada secara berkongsi dengan kaunter saringan L0 yang telah ditapis rapi, dan mengehadkan panggilan K-line Swing kepada selang 4 jam atau bar-close sahaja.

---

## 6. Apa Yang Tidak Termasuk (Out of Scope)
- Pelaksanaan kod Python dalam `bridge/` atau `screener/` (akan dilaksanakan dalam tiket pelaksanaan berasingan).
- Perubahan antaramuka kod React dalam `dashboard/` (akan dibuka dalam subtask UI berasingan jika berkaitan).
- Strategi Options / Derivatif (hanya tertumpu pada US Equities / saham biasa).

---

## 7. Rancangan Pengesahan & Ujian (Verification Plan)
1. **Semakan Format & Sintaks Markdown**:
   - Mengesahkan struktur Markdown sah, pemformatan jadual sejajar (*aligned*), dan tiada tag sintaks yang rosak.
2. **Semakan Konsistensi Istilah**:
   - Memastikan nama ejen (Tariq, Nawwar, Haziq, Danial, Exit Sentinel), port komunikasi, skema JSON, dan istilah teknikal Moomoo OpenAPI (`TimeInForce.GTC`, `TimeInForce.DAY`, `TrdEnv.SIMULATE`) konsisten 100% dengan Seksyen 1–6.
3. **Semakan Rujukan Fizikal & Diff**:
   - Memeriksa `git diff BLUEPRINT.md` untuk memastikan tiada perubahan tidak sengaja pada seksyen terdahulu.
4. **Semakan Keselamatan 5 & 5a**:
   - Semakan 5a: Tidak berkenaan (perubahan dokumentasi Markdown tulen tanpa perkhidmatan web atau kelayakan rangkaian baharu).
   - Sanitasi kredensial: Mengesahkan tiada sebarang token, secret, atau kata laluan dimasukkan ke dalam dokumen atau git commit.
