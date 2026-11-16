# Plan: Pengasingan Tetapan Had Siling Modal dari L0 Screener ke Tab Khusus
Branch: fix/hom-305-modal-ceiling-tab
Issue: https://crew.julietmike.net/HOM/issues/HOM-305
Status: waiting for go (implementation NOT started)

## 1. Goal & Requirements
Mengasingkan kawalan tetapan "Had Siling Modal Maksimum (Limit Buying Power)" daripada Tab 1 (Parameter Screener L0) kepada Tab khusus berasingan ("Pengurusan Modal & Risiko" / "Portfolio Sizing") dalam halaman Settings Dashboard (`SettingsPage.jsx`).

### Skop Tugasan:
1. **Pindahkan kawalan modal keluar dari Tab Screener**: Alihkan kawalan `max_buying_power`, input field, preset chips, dan penjelasan saiz posisi ke Tab baru: "Pengurusan Modal & Risiko".
2. **Kembalikan Tab 1 tulen untuk L0 Screener**: Tab 1 ("Parameter Screener L0") hanya memaparkan parameter penapisan saham fizikal:
   - Harga Minimum Saham (`min_price`)
   - Cap Pasaran Minimum (`min_market_cap`)
   - Volum Harian ADV20 Minimum (`min_volume`)
   - Nisbah Volum Relatif RVOL Minimum & Maksimum (`min_rvol`, `max_rvol`)
   - Had Calon Saham per Lorong Strategi (`max_candidates_per_lane`)
3. **Penguatkuasaan Dinamik Tanpa Restart**: Pastikan perubahan had modal melalui Tab baru disegerakkan secara langsung ke fail konfigurasi SQLite WAL (`shared_data/screener_config.sqlite`) dan dikuatkuasakan serta-merta pada runtime kontena live (`stock_mcp_bridge` / `stock_screener_daemon`) tanpa memerlukan restart manual kontena.
4. **Sokongan Navigasi Tab & Hash**:
   - Tab 0: `Parameter Screener L0` (`#/settings` atau `#/settings?tab=screener`)
   - Tab 1: `Pengurusan Modal & Risiko` (`#/settings?tab=capital` atau `#/settings?tab=risk`)
   - Tab 2: `Pengurusan Gerbang OpenD` (`#/settings?tab=opend`)

---

## 2. User Acceptance Criteria (Kriteria Penerimaan Pengguna)
1. **Pemisahan Antaramuka**:
   - Bila pengguna membuka tab "Parameter Screener L0", pengguna hanya melihat 5 parameter saringan kaunter saham tulen. Medan Had Siling Modal tidak lagi wujud dalam tab ini.
   - Bila pengguna menekan tab "Pengurusan Modal & Risiko", pengguna melihat kad konfigurasi Had Siling Modal Maksimum, butang preset pantas ($10k, $25k, $50k, $100k, $500k), penerangan integrasi saiz posisi Haziq (L2) & Danial (L3), dan butang simpan khusus modal.
2. **Pengesahan & Had Keselamatan (BVA)**:
   - Nilai had siling modal < $500.00 disekat serta-merta dengan mesej amaran antaramuka dan HTTP 400.
   - Nilai had siling modal > $100,000,000.00 disekat dengan amaran.
   - Nilai sah berjaya disimpan dan dipaparkan dalam chip status semasa.
3. **Penyegerakan Live (Zero-Downtime / No Restart)**:
   - Sebaik sahaja had modal disimpan, pembacaan seterusnya oleh `bridge` / `agent_pipeline.py` (Haziq & Danial) terus menggunakan had modal efektif baru tanpa sebarang restart kontena `stock_mcp_bridge` atau `stock_screener_daemon`.
4. **Responsif & Navigasi**:
   - Pautan langsung `#/settings?tab=opend` kekal membuka panel OpenD (Tab 2) dengan tepat tanpa mengganggu aliran KPI dashboard sedia ada.
   - Paparan antaramuka tersusun kemas dan berfungsi pada kedua-dua resolusi Desktop (1280x800) dan Mobile (390x844).

---

## 3. Fail & Modul yang Terlibat
1. `dashboard/src/pages/SettingsPage.jsx`:
   - [MODIFY] Tambah Tab ke-3 pada senarai Tab MUI:
     - Index 0: `Parameter Screener L0` (`id="tab-screener-config"`)
     - Index 1: `Pengurusan Modal & Risiko` (`id="tab-capital-risk"`)
     - Index 2: `Pengurusan Gerbang OpenD` (`id="tab-opend-gateway"`)
   - [MODIFY] Kemas kini logik hash navigation (`getInitialTab`, event listener `hashchange`, `handleTabChange`) untuk menyokong `tab=capital`, `tab=risk`, dan memetakan `tab=opend` ke index 2.
   - [MODIFY] Asingkan borang simpan:
     - Simpan Parameter Screener (hanya hantar 5 parameter L0).
     - Simpan Had Modal & Risiko (hantar parameter `max_buying_power`).
   - [MODIFY] Pindahkan kad Had Siling Modal, kad penerangan sizing institutional, dan kad ringkasan modal ke panel Tab 1.
2. `dashboard/server.js`:
   - [VERIFY / MAINTAIN] Menyokong semakan PATCH partial updates bagi konfigurasi screener & had modal dengan validasi sempadan BVA sedia ada.
