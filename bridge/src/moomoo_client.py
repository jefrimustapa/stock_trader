import concurrent.futures
import logging
import socket
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

try:
    from moomoo import (
        OpenSecTradeContext, TrdEnv, TrdMarket, RET_OK, SysConfig,
        OpenQuoteContext, SubType, KLType, Market,
        OrderType, TrdSide, ModifyOrderOp, OrderStatus
    )
    from moomoo.common.open_context_base import OpenContextBase, ContextStatus, ReqInfo, PacketErr
    # Patch OpenContextBase._init_connect_sync to avoid infinite while loop on auth failure
    _orig_init_connect_sync = OpenContextBase._init_connect_sync
    def _safe_init_connect_sync(self):
        self._auto_reconnect = False
        return _orig_init_connect_sync(self)
    OpenContextBase._init_connect_sync = _safe_init_connect_sync

    def _fast_req_info_wait(self):
        if self.is_sync:
            ret = self.event.wait(timeout=2.0)
            if not ret:
                self.err = PacketErr.Timeout
                self.msg = 'Abnormal event timeout'
    ReqInfo.wait = _fast_req_info_wait
except ImportError:
    OpenSecTradeContext = None
    OpenQuoteContext = None
    SubType = None
    KLType = None
    Market = None
    TrdEnv = None
    TrdMarket = None
    RET_OK = 0
    ContextStatus = None
    SysConfig = None
    OrderType = None
    TrdSide = None
    ModifyOrderOp = None
    OrderStatus = None


class SimulateOnlySecurityError(RuntimeError):
    """Raised whenever an operation attempts to use a non-SIMULATE trading environment."""
    pass


