"""
Comprehensive Unit & Boundary Value Analysis (BVA) Tests for:
- Auto-Exit Sentinel & Portfolio Evaluation (Stop Loss, TP1 50%, Chandelier Trailing Stop)
- PaperclipDispatcher Integration (L1 Tariq & Nawwar, L2 Haziq, L3 Danial)
- Background Monitoring Loop with Active Positions (HOM-386 / HOM-384 / Issue #30)
"""

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from bridge.src.config import BridgeConfig
from bridge.src.paperclip_dispatcher import (
    PaperclipDispatcher,
    TARIQ_AGENT_ID,
    NAWWAR_AGENT_ID,
    HAZIQ_AGENT_ID,
    DANIAL_AGENT_ID,
)
from bridge.src.agent_pipeline import AgentPipeline


class TestAgentMonitoringExitBVA(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_agent_activity.sqlite"
        self.mock_moomoo = MagicMock()
        self.mock_moomoo.is_connected.return_value = True
        self.mock_moomoo.get_account_equity.return_value = 100000.0
        self.mock_moomoo.query_positions.return_value = []
        self.mock_dispatcher = MagicMock(spec=PaperclipDispatcher)

        self.pipeline = AgentPipeline(
            db_path=self.db_path,
            moomoo_client=self.mock_moomoo,
            dispatcher=self.mock_dispatcher,
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    # =========================================================================
    # 1. BVA on PaperclipDispatcher Heartbeat Invocations & Resilience
    # =========================================================================

    def test_dispatcher_bva_missing_api_key(self):
        """BVA: When PAPERCLIP_API_KEY is empty, invoke_agent_heartbeat returns SKIPPED."""
        disp = PaperclipDispatcher(api_url="https://test.crew.julietmike.net", api_key="")
        res = disp.invoke_agent_heartbeat(TARIQ_AGENT_ID, reason="test_wake")
        self.assertEqual(res["status"], "SKIPPED")
        self.assertEqual(res["reason"], "No API key")

    @patch("urllib.request.urlopen")
    def test_dispatcher_bva_successful_heartbeat(self, mock_urlopen):
        """BVA: Successful HTTP 200 response from Paperclip API returns SUCCESS."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.length = 20
        mock_resp.read.return_value = b'{"invoked":true}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        disp = PaperclipDispatcher(api_url="https://crew.julietmike.net", api_key="test-pat-key")
        res = disp.invoke_agent_heartbeat(HAZIQ_AGENT_ID, reason="l2_synthesis")
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["agent_id"], HAZIQ_AGENT_ID)

    @patch("urllib.request.urlopen")
    def test_dispatcher_bva_http_error_graceful_catch(self, mock_urlopen):
        """BVA: HTTP error (e.g., 401 Unauthorized or 500) returns ERROR and does not raise."""
        import urllib.error
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="https://crew.julietmike.net/api/agents/xyz/heartbeat/invoke",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=MagicMock(read=lambda: b'{"error":"Invalid token"}')
        )

        disp = PaperclipDispatcher(api_url="https://crew.julietmike.net", api_key="invalid-key")
        res = disp.invoke_agent_heartbeat(DANIAL_AGENT_ID, reason="l3_audit")
        self.assertEqual(res["status"], "ERROR")
        self.assertEqual(res["code"], 401)

    @patch("urllib.request.urlopen")
    def test_dispatcher_bva_network_timeout_graceful_catch(self, mock_urlopen):
        """BVA: Network timeout or connection drop returns ERROR without crashing caller."""
        import socket
        mock_urlopen.side_effect = socket.timeout("Timed out connecting to Paperclip server")

        disp = PaperclipDispatcher(api_url="https://crew.julietmike.net", api_key="valid-key")
        res = disp.invoke_agent_heartbeat(NAWWAR_AGENT_ID, reason="l1_sentiment")
        self.assertEqual(res["status"], "ERROR")
        self.assertIn("Timed out", res["error"])

    # =========================================================================
    # 2. BVA on Exit Sentinel & evaluate_portfolio_positions Alias
    # =========================================================================

    def test_evaluate_portfolio_positions_alias(self):
        """Verify evaluate_portfolio_positions forwards to evaluate_exit_sentinel."""
        with patch.object(self.pipeline, "evaluate_exit_sentinel", return_value=[{"test": "ok"}]) as mock_exit:
            res = self.pipeline.evaluate_portfolio_positions(mock_market_prices={"US.AAPL": 150.0})
            mock_exit.assert_called_once_with(mock_market_prices={"US.AAPL": 150.0}, atrs=None)
            self.assertEqual(res, [{"test": "ok"}])

    def test_bva_empty_portfolio_returns_empty_exits(self):
        """BVA: Empty portfolio (0 positions) returns empty list and executes no orders."""
        self.mock_moomoo.query_positions.return_value = []
        exits = self.pipeline.evaluate_exit_sentinel()
        self.assertEqual(exits, [])

    def test_bva_stop_loss_exact_boundary(self):
        """
        BVA: Stop loss trigger boundary:
        - Price == Stop Loss ($100.00): triggers full SELL.
        - Price < Stop Loss ($99.99): triggers full SELL.
        - Price > Stop Loss ($100.01): does NOT trigger Stop Loss.
        """
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side, quantity,
                    entry_price, stop_loss_price, take_profit_price, status, opend_status, created_at
                ) VALUES ('BUY-001', 'ORD-001', 'CYC-001', 'US.TEST_SL', 'BUY', 100, 110.00, 100.00, 125.00, 'FILLED', 'SIMULATE', '2026-11-26 00:00:00')
            """)
            conn.commit()

        self.mock_moomoo.query_positions.return_value = [
            {"code": "US.TEST_SL", "qty": 100, "cost_price": 110.00}
        ]

        # Case 1: Above Stop Loss ($100.01) -> No exit
        exits = self.pipeline.evaluate_exit_sentinel(mock_market_prices={"US.TEST_SL": 100.01})
        self.assertEqual(len(exits), 0)

        # Case 2: Exactly at Stop Loss ($100.00) -> 100% full exit
        with patch.object(self.pipeline, "execute_position_exit", return_value={"success": True, "reason": "EXIT_SENTINEL_STOP_LOSS"}) as mock_exec:
            exits = self.pipeline.evaluate_exit_sentinel(mock_market_prices={"US.TEST_SL": 100.00})
            self.assertEqual(len(exits), 1)
            mock_exec.assert_called_once_with(
                symbol="US.TEST_SL",
                quantity=100,
                reason="EXIT_SENTINEL_STOP_LOSS",
                exit_price=100.00
            )

        # Case 3: Below Stop Loss ($99.99) -> 100% full exit
        with patch.object(self.pipeline, "execute_position_exit", return_value={"success": True, "reason": "EXIT_SENTINEL_STOP_LOSS"}) as mock_exec:
            exits = self.pipeline.evaluate_exit_sentinel(mock_market_prices={"US.TEST_SL": 99.99})
            self.assertEqual(len(exits), 1)
            mock_exec.assert_called_once_with(
                symbol="US.TEST_SL",
                quantity=100,
                reason="EXIT_SENTINEL_STOP_LOSS",
                exit_price=99.99
            )

    def test_bva_tp1_partial_exit_and_break_even_sl_raise(self):
        """
        BVA: Take Profit TP1 trigger boundary:
        - Price == TP1 ($120.00): triggers 50% partial SELL and raises Stop Loss to break-even (entry_price).
        - Price < TP1 ($119.99): does NOT trigger TP1.
        """
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side, quantity,
                    entry_price, stop_loss_price, take_profit_price, status, opend_status, created_at
                ) VALUES ('BUY-002', 'ORD-002', 'CYC-002', 'US.TEST_TP', 'BUY', 50, 100.00, 90.00, 120.00, 'FILLED', 'SIMULATE', '2026-11-26 00:00:00')
            """)
            conn.commit()

        self.mock_moomoo.query_positions.return_value = [
            {"code": "US.TEST_TP", "qty": 50, "cost_price": 100.00}
        ]

        # Case 1: Just below TP1 ($119.99) -> No exit
        exits = self.pipeline.evaluate_exit_sentinel(mock_market_prices={"US.TEST_TP": 119.99})
        self.assertEqual(len(exits), 0)

        # Case 2: Exactly at TP1 ($120.00) -> 50% exit (25 shares)
        with patch.object(self.pipeline, "execute_position_exit", return_value={"success": True, "reason": "EXIT_SENTINEL_TP1"}) as mock_exec:
            exits = self.pipeline.evaluate_exit_sentinel(mock_market_prices={"US.TEST_TP": 120.00})
            self.assertEqual(len(exits), 1)
            mock_exec.assert_called_once_with(
                symbol="US.TEST_TP",
                quantity=25,
                reason="EXIT_SENTINEL_TP1",
                exit_price=120.00
            )

        # Verify Stop Loss in BUY order was updated to Break-Even ($100.00)
        with self.pipeline._get_connection() as conn:
            row = conn.execute("SELECT stop_loss_price FROM paper_orders WHERE symbol = 'US.TEST_TP' AND order_side = 'BUY'").fetchone()
            self.assertEqual(float(row["stop_loss_price"]), 100.00)

    def test_bva_single_unit_position_partial_exit_rounding(self):
        """BVA: When holding 1 share (qty=1), 50% partial exit rounds to max(1, 1//2) = 1 share."""
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side, quantity,
                    entry_price, stop_loss_price, take_profit_price, status, opend_status, created_at
                ) VALUES ('BUY-003', 'ORD-003', 'CYC-003', 'US.TEST_ONE', 'BUY', 1, 50.00, 45.00, 60.00, 'FILLED', 'SIMULATE', '2026-11-26 00:00:00')
            """)
            conn.commit()

        self.mock_moomoo.query_positions.return_value = [
            {"code": "US.TEST_ONE", "qty": 1, "cost_price": 50.00}
        ]

        with patch.object(self.pipeline, "execute_position_exit", return_value={"success": True, "reason": "EXIT_SENTINEL_TP1"}) as mock_exec:
            exits = self.pipeline.evaluate_exit_sentinel(mock_market_prices={"US.TEST_ONE": 60.00})
            self.assertEqual(len(exits), 1)
            mock_exec.assert_called_once_with(
                symbol="US.TEST_ONE",
                quantity=1,
                reason="EXIT_SENTINEL_TP1",
                exit_price=60.00
            )

    # =========================================================================
    # 3. Integration: run_simulation_cycle with Dispatcher & Active Positions
    # =========================================================================

    def test_simulation_cycle_dispatches_l1_l2_l3_agents(self):
        """Verify on-demand simulation cycle invokes L1, batched L2, and L3 agents when wake_agents=True."""
        mock_disp = MagicMock()
        mock_disp.dispatch_l1_agents.return_value = {"status": "SUCCESS"}
        mock_disp.aggregate_and_wake_haziq.return_value = {"status": "SUCCESS"}
        mock_disp.haziq_wake_danial.return_value = {"status": "SUCCESS"}

        self.pipeline.dispatcher = mock_disp

        candidates = [
            {
                "symbol": f"US.STK{i}",
                "price": 100.0 + i,
                "candles": [{"close": 100.0, "high": 105.0, "low": 98.0, "volume": 1000000}] * 10,
                "setup_metrics": {"relative_volume": 2.5, "dist_to_52w_high_pct": 3.0}
            }
            for i in range(3)
        ]

        # Mock Tariq and Nawwar passing so cycle flows from L1 -> L2 -> L3
        with patch.object(self.pipeline, "evaluate_tariq_technical", return_value={"passed": True, "score": 85.0}), \
             patch.object(self.pipeline, "evaluate_nawwar_sentiment", return_value={"passed": True, "score": 25.0}), \
             patch.object(self.pipeline, "evaluate_haziq_synthesis", return_value={"passed": True, "composite_score": 80.0, "trading_mode": "DAY"}), \
             patch.object(self.pipeline, "evaluate_danial_compliance", return_value={"passed": False, "rejection_reason": "TEST_GATE", "client_order_id": "ORD-123"}):

            res = self.pipeline.run_simulation_cycle(
                candidates=candidates,
                force_simulation=True,
                mock_market_window=True,
                include_active_positions=False,
                wake_agents=True
            )

            # L1 dispatcher called once for candidate list
            mock_disp.dispatch_l1_agents.assert_called_once_with(candidates)
            # L2 dispatcher called EXACTLY ONCE with all 3 candidates batched together
            mock_disp.aggregate_and_wake_haziq.assert_called_once()
            batched_arg = mock_disp.aggregate_and_wake_haziq.call_args[0][0]
            self.assertEqual(len(batched_arg), 3)
            # L3 dispatcher called for each qualifying proposal
            self.assertEqual(mock_disp.haziq_wake_danial.call_count, 3)

    def test_simulation_cycle_background_monitoring_zero_agent_heartbeats(self):
        """BVA: Background monitoring cycle with wake_agents=False never invokes agent heartbeats."""
        mock_disp = MagicMock()
        self.pipeline.dispatcher = mock_disp

        candidate = {
            "symbol": "US.NVDA",
            "price": 120.0,
            "candles": [{"close": 120.0, "high": 125.0, "low": 118.0, "volume": 1000000}] * 10,
        }

        with patch.object(self.pipeline, "evaluate_tariq_technical", return_value={"passed": True, "score": 90.0}), \
             patch.object(self.pipeline, "evaluate_nawwar_sentiment", return_value={"passed": True, "score": 50.0}), \
             patch.object(self.pipeline, "evaluate_haziq_synthesis", return_value={"passed": True, "composite_score": 85.0, "trading_mode": "DAY"}), \
             patch.object(self.pipeline, "evaluate_danial_compliance", return_value={"passed": False, "rejection_reason": "TEST_GATE", "client_order_id": "ORD-999"}):

            res = self.pipeline.run_simulation_cycle(
                candidates=[candidate],
                force_simulation=True,
                mock_market_window=True,
                include_active_positions=False,
                wake_agents=False  # Background loop setting
            )

            # Ensure ZERO agent heartbeat calls are made
            mock_disp.dispatch_l1_agents.assert_not_called()
            mock_disp.aggregate_and_wake_haziq.assert_not_called()
            mock_disp.haziq_wake_danial.assert_not_called()

    def test_simulation_cycle_in_flight_lock_rejection(self):
        """BVA: Duplicate concurrent run_simulation_cycle trigger returns IN_PROGRESS_SKIPPED."""
        with self.pipeline._pipeline_lock:
            self.pipeline._is_running = True

        try:
            res = self.pipeline.run_simulation_cycle(candidates=[{"symbol": "US.AAPL"}])
            self.assertEqual(res["status"], "IN_PROGRESS_SKIPPED")
            self.assertTrue(res["in_flight"])
        finally:
            with self.pipeline._pipeline_lock:
                self.pipeline._is_running = False

    def test_simulation_cycle_dispatcher_exception_non_blocking(self):
        """Verify that dispatcher network/runtime exceptions do NOT crash simulation execution."""
        mock_disp = MagicMock()
        mock_disp.dispatch_l1_agents.side_effect = RuntimeError("Paperclip API unreachable")
        self.pipeline.dispatcher = mock_disp

        candidate = {"symbol": "US.MSFT", "price": 400.0}
        with patch.object(self.pipeline, "evaluate_tariq_technical", return_value={"passed": False, "score": 40.0}), \
             patch.object(self.pipeline, "evaluate_nawwar_sentiment", return_value={"passed": False, "score": 0.0}), \
             patch.object(self.pipeline, "evaluate_haziq_synthesis", return_value={"passed": False}):

            # Cycle must finish normally despite dispatcher error
            res = self.pipeline.run_simulation_cycle(
                candidates=[candidate],
                force_simulation=True,
                mock_market_window=True,
                wake_agents=True
            )
            self.assertEqual(res["summary"]["total_candidates"], 1)
            self.assertEqual(res["summary"]["passed_l1"], 0)


if __name__ == "__main__":
    unittest.main()
