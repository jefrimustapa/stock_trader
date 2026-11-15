import json
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from screener.src.config import ScreenerConfig
from screener.src.quota_tracker import QuotaTracker
from screener.src.cloud_screener import CloudScreener
from screener.src.schemas import WatchlistOutput, LaneEnum, SetupMetrics
from screener.src.main import determine_market_status


class TestTwoLaneBVA(unittest.TestCase):
    """
    Comprehensive Boundary Value Analysis (BVA), Branch Coverage,
    and Mutation Testing for Two-Lane Screening (HOM-178).
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "quota_tracker.sqlite"
        self.output_file = Path(self.temp_dir) / "watchlist.json"
        self.tracker = QuotaTracker(self.db_path, max_30d_symbols=100)
        self.screener = CloudScreener(self.tracker, self.output_file)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # ---------------------------------------------------------
    # Stage 0: Baseline Quality Cutoffs (BVA)
    # ---------------------------------------------------------
    def test_bva_price_cutoffs(self):
        stocks = [
            {"symbol": "US.P499", "price": 4.99, "market_cap": 2e9, "adv_20": 2e6, "dist_52w": -0.05, "change_pct": 2.0},
            {"symbol": "US.P500", "price": 5.00, "market_cap": 2e9, "adv_20": 2e6, "dist_52w": -0.05, "change_pct": 2.0},
            {"symbol": "US.P1000", "price": 10.00, "market_cap": 2e9, "adv_20": 2e6, "dist_52w": -0.05, "change_pct": 2.0},
        ]
        passed = self.screener.filter_stage0_quality(stocks)
        passed_syms = [s["symbol"] for s in passed]
        self.assertNotIn("US.P499", passed_syms, "Price 4.99 must be rejected (hard cutoff >= 5.0)")
        self.assertIn("US.P500", passed_syms, "Price 5.00 must be accepted")
        self.assertIn("US.P1000", passed_syms, "Price 10.00 must be accepted")

    def test_bva_market_cap_cutoffs(self):
        stocks = [
            {"symbol": "US.C499M", "price": 20.0, "market_cap": 499_999_999, "adv_20": 2e6, "dist_52w": -0.05, "change_pct": 2.0},
            {"symbol": "US.C500M", "price": 20.0, "market_cap": 500_000_000, "adv_20": 2e6, "dist_52w": -0.05, "change_pct": 2.0},
            {"symbol": "US.C1B", "price": 20.0, "market_cap": 1_000_000_000, "adv_20": 2e6, "dist_52w": -0.05, "change_pct": 2.0},
        ]
        passed = self.screener.filter_stage0_quality(stocks)
        passed_syms = [s["symbol"] for s in passed]
        self.assertNotIn("US.C499M", passed_syms, "Market Cap 499,999,999 must be rejected (hard cutoff >= 500M)")
        self.assertIn("US.C500M", passed_syms, "Market Cap 500,000,000 must be accepted")
        self.assertIn("US.C1B", passed_syms, "Market Cap 1B must be accepted")

    def test_bva_adv20_cutoffs(self):
        stocks = [
            {"symbol": "US.ADV999K", "price": 20.0, "market_cap": 2e9, "adv_20": 999_999, "dist_52w": -0.05, "change_pct": 2.0},
            {"symbol": "US.ADV1M", "price": 20.0, "market_cap": 2e9, "adv_20": 1_000_000, "dist_52w": -0.05, "change_pct": 2.0},
            {"symbol": "US.ADV1001K", "price": 20.0, "market_cap": 2e9, "adv_20": 1_000_001, "dist_52w": -0.05, "change_pct": 2.0},
        ]
        passed = self.screener.filter_stage0_quality(stocks)
        passed_syms = [s["symbol"] for s in passed]
        self.assertNotIn("US.ADV999K", passed_syms, "ADV20 999,999 must be rejected")
        self.assertIn("US.ADV1M", passed_syms, "ADV20 1,000,000 must be accepted")
        self.assertIn("US.ADV1001K", passed_syms, "ADV20 1,000,001 must be accepted")

    def test_bva_52w_high_proximity_cutoffs(self):
        stocks = [
            {"symbol": "US.FAR", "price": 20.0, "market_cap": 2e9, "adv_20": 2e6, "dist_52w": -0.251, "change_pct": 2.0},
            {"symbol": "US.AT25", "price": 20.0, "market_cap": 2e9, "adv_20": 2e6, "dist_52w": -0.250, "change_pct": 2.0},
            {"symbol": "US.NEAR", "price": 20.0, "market_cap": 2e9, "adv_20": 2e6, "dist_52w": -0.050, "change_pct": 2.0},
        ]
        passed = self.screener.filter_stage0_quality(stocks)
        passed_syms = [s["symbol"] for s in passed]
        self.assertNotIn("US.FAR", passed_syms, "dist_52w -0.251 must be rejected")
        self.assertIn("US.AT25", passed_syms, "dist_52w -0.250 must be accepted")
        self.assertIn("US.NEAR", passed_syms, "dist_52w -0.050 must be accepted")

    # ---------------------------------------------------------
    # Stage 2a: Momentum Lane BVA
    # ---------------------------------------------------------
    def test_bva_momentum_change_pct(self):
        stocks = [
            {"symbol": "US.M149", "change_pct": 1.49, "rvol_15m": 1.5, "rs_spy": 1.0, "dist_52w": -0.02},
            {"symbol": "US.M150", "change_pct": 1.50, "rvol_15m": 1.5, "rs_spy": 1.0, "dist_52w": -0.02},
            {"symbol": "US.M1500", "change_pct": 15.00, "rvol_15m": 1.5, "rs_spy": 1.0, "dist_52w": -0.02},
            {"symbol": "US.M1501", "change_pct": 15.01, "rvol_15m": 1.5, "rs_spy": 1.0, "dist_52w": -0.02},
        ]
        candidates = self.screener.evaluate_momentum_lane(stocks)
        cand_syms = [s["symbol"] for s in candidates]
        self.assertNotIn("US.M149", cand_syms, "Change 1.49% must not qualify for momentum")
        self.assertIn("US.M150", cand_syms, "Change 1.50% must qualify for momentum")
        self.assertIn("US.M1500", cand_syms, "Change 15.00% must qualify for momentum")
        self.assertNotIn("US.M1501", cand_syms, "Change 15.01% exceeds maximum momentum cap")

    def test_bva_momentum_rvol(self):
        stocks = [
            {"symbol": "US.RV129", "change_pct": 3.0, "rvol_15m": 1.29, "rs_spy": 1.0, "dist_52w": -0.02},
            {"symbol": "US.RV130", "change_pct": 3.0, "rvol_15m": 1.30, "rs_spy": 1.0, "dist_52w": -0.02},
            {"symbol": "US.RV131", "change_pct": 3.0, "rvol_15m": 1.31, "rs_spy": 1.0, "dist_52w": -0.02},
        ]
        candidates = self.screener.evaluate_momentum_lane(stocks)
        cand_syms = [s["symbol"] for s in candidates]
        self.assertNotIn("US.RV129", cand_syms, "RVOL 1.29 must be rejected for momentum")
        self.assertIn("US.RV130", cand_syms, "RVOL 1.30 must be accepted for momentum")
        self.assertIn("US.RV131", cand_syms, "RVOL 1.31 must be accepted for momentum")

    def test_bva_momentum_rs_spy(self):
        stocks = [
            {"symbol": "US.RS0", "change_pct": 3.0, "rvol_15m": 1.5, "rs_spy": 0.00, "dist_52w": -0.02},
            {"symbol": "US.RS001", "change_pct": 3.0, "rvol_15m": 1.5, "rs_spy": 0.01, "dist_52w": -0.02},
        ]
        candidates = self.screener.evaluate_momentum_lane(stocks)
        cand_syms = [s["symbol"] for s in candidates]
        self.assertNotIn("US.RS0", cand_syms, "RS 0.00 must be rejected (must be > 0.0)")
        self.assertIn("US.RS001", cand_syms, "RS 0.01 must be accepted")

    # ---------------------------------------------------------
    # Stage 2b: Setup Lane BVA
    # ---------------------------------------------------------
    def test_bva_setup_change_pct(self):
        spy_change = 0.0
        stocks = [
            {"symbol": "US.S_NEG151", "change_pct": -1.51, "rvol_15m": 0.8, "dist_52w": -0.03},
            {"symbol": "US.S_NEG150", "change_pct": -1.50, "rvol_15m": 0.8, "dist_52w": -0.03},
            {"symbol": "US.S_POS150", "change_pct": 1.50, "rvol_15m": 0.8, "dist_52w": -0.03},
            {"symbol": "US.S_POS151", "change_pct": 1.51, "rvol_15m": 0.8, "dist_52w": -0.03},
        ]
        candidates = self.screener.evaluate_setup_lane(stocks, spy_change)
        cand_syms = [s["symbol"] for s in candidates]
        self.assertNotIn("US.S_NEG151", cand_syms, "-1.51% must be rejected for setup")
        self.assertIn("US.S_NEG150", cand_syms, "-1.50% must be accepted for setup")
        self.assertIn("US.S_POS150", cand_syms, "+1.50% must be accepted for setup")
        self.assertNotIn("US.S_POS151", cand_syms, "+1.51% must be rejected for setup")

    def test_bva_setup_52w_dist(self):
        spy_change = 0.0
        stocks = [
            {"symbol": "US.DIST_101", "change_pct": 0.2, "rvol_15m": 0.7, "dist_52w": -0.101},
            {"symbol": "US.DIST_100", "change_pct": 0.2, "rvol_15m": 0.7, "dist_52w": -0.100},
            {"symbol": "US.DIST_000", "change_pct": 0.2, "rvol_15m": 0.7, "dist_52w": 0.000},
        ]
        candidates = self.screener.evaluate_setup_lane(stocks, spy_change)
        cand_syms = [s["symbol"] for s in candidates]
        self.assertNotIn("US.DIST_101", cand_syms, "dist_52w -0.101 must be rejected for setup")
        self.assertIn("US.DIST_100", cand_syms, "dist_52w -0.100 must be accepted for setup")
        self.assertIn("US.DIST_000", cand_syms, "dist_52w 0.000 must be accepted for setup")

    def test_bva_setup_rvol_dryup(self):
        spy_change = 0.0
        stocks = [
            {"symbol": "US.VOL_110", "change_pct": 0.1, "rvol_15m": 1.10, "dist_52w": -0.02},
            {"symbol": "US.VOL_111", "change_pct": 0.1, "rvol_15m": 1.11, "dist_52w": -0.02},
            {"symbol": "US.VOL_065", "change_pct": 0.1, "rvol_15m": 0.65, "dist_52w": -0.02},
        ]
        candidates = self.screener.evaluate_setup_lane(stocks, spy_change)
        cand_syms = [s["symbol"] for s in candidates]
        self.assertIn("US.VOL_110", cand_syms, "RVOL 1.10 must be accepted for dry volume")
        self.assertNotIn("US.VOL_111", cand_syms, "RVOL 1.11 must be rejected for dry volume")
        self.assertIn("US.VOL_065", cand_syms, "RVOL 0.65 must be accepted")

    # ---------------------------------------------------------
    # Stage 3 & Full Pipeline Integration Test
    # ---------------------------------------------------------
    def test_full_pipeline_two_lane_watchlist(self):
        raw = [
            # Qualifies for Momentum (Change +4%, RVOL 2.0, RS +3.0)
            {"symbol": "US.NVDA", "name": "NVIDIA", "price": 140.0, "market_cap": 3e12, "adv_20": 4e7, "dist_52w": -0.03, "change_pct": 4.0, "rvol_15m": 2.0},
            # Qualifies for Setup (Change +0.2%, RVOL 0.6, dist -0.02)
            {"symbol": "US.MSFT", "name": "Microsoft", "price": 420.0, "market_cap": 3e12, "adv_20": 2e7, "dist_52w": -0.02, "change_pct": 0.2, "rvol_15m": 0.6},
            # Dropped at Stage 0 (Cap < 500M)
            {"symbol": "US.LOWCAP", "name": "Low Cap", "price": 20.0, "market_cap": 2e8, "adv_20": 2e6, "dist_52w": -0.02, "change_pct": 4.0, "rvol_15m": 2.0},
        ]
        spy_change = 1.0
        output = self.screener.process_and_save(
            raw_stocks=raw,
            spy_change_pct=spy_change,
            market_status="CLOSED",
            is_live=False,
            cloud_skipped_count=1
        )

        self.assertEqual(output.market_status, "CLOSED")
        self.assertFalse(output.is_live)
        self.assertEqual(output.funnel.cloud_raw_returned, 4)
        self.assertEqual(output.funnel.cloud_skipped_incomplete, 1)
        self.assertEqual(output.funnel.stage0_quality_passed, 2)
        self.assertEqual(output.funnel.lane_momentum_candidates, 1)
        self.assertEqual(output.funnel.lane_setup_candidates, 1)
        self.assertEqual(len(output.watchlist), 2)

        lanes = {s.symbol: s.lane for s in output.watchlist}
        self.assertEqual(lanes["US.NVDA"], LaneEnum.MOMENTUM.value)
        self.assertEqual(lanes["US.MSFT"], LaneEnum.SETUP.value)

        # Verify Setup metrics exist for MSFT
        msft_stock = next(s for s in output.watchlist if s.symbol == "US.MSFT")
        self.assertIsNotNone(msft_stock.setup_metrics)
        self.assertEqual(msft_stock.setup_metrics.dry_volume_ratio, 0.6)

        # Verify JSON file serialization
        self.assertTrue(self.output_file.exists())
        with open(self.output_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        validated = WatchlistOutput.model_validate(data)
        self.assertEqual(len(validated.watchlist), 2)

    # ---------------------------------------------------------
    # Market Status Timezone & NYSE Schedule (BVA)
    # ---------------------------------------------------------
    def test_market_status_schedule_bva(self):
        ny_tz = ZoneInfo("America/New_York")

        # Saturday (Weekend) -> CLOSED
        dt_sat = datetime(2026, 11, 14, 12, 0, 0, tzinfo=ny_tz)
        status, is_live = determine_market_status(dt_sat)
        self.assertEqual(status, "CLOSED")
        self.assertFalse(is_live)

        # Sunday (Weekend) -> CLOSED
        dt_sun = datetime(2026, 11, 15, 12, 0, 0, tzinfo=ny_tz)
        status, is_live = determine_market_status(dt_sun)
        self.assertEqual(status, "CLOSED")
        self.assertFalse(is_live)

        # Monday 09:29:59 (Pre-market boundary) -> PRE_POST
        dt_pre = datetime(2026, 11, 16, 9, 29, 59, tzinfo=ny_tz)
        status, is_live = determine_market_status(dt_pre)
        self.assertEqual(status, "PRE_POST")
        self.assertFalse(is_live)

        # Monday 09:30:00 (Open bell boundary) -> OPEN
        dt_open = datetime(2026, 11, 16, 9, 30, 0, tzinfo=ny_tz)
        status, is_live = determine_market_status(dt_open)
        self.assertEqual(status, "OPEN")
        self.assertTrue(is_live)

        # Monday 15:59:59 (Before close boundary) -> OPEN
        dt_pre_close = datetime(2026, 11, 16, 15, 59, 59, tzinfo=ny_tz)
        status, is_live = determine_market_status(dt_pre_close)
        self.assertEqual(status, "OPEN")
        self.assertTrue(is_live)

        # Monday 16:00:00 (Closing bell boundary) -> PRE_POST
        dt_closed = datetime(2026, 11, 16, 16, 0, 0, tzinfo=ny_tz)
        status, is_live = determine_market_status(dt_closed)
        self.assertEqual(status, "PRE_POST")
        self.assertFalse(is_live)


if __name__ == "__main__":
    unittest.main()
