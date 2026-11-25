"""
Moomoo Fee Model for US Equities (HOM-374 / Issue #12)
Compliant with Moomoo Malaysia US Fee Schedule:
https://www.moomoo.com/my/support/topic9_136

Strict USD ($) denomination:
- Commission: 0.03% (min $0.01 per order)
- Platform Fee: $0.99 / order
- Settlement Fee: $0.003 / share (max 1% of trade value)
- SEC Fee: 0.0000206 * trade value (min $0.01, sell only)
- FINRA TAF: $0.000166 / share (min $0.01, max $8.30, sell only)
- Malaysian Stamp Duty: RM 1.00 per RM 1,000 (or fractional part thereof), converted to USD
"""

import math
import os
from typing import Dict, Any, Optional
from .config import BridgeConfig


class MoomooFeeModel:
    """
    Realistic fee calculation engine for Moomoo Malaysia trading US stocks.
    Strictly outputs all fees and thresholds in USD ($).
    """

    @classmethod
    def get_config(cls) -> Dict[str, Any]:
        return {
            "platform_fee": getattr(BridgeConfig, "MOOMOO_PLATFORM_FEE", 0.99),
            "commission_rate": getattr(BridgeConfig, "MOOMOO_COMMISSION_RATE", 0.0003),
            "commission_min": getattr(BridgeConfig, "MOOMOO_COMMISSION_MIN", 0.01),
            "settlement_fee_per_share": getattr(BridgeConfig, "MOOMOO_SETTLEMENT_FEE_PER_SHARE", 0.003),
            "settlement_fee_max_pct": getattr(BridgeConfig, "MOOMOO_SETTLEMENT_FEE_MAX_PCT", 0.01),
            "sec_fee_rate": getattr(BridgeConfig, "MOOMOO_SEC_FEE_RATE", 0.0000206),
            "sec_fee_min": getattr(BridgeConfig, "MOOMOO_SEC_FEE_MIN", 0.01),
            "finra_taf_per_share": getattr(BridgeConfig, "MOOMOO_FINRA_TAF_PER_SHARE", 0.000166),
            "finra_taf_min": getattr(BridgeConfig, "MOOMOO_FINRA_TAF_MIN", 0.01),
            "finra_taf_max": getattr(BridgeConfig, "MOOMOO_FINRA_TAF_MAX", 8.30),
            "include_stamp_duty": getattr(BridgeConfig, "MOOMOO_INCLUDE_STAMP_DUTY", True),
            "usd_myr_rate": getattr(BridgeConfig, "MOOMOO_USD_MYR_RATE", 4.45),
        }

    @classmethod
    def calculate_order_fee(
        cls,
        price: float,
        quantity: int,
        side: str = "BUY",
        include_stamp_duty: Optional[bool] = None,
        usd_myr_rate: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Calculates itemized and total order fee in USD ($) for a single leg (BUY or SELL).
        """
        if quantity <= 0 or price <= 0:
            return {
                "side": side.upper(),
                "price": price,
                "quantity": quantity,
                "trade_amount": 0.0,
                "commission": 0.0,
                "platform_fee": 0.0,
                "settlement_fee": 0.0,
                "sec_fee": 0.0,
                "finra_taf": 0.0,
                "stamp_duty_usd": 0.0,
                "total_fee": 0.0,
                "currency": "USD"
            }

        cfg = cls.get_config()
        use_stamp_duty = cfg["include_stamp_duty"] if include_stamp_duty is None else include_stamp_duty
        rate_myr = cfg["usd_myr_rate"] if usd_myr_rate is None else usd_myr_rate
        if rate_myr <= 0:
            rate_myr = 4.45

        side_clean = side.strip().upper()
        trade_amount = round(float(price) * int(quantity), 2)

        # 1. Broker Commission: 0.03% (min $0.01)
        raw_comm = trade_amount * cfg["commission_rate"]
        commission = max(cfg["commission_min"], round(raw_comm, 2))

        # 2. Platform Fee: $0.99 flat
        platform_fee = cfg["platform_fee"]

        # 3. Settlement Fee: $0.003 / share (capped at 1% of trade amount)
        raw_settlement = quantity * cfg["settlement_fee_per_share"]
        max_settlement = trade_amount * cfg["settlement_fee_max_pct"]
        settlement_fee = round(min(raw_settlement, max_settlement), 2)

        # 4. Regulatory fees (SEC & FINRA TAF apply only to SELL orders)
        sec_fee = 0.0
        finra_taf = 0.0
        if side_clean == "SELL":
            # SEC fee: 0.0000206 * trade_amount, min $0.01
            raw_sec = trade_amount * cfg["sec_fee_rate"]
            sec_fee = max(cfg["sec_fee_min"], round(raw_sec, 2))

            # FINRA TAF: $0.000166 / share, min $0.01, max $8.30
            raw_taf = quantity * cfg["finra_taf_per_share"]
            finra_taf = max(cfg["finra_taf_min"], min(cfg["finra_taf_max"], round(raw_taf, 2)))

        # 5. Malaysian Stamp Duty (converted to USD)
        # RM 1.00 for every RM 1,000 (or fractional part thereof) of trade amount
        stamp_duty_usd = 0.0
        if use_stamp_duty and trade_amount > 0:
            notional_myr = trade_amount * rate_myr
            stamp_myr = math.ceil(notional_myr / 1000.0) * 1.0
            stamp_duty_usd = round(stamp_myr / rate_myr, 2)

        total_fee = round(commission + platform_fee + settlement_fee + sec_fee + finra_taf + stamp_duty_usd, 2)

        return {
            "side": side_clean,
            "price": price,
            "quantity": quantity,
            "trade_amount": trade_amount,
            "commission": commission,
            "platform_fee": platform_fee,
            "settlement_fee": settlement_fee,
            "sec_fee": sec_fee,
            "finra_taf": finra_taf,
            "stamp_duty_usd": stamp_duty_usd,
            "total_fee": total_fee,
            "currency": "USD"
        }

    @classmethod
    def calculate_roundtrip_fee(
        cls,
        entry_price: float,
        quantity: int,
        exit_price: Optional[float] = None,
        include_stamp_duty: Optional[bool] = None,
        usd_myr_rate: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Calculates round-trip fees (BUY leg + SELL leg) in USD ($).
        If exit_price is omitted, entry_price is used as the nominal exit.
        """
        eff_exit_price = entry_price if exit_price is None else exit_price
        buy_res = cls.calculate_order_fee(
            price=entry_price,
            quantity=quantity,
            side="BUY",
            include_stamp_duty=include_stamp_duty,
            usd_myr_rate=usd_myr_rate
        )
        sell_res = cls.calculate_order_fee(
            price=eff_exit_price,
            quantity=quantity,
            side="SELL",
            include_stamp_duty=include_stamp_duty,
            usd_myr_rate=usd_myr_rate
        )
        total_roundtrip = round(buy_res["total_fee"] + sell_res["total_fee"], 2)

        return {
            "buy_fee": buy_res,
            "sell_fee": sell_res,
            "total_fee": total_roundtrip,
            "entry_price": entry_price,
            "exit_price": eff_exit_price,
            "quantity": quantity,
            "currency": "USD"
        }

    @classmethod
    def calculate_breakeven_sl(
        cls,
        entry_price: float,
        quantity: int,
        include_stamp_duty: Optional[bool] = None,
        usd_myr_rate: Optional[float] = None
    ) -> float:
        """
        Calculates dynamic Break-Even Stop Loss ($SL_{BE}$) in USD ($).
        Formula: SL_BE = Entry + (Fee_roundtrip / Quantity)
        Rounds up (ceiling to nearest cent) and iterates if necessary to guarantee
        that Net P&L >= $0.00 upon execution at SL_BE.
        """
        if quantity <= 0 or entry_price <= 0:
            return entry_price

        # Initial estimate based on round-trip fee at entry_price
        rt = cls.calculate_roundtrip_fee(
            entry_price=entry_price,
            quantity=quantity,
            exit_price=entry_price,
            include_stamp_duty=include_stamp_duty,
            usd_myr_rate=usd_myr_rate
        )
        fee_rt = rt["total_fee"]
        buffer_per_share = math.ceil((fee_rt / quantity) * 100.0) / 100.0
        sl_be = round(entry_price + buffer_per_share, 2)

        # Verification loop to strictly guarantee Net P&L >= 0.00
        buy_fee = rt["buy_fee"]["total_fee"]
        while True:
            sell_fee = cls.calculate_order_fee(
                price=sl_be,
                quantity=quantity,
                side="SELL",
                include_stamp_duty=include_stamp_duty,
                usd_myr_rate=usd_myr_rate
            )["total_fee"]
            gross_pl = (sl_be - entry_price) * quantity
            net_pl = gross_pl - (buy_fee + sell_fee)
            if round(net_pl, 2) >= 0.0:
                break
            sl_be = round(sl_be + 0.01, 2)

        return sl_be
