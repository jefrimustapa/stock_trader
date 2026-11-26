"""
Unit & Boundary Value Analysis (BVA) for Portfolio and Transaction Reconciliation (GitHub Issue #17 / HOM-356)
Verifies:
1. Position with matching agent order (AGENT_PIPELINE)
2. Broker order without local order -> sync_broker_orders imports as BROKER_IMPORT
3. Position without broker order or local order -> reconcile_positions_with_orders generates POSITION_RECONCILED
4. Zero positions / empty broker response
5. Positions with qty <= 0 (closed/empty positions ignored)
6. Idempotency: Repeated reconciliation runs do not create duplicate audit records
7. Orders retrieval includes source column in get_paper_orders and get_recent_activity
"""

import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Ensure pydantic mock is available if running on lightweight test runner without pydantic
try:
    import pydantic
except ImportError:
    mock_pydantic = MagicMock()
    mock_pydantic.BaseModel = object
    mock_pydantic.Field = lambda *args, **kwargs: None
    sys.modules["pydantic"] = mock_pydantic

from bridge.src.agent_pipeline import AgentPipeline
from bridge.src.config import BridgeConfig


class TestPortfolioReconciliationBVA(unittest.TestCase):

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test_pipeline.sqlite"
        self.orig_equity_db = BridgeConfig.EQUITY_BASELINE_DB
        BridgeConfig.EQUITY_BASELINE_DB = Path(self.tmp_dir.name) / "test_baseline.sqlite"
        self.mock_client = MagicMock()
        self.mock_client.is_connected.return_value = True
        self.mock_client.query_orders.return_value = []
        self.mock_client.query_positions.return_value = []
        self.pipeline = AgentPipeline(db_path=self.db_path, moomoo_client=self.mock_client)

    def tearDown(self):
        BridgeConfig.EQUITY_BASELINE_DB = self.orig_equity_db
        self.tmp_dir.cleanup()
        self.tmp_dir.cleanup()

    @patch("bridge.src.agent_pipeline.get_moomoo_client")
    def test_bva1_position_with_agent_pipeline_order(self, mock_get_client):
        """BVA 1: Position matches existing agent pipeline order."""
        mock_get_client.return_value = self.mock_client
        self.mock_client.query_positions.return_value = [
            {"position_id": "P101", "code": "US.AAPL", "qty": 10, "cost_price": 150.0}
        ]

        # Insert pre-existing AGENT_PIPELINE order
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "ORD-AAPL-1", "B-101", "CYCLE-01", "US.AAPL", "BUY",
                10, 150.0, 142.5, 172.5, "FILLED", "CONNECTED",
                "Agent pipeline order", "DAY", "DAY", "AGENT_PIPELINE",
                datetime.now(timezone.utc).isoformat()
            ))
            conn.commit()

        res = self.pipeline.reconcile_positions_with_orders()
        self.assertTrue(res["synced"])
        self.assertEqual(res["reconciled_count"], 0)

        orders = self.pipeline.get_paper_orders()
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["source"], "AGENT_PIPELINE")

    @patch("bridge.src.agent_pipeline.get_moomoo_client")
    def test_bva2_broker_order_import(self, mock_get_client):
        """BVA 2: Broker order exists in OpenD but not in local SQLite DB -> imports as BROKER_IMPORT."""
        mock_get_client.return_value = self.mock_client
        self.mock_client.query_orders.return_value = [
            {
                "order_id": "EXT-999",
                "code": "US.MSFT",
                "trd_side": "BUY",
                "order_status": "FILLED_ALL",
                "qty": 25,
                "price": 310.0,
                "create_time": "2026-11-22T10:00:00Z"
            }
        ]

        res = self.pipeline.sync_broker_orders()
        self.assertTrue(res["synced"])
        self.assertEqual(res["imported_count"], 1)

        orders = self.pipeline.get_paper_orders()
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["order_id"], "EXT-999")
        self.assertEqual(orders[0]["symbol"], "US.MSFT")
        self.assertEqual(orders[0]["source"], "BROKER_IMPORT")
        self.assertEqual(orders[0]["status"], "FILLED")

    @patch("bridge.src.agent_pipeline.get_moomoo_client")
    def test_bva3_position_reconciliation_unrecorded_counter(self, mock_get_client):
        """BVA 3: Position exists in OpenD without any local order -> auto-creates POSITION_RECONCILED."""
        mock_get_client.return_value = self.mock_client
        self.mock_client.query_positions.return_value = [
            {"position_id": "POS-NVDA-1", "code": "US.NVDA", "qty": 15, "cost_price": 450.0}
        ]

        res = self.pipeline.reconcile_positions_with_orders()
        self.assertTrue(res["synced"])
        self.assertEqual(res["reconciled_count"], 1)

        orders = self.pipeline.get_paper_orders()
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["symbol"], "US.NVDA")
        self.assertEqual(orders[0]["source"], "POSITION_RECONCILED")
        self.assertEqual(orders[0]["status"], "FILLED")
        self.assertEqual(orders[0]["quantity"], 15)
        self.assertEqual(orders[0]["entry_price"], 450.0)

    @patch("bridge.src.agent_pipeline.get_moomoo_client")
    def test_bva4_zero_positions_empty_portfolio(self, mock_get_client):
        """BVA 4: OpenD returns empty list of positions."""
        mock_get_client.return_value = self.mock_client
        self.mock_client.query_positions.return_value = []

        res = self.pipeline.reconcile_positions_with_orders()
        self.assertTrue(res["synced"])
        self.assertEqual(res["reconciled_count"], 0)

        orders = self.pipeline.get_paper_orders()
        self.assertEqual(len(orders), 0)

    @patch("bridge.src.agent_pipeline.get_moomoo_client")
    def test_bva5_closed_or_zero_qty_position(self, mock_get_client):
        """BVA 5: Closed position with qty = 0 is ignored during reconciliation."""
        mock_get_client.return_value = self.mock_client
        self.mock_client.query_positions.return_value = [
            {"position_id": "POS-ZERO", "code": "US.TSLA", "qty": 0, "cost_price": 200.0}
        ]

        res = self.pipeline.reconcile_positions_with_orders()
        self.assertTrue(res["synced"])
        self.assertEqual(res["reconciled_count"], 0)

        orders = self.pipeline.get_paper_orders()
        self.assertEqual(len(orders), 0)

    @patch("bridge.src.agent_pipeline.get_moomoo_client")
    def test_bva6_negative_qty_short_position_reconciled(self, mock_get_client):
        """BVA 6: Negative qty indicates active SHORT position and is reconciled with order_side=SELL."""
        mock_get_client.return_value = self.mock_client
        self.mock_client.query_positions.return_value = [
            {"position_id": "POS-NEG", "code": "US.AMZN", "qty": -5, "cost_price": 130.0}
        ]

        res = self.pipeline.reconcile_positions_with_orders()
        self.assertTrue(res["synced"])
        self.assertEqual(res["reconciled_count"], 1)

        orders = self.pipeline.get_paper_orders()
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["symbol"], "US.AMZN")
        self.assertEqual(orders[0]["order_side"], "SELL")
        self.assertEqual(orders[0]["quantity"], 5)
        self.assertEqual(orders[0]["entry_price"], 130.0)
        self.assertEqual(orders[0]["source"], "POSITION_RECONCILED")

    @patch("bridge.src.agent_pipeline.get_moomoo_client")
    def test_bva6_idempotency_no_duplicate_reconciliation(self, mock_get_client):
        """BVA 6: Repeated calls to reconcile_positions_with_orders are idempotent."""
        mock_get_client.return_value = self.mock_client
        self.mock_client.query_positions.return_value = [
            {"position_id": "POS-SPY-1", "code": "US.SPY", "qty": 50, "cost_price": 500.0}
        ]

        # First pass
        res1 = self.pipeline.reconcile_positions_with_orders()
        self.assertEqual(res1["reconciled_count"], 1)

        # Second pass
        res2 = self.pipeline.reconcile_positions_with_orders()
        self.assertEqual(res2["reconciled_count"], 0)

        orders = self.pipeline.get_paper_orders()
        self.assertEqual(len(orders), 1)

    @patch("bridge.src.agent_pipeline.get_moomoo_client")
    def test_bva7_activity_includes_source_attribution(self, mock_get_client):
        """BVA 7: get_recent_activity returns orders with source attribution field."""
        mock_get_client.return_value = self.mock_client
        self.mock_client.query_orders.return_value = []
        self.mock_client.query_positions.return_value = [
            {"position_id": "POS-QQQ-1", "code": "US.QQQ", "qty": 30, "cost_price": 400.0}
        ]

        activity = self.pipeline.get_recent_activity()
        self.assertEqual(activity["status"], "OK")
        self.assertGreaterEqual(len(activity["orders"]), 1)
        self.assertEqual(activity["orders"][0]["symbol"], "US.QQQ")
        self.assertEqual(activity["orders"][0]["source"], "POSITION_RECONCILED")


if __name__ == "__main__":
    unittest.main()
