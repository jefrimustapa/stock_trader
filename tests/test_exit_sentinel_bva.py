import os
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient

from bridge.src.agent_pipeline import AgentPipeline
from bridge.src.hard_rules import HardRulesEngine, OrderRequest, HardRuleViolation
from bridge.src.reconciliation import PositionReconciler
from bridge.src.main import app
from bridge.src.config import BridgeConfig

NY_TZ = ZoneInfo("America/New_York")


class MockMoomooClient:
    def __init__(self, positions=None):
        self._positions = positions or []
        self._orders = []
        self._quotes = {}
        self.trd_env = "SIMULATE"

    def is_connected(self):
        return True

    def get_connection_status(self):
        return "CONNECTED"

    def query_positions(self):
        return list(self._positions)

    def query_orders(self):
        return list(self._orders)

    def get_account_equity(self):
        return 100000.0

    def get_stock_quote(self, symbol):
        return self._quotes.get(symbol, {"cur_price": 100.0, "price": 100.0})

    def submit_order(self, order_dict):
        order_id = f"MOCK-ORD-{len(self._orders) + 1}"
        record = dict(order_dict)
        record["order_id"] = order_id
        record["status"] = "SUBMITTED"
        self._orders.append(record)
        return {
            "status": "SUBMITTED",
            "order_id": order_id,
            "message": "Order accepted by mock OpenD"
        }

    def cancel_order(self, order_id):
        return {"success": True, "order_id": order_id, "status": "CANCELLED"}


