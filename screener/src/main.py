import concurrent.futures
import logging
import os
import signal
import socket
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

from .config import ScreenerConfig
from .quota_tracker import QuotaTracker
from .cloud_screener import CloudScreener

try:
    # Protobuf 4+/5+/7+ UPB compatibility patch for moomoo-api
    try:
        import google._upb._message as upb
        if hasattr(upb, "FieldDescriptor") and not hasattr(upb.FieldDescriptor, "label"):
            upb.FieldDescriptor.label = property(
                lambda self: upb.FieldDescriptor.LABEL_REPEATED if getattr(self, "is_repeated", False) else upb.FieldDescriptor.LABEL_OPTIONAL
            )
    except (ImportError, AttributeError):
        pass

    from moomoo import (
        OpenQuoteContext,
        StockScreenRequest,
        SimpleProperty,
        BasicProperty,
        CumulativeProperty,
        SimpleField,
        ScrMarket,
        SysConfig,
        RET_OK
    )
    from moomoo.common.open_context_base import OpenContextBase, ContextStatus, ReqInfo, PacketErr
    # Patch OpenContextBase._init_connect_sync to avoid infinite while loop on auth failure
    _orig_quote_init_connect_sync = OpenContextBase._init_connect_sync
    def _safe_quote_init_connect_sync(self):
        self._auto_reconnect = False
        return _orig_quote_init_connect_sync(self)
    OpenContextBase._init_connect_sync = _safe_quote_init_connect_sync

    def _fast_quote_req_wait(self):
        if self.is_sync:
            ret = self.event.wait(timeout=2.0)
            if not ret:
                self.err = PacketErr.Timeout
                self.msg = 'Abnormal event timeout'
    ReqInfo.wait = _fast_quote_req_wait
except ImportError:
    OpenQuoteContext = None
    StockScreenRequest = None
    SimpleProperty = None
    BasicProperty = None
    CumulativeProperty = None
    SimpleField = None
    ScrMarket = None
    SysConfig = None
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


