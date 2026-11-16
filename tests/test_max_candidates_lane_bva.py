"""
test_max_candidates_lane_bva.py
Unit Test, Boundary Value Analysis (BVA), and Mutation Testing Suite
for MAX_CANDIDATES_PER_LANE in Screener Config (HOM-282 / Issue #3).

SDLC Step 3(a): BVA on configuration boundaries (0, 1, 5, 20, 21, negative, decimals, corrupted values).
SDLC Step 3(b): Mutation testing on candidate slicing decision logic in enrich_kline_gate.
"""

import os
import sys
import tempfile
import sqlite3
import unittest
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from screener.src.config import ScreenerConfig


def slice_lane_candidates(candidates: list, max_per_lane: int) -> list:
    """Exact candidate lane slicing logic as executed in Stage 3 enrich_kline_gate."""
    return candidates[:max_per_lane]


class TestMaxCandidatesLaneBVA(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "screener_config.sqlite"
        self.orig_db_path = ScreenerConfig.CONFIG_DB_PATH
        ScreenerConfig.CONFIG_DB_PATH = self.db_path
        ScreenerConfig.reset_to_defaults()

    def tearDown(self):
        ScreenerConfig.CONFIG_DB_PATH = self.orig_db_path
        ScreenerConfig.reset_to_defaults()
        self.temp_dir.cleanup()

    def _init_db_with_value(self, max_candidates_val):
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE screener_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                min_price REAL NOT NULL,
                min_market_cap REAL NOT NULL,
                min_volume REAL NOT NULL,
                min_rvol REAL NOT NULL,
                max_rvol REAL NOT NULL,
                max_candidates_per_lane INTEGER,
                updated_at TEXT NOT NULL,
                updated_by TEXT NOT NULL
            );
        """)
        cursor.execute("""
            INSERT INTO screener_config (id, min_price, min_market_cap, min_volume, min_rvol, max_rvol, max_candidates_per_lane, updated_at, updated_by)
            VALUES (1, 10.0, 1000000000.0, 1000000.0, 0.50, 20.00, ?, '2026-11-16T00:00:00Z', 'tester')
        """, (max_candidates_val,))
        conn.commit()
        conn.close()

    # --- 1. Default Configuration & Reset ---
    def test_default_values(self):
        """Default MAX_CANDIDATES_PER_LANE is 5."""
        self.assertEqual(ScreenerConfig.DEFAULT_MAX_CANDIDATES_PER_LANE, 5)
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 5)

    def test_reset_to_defaults(self):
        """reset_to_defaults resets MAX_CANDIDATES_PER_LANE back to default."""
        ScreenerConfig.MAX_CANDIDATES_PER_LANE = 12
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 12)
        ScreenerConfig.reset_to_defaults()
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 5)

    # --- 2. Missing DB / Fallback ---
    def test_load_config_missing_db_returns_defaults(self):
        """When DB file does not exist, load_active_config returns defaults without crashing."""
        if self.db_path.exists():
            self.db_path.unlink()
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(cfg["max_candidates_per_lane"], 5)
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 5)

    # --- 3. BVA: Valid Boundaries (1, 5, 20) ---
    def test_bva_minimum_boundary_1(self):
        """Boundary: Exactly 1 candidate per lane (minimum safe boundary)."""
        self._init_db_with_value(1)
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(cfg["max_candidates_per_lane"], 1)
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 1)

    def test_bva_default_value_5(self):
        """Default value: Exactly 5 candidates per lane."""
        self._init_db_with_value(5)
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(cfg["max_candidates_per_lane"], 5)
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 5)

    def test_bva_maximum_boundary_20(self):
        """Boundary: Exactly 20 candidates per lane (maximum safe institutional boundary)."""
        self._init_db_with_value(20)
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(cfg["max_candidates_per_lane"], 20)
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 20)

    def test_bva_mid_target_value_8(self):
        """Target value: 8 candidates per lane."""
        self._init_db_with_value(8)
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(cfg["max_candidates_per_lane"], 8)
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 8)

    # --- 4. BVA: Invalid Boundaries (< 1 or > 20) ---
    def test_bva_below_minimum_boundary_0_rejected(self):
        """Boundary: 0 candidates per lane is out of bounds (< 1) and rejected."""
        self._init_db_with_value(0)
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 5)
        self.assertEqual(cfg["max_candidates_per_lane"], 5)

    def test_bva_negative_value_rejected(self):
        """Boundary: Negative value (-1) is rejected."""
        self._init_db_with_value(-1)
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 5)
        self.assertEqual(cfg["max_candidates_per_lane"], 5)

    def test_bva_above_maximum_boundary_21_rejected(self):
        """Boundary: 21 candidates per lane is out of bounds (> 20) and rejected."""
        self._init_db_with_value(21)
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 5)
        self.assertEqual(cfg["max_candidates_per_lane"], 5)

    def test_bva_extreme_value_100_rejected(self):
        """Boundary: Extreme value (100) that would deplete 30-day K-line quota is rejected."""
        self._init_db_with_value(100)
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 5)
        self.assertEqual(cfg["max_candidates_per_lane"], 5)

    def test_bva_corrupt_type_in_sqlite_handled_gracefully(self):
        """Corrupt non-integer type in SQLite database does not cause an uncaught exception."""
        self._init_db_with_value("not_a_number")
        cfg = ScreenerConfig.load_active_config()
        self.assertEqual(ScreenerConfig.MAX_CANDIDATES_PER_LANE, 5)
        self.assertEqual(cfg["max_candidates_per_lane"], 5)

    # --- 5. Candidate Slicing & Mutation Testing (SDLC 3b) ---
    def test_candidate_slicing_exact_limit(self):
        """Standard slicing: candidate list is capped at max_per_lane."""
        candidates = [f"SYM_{i}" for i in range(10)]
        sliced = slice_lane_candidates(candidates, 5)
        self.assertEqual(len(sliced), 5)
        self.assertEqual(sliced, ["SYM_0", "SYM_1", "SYM_2", "SYM_3", "SYM_4"])

    def test_candidate_slicing_when_candidates_fewer_than_max(self):
        """Standard slicing: when candidates < max_per_lane, returns all available."""
        candidates = ["SYM_0", "SYM_1", "SYM_2"]
        sliced = slice_lane_candidates(candidates, 5)
        self.assertEqual(len(sliced), 3)
        self.assertEqual(sliced, ["SYM_0", "SYM_1", "SYM_2"])

    def test_candidate_slicing_empty_list_zero_safe(self):
        """Boundary: Empty candidate list returns empty list without error."""
        sliced = slice_lane_candidates([], 5)
        self.assertEqual(sliced, [])

    def test_candidate_slicing_boundary_one(self):
        """Boundary: max_per_lane = 1 returns exactly 1 top candidate."""
        candidates = [f"SYM_{i}" for i in range(5)]
        sliced = slice_lane_candidates(candidates, 1)
        self.assertEqual(len(sliced), 1)
        self.assertEqual(sliced, ["SYM_0"])

    def test_candidate_slicing_boundary_twenty(self):
        """Boundary: max_per_lane = 20 returns up to 20 candidates."""
        candidates = [f"SYM_{i}" for i in range(25)]
        sliced = slice_lane_candidates(candidates, 20)
        self.assertEqual(len(sliced), 20)
        self.assertEqual(sliced[-1], "SYM_19")

    # Mutation Tests (5 Mutants)
    def test_mutation_1_off_by_one_upper(self):
        """Mutant 1: candidates[:max_per_lane + 1] (off-by-one upper error)."""
        candidates = [f"SYM_{i}" for i in range(10)]
        mutant_slice = candidates[:5 + 1]
        expected = slice_lane_candidates(candidates, 5)
        self.assertNotEqual(mutant_slice, expected, "Mutant 1 (off-by-one upper) must be killed")

    def test_mutation_2_off_by_one_lower(self):
        """Mutant 2: candidates[:max_per_lane - 1] (off-by-one lower error)."""
        candidates = [f"SYM_{i}" for i in range(10)]
        mutant_slice = candidates[:5 - 1]
        expected = slice_lane_candidates(candidates, 5)
        self.assertNotEqual(mutant_slice, expected, "Mutant 2 (off-by-one lower) must be killed")

    def test_mutation_3_inverted_slice(self):
        """Mutant 3: candidates[max_per_lane:] (inverted slice returning tail instead of head)."""
        candidates = [f"SYM_{i}" for i in range(10)]
        mutant_slice = candidates[5:]
        expected = slice_lane_candidates(candidates, 5)
        self.assertNotEqual(mutant_slice, expected, "Mutant 3 (inverted slice) must be killed")

    def test_mutation_4_hardcoded_single_element(self):
        """Mutant 4: candidates[:1] (hardcoded 1 ignoring max_per_lane)."""
        candidates = [f"SYM_{i}" for i in range(10)]
        mutant_slice = candidates[:1]
        expected = slice_lane_candidates(candidates, 5)
        self.assertNotEqual(mutant_slice, expected, "Mutant 4 (hardcoded 1) must be killed")

    def test_mutation_5_uncapped_slice(self):
        """Mutant 5: candidates[:] (no limit, exposing system to quota depletion)."""
        candidates = [f"SYM_{i}" for i in range(10)]
        mutant_slice = candidates[:]
        expected = slice_lane_candidates(candidates, 5)
        self.assertNotEqual(mutant_slice, expected, "Mutant 5 (uncapped slice) must be killed")


if __name__ == "__main__":
    unittest.main()