class TestExitSentinelBVA(unittest.TestCase):
    """
    Boundary Value Analysis (BVA) for L4 Exit Sentinel, Anti-Stop-Hunt, and Position Sales Execution.
    SDLC Checklist #3a & #4: Comprehensive Boundary & Branch Coverage.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_pipeline.sqlite"
        self.hard_rules_engine = HardRulesEngine(self.db_path)
        self.pipeline = AgentPipeline(db_path=self.db_path)
        self.pipeline.hard_rules_engine = self.hard_rules_engine

        # Baseline equity setup
        self.trade_date = datetime.now(NY_TZ).strftime("%Y-%m-%d")
        self.hard_rules_engine.set_opening_baseline(self.trade_date, 100000.0)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # -------------------------------------------------------------------------
    # 1. Stop Loss BVA Boundaries (100% full exit)
    # Entry: $100.00, ATR: $2.00, Structural SL buffer: 1.5 * 2.0 = $3.00 -> SL = $97.00
    # -------------------------------------------------------------------------
    def test_bva_sl_boundary_exact_sl_triggers_exit(self):
        """Price exactly at SL ($97.00) triggers full SELL exit."""
        # Setup open position and baseline BUY order
        now_iso = datetime.now(timezone.utc).isoformat()
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "BUY-NVDA-1", "ORD-BUY-1", "CYC-1", "US.NVDA", "BUY",
                100, 100.00, 97.00, 104.50,
                "FILLED", "CONNECTED", "Entry buy", "DAY", "DAY", "AGENT_PIPELINE", now_iso
            ))
            conn.commit()

        mock_client = MockMoomooClient(positions=[{"code": "US.NVDA", "qty": 100, "cost_price": 100.00}])
        self.pipeline.moomoo_client = mock_client

        # Price exactly at SL: 97.00
        exits = self.pipeline.evaluate_exit_sentinel(
            mock_market_prices={"US.NVDA": 97.00},
            atrs={"US.NVDA": 2.00}
        )

        self.assertEqual(len(exits), 1, "Expected exactly 1 exit order at SL")
        self.assertTrue(exits[0]["success"])
        self.assertEqual(exits[0]["quantity"], 100, "Expected full 100% quantity exit")
        self.assertEqual(exits[0]["exit_price"], 97.00)
        self.assertEqual(exits[0]["reason"], "EXIT_SENTINEL_STOP_LOSS")

        # Verify paper_orders record
        orders = self.pipeline.get_paper_orders(limit=10)
        sell_orders = [o for o in orders if o["order_side"] == "SELL"]
        self.assertEqual(len(sell_orders), 1)
        self.assertEqual(sell_orders[0]["source"], "EXIT_SENTINEL_STOP_LOSS")
        self.assertEqual(sell_orders[0]["quantity"], 100)

    def test_bva_sl_boundary_one_cent_above_sl_does_not_trigger(self):
        """Price $0.01 above SL ($97.01) must NOT trigger exit."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "BUY-NVDA-2", "ORD-BUY-2", "CYC-2", "US.NVDA", "BUY",
                100, 100.00, 97.00, 104.50,
                "FILLED", "CONNECTED", "Entry buy", "DAY", "DAY", "AGENT_PIPELINE", now_iso
            ))
            conn.commit()

        mock_client = MockMoomooClient(positions=[{"code": "US.NVDA", "qty": 100, "cost_price": 100.00}])
        self.pipeline.moomoo_client = mock_client

        # Price 97.01 (1 cent above 97.00)
        exits = self.pipeline.evaluate_exit_sentinel(
            mock_market_prices={"US.NVDA": 97.01},
            atrs={"US.NVDA": 2.00}
        )

        self.assertEqual(len(exits), 0, "Price $0.01 above SL must not trigger exit")

    def test_bva_sl_boundary_one_cent_below_sl_triggers_exit(self):
        """Price $0.01 below SL ($96.99) triggers full SELL exit."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "BUY-NVDA-3", "ORD-BUY-3", "CYC-3", "US.NVDA", "BUY",
                100, 100.00, 97.00, 104.50,
                "FILLED", "CONNECTED", "Entry buy", "DAY", "DAY", "AGENT_PIPELINE", now_iso
            ))
            conn.commit()

        mock_client = MockMoomooClient(positions=[{"code": "US.NVDA", "qty": 100, "cost_price": 100.00}])
        self.pipeline.moomoo_client = mock_client

        exits = self.pipeline.evaluate_exit_sentinel(
            mock_market_prices={"US.NVDA": 96.99},
            atrs={"US.NVDA": 2.00}
        )

        self.assertEqual(len(exits), 1)
        self.assertEqual(exits[0]["exit_price"], 96.99)
        self.assertEqual(exits[0]["quantity"], 100)

    # -------------------------------------------------------------------------
    # 2. Take Profit TP1 BVA Boundaries (50% partial exit & SL to Break-Even)
    # Entry: $100.00, TP1: $104.50
    # -------------------------------------------------------------------------
    def test_bva_tp1_boundary_exact_tp1_triggers_50_pct_sell(self):
        """Price exactly at TP1 ($104.50) triggers 50% partial exit and raises SL to Break-Even."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "BUY-NVDA-TP1", "ORD-BUY-TP1", "CYC-TP1", "US.NVDA", "BUY",
                100, 100.00, 97.00, 104.50,
                "FILLED", "CONNECTED", "Entry buy", "DAY", "DAY", "AGENT_PIPELINE", now_iso
            ))
            conn.commit()

        mock_client = MockMoomooClient(positions=[{"code": "US.NVDA", "qty": 100, "cost_price": 100.00}])
        self.pipeline.moomoo_client = mock_client

        exits = self.pipeline.evaluate_exit_sentinel(
            mock_market_prices={"US.NVDA": 104.50},
            atrs={"US.NVDA": 2.00}
        )

        self.assertEqual(len(exits), 1)
        self.assertEqual(exits[0]["reason"], "EXIT_SENTINEL_TP1")
        self.assertEqual(exits[0]["quantity"], 50, "Expected 50% of 100 shares = 50")
        self.assertEqual(exits[0]["exit_price"], 104.50)

        # Verify stop loss in paper_orders raised to Break-Even (entry_price = 100.00)
        with self.pipeline._get_connection() as conn:
            row = conn.execute("SELECT stop_loss_price FROM paper_orders WHERE symbol = 'US.NVDA' AND order_side = 'BUY'").fetchone()
            self.assertEqual(float(row["stop_loss_price"]), 100.00, "SL must be raised to Break-Even after TP1")

    def test_bva_tp1_boundary_one_cent_below_tp1_does_not_trigger(self):
        """Price $0.01 below TP1 ($104.49) must NOT trigger TP1 exit."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self.pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "BUY-NVDA-TP2", "ORD-BUY-TP2", "CYC-TP2", "US.NVDA", "BUY",
                100, 100.00, 97.00, 104.50,
                "FILLED", "CONNECTED", "Entry buy", "DAY", "DAY", "AGENT_PIPELINE", now_iso
            ))
            conn.commit()

        mock_client = MockMoomooClient(positions=[{"code": "US.NVDA", "qty": 100, "cost_price": 100.00}])
        self.pipeline.moomoo_client = mock_client

        exits = self.pipeline.evaluate_exit_sentinel(
            mock_market_prices={"US.NVDA": 104.49},
            atrs={"US.NVDA": 2.00}
        )

        self.assertEqual(len(exits), 0, "Price $0.01 below TP1 must not trigger partial exit")

    # -------------------------------------------------------------------------
    # 3. Post-TP1 Chandelier Trailing Exit & Break-Even Defense
    # -------------------------------------------------------------------------
    def test_post_tp1_break_even_trailing_exit(self):
        """After TP1 hit, price dropping back to Break-Even ($100.00) exits remaining shares."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self.pipeline._get_connection() as conn:
            # Baseline buy
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "BUY-NVDA-TP-TR", "ORD-BUY-TR", "CYC-TR", "US.NVDA", "BUY",
                100, 100.00, 100.00, 104.50,
                "FILLED", "CONNECTED", "Entry buy", "DAY", "DAY", "AGENT_PIPELINE", now_iso
            ))
            # TP1 already executed
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "EXIT-NVDA-TP1", "ORD-SELL-TP1", "CYC-TR", "US.NVDA", "SELL",
                50, 104.50, 100.00, 104.50,
                "FILLED", "CONNECTED", "TP1 hit 50%", "DAY", "DAY", "EXIT_SENTINEL_TP1", now_iso
            ))
            conn.commit()

        # Remaining position is 50 shares
        mock_client = MockMoomooClient(positions=[{"code": "US.NVDA", "qty": 50, "cost_price": 100.00}])
        self.pipeline.moomoo_client = mock_client

        # Price drops back to 99.50 (below Break-Even $100.00)
        exits = self.pipeline.evaluate_exit_sentinel(
            mock_market_prices={"US.NVDA": 99.50},
            atrs={"US.NVDA": 2.00}
        )

        self.assertEqual(len(exits), 1)
        self.assertEqual(exits[0]["reason"], "EXIT_SENTINEL_CHANDELIER_TRAILING")
        self.assertEqual(exits[0]["quantity"], 50)

    # -------------------------------------------------------------------------
    # 4. Anti-Stop-Hunt: Tariq & Haziq Active Position Watch
    # Wyckoff Spring (Low-vol drop) vs Structural Breakdown (High-vol drop)
    # -------------------------------------------------------------------------
    def test_anti_stop_hunt_wyckoff_spring_holds_position(self):
        """Low-volume pullback at support (Wyckoff Spring) suppresses early exit."""
        candidate = {
            "symbol": "US.NVDA",
            "price": 98.00,
            "cost_price": 100.00,
            "is_held": True,
            "held_qty": 100,
            "testing_support": True,
            "volume_ratio": 0.6,  # Low volume test
            "trading_mode": "DAY"
        }

        tariq_res = self.pipeline.evaluate_tariq_technical(candidate, trading_mode="DAY")
        self.assertTrue(tariq_res["wyckoff_spring_detected"], "Expected Wyckoff Spring detection on low volume")
        self.assertFalse(tariq_res["structural_breakdown"])

        nawwar_res = self.pipeline.evaluate_nawwar_sentiment(candidate, trading_mode="DAY")
        haziq_res = self.pipeline.evaluate_haziq_synthesis(
            candidate=candidate,
            tariq_res=tariq_res,
            nawwar_res=nawwar_res,
            account_equity=100000.0,
            trading_mode="DAY"
        )

        self.assertEqual(haziq_res["held_action"], "HOLD", "Wyckoff Spring must hold position, not panic exit")
        self.assertIn("Wyckoff Spring", haziq_res["thesis"])

    def test_structural_breakdown_triggers_haziq_early_exit(self):
        """High-volume breakdown at support triggers Haziq early threat exit."""
        candidate = {
            "symbol": "US.NVDA",
            "price": 96.00,
            "cost_price": 100.00,
            "is_held": True,
            "held_qty": 100,
            "breakdown": True,
            "volume_ratio": 2.2,  # Heavy institutional distribution volume
            "trading_mode": "DAY"
        }

        tariq_res = self.pipeline.evaluate_tariq_technical(candidate, trading_mode="DAY")
        self.assertTrue(tariq_res["structural_breakdown"])
        self.assertFalse(tariq_res["wyckoff_spring_detected"])

        nawwar_res = self.pipeline.evaluate_nawwar_sentiment(candidate, trading_mode="DAY")
        haziq_res = self.pipeline.evaluate_haziq_synthesis(
            candidate=candidate,
            tariq_res=tariq_res,
            nawwar_res=nawwar_res,
            account_equity=100000.0,
            trading_mode="DAY"
        )

        self.assertEqual(haziq_res["held_action"], "EXIT_REQUEST", "High volume breakdown must trigger EXIT_REQUEST")

    # -------------------------------------------------------------------------
    # 5. execute_position_exit & PDT Round-Trip Tracking
    # -------------------------------------------------------------------------
    def test_execute_position_exit_cancels_pending_and_records_sell(self):
        """execute_position_exit liquidates position, cancels pending orders, records SELL in paper_orders."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self.pipeline._get_connection() as conn:
            # Filled buy
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "BUY-AAPL", "ORD-AAPL-1", "CYC-1", "US.AAPL", "BUY",
                50, 150.00, 145.00, 160.00,
                "FILLED", "CONNECTED", "Entry buy", "DAY", "DAY", "AGENT_PIPELINE", now_iso
            ))
            # Pending open order for AAPL
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "PENDING-AAPL", "ORD-PEND-1", "CYC-1", "US.AAPL", "BUY",
                25, 148.00, 145.00, 160.00,
                "SUBMITTED", "CONNECTED", "Pending limit", "DAY", "DAY", "AGENT_PIPELINE", now_iso
            ))
            conn.commit()

        mock_client = MockMoomooClient(positions=[{"code": "US.AAPL", "qty": 50, "cost_price": 150.00}])
        self.pipeline.moomoo_client = mock_client

        exit_res = self.pipeline.execute_position_exit(
            symbol="US.AAPL",
            quantity=50,
            reason="MANUAL_LIQUIDATION",
            exit_price=152.00
        )

        self.assertTrue(exit_res["success"])
        self.assertEqual(exit_res["quantity"], 50)
        self.assertEqual(exit_res["exit_price"], 152.00)

        # Verify pending order was cancelled
        with self.pipeline._get_connection() as conn:
            pending_row = conn.execute("SELECT status FROM paper_orders WHERE order_id = 'ORD-PEND-1'").fetchone()
            self.assertEqual(pending_row["status"], "CANCELLED")

            # Verify SELL record in paper_orders
            sell_row = conn.execute("SELECT order_side, quantity, entry_price, source FROM paper_orders WHERE order_side = 'SELL' AND symbol = 'US.AAPL'").fetchone()
            self.assertIsNotNone(sell_row)
            self.assertEqual(sell_row["order_side"], "SELL")
            self.assertEqual(sell_row["quantity"], 50)
            self.assertEqual(sell_row["source"], "MANUAL_LIQUIDATION")

    # -------------------------------------------------------------------------
    # 6. Hard Rules: SELL orders permitted without watchlist presence & PDT recorded
    # -------------------------------------------------------------------------
    def test_hard_rules_permit_sell_orders_without_watchlist_presence(self):
        """Hard rules engine must permit SELL order even when symbol is not in screener watchlist."""
        order = OrderRequest(
            client_order_id="SELL-TEST-1234",
            symbol="US.UNLISTED",
            quantity=100,
            entry_price=4.50,  # Below $5.00 penny stock threshold, allowed on exit
            stop_loss_price=4.00,
            order_side="SELL",
            time_in_force="DAY",
            trading_mode="DAY"
        )

        # Empty market_data_cache (symbol not on watchlist)
        res = self.hard_rules_engine.validate_all(
            order=order,
            account_equity=100000.0,
            trade_date=self.trade_date,
            current_equity=100000.0,
            check_time_ny=datetime(2026, 11, 25, 10, 30, tzinfo=NY_TZ),
            market_data_cache={}
        )
        self.assertTrue(res["valid"])

    # -------------------------------------------------------------------------
    # 7. Endpoint POST /api/v1/trade/exit-request API Tests
    # -------------------------------------------------------------------------
    def test_api_exit_request_unauthenticated_rejected(self):
        """API exit request without token returns HTTP 401."""
        client = TestClient(app)
        res = client.post("/api/v1/trade/exit-request", json={"symbol": "US.NVDA"})
        self.assertEqual(res.status_code, 401)

    def test_api_exit_request_nonexistent_position_returns_404(self):
        """API exit request for unheld symbol returns HTTP 404."""
        token = BridgeConfig.PAPERCLIP_BRIDGE_SECRET or "dev-agent-secret"
        BridgeConfig.PAPERCLIP_BRIDGE_SECRET = token
        client = TestClient(app)

        res = client.post(
            "/api/v1/trade/exit-request",
            json={"symbol": "US.NONEXISTENT_XYZ"},
            headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(res.status_code, 404)

    def test_api_exit_request_success(self):
        """API exit request for active position submits SELL and returns HTTP 200."""
        token = BridgeConfig.PAPERCLIP_BRIDGE_SECRET or "dev-agent-secret"
        BridgeConfig.PAPERCLIP_BRIDGE_SECRET = token
        client = TestClient(app)

        # Mock an open position in pipeline singleton
        from bridge.src.agent_pipeline import get_agent_pipeline
        pipeline = get_agent_pipeline()
        now_iso = datetime.now(timezone.utc).isoformat()
        with pipeline._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "BUY-API-TEST", "ORD-API-TEST", "CYC-API", "US.MSFT", "BUY",
                40, 400.00, 390.00, 420.00,
                "FILLED", "CONNECTED", "Entry buy", "DAY", "DAY", "AGENT_PIPELINE", now_iso
            ))
            conn.commit()

        res = client.post(
            "/api/v1/trade/exit-request",
            json={
                "symbol": "US.MSFT",
                "quantity": 40,
                "reason": "MANUAL_LIQUIDATION",
                "limit_price": 405.00
            },
            headers={"Authorization": f"Bearer {token}"}
        )

        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ACCEPTED")
        self.assertEqual(data["symbol"], "US.MSFT")
        self.assertEqual(data["quantity"], 40)
        self.assertEqual(data["exit_price"], 405.00)


if __name__ == "__main__":
    unittest.main()
