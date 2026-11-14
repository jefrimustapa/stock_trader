import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.reconciliation import PositionReconciler


class TestPositionReconciliation(unittest.TestCase):
    """
    Tests 60s position reconciliation engine and 5s heartbeat pulse.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.status_file = Path(self.temp_dir) / "sentinel_status.json"
        self.reconciler = PositionReconciler(self.status_file)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_emit_heartbeat(self):
        self.reconciler.emit_heartbeat("HEALTHY")
        self.assertTrue(self.status_file.exists())
        with open(self.status_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["status"], "HEALTHY")
        self.assertIn("timestamp", data)
        self.assertEqual(data["managed_positions"], 0)

    def test_reconcile_protected_position(self):
        broker_positions = [{"symbol": "US.NVDA", "quantity": 100, "entry_price": 140.0}]
        broker_orders = [{"symbol": "US.NVDA", "order_type": "STOP_LOSS", "status": "SUBMITTED"}]

        corrections = self.reconciler.reconcile_positions(broker_positions, broker_orders)
        self.assertEqual(len(corrections), 0, "Protected position should have 0 corrections")

    def test_reconcile_unprotected_position_injects_hard_stop_loss(self):
        broker_positions = [
            {"symbol": "US.NVDA", "quantity": 100, "entry_price": 140.0},
            {"symbol": "US.TSLA", "quantity": 50, "entry_price": 200.0}
        ]
        # Only TSLA has a stop loss order; NVDA is unprotected
        broker_orders = [{"symbol": "US.TSLA", "order_type": "STOP_LOSS", "status": "SUBMITTED"}]

        corrections = self.reconciler.reconcile_positions(broker_positions, broker_orders)
        self.assertEqual(len(corrections), 1)
        self.assertEqual(corrections[0]["action"], "INJECT_STOP_LOSS")
        self.assertEqual(corrections[0]["symbol"], "US.NVDA")
        self.assertEqual(corrections[0]["quantity"], 100)
        self.assertEqual(corrections[0]["stop_price"], 133.0)  # 140 * 0.95 = 133.00


if __name__ == "__main__":
    unittest.main()
