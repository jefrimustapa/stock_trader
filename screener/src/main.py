import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any

from .config import ScreenerConfig
from .quota_tracker import QuotaTracker
from .cloud_screener import CloudScreener

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


def generate_mock_market_data() -> List[Dict[str, Any]]:
    """Sample realistic universe data for mock/development runs."""
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


def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info("Initializing L0 Screener Daemon...")
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
            # For demonstration & simulation mode, feed mock data; in production can fetch via OpenD QuoteContext
            stocks = generate_mock_market_data()
            spy_change_pct = 1.15

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
