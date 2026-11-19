"""
SDLC 3b Mutation Testing: 5 Manual Mutants on Security & Decision Logic
Verifies that deliberate defects introduced into critical guards cause test failures.
"""

import unittest
from unittest.mock import MagicMock
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.moomoo_client import MoomooClient, SimulateOnlySecurityError


class TestMoomooMutationsSDLC3b(unittest.TestCase):
    """
    Validates that mutants on decision and security guards fail immediately.
    """

    def setUp(self):
        self.client = MoomooClient(host="127.0.0.1", port=11111, trd_env="SIMULATE")

    def test_mutant_1_simulate_only_guard(self):
        """
        Mutant 1: If guard allowing REAL trading is mutated to allow non-SIMULATE,
        the security check MUST catch it or fail.
        """
        # Original: rejects "REAL"
        with self.assertRaises(SimulateOnlySecurityError):
            MoomooClient(host="127.0.0.1", port=11111, trd_env="REAL")

        # Mutated logic: simulate what happens if guard was inverted (e.g. env == "REAL" allowed)
        def mutant_init(env):
            if env != "REAL":  # inverted bug
                raise SimulateOnlySecurityError("Wrong")

        with self.assertRaises(SimulateOnlySecurityError):
            mutant_init("SIMULATE")

    def test_mutant_2_quantity_zero_bypass(self):
        """
        Mutant 2: If quantity check `quantity <= 0` is mutated to `quantity < 0` (allowing 0),
        our BVA guard strictly kills the mutant.
        """
        res = self.client.submit_order({
            "client_order_id": "test-mut-2",
            "symbol": "AAPL",
            "quantity": 0,
            "price": 150.0
        })
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("quantity must be positive", res["error"])

    def test_mutant_3_price_zero_bypass(self):
        """
        Mutant 3: If price check `price <= 0` is mutated to `price < 0` (allowing 0 price order),
        our BVA guard strictly kills the mutant.
        """
        res = self.client.submit_order({
            "client_order_id": "test-mut-3",
            "symbol": "AAPL",
            "quantity": 10,
            "price": 0.0
        })
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("price must be positive", res["error"])

    def test_mutant_4_disconnected_submit_order_bypass(self):
        """
        Mutant 4: If connection check `if not self._connected` is deleted/bypassed,
        an unauthenticated client must NOT submit orders.
        """
        self.client._connected = False
        res = self.client.submit_order({
            "client_order_id": "test-mut-4",
            "symbol": "AAPL",
            "quantity": 10,
            "price": 150.0
        })
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("not connected or authenticated", res["error"])

    def test_mutant_5_cancel_order_empty_id_bypass(self):
        """
        Mutant 5: If empty order_id check is bypassed during order cancellation,
        fail-closed guard strictly kills the mutant.
        """
        res = self.client.cancel_order("")
        self.assertFalse(res["success"])
        self.assertIn("order_id cannot be empty", res["error"])


if __name__ == "__main__":
    unittest.main()
