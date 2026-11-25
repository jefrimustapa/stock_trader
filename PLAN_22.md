# Plan: Fix: Pemantauan Kaunter Dibeli dan Rekod Jualan (Issue #22)
Branch: fix/hom-373-issue-22-pemantauan-kaunter-beli
Issue: https://github.com/jefrimustapa/stock_trader/issues/22
Status: waiting for go (implementation NOT started)

## Goal
Menyiasat dan melaksanakan mekanisme pemantauan aktif kaunter yang telah dibeli (active portfolio positions) serta mekanisme pelaksanaan jualan (Take Profit / Stop Loss / Exit Sentinel) bagi memastikan kaunter dalam portfolio dipantau secara berterusan dan jualan dilaksanakan apabila syarat keluar dipenuhi, bagi mengelakkan kerugian berterusan tanpa rekod jualan seperti dilaporkan dalam GitHub Issue #22.

## Findings / Root Cause
Berdasarkan siasatan terperinci ke atas kod sumber dan arkitektur `stock_trader`:
1. **Saluran Simulasi Ejen Hanya Melakukan Pembelian (`bridge/src/agent_pipeline.py`)**:
   - `run_simulation_cycle()` hanya memproses calon daripada `load_watchlist_candidates()` (yang dimuat turun dari `watchlist.json`).
   - Semua pesanan yang diluluskan dan dihantar ke OpenD (`paper_orders`) ditetapkan `order_side = "BUY"`. Tiada logik kitaran yang mengambil posisi aktif daripada broker/portfolio untuk dinilai oleh Tariq (L1), Nawwar (L1), Haziq (L2), atau Danial (L3) bagi mencetuskan pesanan keluar (`SELL`).
2. **Ketiadaan Pelaksanaan Exit Sentinel Daemon (L4 Exit Management)**:
   - BLUEPRINT.md (Seksyen 1.4, 3.3 D) menetapkan bahawa "Exit Sentinel Daemon (L4)" adalah *SOLE EXECUTION OWNER* untuk memantau pasaran dan menghantar pesanan jualan:
     - Tier 1: TP1 (50% jualan pada 1:1.5 R:R) + ubah SL ke Break-Even.
     - Tier 2: Chandelier Trailing Stop ($HighestHigh - 2.0 \times ATR_{14}$).
     - Tier 3: Emergency Threat Exit melalui endpoint `/api/v1/trade/exit-request`.
     - Tier 4: Time-Based Day Trading Exit pada 15:45 NY.
   - Hakikat kod semasa: Exit Sentinel tidak pernah dibangunkan atau dijalankan sebagai daemon aktif dalam `bridge/`. Endpoint `/api/v1/trade/exit-request` juga belum wujud.
3. **Rekonsiliasi Posisi Hanya Menambah Rekod Audit Masuk, Bukan Stop Loss Aktif (`bridge/src/reconciliation.py`)**:
   - `reconcile_positions()` dalam `reconciliation.py` hanya menghasilkan struktur pembetulan dalam memori (`INJECT_STOP_LOSS`) tetapi tidak menghantar sebarang pesanan henti rugi ke OpenD.
   - `reconcile_positions_with_orders()` dalam `agent_pipeline.py` hanya mendaftar posisi yang belum dikenali ke dalam `paper_orders` sebagai rekod audit `POSITION_RECONCILED` dengan status `FILLED` dan `order_side = 'BUY'`. Tiada pesanan perlindungan Stop Loss sebenar dihantar ke gateway OpenD.
4. **Akibat**:
   - Kaunter yang berjaya dibeli kekal dalam akaun OpenD tanpa sebarang pemantauan pergerakan harga atau perlindungan Stop Loss aktif pada pasaran.
   - Apabila harga kaunter merudum, sistem tidak mencetuskan jualan automatik dan tiada rekod transaksi jualan (`SELL`) didaftarkan, menyebabkan kerugian terapung berterusan tanpa sebarang tindakan pemotongan rugi (cut loss).

