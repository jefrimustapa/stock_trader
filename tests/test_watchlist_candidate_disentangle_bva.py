"""
Comprehensive Unit & Boundary Value Analysis (BVA) Tests for HOM-406 / HOM-407:
- Operational Separation of Watchlist Buy Candidates from Active Portfolio Monitoring in L1.
- Pipeline behavior when pause_buying = True (skips buy deliberation for watchlist, maintains held positions monitoring).
- Pipeline behavior when pause_buying = False (deliberates watchlist candidates, allows scale-in for held positions with attractive setups).
- Removal of arbitrary max_candidates = 10 truncation.
- Metrics segregation in simulation_cycles and get_recent_activity API.
"""

import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from bridge.src.config import BridgeConfig
from bridge.src.paperclip_dispatcher import PaperclipDispatcher
from bridge.src.agent_pipeline import AgentPipeline


class TestWatchlistCandidateDisentangleBVA(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "test_agent_activity.sqlite"
        self.config_db_path = Path(self.temp_dir.name) / "screener_config.sqlite"
        self.watchlist_path = Path(self.temp_dir.name) / "watchlist.json"

        # Initialize mock screener_config.sqlite
        conn = sqlite3.connect(str(self.config_db_path))
        conn.execute("""
            CREATE TABLE IF NOT EXISTS screener_config (
                id INTEGER PRIMARY KEY,
                pause_buying INTEGER DEFAULT 0,
                max_buying_power REAL DEFAULT 100000.0,
                agent_orders_per_page INTEGER DEFAULT 10
            )
        """)
        conn.execute("INSERT INTO screener_config (id, pause_buying, max_buying_power) VALUES (1, 0, 100000.0)")
        conn.commit()
        conn.close()

        # Mock OpenD client
        self.mock_moomoo = MagicMock()
        self.mock_moomoo.is_connected.return_value = True
        self.mock_moomoo.get_account_equity.return_value = 100000.0
        self.mock_moomoo.query_positions.return_value = []
        self.mock_moomoo.get_connection_status.return_value = "CONNECTED"
        self.mock_moomoo.submit_order.return_value = {"order_id": "MOCK-ORD-1", "status": "SUBMITTED"}
        self.mock_moomoo.trd_env = "SIMULATE"
        self.mock_dispatcher = MagicMock(spec=PaperclipDispatcher)

        # Patch BridgeConfig paths
        self.patch_config = patch.object(BridgeConfig, "SHARED_DATA_DIR", Path(self.temp_dir.name))
        self.patch_watchlist = patch.object(BridgeConfig, "WATCHLIST_PATH", self.watchlist_path)
        self.patch_config.start()
        self.patch_watchlist.start()

        self.pipeline = AgentPipeline(
            db_path=self.db_path,
            moomoo_client=self.mock_moomoo,
            dispatcher=self.mock_dispatcher,
        )

    def tearDown(self):
        self.patch_config.stop()
        self.patch_watchlist.stop()
        self.temp_dir.cleanup()

    def _set_pause_buying(self, paused: bool):
        conn = sqlite3.connect(str(self.config_db_path))
        conn.execute("UPDATE screener_config SET pause_buying = ? WHERE id = 1", (1 if paused else 0,))
        conn.commit()
        conn.close()

    def _create_watchlist(self, symbols):
        data = {
            "timestamp": "2026-11-27T00:00:00Z",
            "watchlist": [
                {
                    "symbol": sym,
                    "price": 50.0 + i,
                    "lane": "MOMENTUM" if i % 2 == 0 else "SETUP",
                    "lane_score": 80.0,
                    "rs_spy": 1.2,
                    "setup_metrics": {"wyckoff_score": 75}
                }
                for i, sym in enumerate(symbols)
            ]
        }
        with open(self.watchlist_path, "w", encoding="utf-8") as f:
            json.dump(data, f)

    # =========================================================================
    # 1. BVA: load_watchlist_candidates no arbitrary 10-cap truncation
    # =========================================================================

    def test_bva_load_watchlist_candidates_no_10_cap(self):
        """BVA: When watchlist contains 15 candidates, load_watchlist_candidates returns all 15."""
        symbols_15 = [f"STK{i:02d}" for i in range(1, 16)]
        self._create_watchlist(symbols_15)

        # Default max_candidates is None -> loads all 15
        candidates = self.pipeline.load_watchlist_candidates()
        self.assertEqual(len(candidates), 15)
        self.assertEqual(candidates[0]["symbol"], "STK01")
        self.assertEqual(candidates[-1]["symbol"], "STK15")

        # Explicit max_candidates still respected if specified
        limited = self.pipeline.load_watchlist_candidates(max_candidates=5)
        self.assertEqual(len(limited), 5)

    # =========================================================================
    # 2. BVA: pause_buying = True (0 buy deliberations, 17 held monitored deliberations)
    # =========================================================================

    def test_bva_pause_buying_active_skips_buy_maintains_held_monitoring(self):
        """
        BVA: Under pause_buying = True:
        - 9 watchlist candidates in watchlist.json
        - 17 active broker positions
        Result: 0 buy deliberations conducted, 17 held positions monitored, total_candidates = 17.
        """
        self._set_pause_buying(True)
        watchlist_9 = [f"BUY{i:02d}" for i in range(1, 10)]
        self._create_watchlist(watchlist_9)

        held_17 = [
            {"code": f"HELD{i:02d}", "qty": 100, "cost_price": 25.0 + i}
            for i in range(1, 18)
        ]
        self.mock_moomoo.query_positions.return_value = held_17

        res = self.pipeline.run_simulation_cycle(
            force_simulation=True,
            mock_market_window=True,
            include_active_positions=True,
            wake_agents=False
        )

        deliberations = res["deliberations"]
        self.assertEqual(res["summary"]["total_candidates"], 17)
        self.assertEqual(len(deliberations), 17)
        self.assertEqual(res["watchlist_candidates_count"], 9)
        self.assertEqual(res["monitored_positions_count"], 17)
        self.assertTrue(res["is_buying_paused"])

        # Verify all 17 deliberations are held positions monitored for exit / defense
        for d in deliberations:
            self.assertTrue(d["is_held"])
            self.assertTrue(d["is_monitoring_only"])
            self.assertEqual(d["stage_reached"], "ACTIVE_WATCH")
            self.assertEqual(d["final_decision"], "HOLD_POSITION_MAINTAINED")

        # Verify NONE of the buy candidates from watchlist were deliberated
        symbols_evaluated = {d["symbol"] for d in deliberations}
        for buy_sym in watchlist_9:
            self.assertNotIn(buy_sym, symbols_evaluated)

    # =========================================================================
    # 3. BVA: pause_buying = False (9 buy deliberations, 17 held monitored deliberations)
    # =========================================================================

    def test_bva_pause_buying_inactive_runs_both_buy_and_held_monitoring(self):
        """
        BVA: Under pause_buying = False:
        - 9 distinct watchlist candidates
        - 17 distinct held broker positions
        Result: 9 buy candidates evaluated + 17 held positions monitored = 26 total candidates.
        """
        self._set_pause_buying(False)
        watchlist_9 = [f"BUY{i:02d}" for i in range(1, 10)]
        self._create_watchlist(watchlist_9)

        held_17 = [
            {"code": f"HELD{i:02d}", "qty": 100, "cost_price": 25.0 + i}
            for i in range(1, 18)
        ]
        self.mock_moomoo.query_positions.return_value = held_17

        res = self.pipeline.run_simulation_cycle(
            force_simulation=True,
            mock_market_window=True,
            include_active_positions=True,
            wake_agents=False
        )

        deliberations = res["deliberations"]
        self.assertEqual(res["summary"]["total_candidates"], 26)
        self.assertEqual(len(deliberations), 26)
        self.assertEqual(res["watchlist_candidates_count"], 9)
        self.assertEqual(res["monitored_positions_count"], 17)
        self.assertFalse(res["is_buying_paused"])

        # Check buy candidates are evaluated
        buy_delibs = [d for d in deliberations if not d["is_held"]]
        held_delibs = [d for d in deliberations if d["is_held"]]
        self.assertEqual(len(buy_delibs), 9)
        self.assertEqual(len(held_delibs), 17)

    # =========================================================================
    # 4. BVA: Deduplication & Scale-In for Held Stock Appearing in Watchlist
    # =========================================================================

    def test_bva_held_stock_in_watchlist_allows_scale_in_without_duplicate_order(self):
        """
        BVA: When a held stock (PLTR) also appears in watchlist with attractive setup:
        - Stock is merged into a single candidate entry (no duplicate entries).
        - allow_scale_in is set to True.
        - Danial Rule Kawalan Kedudukan Aktif allows scale-in without duplicate rejection.
        """
        self._set_pause_buying(False)
        self._create_watchlist(["PLTR", "NVDA"])

        held_positions = [
            {"code": "PLTR", "qty": 50, "cost_price": 45.0},
            {"code": "TSLA", "qty": 20, "cost_price": 200.0}
        ]
        self.mock_moomoo.query_positions.return_value = held_positions

        res = self.pipeline.run_simulation_cycle(
            force_simulation=True,
            mock_market_window=True,
            include_active_positions=True,
            wake_agents=False
        )

        deliberations = res["deliberations"]
        # Symbols should be: PLTR (merged scale-in), NVDA (new buy), TSLA (held monitor only) -> exactly 3
        symbols = [d["symbol"] for d in deliberations]
        self.assertEqual(len(symbols), 3)
        self.assertEqual(len(set(symbols)), 3)

        pltr_delib = next(d for d in deliberations if d["symbol"] == "PLTR")
        self.assertTrue(pltr_delib["is_held"])
        self.assertTrue(pltr_delib["allow_scale_in"])

        # Danial audit should permit scale-in
        if pltr_delib.get("danial"):
            danial_checks = pltr_delib["danial"].get("rule_checks", [])
            dedup_check = next((r for r in danial_checks if "Kawalan Kedudukan Aktif" in r["rule"]), None)
            if dedup_check:
                self.assertTrue(dedup_check["passed"])

    # =========================================================================
    # 5. Activity API & Segregated Metrics Verification
    # =========================================================================

    def test_bva_get_recent_activity_returns_segregated_metrics(self):
        """BVA: get_recent_activity returns pause_buying, watchlist_candidates_count, and monitored_positions_count."""
        self._set_pause_buying(True)
        self._create_watchlist(["AAPL", "MSFT", "GOOG"])
        self.mock_moomoo.query_positions.return_value = [
            {"code": "AMD", "qty": 10, "cost_price": 100.0},
            {"code": "INTC", "qty": 20, "cost_price": 30.0}
        ]

        # Run cycle
        self.pipeline.run_simulation_cycle(
            force_simulation=True,
            mock_market_window=True,
            include_active_positions=True,
            wake_agents=False
        )

        activity = self.pipeline.get_recent_activity(limit=5)
        self.assertEqual(activity["status"], "OK")
        self.assertTrue(activity["pause_buying"])
        self.assertEqual(activity["watchlist_candidates_count"], 3)
        self.assertEqual(activity["monitored_positions_count"], 2)

        stats = activity["stats"]
        self.assertEqual(stats["watchlist_candidates"], 3)
        self.assertEqual(stats["monitored_positions"], 2)
        self.assertTrue(stats["pause_buying"])

        latest_cycle = activity["cycles"][0]
        self.assertEqual(latest_cycle["watchlist_candidates"], 3)
        self.assertEqual(latest_cycle["monitored_positions"], 2)
        self.assertEqual(latest_cycle["is_buying_paused"], 1)


if __name__ == "__main__":
    unittest.main()
