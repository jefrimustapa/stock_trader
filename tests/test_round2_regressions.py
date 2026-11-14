import unittest
import tempfile
import json
import subprocess
import time
from pathlib import Path
from zoneinfo import ZoneInfo
from datetime import datetime
from fastapi import HTTPException
from fastapi.testclient import TestClient

from bridge.src.hard_rules import (
    HardRulesEngine,
    OrderRequest,
    HardRuleViolation
)
from bridge.src.config import BridgeConfig
from bridge.src.moomoo_client import MoomooClient
import bridge.src.routes.trade as trade_route
from bridge.src.main import app

NY_TZ = ZoneInfo("America/New_York")


class TestRound2AuditRegressions(unittest.TestCase):
    """
    SDLC #8: Failing-first tests for QA Audit REVISE issues (HOM-129 / HOM-128).
    
    1. Dashboard real auth verification, no sandbox fallback, fail-fast on missing CF_ACCESS_AUD.
    2. Removal of client adv_20 parameter and zero unverified fallback for Rule 5.
    3. Fail-closed equity enforcement: zero silent $100k fallback when broker/baseline unavailable.
    4. Day trade calculation: BUY orders do not record day trades; only round-trip closures count.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_round2.sqlite"
        self.engine = HardRulesEngine(self.db_path)
        trade_route.engine = self.engine
        
        BridgeConfig.PAPERCLIP_BRIDGE_SECRET = "test-secret-paperclip-12345"
        BridgeConfig.BRIDGE_SERVICE_TOKEN = "test-token-service-67890"
        self.client = TestClient(app)

    # -------------------------------------------------------------------------
    # Issue #2: ADV20 Client Bypass & OrderRequest schema
    # -------------------------------------------------------------------------
    def test_issue2_adv20_removed_from_order_request_schema(self):
        """
        [Tinggi] ADV20 Masih Boleh Dipintas oleh Klien:
        Medan adv_20 mesti dibuang sepenuhnya daripada model OrderRequest.
        Jika klien cuba menghantar adv_20, ia tidak boleh diterima / tiada dalam model.
        """
        self.assertNotIn(
            "adv_20",
            OrderRequest.model_fields,
            "adv_20 must be completely removed from OrderRequest schema to prevent client bypass"
        )

    def test_issue2_unverified_symbol_fails_rule5_immediately(self):
        """
        [Tinggi] ADV20 Masih Boleh Dipintas oleh Klien:
        Jika tiada data pasaran ADV20 yang disahkan daripada watchlist/sumber pasaran yang sah,
        tolak order serta-merta tanpa fallback 10M.
        """
        order = OrderRequest(
            client_order_id="test-unverified-sym-1",
            symbol="US.NOT_IN_WATCHLIST",
            quantity=100,
            entry_price=150.0,
            stop_loss_price=148.0,
            order_side="BUY"
        )
        # Empty market cache -> must reject immediately under Rule 5
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule5_verified_liquidity(order, market_data_cache={})
        self.assertEqual(ctx.exception.rule_code, "RULE_5")
        self.assertIn("unavailable or unverified", ctx.exception.message)

    # -------------------------------------------------------------------------
    # Issue #3: Fail-Closed Equity (Zero Silent $100k Fallback)
    # -------------------------------------------------------------------------
    def test_issue3_equity_fail_closed_no_silent_fallback_in_engine(self):
        """
        [Tinggi] Ekuiti Fail-Closed:
        get_verified_equity() mesti memulangkan None jika baseline tiada (tanpa fallback senyap $100k).
        """
        # When no baseline has been recorded for this trade date:
        equity = self.engine.get_verified_equity("2026-11-14", fallback=None)
        self.assertIsNone(equity, "get_verified_equity must return None instead of defaulting to $100,000")

    def test_issue3_submit_trade_fail_closed_when_equity_unverified(self):
        """
        [Tinggi] Ekuiti Fail-Closed:
        Jika ekuiti akaun tidak dapat disahkan dari broker/baseline rasmi semasa eksekusi,
        tolak order serta-merta (HTTP 503 / 422) dan jangan sesekali mengandaikan ekuiti secara senyap.
        """
        # Ensure moomoo_client is disconnected so get_account_equity() returns None
        trade_route.moomoo_client._connected = False
        # Do not set opening baseline in self.engine

        headers = {
            "Authorization": f"Bearer {BridgeConfig.PAPERCLIP_BRIDGE_SECRET}"
        }
        order_payload = {
            "client_order_id": "test-fail-closed-1",
            "symbol": "US.NVDA",
            "quantity": 10,
            "entry_price": 100.0,
            "stop_loss_price": 99.0,
            "order_side": "BUY"
        }

        resp = self.client.post("/api/v1/trade/submit", json=order_payload, headers=headers)
        # Must fail closed with 503 Service Unavailable or 422 Unprocessable Entity
        self.assertIn(
            resp.status_code,
            [503, 422],
            f"Expected fail-closed 503 or 422 when equity is unverified, but got {resp.status_code}: {resp.text}"
        )
        self.assertNotIn("100000", resp.text)

    # -------------------------------------------------------------------------
    # Issue #4: Rule 3 Day Trade Calculation (Round-trip only)
    # -------------------------------------------------------------------------
    def test_issue4_buy_order_does_not_blindly_record_day_trade(self):
        """
        [Sederhana] Penyelarasan Pengiraan Day Trade Rule 3:
        Jangan anggap setiap order BUY sebagai day trade.
        Perekodan day trade hanya terpakai apabila terdapat penutupan kedudukan
        (round-trip belian dan jualan pada hari pasaran yang sama).
        """
        trade_date = "2026-11-14"
        # Initial day trades in log should be 0
        with self.engine._get_connection() as conn:
            cnt_before = conn.execute("SELECT COUNT(*) as c FROM day_trade_log").fetchone()["c"]

        # Submitting a standard long BUY order
        buy_order = OrderRequest(
            client_order_id="test-buy-not-daytrade-1",
            symbol="US.AAPL",
            quantity=50,
            entry_price=150.0,
            stop_loss_price=145.0,
            order_side="BUY"
        )

        # Process trade order through execution route or recording function
        self.engine.register_order_and_record_day_trade_if_roundtrip(trade_date, buy_order)

        # After a pure BUY, day trade count MUST remain unchanged (0)
        with self.engine._get_connection() as conn:
            cnt_after = conn.execute("SELECT COUNT(*) as c FROM day_trade_log").fetchone()["c"]

        self.assertEqual(
            cnt_after,
            cnt_before,
            "A standard BUY order without prior position closure must NOT record a day trade!"
        )

    def test_issue4_round_trip_sell_after_buy_records_day_trade(self):
        """
        [Sederhana] Round-trip buy followed by sell on the same day MUST record a day trade.
        """
        trade_date = "2026-11-14"
        buy_order = OrderRequest(
            client_order_id="test-rt-buy-1",
            symbol="US.TSLA",
            quantity=10,
            entry_price=200.0,
            stop_loss_price=190.0,
            order_side="BUY"
        )
        sell_order = OrderRequest(
            client_order_id="test-rt-sell-1",
            symbol="US.TSLA",
            quantity=10,
            entry_price=205.0,
            stop_loss_price=200.0,
            order_side="SELL"
        )

        # 1. Execute BUY
        self.engine.register_order_and_record_day_trade_if_roundtrip(trade_date, buy_order)
        with self.engine._get_connection() as conn:
            cnt_after_buy = conn.execute("SELECT COUNT(*) as c FROM day_trade_log").fetchone()["c"]
        self.assertEqual(cnt_after_buy, 0)

        # 2. Execute SELL on same day for same symbol -> round trip complete!
        self.engine.register_order_and_record_day_trade_if_roundtrip(trade_date, sell_order)
        with self.engine._get_connection() as conn:
            cnt_after_sell = conn.execute("SELECT COUNT(*) as c FROM day_trade_log").fetchone()["c"]
        self.assertEqual(cnt_after_sell, 1, "Selling a position bought on the same day must record 1 day trade!")


if __name__ == "__main__":
    unittest.main()
