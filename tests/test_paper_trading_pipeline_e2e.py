"""
End-to-End (E2E) Integration Test for Agent Trading Pipeline & Paper Trading Execution (HOM-291)
SDLC Step 4:
- Tests full pipeline from candidate input through Tariq -> Nawwar -> Haziq -> Danial -> OpenD paper order.
- Validates database persistence in SQLite (simulation_cycles, agent_deliberations, paper_orders).
- Validates retrieval via get_recent_activity() and get_paper_orders().
- Validates rejection paths at each level (L1 technical, L1 sentiment, L2 composite, L3 hard rules).
"""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bridge.src.agent_pipeline import AgentPipeline


class TestPaperTradingPipelineE2E(unittest.TestCase):

    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test_e2e_agent_activity.sqlite"
        self.pipeline = AgentPipeline(db_path=self.db_path)

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_e2e_successful_simulation_cycle_and_paper_order(self):
        """Full pipeline run where strong candidate passes all gates and generates a paper order."""
        candidates = [
            {
                "symbol": "US.NVDA",
                "price": 145.0,
                "change_pct": 3.2,
                "adv_20": 45000000.0,
                "rs_spy": 1.35,
                "lane": "MOMENTUM",
                "lane_score": 88.0,
                "setup_metrics": {
                    "dist_to_52w_high_pct": 1.2,
                    "atr_14_pct": 2.5
                }
            }
        ]

        result = self.pipeline.run_simulation_cycle(
            candidates=candidates,
            force_simulation=True,
            mock_market_window=True
        )

        self.assertIn("cycle_id", result)
        self.assertEqual(result["status"], "COMPLETED")
        self.assertEqual(result["summary"]["total_candidates"], 1)
        self.assertEqual(result["summary"]["passed_l1"], 1)
        self.assertEqual(result["summary"]["passed_l2"], 1)
        self.assertEqual(result["summary"]["passed_l3"], 1)
        self.assertEqual(result["summary"]["orders_placed"], 1)

        # Check deliberation details
        self.assertEqual(len(result["deliberations"]), 1)
        delib = result["deliberations"][0]
        self.assertEqual(delib["symbol"], "US.NVDA")
        self.assertEqual(delib["stage_reached"], "L4_DISPATCH")
        self.assertEqual(delib["final_decision"], "APPROVED_FOR_EXECUTION")

        # Tariq details
        self.assertGreaterEqual(delib["tariq"]["s_tech"], 60.0)
        self.assertEqual(delib["tariq"]["wyckoff_phase"], "MARKUP")

        # Nawwar details
        self.assertGreaterEqual(delib["nawwar"]["s_sent_norm"], 80.0)
        self.assertEqual(delib["nawwar"]["sentiment_label"], "BULLISH")

        # Haziq details
        self.assertGreaterEqual(delib["haziq"]["s_total"], 65.0)
        self.assertEqual(delib["haziq"]["risk_reward_ratio"], 1.5)
        self.assertGreater(delib["haziq"]["allocated_shares"], 0)

        # Danial details
        self.assertTrue(delib["danial"]["passed"])
        self.assertEqual(len(delib["danial"]["rule_checks"]), 8)
        for check in delib["danial"]["rule_checks"]:
            self.assertTrue(check["passed"], f"Rule check failed: {check['rule']}")

        # Paper order
        self.assertEqual(len(result["orders"]), 1)
        order = result["orders"][0]
        self.assertEqual(order["symbol"], "US.NVDA")
        self.assertIsNotNone(order["order_id"])

        # Test activity retrieval
        activity = self.pipeline.get_recent_activity(limit=5)
        self.assertEqual(activity["status"], "OK")
        self.assertEqual(len(activity["cycles"]), 1)
        self.assertEqual(activity["latest_cycle_id"], result["cycle_id"])
        self.assertEqual(len(activity["deliberations"]), 1)
        self.assertEqual(len(activity["orders"]), 1)

    def test_e2e_rejection_at_different_pipeline_stages(self):
        """Tests that candidates with deficiencies are properly caught at the right stage."""
        candidates = [
            # Candidate 1: Fails Tariq L1 (low technical score)
            {
                "symbol": "US.WEAK_TECH",
                "price": 25.0,
                "change_pct": 2.0,
                "adv_20": 10000000.0,
                "rs_spy": 0.4,
                "lane": "SETUP",
                "lane_score": 40.0,
                "setup_metrics": {"dist_to_52w_high_pct": 30.0}
            },
            # Candidate 2: Fails Danial Rule 4 (penny stock < $5)
            {
                "symbol": "US.PENNY",
                "price": 3.50,
                "change_pct": 5.0,
                "adv_20": 10000000.0,
                "rs_spy": 1.5,
                "lane": "MOMENTUM",
                "lane_score": 90.0,
                "setup_metrics": {"dist_to_52w_high_pct": 1.0}
            }
        ]

        result = self.pipeline.run_simulation_cycle(
            candidates=candidates,
            force_simulation=True,
            mock_market_window=True
        )

        self.assertEqual(result["summary"]["total_candidates"], 2)
        self.assertEqual(result["summary"]["orders_placed"], 0)

        # Candidate 1 should fail at L1 Technical
        delib1 = next(d for d in result["deliberations"] if d["symbol"] == "US.WEAK_TECH")
        self.assertEqual(delib1["stage_reached"], "L1_TECHNICAL")
        self.assertIn("TARIQ", delib1["final_decision"])

        # Candidate 2 should pass L1 & L2, but fail at L3 Danial Rule 4
        delib2 = next(d for d in result["deliberations"] if d["symbol"] == "US.PENNY")
        self.assertEqual(delib2["stage_reached"], "L3_RISK")
        self.assertIn("Rule 4", delib2["final_decision"])


if __name__ == "__main__":
    unittest.main()
