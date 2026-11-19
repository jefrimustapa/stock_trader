"""
Market & Candidate Data API Routes (HOM-317)
Provides candidate OHLCV K-line, support/resistance, earnings dates,
and news feeds for external L1-L2 Paperclip agents (Tariq & Nawwar).
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status

from ..security import authenticate_request
from ..moomoo_client import get_moomoo_client
from ..agent_pipeline import get_agent_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/market", tags=["Candidate Market Data"])


@router.get("/candidate-kline")
def get_candidate_kline(
    symbol: str = Query(..., description="Stock symbol (e.g. US.AAPL or AAPL)"),
    num: int = Query(60, ge=10, le=250, description="Number of daily candlestick bars"),
    caller: str = Depends(authenticate_request)
):
    """
    Returns OHLCV candlestick data, computed support/resistance zones, and ATR
    for candidate stock analysis by Tariq (L1 Technical Analyst).
    """
    try:
        pipeline = get_agent_pipeline()
        moomoo_client = get_moomoo_client()

        # Check pause buying status to protect 30-day OpenAPI K-line quota
        is_paused = pipeline.get_pause_buying_status()
        clean_symbol = symbol.strip().upper()
        if not clean_symbol.startswith("US."):
            clean_symbol = f"US.{clean_symbol}"

        candles = []
        data_source = "FALLBACK_CALCULATED"

        if not is_paused and moomoo_client is not None:
            try:
                if not moomoo_client.is_connected():
                    moomoo_client.connect()
                if moomoo_client.is_connected():
                    if hasattr(moomoo_client, "get_history_kline"):
                        kl = moomoo_client.get_history_kline(clean_symbol, interval="day", num=num)
                        if kl.get("status") in ("OK", "HEALTHY") and kl.get("candles"):
                            candles = kl["candles"]
                            data_source = "MOOMOO_KLINE_REAL"
                    if not candles and hasattr(moomoo_client, "get_cur_kline_with_sub"):
                        kl = moomoo_client.get_cur_kline_with_sub(clean_symbol, interval="day", num=num)
                        if kl.get("status") in ("OK", "HEALTHY") and kl.get("candles"):
                            candles = kl["candles"]
                            data_source = "MOOMOO_KLINE_REAL"
                            moomoo_client.release_kline_subscription(clean_symbol, interval="day")
            except Exception as e:
                logger.warning("Failed to fetch K-line from Moomoo OpenAPI for %s: %s", clean_symbol, e)

        # Support & Resistance calculation from candle highs/lows
        support_levels = []
        resistance_levels = []
        atr_14 = None

        if candles:
            lows = [c["low"] for c in candles if "low" in c]
            highs = [c["high"] for c in candles if "high" in c]
            if lows and highs:
                support_levels = [round(min(lows[-20:]), 2), round(min(lows), 2)]
                resistance_levels = [round(max(highs[-20:]), 2), round(max(highs), 2)]
            
            # Simple ATR-14
            if len(candles) >= 15:
                tr_list = []
                for i in range(1, len(candles)):
                    h = candles[i]["high"]
                    l = candles[i]["low"]
                    prev_c = candles[i-1]["close"]
                    tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
                    tr_list.append(tr)
                atr_14 = round(sum(tr_list[-14:]) / 14.0, 3)

        return {
            "symbol": clean_symbol,
            "data_source": data_source,
            "pause_buying_active": is_paused,
            "candles_count": len(candles),
            "candles": candles,
            "support_levels": sorted(list(set(support_levels))),
            "resistance_levels": sorted(list(set(resistance_levels))),
            "atr_14": atr_14,
            "caller": caller,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error("Error in get_candidate_kline for %s: %s", symbol, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memproses data K-line calon: {str(e)}"
        )


@router.get("/candidate-sentiment")
def get_candidate_sentiment(
    symbol: str = Query(..., description="Stock symbol (e.g. US.AAPL or AAPL)"),
    caller: str = Depends(authenticate_request)
):
    """
    Returns latest news headlines and upcoming corporate earnings date
    for candidate stock analysis by Nawwar (L1 Sentiment & Macro Scout).
    """
    try:
        moomoo_client = get_moomoo_client()
        clean_symbol = symbol.strip().upper()
        if not clean_symbol.startswith("US."):
            clean_symbol = f"US.{clean_symbol}"

        news_items = []
        earnings_info = {
            "has_upcoming": False,
            "days_to_earnings": None,
            "earnings_date": None,
            "hard_gate_pass": True
        }

        if moomoo_client is not None:
            try:
                if not moomoo_client.is_connected():
                    moomoo_client.connect()
                if moomoo_client.is_connected():
                    # Fetch news
                    if hasattr(moomoo_client, "get_news_for_symbol"):
                        news_resp = moomoo_client.get_news_for_symbol(clean_symbol, max_news=5)
                        if news_resp.get("status") in ("OK", "HEALTHY"):
                            news_items = news_resp.get("news", [])
                    
                    # Fetch earnings
                    if hasattr(moomoo_client, "get_earnings_calendar"):
                        earn_resp = moomoo_client.get_earnings_calendar(clean_symbol)
                        if earn_resp.get("status") in ("OK", "HEALTHY"):
                            earnings_list = earn_resp.get("earnings", [])
                            now_date = datetime.now(timezone.utc).date()
                            for item in earnings_list:
                                earn_date_str = item.get("earnings_date")
                                if earn_date_str:
                                    try:
                                        ed = datetime.fromisoformat(earn_date_str).date() if "T" in earn_date_str else datetime.strptime(earn_date_str[:10], "%Y-%m-%d").date()
                                        days_diff = (ed - now_date).days
                                        if days_diff >= 0:
                                            earnings_info["has_upcoming"] = True
                                            earnings_info["days_to_earnings"] = days_diff
                                            earnings_info["earnings_date"] = str(ed)
                                            if days_diff < 5:
                                                earnings_info["hard_gate_pass"] = False
                                            break
                                    except Exception as parse_err:
                                        logger.debug("Date parse error for %s: %s", earn_date_str, parse_err)
            except Exception as e:
                logger.warning("Failed to fetch sentiment/earnings from Moomoo for %s: %s", clean_symbol, e)

        return {
            "symbol": clean_symbol,
            "news_count": len(news_items),
            "news": news_items,
            "earnings": earnings_info,
            "hard_gate_pass": earnings_info["hard_gate_pass"],
            "caller": caller,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as e:
        logger.error("Error in get_candidate_sentiment for %s: %s", symbol, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal memproses data sentimen calon: {str(e)}"
        )
