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
from zoneinfo import ZoneInfo

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


def determine_market_status(dt: Optional[datetime] = None) -> Tuple[str, bool]:
    """
    Determines market status based on America/New_York regular trading hours.
    Returns (market_status, is_live):
      - 'OPEN', True: Monday-Friday 09:30:00 to 15:59:59 NY
      - 'PRE_POST', False: Monday-Friday outside 09:30-16:00
      - 'CLOSED', False: Saturday, Sunday, or NYSE Holiday
    """
    try:
        ny_tz = ZoneInfo("America/New_York")
    except Exception:
        # Fallback to timezone.utc if tzdata missing
        ny_tz = timezone.utc

    now_ny = dt.astimezone(ny_tz) if dt else datetime.now(ny_tz)

    # Weekends (5 = Saturday, 6 = Sunday)
    if now_ny.weekday() in (5, 6):
        return "CLOSED", False

    market_open = now_ny.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now_ny.replace(hour=16, minute=0, second=0, microsecond=0)

    if market_open <= now_ny < market_close:
        return "OPEN", True

    return "PRE_POST", False


def fetch_market_universe(host: str, port: int) -> Tuple[List[Dict[str, Any]], float, str, Optional[str], int]:
    """
    Connects to OpenD OpenQuoteContext on port 11111.
    1. Fetches real-time SPY quote for benchmark relative strength.
    2. Executes server-side Cloud Screening V2 (Approach C coarse filter, 0 K-line quota).
       PRICE_CHANGE_RATE is 100% removed from cloud screening to prevent chasing bias.
    Returns (stocks, spy_change_pct, source, warning, skipped_count).
    Strict fail-closed: If OpenD is offline, unauthenticated, or fails, returns empty list with OPEND_UNAVAILABLE.
    Never uses silent mock fallbacks.
    """
    if OpenQuoteContext is None or StockScreenRequest is None or SimpleProperty is None:
        logger.warning("Moomoo OpenAPI SDK not imported; OpenD unavailable.")
        return [], 0.0, "OPEND_UNAVAILABLE", "Moomoo OpenAPI SDK tidak dipasang.", 0

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
            return [], 0.0, "OPEND_UNAVAILABLE", f"Sambungan OpenQuoteContext gagal ({conn_err}).", 0

        is_ready = False
        if quote_ctx is not None and hasattr(quote_ctx, "_status") and ContextStatus is not None:
            is_ready = (quote_ctx._status == ContextStatus.READY)

        if not is_ready:
            logger.info("OpenQuoteContext not authenticated (OpenD login pending); marking OPEND_UNAVAILABLE.")
            return [], 0.0, "OPEND_UNAVAILABLE", "OpenD gateway belum log masuk (menunggu kredensial broker).", 0

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

        # 2. Cloud Screening V2 via get_stock_screen (Approach C: coarse cloud filter)
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
            if hasattr(SimpleProperty, "PRICE_TO_52W_HIGH"):
                req.add_retrieve_simple(SimpleProperty.PRICE_TO_52W_HIGH)
        if CumulativeProperty is not None:
            req.add_retrieve_cumulative(CumulativeProperty.AVG_VOLUME, days=20)

        # Baseline Institutional Quality Filters (PRICE_CHANGE_RATE is removed 100% from cloud query)
        req.add_simple_property(name=SimpleProperty.PRICE, lower=ScreenerConfig.CLOUD_MIN_PRICE)
        req.add_simple_property(name=SimpleProperty.MARKET_CAP, lower=ScreenerConfig.CLOUD_MIN_MARKET_CAP)
        if CumulativeProperty is not None and hasattr(CumulativeProperty, "AVG_VOLUME"):
            req.add_cumulative_property(name=CumulativeProperty.AVG_VOLUME, days=20, lower=ScreenerConfig.CLOUD_MIN_ADV20)
        if hasattr(SimpleProperty, "PRICE_TO_52W_HIGH"):
            req.add_simple_property(name=SimpleProperty.PRICE_TO_52W_HIGH, lower=ScreenerConfig.CLOUD_MIN_PRICE_TO_52W_HIGH)

        req.page_count = 200

        ret_screen, screen_data = quote_ctx.get_stock_screen(req)
        if ret_screen == RET_OK and screen_data is not None:
            stocks: List[Dict[str, Any]] = []
            skipped_count = 0
            missing_breakdown: Dict[str, int] = {}
            raw_count = 0

            if hasattr(screen_data, "iterrows"):
                raw_count = len(screen_data)
                for _, row in screen_data.iterrows():
                    code = row.get("code")
                    if not code:
                        skipped_count += 1
                        missing_breakdown["code"] = missing_breakdown.get("code", 0) + 1
                        continue
                    symbol = str(code).strip()
                    if not symbol.startswith("US."):
                        symbol = f"US.{symbol}"

                    cur_price = row.get("cur_price") if "cur_price" in row else row.get("price")
                    market_val = row.get("market_val") if "market_val" in row else row.get("market_cap")
                    adv_val = row.get("volume") if "volume" in row else row.get("adv_20")
                    chg_val = row.get("change_rate") if "change_rate" in row else row.get("change_pct")
                    rvol_val = row.get("volume_ratio") if "volume_ratio" in row else row.get("rvol_15m")
                    dist_52w = row.get("price_to_52w_high", 0.0)

                    missing = []
                    if cur_price is None: missing.append("price")
                    if market_val is None: missing.append("market_cap")
                    if adv_val is None: missing.append("adv_20")
                    if chg_val is None: missing.append("change_pct")
                    if rvol_val is None: missing.append("rvol_15m")

                    if missing:
                        skipped_count += 1
                        for m in missing:
                            missing_breakdown[m] = missing_breakdown.get("m", 0) + 1
                        continue

                    try:
                        price_f = float(cur_price)
                        market_cap_f = float(market_val)
                        adv_f = float(adv_val)
                        chg_f = float(chg_val)
                        rvol_f = float(rvol_val)
                        dist_52w_f = float(dist_52w) if dist_52w is not None else 0.0
                    except (ValueError, TypeError):
                        skipped_count += 1
                        missing_breakdown["parse_error"] = missing_breakdown.get("parse_error", 0) + 1
                        continue

                    stocks.append({
                        "symbol": symbol,
                        "name": str(row.get("name", symbol)),
                        "price": price_f,
                        "market_cap": market_cap_f,
                        "adv_20": adv_f,
                        "change_pct": round(chg_f, 2),
                        "rvol_15m": round(rvol_f, 2),
                        "price_to_52w_high": dist_52w_f,
                        "dist_52w": dist_52w_f
                    })
            elif isinstance(screen_data, (tuple, list)) and len(screen_data) >= 3:
                data_list = screen_data[2]
                raw_count = len(data_list)
                for item in data_list:
                    code = item.get("code")
                    name = item.get("name")
                    cur_price = item.get("cur_price") or item.get("price")
                    market_val = item.get("market_val") or item.get("market_cap")
                    adv_val = item.get("volume") or item.get("adv_20")
                    chg_val = item.get("change_rate") or item.get("change_pct")
                    rvol_val = item.get("volume_ratio") or item.get("rvol_15m")
                    dist_52w = None

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
                        elif p_name == 2209:  # SimpleProperty.PRICE_TO_52W_HIGH
                            dist_52w = float(val) if val is not None else None
                        elif p_name == 2217:  # SimpleProperty.VOLUME_RATIO
                            rvol_val = val
                        elif p_name == 3104:  # CumulativeProperty.AVG_VOLUME
                            adv_val = val

                    missing = []
                    if not code: missing.append("code")
                    if cur_price is None: missing.append("price")
                    if market_val is None: missing.append("market_cap")
                    if adv_val is None: missing.append("adv_20")
                    if chg_val is None: missing.append("change_pct")
                    if rvol_val is None: missing.append("rvol_15m")

                    if missing:
                        skipped_count += 1
                        for m in missing:
                            missing_breakdown[m] = missing_breakdown.get(m, 0) + 1
                        continue

                    try:
                        price_f = float(cur_price)
                        market_cap_f = float(market_val)
                        adv_f = float(adv_val)
                        chg_f = float(chg_val)
                        rvol_f = float(rvol_val)
                        dist_52w_f = float(dist_52w) if dist_52w is not None else 0.0
                    except (ValueError, TypeError):
                        skipped_count += 1
                        missing_breakdown["parse_error"] = missing_breakdown.get("parse_error", 0) + 1
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
                        "rvol_15m": round(rvol_f, 2),
                        "price_to_52w_high": dist_52w_f,
                        "dist_52w": dist_52w_f
                    })

            logger.info(
                "Cloud Screening raw: %d returned. Valid: %d. Skipped incomplete: %d (reasons: %s)",
                raw_count, len(stocks), skipped_count, missing_breakdown
            )
            return stocks, spy_change_pct, "REAL", None, skipped_count
        else:
            logger.warning("Moomoo OpenD cloud screening returned ret_code=%s; marking OPEND_UNAVAILABLE.", ret_screen)
            return [], spy_change_pct, "OPEND_UNAVAILABLE", f"OpenD Cloud Screening memulangkan ralat ({ret_screen}: {screen_data}).", 0
    except Exception as e:
        logger.warning("Error fetching market universe from OpenD at %s:%d: %s.", host, port, e)
        return [], 0.0, "OPEND_UNAVAILABLE", f"Ralat komunikasi OpenD: {e}", 0
    finally:
        if quote_ctx is not None:
            try:
                quote_ctx.close()
            except Exception:
                pass


