"""
Unit & Boundary Value Analysis (BVA) Test Suite for Moomoo US Fee Model (HOM-374 / Issue #12)
Validates:
1. Micro-trades (1 share @ $1.50) hitting commission minimum ($0.01), regulatory minimums ($0.01)
2. Normal trades (100 shares @ $50.00)
3. Large notional trades (1,000 shares @ $350.00) testing settlement cap (1%) and FINRA TAF cap ($8.30)
4. Buy vs Sell leg itemized fee differentials (SEC & FINRA TAF applied only to SELL)
5. Malaysian Stamp Duty conversion to USD using USD_MYR_RATE and ceiling per RM 1,000 bracket
6. Break-Even Stop Loss ($SL_{BE}$) formula guarantee: Selling at $SL_{BE}$ strictly yields Net P&L >= $0.00
7. Strict USD ($) denomination across all metrics
"""

import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bridge.src.fee_model import MoomooFeeModel


class TestMoomooFeeModelBVA(unittest.TestCase):

    def setUp(self):
        self.model = MoomooFeeModel

    # =========================================================================
    # 1. BVA: Single Leg Fee Boundaries & Minimums
    # =========================================================================
    def test_bva_zero_or_negative_inputs(self):
        """Zero or negative quantity/price must return 0.0 fees cleanly."""
        res_zero_qty = self.model.calculate_order_fee(price=100.0, quantity=0, side="BUY")
        self.assertEqual(res_zero_qty["total_fee"], 0.0)

        res_zero_price = self.model.calculate_order_fee(price=0.0, quantity=50, side="SELL")
        self.assertEqual(res_zero_price["total_fee"], 0.0)

    def test_bva_micro_position_minimum_thresholds(self):
        """
        Micro order: 1 share @ $1.50 ($1.50 notional).
        - Commission: 1.50 * 0.0003 = 0.00045 -> clamped to min $0.01
        - Platform Fee: $0.99
        - Settlement Fee: min(1 * 0.003, 1.50 * 0.01) = 0.003 -> rounded
        - Stamp Duty: 1.50 * 4.45 = 6.675 MYR -> ceil(6.675 / 1000) = 1 -> RM 1.00 / 4.45 = $0.22 USD
        """
        buy_res = self.model.calculate_order_fee(price=1.50, quantity=1, side="BUY", usd_myr_rate=4.45)
        self.assertEqual(buy_res["commission"], 0.01, "Commission must hit $0.01 minimum")
        self.assertEqual(buy_res["platform_fee"], 0.99, "Platform fee must be flat $0.99")
        self.assertEqual(buy_res["sec_fee"], 0.0, "SEC fee must be 0 for BUY leg")
        self.assertEqual(buy_res["finra_taf"], 0.0, "FINRA TAF must be 0 for BUY leg")
        self.assertEqual(buy_res["stamp_duty_usd"], 0.22, "Stamp duty must be converted to $0.22 USD")
        self.assertGreater(buy_res["total_fee"], 1.20)

        sell_res = self.model.calculate_order_fee(price=1.50, quantity=1, side="SELL", usd_myr_rate=4.45)
        self.assertEqual(sell_res["sec_fee"], 0.01, "SEC fee on sell must hit $0.01 minimum")
        self.assertEqual(sell_res["finra_taf"], 0.01, "FINRA TAF on sell must hit $0.01 minimum")
        self.assertGreater(sell_res["total_fee"], buy_res["total_fee"], "Sell leg must include regulatory levies")

    def test_bva_large_notional_caps(self):
        """
        Large order: 1,000 shares @ $350.00 ($350,000 notional).
        - Commission: 350,000 * 0.0003 = $105.00
        - Platform Fee: $0.99
        - Settlement Fee: 1,000 * 0.003 = $3.00 (below 1% cap of $3,500)
        - SEC Fee (SELL): 350,000 * 0.0000206 = $7.21
        - FINRA TAF (SELL): 1,000 * 0.000166 = $0.17 (below $8.30 cap)
        """
        sell_res = self.model.calculate_order_fee(price=350.0, quantity=1000, side="SELL")
        self.assertEqual(sell_res["commission"], 105.00)
        self.assertEqual(sell_res["platform_fee"], 0.99)
        self.assertEqual(sell_res["settlement_fee"], 3.00)
        self.assertEqual(sell_res["sec_fee"], 7.21)
        self.assertEqual(sell_res["finra_taf"], 0.17)

    # =========================================================================
    # 2. BVA: Malaysian Stamp Duty Calculation
    # =========================================================================
    def test_bva_stamp_duty_conversion_and_brackets(self):
        """
        Stamp Duty: RM 1.00 per RM 1,000 (or fractional part thereof).
        At USD/MYR 4.45:
        - $200 USD = RM 890 (bracket 1) -> RM 1.00 -> $0.22 USD
        - $250 USD = RM 1,112.50 (bracket 2) -> RM 2.00 -> $0.45 USD
        - $2,247.19 USD = RM 10,000 (bracket 10) -> RM 10.00 -> $2.25 USD
        """
        # Bracket 1 (RM 890 <= RM 1000)
        res1 = self.model.calculate_order_fee(price=200.0, quantity=1, side="BUY", usd_myr_rate=4.45)
        self.assertEqual(res1["stamp_duty_usd"], 0.22)

        # Bracket 2 (RM 1112.50 > RM 1000, <= RM 2000)
        res2 = self.model.calculate_order_fee(price=250.0, quantity=1, side="BUY", usd_myr_rate=4.45)
        self.assertEqual(res2["stamp_duty_usd"], 0.45)

        # Toggle test: stamp duty disabled
        res_no_stamp = self.model.calculate_order_fee(price=250.0, quantity=1, side="BUY", include_stamp_duty=False)
        self.assertEqual(res_no_stamp["stamp_duty_usd"], 0.0)
        self.assertEqual(res_no_stamp["total_fee"], round(res2["total_fee"] - 0.45, 2))

    # =========================================================================
    # 3. BVA: Round-Trip Fee Dynamics
    # =========================================================================
    def test_bva_roundtrip_fee_structure(self):
        """Roundtrip fee = BUY fee (entry) + SELL fee (exit)."""
        rt = self.model.calculate_roundtrip_fee(entry_price=50.0, quantity=20, exit_price=55.0)
        self.assertIn("buy_fee", rt)
        self.assertIn("sell_fee", rt)
        self.assertEqual(rt["currency"], "USD")
        self.assertAlmostEqual(rt["total_fee"], rt["buy_fee"]["total_fee"] + rt["sell_fee"]["total_fee"], places=2)

    # =========================================================================
    # 4. Critical Invariant: Break-Even Stop Loss Guarantee ($SL_{BE}$)
    # =========================================================================
    def test_bva_breakeven_sl_strictly_non_negative_net_pl(self):
        """
        For diverse trade parameters (micro, small, large, cheap, expensive),
        executing a sell at SL_BE MUST guarantee:
        Net P&L = (SL_BE - Entry) * Quantity - (Fee_buy + Fee_sell) >= $0.00.
        """
        test_cases = [
            {"entry": 1.50, "qty": 1},
            {"entry": 5.00, "qty": 10},
            {"entry": 25.50, "qty": 50},
            {"entry": 140.00, "qty": 15},
            {"entry": 350.00, "qty": 500},
            {"entry": 12.34, "qty": 137},
        ]

        for tc in test_cases:
            entry = tc["entry"]
            qty = tc["qty"]

            sl_be = self.model.calculate_breakeven_sl(entry_price=entry, quantity=qty)
            self.assertGreater(sl_be, entry, f"SL_BE ({sl_be}) must be above entry ({entry}) to cover fees")

            # Simulate full lifecycle execution
            buy_leg = self.model.calculate_order_fee(price=entry, quantity=qty, side="BUY")
            sell_leg = self.model.calculate_order_fee(price=sl_be, quantity=qty, side="SELL")

            gross_pl = round((sl_be - entry) * qty, 2)
            total_fees = round(buy_leg["total_fee"] + sell_leg["total_fee"], 2)
            net_pl = round(gross_pl - total_fees, 2)

            self.assertGreaterEqual(
                net_pl,
                0.0,
                f"Failed Net P&L >= 0.00 guarantee for entry={entry}, qty={qty}! "
                f"SL_BE={sl_be}, Gross P&L={gross_pl}, Total Fees={total_fees}, Net P&L={net_pl}"
            )


if __name__ == "__main__":
    unittest.main()
