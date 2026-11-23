# Plan: Fix: Candle count label not reflecting user choice

Branch: fix/hom-367-issue-6-candle-count-label
Issue: https://github.com/jefrimustapa/stock_trader/issues/6
Status: waiting for go (implementation NOT started)

## Goal
- Update the candlestick chart HUD so the candle count label accurately reflects user selection (e.g. 40 candles vs All candles vs visible range).
- Acceptance Criteria:
  - When user clicks "40 Lilin", user sees active button styling and the label indicates 40 candles (or 40 / total).
  - When user clicks "Semua", user sees active button styling and the label indicates total fetched candles (e.g. 150 lilin).
  - When user zooms or pans, visible candle count updates dynamically without showing misleading static total count.

## Findings / Root Cause
- In `dashboard/src/components/KlineDrawer.jsx#L1031-L1087`:
  - Buttons `40 Lilin` and `Semua` call `handleShowRecent` and `handleFitAll` but do not track active view state (`zoomMode`).
  - Neither button shows active visual state (`variant="outlined"` always, no active indicator).
  - The label at line 1086 is hard-coded to `{klineData?.candles?.length || 0} lilin` (always shows backend total of 150).
  - As captured in GitHub Issue #6 screenshot, clicking `40 Lilin` leaves the label showing `150 lilin`.

## User Review Required
- Label formatting preference:
  - Option A (Recommended): Show visible vs total count, e.g., `40 / 150 lilin` when 40 is active, `150 lilin` when All is active, and dynamic visible count when zooming (`N / 150 lilin`).
  - Option B: Show active mode count only, e.g., `40 lilin` for 40, `150 lilin` for Semua.

## Proposed Changes
- `[MODIFY]` `dashboard/src/components/KlineDrawer.jsx`:
  - Add state `zoomMode` (`'40'` | `'all'` | `'custom'`) defaulting to `'40'`.
  - Add active styling to `40 Lilin` and `Semua` buttons based on `zoomMode`.
  - Subscribe to chart `timeScale().subscribeVisibleLogicalRangeChange` to update visible candle count or reflect active mode.
  - Update Typography label at line 1086 to display formatted candle count reflecting active choice / visible bars.

## Explicitly NOT changing
- Backend API endpoints (`/api/kline`) and Moomoo OpenAPI fetching logic.
- OHLC calculations and time scale layout options.

## Verification Plan
- Unit / Component test (BVA):
  - Verify label display when total candles < 40 (e.g. IPO stocks with 3 candles).
  - Verify label display when total candles = 150.
  - Verify boundary case when `klineData.candles` is empty or null.
- E2E Test (Playwright via `/paperclip/bin/pw-browser`):
  - Open drawer for an equity (e.g. US.ARDT or US.AAPL).
  - Click "40 Lilin" -> assert label reflects 40 candles.
  - Click "Semua" -> assert label reflects total candles (150).
  - Zoom in/out -> assert count reflects visible range.
