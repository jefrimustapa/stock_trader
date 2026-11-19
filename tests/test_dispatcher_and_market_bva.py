"""
Unit tests for PaperclipDispatcher and Candidate Market Data Endpoints (HOM-317).
"""

import unittest
from unittest.mock import MagicMock, patch
from bridge.src.paperclip_dispatcher import PaperclipDispatcher, TARIQ_AGENT_ID, NAWWAR_AGENT_ID, HAZIQ_AGENT_ID, DANIAL_AGENT_ID


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


if __name__ == "__main__":
    unittest.main()