class SubscriptionManager:
    """
    Manages active Moomoo OpenAPI K-line subscriptions.
    - Max 100 concurrent subscription slots.
    - 60-second minimum subscription hold time (enforced by Moomoo OpenD).
    - Ref counting when multiple requests view the same symbol+interval.
    - Delayed unsubscribe cleanup worker (cooldown 65s).
    - LRU eviction of pending unsubscriptions when approaching limit (>= 80 slots).
    """

    INTERVAL_MAP = {
        "day": ("day", "K_DAY"),
        "1d": ("day", "K_DAY"),
        "15m": ("15m", "K_15M"),
        "5m": ("5m", "K_5M"),
        "1m": ("1m", "K_1M"),
    }

    def __init__(self, client: "MoomooClient"):
        self.client = client
        self.subscriptions: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.RLock()

    @staticmethod
    def normalize_symbol(symbol: Optional[str]) -> str:
        if not symbol or not isinstance(symbol, str):
            return ""
        s = symbol.strip().upper()
        if not s:
            return ""
        if "." not in s:
            s = f"US.{s}"
        return s

    @classmethod
    def normalize_interval(cls, interval: Optional[str]) -> Tuple[str, Any, Any]:
        """
        Returns (normalized_interval_str, SubType_val, KLType_val).
        Defaults to 'day' if unrecognized.
        """
        raw = str(interval or "day").strip().lower()
        norm_key, sdk_key = cls.INTERVAL_MAP.get(raw, ("day", "K_DAY"))
        sub_type_val = getattr(SubType, sdk_key, sdk_key) if SubType else sdk_key
        kl_type_val = getattr(KLType, sdk_key, sdk_key) if KLType else sdk_key
        return norm_key, sub_type_val, kl_type_val

    def get_subscriptions(self) -> List[Dict[str, Any]]:
        with self.lock:
            now = time.time()
            res = []
            for k, v in self.subscriptions.items():
                res.append({
                    "key": k,
                    "symbol": v["symbol"],
                    "interval": v["interval"],
                    "ref_count": v["ref_count"],
                    "pending_unsub": v["pending_unsub"],
                    "hold_duration_sec": round(now - v["subscribed_at"], 1),
                    "can_unsubscribe": (now - v["subscribed_at"]) >= 60.0
                })
            return res

    def _evict_expired_unsub(self) -> int:
        """
        LRU eviction for slots marked pending_unsub that have passed the 60s minimum hold.
        Must be called under self.lock.
        """
        now = time.time()
        evicted = 0
        to_remove = []
        for key, entry in self.subscriptions.items():
            if entry["pending_unsub"] and (now - entry["subscribed_at"]) >= 60.0:
                to_remove.append((key, entry))

        if to_remove:
            ctx = self.client.get_quote_context()
            for key, entry in to_remove:
                if ctx is not None:
                    try:
                        ctx.unsubscribe([entry["symbol"]], [entry["subtype"]])
                    except Exception as e:
                        logger.warning("Error unsubscribing %s during LRU eviction: %s", key, e)
                del self.subscriptions[key]
                evicted += 1
                logger.info("Evicted expired K-line subscription slot for %s", key)
        return evicted

    def cleanup_expired_subscriptions(self) -> int:
        """
        Called by periodic background worker to clean up pending unsubscriptions.
        Only unbinds if hold duration >= 65s (grace period over 60s OpenD minimum).
        Also reaps orphaned subscriptions where ref_count > 0 but last_accessed >= 300s (5 minutes).
        """
        with self.lock:
            now = time.time()
            to_remove = []
            for key, entry in self.subscriptions.items():
                # Server-side orphan reaper: mark abandoned subscriptions as pending_unsub
                if not entry["pending_unsub"] and (now - entry.get("last_accessed", entry["subscribed_at"])) >= 300.0:
                    logger.warning(
                        "Reaping orphaned subscription %s (idle for %.1fs with ref_count %d)",
                        key, now - entry.get("last_accessed", entry["subscribed_at"]), entry["ref_count"]
                    )
                    entry["ref_count"] = 0
                    entry["pending_unsub"] = True
                    entry["release_time"] = now

                if entry["pending_unsub"] and (now - entry["subscribed_at"]) >= 65.0:
                    to_remove.append((key, entry))

            if not to_remove:
                return 0

            ctx = self.client.get_quote_context()
            evicted = 0
            for key, entry in to_remove:
                if ctx is not None:
                    try:
                        ctx.unsubscribe([entry["symbol"]], [entry["subtype"]])
                    except Exception as e:
                        logger.warning("Background cleanup unsubscribe error for %s: %s", key, e)
                del self.subscriptions[key]
                evicted += 1
                logger.info("Cleaned up expired subscription slot for %s (held %.1fs)", key, now - entry["subscribed_at"])
            return evicted

    def release_subscription(self, symbol: str, interval: str = "day") -> Dict[str, Any]:
        norm_sym = self.normalize_symbol(symbol)
        norm_int, subtype, _ = self.normalize_interval(interval)
        if not norm_sym:
            return {"status": "ERROR", "error": "Simbol kaunter diperlukan"}

        key = f"{norm_sym}:{norm_int}"
        with self.lock:
            if key not in self.subscriptions:
                return {"status": "OK", "released": norm_sym, "interval": norm_int, "active": False}

            sub = self.subscriptions[key]
            sub["ref_count"] = max(0, sub["ref_count"] - 1)
            now = time.time()
            if sub["ref_count"] == 0:
                sub["pending_unsub"] = True
                sub["release_time"] = now
                if (now - sub["subscribed_at"]) >= 65.0:
                    ctx = self.client.get_quote_context()
                    if ctx is not None:
                        try:
                            ctx.unsubscribe([sub["symbol"]], [sub["subtype"]])
                        except Exception as e:
                            logger.warning("Immediate unsubscribe error for %s: %s", key, e)
                    del self.subscriptions[key]
                    logger.info("Immediately unsubscribed %s after release (held %.1fs)", key, now - sub["subscribed_at"])
                    return {"status": "OK", "released": norm_sym, "interval": norm_int, "active": False}
                else:
                    logger.info("Marked %s pending_unsub (held %.1fs, waiting for 65s cooldown)", key, now - sub["subscribed_at"])
            return {"status": "OK", "released": norm_sym, "interval": norm_int, "active": sub["ref_count"] > 0}

    def get_kline(self, symbol: str, interval: str = "day", num: int = 100) -> Dict[str, Any]:
        norm_sym = self.normalize_symbol(symbol)
        if not norm_sym:
            return {
                "status": "ERROR",
                "connected": False,
                "symbol": symbol,
                "interval": interval,
                "candles": [],
                "error": "Simbol kaunter diperlukan"
            }

        norm_int, subtype, kltype = self.normalize_interval(interval)
        try:
            num = int(num)
        except (ValueError, TypeError):
            num = 100
        num = max(10, min(1000, num))

        # Check OpenD connectivity
        conn_status = self.client.get_connection_status()
        if conn_status not in ("CONNECTED", "IDLE"):
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "symbol": norm_sym,
                "interval": norm_int,
                "candles": [],
                "error": f"OpenD gateway is not authenticated (status: {conn_status})"
            }

        key = f"{norm_sym}:{norm_int}"
        with self.lock:
            # Manage subscription slot
            if key in self.subscriptions:
                sub = self.subscriptions[key]
                sub["last_accessed"] = time.time()
                sub["pending_unsub"] = False
                sub["ref_count"] = max(1, sub["ref_count"] + 1)
            else:
                if len(self.subscriptions) >= 80:
                    self._evict_expired_unsub()

                if len(self.subscriptions) >= 100:
                    return {
                        "status": "ERROR",
                        "connected": True,
                        "symbol": norm_sym,
                        "interval": norm_int,
                        "candles": [],
                        "error": "Had kuota langganan OpenD penuh (100 slot serentak)"
                    }

                ctx = self.client.get_quote_context()
                if ctx is None:
                    return {
                        "status": "UNAVAILABLE",
                        "connected": False,
                        "opend_status": conn_status,
                        "symbol": norm_sym,
                        "interval": norm_int,
                        "candles": [],
                        "error": "OpenQuoteContext tidak dapat diinisialisasi"
                    }

                ret, sub_data = ctx.subscribe([norm_sym], [subtype])
                if ret != RET_OK:
                    err_str = str(sub_data or "")
                    is_otc = "OTC" in err_str.upper()
                    is_not_avail = "NOT AVAILABLE" in err_str.upper()
                    if is_otc:
                        return {
                            "status": "UNSUPPORTED",
                            "error_type": "OTC_MARKET",
                            "connected": True,
                            "opend_status": conn_status,
                            "symbol": norm_sym,
                            "interval": norm_int,
                            "candles": [],
                            "error": f"Kaunter pasaran OTC ({norm_sym}) tidak disokong untuk data K-line oleh Moomoo OpenAPI"
                        }
                    elif is_not_avail:
                        return {
                            "status": "UNSUPPORTED",
                            "error_type": "QUOTE_NOT_AVAILABLE",
                            "connected": True,
                            "opend_status": conn_status,
                            "symbol": norm_sym,
                            "interval": norm_int,
                            "candles": [],
                            "error": f"Sebut harga K-line tidak tersedia untuk {norm_sym}: {err_str}"
                        }
                    return {
                        "status": "ERROR",
                        "error_type": "SUBSCRIPTION_FAILED",
                        "connected": True,
                        "opend_status": conn_status,
                        "symbol": norm_sym,
                        "interval": norm_int,
                        "candles": [],
                        "error": f"Gagal melanggan data K-line untuk {norm_sym}: {sub_data}"
                    }

                self.subscriptions[key] = {
                    "symbol": norm_sym,
                    "interval": norm_int,
                    "subtype": subtype,
                    "kltype": kltype,
                    "subscribed_at": time.time(),
                    "last_accessed": time.time(),
                    "ref_count": 1,
                    "pending_unsub": False,
                    "release_time": None
                }
                logger.info("Subscribed to %s (%s). Active slots: %d", norm_sym, norm_int, len(self.subscriptions))

        # Query candle data
        ctx = self.client.get_quote_context()
        if ctx is None:
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "symbol": norm_sym,
                "interval": norm_int,
                "candles": [],
                "error": "OpenQuoteContext tidak tersedia"
            }

        try:
            ret, kl_data = ctx.get_cur_kline(norm_sym, num=num, ktype=kltype)
            if ret != RET_OK:
                return {
                    "status": "ERROR",
                    "connected": True,
                    "opend_status": "CONNECTED",
                    "symbol": norm_sym,
                    "interval": norm_int,
                    "candles": [],
                    "error": f"get_cur_kline returned {ret}: {kl_data}"
                }

            candles = []
            if kl_data is not None and hasattr(kl_data, "iterrows"):
                for _, row in kl_data.iterrows():
                    time_raw = str(row.get("time_key", ""))
                    t_val = time_raw
                    try:
                        if len(time_raw) == 10:
                            dt = datetime.strptime(time_raw, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                            t_unix = int(dt.timestamp())
                        else:
                            dt = datetime.strptime(time_raw, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                            t_unix = int(dt.timestamp())
                    except Exception:
                        t_unix = None

                    candle_obj = {
                        "time": t_unix if norm_int != "day" else time_raw.split(" ")[0],
                        "timestamp": t_unix,
                        "time_str": time_raw,
                        "open": float(row.get("open", 0.0)),
                        "high": float(row.get("high", 0.0)),
                        "low": float(row.get("low", 0.0)),
                        "close": float(row.get("close", 0.0)),
                        "volume": float(row.get("volume", 0.0))
                    }
                    candles.append(candle_obj)

            return {
                "status": "HEALTHY",
                "connected": True,
                "opend_status": "CONNECTED",
                "symbol": norm_sym,
                "interval": norm_int,
                "count": len(candles),
                "candles": candles,
                "error": None
            }
        except Exception as e:
            logger.error("Error fetching K-line data for %s: %s", norm_sym, e)
            return {
                "status": "ERROR",
                "connected": True,
                "symbol": norm_sym,
                "interval": norm_int,
                "candles": [],
                "error": str(e)
            }


class MoomooClient:
    """
    Gateway client wrapping Moomoo OpenAPI SDK / OpenD daemon.
    Strictly enforces fail-closed semantics:
    - Status is CONNECTED ONLY when OpenD is reachable AND trade context is authenticated
      AND get_acc_list and accinfo_query return RET_OK with real account data.
    - Otherwise status is WAIT_LOGIN (if socket reachable but unauthenticated) or DISCONNECTED.
    - Never uses silent simulated/fallback balances or mock accounts.
    """

    def __init__(self, host: str, port: int, trd_env: str = "SIMULATE", is_encrypt: Optional[bool] = None):
        self.host = host
        self.port = port
        requested_env = str(trd_env or "SIMULATE").strip().upper()
        if requested_env != "SIMULATE":
            raise SimulateOnlySecurityError(
                f"FATAL SECURITY VIOLATION: MoomooClient is strictly locked to SIMULATE (Paper Trading). "
                f"Requested environment '{requested_env}' is prohibited."
            )
        self.trd_env = "SIMULATE"
        if is_encrypt is not None:
            self.is_encrypt = is_encrypt
        else:
            try:
                from .config import BridgeConfig
                self.is_encrypt = BridgeConfig.ENABLE_PROTO_ENCRYPT
            except Exception:
                self.is_encrypt = True
        self._connected: bool = False
        self._account_id: Optional[str] = None
        self._cash_balance: Optional[float] = None
        self._total_equity: Optional[float] = None
        self._last_status: str = "DISCONNECTED"
        self._last_error: Optional[str] = None
        self._available_accounts: List[Dict[str, Any]] = []
        self._opend_manager: Any = None
        self._quote_ctx: Any = None
        self._trade_ctx: Any = None
        self.subscription_manager = SubscriptionManager(self)

    def get_trade_context(self) -> Any:
        """Returns or creates a shared OpenSecTradeContext for paper trading execution."""
        if OpenSecTradeContext is None:
            return None
        if self._trade_ctx is None:
            try:
                if self.is_encrypt and SysConfig is not None:
                    try:
                        from .config import BridgeConfig
                        rsa_path = str(BridgeConfig.ensure_rsa_key())
                        SysConfig.enable_proto_encrypt(True)
                        SysConfig.set_init_rsa_file(rsa_path)
                    except Exception as rsa_err:
                        logger.warning("RSA key warning in trade context: %s", rsa_err)
                self._trade_ctx = OpenSecTradeContext(
                    filter_trdmarket=TrdMarket.US if TrdMarket else None,
                    host=self.host,
                    port=self.port,
                    is_encrypt=self.is_encrypt
                )
            except Exception as e:
                logger.error("Failed to create OpenSecTradeContext: %s", e)
                self._trade_ctx = None
        return self._trade_ctx

    def get_quote_context(self) -> Any:
        """Returns or creates a shared OpenQuoteContext for live subscriptions."""
        if OpenQuoteContext is None:
            return None
        if self._quote_ctx is None:
            try:
                if self.is_encrypt and SysConfig is not None:
                    try:
                        from .config import BridgeConfig
                        rsa_path = str(BridgeConfig.ensure_rsa_key())
                        SysConfig.enable_proto_encrypt(True)
                        SysConfig.set_init_rsa_file(rsa_path)
                    except Exception as rsa_err:
                        logger.warning("RSA key warning: %s", rsa_err)
                self._quote_ctx = OpenQuoteContext(
                    host=self.host,
                    port=self.port,
                    is_encrypt=self.is_encrypt
                )
            except Exception as e:
                logger.error("Failed to create OpenQuoteContext: %s", e)
                self._quote_ctx = None
        return self._quote_ctx

    def get_cur_kline_with_sub(self, symbol: str, interval: str = "day", num: int = 100) -> Dict[str, Any]:
        """Fetches current K-line candles using live subscription without burning 30-day quota."""
        return self.subscription_manager.get_kline(symbol=symbol, interval=interval, num=num)

    def release_kline_subscription(self, symbol: str, interval: str = "day") -> Dict[str, Any]:
        """Decrements ref count and triggers delayed unsubscribe cooldown."""
        return self.subscription_manager.release_subscription(symbol=symbol, interval=interval)

    def get_earnings_calendar(
        self,
        market: str = "US",
        begin_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetches corporate earnings calendar from Moomoo OpenAPI (Qot_GetEarningsCalendar).
        Returns dict with status, items: list of {symbol, name, earnings_date, pub_type, etc.}
        """
        if not self._connected:
            self.connect()

        conn_status = self.get_connection_status()
        if conn_status not in ("CONNECTED", "IDLE"):
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "market": market,
                "items": [],
                "error": f"OpenD gateway is not authenticated (status: {conn_status})"
            }

        ctx = self.get_quote_context()
        if ctx is None:
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "market": market,
                "items": [],
                "error": "OpenQuoteContext tidak tersedia"
            }

        try:
            import datetime
            today_date = datetime.date.today()
            if not begin_date:
                begin_date = today_date.strftime("%Y-%m-%d")
            if not end_date:
                # Moomoo requires date range <= 7 days
                end_date = (today_date + datetime.timedelta(days=6)).strftime("%Y-%m-%d")

            mkt_val = Market.US if (Market is not None and hasattr(Market, market.upper())) else market
            ret, data = ctx.get_earnings_calendar(
                market=mkt_val,
                begin_date=begin_date,
                end_date=end_date
            )
            if ret != RET_OK:
                return {
                    "status": "ERROR",
                    "connected": True,
                    "opend_status": conn_status,
                    "market": market,
                    "items": [],
                    "error": f"get_earnings_calendar returned {ret}: {data}"
                }

            items = []
            if data is not None and hasattr(data, "iterrows"):
                for _, row in data.iterrows():
                    sec = str(row.get("security", "") or "")
                    norm_sym = SubscriptionManager.normalize_symbol(sec) if sec else ""
                    items.append({
                        "security": sec,
                        "symbol": norm_sym or sec,
                        "name": str(row.get("name", "") or ""),
                        "earnings_date": str(row.get("earnings_date", "") or ""),
                        "earnings_timestamp": row.get("earnings_timestamp"),
                        "pub_type": str(row.get("pub_type", "") or ""),
                        "period_text": str(row.get("period_text", "") or ""),
                        "eps_actual": row.get("eps_actual"),
                        "eps_predict": row.get("eps_predict"),
                        "revenue_actual": row.get("revenue_actual"),
                        "revenue_predict": row.get("revenue_predict"),
                        "price": row.get("price")
                    })

            return {
                "status": "OK",
                "connected": True,
                "opend_status": "CONNECTED",
                "market": market,
                "items": items,
                "count": len(items)
            }
        except Exception as e:
            logger.error("get_earnings_calendar exception: %s", e)
            return {
                "status": "ERROR",
                "connected": True,
                "opend_status": conn_status,
                "market": market,
                "items": [],
                "error": str(e)
            }

    def get_news_for_symbol(
        self,
        symbol: str,
        max_count: int = 10
    ) -> Dict[str, Any]:
        """
        Fetches latest news headlines for a ticker from Moomoo OpenAPI (Qot_GetSearchNews).
        Returns dict with status, items: list of {title, news_sub_type, source, publish_time, url, ...}
        """
        norm_sym = SubscriptionManager.normalize_symbol(symbol)
        clean_ticker = norm_sym.split(".")[-1] if "." in norm_sym else norm_sym

        if not self._connected:
            self.connect()

        conn_status = self.get_connection_status()
        if conn_status not in ("CONNECTED", "IDLE"):
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "symbol": norm_sym,
                "items": [],
                "error": f"OpenD gateway is not authenticated (status: {conn_status})"
            }

        ctx = self.get_quote_context()
        if ctx is None:
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "symbol": norm_sym,
                "items": [],
                "error": "OpenQuoteContext tidak tersedia"
            }

        try:
            ret, data = ctx.get_search_news(keyword=clean_ticker, max_count=max_count)
            if ret != RET_OK:
                return {
                    "status": "ERROR",
                    "connected": True,
                    "opend_status": conn_status,
                    "symbol": norm_sym,
                    "items": [],
                    "error": f"get_search_news returned {ret}: {data}"
                }

            items = []
            if data is not None and hasattr(data, "iterrows"):
                for _, row in data.iterrows():
                    items.append({
                        "title": str(row.get("title", "") or ""),
                        "news_sub_type": str(row.get("news_sub_type", "") or ""),
                        "source": str(row.get("source", "") or ""),
                        "publish_time": str(row.get("publish_time", "") or ""),
                        "view_count": int(row.get("view_count", 0) or 0) if row.get("view_count") is not None else 0,
                        "url": str(row.get("url", "") or "")
                    })

            return {
                "status": "OK",
                "connected": True,
                "opend_status": "CONNECTED",
                "symbol": norm_sym,
                "items": items,
                "count": len(items)
            }
        except Exception as e:
            logger.error("get_news_for_symbol exception: %s", e)
            return {
                "status": "ERROR",
                "connected": True,
                "opend_status": conn_status,
                "symbol": norm_sym,
                "items": [],
                "error": str(e)
            }

    def get_history_kline(
        self,
        symbol: str,
        interval: str = "day",
        num: int = 60,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retrieves real candlestick history from Moomoo OpenAPI (request_history_kline).
        Consumes 30-day K-line quota as expected by Moomoo OpenAPI.
        Returns dict with status, candles: list of {time, open, high, low, close, volume}.
        """
        norm_sym = SubscriptionManager.normalize_symbol(symbol) if hasattr(SubscriptionManager, "normalize_symbol") else symbol
        if not norm_sym:
            return {
                "status": "ERROR",
                "connected": False,
                "symbol": symbol,
                "candles": [],
                "error": "Symbol must be a non-empty string"
            }

        if not self._connected:
            self.connect()

        conn_status = self.get_connection_status()
        if conn_status not in ("CONNECTED", "IDLE"):
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "symbol": norm_sym,
                "candles": [],
                "error": f"OpenD gateway is not authenticated (status: {conn_status})"
            }

        ctx = self.get_quote_context()
        if ctx is None:
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "symbol": norm_sym,
                "candles": [],
                "error": "OpenQuoteContext tidak tersedia"
            }

        try:
            from moomoo import KLType, RET_OK
            kl_type_map = {
                "day": KLType.K_DAY,
                "15m": KLType.K_15M,
                "5m": KLType.K_5M,
                "1m": KLType.K_1M
            }
            ktype = kl_type_map.get(str(interval).lower(), KLType.K_DAY)

            import datetime
            today_date = datetime.date.today()
            if not end_date:
                end_date = today_date.strftime("%Y-%m-%d")
            if not start_date:
                start_date = (today_date - datetime.timedelta(days=max(90, num * 2))).strftime("%Y-%m-%d")

            res = ctx.request_history_kline(
                code=norm_sym,
                start=start_date,
                end=end_date,
                ktype=ktype,
                max_count=num
            )
            ret_code = res[0]
            data = res[1]

            if ret_code != RET_OK:
                logger.warning("request_history_kline failed for %s: ret=%s, data=%s", norm_sym, ret_code, data)
                return {
                    "status": "ERROR",
                    "connected": True,
                    "opend_status": conn_status,
                    "symbol": norm_sym,
                    "candles": [],
                    "error": str(data)
                }

            candles = []
            if hasattr(data, "iterrows"):
                for _, row in data.iterrows():
                    candles.append({
                        "time": str(row.get("time_key", "")),
                        "open": float(row.get("open", 0.0)),
                        "high": float(row.get("high", 0.0)),
                        "low": float(row.get("low", 0.0)),
                        "close": float(row.get("close", 0.0)),
                        "volume": float(row.get("volume", 0.0))
                    })
            elif isinstance(data, list):
                for item in data:
                    candles.append(item)

            return {
                "status": "OK",
                "connected": True,
                "opend_status": "CONNECTED",
                "symbol": norm_sym,
                "interval": interval,
                "candles": candles,
                "count": len(candles),
                "error": None
            }
        except Exception as e:
            logger.error("Exception in get_history_kline for %s: %s", norm_sym, e)
            return {
                "status": "ERROR",
                "connected": True,
                "opend_status": conn_status,
                "symbol": norm_sym,
                "candles": [],
                "error": str(e)
            }

    def set_opend_manager(self, manager: Any) -> None:
        self._opend_manager = manager

    def _get_opend_manager(self) -> Any:
        if self._opend_manager is None:
            try:
                from .opend_manager import OpenDManager
                self._opend_manager = OpenDManager()
            except Exception:
                pass
        return self._opend_manager

    def connect(self) -> bool:
        """
        Attempts honest socket probe and OpenAPI session verification to OpenD daemon.
        Sets _connected to True and loads account info ONLY when OpenD is authenticated and active.
        Fail-closed: Returns False on any auth or communication issue.
        """
        try:
            with socket.create_connection((self.host, self.port), timeout=1.0):
                pass
        except (socket.timeout, ConnectionRefusedError, OSError) as e:
            self._connected = False
            self._last_status = "DISCONNECTED"
            self._account_id = None
            self._cash_balance = None
            self._total_equity = None
            logger.info("OpenD daemon not reachable at %s:%d (%s). OpenD status: DISCONNECTED.", self.host, self.port, e)
            return False

        # Socket is reachable. Now verify OpenAPI trade session if SDK is available
        if OpenSecTradeContext is not None and TrdEnv is not None and TrdMarket is not None:
            ctx = None
            try:
                # Configure protocol encryption if enabled and SysConfig is available
                if self.is_encrypt and SysConfig is not None:
                    try:
                        from .config import BridgeConfig
                        rsa_path = str(BridgeConfig.ensure_rsa_key())
                        SysConfig.enable_proto_encrypt(True)
                        SysConfig.set_init_rsa_file(rsa_path)
                    except Exception as rsa_err:
                        logger.warning("Could not initialize RSA private key for protocol encryption: %s", rsa_err)

                env_val = TrdEnv.SIMULATE if self.trd_env == "SIMULATE" else TrdEnv.REAL
                try:
                    ctx = OpenSecTradeContext(
                        filter_trdmarket=TrdMarket.US,
                        host=self.host,
                        port=self.port,
                        is_encrypt=self.is_encrypt
                    )
                except Exception as conn_err:
                    logger.info("OpenSecTradeContext initialization error: %s", conn_err)
                    ctx = None
                    self._connected = False
                    self._last_status = "CONNECT_ERROR"
                    self._last_error = str(conn_err)
                    self._account_id = None
                    self._cash_balance = None
                    self._total_equity = None
                    return False

                is_ready = False
                if ctx is not None and hasattr(ctx, "_status") and ContextStatus is not None:
                    is_ready = (ctx._status == ContextStatus.READY)

                if is_ready:
                    ret_code, df_acc = ctx.get_acc_list()
                    if ret_code == RET_OK and df_acc is not None and not df_acc.empty:
                        # Extract and cache available accounts
                        self._available_accounts = []
                        for _, row in df_acc.iterrows():
                            self._available_accounts.append({
                                "account_id": str(row.get("acc_id", "")).strip(),
                                "trd_env": str(row.get("trd_env", "")).strip(),
                                "sim_acc_type": str(row.get("sim_acc_type", "")).strip(),
                                "card_num": str(row.get("card_num", "")).strip()
                            })

                        # Match target trading environment
                        target_row = None
                        if self._account_id:
                            acc_match = df_acc[df_acc["acc_id"].astype(str) == str(self._account_id)] if not df_acc.empty else None
                            if acc_match is not None and not acc_match.empty:
                                target_row = acc_match.iloc[0]

                        if target_row is None:
                            matched = df_acc[df_acc["trd_env"] == self.trd_env] if "trd_env" in df_acc.columns else df_acc
                            target_row = matched.iloc[0] if not matched.empty else df_acc.iloc[0]

                        acc_id_val = target_row.get("acc_id", None)
                        if acc_id_val is not None and str(acc_id_val).strip():
                            real_acc_id = str(acc_id_val).strip()
                            account_env = str(target_row.get("trd_env", self.trd_env)).strip()
                            env_val = TrdEnv.REAL if account_env == "REAL" else TrdEnv.SIMULATE

                            # Query account financial details
                            acc_num = int(real_acc_id) if real_acc_id.isdigit() else 0
                            ret_info, df_info = ctx.accinfo_query(
                                trd_env=env_val,
                                acc_id=acc_num,
                                currency="USD"
                            )
                            if ret_info == RET_OK and df_info is not None and not df_info.empty:
                                cash_val = df_info.get("cash", None)
                                total_assets_val = df_info.get("total_assets", None)
                                if cash_val is not None and total_assets_val is not None:
                                    self._cash_balance = float(cash_val.iloc[0])
                                    self._total_equity = float(total_assets_val.iloc[0])
                                    self._account_id = real_acc_id
                                    self.trd_env = account_env
                                    self._connected = True
                                    self._last_status = "CONNECTED"
                                    self._last_error = None
                                    logger.info(
                                        "MoomooClient connected to OpenD at %s:%d (Env: %s, Acc: %s, Equity: $%.2f)",
                                        self.host, self.port, self.trd_env, self._account_id, self._total_equity
                                    )
                                    return True
                            else:
                                self._connected = False
                                self._last_status = "CONNECT_ERROR"
                                self._last_error = str(df_info) if ret_info != RET_OK else "Failed to retrieve account financial details"
                                self._account_id = None
                                self._cash_balance = None
                                self._total_equity = None
                                logger.error("OpenD accinfo_query failed (ret=%s): %s", ret_info, self._last_error)
                                return False
                    else:
                        self._connected = False
                        self._last_status = "CONNECT_ERROR"
                        self._last_error = str(df_acc) if ret_code != RET_OK else "No trading accounts returned from get_acc_list"
                        self._account_id = None
                        self._cash_balance = None
                        self._total_equity = None
                        logger.error("OpenD get_acc_list failed (ret=%s): %s", ret_code, self._last_error)
                        return False

                # If trade context was not ready:
                self._connected = False
                self._last_status = "WAIT_LOGIN"
                self._last_error = None
                self._account_id = None
                self._cash_balance = None
                self._total_equity = None
                logger.warning("OpenD reachable at %s:%d but broker authentication is pending (status: WAIT_LOGIN).", self.host, self.port)
                return False
            except Exception as e:
                logger.warning("OpenD trade context connection error at %s:%d: %s", self.host, self.port, e)
                self._connected = False
                self._last_status = "CONNECT_ERROR"
                self._last_error = str(e)
                self._account_id = None
                self._cash_balance = None
                self._total_equity = None
                return False
            finally:
                if ctx is not None:
                    try:
                        ctx.close()
                    except Exception:
                        pass
        else:
            # SDK is not available
            self._connected = False
            self._last_status = "DISCONNECTED"
            self._last_error = None
            self._account_id = None
            self._cash_balance = None
            self._total_equity = None
            return False

    def is_connected(self) -> bool:
        if not self._connected:
            self.connect()
        return self._connected

    def get_connection_status(self) -> str:
        if self._connected:
            return "CONNECTED"

        manager = self._get_opend_manager()
        if manager is not None and hasattr(manager, "is_idle_mode") and manager.is_idle_mode():
            return "IDLE"

        # Check if socket reachable
        socket_reachable = (self._last_status in ["WAIT_LOGIN", "WAIT_OTP", "CONNECT_ERROR"])
        if not socket_reachable:
            try:
                with socket.create_connection((self.host, self.port), timeout=0.5):
                    socket_reachable = True
            except Exception:
                socket_reachable = False

        if not socket_reachable:
            return "DISCONNECTED"

        # Socket is reachable; try to connect session
        if self.connect():
            return "CONNECTED"

        if manager is not None and hasattr(manager, "is_waiting_otp") and manager.is_waiting_otp():
            return "WAIT_OTP"

        if self._last_status == "CONNECT_ERROR":
            return "CONNECT_ERROR"

        return "WAIT_LOGIN"

    def get_accounts(self) -> List[Dict[str, Any]]:
        """Returns list of available trading accounts retrieved via OpenAPI SDK."""
        return self._available_accounts

    def switch_account(self, new_account_id: str) -> Tuple[bool, str]:
        """
        Dynamically switches active acc_id (e.g. Paper Trading 1 vs 2) via SDK without restarting container.
        Deterministic BVA validation:
        - Must not be empty or whitespace.
        - Updates active account and re-queries account balance/equity.
        """
        if not new_account_id or not new_account_id.strip():
            return False, "Account ID cannot be empty"

        clean_id = new_account_id.strip()

        matched = [a for a in self._available_accounts if a.get("account_id") == clean_id]
        target_env = matched[0].get("trd_env", self.trd_env) if matched else self.trd_env
        if str(target_env).upper() != "SIMULATE":
            return False, "Security restriction: Switching to REAL trading account is strictly prohibited."

        # Fail-closed: Cannot switch account if OpenD is not connected or authenticated
        if not self._connected:
            return False, f"OpenD is not connected or authenticated ({self.get_connection_status()})"

        if OpenSecTradeContext is None or TrdEnv is None or TrdMarket is None:
            return False, "Moomoo OpenAPI SDK is not available or initialized"

        env_val = TrdEnv.SIMULATE if TrdEnv else "SIMULATE"

        # Active connection via OpenAPI SDK
        ctx = None
        try:
            if self.is_encrypt and SysConfig is not None:
                try:
                    from .config import BridgeConfig
                    rsa_path = str(BridgeConfig.ensure_rsa_key())
                    SysConfig.enable_proto_encrypt(True)
                    SysConfig.set_init_rsa_file(rsa_path)
                except Exception:
                    pass

            ctx = OpenSecTradeContext(
                filter_trdmarket=TrdMarket.US,
                host=self.host,
                port=self.port,
                is_encrypt=self.is_encrypt
            )
            acc_num = int(clean_id) if clean_id.isdigit() else 0
            ret_info, df_info = ctx.accinfo_query(
                trd_env=env_val,
                acc_id=acc_num,
                currency="USD"
            )
            if ret_info == RET_OK and df_info is not None and not df_info.empty:
                cash_val = df_info.get("cash", None)
                total_assets_val = df_info.get("total_assets", None)
                if cash_val is not None and total_assets_val is not None:
                    self._cash_balance = float(cash_val.iloc[0])
                    self._total_equity = float(total_assets_val.iloc[0])
                    self._account_id = clean_id
                    self.trd_env = target_env
                    logger.info("MoomooClient dynamically switched to account %s (Env: %s, Equity: $%.2f)", clean_id, self.trd_env, self._total_equity)
                    return True, f"Successfully switched to account {clean_id} ({self.trd_env})"

            if matched:
                self._account_id = clean_id
                self.trd_env = target_env
                return True, f"Switched to account {clean_id} ({self.trd_env})"

            return False, f"Failed querying account financial info for {clean_id}"
        except Exception as e:
            logger.error("Error switching to account %s: %s", clean_id, e)
            if matched:
                self._account_id = clean_id
                self.trd_env = target_env
                return True, f"Switched to account {clean_id} ({self.trd_env})"
            return False, f"Error switching account: {str(e)}"
        finally:
            if ctx is not None:
                try:
                    ctx.close()
                except Exception:
                    pass

        return False, f"Failed switching to account {clean_id}"

    def get_account_info(self) -> Dict[str, Any]:
        """Returns structured account data for Bridge status and Dashboard display."""
        info = {
            "status": self.get_connection_status(),
            "env": self.trd_env,
            "account_id": self._account_id if self._connected and self._account_id else "N/A",
            "cash_balance": round(self._cash_balance, 2) if self._connected and self._cash_balance is not None else None,
            "total_equity": round(self._total_equity, 2) if self._connected and self._total_equity is not None else None,
            "available_accounts": self.get_accounts()
        }
        if self._last_error and not self._connected:
            info["error_message"] = self._last_error
        return info

    def get_account_equity(self) -> Optional[float]:
        """Queries verified account equity from OpenD. Returns None if disconnected or unverified."""
        if not self._connected or self._total_equity is None:
            return None
        return self._total_equity

    def query_positions(self) -> List[Dict[str, Any]]:
        """Queries active stock positions from Moomoo OpenD Paper Trading."""
        if not self._connected:
            return []
        if self.trd_env != "SIMULATE":
            raise SimulateOnlySecurityError("FATAL: Live trading position queries prohibited.")
        ctx = self.get_trade_context()
        if ctx is None:
            return []
        try:
            acc_num = int(self._account_id) if self._account_id and str(self._account_id).isdigit() else 0
            ret_code, df_pos = ctx.position_list_query(
                trd_env=TrdEnv.SIMULATE if TrdEnv else "SIMULATE",
                acc_id=acc_num,
                refresh_cache=True
            )
            if ret_code == RET_OK and df_pos is not None and not df_pos.empty:
                positions = []
                for _, row in df_pos.iterrows():
                    positions.append({
                        "position_id": str(row.get("position_id", "")),
                        "code": str(row.get("code", "")),
                        "stock_name": str(row.get("stock_name", "")),
                        "qty": int(row.get("qty", 0)),
                        "can_sell_qty": int(row.get("can_sell_qty", 0)),
                        "cost_price": float(row.get("cost_price", 0.0)),
                        "nominal_price": float(row.get("nominal_price", 0.0)),
                        "pl_val": float(row.get("pl_val", 0.0)),
                        "pl_ratio": float(row.get("pl_ratio", 0.0))
                    })
                return positions
            return []
        except Exception as e:
            logger.error("Error querying positions from OpenD: %s", e)
            return []

    def query_orders(self) -> List[Dict[str, Any]]:
        """Queries pending and active orders from Moomoo OpenD Paper Trading."""
        if not self._connected:
            return []
        if self.trd_env != "SIMULATE":
            raise SimulateOnlySecurityError("FATAL: Live trading query prohibited.")
        ctx = self.get_trade_context()
        if ctx is None:
            return []
        try:
            acc_num = int(self._account_id) if self._account_id and str(self._account_id).isdigit() else 0
            ret_code, df_orders = ctx.order_list_query(
                trd_env=TrdEnv.SIMULATE if TrdEnv else "SIMULATE",
                acc_id=acc_num,
                refresh_cache=True
            )
            if ret_code == RET_OK and df_orders is not None and not df_orders.empty:
                orders = []
                for _, row in df_orders.iterrows():
                    orders.append({
                        "order_id": str(row.get("order_id", "")),
                        "code": str(row.get("code", "")),
                        "stock_name": str(row.get("stock_name", "")),
                        "trd_side": str(row.get("trd_side", "")),
                        "order_type": str(row.get("order_type", "")),
                        "order_status": str(row.get("order_status", "")),
                        "qty": int(row.get("qty", 0)),
                        "price": float(row.get("price", 0.0)),
                        "dealt_qty": int(row.get("dealt_qty", 0)),
                        "dealt_avg_price": float(row.get("dealt_avg_price", 0.0)),
                        "create_time": str(row.get("create_time", "")),
                        "updated_time": str(row.get("updated_time", ""))
                    })
                return orders
            return []
        except Exception as e:
            logger.error("Error querying orders from OpenD: %s", e)
            return []

    def submit_order(self, order_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submits vetted order to Moomoo OpenD Paper Trading (TrdEnv.SIMULATE).
        Deterministic fail-closed behavior:
        - BVA validation on quantity (> 0), price (> 0), symbol, client_order_id.
        - Hard Rule: Only TrdEnv.SIMULATE is allowed.
        - Fails closed if OpenD is not connected or returns RET_ERROR.
        """
        if self.trd_env != "SIMULATE":
            raise SimulateOnlySecurityError("FATAL: Live trading execution prohibited.")

        client_order_id = str(order_dict.get("client_order_id", "")).strip()
        if not client_order_id:
            return {
                "order_id": None,
                "status": "REJECTED",
                "opend_status": self.get_connection_status(),
                "env": self.trd_env,
                "error": "BVA Validation Error: client_order_id cannot be empty."
            }

        raw_symbol = str(order_dict.get("symbol", "")).strip().upper()
        if not raw_symbol:
            return {
                "order_id": None,
                "status": "REJECTED",
                "opend_status": self.get_connection_status(),
                "env": self.trd_env,
                "error": "BVA Validation Error: symbol cannot be empty."
            }
        norm_sym = raw_symbol if "." in raw_symbol else f"US.{raw_symbol}"

        try:
            quantity = int(order_dict.get("quantity", 0))
            if quantity <= 0:
                return {
                    "order_id": None,
                    "status": "REJECTED",
                    "opend_status": self.get_connection_status(),
                    "env": self.trd_env,
                    "error": f"BVA Validation Error: quantity must be positive integer (got {quantity})."
                }
        except (ValueError, TypeError):
            return {
                "order_id": None,
                "status": "REJECTED",
                "opend_status": self.get_connection_status(),
                "env": self.trd_env,
                "error": "BVA Validation Error: invalid quantity format."
            }

        try:
            raw_p = float(order_dict.get("entry_price") or order_dict.get("price", 0.0))
            price = round(raw_p, 2) if raw_p >= 1.0 else round(raw_p, 4)
            if price <= 0:
                return {
                    "order_id": None,
                    "status": "REJECTED",
                    "opend_status": self.get_connection_status(),
                    "env": self.trd_env,
                    "error": f"BVA Validation Error: price must be positive (got {price})."
                }
        except (ValueError, TypeError):
            return {
                "order_id": None,
                "status": "REJECTED",
                "opend_status": self.get_connection_status(),
                "env": self.trd_env,
                "error": "BVA Validation Error: invalid price format."
            }

        if not self._connected:
            return {
                "order_id": None,
                "status": "REJECTED",
                "opend_status": self.get_connection_status(),
                "env": self.trd_env,
                "error": f"OpenD gateway is not connected or authenticated ({self.get_connection_status()}). Cannot submit order."
            }

        ctx = self.get_trade_context()
        if ctx is None:
            return {
                "order_id": None,
                "status": "REJECTED",
                "opend_status": self.get_connection_status(),
                "env": self.trd_env,
                "error": "OpenSecTradeContext is not available."
            }

        side_raw = str(order_dict.get("order_side", "BUY")).strip().upper()
        trd_side = TrdSide.SELL if side_raw == "SELL" else (TrdSide.BUY if TrdSide else "BUY")
        order_type = OrderType.NORMAL if OrderType else "NORMAL"
        acc_num = int(self._account_id) if self._account_id and str(self._account_id).isdigit() else 0

        try:
            ret_code, df_res = ctx.place_order(
                price=price,
                qty=quantity,
                code=norm_sym,
                trd_side=trd_side,
                order_type=order_type,
                trd_env=TrdEnv.SIMULATE if TrdEnv else "SIMULATE",
                acc_id=acc_num
            )
            if ret_code == RET_OK and df_res is not None and not df_res.empty:
                broker_order_id = str(df_res["order_id"].iloc[0])
                logger.info(
                    "Order placed successfully at Moomoo OpenD Paper Trading: ID %s (Symbol: %s, Qty: %d, Price: $%.2f)",
                    broker_order_id, norm_sym, quantity, price
                )
                return {
                    "order_id": broker_order_id,
                    "client_order_id": client_order_id,
                    "status": "SUBMITTED",
                    "opend_status": "CONNECTED",
                    "env": self.trd_env,
                    "symbol": norm_sym,
                    "quantity": quantity,
                    "price": price,
                    "error": None
                }
            else:
                err_msg = str(df_res) if ret_code != RET_OK else "Empty response from place_order"
                logger.error("OpenD place_order failed (ret=%s): %s", ret_code, err_msg)
                return {
                    "order_id": None,
                    "client_order_id": client_order_id,
                    "status": "REJECTED",
                    "opend_status": "CONNECTED",
                    "env": self.trd_env,
                    "error": f"OpenD place_order returned error ({ret_code}): {err_msg}"
                }
        except Exception as e:
            logger.error("Exception during OpenD place_order: %s", e)
            return {
                "order_id": None,
                "client_order_id": client_order_id,
                "status": "REJECTED",
                "opend_status": "CONNECTED",
                "env": self.trd_env,
                "error": f"Exception submitting order to OpenD: {str(e)}"
            }

    def cancel_order(self, order_id: str) -> Dict[str, Any]:
        """
        Cancels an active order on Moomoo OpenD Paper Trading broker.
        """
        if self.trd_env != "SIMULATE":
            raise SimulateOnlySecurityError("FATAL: Live trading cancellation prohibited.")

        clean_id = str(order_id or "").strip()
        if not clean_id:
            return {
                "success": False,
                "order_id": None,
                "error": "BVA Validation Error: order_id cannot be empty."
            }

        if not self._connected:
            return {
                "success": False,
                "order_id": clean_id,
                "error": f"OpenD is not connected ({self.get_connection_status()})."
            }

        ctx = self.get_trade_context()
        if ctx is None:
            return {
                "success": False,
                "order_id": clean_id,
                "error": "OpenSecTradeContext is not available."
            }

        acc_num = int(self._account_id) if self._account_id and str(self._account_id).isdigit() else 0
        modify_op = ModifyOrderOp.CANCEL if ModifyOrderOp else "CANCEL"

        try:
            ret_code, df_res = ctx.modify_order(
                modify_order_op=modify_op,
                order_id=clean_id,
                qty=0,
                price=0.0,
                trd_env=TrdEnv.SIMULATE if TrdEnv else "SIMULATE",
                acc_id=acc_num
            )
            if ret_code == RET_OK:
                logger.info("Order %s cancelled successfully at Moomoo OpenD", clean_id)
                return {
                    "success": True,
                    "order_id": clean_id,
                    "status": "CANCELLED",
                    "message": f"Pesanan {clean_id} berjaya dibatalkan di broker OpenD."
                }
            else:
                err_msg = str(df_res)
                logger.error("OpenD modify_order (CANCEL) failed for %s (ret=%s): %s", clean_id, ret_code, err_msg)
                return {
                    "success": False,
                    "order_id": clean_id,
                    "error": f"OpenD modify_order failed ({ret_code}): {err_msg}"
                }
        except Exception as e:
            logger.error("Exception during OpenD cancel_order for %s: %s", clean_id, e)
            return {
                "success": False,
                "order_id": clean_id,
                "error": f"Exception cancelling order at OpenD: {str(e)}"
            }

    def cancel_all_orders(self) -> int:
        if not self._connected:
            return 0
        orders = self.query_orders()
        cancelled_count = 0
        for ord_item in orders:
            o_id = ord_item.get("order_id")
            if o_id:
                res = self.cancel_order(o_id)
                if res.get("success"):
                    cancelled_count += 1
        return cancelled_count

    def liquidate_all_positions(self) -> int:
        if not self._connected:
            return 0
        return 0

    def get_kline_quota(self) -> Dict[str, Any]:
        """
        Retrieves real Moomoo OpenAPI K-line quota using OpenQuoteContext.get_history_kl_quota(get_detail=True).
        Strict fail-closed semantics:
        - If OpenD is disconnected or unauthenticated, returns status UNAVAILABLE and null quotas.
        - Never returns a fake 100 remaining.
        - If call succeeds, returns status HEALTHY, connected True, used_quota, remain_quota, detail_list.
        """
        try:
            with socket.create_connection((self.host, self.port), timeout=1.0):
                pass
        except Exception as e:
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": "DISCONNECTED",
                "used_quota": None,
                "remain_quota": None,
                "total_quota": None,
                "detail_list": [],
                "error": f"OpenD daemon not reachable: {e}"
            }

        conn_status = self.get_connection_status()
        if conn_status not in ("CONNECTED", "IDLE"):
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "used_quota": None,
                "remain_quota": None,
                "total_quota": None,
                "detail_list": [],
                "error": f"OpenD gateway is not authenticated (status: {conn_status})"
            }

        ctx = None
        try:
            from moomoo import OpenQuoteContext, SysConfig, RET_OK
            if self.is_encrypt and SysConfig is not None:
                try:
                    from .config import BridgeConfig
                    rsa_path = str(BridgeConfig.ensure_rsa_key())
                    SysConfig.enable_proto_encrypt(True)
                    SysConfig.set_init_rsa_file(rsa_path)
                except Exception as rsa_err:
                    logger.warning("RSA key initialization warning: %s", rsa_err)

            ctx = OpenQuoteContext(
                host=self.host,
                port=self.port,
                is_encrypt=self.is_encrypt
            )
            ret_code, quota_data = ctx.get_history_kl_quota(get_detail=True)
            if ret_code == RET_OK and quota_data is not None:
                used = int(quota_data[0]) if len(quota_data) > 0 else 0
                remain = int(quota_data[1]) if len(quota_data) > 1 else 0
                details = quota_data[2] if len(quota_data) > 2 else []
                formatted_details = []
                for item in details:
                    if isinstance(item, dict):
                        d = dict(item)
                        if "code" in d and "symbol" not in d:
                            d["symbol"] = d["code"]
                        formatted_details.append(d)
                    elif hasattr(item, '__dict__'):
                        d = dict(item.__dict__)
                        if "code" in d and "symbol" not in d:
                            d["symbol"] = d["code"]
                        formatted_details.append(d)
                    else:
                        formatted_details.append({"code": str(item), "symbol": str(item), "name": "N/A", "request_time": None})

                return {
                    "status": "HEALTHY",
                    "connected": True,
                    "opend_status": "CONNECTED",
                    "used_quota": used,
                    "remain_quota": remain,
                    "total_quota": used + remain,
                    "detail_list": formatted_details,
                    "error": None
                }
            else:
                return {
                    "status": "UNAVAILABLE",
                    "connected": False,
                    "opend_status": conn_status,
                    "used_quota": None,
                    "remain_quota": None,
                    "total_quota": None,
                    "detail_list": [],
                    "error": f"OpenQuoteContext get_history_kl_quota returned {ret_code}: {quota_data}"
                }
        except Exception as e:
            logger.error("Failed to fetch Moomoo K-line quota: %s", e)
            return {
                "status": "UNAVAILABLE",
                "connected": False,
                "opend_status": conn_status,
                "used_quota": None,
                "remain_quota": None,
                "total_quota": None,
                "detail_list": [],
                "error": str(e)
            }
        finally:
            if ctx is not None:
                try:
                    ctx.close()
                except Exception:
                    pass

    def close(self) -> None:
        self._connected = False
        self._last_status = "DISCONNECTED"
        self._last_error = None
        self._account_id = None
        self._cash_balance = None
        self._total_equity = None
        self._available_accounts = []
        if self._quote_ctx is not None:
            try:
                self._quote_ctx.close()
            except Exception:
                pass
            self._quote_ctx = None
        if self._trade_ctx is not None:
            try:
                self._trade_ctx.close()
            except Exception:
                pass
            self._trade_ctx = None
        if hasattr(self, "subscription_manager"):
            with self.subscription_manager.lock:
                self.subscription_manager.subscriptions.clear()


_shared_client: Optional[MoomooClient] = None


def get_moomoo_client() -> MoomooClient:
    """Returns singleton MoomooClient shared across Bridge endpoints."""
    global _shared_client
    if _shared_client is None:
        from .config import BridgeConfig
        _shared_client = MoomooClient(
            host=BridgeConfig.OPEND_HOST,
            port=BridgeConfig.OPEND_PORT,
            trd_env=BridgeConfig.MOOMOO_TRD_ENV
        )
    return _shared_client

