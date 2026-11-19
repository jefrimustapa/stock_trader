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
        from unittest.mock import MagicMock
        import pandas as pd
        self.client._connected = True
        self.client._account_id = "1001"
        mock_ctx = MagicMock()
        mock_ctx.place_order.return_value = (0, pd.DataFrame([{"order_id": "ORD-live-98765"}]))
        self.client._trade_ctx = mock_ctx

        res = self.client.submit_order({
            "client_order_id": "live-order-98765",
            "symbol": "US.NVDA",
            "quantity": 10,
            "entry_price": 140.0
        })
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
                self.assertIn(test_client.get_connection_status(), ["WAIT_LOGIN", "DISCONNECTED", "CONNECT_ERROR"])

                info = test_client.get_account_info()
                self.assertEqual(info["account_id"], "N/A", "Account ID mesti N/A, bukan SIMULATED_ACC")
                self.assertIsNone(info["cash_balance"], "Baki tunai mesti null/None, bukan 100000.0")
                self.assertIsNone(info["total_equity"], "Baki ekuiti mesti null/None, bukan 100000.0")

    def test_kline_quota_disconnected_fails_closed(self):
        """BVA: When OpenD is unreachable, get_kline_quota returns UNAVAILABLE without fake quotas."""
        res = self.client.get_kline_quota()
        self.assertEqual(res["status"], "UNAVAILABLE")
        self.assertFalse(res["connected"])
        self.assertIsNone(res["used_quota"])
        self.assertIsNone(res["remain_quota"])
        self.assertEqual(res["detail_list"], [])

    def test_kline_quota_success_returns_real_quota(self):
        """BVA: When OpenQuoteContext returns (used, remain, details), properly formatted."""
        from unittest.mock import patch, MagicMock
        mock_moomoo = MagicMock()
        mock_moomoo.RET_OK = 0
        with patch.dict("sys.modules", {"moomoo": mock_moomoo}):
            with patch.object(self.client, "get_connection_status", return_value="CONNECTED"):
                with patch("socket.create_connection"):
                    mock_ctx = MagicMock()
                    mock_ctx.get_history_kl_quota.return_value = (0, (0, 100, []))
                    mock_moomoo.OpenQuoteContext.return_value = mock_ctx

                    res = self.client.get_kline_quota()
                    self.assertEqual(res["status"], "HEALTHY")
                    self.assertTrue(res["connected"])
                    self.assertEqual(res["used_quota"], 0)
                    self.assertEqual(res["remain_quota"], 100)
                    self.assertEqual(res["total_quota"], 100)
                    self.assertEqual(res["detail_list"], [])

    def test_kline_quota_success_with_detail_list(self):
        """BVA: When OpenQuoteContext returns detail items, properly normalized with code, symbol, request_time."""
        from unittest.mock import patch, MagicMock
        mock_moomoo = MagicMock()
        mock_moomoo.RET_OK = 0
        with patch.dict("sys.modules", {"moomoo": mock_moomoo}):
            with patch.object(self.client, "get_connection_status", return_value="CONNECTED"):
                with patch("socket.create_connection"):
                    mock_ctx = MagicMock()
                    sample_details = [
                        {"code": "MY.1155", "name": "MAYBANK", "request_time": "2026-11-15 10:00:00"},
                        {"code": "US.AAPL", "name": "APPLE", "request_time": "2026-11-14 09:30:00"},
                    ]
                    mock_ctx.get_history_kl_quota.return_value = (0, (2, 98, sample_details))
                    mock_moomoo.OpenQuoteContext.return_value = mock_ctx

                    res = self.client.get_kline_quota()
                    self.assertEqual(res["status"], "HEALTHY")
                    self.assertTrue(res["connected"])
                    self.assertEqual(res["used_quota"], 2)
                    self.assertEqual(res["remain_quota"], 98)
                    self.assertEqual(res["total_quota"], 100)
                    self.assertEqual(len(res["detail_list"]), 2)
                    self.assertEqual(res["detail_list"][0]["symbol"], "MY.1155")
                    self.assertEqual(res["detail_list"][0]["code"], "MY.1155")
                    self.assertEqual(res["detail_list"][0]["name"], "MAYBANK")
                    self.assertEqual(res["detail_list"][0]["request_time"], "2026-11-15 10:00:00")





    def test_simulate_only_guard_rejects_real_env_initialization(self):
        """Hard Rule: Any initialization with trd_env != 'SIMULATE' raises SimulateOnlySecurityError."""
        from bridge.src.moomoo_client import SimulateOnlySecurityError
        with self.assertRaises(SimulateOnlySecurityError):
            MoomooClient(host="127.0.0.1", port=11111, trd_env="REAL")

        with self.assertRaises(SimulateOnlySecurityError):
            MoomooClient(host="127.0.0.1", port=11111, trd_env="LIVE")

    def test_switch_account_rejects_real_environment(self):
        """Hard Rule: Switching to an account with trd_env == 'REAL' is strictly prohibited."""
        self.client._connected = True
        self.client._available_accounts = [
            {"account_id": "1001", "trd_env": "SIMULATE"},
            {"account_id": "9999", "trd_env": "REAL"}
        ]
        ok, msg = self.client.switch_account("9999")
        self.assertFalse(ok)
        self.assertIn("REAL trading account is strictly prohibited", msg)

    def test_submit_order_bva_validations(self):
        """BVA: Boundary tests for order submission inputs."""
        # 1. Empty client_order_id
        res = self.client.submit_order({"client_order_id": "", "symbol": "NVDA", "quantity": 10, "price": 100.0})
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("client_order_id", res["error"])

        # 2. Empty symbol
        res = self.client.submit_order({"client_order_id": "ord-1", "symbol": "", "quantity": 10, "price": 100.0})
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("symbol", res["error"])

        # 3. Quantity zero or negative
        res = self.client.submit_order({"client_order_id": "ord-1", "symbol": "NVDA", "quantity": 0, "price": 100.0})
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("quantity must be positive", res["error"])

        res = self.client.submit_order({"client_order_id": "ord-1", "symbol": "NVDA", "quantity": -5, "price": 100.0})
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("quantity must be positive", res["error"])

        # 4. Price zero or negative
        res = self.client.submit_order({"client_order_id": "ord-1", "symbol": "NVDA", "quantity": 10, "price": 0.0})
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("price must be positive", res["error"])

        res = self.client.submit_order({"client_order_id": "ord-1", "symbol": "NVDA", "quantity": 10, "price": -10.0})
        self.assertEqual(res["status"], "REJECTED")
        self.assertIn("price must be positive", res["error"])

    def test_submit_order_connected_success(self):
        """Connected client submits order with TrdEnv.SIMULATE to OpenSecTradeContext."""
        from unittest.mock import MagicMock
        import pandas as pd

        self.client._connected = True
        self.client._account_id = "12345"

        mock_ctx = MagicMock()
        mock_df = pd.DataFrame([{"order_id": "BROKER-ORD-9988"}])
        mock_ctx.place_order.return_value = (0, mock_df)
        self.client._trade_ctx = mock_ctx

        res = self.client.submit_order({
            "client_order_id": "test-uuid-1",
            "symbol": "AAPL",
            "quantity": 15,
            "entry_price": 220.50,
            "order_side": "BUY"
        })
        self.assertEqual(res["status"], "SUBMITTED")
        self.assertEqual(res["order_id"], "BROKER-ORD-9988")
        self.assertEqual(res["env"], "SIMULATE")
        self.assertEqual(res["symbol"], "US.AAPL")
        self.assertEqual(res["quantity"], 15)
        self.assertEqual(res["price"], 220.50)

        # Verify place_order parameters passed to SDK
        mock_ctx.place_order.assert_called_once()
        _, kwargs = mock_ctx.place_order.call_args
        self.assertEqual(kwargs["qty"], 15)
        self.assertEqual(kwargs["price"], 220.50)
        self.assertEqual(kwargs["code"], "US.AAPL")

    def test_submit_order_broker_error_fails_closed(self):
        """When OpenD returns RET_ERROR, submit_order returns REJECTED."""
        from unittest.mock import MagicMock

        self.client._connected = True
        self.client._account_id = "12345"
        mock_ctx = MagicMock()
        mock_ctx.place_order.return_value = (-1, "Insufficient buying power in paper trading account")
        self.client._trade_ctx = mock_ctx

        res = self.client.submit_order({
            "client_order_id": "test-uuid-2",
            "symbol": "TSLA",
            "quantity": 50,
            "entry_price": 310.00,
            "order_side": "BUY"
        })
        self.assertEqual(res["status"], "REJECTED")
        self.assertIsNone(res["order_id"])
        self.assertIn("Insufficient buying power", res["error"])

    def test_cancel_order_bva_and_execution(self):
        """BVA and execution tests for broker order cancellation."""
        from unittest.mock import MagicMock
        import pandas as pd

        # 1. Empty order_id
        res = self.client.cancel_order("")
        self.assertFalse(res["success"])
        self.assertIn("order_id cannot be empty", res["error"])

        # 2. Disconnected
        res = self.client.cancel_order("ORD-123")
        self.assertFalse(res["success"])
        self.assertIn("not connected", res["error"])

        # 3. Connected success
        self.client._connected = True
        self.client._account_id = "12345"
        mock_ctx = MagicMock()
        mock_ctx.modify_order.return_value = (0, pd.DataFrame([{"order_id": "ORD-123"}]))
        self.client._trade_ctx = mock_ctx

        res = self.client.cancel_order("ORD-123")
        self.assertTrue(res["success"])
        self.assertEqual(res["status"], "CANCELLED")
        self.assertEqual(res["order_id"], "ORD-123")

        # 4. Connected broker error
        mock_ctx.modify_order.return_value = (-1, "Order already filled")
        res = self.client.cancel_order("ORD-123")
        self.assertFalse(res["success"])
        self.assertIn("Order already filled", res["error"])

    def test_query_orders_connected_success(self):
        """Connected client retrieves and normalizes orders from OpenD."""
        from unittest.mock import MagicMock
        import pandas as pd

        self.client._connected = True
        self.client._account_id = "12345"
        mock_ctx = MagicMock()
        mock_df = pd.DataFrame([
            {
                "order_id": "ORD-100",
                "code": "US.NVDA",
                "stock_name": "NVIDIA",
                "trd_side": "BUY",
                "order_type": "NORMAL",
                "order_status": "SUBMITTED",
                "qty": 20,
                "price": 140.00,
                "dealt_qty": 0,
                "dealt_avg_price": 0.0,
                "create_time": "2026-11-19 10:00:00",
                "updated_time": "2026-11-19 10:00:00"
            }
        ])
        mock_ctx.order_list_query.return_value = (0, mock_df)
        self.client._trade_ctx = mock_ctx

        orders = self.client.query_orders()
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["order_id"], "ORD-100")
        self.assertEqual(orders[0]["code"], "US.NVDA")
        self.assertEqual(orders[0]["order_status"], "SUBMITTED")
        self.assertEqual(orders[0]["qty"], 20)
        self.assertEqual(orders[0]["price"], 140.00)


if __name__ == "__main__":
    unittest.main()
