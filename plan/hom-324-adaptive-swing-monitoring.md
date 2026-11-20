# Plan: Kemaskini BLUEPRINT.md Pemantauan Adaptif Swing Trading (Top-Down 4H -> 1H)

**Branch:** `feat/adaptive-swing-monitoring-blueprint`  
**Subtask Issue:** [HOM-324](https://crew.julietmike.net/HOM/issues/HOM-324)  
**Parent Issue:** [HOM-323](https://crew.julietmike.net/HOM/issues/HOM-323)  
**Author:** Fakhri, Senior Software Engineer (Core AI & Architecture)  
**Status:** In Review (Menunggu Kelulusan Pemohon)  

---

## 1. Goal & Requirements
Tugasan ini adalah untuk mengemas kini dokumen seni bina induk `BLUEPRINT.md` bagi mod Swing Trading (`TRADING_MODE=SWING`), menggantikan pemantauan statik/tetap 4 jam dengan pendekatan **Pemantauan Adaptif (Adaptive Top-Down Multi-Timeframe Monitoring)** selaras dengan arahan pemohon (Jefri, HOM-323) dan penyelarasan rasmi GitHub Issue #14 serta pelan HOM-322:

1. **Top-Down Structure (4H / Daily):**
   - Menggunakan timeframe 4H / Daily untuk menentukan arah trend utama, zon S/R utama institusi, dan struktur ayunan tanpa gangguan bunyi intraday (*fewer false breakouts*).
   - Pemantauan berkala amaran trend secara ringan (*light screening / few times a day*).
2. **Adaptive 1H Trigger (Precision Entry & Exit):**
   - Apabila harga mendekati zon minat (*level of interest* / SMC Order Block) pada carta 4H, sistem menukar ke selang 1H secara adaptif untuk entri lebih tajam (*tighter stop loss, entry precision*) atau mengesan anjakan momentum lebih awal.

---

## 2. Kriteria Penerimaan Pengguna (User Acceptance Criteria)
1. **Penerokaan Dokumen Blueprint:**
   - Apabila pengguna membaca `BLUEPRINT.md` pada Seksyen 3.2.D / 3.3.D dan Seksyen 7 (7.1, 7.2, 7.3), pengguna melihat peralihan jelas daripada pemantauan statik 4-jam kepada pendekatan Pemantauan Adaptif Top-Down (4H/Daily untuk struktur makro & 1H adaptif untuk pemicu entri/exit persis).
2. **Konsistensi Saluran Lapisan L0 -> L4:**
   - Pengguna melihat jadual matriks dan huraian peranan ejen (L0 Screener, L1 Tariq, L1 Nawwar, L2 Haziq, L3 Danial, L4 Sentinel, Dashboard UI) mencerminkan logik adaptif top-down secara konsisten selaras dengan GitHub Issue #14.
3. **Integriti Format & Sanitasi Kredensial:**
   - Dokumen mematuhi format Markdown standard (tiada code fence tergantung, jadual kemas) dan melepasi audit sanitasi keselamatan (0 secret/token).

---

## 3. Fail & Modul yang Akan Diubah
- `BLUEPRINT.md`:
  - **Seksyen 3.2.D (Pemantauan Dwi-Fokus / Active Portfolio Watch):** Kemaskini huraian semakan berkala daripada selang statik 4 jam kepada semakan adaptif top-down 4H/Daily dengan pengaktifan selang 1H berhampiran zon tindakan.
  - **Seksyen 7.1 (Perbandingan 4 Gaya Dagangan):** Kemaskini dimensi timeframe dan penggunaan kuota K-line bagi Swing Trading untuk menerangkan kombinasi struktur 4H/Daily dan pemicu 1H adaptif.
  - **Seksyen 7.2 (Perincian Pelaksanaan Swing Trading):**
    - Sub-seksyen 1 (Timeframe Analisis): Huraian eksplisit *Top-Down Structure (4H / Daily)* dan *Adaptive 1H Trigger (Precision Entry & Exit)*.
    - Sub-seksyen 3 (Jadual Pemantauan Berkala): Transformasi daripada *Periodic Wake Loop* tetap 4 jam kepada *Adaptive Wake & Screening Loop*.
  - **Seksyen 7.3 (Toggle Konfigurasi TRADING_MODE & Matriks L0->L4):**
    - L0 Screener: Saringan 4H/Daily berkala + pemantauan adaptif 1H bagi kaunter menghampiri zon minat.
    - L1 Tariq: Penentuan trend 4H/Daily + pemicu kemasukan persis 1H (`KLType.K_60M`).
    - L4 Sentinel: Trailing stop Chandelier bar penutupan 4H/Daily dengan pengetatan 1H adaptif semasa pasaran aktif.
    - Dashboard UI: Status pemantauan adaptif top-down pada tab pemantauan.
- `plan/hom-324-adaptive-swing-monitoring.md`: Fail rekod perancangan dalam repositori.

---

## 4. Pendekatan Reka Bentuk & Alternatif yang Ditolak
- **Pendekatan Dipilih:**
  - *Adaptive Top-Down Multi-Timeframe Monitoring*: Analisis struktur makro dan arah aliran dibuat pada 4H/Daily untuk menyingkirkan kebisingan intraday dan memelihara kuota OpenAPI. Pemantauan selang lebih pantas 1H (`KLType.K_60M`) diaktifkan secara selektif dan adaptif hanya apabila harga berada dalam julat zon minat institusi (Order Block / FVG / S/R).
- **Alternatif yang Ditolak:**
  - *Alternatif A (Pemantauan Statik 4 Jam Tegar):* Ditolak kerana selang 4 jam terlalu lewat untuk mengesan pengesahan pembalikan candlestick atau mengunci entri dengan Stop Loss yang optimum, menyebabkan nisbah Risk-to-Reward berkurangan.
  - *Alternatif B (Langganan Berterusan 1H / 5M untuk Semua Kaunter):* Ditolak kerana melanggar kekangan kuota 100 simbol K-line 30-hari Moomoo OpenAPI dan menyebabkan pembaziran kos token LLM yang tinggi.

---

## 5. Analisis Risiko & Mitigasi
- **Risiko 1 (Kesesakan Kuota Moomoo OpenAPI):** Sekiranya terlalu banyak kaunter memasuki zon minat serentak, langganan 1H boleh membebankan kuota.
  - *Mitigasi:* Hadkan calon aktif dalam pemantauan adaptif 1H kepada maksimum 3–5 simbol pada satu-satu masa. Tamatkan langganan 1H serta-merta apabila tesis dagangan terbatal atau pesanan telah diisi/dibatalkan.
- **Risiko 2 (Percanggahan Takrifan merentas Dokumen):** Istilah antara Seksyen 3 dan Seksyen 7 boleh bercanggah jika tidak dikemaskini serentak.
  - *Mitigasi:* Semakan silang teliti merentas keseluruhan `BLUEPRINT.md` untuk memastikan tiada rujukan lama kepada pemantauan tetap 4 jam yang tertinggal.

---

## 6. Pelan Ujian & Pengesahan (SDLC Langkah 3, 4, 5a)
- **Ujian Sintaks Markdown (SDLC #3):**
  - Skrip automasi Python untuk mengesahkan integriti blok kod (balanced triple backticks), integriti jadual Markdown, dan struktur heading hierarki.
- **Ujian Kesinambungan Logik Arkitektur / E2E (SDLC #4):**
  - Mengesahkan bahawa laluan logik dari L0 Screener -> L1 Tariq -> L2 Haziq -> L3 Danial -> L4 Sentinel -> Dashboard UI adalah koheren dan tiada lompang fungsi.
- **Semakan Keselamatan & Sanitasi Kredensial (SDLC #5a):**
  - Mengesahkan tiada sebarang token, secret, atau kelayakan sulit (termasuk `PERSONAL_GITHUB_PAT`) yang dicatatkan dalam kod, fail perancangan, mahupun mesej commit git.

---

## 7. Apa yang Tidak Termasuk (Out of Scope)
- Pelaksanaan kod sumber Python (`screener/`, `bridge/`, `dashboard/`) — ini akan dilaksanakan dalam fasa implementasi berasingan mengikut pelan HOM-322.
- Pengubahsuaian konfigurasi rangkaian atau infrastruktur Docker.
