# Plan: Penyatuan Antaramuka L0 (Saringan & Watchlist), Penjenamaan L1->L4, Kawalan Pembatalan Pesanan, dan Paginasi Aktiviti Ejen (HOM-305 Tambahan)
Branch: fix/hom-305-modal-ceiling-tab
Issue: https://crew.julietmike.net/HOM/issues/HOM-305
Status: waiting for go (implementation NOT started)

## 1. Goal & Requirements (Arahan Terkini Pemohon: Jefri 2026-11-16)
Menyempurnakan 5 pembaharuan antaramuka dan fungsi operasi dashboard selaras dengan maklum balas pemohon:

1. **Pembuangan Butang Simulasi Pipeline (`AgentsPage.jsx`)**:
   - Memadamkan butang "Jalankan Simulasi Pipeline" sepenuhnya daripada antaramuka.
   - Menghapuskan kekeliruan penjanaan pesanan simulasi tempatan `SUBMITTED_PAPER_SIM`. Sistem beroperasi secara automatik di latar belakang.
2. **Penyatuan Halaman Corong Saringan & Watchlist (Rebrand ke "L0: Saringan & Watchlist")**:
   - Menggabungkan kandungan `FunnelPage.jsx` (Visual Corong Saringan 5-Peringkat) dan `WatchlistPage.jsx` (Jadual Kaunter Saham L0 Dwi-Lorong) ke dalam satu halaman tunggal.
   - Menggabungkan kad penerangan ke dalam kad metrik corong di bahagian atas, menghapuskan kad berasingan yang redundan.
   - Mengemas kini menu navigasi sidebar (`Layout.jsx`) dan routing (`App.jsx`).
3. **Butang Batal (Cancel Button) Mandatori bagi Semua Transaksi Belum Muktamad**:
   - Setiap transaksi pada jadual pesanan yang berada dalam status belum muktamad (`SUBMITTED`, `PENDING`, dan `SUBMITTED_PAPER_SIM`) wajib memaparkan butang "Batal" yang aktif.
   - Memastikan backend `/api/agents/orders/{order_id}/cancel` menyokong pembatalan pesanan secara selamat dan idempotik.
4. **Penjenamaan Semula Tab/Menu Aktiviti Ejen**:
   - Menukar nama navigasi sidebar dan tajuk utama halaman pemantauan kepada format seni bina: `"L1 -> L4: Aktiviti Pasukan Ejen"`.
5. **Paginasi Senarai Aktiviti Ejen & Konfigurasi Entri Per Halaman**:
   - Memasukkan jadual pesanan transaksi ke dalam komponen paginasi (`TablePagination` MUI).
   - Menambah tetapan konfigurasi bilangan entri per halaman (pilihan: 5, 10, 25, 50) dalam Settings Page (disimpan dalam `screener_config.sqlite`).

---

## 1.1 Mekanisme Pembangun Ejen (Agent Pipeline Wake Architecture)
Menjawab soalan pemohon: *"Siapa yang akan wake ejen untuk laksanakan analisis selepas butang simulasi dibuang?"*:

1. **Pencetus Utama Pasaran (Event-Driven L0 Screener)**:
   - Kontena `stock_screener_daemon` (L0) berjalan secara berjadual setiap 5 minit (300 saat) sepanjang waktu pasaran US dibuka (09:45 - 15:45 NY).
   - Sebaik sahaja tapisan selesai dan fail `watchlist.json` ditulis ke volum data kongsi, `stock_screener_daemon` menghantar isyarat pemicu (event-driven HTTP trigger) ke Bridge L4 (`POST http://mcp-bridge:8000/api/v1/agents/simulate-run` atau pemicu analisis kitaran).
