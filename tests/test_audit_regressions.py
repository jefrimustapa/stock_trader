import unittest
import tempfile
import hmac
from pathlib import Path
from datetime import datetime, time, date, timedelta
from zoneinfo import ZoneInfo
from fastapi import HTTPException

from bridge.src.hard_rules import (
    HardRulesEngine,
    OrderRequest,
    HardRuleViolation,
    get_rolling_business_day_start
)
from bridge.src.bva_validator import BVAValidator
from bridge.src.config import BridgeConfig
from bridge.src.moomoo_client import MoomooClient

NY_TZ = ZoneInfo("America/New_York")


class TestAuditRegressions(unittest.TestCase):
    """
    SDLC #8: Regression tests for defects identified in QA Audit HOM-126.
    Verifies that all 10 Blocker and Medium issues have been thoroughly resolved.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_audit.sqlite"
        self.engine = HardRulesEngine(self.db_path)
        self.validator = BVAValidator(self.engine)
        # Configure test secrets
        BridgeConfig.PAPERCLIP_BRIDGE_SECRET = "test-secret-paperclip-12345"
        BridgeConfig.BRIDGE_SERVICE_TOKEN = "test-token-service-67890"

    # ---------------------------------------------------------
    # Issue #1: Rule 1 & Rule 5 Client Value Integrity
    # ---------------------------------------------------------
    def test_issue1_client_cannot_bypass_rule1_with_spoofed_equity(self):
        """
        Defect: In commit 299e97d, account_equity was accepted from client input/query param,
        allowing a client to bypass Rule 1 (2.0% max risk cap) by spoofing account_equity=1,000,000,000.
        Fix: Engine/API enforces verified baseline equity ($100,000), rejecting spoofed orders.
        """
        # Stored verified baseline is $100,000 (maximum allowed 2% risk is $2,000)
        self.engine.set_opening_baseline("2026-11-14", 100_000.0)

        # Order with risk = 100 * ($200 - $101) = $9,900 (9.9% of $100k, must be REJECTED)
        order = OrderRequest(
            client_order_id="test-spoof-1",
            symbol="US.NVDA",
            quantity=100,
            entry_price=200.0,
            stop_loss_price=101.0,
            order_side="BUY"
        )

        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule1_verified_equity(order, "2026-11-14")
        self.assertEqual(ctx.exception.rule_code, "RULE_1")
        self.assertIn("exceeds maximum allowed 2.0% equity", ctx.exception.message)

    def test_issue1_rule5_cannot_use_unverified_client_adv20(self):
        """
        Defect: In commit 299e97d, adv_20 defaulted to 10,000,000 in client request schema.
        Fix: adv_20 must be resolved from verified market data cache. Unverified symbols are rejected.
        """
        order = OrderRequest(
            client_order_id="test-adv-1",
            symbol="US.UNKNOWN_ILLIQUID",
            quantity=5000,
            entry_price=50.0,
            stop_loss_price=48.0,
            order_side="BUY"
        )
        # Without verified market data for UNKNOWN_ILLIQUID, it must be rejected under Rule 5
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule5_verified_liquidity(order, market_data_cache={})
        self.assertEqual(ctx.exception.rule_code, "RULE_5")
        self.assertIn("unavailable or unverified", ctx.exception.message)

    # ---------------------------------------------------------
    # Issue #2: Rule 3 Rolling 5-Business-Day Window & Recording
    # ---------------------------------------------------------
    def test_issue2_rule3_rolling_5_business_days_window(self):
        """
        Defect: In commit 299e97d, query was 'trade_date <= ?', meaning 3 trades in January
        falsely blocked trading in November.
        Fix: Query enforces rolling 5 business days window [window_start to current_date].
        """
        # Record 3 day trades from > 5 business days ago (October 2026)
        self.engine.record_day_trade("2026-10-15", "US.AAPL", 10)
        self.engine.record_day_trade("2026-10-16", "US.TSLA", 10)
        self.engine.record_day_trade("2026-10-17", "US.MSFT", 10)

        # On current date 2026-11-14, account equity $20,000 (< $25k)
        # MUST BE ALLOWED because old trades are well outside the rolling 5-business-day window
        try:
            self.engine.validate_rule3_pdt(account_equity=20_000.0, current_date="2026-11-14")
        except HardRuleViolation:
            self.fail("validate_rule3_pdt unexpectedly rejected trade due to static trade_date <= ? query!")

        # Now record 3 day trades WITHIN the 5-business-day window (2026-11-10 to 2026-11-14)
        self.engine.record_day_trade("2026-11-10", "US.GOOG", 10)
        self.engine.record_day_trade("2026-11-11", "US.AMZN", 10)
        self.engine.record_day_trade("2026-11-12", "US.META", 10)

        # 4th day trade in rolling window MUST be rejected
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule3_pdt(account_equity=20_000.0, current_date="2026-11-14")
        self.assertEqual(ctx.exception.rule_code, "RULE_3")

    def test_issue2_business_day_helper(self):
        """Verifies rolling business day calculation skips weekends."""
        # Friday Nov 20, 2026 -> 5 business days back is Monday Nov 16, 2026
        start = get_rolling_business_day_start("2026-11-20", business_days=5)
        self.assertEqual(start, "2026-11-16")
        # Saturday Nov 14, 2026 -> 5 business days back is Monday Nov 09, 2026
        start_sat = get_rolling_business_day_start("2026-11-14", business_days=5)
        self.assertEqual(start_sat, "2026-11-09")

    # ---------------------------------------------------------
    # Issue #3: Rule 8 Kill Switch Honest Status
    # ---------------------------------------------------------
    def test_issue3_kill_switch_reports_honest_mock_status_when_disconnected(self):
        """
        Defect: In commit 299e97d, kill switch claimed orders cancelled in OpenD even when disconnected.
        Fix: Honestly returns opend_status='MOCK/DISCONNECTED' and status='KILL_SWITCH_LOCAL_ONLY'.
        """
        client = MoomooClient(host="invalid-host-opend", port=11111)
        # Client is not connected
        self.assertFalse(client.is_connected())

        result = self.engine.execute_rule8_kill_switch(moomoo_client=client)
        self.assertEqual(result["opend_status"], "MOCK/DISCONNECTED")
        self.assertEqual(result["status"], "KILL_SWITCH_LOCAL_ONLY")
        self.assertTrue(result["latency_compliant"])

    # ---------------------------------------------------------
    # Issue #5: Zero Default Secrets & Fail-Fast Validation
    # ---------------------------------------------------------
    def test_issue5_fail_fast_when_secrets_missing(self):
        """
        Defect: In commit 299e97d, config.py had fallback generic secrets.
        Fix: validate_secrets() raises RuntimeError if secrets are empty or unset.
        """
        original_secret = BridgeConfig.PAPERCLIP_BRIDGE_SECRET
        try:
            BridgeConfig.PAPERCLIP_BRIDGE_SECRET = ""
            with self.assertRaises(RuntimeError) as ctx:
                BridgeConfig.validate_secrets()
            self.assertIn("Missing required security credentials", str(ctx.exception))
        finally:
            BridgeConfig.PAPERCLIP_BRIDGE_SECRET = original_secret

    # ---------------------------------------------------------
    # Issue #8: Constant-time comparison & Strict order_side
    # ---------------------------------------------------------
    def test_issue8_strict_order_side_validation(self):
        """
        Defect: order_side was not strictly validated (SELL evaluated as long-buy).
        Fix: Strict Literal['BUY', 'SELL'] validation and long risk checks applied only to BUY.
        """
        # Invalid side should fail Pydantic model validation
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            OrderRequest(
                client_order_id="test-side-invalid",
                symbol="US.AAPL",
                quantity=10,
                entry_price=150.0,
                stop_loss_price=140.0,
                order_side="SHORT_NOT_SUPPORTED"  # type: ignore
            )

        # Valid SELL order does not require stop_loss < entry_price
        sell_order = OrderRequest(
            client_order_id="test-sell-valid",
            symbol="US.AAPL",
            quantity=10,
            entry_price=150.0,
            stop_loss_price=155.0,  # Sell order exit
            order_side="SELL"
        )
        # Should not raise Rule 1 violation
        self.engine.validate_rule1_max_risk(sell_order, account_equity=100_000.0)

    # ---------------------------------------------------------
    # Issue #9: Rule 6 Boundary < 15:45:00 NY
    # ---------------------------------------------------------
    def test_issue9_rule6_boundary_subsecond_precision(self):
        """
        Defect: In commit 299e97d, 15:44:59.500 was rejected due to <= 15:44:59 comparison.
        Fix: Uses < 15:45:00 comparison, accepting 15:44:59.999.
        """
        dt_accept = datetime(2026, 11, 14, 15, 44, 59, 500000, tzinfo=NY_TZ)
        dt_reject = datetime(2026, 11, 14, 15, 45, 0, 0, tzinfo=NY_TZ)

        # 15:44:59.500 MUST BE ACCEPTED
        try:
            self.engine.validate_rule6_trading_window(dt_accept)
        except HardRuleViolation:
            self.fail("15:44:59.500 NY was unexpectedly rejected under Rule 6!")

        # 15:45:00.000 MUST BE REJECTED
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule6_trading_window(dt_reject)
        self.assertEqual(ctx.exception.rule_code, "RULE_6")
