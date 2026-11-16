import time
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.moomoo_client import MoomooClient, SubscriptionManager


class DummyQuoteContext:
    def __init__(self):
        self.subscribed = []
        self.unsubscribed = []

    def subscribe(self, code_list, subtype_list):
        for c in code_list:
            for s in subtype_list:
                self.subscribed.append((c, s))
        return 0, "OK"

    def unsubscribe(self, code_list, subtype_list):
        for c in code_list:
            for s in subtype_list:
                self.unsubscribed.append((c, s))
        return 0, "OK"

    def get_cur_kline(self, code, num, ktype):
        return 0, None


class TestKlineSubscriptionBVA(unittest.TestCase):
    """
    Deterministic BVA, Branch Coverage, and Mutation tests for K-line Subscription Manager.
    """

    def setUp(self):
        self.client = MoomooClient(host="127.0.0.1", port=59999, trd_env="SIMULATE")
        self.mgr = SubscriptionManager(self.client)

    def test_bva_normalize_symbol_boundary_values(self):
        # 1. Null / None
        self.assertEqual(SubscriptionManager.normalize_symbol(None), "")
        # 2. Empty string
        self.assertEqual(SubscriptionManager.normalize_symbol(""), "")
        # 3. Whitespace only
        self.assertEqual(SubscriptionManager.normalize_symbol("   "), "")
        # 4. Standard ticker without market prefix -> defaults to US.
        self.assertEqual(SubscriptionManager.normalize_symbol("aapl"), "US.AAPL")
        self.assertEqual(SubscriptionManager.normalize_symbol("TSLA"), "US.TSLA")
        # 5. Already prefixed ticker
        self.assertEqual(SubscriptionManager.normalize_symbol("US.NVDA"), "US.NVDA")
        self.assertEqual(SubscriptionManager.normalize_symbol("HK.00700"), "HK.00700")
        # 6. Non-string types
        self.assertEqual(SubscriptionManager.normalize_symbol(12345), "")
        self.assertEqual(SubscriptionManager.normalize_symbol([]), "")

    def test_bva_normalize_interval_boundaries(self):
        # Valid intervals
        self.assertEqual(SubscriptionManager.normalize_interval("day")[0], "day")
        self.assertEqual(SubscriptionManager.normalize_interval("1D")[0], "day")
        self.assertEqual(SubscriptionManager.normalize_interval("15m")[0], "15m")
        self.assertEqual(SubscriptionManager.normalize_interval("5m")[0], "5m")
        self.assertEqual(SubscriptionManager.normalize_interval("1m")[0], "1m")

        # Boundary / invalid / fallback intervals
        self.assertEqual(SubscriptionManager.normalize_interval(None)[0], "day")
        self.assertEqual(SubscriptionManager.normalize_interval("")[0], "day")
        self.assertEqual(SubscriptionManager.normalize_interval("unknown_interval")[0], "day")
        self.assertEqual(SubscriptionManager.normalize_interval("1h")[0], "day")

    def test_get_kline_empty_symbol_fails_validation(self):
        res = self.mgr.get_kline(symbol="", interval="day")
        self.assertEqual(res["status"], "ERROR")
        self.assertEqual(res["candles"], [])
        self.assertIn("Simbol kaunter diperlukan", res["error"])

    def test_get_kline_when_opend_disconnected_fails_closed(self):
        # When OpenD is unauthenticated/disconnected, MUST return UNAVAILABLE without mock data
        self.client._last_status = "DISCONNECTED"
        self.client._connected = False

        res = self.mgr.get_kline(symbol="US.AAPL", interval="day")
        self.assertEqual(res["status"], "UNAVAILABLE")
        self.assertFalse(res["connected"])
        self.assertEqual(res["candles"], [])
        self.assertIn("DISCONNECTED", res["opend_status"])
        self.assertIn("not authenticated", res["error"])

    def test_get_kline_when_opend_wait_login_fails_closed(self):
        self.client._last_status = "WAIT_LOGIN"
        self.client._connected = False

        res = self.mgr.get_kline(symbol="US.NVDA", interval="15m")
        self.assertEqual(res["status"], "UNAVAILABLE")
        self.assertFalse(res["connected"])
        self.assertEqual(res["candles"], [])
        self.assertEqual(res["opend_status"], "WAIT_LOGIN")

    def test_subscription_ref_counting_and_cooldown_lifecycle(self):
        # Simulate active connected state and mock OpenQuoteContext
        self.client._connected = True
        self.client._last_status = "CONNECTED"
        dummy_ctx = DummyQuoteContext()
        self.client._quote_ctx = dummy_ctx

        # First access -> creates subscription slot
        res1 = self.mgr.get_kline("US.AAPL", "day")
        self.assertEqual(len(self.mgr.subscriptions), 1)
        sub = self.mgr.subscriptions["US.AAPL:day"]
        self.assertEqual(sub["ref_count"], 1)
        self.assertFalse(sub["pending_unsub"])

        # Second access -> reuses slot, increments ref_count
        res2 = self.mgr.get_kline("US.AAPL", "day")
        self.assertEqual(len(self.mgr.subscriptions), 1)
        self.assertEqual(sub["ref_count"], 2)

        # Release once -> ref_count drops to 1, still active
        rel1 = self.mgr.release_subscription("US.AAPL", "day")
        self.assertEqual(rel1["status"], "OK")
        self.assertTrue(rel1["active"])
        self.assertEqual(sub["ref_count"], 1)

        # Release second time -> ref_count drops to 0, marked pending_unsub
        rel2 = self.mgr.release_subscription("US.AAPL", "day")
        self.assertEqual(rel2["status"], "OK")
        self.assertFalse(rel2["active"])
        self.assertTrue(sub["pending_unsub"])
        # Crucial OpenD 60s rule: since held < 60s, it must NOT be unsubscribed yet
        self.assertEqual(len(dummy_ctx.unsubscribed), 0)

        # Advance timestamp past 65s cooldown
        sub["subscribed_at"] = time.time() - 70.0
        cleaned = self.mgr.cleanup_expired_subscriptions()
        self.assertEqual(cleaned, 1)
        self.assertEqual(len(self.mgr.subscriptions), 0)
        self.assertEqual(len(dummy_ctx.unsubscribed), 1)
        self.assertEqual(dummy_ctx.unsubscribed[0][0], "US.AAPL")

    def test_lru_eviction_when_approaching_capacity(self):
        self.client._connected = True
        self.client._last_status = "CONNECTED"
        dummy_ctx = DummyQuoteContext()
        self.client._quote_ctx = dummy_ctx

        # Populate 80 slots with some marked pending_unsub and past 60s
        now = time.time()
        for i in range(80):
            key = f"US.STK{i}:day"
            self.mgr.subscriptions[key] = {
                "symbol": f"US.STK{i}",
                "interval": "day",
                "subtype": "K_DAY",
                "kltype": "K_DAY",
                "subscribed_at": now - 70.0,
                "last_accessed": now - 70.0,
                "ref_count": 0 if i < 10 else 1,
                "pending_unsub": True if i < 10 else False,
                "release_time": now - 65.0
            }

        self.assertEqual(len(self.mgr.subscriptions), 80)
        # Calling get_kline for a new symbol triggers LRU eviction of the 10 pending_unsub slots
        self.mgr.get_kline("US.NEWTICKER", "day")
        self.assertEqual(len(dummy_ctx.unsubscribed), 10)
        self.assertEqual(len(self.mgr.subscriptions), 71) # 80 - 10 + 1

    def test_slot_quota_boundary_full_100_rejected(self):
        self.client._connected = True
        self.client._last_status = "CONNECTED"
        self.client._quote_ctx = DummyQuoteContext()

        # Fill 100 active slots with ref_count > 0 (none pending_unsub)
        now = time.time()
        for i in range(100):
            key = f"US.ACTIVE{i}:day"
            self.mgr.subscriptions[key] = {
                "symbol": f"US.ACTIVE{i}",
                "interval": "day",
                "subtype": "K_DAY",
                "kltype": "K_DAY",
                "subscribed_at": now,
                "last_accessed": now,
                "ref_count": 1,
                "pending_unsub": False,
                "release_time": None
            }

        res = self.mgr.get_kline("US.OVERFLOW", "day")
        self.assertEqual(res["status"], "ERROR")
        self.assertIn("penuh", res["error"])


if __name__ == "__main__":
    unittest.main()