def fetch_market_universe(host: str, port: int) -> Tuple[List[Dict[str, Any]], float, str, Optional[str]]:
    """
    Connects to OpenD OpenQuoteContext on port 11111.
    1. Fetches real-time SPY quote for benchmark relative strength.
    2. Executes server-side Cloud Screening V2 via get_stock_screen.
    Returns (stocks, spy_change_pct, source, warning).
    Strict fail-closed: If OpenD is offline, unauthenticated, or fails, returns empty list with OPEND_UNAVAILABLE.
    Never uses silent mock fallbacks or fake default row values.
    """
    if OpenQuoteContext is None or StockScreenRequest is None or SimpleProperty is None:
        logger.warning("Moomoo OpenAPI SDK not imported; OpenD unavailable.")
        return [], 0.0, "OPEND_UNAVAILABLE", "Moomoo OpenAPI SDK tidak dipasang."

    quote_ctx = None
    try:
        rsa_key_path = str(ScreenerConfig.RSA_KEY_PATH)
        is_encrypt = False
        if os.path.exists(rsa_key_path) and SysConfig is not None:
            try:
                SysConfig.enable_proto_encrypt(True)
                SysConfig.set_init_rsa_file(rsa_key_path)
                is_encrypt = True
                logger.info("Configured RSA protocol encryption for OpenQuoteContext from %s", rsa_key_path)
            except Exception as rsa_err:
                logger.warning("Could not set RSA key for OpenQuoteContext: %s", rsa_err)

        try:
            quote_ctx = OpenQuoteContext(host=host, port=port, is_encrypt=is_encrypt)
        except Exception as conn_err:
            logger.info("OpenQuoteContext connection failed (%s); marking OPEND_UNAVAILABLE.", conn_err)
            return [], 0.0, "OPEND_UNAVAILABLE", f"Sambungan OpenQuoteContext gagal ({conn_err})."

        is_ready = False
        if quote_ctx is not None and hasattr(quote_ctx, "_status") and ContextStatus is not None:
            is_ready = (quote_ctx._status == ContextStatus.READY)

        if not is_ready:
            logger.info("OpenQuoteContext not authenticated (OpenD login pending); marking OPEND_UNAVAILABLE.")
            return [], 0.0, "OPEND_UNAVAILABLE", "OpenD gateway belum log masuk (menunggu kredensial broker)."

        # 1. Query benchmark SPY snapshot for Relative Strength
        spy_change_pct = 0.0
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
            logger.warning("Could not fetch real SPY benchmark quote: %s. Using 0.0%%.", spy_err)

        # 2. Cloud Screening V2 via get_stock_screen
        req = StockScreenRequest()
        if SimpleField is not None and ScrMarket is not None:
            req.add_simple_field(SimpleField.MARKET, [ScrMarket.US])

        if BasicProperty is not None:
            req.add_retrieve_basic(BasicProperty.CODE)
            req.add_retrieve_basic(BasicProperty.NAME)
        if SimpleProperty is not None:
            req.add_retrieve_simple(SimpleProperty.PRICE)
            req.add_retrieve_simple(SimpleProperty.MARKET_CAP)
            req.add_retrieve_simple(SimpleProperty.PRICE_CHANGE_RATE)
            req.add_retrieve_simple(SimpleProperty.VOLUME_RATIO)
        if CumulativeProperty is not None:
            req.add_retrieve_cumulative(CumulativeProperty.AVG_VOLUME, days=20)

        req.add_simple_property(name=SimpleProperty.PRICE, lower=5.0)
        req.add_simple_property(name=SimpleProperty.MARKET_CAP, lower=500_000_000)
        # Decimal ratio in Moomoo OpenAPI (0.02 = +2%, 0.12 = +12%)
        req.add_simple_property(name=SimpleProperty.PRICE_CHANGE_RATE, lower=0.02, upper=0.12)
        req.page_count = 50

        ret_screen, screen_data = quote_ctx.get_stock_screen(req)
        if ret_screen == RET_OK and screen_data is not None:
            stocks: List[Dict[str, Any]] = []
            if hasattr(screen_data, "iterrows"):
                for _, row in screen_data.iterrows():
                    code = row.get("code")
                    if not code:
                        continue
                    symbol = str(code).strip()
                    if not symbol.startswith("US."):
                        symbol = f"US.{symbol}"

                    cur_price = row.get("cur_price") if "cur_price" in row else row.get("price")
                    market_val = row.get("market_val") if "market_val" in row else row.get("market_cap")
                    adv_val = row.get("volume") if "volume" in row else row.get("adv_20")
                    chg_val = row.get("change_rate") if "change_rate" in row else row.get("change_pct")
                    rvol_val = row.get("volume_ratio") if "volume_ratio" in row else row.get("rvol_15m")

                    # Buang lalai medan rekaan: langkau baris tidak lengkap
                    if cur_price is None or market_val is None or adv_val is None or chg_val is None or rvol_val is None:
                        continue
                    try:
                        price_f = float(cur_price)
                        market_cap_f = float(market_val)
                        adv_f = float(adv_val)
                        chg_f = float(chg_val)
                        rvol_f = float(rvol_val)
                    except (ValueError, TypeError):
                        continue

                    stocks.append({
                        "symbol": symbol,
                        "name": str(row.get("name", symbol)),
                        "price": price_f,
                        "market_cap": market_cap_f,
                        "adv_20": adv_f,
                        "change_pct": chg_f,
                        "rvol_15m": rvol_f
                    })
            elif isinstance(screen_data, (tuple, list)) and len(screen_data) >= 3:
                data_list = screen_data[2]
                for item in data_list:
                    code = item.get("code")
                    name = item.get("name")
                    cur_price = item.get("cur_price") or item.get("price")
                    market_val = item.get("market_val") or item.get("market_cap")
                    adv_val = item.get("volume") or item.get("adv_20")
                    chg_val = item.get("change_rate") or item.get("change_pct")
                    rvol_val = item.get("volume_ratio") or item.get("rvol_15m")

                    for res in item.get("results", []):
                        prop = res.get("property", {})
                        p_name = prop.get("name")
                        val = res.get("dval") if res.get("dval") is not None else (
                            res.get("ival") if res.get("ival") is not None else res.get("sval")
                        )
                        if p_name == 1101:  # BasicProperty.CODE
                            code = val
                        elif p_name == 1102:  # BasicProperty.NAME
                            name = val
                        elif p_name == 2201:  # SimpleProperty.PRICE
                            cur_price = val
                        elif p_name == 2301:  # SimpleProperty.MARKET_CAP
                            market_val = val
                        elif p_name == 2206:  # SimpleProperty.PRICE_CHANGE_RATE (decimal ratio -> %)
                            chg_val = float(val) * 100.0 if val is not None else None
                        elif p_name == 2217:  # SimpleProperty.VOLUME_RATIO
                            rvol_val = val
                        elif p_name == 3104:  # CumulativeProperty.AVG_VOLUME
                            adv_val = val

                    if not code or cur_price is None or market_val is None or adv_val is None or chg_val is None or rvol_val is None:
                        continue
                    try:
                        price_f = float(cur_price)
                        market_cap_f = float(market_val)
                        adv_f = float(adv_val)
                        chg_f = float(chg_val)
                        rvol_f = float(rvol_val)
                    except (ValueError, TypeError):
                        continue

                    symbol = str(code).strip()
                    if not symbol.startswith("US."):
                        symbol = f"US.{symbol}"

                    stocks.append({
                        "symbol": symbol,
                        "name": str(name or symbol),
                        "price": price_f,
                        "market_cap": market_cap_f,
                        "adv_20": adv_f,
                        "change_pct": round(chg_f, 2),
                        "rvol_15m": round(rvol_f, 2)
                    })
            logger.info("Fetched %d verified stocks from Moomoo Cloud Screening V2.", len(stocks))
            return stocks, spy_change_pct, "REAL", None
        else:
            logger.warning("Moomoo OpenD cloud screening returned ret_code=%s; marking OPEND_UNAVAILABLE.", ret_screen)
            return [], spy_change_pct, "OPEND_UNAVAILABLE", f"OpenD Cloud Screening memulangkan ralat ({ret_screen}: {screen_data})."
    except Exception as e:
        logger.warning("Error fetching market universe from OpenD at %s:%d: %s.", host, port, e)
        return [], 0.0, "OPEND_UNAVAILABLE", f"Ralat komunikasi OpenD: {e}"
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
            stocks, spy_change_pct, source, warning = fetch_market_universe(
                host=ScreenerConfig.OPEND_HOST,
                port=ScreenerConfig.OPEND_PORT
            )

            output = screener.process_and_save(
                raw_stocks=stocks,
                spy_change_pct=spy_change_pct,
                source=source,
                warning=warning
            )
            logger.info(
                "Scan cycle complete. Source=%s, Screened=%d, Stage1=%d, Stage2=%d, Final Watchlist=%d. Watchlist saved to %s",
                output.source,
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
