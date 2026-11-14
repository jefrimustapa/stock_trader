import concurrent.futures
import logging
import os
import signal
import socket
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Tuple

from .config import ScreenerConfig
from .quota_tracker import QuotaTracker
from .cloud_screener import CloudScreener

try:
    from moomoo import (
        OpenQuoteContext,
        StockScreenRequest,
        SimpleProperty,
        RET_OK
    )
    from moomoo.common.open_context_base import OpenContextBase, ContextStatus
    # Patch OpenContextBase._init_connect_sync to avoid infinite while loop on auth failure
    _orig_quote_init_connect_sync = OpenContextBase._init_connect_sync
    def _safe_quote_init_connect_sync(self):
        self._auto_reconnect = False
        return _orig_quote_init_connect_sync(self)
    OpenContextBase._init_connect_sync = _safe_quote_init_connect_sync
except ImportError:
    OpenQuoteContext = None
    StockScreenRequest = None
    SimpleProperty = None
    RET_OK = 0
    ContextStatus = None

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [ScreenerDaemon] %(message)s"
)
logger = logging.getLogger(__name__)

running = True


def signal_handler(signum, frame):
    global running
    logger.info("Received termination signal %s. Shutting down daemon gracefully...", signum)
    running = False


def generate_fallback_market_data() -> List[Dict[str, Any]]:
    """Sample realistic universe data used if OpenD is offline or restarting."""
    return [
        {"symbol": "US.NVDA", "name": "NVIDIA Corp", "price": 142.50, "market_cap": 3_500_000_000_000, "adv_20": 45_000_000, "change_pct": 4.25, "rvol_15m": 2.15},
        {"symbol": "US.TSLA", "name": "Tesla Inc", "price": 235.10, "market_cap": 750_000_000_000, "adv_20": 65_000_000, "change_pct": 3.80, "rvol_15m": 1.85},
        {"symbol": "US.AMD", "name": "Advanced Micro Devices", "price": 155.20, "market_cap": 250_000_000_000, "adv_20": 35_000_000, "change_pct": 2.90, "rvol_15m": 1.60},
        {"symbol": "US.AAPL", "name": "Apple Inc", "price": 225.00, "market_cap": 3_400_000_000_000, "adv_20": 48_000_000, "change_pct": 0.85, "rvol_15m": 1.10},  # Low change
        {"symbol": "US.PENNY", "name": "Penny Stock Inc", "price": 3.50, "market_cap": 600_000_000, "adv_20": 5_000_000, "change_pct": 6.50, "rvol_15m": 3.00},  # Price < 5.0
        {"symbol": "US.LOWCAP", "name": "MicroCap Co", "price": 12.00, "market_cap": 150_000_000, "adv_20": 2_000_000, "change_pct": 5.00, "rvol_15m": 2.00},  # Cap < 500M
        {"symbol": "US.ILLIQ", "name": "Illiquid Corp", "price": 25.00, "market_cap": 800_000_000, "adv_20": 400_000, "change_pct": 4.50, "rvol_15m": 2.00},  # ADV < 1M
        {"symbol": "US.PLTR", "name": "Palantir Tech", "price": 58.40, "market_cap": 130_000_000_000, "adv_20": 55_000_000, "change_pct": 5.10, "rvol_15m": 2.40},
    ]


