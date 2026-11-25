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
from ..moomoo_client import get_moomoo_client

logger = logging.getLogger(__name__)
NY_TZ = ZoneInfo("America/New_York")

router = APIRouter(prefix="/api/v1/trade", tags=["Trading Operations"])

# Initialize engine with shared SQLite path and moomoo client
engine = HardRulesEngine(BridgeConfig.EQUITY_BASELINE_DB)
moomoo_client = get_moomoo_client()


class SwitchAccountRequest(BaseModel):
    account_id: str = Field(..., min_length=1, description="Target trading account ID")


class ExitTradeRequest(BaseModel):
    symbol: str = Field(..., min_length=1, description="Stock symbol to exit (e.g. US.NVDA)")
    quantity: Optional[int] = Field(None, gt=0, description="Quantity to sell. If omitted, full position is closed.")
    reason: str = Field(default="AGENT_EARLY_EXIT", description="Exit reason: AGENT_EARLY_EXIT, MANUAL_LIQUIDATION, STOP_LOSS, TAKE_PROFIT")
    limit_price: Optional[float] = Field(None, gt=0, description="Optional limit price. If omitted, market exit.")


class ExitTradeResponse(BaseModel):
    status: str
    symbol: str
    quantity: int
    exit_price: float
    order_id: str
    client_order_id: str
    message: str


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

    client = get_moomoo_client()
    # Fetch verified account equity strictly from OpenD broker or verified local baseline (Fail-Closed)
    broker_equity = client.get_account_equity()
    baseline_equity = engine.get_verified_equity(trade_date, fallback=None)
    account_equity = broker_equity or baseline_equity

    if account_equity is None or account_equity <= 0:
        logger.error("Fail-closed: Unable to verify account equity from OpenD broker or official daily baseline.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "rule_code": "EQUITY_UNVERIFIED",
                "error": "Account equity cannot be verified from broker or official daily baseline (Fail-Closed mode). Order rejected."
            }
        )
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
            market_data_cache=market_cache
        )
    except HardRuleViolation as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={"rule_code": e.rule_code, "error": e.message}
        )

    # Dispatch to OpenD gateway
    gateway_resp = client.submit_order(order.model_dump())
    opend_status = client.get_connection_status()

    if gateway_resp.get("status") == "REJECTED" or not client.is_connected():
        logger.error("OpenD order dispatch rejected (fail-closed): %s", gateway_resp.get("error", "Gateway disconnected"))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "rule_code": "OPEND_DISCONNECTED",
                "error": gateway_resp.get("error", f"OpenD gateway is not connected or authenticated ({opend_status}). Order rejected."),
                "opend_status": opend_status
            }
        )

    # Register as processed for idempotency
    engine.register_order_processed(order)

    # Record day trade strictly when completing an intraday round-trip position closure
    engine.register_order_and_record_day_trade_if_roundtrip(trade_date, order)

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


@router.post("/exit-request", response_model=ExitTradeResponse)
def request_position_exit(
    payload: ExitTradeRequest,
    caller: str = Depends(authenticate_request)
):
    """
    Submits an exit request for an open position to OpenD gateway (Seksyen 3.3 D Blueprint).
    Cancels pending open orders, places SELL order, and records day trade round-trip if intraday.
    """
    from ..agent_pipeline import get_agent_pipeline
    pipeline = get_agent_pipeline()
    result = pipeline.execute_position_exit(
        symbol=payload.symbol,
        quantity=payload.quantity,
        reason=payload.reason,
        exit_price=payload.limit_price
    )
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": result.get("message", f"Failed to exit position for {payload.symbol}"),
                "symbol": payload.symbol
            }
        )

    return ExitTradeResponse(
        status="ACCEPTED",
        symbol=result["symbol"],
        quantity=result["quantity"],
        exit_price=result["exit_price"],
        order_id=result["order_id"],
        client_order_id=result["client_order_id"],
        message=result["message"]
    )


@router.post("/kill-switch")
def trigger_kill_switch(caller: str = Depends(authenticate_request)):
    """
    Emergency Rule 8 Kill Switch.
    Honestly and accurately reports OpenD daemon connectivity state.
    """
    client = get_moomoo_client()
    result = engine.execute_rule8_kill_switch(moomoo_client=client)
    return result


@router.get("/positions")
def get_positions(caller: str = Depends(authenticate_request)):
    """Returns open positions with honest gateway connection status and transaction attribution."""
    client = get_moomoo_client()
    raw_positions = client.query_positions()
    opend_status = client.get_connection_status()

    from ..agent_pipeline import get_agent_pipeline
    pipeline = get_agent_pipeline()
    try:
        pipeline.reconcile_positions_with_orders()
    except Exception as e:
        logger.warning("Position reconciliation warning in get_positions: %s", e)

    enriched_positions = []
    with pipeline._get_connection() as conn:
        for p in raw_positions:
            pos_dict = dict(p)
            code = str(pos_dict.get("code", "")).strip()
            clean_sym = code.split(".")[-1] if "." in code else code
            order_row = conn.execute("""
                SELECT order_id, cycle_id, source, created_at
                FROM paper_orders
                WHERE symbol = ? OR symbol = ?
                ORDER BY id DESC LIMIT 1
            """, (code, clean_sym)).fetchone()

            if order_row:
                pos_dict["source"] = order_row["source"] or "POSITION_RECONCILED"
                pos_dict["order_id"] = order_row["order_id"]
                pos_dict["cycle_id"] = order_row["cycle_id"]
                pos_dict["attribution_date"] = order_row["created_at"]
            else:
                pos_dict["source"] = "POSITION_RECONCILED"
                pos_dict["order_id"] = f"POS-{pos_dict.get('position_id', clean_sym)}"
                pos_dict["cycle_id"] = "RECONCILIATION"
                pos_dict["attribution_date"] = None
            enriched_positions.append(pos_dict)

    return {
        "opend_status": opend_status,
        "positions": enriched_positions
    }


@router.get("/accounts")
def get_accounts_list(caller: str = Depends(authenticate_request)):
    """
    Returns available trading accounts and active account ID (Seksyen 3.5.B Blueprint).
    """
    client = get_moomoo_client()
    if not client.is_connected():
        client.connect()
    return {
        "status": client.get_connection_status(),
        "env": client.trd_env,
        "current_account_id": client._account_id if client._account_id else "N/A",
        "accounts": client.get_accounts()
    }


@router.post("/switch-account")
def switch_trading_account(
    payload: SwitchAccountRequest,
    caller: str = Depends(authenticate_request)
):
    """
    Dynamically switches active acc_id (e.g. Paper Trading 1 vs 2) via SDK
    without restarting container (Seksyen 3.5.B Blueprint).
    """
    client = get_moomoo_client()
    success, msg = client.switch_account(payload.account_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=msg
        )
    return {
        "status": "SUCCESS",
        "message": msg,
        "account_info": client.get_account_info()
    }


@router.get("/orders")
def get_orders_history(caller: str = Depends(authenticate_request)):
    """
    Returns list of orders and paper trading history (combining processed_orders
    and OpenD queries).
    """
    client = get_moomoo_client()
    opend_orders = client.query_orders()
    from ..agent_pipeline import get_agent_pipeline
    pipeline = get_agent_pipeline()
    paper_orders = pipeline.get_paper_orders(limit=50)

    return {
        "opend_status": client.get_connection_status(),
        "env": client.trd_env,
        "broker_orders": opend_orders,
        "paper_orders": paper_orders
    }

