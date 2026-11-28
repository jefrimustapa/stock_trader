"""
Unit & Boundary Value Analysis (BVA) Test Suite for Orders Audit Trail Enhancement (HOM-417/418)
Covers SDLC Step 4:
- AC 1: Order price indicator & side chips mapping
- AC 2: Action reason & thesis audit trail linking from deliberations and orders
- AC 3: FIFO Cost Price & Realized P&L matching on SELL orders (profit, loss, breakeven, multi-lot FIFO)
- AC 4: Server-side pagination boundaries (page=1, page=999, limit=0, limit=10, limit=50) & filter presets (all, active, closed)
- AC 5: Closed trades round-trip aggregation, symbol filter (exact, lowercase, prefixed), and result filter (win, loss)
- FastAPI endpoints /api/v1/agents/orders & /api/v1/agents/closed-trades via TestClient
"""

import math
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bridge.src.agent_pipeline import AgentPipeline
from fastapi.testclient import TestClient
from bridge.src.routes.agents import router
from bridge.src.security import authenticate_request
from fastapi import FastAPI

app = FastAPI()
app.include_router(router)
app.dependency_overrides[authenticate_request] = lambda: "test-user"


class TestOrdersAuditTrailBVA(unittest.TestCase):

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test_audit_trail.sqlite"
        self.pipeline = AgentPipeline(db_path=self.db_path)
        # Isolate from external network / broker calls
        self.pipeline.sync_broker_orders = lambda: {"synced": False}
        self.pipeline.reconcile_positions_with_orders = lambda: {"reconciled": False}

        # Seed realistic deliberation and order records
        with self.pipeline._get_connection() as conn:
            # Seed Deliberations
            conn.execute("""
                INSERT INTO agent_deliberations (
                    cycle_id, symbol, timestamp, stage_reached, final_decision,
                    tariq_analysis, nawwar_analysis, haziq_synthesis, danial_audit,
                    order_id, client_order_id
                ) VALUES 
                ('CYC_101', 'US.NVDA', '2026-11-27 10:00:00', 'L4_DISPATCH', 'APPROVED_FOR_EXECUTION',
                 '{"score": 88.0, "rsi": 54}', '{"sentiment_score": 75}', '{"passed": true, "composite_score": 88.5, "trading_mode": "DAY", "rationale": "Strong momentum breakout"}', '{"passed": true, "notes": "Approved 8 hard rules"}',
                 'ORD_NVDA_01', 'CLI_NVDA_01'),
                ('CYC_102', 'US.TSLA', '2026-11-27 10:15:00', 'L4_DISPATCH', 'APPROVED_FOR_EXECUTION',
                 '{"score": 82.0}', '{"sentiment_score": 60}', '{"passed": true, "composite_score": 83.0, "trading_mode": "DAY", "rationale": "Bull flag consolidation"}', '{"passed": true}',
                 'ORD_TSLA_01', 'CLI_TSLA_01')
            """)

            # Seed Orders:
            # 1. NVDA: Buy 20 @ 100.0, Buy 10 @ 110.0, Sell 25 @ 120.0 (FIFO: 20 @ 100 + 5 @ 110 => cost 102.0 => Gain!)
            # 2. TSLA: Buy 15 @ 200.0, Sell 15 @ 190.0 (Loss)
            # 3. AAPL: Sell 10 @ 150.0 without prior Buy (Initial Position fallback)
            # 4. AMD: Pending Buy 10 @ 80.0 (Active / Open order)
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES 
                ('CLI_NVDA_01', 'ORD_NVDA_01', 'CYC_101', 'US.NVDA', 'BUY', 20, 100.0, 95.0, 115.0, 'FILLED', 'SUBMITTED', 'OK', 'DAY', 'DAY', 'AGENT_PIPELINE', '2026-11-27 10:00:00'),
                ('CLI_NVDA_02', 'ORD_NVDA_02', 'CYC_101', 'US.NVDA', 'BUY', 10, 110.0, 105.0, 125.0, 'FILLED', 'SUBMITTED', 'OK', 'DAY', 'DAY', 'AGENT_PIPELINE', '2026-11-27 10:30:00'),
                ('CLI_NVDA_03', 'ORD_NVDA_03', 'EXIT_001', 'US.NVDA', 'SELL', 25, 120.0, 114.0, 130.0, 'FILLED', 'SUBMITTED', 'Position Exit [AGENT_EARLY_EXIT]: Sold 25 shares', 'DAY', 'DAY', 'AGENT_EARLY_EXIT', '2026-11-27 11:30:00'),
                ('CLI_TSLA_01', 'ORD_TSLA_01', 'CYC_102', 'US.TSLA', 'BUY', 15, 200.0, 190.0, 220.0, 'FILLED', 'SUBMITTED', 'OK', 'DAY', 'DAY', 'AGENT_PIPELINE', '2026-11-27 10:15:00'),
                ('CLI_TSLA_02', 'ORD_TSLA_02', 'EXIT_002', 'US.TSLA', 'SELL', 15, 190.0, 180.0, 210.0, 'FILLED', 'SUBMITTED', 'Position Exit [STOP_LOSS]: Stop Loss Hit', 'DAY', 'DAY', 'STOP_LOSS', '2026-11-27 12:00:00'),
                ('CLI_AAPL_01', 'ORD_AAPL_01', 'EXIT_003', 'US.AAPL', 'SELL', 10, 150.0, 142.5, 165.0, 'FILLED', 'SUBMITTED', 'Position Exit [MANUAL_LIQUIDATION]: Sold 10 shares', 'DAY', 'DAY', 'MANUAL_LIQUIDATION', '2026-11-27 13:00:00'),
                ('CLI_AMD_01', 'ORD_AMD_01', 'CYC_103', 'US.AMD', 'BUY', 10, 80.0, 76.0, 90.0, 'SUBMITTED', 'SUBMITTED', 'OK', 'DAY', 'DAY', 'AGENT_PIPELINE', '2026-11-27 14:00:00')
            """)
            conn.commit()

    def tearDown(self):
        if hasattr(self, "pipeline") and self.pipeline is not None:
            self.pipeline.close()
        self.tmp_dir.cleanup()

    # =========================================================================
    # 1. AC 3 & FIFO Matching Tests: Gain, Loss, Multi-lot, and Fallback
    # =========================================================================
    def test_fifo_gain_calculation_and_matching(self):
        """Test multi-lot FIFO cost basis on NVDA: 20@100 + 5@110 = 2550 / 25 = 102.0. Sell @ 120.0 => +$450.00 (+17.65%)."""
        orders = self.pipeline.get_paper_orders(limit=50, symbol="NVDA")
        sell_order = next((o for o in orders if o["order_side"] == "SELL" and o["symbol"] == "US.NVDA"), None)
        self.assertIsNotNone(sell_order)
        self.assertEqual(sell_order["cost_price"], 102.0)
        self.assertEqual(sell_order["realized_pnl_usd"], 450.0)
        self.assertEqual(sell_order["realized_pnl_pct"], 17.65)
        self.assertIn("ORD_NVDA_01", sell_order["buy_order_ref"])
        self.assertIn("ORD_NVDA_02", sell_order["buy_order_ref"])
        self.assertEqual(sell_order["hold_duration"], "1h 30m")

    def test_fifo_loss_calculation(self):
        """Test single-lot loss calculation on TSLA: Buy 15@200.0, Sell 15@190.0 => -$150.00 (-5.00%)."""
        orders = self.pipeline.get_paper_orders(limit=50, symbol="TSLA")
        sell_order = next((o for o in orders if o["order_side"] == "SELL" and o["symbol"] == "US.TSLA"), None)
        self.assertIsNotNone(sell_order)
        self.assertEqual(sell_order["cost_price"], 200.0)
        self.assertEqual(sell_order["realized_pnl_usd"], -150.0)
        self.assertEqual(sell_order["realized_pnl_pct"], -5.0)
        self.assertEqual(sell_order["buy_order_ref"], "ORD_TSLA_01")

    def test_unmatched_sell_order_fallback(self):
        """Test sell order without prior matching buy order (e.g. Initial Position liquidated)."""
        orders = self.pipeline.get_paper_orders(limit=50, symbol="AAPL")
        sell_order = next((o for o in orders if o["symbol"] == "US.AAPL"), None)
        self.assertIsNotNone(sell_order)
        self.assertIsNone(sell_order["cost_price"])
        self.assertEqual(sell_order["realized_pnl_usd"], 0.0)
        self.assertEqual(sell_order["buy_order_ref"], "N/A (Initial Position)")

    def test_cancelled_sell_orders_do_not_deplete_buy_queue_defect_sdlc8(self):
        """
        SDLC Step 8 Regression Test:
        Verify that CANCELLED or REJECTED sell orders do NOT deplete the buy FIFO queue.
        When multiple sell attempts are cancelled before a final FILLED sell order,
        both the cancelled attempts and the final FILLED order must correctly match the original buy order
        rather than showing Cost: N/A and Ref: N/A.
        """
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES 
                ('CLI_DSGR_B1', 'ORD_DSGR_B1', 'CYC_B', 'US.DSGR', 'BUY', 2, 35.01, 33.0, 40.0, 'FILLED', 'SUBMITTED', 'OK', 'DAY', 'DAY', 'AGENT_PIPELINE', '2026-11-20 10:00:00'),
                ('CLI_DSGR_S1', 'ORD_DSGR_S1', 'CYC_S1', 'US.DSGR', 'SELL', 2, 35.00, 33.0, 40.0, 'CANCELLED', 'SUBMITTED', 'Cancelled', 'DAY', 'DAY', 'AGENT_EARLY_EXIT', '2026-11-27 10:00:00'),
                ('CLI_DSGR_S2', 'ORD_DSGR_S2', 'CYC_S2', 'US.DSGR', 'SELL', 2, 35.00, 33.0, 40.0, 'CANCELLED', 'SUBMITTED', 'Cancelled', 'DAY', 'DAY', 'AGENT_EARLY_EXIT', '2026-11-27 10:01:00'),
                ('CLI_DSGR_S3', 'ORD_DSGR_S3', 'CYC_S3', 'US.DSGR', 'SELL', 2, 35.00, 33.0, 40.0, 'FILLED', 'SUBMITTED', 'Sold', 'DAY', 'DAY', 'AGENT_EARLY_EXIT', '2026-11-27 10:02:00')
            """)
            conn.commit()

        orders = self.pipeline.get_paper_orders(limit=10, symbol="DSGR")
        s1 = next(o for o in orders if o["order_id"] == "ORD_DSGR_S1")
        s2 = next(o for o in orders if o["order_id"] == "ORD_DSGR_S2")
        s3 = next(o for o in orders if o["order_id"] == "ORD_DSGR_S3")

        # Prior cancelled sells must reflect the buy order cost basis without depleting it
        self.assertEqual(s1["cost_price"], 35.01)
        self.assertIn("ORD_DSGR_B1", s1["buy_order_ref"])
        self.assertEqual(s2["cost_price"], 35.01)
        self.assertIn("ORD_DSGR_B1", s2["buy_order_ref"])

        # Final FILLED sell must NOT be N/A! It must successfully match the 2 shares @ 35.01
        self.assertIsNotNone(s3["cost_price"], "Filled sell order cost_price must not be None/N/A!")
        self.assertEqual(s3["cost_price"], 35.01)
        self.assertEqual(s3["realized_pnl_usd"], -0.02)
        self.assertEqual(s3["realized_pnl_pct"], -0.03)
        self.assertIn("ORD_DSGR_B1", s3["buy_order_ref"])

    # =========================================================================
    # 2. AC 2: Action Reason & Thesis Linking Tests
    # =========================================================================
    def test_thesis_linking_from_deliberations(self):
        """Verify that BUY orders link to Haziq synthesis composite score and rationale."""
        orders = self.pipeline.get_paper_orders(limit=50, symbol="NVDA")
        buy_order = next((o for o in orders if o["order_id"] == "ORD_NVDA_01"), None)
        self.assertIsNotNone(buy_order)
        self.assertIn("Haziq Synthesis (Score: 88.5, DAY)", buy_order["thesis"])
        self.assertIsNotNone(buy_order.get("thesis_detail"))
        self.assertEqual(buy_order["thesis_detail"]["haziq"]["composite_score"], 88.5)
        self.assertEqual(buy_order["thesis_detail"]["haziq"]["rationale"], "Strong momentum breakout")

    def test_thesis_linking_for_exit_reasons(self):
        """Verify human-readable exit reason mapping for early exits and stop losses."""
        orders = self.pipeline.get_paper_orders(limit=50)
        nvda_exit = next(o for o in orders if o["order_id"] == "ORD_NVDA_03")
        self.assertIn("Early Threat Exit by Haziq", nvda_exit["thesis"])

        tsla_exit = next(o for o in orders if o["order_id"] == "ORD_TSLA_02")
        self.assertIn("Stop Loss Hit", tsla_exit["thesis"])

        aapl_exit = next(o for o in orders if o["order_id"] == "ORD_AAPL_01")
        self.assertIn("Manual Liquidation", aapl_exit["thesis"])

    # =========================================================================
    # 3. AC 4: Server-Side Pagination Boundaries & Filters
    # =========================================================================
    def test_pagination_boundaries(self):
        """Test boundary limits: limit=0, limit=2, page=1, page=999."""
        # limit=0 returns empty list
        res_zero = self.pipeline.get_paper_orders(limit=0, return_meta=True)
        self.assertEqual(len(res_zero["orders"]), 0)
        self.assertEqual(res_zero["total"], 7)

        # page=1 with limit=2 returns first 2 orders
        res_p1 = self.pipeline.get_paper_orders(page=1, limit=2, return_meta=True)
        self.assertEqual(len(res_p1["orders"]), 2)
        self.assertEqual(res_p1["page"], 1)
        self.assertEqual(res_p1["total_pages"], 4)
        self.assertEqual(res_p1["total"], 7)

        # page=2 returns next 2 orders
        res_p2 = self.pipeline.get_paper_orders(page=2, limit=2, return_meta=True)
        self.assertEqual(len(res_p2["orders"]), 2)
        self.assertNotEqual(res_p1["orders"][0]["id"], res_p2["orders"][0]["id"])

        # page=999 returns empty orders list with correct total
        res_large = self.pipeline.get_paper_orders(page=999, limit=10, return_meta=True)
        self.assertEqual(len(res_large["orders"]), 0)
        self.assertEqual(res_large["total"], 7)
        self.assertEqual(res_large["page"], 999)

    def test_filter_presets_active_and_closed(self):
        """Test filter presets: all, active (open), closed (filled sells)."""
        # All
        res_all = self.pipeline.get_paper_orders(filter="all", return_meta=True)
        self.assertEqual(res_all["total"], 7)

        # Active / Open (AMD buy is SUBMITTED)
        res_active = self.pipeline.get_paper_orders(filter="active", return_meta=True)
        self.assertEqual(res_active["total"], 1)
        self.assertEqual(res_active["orders"][0]["symbol"], "US.AMD")

        # Closed (FILLED SELL orders: NVDA, TSLA, AAPL)
        res_closed = self.pipeline.get_paper_orders(filter="closed", return_meta=True)
        self.assertEqual(res_closed["total"], 3)
        for o in res_closed["orders"]:
            self.assertEqual(o["order_side"], "SELL")
            self.assertEqual(o["status"], "FILLED")

    # =========================================================================
    # 4. AC 5: Closed Trades History Aggregation & Filtering
    # =========================================================================
    def test_closed_trades_aggregation_and_results(self):
        """Test get_closed_trades aggregates round-trip trades with wins and losses."""
        res = self.pipeline.get_closed_trades(page=1, limit=10)
        self.assertEqual(res["total"], 3)
        trades = res["trades"]
        self.assertEqual(len(trades), 3)

        # Result filtering: wins only
        res_wins = self.pipeline.get_closed_trades(result="win")
        self.assertEqual(res_wins["total"], 1)
        self.assertEqual(res_wins["trades"][0]["symbol"], "US.NVDA")
        self.assertEqual(res_wins["trades"][0]["realized_pnl_usd"], 450.0)

        # Result filtering: losses only
        res_loss = self.pipeline.get_closed_trades(result="loss")
        self.assertEqual(res_loss["total"], 1)
        self.assertEqual(res_loss["trades"][0]["symbol"], "US.TSLA")
        self.assertEqual(res_loss["trades"][0]["realized_pnl_usd"], -150.0)

    def test_closed_trades_symbol_search(self):
        """Test symbol search variations: exact US.NVDA, bare nvda, lowercase."""
        # Exact
        t1 = self.pipeline.get_closed_trades(symbol="US.NVDA")
        self.assertEqual(t1["total"], 1)

        # Bare lowercase
        t2 = self.pipeline.get_closed_trades(symbol="nvda")
        self.assertEqual(t2["total"], 1)

        # Non-existent symbol
        t3 = self.pipeline.get_closed_trades(symbol="MSFT")
        self.assertEqual(t3["total"], 0)

    # =========================================================================
    # 5. FastAPI Endpoints via TestClient
    # =========================================================================
    def test_fastapi_orders_and_closed_trades_routes(self):
        """Verify /orders and /closed-trades endpoints return valid JSON structure."""
        # Inject our test pipeline into routes
        from bridge.src.routes import agents
        old_get_pipeline = agents.get_agent_pipeline
        agents.get_agent_pipeline = lambda: self.pipeline

        try:
            client = TestClient(app)
            headers = {"X-Service-Token": "DUMMY_TOKEN"}

            # GET /api/v1/agents/orders with pagination
            resp_orders = client.get("/api/v1/agents/orders?page=1&limit=2&filter=closed", headers=headers)
            self.assertEqual(resp_orders.status_code, 200)
            data_orders = resp_orders.json()
            self.assertEqual(data_orders["status"], "OK")
            self.assertEqual(data_orders["total"], 3)
            self.assertEqual(len(data_orders["orders"]), 2)
            self.assertEqual(data_orders["total_pages"], 2)

            # GET /api/v1/agents/closed-trades with result filter
            resp_ct = client.get("/api/v1/agents/closed-trades?page=1&limit=10&result=win", headers=headers)
            self.assertEqual(resp_ct.status_code, 200)
            data_ct = resp_ct.json()
            self.assertEqual(data_ct["status"], "OK")
            self.assertEqual(data_ct["total"], 1)
            self.assertEqual(data_ct["trades"][0]["symbol"], "US.NVDA")
        finally:
            agents.get_agent_pipeline = old_get_pipeline


if __name__ == "__main__":
    unittest.main()
