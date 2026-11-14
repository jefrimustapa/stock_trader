import json
import os
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from screener.src.quota_tracker import QuotaTracker
from screener.src.cloud_screener import CloudScreener
from screener.src.schemas import WatchlistOutput


class TestScreenerSchema(unittest.TestCase):
    """
    Tests Screener multi-stage filtering and watchlist.json schema compliance.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "quota_tracker.sqlite"
        self.output_file = Path(self.temp_dir) / "watchlist.json"
        self.tracker = QuotaTracker(self.db_path, max_30d_symbols=100)
        self.screener = CloudScreener(self.tracker, self.output_file)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_stage1_filters(self):
        raw = [
            {"symbol": "US.VALID", "price": 10.0, "market_cap": 600_000_000, "adv_20": 2_000_000, "change_pct": 3.5},
            {"symbol": "US.LOWP", "price": 4.99, "market_cap": 600_000_000, "adv_20": 2_000_000, "change_pct": 3.5},  # Low price
            {"symbol": "US.LOWCAP", "price": 10.0, "market_cap": 490_000_000, "adv_20": 2_000_000, "change_pct": 3.5},  # Low cap
            {"symbol": "US.LOWADV", "price": 10.0, "market_cap": 600_000_000, "adv_20": 900_000, "change_pct": 3.5},  # Low ADV
            {"symbol": "US.LOWCHG", "price": 10.0, "market_cap": 600_000_000, "adv_20": 2_000_000, "change_pct": 1.9},  # Change < 2%
            {"symbol": "US.HIGHCHG", "price": 10.0, "market_cap": 600_000_000, "adv_20": 2_000_000, "change_pct": 12.5},  # Change > 12%
        ]
        passed = self.screener.filter_stage1(raw)
        self.assertEqual(len(passed), 1)
        self.assertEqual(passed[0]["symbol"], "US.VALID")

    def test_stage2_relative_strength(self):
        stage1 = [
            {"symbol": "US.STRONGER", "change_pct": 5.0},
            {"symbol": "US.WEAKER", "change_pct": 1.5},
        ]
        spy_change = 2.0
        passed = self.screener.filter_stage2(stage1, spy_change)
        self.assertEqual(len(passed), 1)
        self.assertEqual(passed[0]["symbol"], "US.STRONGER")
        self.assertEqual(passed[0]["rs_spy"], 3.0)

    def test_full_pipeline_and_json_schema(self):
        raw = [
            {"symbol": "US.NVDA", "name": "NVIDIA", "price": 140.0, "market_cap": 3e12, "adv_20": 5e7, "change_pct": 4.5, "rvol_15m": 2.2},
            {"symbol": "US.TSLA", "name": "Tesla", "price": 220.0, "market_cap": 7e11, "adv_20": 6e7, "change_pct": 3.5, "rvol_15m": 1.8},
            {"symbol": "US.LOWRVOL", "name": "Low Vol", "price": 50.0, "market_cap": 1e10, "adv_20": 2e6, "change_pct": 3.0, "rvol_15m": 1.2},  # rvol < 1.5
        ]
        spy_change = 1.0

        output = self.screener.process_and_save(raw, spy_change)

        self.assertEqual(output.total_screened_cloud, 3)
        self.assertEqual(output.stage1_passed, 3)
        self.assertEqual(output.stage2_passed, 3)
        self.assertEqual(len(output.watchlist), 2)  # US.LOWRVOL filtered out in stage 3

        # Verify physical JSON file on disk
        self.assertTrue(self.output_file.exists())
        with open(self.output_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Validate against Pydantic schema
        validated = WatchlistOutput.model_validate(data)
        self.assertEqual(len(validated.watchlist), 2)
        self.assertEqual(validated.quota_status.kline_30d_used, 2)
        self.assertEqual(validated.quota_status.kline_30d_remaining, 98)
        self.assertEqual(validated.source, "REAL")
        self.assertIsNone(validated.warning)

    def test_opend_unavailable_produces_empty_watchlist_and_warning(self):
        """
        Kecacatan Terlepas (HOM-162): Bila OpenD belum auth, screener mesti menghasilkan
        watchlist kosong dengan source='OPEND_UNAVAILABLE' dan mesej amaran yang jelas.
        """
        output = self.screener.process_and_save(
            raw_stocks=[{"symbol": "US.MOCK", "price": 10.0}],
            spy_change_pct=0.0,
            source="OPEND_UNAVAILABLE",
            warning="OpenD gateway belum log masuk (menunggu kredensial broker)."
        )
        self.assertEqual(output.source, "OPEND_UNAVAILABLE")
        self.assertIn("belum log masuk", output.warning)
        self.assertEqual(len(output.watchlist), 0)
        self.assertEqual(output.total_screened_cloud, 0)
        self.assertEqual(output.stage1_passed, 0)
        self.assertEqual(output.stage2_passed, 0)

        # Semak pada fail fizikal JSON
        with open(self.output_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["source"], "OPEND_UNAVAILABLE")
        self.assertEqual(data["watchlist"], [])
        self.assertIsNotNone(data["warning"])

    def test_fetch_market_universe_unauthenticated_fails_closed(self):
        """
        Ujian integriti fungsi fetch_market_universe: Bila OpenQuoteContext belum ready/auth,
        ia mesti memulangkan senarai kosong dengan source 'OPEND_UNAVAILABLE', bukan 8 simbol rekaan.
        """
        from unittest.mock import patch, MagicMock
        from screener.src.main import fetch_market_universe

        with patch("screener.src.main.OpenQuoteContext") as mock_ctx_cls:
            mock_ctx = MagicMock()
            mock_ctx._status = 0 # Not ContextStatus.READY
            mock_ctx_cls.return_value = mock_ctx

            stocks, spy_pct, source, warning = fetch_market_universe("127.0.0.1", 11111)
            self.assertEqual(len(stocks), 0, "Tiada simbol fallback rekaan dibenarkan")
            self.assertEqual(source, "OPEND_UNAVAILABLE")
            self.assertIsNotNone(warning)
            self.assertIn("belum log masuk", warning)



if __name__ == "__main__":
    unittest.main()
