"""
Unit and BVA tests for PaperclipDispatcher (HOM-317 / HOM-392).
Verifies:
- Pure on-demand invocation without timer cooldowns.
- In-flight concurrency lock preventing overlapping duplicate executions.
- Candidate batching for L2 Haziq.
- Safe lock release under success, error, and exception conditions.
"""

import unittest
from unittest.mock import MagicMock, patch
from bridge.src.paperclip_dispatcher import (
    PaperclipDispatcher,
    TARIQ_AGENT_ID,
    NAWWAR_AGENT_ID,
    HAZIQ_AGENT_ID,
    DANIAL_AGENT_ID
)


class TestDispatcherAndMarketBVA(unittest.TestCase):

    def setUp(self):
        self.dispatcher = PaperclipDispatcher(api_url="https://test.crew.example", api_key="test-key")

    @patch("urllib.request.urlopen")
    def test_invoke_agent_heartbeat_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.length = 15
        mock_resp.read.return_value = b'{"success":true}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        res = self.dispatcher.invoke_agent_heartbeat(TARIQ_AGENT_ID, reason="test_wake")
        self.assertEqual(res["status"], "SUCCESS")
        self.assertEqual(res["agent_id"], TARIQ_AGENT_ID)

    def test_invoke_agent_heartbeat_no_api_key(self):
        disp_no_key = PaperclipDispatcher(api_url="https://test.crew.example", api_key="")
        res = disp_no_key.invoke_agent_heartbeat(HAZIQ_AGENT_ID)
        self.assertEqual(res["status"], "SKIPPED")

    @patch.object(PaperclipDispatcher, "invoke_agent_heartbeat")
    def test_dispatch_l1_agents(self, mock_invoke):
        mock_invoke.return_value = {"status": "SUCCESS"}
        candidates = [{"symbol": "US.AAPL"}, {"symbol": "US.NVDA"}]
        res = self.dispatcher.dispatch_l1_agents(candidates)
        self.assertIn("l1_tariq", res)
        self.assertIn("l1_nawwar", res)
        self.assertEqual(mock_invoke.call_count, 2)

    @patch.object(PaperclipDispatcher, "invoke_agent_heartbeat")
    def test_aggregate_and_wake_haziq(self, mock_invoke):
        mock_invoke.return_value = {"status": "SUCCESS"}
        l1_evals = [{"symbol": "US.AAPL", "S_tech": 85.0, "S_sent": 70.0}]
        res = self.dispatcher.aggregate_and_wake_haziq(l1_evals)
        self.assertIn("l2_haziq", res)
        self.assertEqual(res["candidates_count"], 1)
        mock_invoke.assert_called_with(HAZIQ_AGENT_ID, reason="l2_portfolio_synthesis")

    @patch.object(PaperclipDispatcher, "invoke_agent_heartbeat")
    def test_haziq_wake_danial(self, mock_invoke):
        mock_invoke.return_value = {"status": "SUCCESS"}
        order = {"symbol": "US.AAPL", "qty": 10, "entry": 150.0}
        res = self.dispatcher.haziq_wake_danial(order)
        self.assertIn("l3_danial", res)
        self.assertEqual(res["symbol"], "US.AAPL")
        mock_invoke.assert_called_with(DANIAL_AGENT_ID, reason="l3_risk_compliance_audit")

    # =========================================================================
    # HOM-392 BVA Tests: Pure On-Demand & In-Flight Concurrency Lock
    # =========================================================================

    @patch("urllib.request.urlopen")
    def test_on_demand_immediate_consecutive_success(self, mock_urlopen):
        """BVA: Immediate sequential triggers succeed without cooldown delay."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.length = 15
        mock_resp.read.return_value = b'{"success":true}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        # Trigger 1: Immediate success
        res1 = self.dispatcher.invoke_agent_heartbeat(HAZIQ_AGENT_ID, reason="on_demand_1")
        self.assertEqual(res1["status"], "SUCCESS")

        # Trigger 2: Consecutive immediate trigger without 15m delay -> Must succeed immediately
        res2 = self.dispatcher.invoke_agent_heartbeat(HAZIQ_AGENT_ID, reason="on_demand_2")
        self.assertEqual(res2["status"], "SUCCESS")
        self.assertEqual(mock_urlopen.call_count, 2)

    def test_in_flight_lock_rejects_duplicate_concurrent_trigger(self):
        """BVA: Overlapping trigger while agent is in-flight returns IN_PROGRESS_SKIPPED."""
        self.dispatcher.set_in_flight(HAZIQ_AGENT_ID, True)
        self.assertTrue(self.dispatcher.is_in_flight(HAZIQ_AGENT_ID))

        res = self.dispatcher.invoke_agent_heartbeat(HAZIQ_AGENT_ID, reason="concurrent_wake")
        self.assertEqual(res["status"], "IN_PROGRESS_SKIPPED")
        self.assertEqual(res["agent_id"], HAZIQ_AGENT_ID)
        self.assertIn("in progress", res["reason"])

        # Reset in-flight
        self.dispatcher.set_in_flight(HAZIQ_AGENT_ID, False)
        self.assertFalse(self.dispatcher.is_in_flight(HAZIQ_AGENT_ID))

    @patch("urllib.request.urlopen")
    def test_in_flight_lock_released_after_execution(self, mock_urlopen):
        """BVA: In-flight lock is cleanly released after execution completes."""
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.length = 15
        mock_resp.read.return_value = b'{"ok":true}'
        mock_urlopen.return_value.__enter__.return_value = mock_resp

        self.assertFalse(self.dispatcher.is_in_flight(TARIQ_AGENT_ID))
        res = self.dispatcher.invoke_agent_heartbeat(TARIQ_AGENT_ID)
        self.assertEqual(res["status"], "SUCCESS")
        self.assertFalse(self.dispatcher.is_in_flight(TARIQ_AGENT_ID))

    @patch("urllib.request.urlopen")
    def test_in_flight_lock_released_on_http_error(self, mock_urlopen):
        """BVA: In-flight lock is safely released even if HTTP or socket error occurs."""
        import urllib.error
        mock_urlopen.side_effect = urllib.error.HTTPError(
            url="http://test", code=500, msg="Internal Server Error", hdrs={}, fp=MagicMock(read=lambda: b"err")
        )

        res = self.dispatcher.invoke_agent_heartbeat(DANIAL_AGENT_ID)
        self.assertEqual(res["status"], "ERROR")
        self.assertEqual(res["code"], 500)
        self.assertFalse(self.dispatcher.is_in_flight(DANIAL_AGENT_ID))

    @patch.object(PaperclipDispatcher, "invoke_agent_heartbeat")
    def test_candidate_batching_multiple_candidates_single_wake(self, mock_invoke):
        """BVA: 10 candidates trigger exactly 1 aggregated Haziq wake call with candidates_count == 10."""
        mock_invoke.return_value = {"status": "SUCCESS"}
        candidates_batch = [{"symbol": f"US.STK{i}", "score": 80.0 + i} for i in range(10)]

        res = self.dispatcher.aggregate_and_wake_haziq(candidates_batch)
        self.assertEqual(res["candidates_count"], 10)
        mock_invoke.assert_called_once_with(HAZIQ_AGENT_ID, reason="l2_portfolio_synthesis")

    def test_context_manager_in_flight_lock(self):
        """BVA: in_flight_lock context manager acquires and releases lock safely."""
        agent_id = NAWWAR_AGENT_ID
        self.assertFalse(self.dispatcher.is_in_flight(agent_id))

        with self.dispatcher.in_flight_lock(agent_id):
            self.assertTrue(self.dispatcher.is_in_flight(agent_id))
            # Trying to acquire again raises RuntimeError
            with self.assertRaises(RuntimeError):
                with self.dispatcher.in_flight_lock(agent_id):
                    pass

        self.assertFalse(self.dispatcher.is_in_flight(agent_id))


if __name__ == "__main__":
    unittest.main()
