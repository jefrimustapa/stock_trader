import os
import shutil
import tempfile
import unittest
from datetime import datetime, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.hard_rules import HardRulesEngine, OrderRequest, HardRuleViolation
from bridge.src.bva_validator import BVAValidator

NY_TZ = ZoneInfo("America/New_York")


class TestHardRulesBVA(unittest.TestCase):
    """
    Boundary Value Analysis (BVA) test suite for the 8 deterministic Hard Rules.
    SDLC Checklist #3a: 100% Boundary and branch coverage.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_baseline.sqlite"
        self.engine = HardRulesEngine(self.db_path)
        self.validator = BVAValidator(self.engine)
        self.equity = 100_000.0

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # --- Rule 1: Max Risk per Trade <= 2.0% Equity ---
    def test_r1_risk_boundary_1_99_percent(self):
        passed, msg = self.validator.test_risk_boundary(self.equity, 1.99)
        self.assertTrue(passed, f"Expected 1.99% risk to pass, got: {msg}")

    def test_r1_risk_boundary_exact_2_00_percent(self):
        passed, msg = self.validator.test_risk_boundary(self.equity, 2.00)
        self.assertTrue(passed, f"Expected 2.00% risk to pass, got: {msg}")

    def test_r1_risk_boundary_2_01_percent_rejected(self):
        passed, msg = self.validator.test_risk_boundary(self.equity, 2.01)
        self.assertFalse(passed, "Expected 2.01% risk to be rejected")
        self.assertIn("RULE_1", msg)

    # --- Rule 2: Daily Drawdown <= 5.0% ---
    def test_r2_drawdown_boundary_4_99_percent(self):
        opening = 100_000.0
        current = 95_010.0  # 4.99% drawdown
        passed, msg = self.validator.test_drawdown_boundary(opening, current)
        self.assertTrue(passed, f"Expected 4.99% drawdown to pass, got: {msg}")

    def test_r2_drawdown_boundary_exact_5_00_percent(self):
        opening = 100_000.0
        current = 95_000.0  # 5.00% drawdown
        passed, msg = self.validator.test_drawdown_boundary(opening, current)
        self.assertTrue(passed, f"Expected 5.00% drawdown to pass, got: {msg}")

    def test_r2_drawdown_boundary_5_01_percent_circuit_breaker(self):
        opening = 100_000.0
        current = 94_990.0  # 5.01% drawdown
        passed, msg = self.validator.test_drawdown_boundary(opening, current)
        self.assertFalse(passed, "Expected 5.01% drawdown to be rejected")
        self.assertIn("RULE_2", msg)
        # Verify circuit breaker is active
        self.assertTrue(self.engine.get_circuit_breaker_status("2026-11-14"))

    # --- Rule 3: PDT Rule Guard (< $25,000 Equity) ---
    def test_r3_pdt_boundary_3rd_day_trade_allowed(self):
        low_equity = 20_000.0
        trade_date = "2026-11-14"
        self.engine.record_day_trade(trade_date, "US.NVDA", 10)
        self.engine.record_day_trade(trade_date, "US.TSLA", 10)
        # 2 previous trades, 3rd trade check
        try:
            self.engine.validate_rule3_pdt(low_equity, trade_date)
            passed = True
        except HardRuleViolation:
            passed = False
        self.assertTrue(passed, "Expected 3rd day trade to pass")

    def test_r3_pdt_boundary_4th_day_trade_rejected(self):
        low_equity = 20_000.0
        trade_date = "2026-11-14"
        self.engine.record_day_trade(trade_date, "US.NVDA", 10)
        self.engine.record_day_trade(trade_date, "US.TSLA", 10)
        self.engine.record_day_trade(trade_date, "US.AAPL", 10)
        # 3 previous trades already recorded, 4th must fail
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule3_pdt(low_equity, trade_date)
        self.assertEqual(ctx.exception.rule_code, "RULE_3")

    def test_r3_pdt_exempt_when_equity_over_25k(self):
        high_equity = 50_000.0
        trade_date = "2026-11-14"
        for _ in range(5):
            self.engine.record_day_trade(trade_date, "US.NVDA", 10)
        try:
            self.engine.validate_rule3_pdt(high_equity, trade_date)
            passed = True
        except HardRuleViolation:
            passed = False
        self.assertTrue(passed, "Expected equity >= 25k to be exempt from PDT")

    # --- Rule 4: Penny Stock Filter (Price >= $5.00) ---
    def test_r4_penny_stock_boundary_exact_5_00(self):
        passed, msg = self.validator.test_penny_stock_boundary(5.00)
        self.assertTrue(passed, f"Expected $5.00 to pass, got: {msg}")

    def test_r4_penny_stock_boundary_4_99_rejected(self):
        passed, msg = self.validator.test_penny_stock_boundary(4.99)
        self.assertFalse(passed, "Expected $4.99 to be rejected")
        self.assertIn("RULE_4", msg)

    # --- Rule 5: Liquidity Guard (<= 1.0% ADV20) ---
    def test_r5_liquidity_boundary_exact_1_00_percent(self):
        adv20 = 1_000_000
        qty = 10_000  # Exactly 1.0%
        passed, msg = self.validator.test_liquidity_boundary(qty, adv20)
        self.assertTrue(passed, f"Expected 1.0% ADV20 to pass, got: {msg}")

    def test_r5_liquidity_boundary_1_01_percent_rejected(self):
        adv20 = 1_000_000
        qty = 10_001  # Exceeds 1.0%
        passed, msg = self.validator.test_liquidity_boundary(qty, adv20)
        self.assertFalse(passed, "Expected 1.01% ADV20 to be rejected")
        self.assertIn("RULE_5", msg)

    # --- Rule 6: Trading Window (09:45:00 - 15:44:59 NY) ---
    def test_r6a_trading_window_09_44_59_rejected(self):
        dt = datetime(2026, 11, 14, 9, 44, 59, tzinfo=NY_TZ)
        passed, msg = self.validator.test_time_window_boundary(dt)
        self.assertFalse(passed, "Expected 09:44:59 NY to be rejected")
        self.assertIn("RULE_6", msg)

    def test_r6a_trading_window_09_45_00_accepted(self):
        dt = datetime(2026, 11, 14, 9, 45, 0, tzinfo=NY_TZ)
        passed, msg = self.validator.test_time_window_boundary(dt)
        self.assertTrue(passed, f"Expected 09:45:00 NY to pass, got: {msg}")

    def test_r6b_trading_window_15_44_59_accepted(self):
        dt = datetime(2026, 11, 14, 15, 44, 59, tzinfo=NY_TZ)
        passed, msg = self.validator.test_time_window_boundary(dt)
        self.assertTrue(passed, f"Expected 15:44:59 NY to pass, got: {msg}")

    def test_r6b_trading_window_15_45_00_rejected(self):
        dt = datetime(2026, 11, 14, 15, 45, 0, tzinfo=NY_TZ)
        passed, msg = self.validator.test_time_window_boundary(dt)
        self.assertFalse(passed, "Expected 15:45:00 NY to be rejected")
        self.assertIn("RULE_6", msg)

    # --- Rule 7: Idempotency (Unique client_order_id) ---
    def test_r7_idempotency_unique_and_duplicate(self):
        order = OrderRequest(
            client_order_id="uuid-unique-12345",
            symbol="US.NVDA",
            quantity=10,
            entry_price=100.0,
            stop_loss_price=95.0,
            adv_20=10_000_000
        )
        # First attempt should validate fine
        self.engine.validate_rule7_idempotency(order.client_order_id)
        self.engine.register_order_processed(order)

        # Second attempt with same ID must raise HTTP 409 conflict
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule7_idempotency(order.client_order_id)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.rule_code, "RULE_7")

    # --- Rule 8: Kill Switch Latency ---
    def test_r8_kill_switch_execution_latency(self):
        result = self.engine.execute_rule8_kill_switch()
        self.assertEqual(result["status"], "KILL_SWITCH_EXECUTED")
        self.assertTrue(result["latency_compliant"])
        self.assertLess(result["elapsed_seconds"], 3.0)


if __name__ == "__main__":
    unittest.main()
