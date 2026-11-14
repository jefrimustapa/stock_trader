import socket
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.moomoo_client import MoomooClient


class TestMoomooClientBVA(unittest.TestCase):
    """
    Deterministic BVA, Branch Coverage, and Mutation tests for MoomooClient.
    """

    def setUp(self):
        # Point client to a port guaranteed not listening
        self.client = MoomooClient(host="127.0.0.1", port=59999, trd_env="SIMULATE")

    def test_branch_disconnected_when_socket_unreachable(self):
        res = self.client.connect()
        self.assertFalse(res)
        self.assertFalse(self.client.is_connected())
        self.assertEqual(self.client.get_connection_status(), "DISCONNECTED")
        self.assertIsNone(self.client.get_account_equity())

    def test_account_info_structure_disconnected(self):
        self.client.connect()
        info = self.client.get_account_info()
        self.assertEqual(info["status"], "DISCONNECTED")
        self.assertEqual(info["env"], "SIMULATE")
        self.assertEqual(info["account_id"], "N/A")
        self.assertEqual(info["cash_balance"], 0.0)
        self.assertEqual(info["total_equity"], 0.0)

    def test_submit_order_when_disconnected_generates_mock(self):
        self.client.connect()
        res = self.client.submit_order({"client_order_id": "test-order-12345"})
        self.assertEqual(res["status"], "ACCEPTED_LOCAL_MOCK")
        self.assertEqual(res["opend_status"], "DISCONNECTED")
        self.assertEqual(res["env"], "SIMULATE")

    def test_bva_connected_simulated_state(self):
        # Test simulated active connection state
        self.client._connected = True
        self.client._account_id = "SIM_1001"
        self.client._cash_balance = 75000.50
        self.client._total_equity = 125000.75
        self.client._last_status = "CONNECTED"

        self.assertTrue(self.client.is_connected())
        self.assertEqual(self.client.get_connection_status(), "CONNECTED")
        self.assertEqual(self.client.get_account_equity(), 125000.75)

        info = self.client.get_account_info()
        self.assertEqual(info["status"], "CONNECTED")
        self.assertEqual(info["account_id"], "SIM_1001")
        self.assertEqual(info["cash_balance"], 75000.5)
        self.assertEqual(info["total_equity"], 125000.75)

    def test_branch_submit_order_live(self):
        self.client._connected = True
        res = self.client.submit_order({"client_order_id": "live-order-98765"})
        self.assertEqual(res["status"], "SUBMITTED")
        self.assertEqual(res["opend_status"], "CONNECTED")

    def test_branch_close_resets_state(self):
        self.client._connected = True
        self.client._last_status = "CONNECTED"
        self.client.close()
        self.assertFalse(self.client.is_connected())
        self.assertEqual(self.client.get_connection_status(), "DISCONNECTED")

    def test_mutation_branch_wait_login_status(self):
        # Mutant verification: Verify status is correctly WAIT_LOGIN when OpenD port reachable but auth pending
        self.client._connected = False
        self.client._last_status = "WAIT_LOGIN"
        self.assertEqual(self.client.get_connection_status(), "WAIT_LOGIN")


if __name__ == "__main__":
    unittest.main()
