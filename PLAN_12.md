# Plan: Feat: Model Yuran Transaksi Moomoo & Penampan Break-Even Ejen Haziq
Branch: feat/hom-374-issue-12-moomoo-fee-model
Issue: https://github.com/jefrimustapa/stock_trader/issues/12
Reference: https://www.moomoo.com/my/support/topic9_136 (Moomoo Malaysia US Fee Schedule)
Status: waiting for go (implementation NOT started)

## Goal
Implement a realistic and compliant Moomoo Malaysia (Moomoo MY) US trading fee calculation engine, adjust Haziq's L2 Break-Even Stop Loss ($SL_{BE}$) formula, and display estimated transaction fees along with Gross vs Net P&L across the Portfolio dashboard.

Specifically:
1. Model the exact fee schedule from Moomoo Malaysia:
   - **Commission**: 0.03% * Transaction Amount (rounded up to nearest $0.01 / order)
   - **Platform Fee**: $0.99 / order (flat)
   - **Settlement Fee**: $0.003 / share (max 1% * trade amount)
   - **SEC Fee (sells only)**: 0.0000206 * Transaction Amount (min $0.01 / trade)
   - **FINRA TAF (sells only)**: $0.00 / share (subject to regulatory min $0.01)
   - **Consolidated Audit Trail (CAT)**: $0.000003 / share
   - **Malaysian Stamp Duty**: RM 1.00 for every RM 1,000 (or fractional part) in MYR equivalent (converted to USD at configurable rate, e.g. USD/MYR 4.45)
2. Dynamically calculate round-trip transaction costs in `bridge/src/fee_model.py` and calibrate Haziq's L2 break-even buffer:
   $$SL_{BE} = Entry + \left(\frac{\text{Fee}_{roundtrip}}{\text{Quantity}}\right)$$
   Ensuring that raising Stop Loss to Break-Even after TP1 covers all platform fees, broker commissions, regulatory levies, and stamp duty.
3. Reflect fee liabilities on the portfolio dashboard:
   - `/api/portfolio` in `dashboard/server.js`: Computes position-level estimated exit/round-trip fees and net unrealized P&L.
   - `dashboard/src/pages/PortfolioPage.jsx`: Displays Net P&L in the KPI cards and dedicated columns for Estimated Fees & Net P&L in the holdings table.
4. **Strict USD Denomination**: All calculations, fees, Break-Even Stop Loss levels ($SL_{BE}$), and dashboard P&L metrics are strictly denominated and output in **USD ($)**. Any regulatory items quoted in MYR (such as Malaysian Stamp Duty: RM 1.00 / RM 1,000) are converted into USD equivalent prior to summing into the round-trip fee total (`stamp_duty_usd = (ceil(notional_myr / 1000) * 1.00) / usd_myr_rate`). No MYR currency values will be exposed in API payloads, order sizing, or UI metrics.

## Findings / Root Cause
- Current implementation in `bridge/src/agent_pipeline.py#L507-L590` (`evaluate_haziq_synthesis`) assumes zero transaction friction, placing stops strictly based on technical ATR ($1.5 \times ATR_{14}$) without accounting for round-trip execution costs.
- Moomoo Malaysia US stock fee structure (reviewed from `https://www.moomoo.com/my/support/topic9_136`) contains both fixed components ($0.99 platform fee per order) and variable components (0.03% commission, $0.003/share settlement fee, SEC selling fee, and Malaysian stamp duty of RM 1/RM 1,000). A flat constant alone (e.g. $2.00) underestimates costs for high-share or high-notional orders, and overestimates for single-share micro orders. A dynamic calculation function is required.
- In `dashboard/server.js#L1450-L1485`, `/api/portfolio` computes `unrealized_pl = marketValue - totalCost` strictly as gross P&L, overstating portfolio performance before actual broker execution.
- In `dashboard/src/pages/PortfolioPage.jsx#L282-L335`, KPI Card 3 and the positions table do not show estimated fee liabilities or net proceeds.

## User Review Required
1. **Malaysian Stamp Duty Inclusion**:
   - Moomoo MY imposes Malaysian Stamp Duty (RM 1.00 per RM 1,000 transaction amount, converted to USD). For a $1,000 trade (~RM 4,450), this adds ~RM 5.00 ≈ $1.12 USD per leg (~$2.25 USD round-trip).
   - **Recommendation**: Enable Stamp Duty calculation by default (`INCLUDE_STAMP_DUTY = True`, default `USD_MYR_RATE = 4.45`), with an environment variable toggle so users can compare pure broker fees ($1.98 platform + commission + settlement + SEC) vs total cash deductions.
