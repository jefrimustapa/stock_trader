# PLAN_417: Paper Trading Orders Audit Trail Enhancement

## 1. Goal & Acceptance Criteria
Enhance paper trading orders auditability, visibility, and navigation across the dashboard, implementing Option B (filter dropdown & server-side pagination on Agents page) and Option D (closed trades history on Portfolio page) as directed by the requester.

- **AC 1 (Order Price Column Renaming)**: 
  * `dashboard/src/pages/AgentsPage.jsx`: Table header displays `ORDER PRICE` instead of static `ENTRY PRICE`.
  * Rows display clear limit price indications (`BUY LIMIT` / `SELL LIMIT`).
- **AC 2 (Action Reason & Thesis Audit Trail)**: 
  * Orders table displays `REASON / THESIS` column with interactive tooltip and modal dialog.
  * Links `paper_orders.message`/`source` and `agent_deliberations.haziq_synthesis`.
  * Shows exact rationale (Early Threat Exit by Haziq, Stop Loss Hit, TP1 Partial Exit).
- **AC 3 (Cost Price & Realized P&L Matching on SELL Orders)**: 
  * For every SELL order row:
    - Display original Cost Price (Buy Price).
    - Display Realized P&L in dollar ($) and percentage (%).
    - Display reference to original Buy Order ID (`buy_order_ref`).
- **AC 4 (Full Server-Side Pagination - Option B)**: 
  * Backend `/api/agents/orders` supports `page` and `limit` query parameters with total rows count.
  * Initial page size adheres to `screenerConfig.agent_orders_per_page` from settings (10, 25, 50, 100).
  * Table pagination controls (`<` and `>`) allow smooth navigation across all database records when total records > `max_per_page`.
  * Includes Filter Dropdown on Agents page: `All Orders`, `Active / Open`, `Closed (Round-Trip)`.
- **AC 5 (Closed Trades History on Portfolio Page - Option D)**: 
  * Dedicated Closed Trades History section/view on `#/portfolio` for round-trip completed trades.
  * Adheres to `max_per_page` setting with full `<` / `>` pagination across all historical records.
  * Displays Symbol, Entry Date, Exit Date, Buy Price, Sell Price, Quantity, Realized P&L ($ and %), and Action Thesis.
  * Includes symbol search and status/result filters.

## 2. Root Cause Analysis (RCA)
N/A (New Feature / Non-bugfix).

## 3. Files to Modify
- `bridge/src/agent_pipeline.py`: Order matching, FIFO realized P&L calculation, deliberation reason joining, and server-side pagination.
- `bridge/src/routes/agents.py`: Support `page`, `limit`, `symbol`, `status`, `side` parameters; add closed trades endpoint.
- `dashboard/server.js`: Forward pagination query parameters and closed trades route to bridge service.
- `dashboard/src/pages/AgentsPage.jsx`: Update table header to `ORDER PRICE`, add `REASON / THESIS` column/modal, SELL P&L display, filter dropdown, and server-side pagination.
- `dashboard/src/pages/PortfolioPage.jsx`: Add Closed Trades History section with full pagination and symbol search.
- `tests/test_orders_audit_trail_bva.py`: Unit and BVA tests for matching, P&L calculations, and pagination boundaries.
- `tests/test_orders_audit_trail_e2e.py`: Playwright E2E browser tests validating UI workflows and visual presentation.

## 4. Technical Approach
1. **Backend Logic (`bridge/src/agent_pipeline.py` & `routes/agents.py`)**:
   - Enhance `get_paper_orders` to accept `page`, `limit`, `symbol`, `status`, `side`, `filter`.
   - Implement FIFO matching for SELL orders to find corresponding BUY orders for the same symbol.
   - Compute `cost_price`, `realized_pnl_usd`, `realized_pnl_pct`, and `buy_order_ref`.
   - Join with `agent_deliberations` to enrich orders with `haziq_synthesis` thesis.
   - Implement `get_closed_trades` to aggregate round-trip trade pairs (entry & exit details, P&L, hold duration).
   - Return response format: `{ "orders": [...], "total": int, "page": int, "limit": int, "total_pages": int }`.
2. **Dashboard Proxy (`dashboard/server.js`)**:
   - Forward query parameters (`page`, `limit`, `symbol`, `status`, `side`, `filter`) in `/api/agents/orders`.
   - Add `/api/agents/closed-trades` proxying to bridge service.
3. **Frontend Agents Page (`dashboard/src/pages/AgentsPage.jsx`)**:
   - Rename header `ENTRY PRICE` to `ORDER PRICE`.
   - Display `BUY LIMIT: $X` / `SELL LIMIT: $X` chips.
   - Add `REASON / THESIS` column with tooltip and modal dialog.
   - For SELL rows, render Cost Price, Realized P&L chip (green/red), and Buy Ref.
   - Add Filter Dropdown: `All`, `Active/Open`, `Closed (Round-Trip)`.
   - Replace client-side `.slice()` with server-side pagination calling `/api/agents/orders?page={page+1}&limit={rowsPerPage}`.
4. **Frontend Portfolio Page (`dashboard/src/pages/PortfolioPage.jsx`)**:
   - Add Closed Trades History section/tab with table displaying round-trip trades.
   - Implement server-side pagination with `<` and `>` controls honoring `max_per_page`.
   - Include symbol search filter and P&L color badges.
5. **Testing & SDLC Compliance**:
   - BVA tests covering matching logic, zero profit, positive profit, negative profit, pagination edge cases (`page=0`, `limit=0`, large page).
   - E2E Playwright test validating Agents Page and Portfolio Page.
   - Deploy beta environment via Cloudflare Named Tunnel.

## 5. Test Plan
- **BVA Tests (`tests/test_orders_audit_trail_bva.py`)**:
  * Test BUY/SELL order matching with gain, loss, and breakeven.
  * Test multi-lot partial sells and FIFO cost calculation.
  * Test pagination boundaries: `limit=0`, `limit=10`, `page=1`, `page=999`.
  * Test symbol search with prefix (`US.AAPL`), lowercase (`aapl`), and empty string.
  * Test fallback handling when deliberation thesis is missing or external.
- **E2E Playwright Scenario (`tests/test_orders_audit_trail_e2e.py`)**:
  * Open `#/agents`, verify `ORDER PRICE` header and `REASON / THESIS` column.
  * Test Filter Dropdown (`All`, `Active`, `Closed`).
  * Test page navigation (`>` next page) showing records beyond initial 50.
  * Open `#/portfolio`, verify Closed Trades History section and pagination.

## 6. Risks & Non-Goals
- **Risks**:
  * Historical SELL orders without matching BUY orders: Handled with fallback "Initial Position" or N/A.
  * Concurrency on SQLite: Read operations use timeout and read connections.
- **Non-Goals**:
  * Modifying broker execution logic or live Moomoo OpenD credentials.
