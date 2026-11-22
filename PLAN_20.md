# Plan: Fix Portfolio Data Flash Kosong Semasa Refresh (Issue #20)
Branch: fix/hom-366-issue-20-portfolio-refresh-flash
Issue: https://github.com/jefrimustapa/stock_trader/issues/20
Status: waiting for go (implementation NOT started)

## Goal
Menghapuskan isu "flash kosong" di halaman Portfolio (`#/portfolio`) di mana metrik KPI ($0.00 / 0 Kaunter) dan jadual pegangan memaparkan teks "Tiada posisi aktif dijumpai" seketika sewaktu refresh (manual atau polling latar belakang) sebelum data sebenar diisi semula.

## Findings / Root Cause
Berdasarkan siasatan kod dan bukti tangkapan skrin pemohon (Issue #20):
1. **Frontend Loading State (`dashboard/src/pages/PortfolioPage.jsx`)**:
   - `data` bermula dengan `null`. Semasa render pertama atau navigasi, 4 KPI cards (`Nilai Pasaran Portfolio`, `Jumlah Kos Belian`, `Untung/Rugi`, `Bilangan Kaunter`) terus memaparkan nilai default `$0.00` dan `0 Kaunter` kerana tiada skeleton loading state (`loading && !data`).
   - Butang penapis memaparkan `Semua (0)` semasa memuat.
   - Jadual pegangan terus memaparkan "Tiada posisi aktif dijumpai" sekiranya respons kosong atau semasa data belum bersedia.
   - Tiada corak **Stale-While-Revalidate (SWR)**: Semasa refresh latar belakang (setiap 5s) atau klik "Segar Semula", jika respons API mengalami kelewatan atau pembersihan data, komponen tidak mengekalkan data sedia ada di skrin secara lancar.
2. **Backend & Gateway Transient Fallback (`dashboard/server.js` & `bridge/src/moomoo_client.py`)**:
   - Di `dashboard/server.js` (`/api/portfolio`), panggilan ke Bridge `axios.get('/api/v1/trade/positions')` mempunyai catch block yang mengembalikan `{ positions: [], opend_status: 'DISCONNECTED' }` jika berlaku kelewatan rangkaian/timeout (5000ms). Ini menyebabkan `server.js` membalas dengan HTTP 200 bersama `summary` $0.00 dan `positions: []`, memadamkan paparan sedia ada di klien secara mengejut.
   - Di `bridge/src/moomoo_client.py`, `query_positions()` menggunakan `refresh_cache=True` dan mengembalikan `[]` jika gateway mengembalikan kod selain `RET_OK` tanpa fallback ke cache posisi terakhir.

## User Review Required
- Corak UI: Kita akan menggunakan MUI `Skeleton` untuk render awal (apabila data belum wujud langsung) dan mengekalkan baris sedia ada semasa refresh (Stale-While-Revalidate) dengan penunjuk kemas kini halus (spinning refresh icon / progress indicator).
- Tiada perubahan drastik pada formula pengiraan atau atribut transaksi sedia ada (Audit Trail Issue #17 tetap kekal utuh).

## Proposed Changes
1. **Frontend (`dashboard/src/pages/PortfolioPage.jsx`)** [MODIFY]:
   - Gunakan MUI `<Skeleton variant="rounded" />` atau `<Skeleton variant="text" />` pada 4 KPI Card dan Jadual sewaktu initial load (`loading && !data`). Elakkan paparan angka `$0.00` palsu.
   - Laksanakan Stale-While-Revalidate (SWR): Jangan padamkan `data` semasa refresh. Kekalkan posisi dan metrik sedia ada pada skrin.
   - Tambah animasi putaran halus pada butang "Segar Semula" (`RefreshIcon` berputar atau disabled dengan spinner kecil) semasa `isFetching` aktif.
   - Tambah bar status halus atau chip amaran jika OpenD berada dalam keadaan `DISCONNECTED` tanpa mengosongkan jadual positions yang telah dimuatkan.
2. **Dashboard Server (`dashboard/server.js`)** [MODIFY]:
   - Tambah cache memori ringkas `lastKnownPortfolio` untuk `/api/portfolio`. Sekiranya Bridge/OpenD mengalami timeout atau gagal menyambung, pulangkan `lastKnownPortfolio` bersama bendera amaran `is_stale: true` dan `opend_status: 'DISCONNECTED'`, dan bukannya mengosongkan keseluruhan portfolio menjadi $0.00.
3. **Bridge Moomoo Client (`bridge/src/moomoo_client.py`)** [MODIFY]:
   - Simpan cache `_last_positions`. Sekiranya OpenD mengembalikan `ret_code != RET_OK` disebabkan transient busy/lock, kembalikan `_last_positions` bagi mengelakkan lonjakan data kosong yang mengelirukan.

## Explicitly NOT changing
- Logik pengiraan P&L, harga purata belian, rekonsiliasi OpenD dan atribut transaksi (`AGENT_PIPELINE`, `POSITION_RECONCILED`, `BROKER_IMPORT`).
- Tab-tab dashboard lain seperti L0, Agents, Settings, Quota.

## Verification Plan
1. **Unit & Integration Tests**:
   - Tambah ujian unit di `dashboard/test_portfolio_api.js` untuk mengesahkan:
     a) `/api/portfolio` mengekalkan `lastKnownPortfolio` sekiranya downstream Bridge/OpenD mengalami ralat/timeout.
     b) Status `is_stale: true` dan `opend_status` dikembalikan dengan betul tanpa mengosongkan `positions`.
2. **Frontend Component & Playwright E2E Tests**:
   - Kemas kini `dashboard/test_portfolio_playwright.js` untuk mengesahkan:
     a) Tiada kilatan $0.00 / 0 Kaunter semasa navigasi atau refresh.
     b) Butang "Segar Semula" berfungsi dengan lancar tanpa mengosongkan jadual.
     c) Ujian visual (tangkapan skrin sebelum & selepas refresh).
3. **Full Regression Test Suite**:
   - Jalankan `npm test` dalam folder `dashboard`.
   - Jalankan `pytest tests/test_portfolio_reconciliation_bva.py`.
