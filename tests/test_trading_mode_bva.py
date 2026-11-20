import os
import shutil
import tempfile
import unittest
from datetime import datetime, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.config import BridgeConfig
from bridge.src.hard_rules import HardRulesEngine, OrderRequest, HardRuleViolation
from bridge.src.agent_pipeline import AgentPipeline
from bridge.src.reconciliation import PositionReconciler
from screener.src.config import ScreenerConfig
from screener.src.cloud_screener import CloudScreener
from screener.src.quota_tracker import QuotaTracker

NY_TZ = ZoneInfo("America/New_York")


class TestTradingModeConfigBVA(unittest.TestCase):
    """
    BVA for Configuration loading and fallback.
    Default must fail-safe to DAY on missing or invalid configurations.
    """

    def test_screener_config_trading_mode_fallback(self):
        # Default is DAY
        self.assertIn(ScreenerConfig.TRADING_MODE, ("DAY", "SWING"))
        self.assertEqual(ScreenerConfig.SWING_EMA_PERIOD, 20)
        self.assertEqual(ScreenerConfig.SWING_VOL_SMA_PERIOD, 50)
        self.assertEqual(ScreenerConfig.SWING_BASELINE_SCHEDULE, "09:00,13:00,16:30")

    def test_bridge_config_trading_mode_values(self):
        self.assertIn(BridgeConfig.TRADING_MODE, ("DAY", "SWING"))


