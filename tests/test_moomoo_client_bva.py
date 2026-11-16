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
        self.assertIsNone(info["cash_balance"])
        self.assertIsNone(info["total_equity"])

    def test_submit_order_when_disconnected_fails_closed_rejected(self):
        self.client.connect()
        res = self.client.submit_order({"client_order_id": "test-order-12345"})
        self.assertEqual(res["status"], "REJECTED")
        self.assertIsNone(res["order_id"])
        self.assertEqual(res["opend_status"], "DISCONNECTED")
        self.assertEqual(res["env"], "SIMULATE")
        self.assertIn("error", res)

    def test_switch_account_when_disconnected_fails_closed(self):
        self.client.connect()
        self.assertFalse(self.client.is_connected())
        success, msg = self.client.switch_account("123456")
        self.assertFalse(success)
        self.assertIn("not connected", msg)

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

    def test_defect_login_failure_fails_closed_no_silent_mock(self):
        """
        Pengendalian Kecacatan Terlepas (SDLC #8):
        Kod lama meluluskan sambungan secara senyap (connected=True, SIMULATED_ACC, $100,000)
        apabila OpenD socket terbuka tetapi login belum berlaku atau gagal.
        Ujian ini membuktikan kod lama GAGAL kerana ia menghasilkan CONNECTED dan SIMULATED_ACC.
        """
        from unittest.mock import patch, MagicMock

        # Simulasikan soket berjaya berhubung (OpenD port hidup)
        with patch("socket.create_connection") as mock_sock:
            mock_sock.return_value.__enter__.return_value = MagicMock()

            # Simulasikan OpenSecTradeContext gagal log masuk (seperti ralat OpenD sebenar: Login failed, Account credentials incomplete)
            with patch("bridge.src.moomoo_client.OpenSecTradeContext") as mock_ctx_cls:
                mock_ctx_cls.side_effect = Exception("Login failed, Account credentials incomplete")

                test_client = MoomooClient(host="127.0.0.1", port=11111, trd_env="SIMULATE")
                res = test_client.connect()

                # Pada kod baharu yang fail-closed: sambungan mesti gagal kerana tiada sesi OpenD sah
                self.assertFalse(res, "connect() mesti pulang False apabila OpenD tidak/belum login")
                self.assertFalse(test_client.is_connected(), "is_connected() mesti False")
                self.assertNotEqual(test_client.get_connection_status(), "CONNECTED")
                self.assertIn(test_client.get_connection_status(), ["WAIT_LOGIN", "DISCONNECTED"])

                info = test_client.get_account_info()
                self.assertEqual(info["account_id"], "N/A", "Account ID mesti N/A, bukan SIMULATED_ACC")
                self.assertIsNone(info["cash_balance"], "Baki tunai mesti null/None, bukan 100000.0")
                self.assertIsNone(info["total_equity"], "Baki ekuiti mesti null/None, bukan 100000.0")




if __name__ == "__main__":
    unittest.main()
