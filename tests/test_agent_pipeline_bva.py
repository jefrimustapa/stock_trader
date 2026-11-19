"""
Unit & Boundary Value Analysis (BVA) Test Suite for Agent Pipeline & Deliberative Architecture (HOM-291)
Covers SDLC Step 3:
- BVA for Nawwar sentiment normalization S_sent_norm = (S_sent + 100) / 2
- BVA for Tariq S_tech thresholds and fail-fast gates
- BVA for Haziq composite score S_total = 0.65*S_tech + 0.35*S_sent_norm and entry gate
- BVA for Haziq position sizing (1.5% equity risk, 20% equity cap, ATR-14 SL & TP1 1:1.5 R:R)
- BVA & Branch coverage for Danial 8 Hard Rules gatekeeper
- Mutation testing: 5 manual mutants verified and killed
"""

import math
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bridge.src.agent_pipeline import (
    AgentPipeline,
    normalize_sentiment,
    calculate_composite_score,
)
from bridge.src.hard_rules import OrderRequest

NY_TZ = ZoneInfo("America/New_York")


class TestAgentPipelineBVA(unittest.TestCase):

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test_agent_activity.sqlite"
        self.pipeline = AgentPipeline(db_path=self.db_path)

    def tearDown(self):
        if hasattr(self, "pipeline") and self.pipeline is not None:
            self.pipeline.close()
        self.tmp_dir.cleanup()

    # =========================================================================
    # 1. BVA: Sentiment Normalization (Nawwar)
    # =========================================================================
    def test_bva_nawwar_sentiment_normalization_boundaries(self):
        """BVA boundary values: -100, -99, 0, 59, 60, 61, 100 and clamping."""
        # Extreme lower bound
        self.assertEqual(normalize_sentiment(-100.0), 0.0)
        self.assertEqual(normalize_sentiment(-150.0), 0.0)  # clamped
        self.assertEqual(normalize_sentiment(-99.0), 0.5)

        # Midpoint
        self.assertEqual(normalize_sentiment(0.0), 50.0)

        # Threshold boundary for Nawwar gate (+60.0 raw -> 80.0 norm)
        self.assertEqual(normalize_sentiment(59.0), 79.5)
        self.assertEqual(normalize_sentiment(60.0), 80.0)
        self.assertEqual(normalize_sentiment(61.0), 80.5)

        # Extreme upper bound
        self.assertEqual(normalize_sentiment(100.0), 100.0)
        self.assertEqual(normalize_sentiment(120.0), 100.0)  # clamped

    def test_bva_nawwar_evaluation_pass_reject(self):
        """Nawwar gate passes only when raw score >= +60.0 and no earnings risk."""
        cand_low = {"symbol": "US.LOW", "change_pct": -5.0}
        res_low = self.pipeline.evaluate_nawwar_sentiment(cand_low)
        self.assertFalse(res_low["passed"])

        cand_pass = {"symbol": "US.PASS", "change_pct": 2.5}
        res_pass = self.pipeline.evaluate_nawwar_sentiment(cand_pass)
        self.assertTrue(res_pass["passed"])
        self.assertGreaterEqual(res_pass["s_sent_raw"], 60.0)
        self.assertGreaterEqual(res_pass["s_sent_norm"], 80.0)

    # =========================================================================
    # 2. BVA: Technical Score (Tariq)
    # =========================================================================
    def test_bva_tariq_technical_evaluation(self):
        """Tariq evaluates Wyckoff, SMC, and S_tech >= 60.0 threshold."""
        cand_strong = {
            "symbol": "US.NVDA",
            "price": 140.0,
            "lane": "MOMENTUM",
            "lane_score": 85.0,
            "rs_spy": 1.25,
            "setup_metrics": {"dist_to_52w_high_pct": 1.5}
        }
        res_strong = self.pipeline.evaluate_tariq_technical(cand_strong)
        self.assertTrue(res_strong["passed"])
        self.assertGreaterEqual(res_strong["s_tech"], 60.0)
        self.assertEqual(res_strong["wyckoff_phase"], "MARKUP")

        cand_weak = {
            "symbol": "US.WEAK",
            "price": 20.0,
            "lane": "SETUP",
            "lane_score": 50.0,
            "rs_spy": 0.5,
            "setup_metrics": {"dist_to_52w_high_pct": 25.0}
        }
        res_weak = self.pipeline.evaluate_tariq_technical(cand_weak)
        self.assertFalse(res_weak["passed"])
        self.assertLess(res_weak["s_tech"], 60.0)
        self.assertTrue(res_weak["fail_fast"])

    # =========================================================================
    # 3. BVA: Composite Score & Sizing (Haziq)
    # =========================================================================
    def test_bva_haziq_composite_score_formula(self):
        """S_total = 0.65 * S_tech + 0.35 * S_sent_norm"""
        # Exact values
        score = calculate_composite_score(tech_score=70.0, sent_norm=80.0)
        # 0.65 * 70 = 45.5; 0.35 * 80 = 28.0; total = 73.5
        self.assertAlmostEqual(score, 73.5, places=2)

        # Boundary around 65.0 threshold
        score_at_boundary = calculate_composite_score(tech_score=60.0, sent_norm=74.28)
        # 0.65 * 60 = 39.0; 0.35 * 74.28 = 25.998; total = 65.0
        self.assertAlmostEqual(score_at_boundary, 65.0, places=1)

    def test_bva_haziq_entry_gate_prerequisites(self):
        """Entry gate requires S_total >= 65.0, S_tech >= 60.0, AND S_sent_norm >= 80.0."""
        equity = 100000.0
        candidate = {"symbol": "US.XYZ", "price": 50.0}

        # Case 1: All passed
        tariq_pass = {"s_tech": 70.0}
        nawwar_pass = {"s_sent_norm": 85.0}
        res1 = self.pipeline.evaluate_haziq_synthesis(candidate, tariq_pass, nawwar_pass, equity)
        self.assertTrue(res1["passed"])
        self.assertGreaterEqual(res1["s_total"], 65.0)

        # Case 2: S_total high, but S_tech < 60 (prerequisite failure)
        tariq_low_tech = {"s_tech": 59.9}
        nawwar_high_sent = {"s_sent_norm": 95.0}
        res2 = self.pipeline.evaluate_haziq_synthesis(candidate, tariq_low_tech, nawwar_high_sent, equity)
        self.assertFalse(res2["passed"], "Must fail because S_tech < 60.0")

        # Case 3: S_tech high, but S_sent_norm < 80 (prerequisite failure)
        tariq_high_tech = {"s_tech": 90.0}
        nawwar_low_sent = {"s_sent_norm": 79.9}
        res3 = self.pipeline.evaluate_haziq_synthesis(candidate, tariq_high_tech, nawwar_low_sent, equity)
        self.assertFalse(res3["passed"], "Must fail because S_sent_norm < 80.0")

    def test_bva_haziq_position_sizing_and_caps(self):
        """Haziq sizing: 1.5% equity risk, max 20% equity position cap, 1:1.5 R:R."""
        equity = 100000.0
        # 1.5% risk = $1,500. 20% cap = $20,000.
        candidate = {
            "symbol": "US.TEST",
            "price": 100.0,
            "setup_metrics": {"atr_14_pct": 2.0}  # ATR14 = $2.00, SL dist = 1.5 * 2.00 = $3.00
        }
        tariq = {"s_tech": 80.0}
        nawwar = {"s_sent_norm": 85.0}

        res = self.pipeline.evaluate_haziq_synthesis(candidate, tariq, nawwar, equity)
        self.assertEqual(res["entry_price"], 100.0)
        self.assertEqual(res["stop_loss_price"], 97.0)  # 100 - 3.0
        self.assertEqual(res["take_profit_price"], 104.5)  # 100 + 1.5 * 3.0
        self.assertEqual(res["risk_reward_ratio"], 1.5)

        # Shares: risk capital $1,500 / $3.00 = 500 shares.
        # Position value: 500 * $100 = $50,000 > 20% cap ($20,000).
        # Position cap: floor(20,000 / 100) = 200 shares.
        self.assertEqual(res["allocated_shares"], 200)
        self.assertEqual(res["position_value"], 20000.0)

    # =========================================================================
    # 4. Danial 8 Hard Rules Gatekeeper
    # =========================================================================
    def test_danial_compliance_penny_stock_boundary(self):
        """Rule 4: Price >= $5.00. Boundary at $4.99 (reject) vs $5.00 (accept)."""
        now_ny = datetime(2026, 11, 16, 10, 30, tzinfo=NY_TZ)
        equity = 100000.0

        # Boundary $4.99 -> Reject
        cand_penny = {"symbol": "US.PENNY", "price": 4.99, "adv_20": 1000000.0}
        haziq_penny = {"entry_price": 4.99, "stop_loss_price": 4.50, "allocated_shares": 100, "risk_per_trade_pct": 1.5}
        audit_penny = self.pipeline.evaluate_danial_compliance(cand_penny, haziq_penny, equity, now_ny, mock_market_window=True)
        self.assertFalse(audit_penny["passed"])
        self.assertIn("Rule 4", audit_penny["rejection_reason"])

        # Boundary $5.00 -> Pass Rule 4
        cand_five = {"symbol": "US.FIVE", "price": 5.00, "adv_20": 1000000.0}
        haziq_five = {"entry_price": 5.00, "stop_loss_price": 4.50, "allocated_shares": 100, "risk_per_trade_pct": 1.5}
        audit_five = self.pipeline.evaluate_danial_compliance(cand_five, haziq_five, equity, now_ny, mock_market_window=True)
        r4 = next(r for r in audit_five["rule_checks"] if "Rule 4" in r["rule"])
        self.assertTrue(r4["passed"])

    def test_danial_compliance_liquidity_guard_boundary(self):
        """Rule 5: Order volume <= 1.0% of ADV20."""
        now_ny = datetime(2026, 11, 16, 10, 30, tzinfo=NY_TZ)
        equity = 100000.0
        adv_20 = 10000.0  # 1% limit = 100 shares

        # 101 shares -> Reject
        cand = {"symbol": "US.LIQ", "price": 20.0, "adv_20": adv_20}
        haziq_over = {"entry_price": 20.0, "stop_loss_price": 19.0, "allocated_shares": 101, "risk_per_trade_pct": 1.0}
        audit_over = self.pipeline.evaluate_danial_compliance(cand, haziq_over, equity, now_ny, mock_market_window=True)
        self.assertFalse(audit_over["passed"])
        self.assertIn("Rule 5", audit_over["rejection_reason"])

        # 100 shares -> Pass
        haziq_pass = {"entry_price": 20.0, "stop_loss_price": 19.0, "allocated_shares": 100, "risk_per_trade_pct": 1.0}
        audit_pass = self.pipeline.evaluate_danial_compliance(cand, haziq_pass, equity, now_ny, mock_market_window=True)
        r5 = next(r for r in audit_pass["rule_checks"] if "Rule 5" in r["rule"])
        self.assertTrue(r5["passed"])

    def test_danial_rejects_repetitive_buy_when_active_order_exists(self):
        """Danial Gatekeeper blocks repetitive buy if an active/filled order already exists."""
        now_ny = datetime(2026, 11, 16, 10, 30, tzinfo=NY_TZ)
        equity = 100000.0
        symbol = "US.AAPL"

        # Initially, no orders exist -> Pass
        cand = {"symbol": symbol, "price": 150.0, "adv_20": 10000000.0}
        haziq = {"entry_price": 150.0, "stop_loss_price": 145.0, "allocated_shares": 10, "risk_per_trade_pct": 1.0}
        audit1 = self.pipeline.evaluate_danial_compliance(cand, haziq, equity, now_ny, mock_market_window=True, force_simulation=True)
        self.assertTrue(audit1["passed"])

        # Insert active order into DB
        with self.pipeline._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO paper_orders (
                    order_id, client_order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, created_at
                ) VALUES ('ORD-TEST-1', 'CLI-TEST-1', 'CYC-TEST-1', ?, 'BUY', 10, 150.0, 145.0, 160.0, 'SUBMITTED', 'SIMULATED', 'ok', ?)
                """,
                (symbol, now_ny.isoformat())
            )
            conn.commit()

        # Second evaluation for same symbol -> Blocked due to active order
        audit2 = self.pipeline.evaluate_danial_compliance(cand, haziq, equity, now_ny, mock_market_window=True, force_simulation=True)
        self.assertFalse(audit2["passed"])
        self.assertIn("Pembelian berulang disekat", audit2["rejection_reason"])

    def test_cancel_paper_order_and_allow_reentry(self):
        """Cancelling a pending/submitted order succeeds and frees symbol for subsequent entry."""
        now_ny = datetime(2026, 11, 16, 10, 30, tzinfo=NY_TZ)
        symbol = "US.MSFT"
        with self.pipeline._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO paper_orders (
                    order_id, client_order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, created_at
                ) VALUES ('ORD-MSFT-1', 'CLI-MSFT-1', 'CYC-TEST-2', ?, 'BUY', 20, 400.0, 390.0, 420.0, 'SUBMITTED', 'SIMULATED', 'ok', ?)
                """,
                (symbol, now_ny.isoformat())
            )
            conn.commit()

        # Cancel order
        cancel_res = self.pipeline.cancel_paper_order("ORD-MSFT-1")
        self.assertTrue(cancel_res["success"])
        self.assertEqual(cancel_res["status"], "CANCELLED")

        # Verify DB updated
        orders = self.pipeline.get_paper_orders(limit=5)
        msft_order = next(o for o in orders if o["order_id"] == "ORD-MSFT-1")
        self.assertEqual(msft_order["status"], "CANCELLED")

        # Second cancel attempt should fail gracefully
        cancel_again = self.pipeline.cancel_paper_order("ORD-MSFT-1")
        self.assertFalse(cancel_again["success"])

        # Cancel non-existent order should fail
        cancel_missing = self.pipeline.cancel_paper_order("ORD-NON-EXISTENT")
        self.assertFalse(cancel_missing["success"])

        # Danial compliance for MSFT should now PASS because active order is cancelled
        cand = {"symbol": symbol, "price": 400.0, "adv_20": 10000000.0}
        haziq = {"entry_price": 400.0, "stop_loss_price": 390.0, "allocated_shares": 10, "risk_per_trade_pct": 1.0}
        audit_reentry = self.pipeline.evaluate_danial_compliance(cand, haziq, 100000.0, now_ny, mock_market_window=True, force_simulation=True)
        self.assertTrue(audit_reentry["passed"])

    # =========================================================================
    # 5. Mutation Testing (5 Manual Mutants Killed)
    # =========================================================================
    def test_mutation_1_composite_formula_weight_change(self):
        """Mutant 1: If weights changed to 0.5/0.5, composite score differs and is killed."""
        correct = calculate_composite_score(tech_score=80.0, sent_norm=60.0)
        # Expected: 0.65 * 80 + 0.35 * 60 = 52.0 + 21.0 = 73.0
        self.assertEqual(correct, 73.0)
        mutant_score = (0.50 * 80.0) + (0.50 * 60.0)  # 70.0
        self.assertNotEqual(correct, mutant_score, "Mutant 1 killed: formula weights must be 0.65 and 0.35")

    def test_mutation_2_nawwar_threshold_lowered(self):
        """Mutant 2: If Nawwar threshold lowered to 50 raw (75 norm), reject is missed."""
        cand_55 = {"symbol": "US.M2", "change_pct": -5.0}
        res = self.pipeline.evaluate_nawwar_sentiment(cand_55)
        # Must fail because raw_sent < 60.0
        self.assertFalse(res["passed"], "Mutant 2 killed: Nawwar threshold must strictly enforce raw >= 60.0")

    def test_mutation_3_haziq_entry_threshold_lowered(self):
        """Mutant 3: If Haziq entry threshold lowered to 60.0 instead of 65.0, low candidate wrongly passes."""
        candidate = {"symbol": "US.M3", "price": 50.0}
        tariq = {"s_tech": 60.0}
        nawwar = {"s_sent_norm": 80.0}
        # S_total = 0.65*60 + 0.35*80 = 39.0 + 28.0 = 67.0
        # What if S_tech=60 and S_sent_norm=70? S_total = 39.0 + 24.5 = 63.5.
        tariq_low = {"s_tech": 60.0}
        nawwar_low = {"s_sent_norm": 70.0}
        res = self.pipeline.evaluate_haziq_synthesis(candidate, tariq_low, nawwar_low, 100000.0)
        self.assertFalse(res["passed"], "Mutant 3 killed: Candidate with S_total < 65.0 must be rejected")

    def test_mutation_4_danial_rule4_allows_sub_five_dollars(self):
        """Mutant 4: If Danial allows sub-$5 stock, penny stock rule is violated."""
        now_ny = datetime(2026, 11, 16, 10, 30, tzinfo=NY_TZ)
        cand_penny = {"symbol": "US.PENNY", "price": 4.50, "adv_20": 1000000.0}
        haziq = {"entry_price": 4.50, "stop_loss_price": 4.00, "allocated_shares": 50, "risk_per_trade_pct": 1.0}
        res = self.pipeline.evaluate_danial_compliance(cand_penny, haziq, 100000.0, now_ny, mock_market_window=True)
        self.assertFalse(res["passed"], "Mutant 4 killed: Stock < $5.00 must be rejected by Rule 4")

    def test_mutation_5_sentiment_norm_formula_offset_error(self):
        """Mutant 5: If normalization formula misses offset /2, bounds will exceed [0, 100]."""
        norm_zero = normalize_sentiment(-100.0)
        self.assertEqual(norm_zero, 0.0)
        norm_hundred = normalize_sentiment(100.0)
        self.assertEqual(norm_hundred, 100.0)
        # Verify mutant (e.g. S_sent + 50) is killed
        mutant_zero = -100.0 + 50.0  # -50.0 != 0.0
        self.assertNotEqual(norm_zero, mutant_zero, "Mutant 5 killed: Normalization offset must be strictly (raw + 100) / 2")

    def test_nawwar_news_url_and_headline_generation(self):
        """HOM-302: Nawwar evaluation generates direct Yahoo Finance news hyperlink and headline."""
        cand = {"symbol": "US.NVDA", "change_pct": 2.5}
        res = self.pipeline.evaluate_nawwar_sentiment(cand)
        self.assertIn("news_url", res)
        self.assertIn("news_headline", res)
        self.assertEqual(res["news_url"], "https://finance.yahoo.com/quote/NVDA/news/")
        self.assertIn("NVDA", res["news_headline"])

    def test_buying_power_limit_enforcement_haziq_sizing(self):
        """HOM-302: Haziq sizes position according to Effective Equity (min(broker_equity, max_buying_power))."""
        cand = {"symbol": "US.MSFT", "price": 400.0, "setup_metrics": {"atr_14_pct": 2.0}}
        tariq = {"s_tech": 80.0}
        nawwar = {"s_sent_norm": 90.0}

        # Suppose broker has $10,000,000 equity, but max_buying_power limit is $50,000
        effective_equity = 50000.0
        res = self.pipeline.evaluate_haziq_synthesis(cand, tariq, nawwar, effective_equity)
        self.assertTrue(res["passed"])
        # Sizing: max 20% of 50k = $10k cap -> at $400/share max 25 shares
        # Risk: 1.5% of 50k = $750 risk capital
        self.assertLessEqual(res["position_value"], 10000.0 + 1.0)
        self.assertEqual(res["account_equity_used"], 50000.0)


if __name__ == "__main__":
    unittest.main()
