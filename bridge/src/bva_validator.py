from datetime import datetime, time
from typing import Dict, Any, Tuple
from zoneinfo import ZoneInfo

from .hard_rules import HardRulesEngine, OrderRequest, HardRuleViolation

NY_TZ = ZoneInfo("America/New_York")


class BVAValidator:
    """
    Validates Boundary Value Analysis (BVA) test cases matching the SDLC Matrix:
    - R1: 1.99%, 2.00% vs 2.01%
    - R2: 4.99%, 5.00% vs 5.01%
    - R3: 3rd vs 4th day trade
    - R4: $5.00 vs $4.99
    - R5: 1.00% vs 1.01% of ADV20
    - R6a: 09:44:59 vs 09:45:00 NY
    - R6b: 15:44:59 vs 15:45:00 NY
    - R7: New UUID vs duplicate
    - R8: Kill switch latency < 3.0s
    """

    def __init__(self, engine: HardRulesEngine):
        self.engine = engine

    def test_risk_boundary(self, equity: float, risk_percentage: float) -> Tuple[bool, str]:
        """Calculates quantity and stop loss to achieve exact risk percentage."""
        entry_price = 100.0
        stop_loss_price = 90.0  # $10 risk per share
        risk_per_share = entry_price - stop_loss_price
        target_risk_dollars = round(equity * (risk_percentage / 100.0), 2)
        quantity = int(round(target_risk_dollars / risk_per_share))

        order = OrderRequest(
            client_order_id=f"bva-risk-{risk_percentage}",
            symbol="US.TEST",
            quantity=quantity,
            entry_price=entry_price,
            stop_loss_price=stop_loss_price
        )
        try:
            self.engine.validate_rule1_max_risk(order, equity)
            return True, "PASSED"
        except HardRuleViolation as e:
            return False, str(e)

    def test_drawdown_boundary(self, opening_equity: float, current_equity: float) -> Tuple[bool, str]:
        trade_date = "2026-11-14"
        self.engine.set_opening_baseline(trade_date, opening_equity)
        try:
            self.engine.validate_rule2_daily_drawdown(trade_date, current_equity)
            return True, "PASSED"
        except HardRuleViolation as e:
            return False, str(e)

    def test_penny_stock_boundary(self, price: float) -> Tuple[bool, str]:
        order = OrderRequest(
            client_order_id=f"bva-penny-{price}",
            symbol="US.TEST",
            quantity=10,
            entry_price=price,
            stop_loss_price=price * 0.9
        )
        try:
            self.engine.validate_rule4_penny_stock(order)
            return True, "PASSED"
        except HardRuleViolation as e:
            return False, str(e)

    def test_liquidity_boundary(self, quantity: int, adv20: float) -> Tuple[bool, str]:
        order = OrderRequest(
            client_order_id=f"bva-liq-{quantity}",
            symbol="US.TEST",
            quantity=quantity,
            entry_price=50.0,
            stop_loss_price=45.0
        )
        try:
            self.engine.validate_rule5_liquidity_guard(order, adv_20=adv20)
            return True, "PASSED"
        except HardRuleViolation as e:
            return False, str(e)

    def test_time_window_boundary(self, check_time: datetime) -> Tuple[bool, str]:
        try:
            self.engine.validate_rule6_trading_window(check_time)
            return True, "PASSED"
        except HardRuleViolation as e:
            return False, str(e)
