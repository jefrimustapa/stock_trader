# PLAN_417: Paper Trading Orders Audit Trail Enhancement

## 1. Goal & Acceptance Criteria
Enhance paper trading orders auditability, visibility, and navigation across the dashboard.

- **AC 1 (Order Price Column)**: 
  * Table header displays `ORDER PRICE` instead of static `ENTRY PRICE`.
  * Rows display clear limit price indications (`BUY LIMIT` / `SELL LIMIT`).
- **AC 2 (Action Reason & Thesis Audit Trail)**: 
  * Orders table displays `REASON / THESIS` column with tooltip and dialog.
  * Links `paper_orders.message`/`source` and `agent_deliberations.haziq_synthesis`.
  * Clearly states reasons like Early Threat Exit, Stop Loss Hit, or TP1.
- **AC 3 (Cost Price & Realized P&L Matching)**: 
  * SELL order rows display original Cost Price (Buy Price).
  * SELL order rows display Realized P&L ($ and %).
  * SELL order rows display Buy Order Reference ID.
- **AC 4 (Full Server-Side Pagination)**: 
  * `/api/agents/orders` supports `page` (or `offset`) and `limit`.
  * Frontend table navigates all records with accurate total row count.
- **AC 5 (Closed Trades History View)**: 
  * Dedicated tab displays full round-trip closed trades without 50-record limit.
  * Includes symbol search filter and status filter.

## 2. Root Cause Analysis (RCA)
N/A (New Feature / Non-bugfix).

## 3. Files to Modify
- `bridge/src/agent_pipeline.py`: Add order matching, realized P&L calculation, reason mapping, and pagination.
- `bridge/src/routes/agents.py`: Add query params (`page`, `offset`, `limit`, `symbol`, `status`) and closed trades route.
- `dashboard/server.js`: Forward pagination query parameters and closed trades route to bridge.
- `dashboard/src/pages/AgentsPage.jsx`: Update table header, reason column, sell P&L display, pagination, and closed trades tab.
- `tests/test_orders_audit_trail_bva.py`: Unit and BVA tests for matching, P&L calculations, and pagination.
- `tests/test_orders_audit_trail_e2e.py`: Playwright E2E browser tests validating UI workflows and visual presentation.

## 4. Technical Approach
1. Update `bridge/src/agent_pipeline.py`:
   - Enhance `get_paper_orders` with `page`, `limit`, `symbol`, `status`, `side`.
   - Implement FIFO matching for SELL orders to find corresponding BUY orders.
   - Calculate `cost_price`, `realized_pnl_usd`, `realized_pnl_pct`, and `buy_order_ref`.
   - Join with `agent_deliberations` to enrich orders with `haziq_synthesis` thesis.
   - Add `get_closed_trades` method to aggregate completed round trips.
2. Update `bridge/src/routes/agents.py`:
   - Support `page`, `limit`, `symbol`, `status` in `GET /api/v1/agents/orders`.
   - Add endpoint `GET /api/v1/agents/closed-trades`.
3. Update `dashboard/server.js`:
   - Forward `page`, `limit`, `symbol`, `status` in `/api/agents/orders`.
   - Add `/api/agents/closed-trades` proxy route.
4. Update `dashboard/src/pages/AgentsPage.jsx`:
   - Rename header `ENTRY PRICE` to `ORDER PRICE`.
   - Add `REASON / THESIS` column with interactive tooltip and detail dialog.
   - For SELL rows, display Cost Price, Realized P&L badge, and Buy Order reference.
   - Implement server-side pagination with accurate total record count.
   - Add tab switcher for "All Orders" and "Closed Trades History" with symbol search filter.
5. Build and verify:
   - Run Vite production build (`npm run build`).
   - Run BVA and unit tests with Python unittest / pytest.
   - Launch beta preview container and verify via Playwright browser container.

## 5. Test Plan
- **BVA Tests (`tests/test_orders_audit_trail_bva.py`)**:
  * Test BUY/SELL order matching with zero profit, positive profit, and loss.
  * Test partial fills and multi-lot SELL orders.
  * Test pagination boundary values: `page=0`, `page=1`, `limit=0`, `limit=5`, large page.
  * Test symbol search with prefix (`US.AAPL`), lowercase (`aapl`), and empty string.
  * Test fallback handling when deliberation thesis is missing or empty.
- **E2E Playwright Scenario (`tests/test_orders_audit_trail_e2e.py`)**:
  * Open `#/agents` in headless browser.
  * Verify `ORDER PRICE` column exists.
  * Verify `REASON / THESIS` column and tooltip dialog.
  * Verify SELL order shows Cost Price and Realized P&L.
  * Verify pagination buttons navigate pages correctly.
  * Verify Closed Trades tab renders and symbol filter works.

## 6. Risks & Non-Goals
- **Risks**:
  * Historical records without corresponding BUY orders in SQLite: Handled gracefully with fallback labels (`N/A` or `Initial Position`).
  * Concurrency in shared SQLite database: Use timeout and read-only connections for queries.
- **Non-Goals**:
  * Modifying broker execution logic or live Moomoo OpenD credentials.
  * Modifying Cohu CAG repositories or external services.