def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info("Initializing L0 Screener Daemon with Approach C Hybrid Screening...")
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
            # Hot-read active configuration from SQLite database before screening
            active_cfg = ScreenerConfig.load_active_config()
            logger.info(
                "Active Screener Parameters: min_price=$%.2f, min_market_cap=$%.0f, min_adv20=%.0f, min_rvol=%.2f",
                ScreenerConfig.CLOUD_MIN_PRICE,
                ScreenerConfig.CLOUD_MIN_MARKET_CAP,
                ScreenerConfig.CLOUD_MIN_ADV20,
                ScreenerConfig.MOM_MIN_RVOL
            )
            market_status, is_live = determine_market_status()
            logger.info("Current market session: %s (is_live=%s)", market_status, is_live)

            stocks, spy_change_pct, source, warning, skipped_count = fetch_market_universe(
                host=ScreenerConfig.OPEND_HOST,
                port=ScreenerConfig.OPEND_PORT
            )

            output = screener.process_and_save(
                raw_stocks=stocks,
                spy_change_pct=spy_change_pct,
                market_status=market_status,
                is_live=is_live,
                source=source,
                warning=warning,
                cloud_skipped_count=skipped_count
            )
            logger.info(
                "Scan cycle complete. Source=%s, MarketStatus=%s, RawCloud=%d, Stage0=%d, MomCandidates=%d, SetupCandidates=%d, FinalWatchlist=%d",
                output.source,
                output.market_status,
                output.funnel.cloud_raw_returned,
                output.funnel.stage0_quality_passed,
                output.funnel.lane_momentum_candidates,
                output.funnel.lane_setup_candidates,
                len(output.watchlist)
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