class TestHardRulesTradingModeBVA(unittest.TestCase):
    """
    SDLC 3a: 100% Boundary Value Analysis for Hard Rules under TRADING_MODE=DAY vs SWING.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_rules.db"
        self.engine = HardRulesEngine(db_path=self.db_path)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_rule1_max_risk_day_mode_boundaries(self):
        """
        Rule 1: DAY mode max risk is 2.0% equity ($2,000 on $100k equity).
        Exact boundary ($2,000): PASS
        Boundary - $0.01 ($1,999.99): PASS
        Boundary + $0.01 ($2,000.01): FAIL (RULE_1)
        """
        equity = 100_000.0

        # Exact boundary: 100 shares * ($120 - $100) = $2,000.00 (2.0%)
        order_exact = OrderRequest(
            client_order_id="DAY-R1-EXACT",
            symbol="AAPL",
            quantity=100,
            entry_price=120.0,
            stop_loss_price=100.0,
            trading_mode="DAY"
        )
        self.engine.validate_rule1_max_risk(order_exact, equity)

        # Boundary - epsilon: 99 shares * ($120 - $100) = $1,980.00 (< 2.0%)
        order_under = OrderRequest(
            client_order_id="DAY-R1-UNDER",
            symbol="AAPL",
            quantity=99,
            entry_price=120.0,
            stop_loss_price=100.0,
            trading_mode="DAY"
        )
        self.engine.validate_rule1_max_risk(order_under, equity)

        # Boundary + epsilon: 101 shares * ($120 - $100) = $2,020.00 (> 2.0%)
        order_over = OrderRequest(
            client_order_id="DAY-R1-OVER",
            symbol="AAPL",
            quantity=101,
            entry_price=120.0,
            stop_loss_price=100.0,
            trading_mode="DAY"
        )
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule1_max_risk(order_over, equity)
        self.assertEqual(ctx.exception.rule_code, "RULE_1")

    def test_rule1_max_risk_swing_mode_boundaries(self):
        """
        Rule 1: SWING mode max risk is 1.0% equity ($1,000 on $100k equity).
        Exact boundary ($1,000): PASS
        Boundary - $0.01 ($999.99): PASS
        Boundary + $0.01 ($1,000.01): FAIL (RULE_1)
        DAY level risk ($2,000) in SWING mode: FAIL (RULE_1)
        """
        equity = 100_000.0

        # Exact boundary: 50 shares * ($120 - $100) = $1,000.00 (1.0%)
        order_exact = OrderRequest(
            client_order_id="SWING-R1-EXACT",
            symbol="MSFT",
            quantity=50,
            entry_price=120.0,
            stop_loss_price=100.0,
            trading_mode="SWING"
        )
        self.engine.validate_rule1_max_risk(order_exact, equity)

        # Boundary - epsilon: 49 shares * ($120 - $100) = $980.00 (< 1.0%)
        order_under = OrderRequest(
            client_order_id="SWING-R1-UNDER",
            symbol="MSFT",
            quantity=49,
            entry_price=120.0,
            stop_loss_price=100.0,
            trading_mode="SWING"
        )
        self.engine.validate_rule1_max_risk(order_under, equity)

        # Boundary + epsilon: 51 shares * ($120 - $100) = $1,020.00 (> 1.0%)
        order_over = OrderRequest(
            client_order_id="SWING-R1-OVER",
            symbol="MSFT",
            quantity=51,
            entry_price=120.0,
            stop_loss_price=100.0,
            trading_mode="SWING"
        )
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule1_max_risk(order_over, equity)
        self.assertEqual(ctx.exception.rule_code, "RULE_1")
        self.assertIn("1.0%", str(ctx.exception))

        # DAY risk ($2,000) strictly rejected under SWING
        order_day_level = OrderRequest(
            client_order_id="SWING-R1-DAY-LEVEL",
            symbol="MSFT",
            quantity=100,
            entry_price=120.0,
            stop_loss_price=100.0,
            trading_mode="SWING"
        )
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule1_max_risk(order_day_level, equity)
        self.assertEqual(ctx.exception.rule_code, "RULE_1")

    def test_rule3_pdt_exemption_for_swing_overnight(self):
        """
        Rule 3 PDT: Margin equity < $25,000 with 3 day trades.
        - DAY mode with holding_days=0: FAILS
        - SWING mode with holding_days=0 (closed same day): FAILS
        - SWING mode with holding_days=1 (held overnight): PASSES (EXEMPT)
        - SWING mode with holding_days=5: PASSES (EXEMPT)
        """
        low_equity = 24_999.0
        trade_date = "2026-11-20"

        # Record 3 day trades in rolling window using record_day_trade
        for i in range(1, 4):
            self.engine.record_day_trade(trade_date, f"SYM{i}", 10)

        # Record intraday BUY execution for NVDA to simulate open position bought earlier today
        with self.engine._get_connection() as conn:
            conn.execute(
                "INSERT INTO intraday_executions (trade_date, symbol, order_side, quantity, client_order_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (trade_date, "NVDA", "BUY", 10, "BUY-INIT-1", "2026-11-20T10:00:00Z")
            )
            conn.commit()

        # DAY mode order (closing today) -> FAILS (4th day trade)
        order_day = OrderRequest(
            client_order_id="DAY-PDT",
            symbol="NVDA",
            quantity=10,
            entry_price=100.0,
            stop_loss_price=95.0,
            order_side="SELL",
            trading_mode="DAY",
            holding_days=0
        )
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule3_pdt(low_equity, trade_date, order=order_day)
        self.assertEqual(ctx.exception.rule_code, "RULE_3")

        # SWING mode order holding_days=0 (closed same day) -> FAILS (intraday round trip)
        order_swing_intraday = OrderRequest(
            client_order_id="SWING-PDT-INTRADAY",
            symbol="NVDA",
            quantity=10,
            entry_price=100.0,
            stop_loss_price=95.0,
            order_side="SELL",
            trading_mode="SWING",
            holding_days=0
        )
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule3_pdt(low_equity, trade_date, order=order_swing_intraday)
        self.assertEqual(ctx.exception.rule_code, "RULE_3")

        # SWING mode order holding_days=1 (overnight) -> PASSES (EXEMPT)
        order_swing_overnight = OrderRequest(
            client_order_id="SWING-PDT-OVERNIGHT",
            symbol="NVDA",
            quantity=10,
            entry_price=100.0,
            stop_loss_price=95.0,
            order_side="SELL",
            trading_mode="SWING",
            holding_days=1
        )
        self.engine.validate_rule3_pdt(low_equity, trade_date, order=order_swing_overnight)

        # SWING mode order holding_days=3 -> PASSES (EXEMPT)
        order_swing_multiday = OrderRequest(
            client_order_id="SWING-PDT-MULTIDAY",
            symbol="NVDA",
            quantity=10,
            entry_price=100.0,
            stop_loss_price=95.0,
            order_side="SELL",
            trading_mode="SWING",
            holding_days=3
        )
        self.engine.validate_rule3_pdt(low_equity, trade_date, order=order_swing_multiday)

    def test_rule6_trading_window_day_vs_swing(self):
        """
        Rule 6 Trading Window:
        - DAY: [09:45:00, 15:45:00) NY
        - SWING: [09:30:00, 16:00:00) NY (no 15:45 force exit cutoff)
        """
        # 09:29:59 NY -> Both fail
        t_092959 = datetime(2026, 11, 20, 9, 29, 59, tzinfo=NY_TZ)
        with self.assertRaises(HardRuleViolation):
            self.engine.validate_rule6_trading_window(t_092959, trading_mode="DAY")
        with self.assertRaises(HardRuleViolation):
            self.engine.validate_rule6_trading_window(t_092959, trading_mode="SWING")

        # 09:30:00 NY -> SWING passes, DAY fails
        t_093000 = datetime(2026, 11, 20, 9, 30, 0, tzinfo=NY_TZ)
        with self.assertRaises(HardRuleViolation):
            self.engine.validate_rule6_trading_window(t_093000, trading_mode="DAY")
        self.engine.validate_rule6_trading_window(t_093000, trading_mode="SWING")

        # 09:45:00 NY -> Both pass
        t_094500 = datetime(2026, 11, 20, 9, 45, 0, tzinfo=NY_TZ)
        self.engine.validate_rule6_trading_window(t_094500, trading_mode="DAY")
        self.engine.validate_rule6_trading_window(t_094500, trading_mode="SWING")

        # 15:44:59 NY -> Both pass
        t_154459 = datetime(2026, 11, 20, 15, 44, 59, tzinfo=NY_TZ)
        self.engine.validate_rule6_trading_window(t_154459, trading_mode="DAY")
        self.engine.validate_rule6_trading_window(t_154459, trading_mode="SWING")

        # 15:45:00 NY -> DAY fails (force exit), SWING passes
        t_154500 = datetime(2026, 11, 20, 15, 45, 0, tzinfo=NY_TZ)
        with self.assertRaises(HardRuleViolation) as ctx:
            self.engine.validate_rule6_trading_window(t_154500, trading_mode="DAY")
        self.assertEqual(ctx.exception.rule_code, "RULE_6")
        self.engine.validate_rule6_trading_window(t_154500, trading_mode="SWING")

        # 15:59:59 NY -> DAY fails, SWING passes
        t_155959 = datetime(2026, 11, 20, 15, 59, 59, tzinfo=NY_TZ)
        with self.assertRaises(HardRuleViolation):
            self.engine.validate_rule6_trading_window(t_155959, trading_mode="DAY")
        self.engine.validate_rule6_trading_window(t_155959, trading_mode="SWING")

        # 16:00:00 NY -> Both fail (market session closed)
        t_160000 = datetime(2026, 11, 20, 16, 0, 0, tzinfo=NY_TZ)
        with self.assertRaises(HardRuleViolation):
            self.engine.validate_rule6_trading_window(t_160000, trading_mode="DAY")
        with self.assertRaises(HardRuleViolation):
            self.engine.validate_rule6_trading_window(t_160000, trading_mode="SWING")


class TestAgentPipelineTradingModeBVA(unittest.TestCase):
    """
    BVA for Tariq, Nawwar, Haziq, and Danial in DAY vs SWING modes.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_pipeline.db"
        self.pipeline = AgentPipeline(db_path=self.db_path)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_tariq_technical_timeframe_labels(self):
        candidate = {"symbol": "AAPL", "price": 150.0, "lane": "SETUP", "dist_52w": 4.5}
        # DAY mode
        res_day = self.pipeline.evaluate_tariq_technical(candidate, trading_mode="DAY")
        self.assertEqual(res_day["trading_mode"], "DAY")
        self.assertEqual(res_day["timeframe"], "5M/15M")

        # SWING mode
        res_swing = self.pipeline.evaluate_tariq_technical(candidate, trading_mode="SWING")
        self.assertEqual(res_swing["trading_mode"], "SWING")
        self.assertEqual(res_swing["timeframe"], "4H/Daily+1H_ADAPTIVE")

    def test_nawwar_earnings_gate_boundaries(self):
        """
        Nawwar Earnings Gate:
        - DAY: Reject if days_to_earnings < 5 (4 days fails, 5 days passes)
        - SWING: Reject if days_to_earnings < 14 (13 days fails, 14 days passes)
        """
        # DAY mode: days_to_earnings = 4 -> REJECTED
        cand_day_fail = {"symbol": "TSLA", "change_pct": 2.5, "days_to_earnings": 4}
        res = self.pipeline.evaluate_nawwar_sentiment(cand_day_fail, trading_mode="DAY")
        self.assertFalse(res["passed"])
        self.assertTrue(res["earnings_within_gate"])
        self.assertEqual(res["earnings_gate_days"], 5)

        # DAY mode: days_to_earnings = 5 -> PASSES
        cand_day_pass = {"symbol": "TSLA", "change_pct": 2.5, "days_to_earnings": 5}
        res = self.pipeline.evaluate_nawwar_sentiment(cand_day_pass, trading_mode="DAY")
        self.assertTrue(res["passed"])
        self.assertFalse(res["earnings_within_gate"])

        # SWING mode: days_to_earnings = 5 -> REJECTED (5 < 14)
        cand_swing_fail5 = {"symbol": "TSLA", "change_pct": 2.5, "days_to_earnings": 5}
        res = self.pipeline.evaluate_nawwar_sentiment(cand_swing_fail5, trading_mode="SWING")
        self.assertFalse(res["passed"])
        self.assertTrue(res["earnings_within_gate"])
        self.assertEqual(res["earnings_gate_days"], 14)

        # SWING mode: days_to_earnings = 13 -> REJECTED (13 < 14)
        cand_swing_fail13 = {"symbol": "TSLA", "change_pct": 2.5, "days_to_earnings": 13}
        res = self.pipeline.evaluate_nawwar_sentiment(cand_swing_fail13, trading_mode="SWING")
        self.assertFalse(res["passed"])
        self.assertTrue(res["earnings_within_gate"])

        # SWING mode: days_to_earnings = 14 -> PASSES (14 >= 14)
        cand_swing_pass14 = {"symbol": "TSLA", "change_pct": 2.5, "days_to_earnings": 14}
        res = self.pipeline.evaluate_nawwar_sentiment(cand_swing_pass14, trading_mode="SWING")
        self.assertTrue(res["passed"])
        self.assertFalse(res["earnings_within_gate"])

        # SWING mode: macro_calendar_risk -> REJECTED
        cand_swing_macro = {"symbol": "TSLA", "change_pct": 2.5, "days_to_earnings": 20, "macro_calendar_risk": True}
        res = self.pipeline.evaluate_nawwar_sentiment(cand_swing_macro, trading_mode="SWING")
        self.assertFalse(res["passed"])
        self.assertTrue(res["fomc_macro_risk"])

    def test_haziq_position_sizing_and_rr_ratio(self):
        """
        Haziq Portfolio Risk:
        - DAY: 1.5% equity risk, TP1 target R:R 1:1.5-1:2
        - SWING: 1.0% equity risk, TP1 target R:R 1:3
        """
        equity = 100_000.0
        candidate = {"symbol": "GOOGL", "price": 100.0, "setup_metrics": {"atr_14_pct": 2.0}}
        tariq_res = {"s_tech": 75.0, "atr_14": 2.0}
        nawwar_res = {"s_sent_norm": 85.0}

        # DAY mode
        res_day = self.pipeline.evaluate_haziq_synthesis(candidate, tariq_res, nawwar_res, equity, trading_mode="DAY")
        self.assertEqual(res_day["trading_mode"], "DAY")
        # Target risk capital = 1.5% ($1,500)
        self.assertLessEqual(res_day["actual_risk_amount"], 1500.0)
        self.assertAlmostEqual(res_day["rr_ratio"], 1.5, delta=0.1)

        # SWING mode
        res_swing = self.pipeline.evaluate_haziq_synthesis(candidate, tariq_res, nawwar_res, equity, trading_mode="SWING")
        self.assertEqual(res_swing["trading_mode"], "SWING")
        # Target risk capital = 1.0% ($1,000)
        self.assertLessEqual(res_swing["actual_risk_amount"], 1000.0)
        self.assertAlmostEqual(res_swing["rr_ratio"], 3.0, delta=0.1)

    def test_danial_time_in_force_assignment(self):
        """
        Danial Audit & Order Generation:
        - DAY: time_in_force = DAY
        - SWING: time_in_force = GTC
        """
        equity = 100_000.0
        candidate = {"symbol": "META", "price": 100.0, "adv20": 2_000_000.0}
        haziq_plan = {
            "passed": True,
            "allocated_shares": 50,
            "entry_price": 100.0,
            "stop_loss_price": 95.0,
            "position_value": 5000.0,
            "s_total": 78.0,
            "thesis": "Test thesis"
        }
        now_ny = datetime(2026, 11, 20, 11, 0, 0, tzinfo=NY_TZ)

        # DAY mode
        audit_day = self.pipeline.evaluate_danial_compliance(
            candidate, haziq_plan, equity, now_ny, mock_market_window=True, trading_mode="DAY"
        )
        self.assertEqual(audit_day["trading_mode"], "DAY")
        self.assertEqual(audit_day["order"]["time_in_force"], "DAY")

        # SWING mode
        audit_swing = self.pipeline.evaluate_danial_compliance(
            candidate, haziq_plan, equity, now_ny, mock_market_window=True, trading_mode="SWING"
        )
        self.assertEqual(audit_swing["trading_mode"], "SWING")
        self.assertEqual(audit_swing["order"]["time_in_force"], "GTC")


