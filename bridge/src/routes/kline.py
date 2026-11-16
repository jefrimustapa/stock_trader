import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query, Body, HTTPException, status
from pydantic import BaseModel

from ..security import authenticate_request
from ..moomoo_client import get_moomoo_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/kline", tags=["K-Line Chart Data"])


class ReleaseKlineRequest(BaseModel):
    symbol: str
    interval: Optional[str] = "day"


@router.get("")
def get_kline_data(
    symbol: str = Query(..., description="Stock symbol (e.g. US.AAPL or AAPL)"),
    interval: str = Query("day", description="Candle interval (day, 15m, 5m, 1m)"),
    num: int = Query(100, ge=10, le=1000, description="Number of candles (10-1000)"),
    caller: str = Depends(authenticate_request)
):
    """
    Returns current K-line candlestick and volume data via Moomoo OpenAPI (subscribe + get_cur_kline).
    Strictly preserves 30-day history quota (0 quota used).
    Enforces fail-closed semantics when OpenD is disconnected or unauthenticated.
    """
    client = get_moomoo_client()
    result = client.get_cur_kline_with_sub(symbol=symbol, interval=interval, num=num)
    result["caller"] = caller
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    return result


@router.post("/release")
def release_kline_data(
    req: ReleaseKlineRequest,
    caller: str = Depends(authenticate_request)
):
    """
    Releases active subscription reference for symbol + interval.
    Enforces OpenD 60s cooldown before unsubscribing.
    """
    client = get_moomoo_client()
    result = client.release_kline_subscription(symbol=req.symbol, interval=req.interval)
    result["caller"] = caller
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    return result


@router.get("/subscriptions")
def get_active_subscriptions(caller: str = Depends(authenticate_request)):
    """
    Reports active Moomoo OpenAPI subscription slots and cooldown hold states.
    """
    client = get_moomoo_client()
    subs = client.subscription_manager.get_subscriptions()
    return {
        "count": len(subs),
        "limit": 100,
        "subscriptions": subs,
        "caller": caller,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
