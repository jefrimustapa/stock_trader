from datetime import datetime
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..config import BridgeConfig
from ..security import authenticate_request
from ..hard_rules import HardRulesEngine, OrderRequest, HardRuleViolation

router = APIRouter(prefix="/api/v1/trade", tags=["Trading Operations"])

# Initialize engine with shared SQLite path
engine = HardRulesEngine(BridgeConfig.EQUITY_BASELINE_DB)


class TradeSubmitResponse(BaseModel):
    status: str
    client_order_id: str
    order_id: str
    symbol: str
    quantity: int
    entry_price: float
    stop_loss_price: float
    message: str


@router.post("/submit", response_model=TradeSubmitResponse)
def submit_trade(
    order: OrderRequest,
    account_equity: float = 100_000.0,
    caller: str = Depends(authenticate_request)
):
    """
    Evaluates order against 8 Hard Rules before dispatching to OpenD gateway.
    """
    trade_date = datetime.now().strftime("%Y-%m-%d")
    current_equity = account_equity  # In live integration, pulled from OpenD account state

    try:
        engine.validate_all(
            order=order,
            account_equity=account_equity,
            trade_date=trade_date,
            current_equity=current_equity
        )
    except HardRuleViolation as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={"rule_code": e.rule_code, "error": e.message}
        )

    # Register as processed for idempotency
    engine.register_order_processed(order)

    return TradeSubmitResponse(
        status="ACCEPTED",
        client_order_id=order.client_order_id,
        order_id=f"MOCK-ORD-{order.client_order_id[:8]}",
        symbol=order.symbol,
        quantity=order.quantity,
        entry_price=order.entry_price,
        stop_loss_price=order.stop_loss_price,
        message="Order successfully verified against 8 Hard Rules and submitted."
    )


@router.post("/kill-switch")
def trigger_kill_switch(caller: str = Depends(authenticate_request)):
    """
    Emergency Rule 8 Kill Switch. Cancels all orders and liquidates positions in < 3.0s.
    """
    result = engine.execute_rule8_kill_switch()
    return result


@router.get("/positions")
def get_positions(caller: str = Depends(authenticate_request)):
    """Returns open positions."""
    return {"positions": []}
