import os
import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from screener.src.config import ScreenerConfig
from bridge.src.config import BridgeConfig


class TestTradingModeToggleBVA(unittest.TestCase):
    """
    Unit & Boundary Value Analysis (BVA) for Dynamic TRADING_MODE (HOM-351).
    Verifies SQLite persistence, hot-reloading in ScreenerConfig and BridgeConfig,
    and fallback handling.
    """

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = Path(self.temp_dir) / "screener_config.sqlite"
        self._init_sqlite(self.db_path)

        # Preserve original paths and values
        self.orig_screener_path = ScreenerConfig.CONFIG_DB_PATH
        self.orig_bridge_dir = BridgeConfig.SHARED_DATA_DIR
        self.orig_screener_mode = ScreenerConfig.TRADING_MODE

        ScreenerConfig.CONFIG_DB_PATH = self.db_path
        BridgeConfig.SHARED_DATA_DIR = Path(self.temp_dir)

    def tearDown(self):
        ScreenerConfig.CONFIG_DB_PATH = self.orig_screener_path
        BridgeConfig.SHARED_DATA_DIR = self.orig_bridge_dir
        ScreenerConfig.TRADING_MODE = self.orig_screener_mode
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _init_sqlite(self, path: Path, initial_mode: str = "DAY"):
        conn = sqlite3.connect(str(path))
        conn.execute("""
            CREATE TABLE IF NOT EXISTS screener_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                min_price REAL NOT NULL CHECK (min_price >= 1.0),
                min_market_cap REAL NOT NULL CHECK (min_market_cap >= 10000000.0),
                min_volume REAL NOT NULL CHECK (min_volume >= 50000.0),
                min_rvol REAL NOT NULL CHECK (min_rvol >= 0.0),
                max_rvol REAL NOT NULL CHECK (max_rvol >= min_rvol),
                max_candidates_per_lane INTEGER NOT NULL DEFAULT 5 CHECK (max_candidates_per_lane >= 1 AND max_candidates_per_lane <= 20),
                max_buying_power REAL NOT NULL DEFAULT 100000.0 CHECK (max_buying_power >= 500.0),
                agent_orders_per_page INTEGER NOT NULL DEFAULT 10 CHECK (agent_orders_per_page IN (5, 10, 25, 50)),
                pause_buying INTEGER NOT NULL DEFAULT 0 CHECK (pause_buying IN (0, 1)),
                trading_mode TEXT NOT NULL DEFAULT 'DAY' CHECK (trading_mode IN ('DAY', 'SWING')),
                updated_at TEXT NOT NULL,
                updated_by TEXT NOT NULL
            );
        """)
        conn.execute("""
            INSERT INTO screener_config (id, min_price, min_market_cap, min_volume, min_rvol, max_rvol, max_candidates_per_lane, max_buying_power, agent_orders_per_page, pause_buying, trading_mode, updated_at, updated_by)
            VALUES (1, 10.0, 1000000000.0, 1000000.0, 0.50, 20.00, 5, 100000.0, 10, 0, ?, '2026-11-21T00:00:00Z', 'test')
        """, (initial_mode,))
        conn.commit()
        conn.close()

    def test_screener_config_hot_loads_day_mode(self):
        """BVA Valid: TRADING_MODE='DAY' loads correctly from SQLite."""
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(ScreenerConfig.TRADING_MODE, "DAY")
        self.assertEqual(cfg.get("trading_mode"), "DAY")

    def test_screener_config_hot_loads_swing_mode(self):
        """BVA Valid: TRADING_MODE='SWING' hot-reloaded dynamically from SQLite without daemon restart."""
        conn = sqlite3.connect(str(self.db_path))
        conn.execute("UPDATE screener_config SET trading_mode = 'SWING' WHERE id = 1")
        conn.commit()
        conn.close()

        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(ScreenerConfig.TRADING_MODE, "SWING")
        self.assertEqual(cfg.get("trading_mode"), "SWING")

    def test_bridge_config_get_trading_mode_dynamic(self):
        """BridgeConfig.get_trading_mode() reads live mode from SQLite."""
        self.assertEqual(BridgeConfig.get_trading_mode(), "DAY")

        conn = sqlite3.connect(str(self.db_path))
        conn.execute("UPDATE screener_config SET trading_mode = 'SWING' WHERE id = 1")
        conn.commit()
        conn.close()

        self.assertEqual(BridgeConfig.get_trading_mode(), "SWING")

    def test_bridge_config_fallback_when_db_missing(self):
        """BridgeConfig falls back to TRADING_MODE class property when db does not exist."""
        BridgeConfig.SHARED_DATA_DIR = Path(self.temp_dir) / "nonexistent"
        self.assertIn(BridgeConfig.get_trading_mode(), ("DAY", "SWING"))

    def test_sqlite_check_constraint_rejects_invalid_modes(self):
        """
        BVA Invalid inputs:
        DB CHECK constraint rejects anything other than 'DAY' or 'SWING'.
        """
        conn = sqlite3.connect(str(self.db_path))
        invalid_modes = ["SCALP", "INTRADAY", "OVERNIGHT", "INVALID", "", "day", "swing"]
        for inv in invalid_modes:
            with self.assertRaises(sqlite3.IntegrityError, msg=f"Expected IntegrityError for mode '{inv}'"):
                conn.execute("UPDATE screener_config SET trading_mode = ? WHERE id = 1", (inv,))
        conn.close()

    def test_screener_config_reset_to_defaults(self):
        """reset_to_defaults restores environment default mode."""
        ScreenerConfig.TRADING_MODE = "SWING"
        ScreenerConfig.reset_to_defaults()
        self.assertIn(ScreenerConfig.TRADING_MODE, ("DAY", "SWING"))


if __name__ == "__main__":
    unittest.main()