## User Review Required
- Pengesahan pendekatan reka bentuk pemantauan posisi & jualan:
  1. **Option A (Disyorkan)**: Laksanakan Exit Sentinel Loop dalam `bridge/src/reconciliation.py` / `agent_pipeline.py` yang memantau setiap posisi aktif dalam `query_positions()` secara berkala (contohnya setiap 10-30 saat):
     - Memeriksa harga pasaran terkini (atau harga tick/kline) berbanding harga entri, Stop Loss (SL), dan Take Profit (TP1).
     - Menghantar pesanan jualan (`SELL`) ke broker OpenD secara automatik apabila paras SL tercapai (Stop Loss Exit) atau paras TP1 tercapai (50% Take Profit).
     - Merekodkan transaksi jualan ke dalam jadual `paper_orders` dengan `order_side = 'SELL'` dan `source = 'EXIT_SENTINEL'`.
  2. **Active Position Review Loop oleh Tariq/Haziq**: Membolehkan kitaran simulasi turut menilai pegangan semasa (`is_held = True`) untuk mengesan pembalikan trend (trend reversal) atau amaran teknikal sebelum SL kena.
- Adakah pemohon (Jefri) bersetuju dengan pelan seni bina ini sebelum Fakhri memulakan pelaksanaan kod?

## Proposed Changes
1. **Bridge Backend (`bridge/src/reconciliation.py` & `agent_pipeline.py`)** [MODIFY / EXTEND]:
   - Bangunkan daemon pemantauan aktif posisi (Exit Sentinel) yang mengambil senarai pegangan aktif (`query_positions()`) dan membandingkan harga semasa dengan SL dan TP.
   - Laksanakan fungsi pelaksanaan jualan automatik `execute_position_exit(symbol, quantity, reason, exit_price)` yang menghantar pesanan `SELL` ke OpenD dan merekodkan ke `paper_orders`.
   - Laksanakan endpoint `POST /api/v1/trade/exit-request` di `bridge/src/routes/trade.py` untuk membolehkan ejen atau dashboard meminta penutupan posisi.
2. **Penyelarasan Hard Rules (`bridge/src/hard_rules.py`)** [VERIFY]:
   - Pastikan pesanan `SELL` melepasi saringan Rule 3 (PDT limit check & rekod round-trip) dan Rule 6 (Waktu dagangan pasaran) dengan tepat tanpa menyekat penutupan posisi rugi kecemasan.
3. **Penyelarasan Dashboard / UI (`dashboard/`)** [VERIFY]:
   - Pastikan paparan portfolio dan aktiviti perdagangan di dashboard mencerminkan transaksi jualan (`SELL`) dengan status `FILLED` dan PnL direalisasi.

## Explicitly NOT changing
- Logik saringan L0 screener (`screener/src/cloud_screener.py`).
- Autentikasi SSO Authentik / Cloudflare Named Tunnel.
- Struktur jadual asas selain menambah sokongan transaksi jualan yang lengkap.

## Verification Plan
1. **Unit & BVA Tests**:
   - Ujian unit untuk pengesanan paras SL: pastikan apabila harga semasa <= SL, pesanan `SELL` dijana.
   - Ujian unit untuk pengesanan paras TP: pastikan apabila harga semasa >= TP_1, pesanan `SELL` dijana.
   - Ujian BVA round-trip PDT: pastikan jualan intraday direkodkan sebagai day trade mengikut Rule 3.
2. **Integration / Simulation Cycle Tests**:
   - Ujian simulasi posisi rugi: sediakan posisi olok-olok (mock position) dengan kerugian melebihi SL, jalankan kitaran rekonsiliasi/exit sentinel, sahkan pesanan `SELL` dihantar ke OpenD dan `paper_orders` mencatatkan transaksi `SELL`.
3. **E2E & Visual Verification**:
   - Tangkapan skrin rekod jualan pada Portfolio / Aktiviti Dagangan untuk semakan pintu QA Zahrin (Langkah 5 SDLC).
