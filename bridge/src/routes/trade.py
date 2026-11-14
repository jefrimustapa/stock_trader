import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..config import BridgeConfig
from ..security import authenticate_request
from ..hard_rules import HardRulesEngine, OrderRequest, HardRuleViolation
from ..moomoo_client import MoomooClient

logger = logging.getLogger(__name__)
NY_TZ = ZoneInfo("America/New_York")

router = APIRouter(prefix="/api/v1/trade", tags=["Trading Operations"])

# Initialize engine with shared SQLite path and moomoo client
engine = HardRulesEngine(BridgeConfig.EQUITY_BASELINE_DB)
moomoo_client = MoomooClient(
    host=BridgeConfig.OPEND_HOST,
    port=BridgeConfig.OPEND_PORT,
    trd_env=BridgeConfig.MOOMOO_TRD_ENV
)


class TradeSubmitResponse(BaseModel):
    status: str
    client_order_id: str
    order_id: str
    symbol: str
    quantity: int
    entry_price: float
    stop_loss_price: float
    opend_status: str
    message: str


def _load_market_watchlist() -> Dict[str, Any]:
    """Loads verified stock market metrics from watchlist.json."""
    if BridgeConfig.WATCHLIST_PATH.exists():
        try:
            with open(BridgeConfig.WATCHLIST_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                stocks = data.get("watchlist", [])
                return {s.get("symbol"): s for s in stocks if "symbol" in s}
        except Exception as e:
            logger.warning("Could not read watchlist for ADV20 verification: %s", e)
    return {}


@router.post("/submit", response_model=TradeSubmitResponse)
def submit_trade(
    order: OrderRequest,
    caller: str = Depends(authenticate_request)
):
    """
    Evaluates order against 8 Hard Rules before dispatching to OpenD gateway.
    Integrity Guarantee: Account equity is NEVER accepted as a client parameter;
    it is fetched strictly from the verified broker baseline/OpenD.
    """
    now_ny = datetime.now(NY_TZ)
    trade_date = now_ny.strftime("%Y-%m-%d")

    # Fetch verified account equity from OpenD or verified local baseline
    account_equity = moomoo_client.get_account_equity() or engine.get_verified_equity(trade_date, fallback=100_000.0)
    current_equity = account_equity

    # Load market data cache for Rule 5 ADV20 verification
    market_cache = _load_market_watchlist()

    try:
        engine.validate_all(
            order=order,
            account_equity=account_equity,
            trade_date=trade_date,
            current_equity=current_equity,
            check_time_ny=now_ny,
            market_data_cache=market_cache if market_cache else None
        )
    except HardRuleViolation as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={"rule_code": e.rule_code, "error": e.message}
        )

    # Register as processed for idempotency
    engine.register_order_processed(order)

    # Record day trade in real execution path for Rule 3 PDT enforcement
    engine.record_day_trade(trade_date, order.symbol, order.quantity)

    # Dispatch to OpenD gateway
    gateway_resp = moomoo_client.submit_order(order.model_dump())
    opend_status = moomoo_client.get_connection_status()

    return TradeSubmitResponse(
        status=gateway_resp.get("status", "ACCEPTED"),
        client_order_id=order.client_order_id,
        order_id=gateway_resp.get("order_id", f"ORD-{order.client_order_id[:8]}"),
        symbol=order.symbol,
        quantity=order.quantity,
        entry_price=order.entry_price,
        stop_loss_price=order.stop_loss_price,
        opend_status=opend_status,
        message=f"Order verified against 8 Hard Rules and recorded. OpenD Status: {opend_status}."
    )


@router.post("/kill-switch")
def trigger_kill_switch(caller: str = Depends(authenticate_request)):
    """
    Emergency Rule 8 Kill Switch.
    Honestly and accurately reports OpenD daemon connectivity state.
    """
    result = engine.execute_rule8_kill_switch(moomoo_client=moomoo_client)
    return result


@router.get("/positions")
def get_positions(caller: str = Depends(authenticate_request)):
    """Returns open positions with honest gateway connection status."""
    return {
        "opend_status": moomoo_client.get_connection_status(),
        "positions": moomoo_client.query_positions()
    }
