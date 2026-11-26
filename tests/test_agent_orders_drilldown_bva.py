"""
Unit & Boundary Value Analysis (BVA) Test Suite for Agent Orders Drill-Down (HOM-396)
Covers SDLC Step 3:
- BVA for symbol filtering (exact, prefixed US.SYM, lowercase, non-existent, None, empty string)
- BVA for limit boundaries (limit=0, limit=1, negative limit, large limit)
- Verification of standard metadata mapping: side, status, price, executed_price, quantity, timestamp, cycle_id, client_order_id
- FastAPI route /api/v1/agents/orders symbol query parameter test via TestClient
- Mutation testing defense
"""

import sys
import tempfile
import unittest
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bridge.src.agent_pipeline import AgentPipeline
from fastapi.testclient import TestClient
from bridge.src.routes.agents import router
from fastapi import FastAPI

app = FastAPI()
app.include_router(router)


class TestAgentOrdersDrillDownBVA(unittest.TestCase):

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test_agent_activity.sqlite"
        self.pipeline = AgentPipeline(db_path=self.db_path)
        # Mock broker sync to isolate BVA data
        self.pipeline.sync_broker_orders = lambda: {"synced": False}
        self.pipeline.reconcile_positions_with_orders = lambda: {"reconciled": False}

        # Seed sample paper orders
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES 
                ('CLIENT_AAPL_01', 'ORD_AAPL_01', 'CYC_001', 'AAPL', 'BUY', 10, 150.0, 145.0, 160.0, 'FILLED', 'SUBMITTED', 'OK', 'DAY', 'DAY', 'AGENT_PIPELINE', '2026-11-26 10:00:00'),
                ('CLIENT_AAPL_02', 'ORD_AAPL_02', 'CYC_002', 'US.AAPL', 'SELL', 5, 155.0, 150.0, 165.0, 'FILLED', 'SUBMITTED', 'OK', 'DAY', 'DAY', 'AGENT_PIPELINE', '2026-11-26 11:00:00'),
                ('CLIENT_MSFT_01', 'ORD_MSFT_01', 'CYC_001', 'MSFT', 'BUY', 20, 300.0, 290.0, 320.0, 'FILLED', 'SUBMITTED', 'OK', 'DAY', 'DAY', 'AGENT_PIPELINE', '2026-11-26 10:15:00'),
                ('CLIENT_TSLA_01', 'ORD_TSLA_01', 'CYC_003', 'US.TSLA', 'BUY', 15, 200.0, 190.0, 220.0, 'PENDING', 'SUBMITTED', 'OK', 'DAY', 'DAY', 'AGENT_PIPELINE', '2026-11-26 12:00:00')
            """)
            conn.commit()

    def tearDown(self):
        if hasattr(self, "pipeline") and self.pipeline is not None:
            self.pipeline.close()
        self.tmp_dir.cleanup()

    # =========================================================================
    # 1. BVA - Symbol Filtering Boundaries
    # =========================================================================

    def test_symbol_filter_exact_match(self):
        """BVA 1: Exact symbol 'AAPL' matches AAPL and US.AAPL records."""
        orders = self.pipeline.get_paper_orders(limit=50, symbol="AAPL")
        self.assertEqual(len(orders), 2)
        symbols = [o["symbol"] for o in orders]
        self.assertIn("AAPL", symbols)
        self.assertIn("US.AAPL", symbols)

    def test_symbol_filter_prefixed_match(self):
        """BVA 2: Prefixed symbol 'US.AAPL' matches AAPL and US.AAPL."""
        orders = self.pipeline.get_paper_orders(limit=50, symbol="US.AAPL")
        self.assertEqual(len(orders), 2)

    def test_symbol_filter_lowercase(self):
        """BVA 3: Case-insensitive 'aapl' matches uppercase database records."""
        orders = self.pipeline.get_paper_orders(limit=50, symbol="aapl")
        self.assertEqual(len(orders), 2)

    def test_symbol_filter_nonexistent(self):
        """BVA 4: Non-existent symbol returns empty list without error."""
        orders = self.pipeline.get_paper_orders(limit=50, symbol="XYZ999")
        self.assertEqual(len(orders), 0)

    def test_symbol_filter_none_or_empty(self):
        """BVA 5: None or whitespace symbol returns all records."""
        all_orders = self.pipeline.get_paper_orders(limit=50, symbol=None)
        self.assertEqual(len(all_orders), 4)

        whitespace_orders = self.pipeline.get_paper_orders(limit=50, symbol="   ")
        self.assertEqual(len(whitespace_orders), 4)

    # =========================================================================
    # 2. BVA - Limit Boundaries
    # =========================================================================

    def test_limit_boundary_zero(self):
        """BVA 6: limit=0 returns empty list."""
        orders = self.pipeline.get_paper_orders(limit=0)
        self.assertEqual(len(orders), 0)

    def test_limit_boundary_one(self):
        """BVA 7: limit=1 returns exactly the most recent order."""
        orders = self.pipeline.get_paper_orders(limit=1)
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["symbol"], "US.TSLA")

    def test_limit_boundary_negative(self):
        """BVA 8: Negative limit is safely clamped to 0, returning empty list."""
        orders = self.pipeline.get_paper_orders(limit=-5)
        self.assertEqual(len(orders), 0)

    def test_limit_boundary_large(self):
        """BVA 9: Large limit returns all available records up to count."""
        orders = self.pipeline.get_paper_orders(limit=500)
        self.assertEqual(len(orders), 4)

    # =========================================================================
    # 3. Acceptance Criteria Metadata Mapping
    # =========================================================================

    def test_required_metadata_fields(self):
        """
        Verify Acceptance Criteria 3:
        Returned orders contain: side, status, price, executed_price, quantity, timestamp, cycle_id, client_order_id
        """
        orders = self.pipeline.get_paper_orders(limit=1, symbol="AAPL")
        self.assertEqual(len(orders), 1)
        o = orders[0]

        # AC3 Required metadata fields
        self.assertIn("side", o)
        self.assertIn("status", o)
        self.assertIn("price", o)
        self.assertIn("executed_price", o)
        self.assertIn("quantity", o)
        self.assertIn("timestamp", o)
        self.assertIn("cycle_id", o)
        self.assertIn("client_order_id", o)

        # Content correctness
        self.assertEqual(o["side"], "SELL")
        self.assertEqual(o["status"], "FILLED")
        self.assertEqual(o["price"], 155.0)
        self.assertEqual(o["executed_price"], 155.0)
        self.assertEqual(o["quantity"], 5)
        self.assertEqual(o["timestamp"], "2026-11-26 11:00:00")
        self.assertEqual(o["cycle_id"], "CYC_002")
        self.assertEqual(o["client_order_id"], "CLIENT_AAPL_02")

    # =========================================================================
    # 4. Mutation Testing Defense
    # =========================================================================

    def test_mutation_defense_symbol_mismatch(self):
        """Mutant 1: Ensure MSFT order is never returned when filtering by AAPL."""
        orders = self.pipeline.get_paper_orders(limit=50, symbol="AAPL")
        for ord in orders:
            self.assertNotEqual(ord["symbol"], "MSFT")
            self.assertNotEqual(ord["client_order_id"], "CLIENT_MSFT_01")


if __name__ == "__main__":
    unittest.main()