2. **Pelaksanaan Saluran Paip Analisis Autonomi di Bridge L4**:
   - Bridge L4 memulakan enjin `AgentPipeline.run_simulation_cycle()` secara autonomi tanpa memerlukan sebarang klik atau tindakan manusia di dashboard.
   - Analisis berantai dijalankan secara berturutan:
     - **Tariq (L1)**: Menilai struktur teknikal (Wyckoff, SMC, Zon Sokongan/Rintangan).
     - **Nawwar (L1)**: Menilai sentimen pasaran, berita terkini, dan tapisan tarikh pendapatan (earnings).
     - **Haziq (L2)**: Mengira skor komposit $S_{total} = (0.65 \times S_{tech}) + (0.35 \times S_{sent\_norm})$ dan merangka saiz kedudukan berasaskan risiko 1.5% modal.
     - **Danial (L3)**: Mengaudit pematuhan 8 Hard Rules dan menyekat pesanan jika melebihi had siling modal portfolio.
     - **L4 Dispatch**: Menghantar pesanan ke Moomoo OpenD (`MOOMOO_TRD_ENV=SIMULATE` atau LIVE).
3. **Pembangun Ejen Maya Paperclip (LLM Wake-on-Demand)**:
   - Bagi analisis kualitatif berasaskan Model Bahasa Besar (LLM reasoning) ke atas calon teratas, perkhidmatan Bridge memanggil webhook/routine Paperclip API menggunakan token perkhidmatan untuk membangunkan (*wake*) ejen maya Tariq, Nawwar, dan Haziq dengan konteks data terkini.
4. **Peranan Dashboard UI**:
   - Dashboard berfungsi sebagai **konsol pemantauan pasif (*read-only real-time console*)** bagi menyemak keputusan, status saluran paip, dan status pesanan sebenar, bukannya pemicu transaksi manual.

---

## 2. User Acceptance Criteria (Kriteria Penerimaan Pengguna)
1. **Butang Simulasi Dibuang**:
   - Pada halaman pemantauan ejen (`#/agents`), butang "Jalankan Simulasi Pipeline" tidak lagi kelihatan.
   - Hanya butang "Segarkan" dan status penyelarasan automatik dipaparkan.
2. **Penyatuan L0 Saringan & Watchlist**:
   - Menu navigasi sidebar memaparkan entri bersatu: `"L0: Saringan & Watchlist"` (pautan `#/l0` atau `#/watchlist`).
   - Halaman memaparkan corong 5 nombor di bahagian atas berserta penerangan padat, diikuti terus oleh jadual Watchlist Kaunter Saham L0 tanpa limpahan kad hiasan berulang.
3. **Kawalan Pembatalan Pesanan**:
   - Semua transaksi pesanan berstatus `SUBMITTED`, `PENDING`, atau `SUBMITTED_PAPER_SIM` memaparkan butang "Batal" yang boleh ditekan.
   - Menekan butang membatalkan pesanan serta-merta, menukar statusnya kepada `CANCELLED`, dan melumpuhkan butang tindakan.
4. **Penjenamaan Menu L1 -> L4**:
   - Menu navigasi sidebar dan tajuk halaman jelas tertulis: `"L1 -> L4: Aktiviti Pasukan Ejen"`.
5. **Paginasi Boleh Ditetapkan**:
   - Jadual aktiviti dan pesanan menyokong paginasi lancar (Next/Prev dan pilihan baris).
   - Pengguna boleh menetapkan saiz paparan lalai (5, 10, 25, 50 entri) melalui Halaman Tetapan (Settings).

---

## 3. Fail & Modul yang Terlibat
1. `dashboard/src/pages/AgentsPage.jsx`:
   - [MODIFY] Padam butang "Jalankan Simulasi Pipeline" dan fungsi berkaitan.
   - [MODIFY] Kemas kini lajur TINDAKAN jadual pesanan untuk memaparkan butang "Batal" pada semua status belum muktamad (`SUBMITTED`, `PENDING`, `SUBMITTED_PAPER_SIM`).
   - [MODIFY] Tambah `TablePagination` pada jadual pesanan berasaskan konfigurasi saiz halaman.
2. `dashboard/src/pages/L0Page.jsx` (gabungan `FunnelPage.jsx` & `WatchlistPage.jsx`):
   - [NEW / RESTRUCTURE] Menyatukan visual corong saringan dan jadual senarai pantau L0 dalam satu komponen padat.
3. `dashboard/src/components/Layout.jsx`:
   - [MODIFY] Kemas kini senarai pautan navigasi:
     - Gantikan "Corong Saringan" dan "Watchlist Dwi-Lorong" dengan satu entri: `"L0: Saringan & Watchlist"`.
     - Tukar "Aktiviti Ejen" kepada `"L1 -> L4: Aktiviti Pasukan Ejen"`.
