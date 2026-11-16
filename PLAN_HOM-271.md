# Plan: Fix Tapis Kaunter OTC pada Enjin L0 Screener (NYSE, NASDAQ, AMEX Sahaja)
Branch: fix/hom-271-filter-otc-screener
Issue: https://crew.julietmike.net/HOM/issues/HOM-271
Status: waiting for go (implementation NOT started)

## Goal
Menapis keluar semua kaunter Over-The-Counter (OTC, e.g. US_PINK, Pink Sheets, Grey Market, OTCBB) sepenuhnya seawal enjin L0 Screener agar hanya saham di bursa utama AS (NYSE, NASDAQ, AMEX) yang layak dipantau dan masuk ke kuota sebut harga/analisis ejen L1 (Tariq & Nawwar).

## Findings / Root Cause
1. **Analisis data pasaran mentah Moomoo**:
   - Panggilan `get_stock_screen(req)` dengan `SimpleField.MARKET = ScrMarket.US` dalam `screener/src/main.py:168-195` menarik seluruh pasaran AS tanpa mengira bursa.
   - Daripada 200 kaunter mentah yang dipulangkan oleh cloud screen semasa ini:
     - `US_NYSE`: 99 kaunter
     - `US_NASDAQ`: 64 kaunter
     - `US_PINK` (OTC): 33 kaunter (16.5% daripada keseluruhan universe!)
     - `US_AMEX`: 3 kaunter
     - `UNKNOWN`: 1 kaunter
   - Kaunter OTC seperti `US.DFKUY`, `US.BMPSY`, `US.RBGLY`, `US.MGCLY` melepasi tapisan kasar dan masuk ke `Stage 0` (`filter_stage0_quality`), `Stage 1`, dan seterusnya bersaing untuk kuota K-line 30 hari (`enrich_kline_gate`).
2. **Ketiadaan Exchange Filter di Moomoo Cloud Screen**:
   - `SimpleField.EXCHANGE` pada `StockScreenRequest` memulangkan 0 hasil daripada backend Moomoo untuk pasaran US (tidak disokong/tidak diindeks pada backend cloud screening Moomoo).
   - `Plate` US hanya mengandungi plate industri dan konsep, tiada plate bursa rasmi.
3. **Penyelesaian Tepat & Pantas Melalui Moomoo OpenAPI**:
   - Moomoo menyediakan API `get_stock_basicinfo(Market.US, SecurityType.STOCK)` yang sangat pantas (~1.3 saat untuk 13,105 kaunter US).
   - Setiap entri mempunyai medan `exchange_type` yang jelas: `US_NASDAQ` (4,232), `US_NYSE` (2,623), `US_AMEX` (302), dan `US_PINK` (5,947 OTC).
   - Ini membolehkan penapisan bursa deterministik 100% tepat dilakukan seawal peringkat pengumpulan data pasaran.

## User Review Required
- Pengesahan skop bursa dibenarkan: `US_NYSE`, `US_NASDAQ`, `US_AMEX`. Semua kaunter selain bursa ini (termasuk `US_PINK` dan `N/A`) ditapis keluar 100%.

## Proposed Changes

### 1. `screener/src/config.py`
- `[MODIFY]`: Tambah pembolehubah konfigurasi bursa yang dibenarkan:
  ```python
  ALLOWED_EXCHANGES: Tuple[str, ...] = ("US_NYSE", "US_NASDAQ", "US_AMEX")
  EXCHANGE_CACHE_TTL_SECONDS: int = int(os.getenv("EXCHANGE_CACHE_TTL_SECONDS", "3600"))
  ```

### 2. `screener/src/schemas.py`
- `[MODIFY]`:
  - Tambah medan `exchange: Optional[str] = None` pada `WatchlistStock`.
  - Tambah metrik `otc_filtered_count: int = 0` pada `FunnelStageMetrics` bagi merekodkan statistik kaunter OTC yang disekat dalam setiap kitaran imbasan.

### 3. `screener/src/main.py`
- `[MODIFY]`:
  - Tambah fungsi pengurusan cache bursa Moomoo:
    `get_us_exchange_mapping(quote_ctx) -> Dict[str, str]`
    Mengambil data bursa melalui `quote_ctx.get_stock_basicinfo(Market.US, SecurityType.STOCK)` dengan cache dalam memori dan TTL (default 1 jam).
  - Dalam `fetch_market_universe`:
    - Mengambil pemetaan bursa sebelum pemprosesan baris saham.
    - Menapis keluar sebarang kaunter yang bukan dalam `ALLOWED_EXCHANGES` seawal mungkin sejurus selepas `get_stock_screen`.
    - Merekodkan `otc_filtered_count` dan memasukkan maklumat `exchange` ke dalam kamus saham.
    - Log audit terperinci menyatakan berapa banyak kaunter OTC yang ditapis keluar.

### 4. `screener/src/cloud_screener.py`
- `[MODIFY]`:
  - Lapisan pertahanan kedua (Defense-in-Depth): Dalam `filter_stage0_quality`, sahkan medan `exchange`. Jika kaunter mempunyai `exchange` yang bukan dalam `ALLOWED_EXCHANGES`, tolak dengan sebab `OTC_EXCHANGE_REJECTED` dan rekod dalam `funnel.dropped_reasons`.
  - Memastikan medan `exchange` dipindahkan ke model `WatchlistStock` dalam `enrich_kline_gate` dan `filter_stage3`.

### 5. `tests/test_screener_otc_filter_bva.py`
- `[NEW]`: Suite ujian unit komprehensif merangkumi:
  - BVA & Branch coverage untuk penapisan bursa (NYSE, NASDAQ, AMEX diterima; PINK, OTC, tiada bursa ditolak).
  - Ujian integriti metrik funnel (`otc_filtered_count` dan `dropped_reasons`).
  - Ujian kendalian cache TTL dan fail-closed jika data bursa tidak tersedia.
  - Mutation testing manual (5 mutan logik semakan keahlian bursa).

## Explicitly NOT Changing
- Kod bridge trading execution (`bridge/src/*`) dan hard rules.
- Enjin analisis Tariq & Nawwar (mereka hanya membaca output bersih daripada `watchlist.json`).
- Dashboard UI komponen (bukan tugasan visual).

## Verification Plan

### Automated Unit & BVA Tests
- Jalankan `tests/test_screener_otc_filter_bva.py` di dalam persekitaran kontena screener:
  - Sahkan 100% kes lulus untuk BVA nilai sempadan bursa.
  - Sahkan 5 mutan manual dikesan dan digagalkan oleh ujian.

### Regresi Ujian Sedia Ada
- Jalankan semula `test_two_lane_bva.py`, `test_screener_schema.py`, dan ujian regresi screener lain untuk memastikan tiada sebarang regresi fungsian sedia ada.

### Real E2E Verification
- Jalankan satu kitaran `fetch_market_universe` sebenar terhadap `moomoo-opend` yang sedang aktif (`READY`).
- Buktikan bahawa:
  1. 33 kaunter OTC (`US_PINK`) yang dikesan sebelum ini ditapis keluar sepenuhnya.
  2. `watchlist.json` yang terhasil hanya mengandungi kaunter bursa utama (`US_NYSE`, `US_NASDAQ`, `US_AMEX`).
  3. Tiada kuota K-line digunakan untuk sebarang kaunter OTC.