3. `bridge/src/agent_pipeline.py`:
   - [VERIFY / MAINTAIN] Memastikan fungsi `get_max_buying_power_limit()` membaca terus nilai terkini daripada SQLite WAL database pada setiap pusingan analisis & pengauditan.
4. `dashboard/test_hom305_playwright.js`:
   - [NEW] Skrip ujian E2E Playwright merangkumi pengesahan pemisahan Tab, BVA modal, navigasi hash, desktop & mobile screenshot.

---

## 4. Pendekatan & Alternatif yang Ditolak
- **Pendekatan Dipilih**:
  Mewujudkan 3 tab berasingan pada `SettingsPage`: Tab 0 (L0 Screener), Tab 1 (Pengurusan Modal & Risiko), Tab 2 (Pengurusan Gerbang OpenD). Setiap tab mempunyai skop borang dan butang simpan tersendiri, tetapi berkongsi backend SQLite WAL yang sama bagi menjamin ketepatan transaksi data.
- **Alternatif Ditolak 1: Mengasingkan Modal ke Halaman/Laluan URL Baharu (cth. `#/capital`)**:
  Ditolak kerana konfigurasi modal adalah sebahagian daripada tetapan sistem teras. Mewujudkan laluan URL baharu dalam menu navigasi utama akan menambah kekusutan sidebar dashboard dan memecahkan konsistensi UI Sneat.
- **Alternatif Ditolak 2: Menggunakan Dialog Modal (Popup) di Tab 1**:
  Ditolak kerana had siling modal memerlukan penerangan mendalam mengenai mekanisma sizing Haziq dan pengauditan Danial serta butang preset yang memerlukan ruang paparan yang selesa.
- **Alternatif Ditolak 3: Membina jadual pangkalan data baharu (`capital_config.sqlite`)**:
  Ditolak kerana `screener_config.sqlite` sedia ada sudah mempunyai kolum `max_buying_power` dalam mod WAL yang boleh diakses serentak oleh kontena dashboard, bridge, dan screener tanpa konflik konkurensi.

---

## 5. Analisis Risiko & Mitigasi
- **Risiko 1: Pautan Pintas OpenD Terjejas (Breaking Change pada Hash Navigation)**:
  - *Mitigasi*: Pautan di `App.jsx` dan `KpiCards.jsx` menggunakan `#/settings?tab=opend`. Logik `getInitialTab` dan `handleTabChange` diselaraskan agar jika `hash.includes('tab=opend')`, ia secara automatik memilih Tab 2 (OpenD), manakala `tab=capital` atau `tab=risk` memilih Tab 1, dan lalai ialah Tab 0.
- **Risiko 2: Borang Simpan Tab 0 Menimpa Had Modal dengan Nilai Lalai**:
  - *Mitigasi*: Butang simpan Tab 0 hanya menghantar field parameter L0 (atau mengekalkan nilai `max_buying_power` sedia ada tanpa mengubahnya), dan sebaliknya untuk Tab 1.
- **Risiko 3: Latensi atau Kunci Pangkalan Data SQLite (Locking)**:
  - *Mitigasi*: Pangkalan data beroperasi dalam mod `WAL` (Write-Ahead Logging) dengan timeout transaksi pantas, memastikan pembacaan live oleh pipeline ejen tidak disekat oleh operasi PATCH dari dashboard.

---

## 6. Perkara yang TIDAK Termasuk (Explicitly Out of Scope)
- Pengubahsuaian formula saiz posisi di dalam `Haziq` atau kriteria sembilan semakan risiko di dalam `Danial` (logik kuantitatif kekal seperti sedia ada).
- Penambahan parameter penapisan saham L0 yang baharu di luar 5 parameter piawai.
- Sebarang pengubahsuaian konfigurasi rangkaian port atau fail `.env` luaran.

---

## 7. Pelan Pengujian & Verifikasi (SDLC Checklist)
- **SDLC 3 (BVA & Unit Tests)**:
  - Ujian sempadan nilai had modal: $499.99 (gagal), $500.00 (lulus minima), $50,000 (lulus pertengahan), $100M (lulus maksima), $100,000,001 (gagal).
  - Ujian parameter penapisan L0 kekal utuh dan tidak terjejas oleh perubahan UI.
- **SDLC 4 (Ujian Hujung-ke-Hujung E2E Playwright)**:
  - Menggunakan kontena `playwright-inno-x` melalui `/paperclip/bin/pw-browser`.
  - Sahkan Tab 0 hanya mengandungi kawalan L0 dan TIADA kawalan modal.
  - Sahkan Tab 1 mengandungi kawalan Had Siling Modal, preset, dan butang simpan.
  - Sahkan Tab 2 memaparkan panel OpenD Gateway.
  - Ujian pada resolusi Desktop (1280x800) dan Mobile (390x844) berserta tangkapan skrin ke `/qa/`.
- **SDLC 5a (Semakan Keselamatan & Auth Cloudflare)**:
  - Sahkan Sijil SSL (`*.beta.julietmike.net`), Force SSL, HTTP/2, dan integriti endpoint melalui curl.
- **SDLC 7 & 7a (Rujukan Fizikal)**:
  - Ujian langsung ke atas URL Beta: `https://stock-trader.beta.julietmike.net/`
  - Sahkan HTTPS dan HTTP/2 aktif.