4. `dashboard/src/App.jsx`:
   - [MODIFY] Kemas kini routing hash (`#/l0`, `#/watchlist`, `#/agents`) dengan fallback ke laluan bersatu baharu.
5. `dashboard/src/pages/SettingsPage.jsx`:
   - [MODIFY] Tambah kawalan tetapan "Bilangan Entri Per Halaman Aktiviti Ejen" (dropdown / chips: 5, 10, 25, 50) dalam Tab Tetapan.
6. `dashboard/server.js`:
   - [MODIFY] Simpan dan baca parameter `agent_orders_per_page` daripada `screener_config.sqlite`.
7. `bridge/src/agent_pipeline.py`:
   - [VERIFY / MODIFY] Memastikan `cancel_paper_order` memproses pembatalan pesanan `SIM-ORD-*` dan `ORD-*` secara konsisten.
8. `dashboard/test_hom305_playwright.js`:
   - [MODIFY] Ujian E2E automatik merangkumi semakan tiada butang simulasi, penjenamaan L0 dan L1->L4, butang batal transaksi, dan paginasi.

---

## 4. Pendekatan & Alternatif yang Ditolak
- **Pendekatan Dipilih**:
  Menyatukan paparan L0 ke dalam satu halaman dengan susun atur vertikal kemas, mengemaskini menu sidebar, dan menyokong pembatalan pesanan belum muktamad secara konsisten di peringkat backend SQLite dan broker.
- **Alternatif Ditolak 1: Mengekalkan Butang Simulasi dengan Popup Peringatan**:
  Ditolak kerana pemohon secara jelas mengarahkan butang simulasi dibuang kerana mengelirukan pengguna dan tidak mencerminkan operasi autonomi sebenar.
- **Alternatif Ditolak 2: Menyimpan Bilangan Entri Paginasi hanya dalam LocalStorage**:
  Ditolak kerana konfigurasi paparan sistem mesti konsisten merentasi pelayar dan peranti pengguna melalui pangkalan data SQLite berpusat.

---

## 5. Analisis Risiko & Mitigasi
- **Risiko 1: Pautan Lama (`#/funnel`) Tidak Berfungsi**:
  - *Mitigasi*: Tambah lencongan automatik (*redirect*) di `App.jsx` supaya sebarang navigasi ke `#/funnel` terus memaparkan halaman bersatu `#/l0`.
- **Risiko 2: Pembatalan Pesanan Menghasilkan Konflik Status**:
  - *Mitigasi*: Melaksanakan semakan idempotensi sebelum pembatalan; jika pesanan sudah `CANCELLED` atau `FILLED`, operasi dipulangkan dengan mesej selamat tanpa ralat pelayan.

---

## 6. Perkara yang TIDAK Termasuk
- Pengubahsuaian formula saiz posisi di dalam Haziq atau syarat 8 Hard Rules Danial.
- Penambahan parameter penapisan saham fizikal baharu di luar 5 parameter piawai L0.

---

## 7. Pelan Pengujian & Verifikasi (SDLC Checklist)
- **SDLC 3 (BVA & Unit Tests)**:
  - Ujian pembatalan status pesanan (`SUBMITTED`, `PENDING`, `SUBMITTED_PAPER_SIM`).
  - Ujian sempadan BVA bagi saiz entri paginasi (min 5, max 50).
- **SDLC 4 (Ujian Hujung-ke-Hujung E2E Playwright)**:
  - Ujian pengesahan ketiadaan butang simulasi.
  - Ujian paparan halaman bersepadu L0 dan penjenamaan menu sidebar L1->L4.
  - Ujian interaksi butang Batal pada pesanan aktif.
  - Ujian penukaran muka surat paginasi (Next / Previous / Page size).
  - Tangkapan skrin Desktop & Mobile ke `/qa/`.
- **SDLC 5a (Semakan Keselamatan & Auth Cloudflare)**:
  - Sahkan Sijil SSL (`*.beta.julietmike.net`), Force SSL, HTTP/2 via curl.
- **SDLC 7 & 7a (Rujukan Fizikal)**:
  - Ujian langsung ke atas URL Beta: `https://stock-trader.beta.julietmike.net/`.