2. **Break-Even Stop Loss Formula Rounding**:
   - $SL_{BE}$ will round UP (ceiling to nearest cent) so the net P&L at $SL_{BE}$ is guaranteed $\ge \$0.00$.

## Proposed Changes
### Backend & Bridge
- `bridge/src/fee_model.py` [NEW]:
  - Implement `MoomooFeeModel` class:
    - `calculate_order_fee(price: float, quantity: int, side: str = "BUY", include_stamp_duty: bool = True) -> Dict[str, float]`
    - `calculate_roundtrip_fee(entry_price: float, quantity: int, exit_price: Optional[float] = None, include_stamp_duty: bool = True) -> Dict[str, Any]`
    - `calculate_breakeven_sl(entry_price: float, quantity: int, include_stamp_duty: bool = True) -> float`
  - Support env configuration: `MOOMOO_INCLUDE_STAMP_DUTY` (default: `true`), `MOOMOO_USD_MYR_RATE` (default: `4.45`), `MOOMOO_PLATFORM_FEE` (default: `0.99`).
- `bridge/src/config.py` [MODIFY]:
  - Register fee configuration constants with fail-safe defaults.
- `bridge/src/agent_pipeline.py` [MODIFY]:
  - In `evaluate_haziq_synthesis()`:
    - Invoke `MoomooFeeModel.calculate_roundtrip_fee(price, allocated_shares)`.
    - Compute `break_even_stop_loss = MoomooFeeModel.calculate_breakeven_sl(price, allocated_shares)`.
    - Expose `fee_roundtrip`, `be_buffer_per_share`, and `break_even_stop_loss` in Haziq's return payload and thesis statement.

### Dashboard & API
- `dashboard/server.js` [MODIFY]:
  - Add Moomoo MY fee calculation logic for `/api/portfolio`:
    - For each open position:
      - Buy fee (incurred at cost price) + estimated Sell fee (at current nominal price).
      - Compute `estimated_fees`, `net_unrealized_pl = plVal - estimated_fees`, `net_pl_pct`.
    - In `summary`:
      - `total_estimated_fees`
      - `total_gross_pl`: `totalPlVal`
      - `total_net_pl`: `Number((totalPlVal - totalEstimatedFees).toFixed(2))`
      - `total_net_pl_pct`
- `dashboard/src/pages/PortfolioPage.jsx` [MODIFY]:
  - Summary KPI Card 3: Show Net Unrealized P&L as the primary figure, with Gross P&L and Estimated Fees in a secondary badge/subtitle.
  - Holdings Table: Add columns for "Est. Fees ($)" and "Net P&L ($ / %)" with appropriate green/red styling.

### Testing & Verification
- `tests/test_moomoo_fee_model_bva.py` [NEW]:
  - Unit & BVA tests covering:
    - 1 share micro-position vs 100 shares vs 1,000 shares
    - Low-price stock ($1.50) vs high-price stock ($350.00)
    - Buy fee, Sell fee (with SEC and FINRA TAF), Stamp duty rounding per RM 1,000
    - Exact Break-Even SL guarantee ($Net\ P\&L \ge \$0.00$ when closed at $SL_{BE}$)
- `tests/test_agent_pipeline_bva.py` [MODIFY]:
  - Validate Haziq's synthesis returns correct break-even SL and fee attributes.
- `dashboard/test_portfolio_api.js` [MODIFY/ADD]:
  - Assert `/api/portfolio` response includes `total_net_pl`, `total_estimated_fees`, and position-level net metrics.
- `dashboard/test_portfolio_playwright.js` [MODIFY/ADD]:
  - End-to-end browser test verifying Net P&L and fee values render accurately in the table and cards.

## Explicitly NOT changing
- No changes to broker order dispatching protocols or OpenD connectivity routines.
- No changes to Danial's 8 Hard Rules validation logic.
- No changes to L0 screener candidate filtering or L1 scoring logic.

## Verification Plan
1. Unit tests for fee model & Haziq synthesis:
   `python3 -m unittest tests/test_moomoo_fee_model_bva.py tests/test_agent_pipeline_bva.py`
2. Backend portfolio API test:
   `node dashboard/test_portfolio_api.js`
3. Frontend build:
   `cd dashboard && npm run build`
4. UI verification via Playwright:
   `node dashboard/test_portfolio_playwright.js`
5. Beta deployment verification on `https://stock-trader-beta.julietmike.net`
