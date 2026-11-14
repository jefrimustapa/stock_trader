import os
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from screener.src.quota_tracker import QuotaTracker, QuotaExceededError


class TestQuotaTracker(unittest.TestCase):
    """
    Tests Moomoo OpenAPI quota tracking and 100-symbol / 30-day constraint.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "quota_tracker.sqlite"
        self.tracker = QuotaTracker(self.db_path, max_30d_symbols=100)
        self.base_time = datetime(2026, 11, 14, 10, 0, 0, tzinfo=timezone.utc)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_single_symbol_recording(self):
        self.assertTrue(self.tracker.can_request_symbol("US.NVDA", self.base_time))
        self.tracker.record_symbol_request("US.NVDA", self.base_time)
        self.assertEqual(self.tracker.get_active_symbol_count(self.base_time), 1)

    def test_repeated_symbol_does_not_consume_additional_quota(self):
        self.tracker.record_symbol_request("US.NVDA", self.base_time)
        self.tracker.record_symbol_request("US.NVDA", self.base_time + timedelta(days=5))
        self.assertEqual(self.tracker.get_active_symbol_count(self.base_time + timedelta(days=5)), 1)

    def test_quota_exhaustion_at_100_symbols(self):
        # Insert 100 symbols
        for i in range(100):
            sym = f"US.STK{i:03d}"
            self.tracker.record_symbol_request(sym, self.base_time)

        self.assertEqual(self.tracker.get_active_symbol_count(self.base_time), 100)
        self.assertFalse(self.tracker.can_request_symbol("US.NEWSTK", self.base_time))

        # 101st symbol must raise QuotaExceededError
        with self.assertRaises(QuotaExceededError):
            self.tracker.record_symbol_request("US.NEWSTK", self.base_time)

    def test_quota_expiry_frees_capacity(self):
        # Insert 100 symbols at day 0
        for i in range(100):
            self.tracker.record_symbol_request(f"US.OLD{i:03d}", self.base_time)

        # Move forward 31 days
        day31 = self.base_time + timedelta(days=31)
        self.assertEqual(self.tracker.get_active_symbol_count(day31), 0)

        # Now new symbols can be added
        self.assertTrue(self.tracker.can_request_symbol("US.NEW001", day31))
        self.tracker.record_symbol_request("US.NEW001", day31)
        self.assertEqual(self.tracker.get_active_symbol_count(day31), 1)

    def test_quota_summary_format(self):
        self.tracker.record_symbol_request("US.AAPL", self.base_time)
        self.tracker.record_symbol_request("US.MSFT", self.base_time)
        summary = self.tracker.get_quota_summary(self.base_time)

        self.assertEqual(summary["kline_30d_used"], 2)
        self.assertEqual(summary["kline_30d_remaining"], 98)
        self.assertEqual(summary["realtime_subscribed"], 0)
        self.assertEqual(summary["realtime_remaining"], 100)


if __name__ == "__main__":
    unittest.main()