def fetch_market_universe(host: str, port: int) -> Tuple[List[Dict[str, Any]], float]:
    """
    Connects to OpenD OpenQuoteContext on port 11111.
    1. Fetches real-time SPY quote for benchmark relative strength.
    2. Executes server-side Cloud Screening V2 via get_stock_screen (Price >= 5.0, Cap >= 500M, Change 2-12%).
    Returns (stocks, spy_change_pct).
    Falls back gracefully if OpenD is offline or not yet authenticated.
    """
    if OpenQuoteContext is None or StockScreenRequest is None or SimpleProperty is None:
        logger.info("Moomoo OpenAPI SDK not imported; using baseline market data.")
        return generate_fallback_market_data(), 1.15

    quote_ctx = None
    try:
        try:
            quote_ctx = OpenQuoteContext(host=host, port=port, is_encrypt=False)
        except Exception as conn_err:
            logger.info("OpenQuoteContext connection failed (%s); utilizing baseline universe.", conn_err)
            return generate_fallback_market_data(), 1.15

        is_ready = False
        if quote_ctx is not None and hasattr(quote_ctx, "_status") and ContextStatus is not None:
            is_ready = (quote_ctx._status == ContextStatus.READY)

        if not is_ready:
            logger.info("OpenQuoteContext not authenticated (OpenD login pending); utilizing baseline universe.")
            return generate_fallback_market_data(), 1.15

        # 1. Query benchmark SPY snapshot for Relative Strength
        spy_change_pct = 1.15
        try:
            ret_spy, df_spy = quote_ctx.get_market_snapshot(["US.SPY"])
            if ret_spy == RET_OK and df_spy is not None and hasattr(df_spy, "empty") and not df_spy.empty:
                if "change_rate" in df_spy.columns:
                    spy_change_pct = float(df_spy["change_rate"].iloc[0])
                elif "last_price" in df_spy.columns and "prev_close_price" in df_spy.columns:
                    lp = float(df_spy["last_price"].iloc[0])
                    pc = float(df_spy["prev_close_price"].iloc[0])
                    if pc > 0:
                        spy_change_pct = round(((lp - pc) / pc) * 100.0, 2)
                logger.info("Real SPY benchmark change fetched: %+.2f%%", spy_change_pct)
        except Exception as spy_err:
            logger.warning("Could not fetch real SPY benchmark quote: %s. Using 1.15%%.", spy_err)

        # 2. Cloud Screening V2 via get_stock_screen
        req = StockScreenRequest()
        req.add_simple_property(name=SimpleProperty.PRICE, lower=5.0)
        req.add_simple_property(name=SimpleProperty.MARKET_CAP, lower=500_000_000)
        req.add_simple_property(name=SimpleProperty.PRICE_CHANGE_RATE, lower=2.0, upper=12.0)
        req.page_count = 30

        ret_screen, screen_data = quote_ctx.get_stock_screen(req)
        if ret_screen == RET_OK and screen_data is not None:
            stocks: List[Dict[str, Any]] = []
            if hasattr(screen_data, "iterrows"):
                for _, row in screen_data.iterrows():
                    symbol = str(row.get("code", ""))
                    if not symbol.startswith("US."):
                        symbol = f"US.{symbol}"
                    stocks.append({
                        "symbol": symbol,
                        "name": str(row.get("name", symbol)),
                        "price": float(row.get("cur_price", row.get("price", 50.0))),
                        "market_cap": float(row.get("market_val", row.get("market_cap", 1_000_000_000))),
                        "adv_20": float(row.get("volume", row.get("adv_20", 2_000_000))),
                        "change_pct": float(row.get("change_rate", row.get("change_pct", 3.0))),
                        "rvol_15m": float(row.get("volume_ratio", row.get("rvol_15m", 1.8)))
                    })
            elif isinstance(screen_data, (tuple, list)) and len(screen_data) >= 3:
                data_list = screen_data[2]
                for item in data_list:
                    symbol = str(item.get("code", item.get("stock_id", "")))
                    if symbol and not symbol.startswith("US."):
                        symbol = f"US.{symbol}"
                    stocks.append({
                        "symbol": symbol or "US.GENERIC",
                        "name": str(item.get("name", symbol or "US.GENERIC")),
                        "price": float(item.get("cur_price", item.get("price", 50.0))),
                        "market_cap": float(item.get("market_val", item.get("market_cap", 1_000_000_000))),
                        "adv_20": float(item.get("volume", item.get("adv_20", 2_000_000))),
                        "change_pct": float(item.get("change_rate", item.get("change_pct", 3.0))),
                        "rvol_15m": float(item.get("volume_ratio", item.get("rvol_15m", 1.8)))
                    })
            if stocks:
                logger.info("Fetched %d stocks from Moomoo Cloud Screening V2.", len(stocks))
                return stocks, spy_change_pct
            else:
                logger.info("Moomoo OpenD cloud screening returned empty stock list; utilizing baseline universe.")
                return generate_fallback_market_data(), spy_change_pct
        else:
            logger.info("Moomoo OpenD cloud screening returned %s; utilizing baseline universe.", ret_screen)
            return generate_fallback_market_data(), spy_change_pct
    except Exception as e:
        logger.warning("Error fetching market universe from OpenD at %s:%d: %s. Using baseline market data.", host, port, e)
        return generate_fallback_market_data(), 1.15
    finally:
        if quote_ctx is not None:
            try:
                quote_ctx.close()
            except Exception:
                pass


def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info("Initializing L0 Screener Daemon with Moomoo OpenAPI Cloud Screening...")
    ScreenerConfig.ensure_data_dir()

    tracker = QuotaTracker(
        db_path=ScreenerConfig.QUOTA_DB_PATH,
        max_30d_symbols=ScreenerConfig.MAX_KLINE_30D_SYMBOLS,
        max_realtime_symbols=ScreenerConfig.MAX_REALTIME_SUBSCRIPTIONS
    )

    screener = CloudScreener(
        quota_tracker=tracker,
        output_file=ScreenerConfig.WATCHLIST_PATH
    )

    interval = ScreenerConfig.SCAN_INTERVAL_SECONDS
    logger.info("Daemon started. Running scan cycle every %d seconds.", interval)

    while running:
        try:
            logger.info("Starting market universe scan cycle...")
            stocks, spy_change_pct = fetch_market_universe(
                host=ScreenerConfig.OPEND_HOST,
                port=ScreenerConfig.OPEND_PORT
            )

            output = screener.process_and_save(stocks, spy_change_pct)
            logger.info(
                "Scan cycle complete. Screened=%d, Stage1=%d, Stage2=%d, Final Watchlist=%d. Watchlist saved to %s",
                output.total_screened_cloud,
                output.stage1_passed,
                output.stage2_passed,
                len(output.watchlist),
                ScreenerConfig.WATCHLIST_PATH
            )
        except Exception as e:
            logger.error("Error during screener execution: %s", e, exc_info=True)

        for _ in range(interval):
            if not running:
                break
            time.sleep(1)

    logger.info("L0 Screener Daemon stopped cleanly.")


if __name__ == "__main__":
    main()
