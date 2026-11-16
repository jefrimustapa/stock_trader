import json
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from screener.src.config import ScreenerConfig
from screener.src.quota_tracker import QuotaTracker
from screener.src.cloud_screener import CloudScreener
from screener.src.schemas import FunnelStageMetrics, WatchlistStock
from screener.src.main import (
    get_us_exchange_mapping,
    clear_exchange_cache,
    fetch_market_universe,
    FetchMarketUniverseResult
)


class TestScreenerOTCFilterBVA(unittest.TestCase):
    """
    HOM-271: BVA, Branch Coverage, and Mutation Testing for OTC Stock Filtering (L0 Screener).
    Ensures NYSE, NASDAQ, and AMEX stocks pass, while OTC (e.g. US_PINK, OTCBB, None) are strictly rejected.
    """

    def setUp(self):
        clear_exchange_cache()
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "quota_tracker.sqlite"
        self.output_file = Path(self.temp_dir) / "watchlist.json"
        self.tracker = QuotaTracker(self.db_path, max_30d_symbols=100)
        self.screener = CloudScreener(self.tracker, self.output_file)

    def tearDown(self):
        clear_exchange_cache()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    # -------------------------------------------------------------------------
    # 1. BVA & Branch Coverage: Allowed vs Disallowed Exchanges
    # -------------------------------------------------------------------------
    def test_bva_allowed_exchanges_accepted_in_stage0(self):
        """NYSE, NASDAQ, and AMEX must be accepted in Stage 0 quality gate."""
        stocks = [
            {"symbol": "US.NYSE_STOCK", "price": 50.0, "market_cap": 5e9, "adv_20": 2e6, "dist_52w": -0.05, "exchange": "US_NYSE"},
            {"symbol": "US.NASDAQ_STOCK", "price": 100.0, "market_cap": 10e9, "adv_20": 3e6, "dist_52w": -0.02, "exchange": "US_NASDAQ"},
            {"symbol": "US.AMEX_STOCK", "price": 25.0, "market_cap": 1e9, "adv_20": 1.5e6, "dist_52w": -0.10, "exchange": "US_AMEX"},
        ]
        funnel = FunnelStageMetrics()
        passed = self.screener.filter_stage0_quality(stocks, funnel=funnel)

        passed_symbols = [s["symbol"] for s in passed]
        self.assertIn("US.NYSE_STOCK", passed_symbols)
        self.assertIn("US.NASDAQ_STOCK", passed_symbols)
        self.assertIn("US.AMEX_STOCK", passed_symbols)
        self.assertEqual(len(passed), 3)
        self.assertEqual(funnel.otc_filtered_count, 0)
        self.assertEqual(len(funnel.dropped_reasons), 0)

        # Verify exchange field preserved
        for item in passed:
            self.assertIn("exchange", item)
            self.assertIn(item["exchange"], ScreenerConfig.ALLOWED_EXCHANGES)

    def test_bva_otc_and_disallowed_exchanges_rejected_in_stage0(self):
        """US_PINK, OTCBB, GREY, UNKNOWN, empty, and arbitrary OTC exchanges must be dropped with audit reason."""
        disallowed_cases = [
            ("US.PINK_STK", "US_PINK"),
            ("US.OTCBB_STK", "OTCBB"),
            ("US.GREY_STK", "GREY_MARKET"),
            ("US.UNK_STK", "UNKNOWN"),
            ("US.NA_STK", "N/A"),
            ("US.EMPTY_STK", ""),
            ("US.OTHER_STK", "FRA"),  # Frankfurt / non-US main
        ]
        stocks = [
            {
                "symbol": sym,
                "price": 50.0,
                "market_cap": 5e9,
                "adv_20": 2e6,
                "dist_52w": -0.05,
                "exchange": exch
            }
            for sym, exch in disallowed_cases
        ]
        funnel = FunnelStageMetrics()
        passed = self.screener.filter_stage0_quality(stocks, funnel=funnel)

        self.assertEqual(len(passed), 0, "All OTC and unapproved exchanges must be filtered out")
        self.assertEqual(funnel.otc_filtered_count, len(disallowed_cases))
        self.assertEqual(len(funnel.dropped_reasons), len(disallowed_cases))

        for dr in funnel.dropped_reasons:
            self.assertEqual(dr["reason"], "OTC_EXCHANGE_REJECTED")
            self.assertEqual(dr["stage"], "STAGE0_QUALITY")

    # -------------------------------------------------------------------------
    # 2. In-Memory Exchange Cache & TTL & Fail-Closed Mode
    # -------------------------------------------------------------------------
    def test_exchange_cache_ttl_and_refresh(self):
        """Exchange mapping should use in-memory cache until TTL expires or force_refresh is requested."""
        import pandas as pd

        mock_df = pd.DataFrame([
            {"code": "AAPL", "exchange_type": "US_NASDAQ"},
            {"code": "NVDA", "exchange_type": "US_NASDAQ"},
            {"code": "GE", "exchange_type": "US_NYSE"},
            {"code": "DFKUY", "exchange_type": "US_PINK"},
        ])
        mock_ctx = MagicMock()
        mock_ctx.get_stock_basicinfo.return_value = (0, mock_df)

        # 1st call: populates cache
        mapping1 = get_us_exchange_mapping(mock_ctx)
        self.assertEqual(len(mapping1), 8)  # with and without US. prefix
        self.assertEqual(mapping1["US.AAPL"], "US_NASDAQ")
        self.assertEqual(mapping1["AAPL"], "US_NASDAQ")
        self.assertEqual(mapping1["US.DFKUY"], "US_PINK")
        self.assertEqual(mock_ctx.get_stock_basicinfo.call_count, 1)

        # 2nd call within TTL: should hit cache without calling API again
        mapping2 = get_us_exchange_mapping(mock_ctx)
        self.assertEqual(mock_ctx.get_stock_basicinfo.call_count, 1)
        self.assertIs(mapping1, mapping2)

        # 3rd call with force_refresh: calls API again
        mapping3 = get_us_exchange_mapping(mock_ctx, force_refresh=True)
        self.assertEqual(mock_ctx.get_stock_basicinfo.call_count, 2)

    def test_exchange_mapping_fail_closed_on_opend_error(self):
        """When OpenD returns error and cache is empty, returns empty mapping without crashing."""
        mock_ctx = MagicMock()
        mock_ctx.get_stock_basicinfo.return_value = (-1, "OpenD error")

        mapping = get_us_exchange_mapping(mock_ctx)
        self.assertEqual(mapping, {})

    # -------------------------------------------------------------------------
    # 3. Early OTC Filtering in fetch_market_universe
    # -------------------------------------------------------------------------
    def test_fetch_market_universe_early_otc_filtering(self):
        """fetch_market_universe must filter out OTC stocks before returning raw_stocks."""
        import pandas as pd

        basic_df = pd.DataFrame([
            {"code": "AAPL", "exchange_type": "US_NASDAQ"},
            {"code": "JNJ", "exchange_type": "US_NYSE"},
            {"code": "SPY", "exchange_type": "US_AMEX"},
            {"code": "BMPSY", "exchange_type": "US_PINK"},
            {"code": "DFKUY", "exchange_type": "US_PINK"},
        ])

        screen_df = pd.DataFrame([
            {"code": "AAPL", "name": "Apple Inc", "cur_price": 180.0, "market_val": 2.8e12, "volume": 5e7, "change_rate": 2.5, "volume_ratio": 1.5, "price_to_52w_high": -0.02},
            {"code": "JNJ", "name": "Johnson & Johnson", "cur_price": 160.0, "market_val": 4e11, "volume": 1e7, "change_rate": 1.8, "volume_ratio": 1.4, "price_to_52w_high": -0.05},
            {"code": "SPY", "name": "SPDR S&P 500 ETF", "cur_price": 500.0, "market_val": 5e11, "volume": 8e7, "change_rate": 0.5, "volume_ratio": 1.2, "price_to_52w_high": -0.01},
            {"code": "BMPSY", "name": "Bmps SpA ADR", "cur_price": 15.0, "market_val": 2e9, "volume": 2e6, "change_rate": 3.0, "volume_ratio": 1.8, "price_to_52w_high": -0.03},
            {"code": "DFKUY", "name": "Dufry AG ADR", "cur_price": 12.0, "market_val": 1.5e9, "volume": 1.5e6, "change_rate": 2.0, "volume_ratio": 1.6, "price_to_52w_high": -0.04},
        ])

        with patch("screener.src.main.OpenQuoteContext") as mock_ctx_cls, \
             patch("screener.src.main.ContextStatus") as mock_status:
            mock_status.READY = 1
            mock_ctx = MagicMock()
            mock_ctx._status = 1
            mock_ctx_cls.return_value = mock_ctx

            # Mock get_market_snapshot for SPY
            spy_df = pd.DataFrame([{"change_rate": 0.5, "last_price": 500.0, "prev_close_price": 497.5}])
            mock_ctx.get_market_snapshot.return_value = (0, spy_df)

            # Mock get_stock_basicinfo and get_stock_screen
            mock_ctx.get_stock_basicinfo.return_value = (0, basic_df)
            mock_ctx.get_stock_screen.return_value = (0, screen_df)

            res = fetch_market_universe("127.0.0.1", 11111)
            stocks, spy_pct, source, warning, skipped = res

            # Verify 5-tuple unpacking backward compatibility
            self.assertEqual(len(res), 5)
            self.assertEqual(source, "REAL")
            self.assertIsNone(warning)

            # Verify attribute otc_filtered_count
            self.assertTrue(hasattr(res, "otc_filtered_count"))
            self.assertEqual(res.otc_filtered_count, 2, "2 OTC stocks (BMPSY, DFKUY) must be filtered out")

            # Verify stocks returned
            returned_symbols = [s["symbol"] for s in stocks]
            self.assertEqual(len(returned_symbols), 3)
            self.assertIn("US.AAPL", returned_symbols)
            self.assertIn("US.JNJ", returned_symbols)
            self.assertIn("US.SPY", returned_symbols)
            self.assertNotIn("US.BMPSY", returned_symbols)
            self.assertNotIn("US.DFKUY", returned_symbols)

    # -------------------------------------------------------------------------
    # 4. End-to-End Pipeline & Output Schema Integrity
    # -------------------------------------------------------------------------
    def test_pipeline_funnel_and_output_schema_preserves_exchange(self):
        """process_and_save must write exchange to WatchlistStock and report otc_filtered_count in funnel."""
        raw_stocks = [
            {
                "symbol": "US.NVDA",
                "name": "NVIDIA Corp",
                "price": 120.0,
                "market_cap": 3e12,
                "adv_20": 5e7,
                "change_pct": 3.5,
                "rvol_15m": 2.0,
                "dist_52w": -0.02,
                "exchange": "US_NASDAQ"
            }
        ]
        output = self.screener.process_and_save(
            raw_stocks=raw_stocks,
            spy_change_pct=1.0,
            source="REAL",
            otc_filtered_count=5
        )

        self.assertEqual(output.funnel.otc_filtered_count, 5)
        self.assertEqual(output.funnel.cloud_raw_returned, 6)  # 1 raw + 5 otc_filtered
        self.assertEqual(len(output.watchlist), 1)

        stock = output.watchlist[0]
        self.assertEqual(stock.symbol, "US.NVDA")
        self.assertEqual(stock.exchange, "US_NASDAQ")

        # Verify disk persistence in watchlist.json
        with open(self.output_file, "r") as f:
            data = json.load(f)
        self.assertEqual(data["funnel"]["otc_filtered_count"], 5)
        self.assertEqual(data["watchlist"][0]["exchange"], "US_NASDAQ")

    # -------------------------------------------------------------------------
    # 5. Mutation Testing (5 Manual Mutants)
    # -------------------------------------------------------------------------
    def test_mutation_1_allowing_pink_in_allowed_exchanges_caught(self):
        """Mutant 1: If ALLOWED_EXCHANGES accidentally includes US_PINK, must fail assertion."""
        current_allowed = ScreenerConfig.ALLOWED_EXCHANGES
        self.assertNotIn("US_PINK", current_allowed, "Mutant 1 caught: US_PINK must not be in ALLOWED_EXCHANGES")
        self.assertNotIn("OTCBB", current_allowed, "Mutant 1 caught: OTCBB must not be in ALLOWED_EXCHANGES")

    def test_mutation_2_stage0_quality_without_exchange_check_caught(self):
        """Mutant 2: If Stage 0 forgets to check exchange, OTC stock passes through. Test catches it."""
        stock = [{"symbol": "US.PINK", "price": 50.0, "market_cap": 5e9, "adv_20": 2e6, "dist_52w": -0.05, "exchange": "US_PINK"}]
        funnel = FunnelStageMetrics()
        passed = self.screener.filter_stage0_quality(stock, funnel=funnel)
        self.assertEqual(len(passed), 0, "Mutant 2 caught: US_PINK was not dropped by Stage 0 quality gate")
        self.assertEqual(funnel.otc_filtered_count, 1)

    def test_mutation_3_early_filter_missing_symbol_lookup_caught(self):
        """Mutant 3: Symbol missing from exchange mapping must not bypass filter (fail-closed)."""
        stock = [{"symbol": "US.UNKNOWN_STK", "price": 50.0, "market_cap": 5e9, "adv_20": 2e6, "dist_52w": -0.05, "exchange": None}]
        # When exchange is explicitly invalid (e.g. "UNKNOWN")
        stock_unk = [{"symbol": "US.UNKNOWN_STK", "price": 50.0, "market_cap": 5e9, "adv_20": 2e6, "dist_52w": -0.05, "exchange": "UNKNOWN"}]
        funnel = FunnelStageMetrics()
        passed = self.screener.filter_stage0_quality(stock_unk, funnel=funnel)
        self.assertEqual(len(passed), 0, "Mutant 3 caught: UNKNOWN exchange must be dropped")

    def test_mutation_4_otc_filtered_count_integrity_caught(self):
        """Mutant 4: funnel.otc_filtered_count must exactly match the number of dropped OTC stocks."""
        stocks = [
            {"symbol": "US.P1", "price": 50.0, "market_cap": 5e9, "adv_20": 2e6, "dist_52w": -0.05, "exchange": "US_PINK"},
            {"symbol": "US.P2", "price": 50.0, "market_cap": 5e9, "adv_20": 2e6, "dist_52w": -0.05, "exchange": "US_PINK"},
            {"symbol": "US.N1", "price": 50.0, "market_cap": 5e9, "adv_20": 2e6, "dist_52w": -0.05, "exchange": "US_NASDAQ"},
        ]
        funnel = FunnelStageMetrics()
        passed = self.screener.filter_stage0_quality(stocks, funnel=funnel)
        self.assertEqual(len(passed), 1, "Only US_NASDAQ should pass")
        self.assertEqual(funnel.otc_filtered_count, 2, "Mutant 4 caught: otc_filtered_count must be 2")

    def test_mutation_5_empty_cache_returns_fail_closed_empty_dict(self):
        """Mutant 5: When context fails, cache must not synthesize mock/fallback data."""
        clear_exchange_cache()
        mock_ctx = MagicMock()
        mock_ctx.get_stock_basicinfo.side_effect = Exception("OpenD connection lost")

        mapping = get_us_exchange_mapping(mock_ctx)
        self.assertEqual(mapping, {}, "Mutant 5 caught: get_us_exchange_mapping must fail-closed")


if __name__ == "__main__":
    unittest.main()