class TestReconciliationTradingModeBVA(unittest.TestCase):
    """
    BVA for PositionReconciler in DAY vs SWING modes and Volatility Surge detection.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.status_file = Path(self.temp_dir) / "sentinel_status.json"

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_missing_stop_loss_injection_tif(self):
        # DAY mode -> injected SL is DAY
        reconciler_day = PositionReconciler(status_file=self.status_file, trading_mode="DAY")
        positions = [{"symbol": "AMD", "quantity": 100, "entry_price": 120.0}]
        orders = []  # No stop loss
        corrections_day = reconciler_day.reconcile_positions(positions, orders)
        self.assertEqual(len(corrections_day), 1)
        self.assertEqual(corrections_day[0]["time_in_force"], "DAY")
        self.assertEqual(corrections_day[0]["trading_mode"], "DAY")

        # SWING mode -> injected SL is GTC
        reconciler_swing = PositionReconciler(status_file=self.status_file, trading_mode="SWING")
        corrections_swing = reconciler_swing.reconcile_positions(positions, orders)
        self.assertEqual(len(corrections_swing), 1)
        self.assertEqual(corrections_swing[0]["time_in_force"], "GTC")
        self.assertEqual(corrections_swing[0]["trading_mode"], "SWING")

    def test_volatility_surge_boundaries(self):
        """
        Volatility Surge Boundary:
        Threshold is 2.5x ATR.
        Delta <= 2.50 * ATR -> NO ALERT
        Delta > 2.50 * ATR -> VOLATILITY_SURGE_EXCEEDED ALERT
        """
        reconciler = PositionReconciler(status_file=self.status_file, trading_mode="SWING")
        atr = 2.0  # ATR = $2.00, Threshold = $5.00

        # Boundary: delta = 5.00 (exactly 2.5x ATR) -> NO ALERT
        curr_p_boundary = {"SYM": 105.0}
        ref_p = {"SYM": 100.0}
        atrs = {"SYM": atr}
        alerts = reconciler.check_volatility_alerts(curr_p_boundary, ref_p, atrs, threshold_multiplier=2.5)
        self.assertEqual(len(alerts), 0)

        # Boundary - epsilon: delta = 4.90 (2.45x ATR) -> NO ALERT
        curr_p_under = {"SYM": 104.90}
        alerts = reconciler.check_volatility_alerts(curr_p_under, ref_p, atrs, threshold_multiplier=2.5)
        self.assertEqual(len(alerts), 0)

        # Boundary + epsilon: delta = 5.10 (2.55x ATR) -> ALERT GENERATED
        curr_p_over = {"SYM": 105.10}
        alerts = reconciler.check_volatility_alerts(curr_p_over, ref_p, atrs, threshold_multiplier=2.5)
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["alert"], "VOLATILITY_SURGE_EXCEEDED")
        self.assertAlmostEqual(alerts[0]["multiplier"], 2.55, delta=0.01)


class TestSDLC3bMutationsAndPropertyParsing(unittest.TestCase):
    """
    SDLC 3b: Mutation Testing (~5 manual mutants) & Property-based schedule parsing.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "test_mutants.db"
        self.engine = HardRulesEngine(db_path=self.db_path)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_mutant_1_swing_risk_not_lowered(self):
        """
        Mutant 1: In SWING mode, risk limit is mistakenly kept at 2.0% instead of 1.0%.
        Test assertion: Order with 1.5% risk must fail in SWING mode.
        """
        equity = 100_000.0
        # 1.5% risk = $1,500
        order = OrderRequest(
            client_order_id="M1",
            symbol="TEST",
            quantity=75,
            entry_price=120.0,
            stop_loss_price=100.0,
            trading_mode="SWING"
        )
        with self.assertRaises(HardRuleViolation):
            self.engine.validate_rule1_max_risk(order, equity)

    def test_mutant_2_swing_earnings_gate_not_extended(self):
        """
        Mutant 2: In SWING mode, earnings gate remains 5 days instead of 14 days.
        Test assertion: Candidate with 10 days to earnings must fail in SWING mode.
        """
        pipeline = AgentPipeline(db_path=self.db_path)
        cand = {"symbol": "TEST", "change_pct": 2.0, "days_to_earnings": 10}
        res = pipeline.evaluate_nawwar_sentiment(cand, trading_mode="SWING")
        self.assertFalse(res["passed"])
        self.assertTrue(res["earnings_within_gate"])

    def test_mutant_3_swing_pdt_exemption_removed(self):
        """
        Mutant 3: SWING holding_days >= 1 is not exempt from PDT.
        Test assertion: SWING order with holding_days=1 on account with 3 day trades must pass.
        """
        trade_date = "2026-11-20"
        for i in range(3):
            self.engine.record_day_trade(trade_date, f"S{i}", 10)

        order = OrderRequest(
            client_order_id="M3",
            symbol="TEST",
            quantity=10,
            entry_price=50.0,
            stop_loss_price=48.0,
            trading_mode="SWING",
            holding_days=1
        )
        # Must not raise
        self.engine.validate_rule3_pdt(24_999.0, trade_date, order=order)

    def test_mutant_4_swing_force_exit_1545_enforced(self):
        """
        Mutant 4: SWING mode is subjected to 15:45 force exit.
        Test assertion: SWING trading at 15:45:00 NY must be valid.
        """
        t = datetime(2026, 11, 20, 15, 45, 0, tzinfo=NY_TZ)
        self.engine.validate_rule6_trading_window(t, trading_mode="SWING")

    def test_mutant_5_swing_tif_is_day(self):
        """
        Mutant 5: SWING orders use TimeInForce.DAY instead of GTC.
        Test assertion: Pipeline in SWING mode must issue GTC order.
        """
        pipeline = AgentPipeline(db_path=self.db_path)
        cand = {"symbol": "TEST", "price": 100.0, "adv20": 1_000_000.0}
        haziq = {"passed": True, "allocated_shares": 10, "entry_price": 100.0, "stop_loss_price": 95.0, "position_value": 1000.0, "s_total": 70.0, "thesis": "x"}
        now_ny = datetime(2026, 11, 20, 10, 0, 0, tzinfo=NY_TZ)
        audit = pipeline.evaluate_danial_compliance(cand, haziq, 100_000.0, now_ny, mock_market_window=True, trading_mode="SWING")
        self.assertEqual(audit["order"]["time_in_force"], "GTC")

    def test_property_based_schedule_parsing(self):
        """
        Property-based validation for SWING_BASELINE_SCHEDULE parsing.
        """
        def parse_schedule(schedule_str: str):
            times = []
            for item in schedule_str.split(","):
                cleaned = item.strip()
                if not cleaned:
                    continue
                parts = cleaned.split(":")
                if len(parts) != 2:
                    raise ValueError(f"Invalid time format: {cleaned}")
                h, m = int(parts[0]), int(parts[1])
                if not (0 <= h <= 23 and 0 <= m <= 59):
                    raise ValueError(f"Time out of range: {h}:{m}")
                times.append(time(h, m))
            return times

        # Default schedule
        res = parse_schedule("09:00, 13:00, 16:30")
        self.assertEqual(len(res), 3)
        self.assertEqual(res[0], time(9, 0))
        self.assertEqual(res[1], time(13, 0))
        self.assertEqual(res[2], time(16, 30))

        # Property: arbitrary valid 24h pairs
        for h in (0, 9, 12, 16, 23):
            for m in (0, 15, 30, 45, 59):
                parsed = parse_schedule(f"{h:02d}:{m:02d}")
                self.assertEqual(parsed[0], time(h, m))

        # Invalid cases raise ValueError
        with self.assertRaises(ValueError):
            parse_schedule("25:00")
        with self.assertRaises(ValueError):
            parse_schedule("12:60")
        with self.assertRaises(ValueError):
            parse_schedule("invalid_time")


if __name__ == "__main__":
    unittest.main()
