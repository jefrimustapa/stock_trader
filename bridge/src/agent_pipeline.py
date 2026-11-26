"""
Agent Pipeline Orchestrator for US Stock Analyst & Trader (HOM-291)
Enforces multi-tier agent decision architecture:
- L0: Screener Watchlist (Dual-lane: Momentum & Setup)
- L1: Tariq (Technical) & Nawwar (Sentiment & Macro)
- L2: Haziq (Portfolio & Strategy Lead - Synthesis & Sizing)
- L3: Danial (Risk & Compliance Officer - 8 Hard Rules Gatekeeper)
- L4: Execution to Moomoo OpenD Paper Trading (MOOMOO_TRD_ENV=SIMULATE)
"""

import json
import logging
import math
import sqlite3
import threading
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from .config import BridgeConfig
from .fee_model import MoomooFeeModel
from .hard_rules import HardRulesEngine, OrderRequest, HardRuleViolation
from .moomoo_client import get_moomoo_client
from .paperclip_dispatcher import get_dispatcher, PaperclipDispatcher

logger = logging.getLogger(__name__)
NY_TZ = ZoneInfo("America/New_York")


def normalize_sentiment(raw_score: float) -> float:
    """
    Normalizes Nawwar's raw sentiment score from [-100, +100] to [0, 100].
    Formula: S_sent_norm = (S_sent + 100) / 2
    """
    clamped = max(-100.0, min(100.0, float(raw_score)))
    return round((clamped + 100.0) / 2.0, 2)


def calculate_composite_score(tech_score: float, sent_norm: float) -> float:
    """
    Haziq's weighted composite score:
    S_total = (0.65 * S_tech) + (0.35 * S_sent_norm)
    """
    return round((0.65 * float(tech_score)) + (0.35 * float(sent_norm)), 2)


class AgentPipeline:
    """
    Coordinates and persists deliberative AI workflow and Moomoo OpenD simulation execution.
    """

    def __init__(
        self,
        db_path: Optional[Path] = None,
        moomoo_client: Optional[Any] = None,
        dispatcher: Optional[Any] = None
    ):
        self.db_path = db_path or BridgeConfig.AGENT_ACTIVITY_DB
        self.hard_rules_engine = HardRulesEngine(BridgeConfig.EQUITY_BASELINE_DB)
        self.moomoo_client = moomoo_client or get_moomoo_client()
        self.trading_mode = BridgeConfig.TRADING_MODE.upper()
        self.dispatcher = dispatcher if dispatcher is not None else get_dispatcher()
        self._earnings_cache: Dict[str, Any] = {}
        self._is_running: bool = False
        self._pipeline_lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS simulation_cycles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cycle_id TEXT UNIQUE NOT NULL,
                    created_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    total_candidates INTEGER NOT NULL DEFAULT 0,
                    passed_l1 INTEGER NOT NULL DEFAULT 0,
                    passed_l2 INTEGER NOT NULL DEFAULT 0,
                    passed_l3 INTEGER NOT NULL DEFAULT 0,
                    orders_placed INTEGER NOT NULL DEFAULT 0
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_deliberations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cycle_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    stage_reached TEXT NOT NULL,
                    final_decision TEXT NOT NULL,
                    tariq_analysis TEXT NOT NULL,
                    nawwar_analysis TEXT NOT NULL,
                    haziq_synthesis TEXT NOT NULL,
                    danial_audit TEXT NOT NULL,
                    order_id TEXT,
                    client_order_id TEXT,
                    FOREIGN KEY (cycle_id) REFERENCES simulation_cycles(cycle_id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS paper_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    client_order_id TEXT UNIQUE NOT NULL,
                    order_id TEXT NOT NULL,
                    cycle_id TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    order_side TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    entry_price REAL NOT NULL,
                    stop_loss_price REAL NOT NULL,
                    take_profit_price REAL NOT NULL,
                    status TEXT NOT NULL,
                    opend_status TEXT NOT NULL,
                    message TEXT,
                    time_in_force TEXT DEFAULT 'DAY',
                    trading_mode TEXT DEFAULT 'DAY',
                    source TEXT DEFAULT 'AGENT_PIPELINE',
                    created_at TEXT NOT NULL
                )
            """)
            # Migration check: paper_orders columns
            paper_cols = [r["name"] for r in conn.execute("PRAGMA table_info(paper_orders)").fetchall()]
            if "time_in_force" not in paper_cols:
                conn.execute("ALTER TABLE paper_orders ADD COLUMN time_in_force TEXT DEFAULT 'DAY'")
            if "trading_mode" not in paper_cols:
                conn.execute("ALTER TABLE paper_orders ADD COLUMN trading_mode TEXT DEFAULT 'DAY'")
            if "source" not in paper_cols:
                conn.execute("ALTER TABLE paper_orders ADD COLUMN source TEXT DEFAULT 'AGENT_PIPELINE'")

            # Migration check: simulation_cycles columns
            sim_cols = [r["name"] for r in conn.execute("PRAGMA table_info(simulation_cycles)").fetchall()]
            if "trading_mode" not in sim_cols:
                conn.execute("ALTER TABLE simulation_cycles ADD COLUMN trading_mode TEXT DEFAULT 'DAY'")

            conn.commit()

    def load_watchlist_candidates(self, max_candidates: int = 10) -> List[Dict[str, Any]]:
        """Loads candidates from shared watchlist.json, falling back to clean defaults if empty."""
        if BridgeConfig.WATCHLIST_PATH.exists():
            try:
                with open(BridgeConfig.WATCHLIST_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    watchlist = data.get("watchlist", [])
                    if watchlist:
                        return watchlist[:max_candidates]
            except Exception as e:
                logger.warning("Could not read watchlist.json: %s", e)
        return []

    def get_max_buying_power_limit(self) -> float:
        """Reads max_buying_power limit from screener_config.sqlite, defaulting to 100,000.0 (HOM-302)."""
        config_db = BridgeConfig.SHARED_DATA_DIR / "screener_config.sqlite"
        if config_db.exists():
            try:
                conn = sqlite3.connect(str(config_db), timeout=3.0)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT max_buying_power FROM screener_config WHERE id = 1")
                row = cursor.fetchone()
                if row and "max_buying_power" in row.keys() and row["max_buying_power"] is not None:
                    val = float(row["max_buying_power"])
                    if val >= 500.0:
                        conn.close()
                        return val
                conn.close()
            except Exception as e:
                logger.warning("Could not read max_buying_power from %s: %s", config_db, e)
        return 100000.0

    def get_pause_buying_status(self) -> bool:
        """
        Reads pause_buying boolean from screener_config.sqlite.
        When True, new stock purchases are paused (agents only analyze and maintain existing positions).
        """
        config_db = BridgeConfig.SHARED_DATA_DIR / "screener_config.sqlite"
        if config_db.exists():
            try:
                conn = sqlite3.connect(str(config_db), timeout=3.0)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT pause_buying FROM screener_config WHERE id = 1")
                row = cursor.fetchone()
                if row and "pause_buying" in row.keys() and row["pause_buying"] is not None:
                    val = int(row["pause_buying"])
                    conn.close()
                    return val == 1
                conn.close()
            except Exception as e:
                logger.warning("Could not read pause_buying from %s: %s", config_db, e)
        return False

    # =========================================================================
    # L1: Tariq (Technical Analyst)
    # =========================================================================
    def evaluate_tariq_technical(self, candidate: Dict[str, Any], trading_mode: Optional[str] = None) -> Dict[str, Any]:
        """
        Tariq analyzes Wyckoff accumulation/markup, Elliott wave structure,
        and SMC (Smart Money Concepts) Fair Value Gap (FVG) confluence using
        real candlestick K-line data from Moomoo OpenAPI (get_cur_kline_with_sub)
        or candidate fallback metrics.
        Supports DAY (5M/15M) and SWING (4H/Daily + 1H adaptive trigger).
        Returns technical analysis dict with S_tech in [0, 100].
        """
        mode = (trading_mode or candidate.get("trading_mode") or BridgeConfig.TRADING_MODE).upper()
        symbol = candidate.get("symbol", "UNKNOWN")
        price = float(candidate.get("price", 0.0))
        lane = candidate.get("lane", "SETUP")
        lane_score = float(candidate.get("lane_score", 70.0))
        rs_spy = float(candidate.get("rs_spy", 1.0))
        setup_metrics = candidate.get("setup_metrics") or {}
        dist_52w = float(setup_metrics.get("dist_to_52w_high_pct") or 5.0)

        candles = candidate.get("candles")
        data_source = "HEURISTIC_MOCK"
        atr_14 = None

        # Check pause buying status: when active, protect the 100-symbol/30-day OpenAPI K-line quota
        is_paused = self.get_pause_buying_status()
        is_held = bool(candidate.get("is_held", False) or candidate.get("held_position", False))

        # Fetch real K-line candlestick bars if live OpenD is connected and candles not pre-populated.
        # CRITICAL QUOTA SAFETY: Tariq MUST NOT request real historical K-lines from Moomoo OpenAPI
        # for buy candidates when pause buying is active, because new purchases are paused and
        # requesting K-lines would exhaust the 30-day quota unnecessarily!
        if not candles and self.moomoo_client is not None:
            if is_paused and not is_held:
                logger.info(
                    "[Tariq] Pause buying is active; skipping Moomoo OpenAPI K-line request for %s to protect 30-day quota.",
                    symbol
                )
                data_source = "PAUSE_BUYING_MOCK"
            else:
                try:
                    if not self.moomoo_client.is_connected():
                        self.moomoo_client.connect()
                    if self.moomoo_client.is_connected():
                        # 1. Primary: request real historical K-lines from Moomoo OpenAPI (burns 30-day quota)
                        if hasattr(self.moomoo_client, "get_history_kline"):
                            kl_resp = self.moomoo_client.get_history_kline(symbol, interval="day", num=60)
                            if kl_resp.get("status") in ("OK", "HEALTHY") and kl_resp.get("candles"):
                                candles = kl_resp["candles"]
                        if not candles and hasattr(self.moomoo_client, "get_cur_kline_with_sub"):
                            kl_resp = self.moomoo_client.get_cur_kline_with_sub(symbol, interval="day", num=60)
                            if kl_resp.get("status") in ("OK", "HEALTHY") and kl_resp.get("candles"):
                                candles = kl_resp["candles"]
                                self.moomoo_client.release_kline_subscription(symbol, interval="day")
                except Exception as e:
                    logger.warning("Failed to fetch live K-line for %s: %s", symbol, e)

        if candles and len(candles) >= 5:
            data_source = "MOOMOO_KLINE_REAL"
            closes = [float(c["close"]) for c in candles]
            highs = [float(c["high"]) for c in candles]
            lows = [float(c["low"]) for c in candles]
            vols = [float(c.get("volume", 0) or 0) for c in candles]

            latest_close = closes[-1]
            if price <= 0.0:
                price = latest_close

            # Support & resistance from candle history
            lookback = min(len(candles), 20)
            support_level = round(min(lows[-lookback:]), 2)
            resistance_level = round(max(highs[-lookback:]), 2)

            # ATR 14 from true range of candles
            tr_list = []
            for i in range(1, len(candles)):
                h = highs[i]
                l = lows[i]
                pc = closes[i - 1]
                tr_list.append(max(h - l, abs(h - pc), abs(l - pc)))
            if tr_list:
                atr_slice = tr_list[-min(len(tr_list), 14):]
                atr_14 = round(sum(atr_slice) / len(atr_slice), 2)

            # Moving average trend & Wyckoff Phase
            sma20 = sum(closes[-lookback:]) / lookback
            sma_trend_up = latest_close >= sma20

            # Up-day vs down-day volume confirmation
            up_vols = [vols[i] for i in range(1, len(candles)) if closes[i] >= closes[i-1]]
            down_vols = [vols[i] for i in range(1, len(candles)) if closes[i] < closes[i-1]]
            avg_up_vol = sum(up_vols) / len(up_vols) if up_vols else 1.0
            avg_down_vol = sum(down_vols) / len(down_vols) if down_vols else 1.0
            vol_expansion = avg_up_vol > avg_down_vol

            if sma_trend_up and vol_expansion:
                wyckoff_phase = "MARKUP"
            elif latest_close >= support_level * 0.98 and latest_close <= support_level * 1.05:
                wyckoff_phase = "ACCUMULATION_PHASE_C"
            elif sma_trend_up:
                wyckoff_phase = "MARKUP"
            else:
                wyckoff_phase = "ACCUMULATION_PHASE_C"

            # Technical score from real candlestick dynamics
            candle_momentum_pct = ((latest_close - closes[0]) / closes[0] * 100.0) if closes[0] > 0 else 0.0
            base_score = 65.0 if wyckoff_phase == "MARKUP" else 62.0
            bonus_rs = min(15.0, max(-15.0, (rs_spy - 1.0) * 20.0))
            bonus_dist = max(0.0, 10.0 - dist_52w) * 0.8
            bonus_mom = min(10.0, max(-10.0, candle_momentum_pct * 0.5))
            bonus_vol = 3.0 if vol_expansion else 0.0

            raw_tech = base_score + bonus_rs + bonus_dist + bonus_mom + bonus_vol + (lane_score - 70.0) * 0.2
            s_tech = round(max(10.0, min(98.0, raw_tech)), 1)
        else:
            # Baseline S_tech calculated deterministically from screener lane and market confluence
            base_score = 65.0 if lane == "MOMENTUM" else 62.0
            bonus_rs = min(15.0, max(-15.0, (rs_spy - 1.0) * 20.0))
            bonus_dist = max(0.0, 10.0 - dist_52w) * 0.8
            raw_tech = base_score + bonus_rs + bonus_dist + (lane_score - 70.0) * 0.2
            s_tech = round(max(10.0, min(98.0, raw_tech)), 1)

            wyckoff_phase = "MARKUP" if lane == "MOMENTUM" else "ACCUMULATION_PHASE_C"
            support_level = round(price * 0.96, 2)
            resistance_level = round(price * 1.08, 2)

        # Anti-Stop-Hunt: Detect Wyckoff Spring / Shakeout vs High-Volume Breakdown for held positions
        wyckoff_spring_detected = False
        structural_breakdown = False
        if is_held:
            if candles and len(candles) >= 5:
                recent_vol = vols[-1] if vols else 1.0
                avg_vol = (sum(vols) / len(vols)) if vols else 1.0
                vol_ratio = recent_vol / avg_vol if avg_vol > 0 else 1.0
                if latest_close <= support_level * 1.01:
                    if vol_ratio <= 1.0:
                        wyckoff_spring_detected = True
                        wyckoff_phase = "ACCUMULATION_SPRING"
                    elif vol_ratio > 1.5:
                        structural_breakdown = True
                        wyckoff_phase = "DISTRIBUTION_BREAKDOWN"
            else:
                if candidate.get("wyckoff_spring") or (candidate.get("volume_ratio", 1.0) <= 1.0 and candidate.get("testing_support")):
                    wyckoff_spring_detected = True
                    wyckoff_phase = "ACCUMULATION_SPRING"
                elif candidate.get("structural_breakdown") or (candidate.get("volume_ratio", 1.0) > 1.5 and candidate.get("breakdown")):
                    structural_breakdown = True
                    wyckoff_phase = "DISTRIBUTION_BREAKDOWN"

        fvg_confluence = "BULLISH_FVG_CONFIRMED" if s_tech >= 65.0 else "TESTING_LIQUIDITY_ZONE"
        passed = s_tech >= 60.0
        timeframe_label = "4H/Daily+1H_ADAPTIVE" if mode == "SWING" else "5M/15M"
        return {
            "agent": "Tariq",
            "role": "L1 Technical Analyst",
            "symbol": symbol,
            "trading_mode": mode,
            "timeframe": timeframe_label,
            "s_tech": s_tech,
            "passed": passed,
            "wyckoff_phase": wyckoff_phase,
            "wyckoff_spring_detected": wyckoff_spring_detected,
            "structural_breakdown": structural_breakdown,
            "elliott_wave": "Wave 3 Impulse Expansion" if lane == "MOMENTUM" else "Wave 1 / Leading Diagonal",
            "smc_fvg_confluence": fvg_confluence,
            "support_level": support_level,
            "resistance_level": resistance_level,
            "atr_14": atr_14,
            "candle_count": len(candles) if candles else 0,
            "data_source": data_source,
            "fail_fast": not passed,
            "notes": (
                f"[{mode} | {timeframe_label}] S_tech={s_tech}/100. Wyckoff {wyckoff_phase} with SMC {fvg_confluence} ({data_source}). "
                + (f"Anti-Stop-Hunt: Wyckoff Spring detected on low volume (Hold). " if wyckoff_spring_detected else "")
                + (f"Amaran: High Volume Breakdown dikesan (Exit). " if structural_breakdown else "")
                + f"Konfluens teknikal {'memenuhi' if passed else 'tidak memenuhi'} syarat ambang >= 60.0."
                + (" [K-line API dilangkau: Mod Jeda Pembelian aktif memelihara kuota 30 hari]." if (is_paused and not is_held) else "")
            )
        }

    # =========================================================================
    # L1: Nawwar (Sentiment & Macro Scout)
    # =========================================================================
    def evaluate_nawwar_sentiment(self, candidate: Dict[str, Any], trading_mode: Optional[str] = None) -> Dict[str, Any]:
        """
        Nawwar evaluates news flow, earnings catalyst gate, and macro environment.
        Uses Moomoo OpenAPI corporate earnings calendar (get_earnings_calendar)
        and news search (get_search_news) when available.
        - DAY mode: Hard threshold S_sent >= +60.0 without earnings in 5 days.
        - SWING mode: Hard threshold S_sent >= +60.0 without earnings in 14 days (days_to_earnings < 14)
          and without 14-day macro calendar risk (FOMC/CPI/PPI).
        """
        mode = (trading_mode or candidate.get("trading_mode") or BridgeConfig.TRADING_MODE).upper()
        earnings_gate_days = 14 if mode == "SWING" else 5
        symbol = candidate.get("symbol", "UNKNOWN")
        change_pct = float(candidate.get("change_pct", 0.0))
        clean_ticker = symbol.split(".")[-1] if "." in symbol else symbol
        data_source = "HEURISTIC_MOCK"

        # 1. Earnings calendar gate check (DAY: < 5 days, SWING: < 14 days)
        earnings_within_gate = False
        earnings_date = candidate.get("earnings_date")
        if candidate.get("days_to_earnings") is not None:
            if candidate.get("days_to_earnings") < earnings_gate_days:
                earnings_within_gate = True
        elif candidate.get("earnings_within_gate") is not None:
            earnings_within_gate = bool(candidate.get("earnings_within_gate"))
        elif mode == "SWING" and candidate.get("earnings_within_14d") is not None:
            earnings_within_gate = bool(candidate.get("earnings_within_14d"))
        else:
            earnings_within_gate = bool(candidate.get("earnings_within_5d", False))

        # Query live Moomoo earnings calendar if connected and not already marked
        if not earnings_within_gate and self.moomoo_client is not None:
            if not self.moomoo_client.is_connected():
                self.moomoo_client.connect()
            if self.moomoo_client.is_connected():
                now_dt = datetime.now(timezone.utc)
                today_str = now_dt.strftime("%Y-%m-%d")
                days_ahead = 15 if mode == "SWING" else 6
                end_str = (now_dt + timedelta(days=days_ahead)).strftime("%Y-%m-%d")

                # Check cache or fetch calendar (Moomoo enforces max 7 days per call, chunk if needed)
                if "us_earnings" not in self._earnings_cache or (now_dt.timestamp() - self._earnings_cache.get("time", 0)) > 300:
                    earn_resp = self.moomoo_client.get_earnings_calendar(market="US", begin_date=today_str, end_date=end_str)
                    if earn_resp.get("status") == "OK":
                        self._earnings_cache = {
                            "time": now_dt.timestamp(),
                            "items": earn_resp.get("items", [])
                        }

                cached_items = self._earnings_cache.get("items", [])
                for item in cached_items:
                    item_sym = item.get("symbol") or item.get("security") or ""
                    item_ticker = item_sym.split(".")[-1] if "." in item_sym else item_sym
                    if clean_ticker.upper() == item_ticker.upper():
                        item_date_str = item.get("earnings_date")
                        if item_date_str:
                            try:
                                item_date = datetime.strptime(item_date_str, "%Y-%m-%d").date()
                                days_diff = (item_date - now_dt.date()).days
                                if 0 <= days_diff < earnings_gate_days:
                                    earnings_within_gate = True
                                    earnings_date = item_date_str
                                    data_source = "MOOMOO_EARNINGS_REAL"
                                    break
                            except Exception:
                                pass

        # 2. News flow and headline sentiment
        news_items = candidate.get("news_items")
        news_headline = candidate.get("news_headline")
        news_url = candidate.get("news_url")

        if not news_items and self.moomoo_client is not None:
            if not self.moomoo_client.is_connected():
                self.moomoo_client.connect()
            if self.moomoo_client.is_connected():
                try:
                    news_resp = self.moomoo_client.get_news_for_symbol(symbol=symbol, max_count=5)
                    if news_resp.get("status") == "OK" and news_resp.get("items"):
                        news_items = news_resp["items"]
                except Exception as e:
                    logger.warning("Failed to fetch live news for %s: %s", symbol, e)

        if news_items and len(news_items) > 0:
            data_source = "MOOMOO_NEWS_REAL" if data_source == "HEURISTIC_MOCK" else f"{data_source}+NEWS_REAL"
            news_headline = news_items[0].get("title", f"Liputan Berita Terkini {clean_ticker}")
            news_url = news_items[0].get("url") or f"https://finance.yahoo.com/quote/{clean_ticker}/news/"

            # Sentiment keyword analysis from real headlines
            bullish_words = {"beat", "surge", "surged", "soar", "record", "growth", "profit", "upgrade", "bullish", "rally", "gain", "high", "strong", "expansion"}
            bearish_words = {"miss", "missed", "plunge", "fall", "loss", "downgrade", "bearish", "warning", "slump", "drop", "decline", "weak", "probe", "investigation"}

            bullish_hits = 0
            bearish_hits = 0
            for it in news_items:
                title_lower = (it.get("title") or "").lower()
                for w in bullish_words:
                    if w in title_lower:
                        bullish_hits += 1
                for w in bearish_words:
                    if w in title_lower:
                        bearish_hits += 1

            headline_bias = (bullish_hits * 10.0) - (bearish_hits * 15.0)
            raw_sent = 68.0 + headline_bias + min(15.0, max(-15.0, change_pct * 1.5))
            raw_sent = round(max(-100.0, min(100.0, raw_sent)), 1)
        else:
            # Fallback heuristic from momentum and trend indicators
            if not news_headline:
                news_headline = f"Liputan Berita Terkini & Sentimen Pasaran {clean_ticker}"
            if not news_url:
                news_url = f"https://finance.yahoo.com/quote/{clean_ticker}/news/"
            raw_sent = 70.0 + min(25.0, change_pct * 3.0)
            raw_sent = round(max(-100.0, min(100.0, raw_sent)), 1)

        sent_norm = normalize_sentiment(raw_sent)

        # Earnings & macro gate check
        fomc_macro_risk = bool(candidate.get("fomc_macro_risk", False) or (mode == "SWING" and candidate.get("macro_calendar_risk", False)))
        passed = (raw_sent >= 60.0) and (not earnings_within_gate) and (not fomc_macro_risk)

        label = "BULLISH" if raw_sent >= 50.0 else ("BEARISH" if raw_sent <= -20.0 else "NEUTRAL")

        if earnings_within_gate:
            notes = (
                f"[{mode}] S_sent={raw_sent:+0.1f} (Norm={sent_norm}/100, {label}). "
                f"SEKATAN KERAS: Pengumuman earnings dalam tempoh {earnings_gate_days} hari ({earnings_date or 'segera'}). Ditolak serta-merta."
            )
        else:
            notes = (
                f"[{mode}] S_sent={raw_sent:+0.1f} (Norm={sent_norm}/100, {label}, {data_source}). "
                f"Tiada risiko earnings dalam {earnings_gate_days} hari. {'Lulus' if passed else 'Ditolak'} tapisan sentimen."
            )

        return {
            "agent": "Nawwar",
            "role": "L1 Sentiment & Macro Scout",
            "symbol": symbol,
            "trading_mode": mode,
            "earnings_gate_days": earnings_gate_days,
            "s_sent_raw": raw_sent,
            "s_sent_norm": sent_norm,
            "passed": passed,
            "sentiment_label": label,
            "earnings_within_gate": earnings_within_gate,
            "earnings_within_5d": earnings_within_gate if mode == "DAY" else False,
            "earnings_within_14d": earnings_within_gate if mode == "SWING" else False,
            "earnings_date": earnings_date,
            "fomc_macro_risk": fomc_macro_risk,
            "news_url": news_url,
            "news_headline": news_headline,
            "news_count": len(news_items) if news_items else 0,
            "data_source": data_source,
            "fail_fast": not passed,
            "notes": notes
        }

    # =========================================================================
    # L2: Haziq (Portfolio & Strategy Lead)
    # =========================================================================
    def evaluate_haziq_synthesis(
        self,
        candidate: Dict[str, Any],
        tariq_res: Dict[str, Any],
        nawwar_res: Dict[str, Any],
        account_equity: float,
        trading_mode: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Haziq combines L1 scores into composite S_total = 0.65*S_tech + 0.35*S_sent_norm.
        Entry Gate: S_total >= 65.0, S_tech >= 60.0, S_sent_norm >= 80.0.
        Calculates position sizing:
        - DAY: 1.5% equity risk, max 20% equity cap, Stop Loss = 1.5*ATR14, TP1 R:R min 1:1.5–1:2.
        - SWING: 1.0% equity risk (mitigating overnight gap risk), Stop Loss = 1.5*ATR_1H, TP1 R:R min 1:3.
        """
        mode = (trading_mode or candidate.get("trading_mode") or BridgeConfig.TRADING_MODE).upper()
        symbol = candidate.get("symbol", "UNKNOWN")
        raw_price = float(candidate.get("price", 10.0))
        price = round(raw_price, 2) if raw_price >= 1.0 else round(raw_price, 4)
        s_tech = float(tariq_res.get("s_tech", 0.0))
        s_sent_norm = float(nawwar_res.get("s_sent_norm", 0.0))

        s_total = calculate_composite_score(s_tech, s_sent_norm)
        passed_entry_gate = (s_total >= 65.0) and (s_tech >= 60.0) and (s_sent_norm >= 80.0)

        # Risk parameters: 1.0% for SWING, 1.5% for DAY
        risk_per_trade_pct = 0.01 if mode == "SWING" else 0.015
        max_position_equity_pct = 0.20  # Max 20% position cap
        total_risk_capital = account_equity * risk_per_trade_pct
        max_position_value = account_equity * max_position_equity_pct

        # ATR estimation: use Tariq's K-line ATR if calculated, else fallback to setup_metrics
        setup_metrics = candidate.get("setup_metrics") or {}
        atr_pct = float(setup_metrics.get("atr_14_pct") or 3.0)
        atr_14 = tariq_res.get("atr_14")
        if not atr_14 or atr_14 <= 0:
            atr_14 = max(0.10, round(price * (atr_pct / 100.0), 2))

        sl_distance = round(1.5 * atr_14, 2)
        stop_loss_price = round(max(0.01, price - sl_distance), 2)
        risk_per_share = round(price - stop_loss_price, 2)
        if risk_per_share <= 0:
            risk_per_share = 0.05

        # Position Sizing
        shares_by_risk = math.floor(total_risk_capital / risk_per_share)
        shares_by_cap = math.floor(max_position_value / price) if price > 0 else 0
        allocated_shares = max(1, min(shares_by_risk, shares_by_cap))
        position_value = round(allocated_shares * price, 2)
        actual_risk_amount = round(allocated_shares * risk_per_share, 2)

        # Targets: SWING min 1:3 R:R, DAY min 1:1.5-1:2 R:R
        rr_target_mult = 3.0 if mode == "SWING" else 1.5
        tp1_price = round(price + (rr_target_mult * risk_per_share), 2)
        rr_ratio = round((tp1_price - price) / risk_per_share, 2)

        # Moomoo Realistic Fee Model & Dynamic Break-Even Stop Loss (HOM-374 / Issue #12)
        fee_rt_details = MoomooFeeModel.calculate_roundtrip_fee(
            entry_price=price,
            quantity=allocated_shares,
            exit_price=price
        )
        fee_roundtrip = fee_rt_details["total_fee"]
        be_buffer_per_share = round(fee_roundtrip / allocated_shares, 4) if allocated_shares > 0 else 0.0
        break_even_stop_loss = MoomooFeeModel.calculate_breakeven_sl(
            entry_price=price,
            quantity=allocated_shares
        )

        # Active Position Watch for held positions (Anti-Stop-Hunt & Early Threat Exit)
        is_held = bool(candidate.get("is_held"))
        held_action = "ENTER"
        if is_held:
            if tariq_res.get("wyckoff_spring_detected"):
                held_action = "HOLD"
                thesis = (
                    f"[{mode}] Active Position Watch {symbol}: Wyckoff Spring / Shakeout dikesan pada volum rendah. "
                    f"Perlindungan Anti-Stop-Hunt aktif: Kekalkan posisi dan elakkan perangkap jualan likuiditi jerung."
                )
            elif tariq_res.get("structural_breakdown") or nawwar_res.get("s_sent_raw", 0.0) <= -30.0:
                held_action = "EXIT_REQUEST"
                thesis = (
                    f"[{mode}] Active Position Watch {symbol}: Penembusan struktur sah dikesan pada volum tinggi "
                    f"(atau ancaman sentimen melampau). Mencetuskan permintaan keluar awal (Early Threat Exit)."
                )
            else:
                held_action = "HOLD"
                thesis = (
                    f"[{mode}] Active Position Watch {symbol}: Posisi dalam keadaan stabil dan mematuhi saluran volatiliti. Kekalkan pegangan."
                )
        else:
            thesis = (
                f"[{mode}] S_total={s_total} (Tech={s_tech}, SentNorm={s_sent_norm}). "
                f"Entri: ${price:.2f}, SL: ${stop_loss_price:.2f} (-{sl_distance:.2f}, ATR: ${atr_14:.2f}), "
                f"TP1: ${tp1_price:.2f} (1:{rr_ratio}). Saiz: {allocated_shares} unit "
                f"(${position_value:.2f}, Risiko: ${actual_risk_amount:.2f} / {actual_risk_amount/account_equity*100:.2f}% modal efektif). "
                f"Kos Yuran Moomoo (Round-Trip): ${fee_roundtrip:.2f} (${be_buffer_per_share:.4f}/unit). SL Break-Even: ${break_even_stop_loss:.2f}. "
                f"Asas Modal: ${account_equity:,.2f}."
            )

        return {
            "agent": "Haziq",
            "role": "L2 Portfolio & Strategy Lead",
            "symbol": symbol,
            "trading_mode": mode,
            "s_total": s_total,
            "passed": passed_entry_gate if not is_held else (held_action == "EXIT_REQUEST"),
            "is_held": is_held,
            "held_action": held_action,
            "entry_price": price,
            "stop_loss_price": stop_loss_price,
            "take_profit_price": tp1_price,
            "allocated_shares": allocated_shares,
            "position_value": position_value,
            "risk_per_trade_usd": actual_risk_amount,
            "actual_risk_amount": actual_risk_amount,
            "risk_per_trade_pct": round(actual_risk_amount / account_equity * 100, 2),
            "account_equity_used": account_equity,
            "risk_reward_ratio": rr_ratio,
            "rr_ratio": rr_ratio,
            "fee_roundtrip": fee_roundtrip,
            "be_buffer_per_share": be_buffer_per_share,
            "break_even_stop_loss": break_even_stop_loss,
            "thesis": thesis
        }

    # =========================================================================
    # L3: Danial (Risk & Compliance Gatekeeper - 8 Hard Rules)
    # =========================================================================
    def evaluate_danial_compliance(
        self,
        candidate: Dict[str, Any],
        haziq_res: Dict[str, Any],
        account_equity: float,
        now_ny: datetime,
        mock_market_window: bool = False,
        force_simulation: bool = False,
        trading_mode: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Danial audits the candidate order strictly against the 8 Hard Rules:
        1. Risk <= 2.0% equity (DAY) or <= 1.0% equity (SWING)
        2. Daily drawdown <= 5.0% circuit breaker
        3. PDT guard (< $25k, max 3 day trades; SWING multi-day overnight holding exempt)
        4. Penny stock filter (Price >= $5.00)
        5. Order volume <= 1.0% ADV20
        6. Market time window: DAY [09:45 - 15:45 NY] vs SWING [09:30 - 16:00 NY]
        7. Idempotency key (UUIDv4)
        8. Manual kill switch & OpenD alive
        """
        mode = (trading_mode or candidate.get("trading_mode") or BridgeConfig.TRADING_MODE).upper()
        time_in_force = "GTC" if mode == "SWING" else "DAY"
        holding_days = int(candidate.get("holding_days", 0))

        symbol = candidate.get("symbol", "UNKNOWN")
        price = float(haziq_res.get("entry_price", candidate.get("price", 10.0)))
        stop_loss = float(haziq_res.get("stop_loss_price", price * 0.95))
        quantity = int(haziq_res.get("allocated_shares", 10))
        adv_20 = float(candidate.get("adv_20", 5000000.0))
        trade_date = now_ny.strftime("%Y-%m-%d")

        client_order_id = str(uuid.uuid4())
        order = OrderRequest(
            client_order_id=client_order_id,
            symbol=symbol,
            quantity=quantity,
            entry_price=price,
            stop_loss_price=stop_loss,
            order_side="BUY",
            time_in_force=time_in_force,
            trading_mode=mode,
            holding_days=holding_days
        )

        rule_checks = []
        all_passed = True
        rejection_reason = None

        # Rule 1: Max Risk <= 1.0% (SWING) or <= 2.0% (DAY)
        risk_pct = haziq_res.get("risk_per_trade_pct", 1.0 if mode == "SWING" else 1.5)
        max_allowed_risk_pct = 1.0 if mode == "SWING" else 2.0
        r1_pass = risk_pct <= max_allowed_risk_pct
        rule_checks.append({
            "rule": f"Rule 1: Risk per Trade <= {max_allowed_risk_pct:.1f}%",
            "passed": r1_pass,
            "detail": f"{risk_pct:.2f}% ekuiti (Had: {max_allowed_risk_pct:.1f}%)"
        })
        if not r1_pass and all_passed:
            all_passed = False
            rejection_reason = f"Pelanggaran Rule 1: Risiko modal melebihi {max_allowed_risk_pct:.1f}%"

        # Rule 2: Daily Drawdown <= 5.0% Circuit Breaker
        cb_active = self.hard_rules_engine.get_circuit_breaker_status(trade_date)
        r2_pass = not cb_active
        rule_checks.append({
            "rule": "Rule 2: Daily Drawdown <= 5.0% Circuit Breaker",
            "passed": r2_pass,
            "detail": "Circuit breaker TIDAK aktif" if r2_pass else "Circuit breaker AKTIF (5% drawdown)"
        })
        if not r2_pass and all_passed:
            all_passed = False
            rejection_reason = "Pelanggaran Rule 2: Circuit breaker harian 5% aktif"

        # Rule 3: PDT Guard
        r3_pass = True
        try:
            self.hard_rules_engine.validate_rule3_pdt(
                account_equity=account_equity,
                current_date=trade_date,
                order=order
            )
        except HardRuleViolation as e:
            r3_pass = False
        rule_checks.append({
            "rule": "Rule 3: PDT Guard (< $25k, max 3 day trades)",
            "passed": r3_pass,
            "detail": f"Ekuiti ${account_equity:,.2f} - status PDT patuh" if r3_pass else "Melebihi had PDT 3 day trades"
        })
        if not r3_pass and all_passed:
            all_passed = False
            rejection_reason = "Pelanggaran Rule 3: Had PDT day trades dilanggar"

        # Rule 4: Penny Stock Filter (Price >= $5.00)
        r4_pass = price >= 5.00
        rule_checks.append({
            "rule": "Rule 4: Penny Stock Filter (Price >= $5.00)",
            "passed": r4_pass,
            "detail": f"Harga ${price:.2f} >= $5.00" if r4_pass else f"Harga ${price:.2f} < $5.00 (Penny Stock ditolak)"
        })
        if not r4_pass and all_passed:
            all_passed = False
            rejection_reason = "Pelanggaran Rule 4: Harga saham di bawah $5.00"

        # Rule 5: Liquidity Guard (<= 1.0% ADV20)
        adv_limit = adv_20 * 0.01 if adv_20 > 0 else 0
        r5_pass = (adv_20 > 0) and (quantity <= adv_limit)
        rule_checks.append({
            "rule": "Rule 5: Liquidity Guard (<= 1.0% ADV20)",
            "passed": r5_pass,
            "detail": f"{quantity} unit <= 1.0% ADV20 ({adv_limit:,.0f} unit)" if r5_pass else f"Pesanan melebihi 1.0% ADV20 ({adv_limit:,.0f})"
        })
        if not r5_pass and all_passed:
            all_passed = False
            rejection_reason = "Pelanggaran Rule 5: Kuantiti pesanan melebihi 1.0% ADV20"

        # Rule 6: Market Time Window (DAY: 09:45 - 15:45 NY, SWING: 09:30 - 16:00 NY)
        r6_pass = True
        if not mock_market_window:
            try:
                self.hard_rules_engine.validate_rule6_trading_window(now_ny, order=order)
            except HardRuleViolation:
                r6_pass = False
        window_label = "09:30 - 16:00 NY" if mode == "SWING" else "09:45 - 15:45 NY"
        rule_checks.append({
            "rule": f"Rule 6: Market Window {window_label}",
            "passed": r6_pass,
            "detail": f"Masa NY {now_ny.strftime('%H:%M:%S')} dalam tingkap dagangan" if r6_pass else f"Luar tingkap waktu pasaran {now_ny.strftime('%H:%M:%S')}"
        })
        if not r6_pass and all_passed:
            all_passed = False
            rejection_reason = f"Pelanggaran Rule 6: Di luar waktu dagangan {window_label}"

        # Rule 7: Idempotency Key
        r7_pass = True
        try:
            self.hard_rules_engine.validate_rule7_idempotency(client_order_id)
        except HardRuleViolation:
            r7_pass = False
        rule_checks.append({
            "rule": "Rule 7: Idempotency Key (Unique UUIDv4)",
            "passed": r7_pass,
            "detail": f"UUID {client_order_id[:8]}... unik & disahkan"
        })
        if not r7_pass and all_passed:
            all_passed = False
            rejection_reason = "Pelanggaran Rule 7: Kunci ketakberubahan (idempotency) bertindih"

        # Rule 8: Kill-Switch & OpenD Gateway Alive
        client = get_moomoo_client()
        opend_status = client.get_connection_status()
        r8_pass = client.is_connected() or force_simulation
        rule_checks.append({
            "rule": "Rule 8: Kill-Switch & OpenD Alive (Fail-Closed)",
            "passed": r8_pass,
            "detail": f"OpenD status: {opend_status} (Kill-switch: OFF)" if r8_pass else f"OpenD tidak disambung ({opend_status})"
        })
        if not r8_pass and all_passed:
            all_passed = False
            rejection_reason = f"Pelanggaran Rule 8: Sambungan broker OpenD terputus ({opend_status})"

        # Kawalan Kedudukan Aktif: Elak pembelian berulang bagi kaunter yang sama
        active_order_count = 0
        active_order_status = None
        try:
            with self._get_connection() as conn:
                row = conn.execute(
                    "SELECT status FROM paper_orders WHERE symbol = ? AND status IN ('SUBMITTED', 'PENDING', 'FILLED') ORDER BY id DESC LIMIT 1",
                    (symbol,)
                ).fetchone()
                if row:
                    active_order_count = 1
                    active_order_status = row["status"]
        except Exception as e:
            logger.warning("Error checking active orders for %s: %s", symbol, e)

        r_dedup_pass = (active_order_count == 0)
        rule_checks.append({
            "rule": "Kawalan Kedudukan Aktif (Elak Pembelian Berulang)",
            "passed": r_dedup_pass,
            "detail": "Tiada pesanan aktif / posisi terbuka bagi simbol ini" if r_dedup_pass else f"Pesanan/posisi sedia ada aktif ({active_order_status}). Pembelian berulang disekat."
        })
        if not r_dedup_pass and all_passed:
            all_passed = False
            rejection_reason = f"Simbol {symbol} telah mempunyai pesanan aktif/posisi terbuka ({active_order_status}). Pembelian berulang disekat."

        # Kawalan Mod Jeda (Pause Pembelian Baharu): Pengguna menjeda belian (hanya analisis & pantau)
        is_buying_paused = self.get_pause_buying_status()
        rule_checks.append({
            "rule": "Kawalan Mod Jeda (Pause Pembelian Baharu)",
            "passed": not is_buying_paused,
            "detail": "Pembelian aktif dibenarkan" if not is_buying_paused else "Pembelian baharu DIJEDA (Mod Pantau: Analisis & Jaga Kaunter Sahaja)"
        })
        if is_buying_paused and all_passed:
            all_passed = False
            rejection_reason = "Pembelian baharu dijeda oleh pengguna (Mod Pantau Sahaja: Analisis & Jaga Kaunter Sedia Ada)"

        order_dict = order.model_dump()
        return {
            "agent": "Danial",
            "role": "L3 Risk & Compliance Officer",
            "symbol": symbol,
            "trading_mode": mode,
            "time_in_force": time_in_force,
            "holding_days": holding_days,
            "passed": all_passed,
            "rejection_reason": rejection_reason,
            "client_order_id": client_order_id,
            "order": order_dict,
            "order_request": order_dict,
            "rule_checks": rule_checks,
            "notes": (
                f"[{mode} | {time_in_force}] Audit Danial: {'LULUS 8/8 peraturan risiko & kawalan posisi unik' if all_passed else 'DITOLAK - ' + rejection_reason}."
            )
        }

    # =========================================================================
    # Full End-to-End Simulation Pipeline Run
    # =========================================================================
    def run_simulation_cycle(
        self,
        candidates: Optional[List[Dict[str, Any]]] = None,
        force_simulation: bool = False,
        mock_market_window: bool = False,
        trading_mode: Optional[str] = None,
        include_active_positions: bool = False,
        wake_agents: bool = False
    ) -> Dict[str, Any]:
        """
        Executes a complete deliberative cycle over watchlist candidates:
        L0 Screener -> L1 Tariq & Nawwar -> L2 Haziq -> L3 Danial -> L4 OpenD Paper Order.
        Supports DAY and SWING modes, plus Active Position Watch for held positions.
        """
        with self._pipeline_lock:
            if self._is_running:
                logger.info("[AgentPipeline] Deliberation cycle already in-flight; rejecting duplicate trigger.")
                return {
                    "status": "IN_PROGRESS_SKIPPED",
                    "message": "Agent analysis already in progress",
                    "in_flight": True
                }
            self._is_running = True

        try:
            return self._execute_simulation_cycle_body(
                candidates=candidates,
                force_simulation=force_simulation,
                mock_market_window=mock_market_window,
                trading_mode=trading_mode,
                include_active_positions=include_active_positions,
                wake_agents=wake_agents
            )
        finally:
            with self._pipeline_lock:
                self._is_running = False

    def _execute_simulation_cycle_body(
        self,
        candidates: Optional[List[Dict[str, Any]]] = None,
        force_simulation: bool = False,
        mock_market_window: bool = False,
        trading_mode: Optional[str] = None,
        include_active_positions: bool = False,
        wake_agents: bool = False
    ) -> Dict[str, Any]:
        mode = (trading_mode or BridgeConfig.TRADING_MODE).upper()
        now_utc = datetime.now(timezone.utc)
        now_ny = datetime.now(NY_TZ)
        cycle_id = f"CYC-{now_utc.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

        if not candidates:
            candidates = self.load_watchlist_candidates(max_candidates=10)

        # Baseline equity from OpenD or DB
        client = self.moomoo_client or get_moomoo_client()
        if hasattr(client, "connect") and not client.is_connected():
            client.connect()
        trade_date = now_ny.strftime("%Y-%m-%d")
        broker_equity = client.get_account_equity()
        baseline_equity = self.hard_rules_engine.get_verified_equity(trade_date, fallback=None)
        raw_equity = broker_equity or baseline_equity or 100000.0

        # Enforce dynamic max_buying_power ceiling (HOM-302)
        max_buying_power = self.get_max_buying_power_limit()
        effective_equity = min(raw_equity, max_buying_power) if max_buying_power and max_buying_power > 0 else raw_equity
        account_equity = effective_equity

        # Include open broker positions for Active Position Watch if requested
        if include_active_positions:
            active_broker_positions = client.query_positions() if client.is_connected() else []
            for b_pos in active_broker_positions:
                b_code = str(b_pos.get("code", "")).strip()
                b_qty = int(b_pos.get("qty", 0))
                b_cost = float(b_pos.get("cost_price", 0.0))
                if b_qty > 0 and b_code:
                    candidates.append({
                        "symbol": b_code,
                        "price": b_cost,
                        "cost_price": b_cost,
                        "is_held": True,
                        "held_qty": b_qty,
                        "trading_mode": mode
                    })

        total_candidates = len(candidates)
        passed_l1_count = 0
        passed_l2_count = 0
        passed_l3_count = 0
        orders_placed_count = 0

        deliberation_records = []
        orders_placed = []
        l1_batch_evaluations: List[Dict[str, Any]] = []

        # Dispatch L1 analysis (Tariq Technical & Nawwar Sentiment)
        if candidates and getattr(self, "dispatcher", None) and wake_agents:
            try:
                self.dispatcher.dispatch_l1_agents(candidates)
            except Exception as e:
                logger.warning("[Dispatcher] Failed to dispatch L1 agents: %s", e)

        for candidate in candidates:
            symbol = candidate.get("symbol", "UNKNOWN")
            is_held = bool(candidate.get("is_held"))

            # 1. Tariq L1 Analysis
            tariq_res = self.evaluate_tariq_technical(candidate, trading_mode=mode)
            # 2. Nawwar L1 Analysis
            nawwar_res = self.evaluate_nawwar_sentiment(candidate, trading_mode=mode)

            l1_passed = tariq_res["passed"] and nawwar_res["passed"]
            if l1_passed:
                passed_l1_count += 1

            if l1_passed or is_held:
                l1_batch_evaluations.append({
                    "symbol": symbol,
                    "tariq": tariq_res,
                    "nawwar": nawwar_res,
                    "is_held": is_held
                })

            # 3. Haziq L2 Synthesis
            haziq_res = self.evaluate_haziq_synthesis(
                candidate=candidate,
                tariq_res=tariq_res,
                nawwar_res=nawwar_res,
                account_equity=account_equity,
                trading_mode=mode
            )
            l2_passed = l1_passed and haziq_res["passed"]
            if l2_passed:
                passed_l2_count += 1

            danial_res = None
            l3_passed = False
            order_id = None
            client_order_id = f"ORDER-{uuid.uuid4().hex[:8]}"

            if is_held:
                # Active Position Watch branch
                if haziq_res.get("held_action") == "EXIT_REQUEST":
                    stage_reached = "L2_EARLY_EXIT"
                    final_decision = "AGENT_EARLY_EXIT_DISPATCHED"
                    exit_res = self.execute_position_exit(
                        symbol=symbol,
                        quantity=candidate.get("held_qty"),
                        reason="AGENT_EARLY_EXIT",
                        exit_price=candidate.get("price")
                    )
                    if exit_res.get("success"):
                        order_id = exit_res.get("order_id")
                        client_order_id = exit_res.get("client_order_id")
                        orders_placed_count += 1
                        orders_placed.append({
                            "order_id": order_id,
                            "client_order_id": client_order_id,
                            "symbol": symbol,
                            "quantity": exit_res.get("quantity"),
                            "entry_price": exit_res.get("exit_price"),
                            "order_side": "SELL",
                            "status": exit_res.get("status"),
                            "source": "AGENT_EARLY_EXIT"
                        })
                else:
                    stage_reached = "ACTIVE_WATCH"
                    final_decision = "HOLD_POSITION_MAINTAINED"
            else:
                # Dispatch L3 compliance audit (Danial Risk Gatekeeper)
                if l2_passed and getattr(self, "dispatcher", None) and wake_agents:
                    try:
                        self.dispatcher.haziq_wake_danial({
                            "symbol": symbol,
                            "candidate": candidate,
                            "haziq": haziq_res
                        })
                    except Exception as e:
                        logger.warning("[Dispatcher] Failed to wake L3 Danial: %s", e)

                # Standard new entry candidate evaluation
                danial_res = self.evaluate_danial_compliance(
                    candidate=candidate,
                    haziq_res=haziq_res,
                    account_equity=account_equity,
                    now_ny=now_ny,
                    mock_market_window=mock_market_window or force_simulation,
                    force_simulation=force_simulation,
                    trading_mode=mode
                )
                l3_passed = l2_passed and danial_res["passed"]
                if l3_passed:
                    passed_l3_count += 1

                # Determine stage and final decision
                if not tariq_res["passed"]:
                    stage_reached = "L1_TECHNICAL"
                    final_decision = "REJECTED_TARIQ_TECHNICAL_SCORE"
                elif not nawwar_res["passed"]:
                    stage_reached = "L1_SENTIMENT"
                    final_decision = "REJECTED_NAWWAR_SENTIMENT_GATE"
                elif not haziq_res["passed"]:
                    stage_reached = "L2_STRATEGY"
                    final_decision = "REJECTED_HAZIQ_COMPOSITE_THRESHOLD"
                elif not danial_res["passed"]:
                    stage_reached = "L3_RISK"
                    final_decision = f"REJECTED_DANIAL_HARD_RULES ({danial_res['rejection_reason']})"
                else:
                    stage_reached = "L4_DISPATCH"
                    final_decision = "APPROVED_FOR_EXECUTION"

                client_order_id = danial_res["client_order_id"]

                # L4 Execution to OpenD Paper Trading if fully approved
                if l3_passed:
                    order_req_data = danial_res["order_request"]
                    order_req_obj = OrderRequest(**order_req_data)

                    # Submit to OpenD client or simulation runner
                    if client.is_connected():
                        gateway_resp = client.submit_order(order_req_data)
                        opend_status = client.get_connection_status()
                        order_id = gateway_resp.get("order_id") or f"ORD-{client_order_id[:8]}"
                        status_str = gateway_resp.get("status", "SUBMITTED")
                    elif force_simulation:
                        opend_status = client.get_connection_status()
                        order_id = f"SIM-ORD-{client_order_id[:8]}"
                        status_str = "SUBMITTED_PAPER_SIM"
                    else:
                        gateway_resp = client.submit_order(order_req_data)
                        opend_status = client.get_connection_status()
                        order_id = gateway_resp.get("order_id") or f"ORD-{client_order_id[:8]}"
                        status_str = gateway_resp.get("status", "REJECTED")

                    # Register in hard rules engine for idempotency
                    self.hard_rules_engine.register_order_processed(order_req_obj)

                    # Persist to paper_orders table
                    with self._get_connection() as conn:
                        conn.execute("""
                            INSERT INTO paper_orders (
                                client_order_id, order_id, cycle_id, symbol, order_side,
                                quantity, entry_price, stop_loss_price, take_profit_price,
                                status, opend_status, message, time_in_force, trading_mode, source, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            client_order_id,
                            order_id,
                            cycle_id,
                            symbol,
                            order_req_data["order_side"],
                            order_req_data["quantity"],
                            order_req_data["entry_price"],
                            order_req_data["stop_loss_price"],
                            haziq_res["take_profit_price"],
                            status_str,
                            opend_status,
                            f"Paper Trading Simulation Order to Moomoo OpenD (Env: {client.trd_env}, Mode: {mode})",
                            order_req_data.get("time_in_force", "DAY"),
                            mode,
                            "AGENT_PIPELINE",
                            now_utc.isoformat()
                        ))
                        conn.commit()

                    orders_placed_count += 1
                    orders_placed.append({
                        "order_id": order_id,
                        "client_order_id": client_order_id,
                        "symbol": symbol,
                        "quantity": order_req_data["quantity"],
                        "entry_price": order_req_data["entry_price"],
                        "stop_loss_price": order_req_data["stop_loss_price"],
                        "take_profit_price": haziq_res["take_profit_price"],
                        "time_in_force": order_req_data.get("time_in_force", "DAY"),
                        "trading_mode": mode,
                        "status": status_str,
                        "opend_status": opend_status
                    })

            deliberation = {
                "symbol": symbol,
                "stage_reached": stage_reached,
                "final_decision": final_decision,
                "tariq": tariq_res,
                "nawwar": nawwar_res,
                "haziq": haziq_res,
                "danial": danial_res,
                "order_id": order_id,
                "client_order_id": client_order_id
            }
            deliberation_records.append(deliberation)

            # Persist deliberation
            with self._get_connection() as conn:
                conn.execute("""
                    INSERT INTO agent_deliberations (
                        cycle_id, symbol, timestamp, stage_reached, final_decision,
                        tariq_analysis, nawwar_analysis, haziq_synthesis, danial_audit,
                        order_id, client_order_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    cycle_id,
                    symbol,
                    now_utc.isoformat(),
                    stage_reached,
                    final_decision,
                    json.dumps(tariq_res),
                    json.dumps(nawwar_res),
                    json.dumps(haziq_res),
                    json.dumps(danial_res),
                    order_id,
                    client_order_id
                ))
                conn.commit()

        # Dispatch batched L2 Haziq wake once for all qualifying candidates
        if l1_batch_evaluations and getattr(self, "dispatcher", None) and wake_agents:
            try:
                self.dispatcher.aggregate_and_wake_haziq(l1_batch_evaluations)
            except Exception as e:
                logger.warning("[Dispatcher] Failed to wake L2 Haziq: %s", e)

        # Persist simulation cycle summary
        cycle_status = "COMPLETED" if orders_placed_count > 0 else "COMPLETED_NO_ORDERS"
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO simulation_cycles (
                    cycle_id, created_at, status, total_candidates,
                    passed_l1, passed_l2, passed_l3, orders_placed, trading_mode
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cycle_id,
                now_utc.isoformat(),
                cycle_status,
                total_candidates,
                passed_l1_count,
                passed_l2_count,
                passed_l3_count,
                orders_placed_count,
                mode
            ))
            conn.commit()

        return {
            "cycle_id": cycle_id,
            "created_at": now_utc.isoformat(),
            "status": cycle_status,
            "account_equity": account_equity,
            "summary": {
                "total_candidates": total_candidates,
                "passed_l1": passed_l1_count,
                "passed_l2": passed_l2_count,
                "passed_l3": passed_l3_count,
                "orders_placed": orders_placed_count
            },
            "orders": orders_placed,
            "deliberations": deliberation_records
        }

    # =========================================================================
    # Position Exit Execution & L4 Exit Sentinel Daemon
    # =========================================================================
    def execute_position_exit(
        self,
        symbol: str,
        quantity: Optional[int] = None,
        reason: str = "AGENT_EARLY_EXIT",
        exit_price: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Executes a SELL order to OpenD gateway to liquidate/close open position,
        cancels open orders for the symbol, updates hard rules PDT tracking,
        and records the transaction in paper_orders.
        """
        client = self.moomoo_client or get_moomoo_client()
        mode = getattr(self, "trading_mode", BridgeConfig.TRADING_MODE).upper()
        now_utc = datetime.now(timezone.utc)
        now_ny = datetime.now(NY_TZ)
        trade_date = now_ny.strftime("%Y-%m-%d")

        # Query active positions to verify position exists and get qty & cost
        positions = client.query_positions() if (client and hasattr(client, "is_connected") and client.is_connected()) else []
        matching_pos = None
        for p in positions:
            code = str(p.get("code", "")).strip()
            clean_c = code.split(".")[-1] if "." in code else code
            clean_s = symbol.split(".")[-1] if "." in symbol else symbol
            if code == symbol or clean_c == clean_s:
                matching_pos = p
                break

        pos_qty = int(matching_pos.get("qty", 0)) if matching_pos else 0
        cost_price = float(matching_pos.get("cost_price", 0.0)) if matching_pos else 0.0

        if pos_qty <= 0:
            # Check local filled positions from paper_orders
            with self._get_connection() as conn:
                po_row = conn.execute("""
                    SELECT quantity, entry_price FROM paper_orders
                    WHERE symbol = ? AND order_side = 'BUY' AND status = 'FILLED'
                    ORDER BY id DESC LIMIT 1
                """, (symbol,)).fetchone()
                if po_row:
                    pos_qty = int(po_row["quantity"])
                    cost_price = float(po_row["entry_price"])

        if pos_qty <= 0:
            return {
                "success": False,
                "message": f"No active open position found for {symbol}."
            }

        sell_qty = min(quantity, pos_qty) if quantity and quantity > 0 else pos_qty
        current_price = exit_price or cost_price or 10.0
        if not exit_price and client and hasattr(client, "is_connected") and client.is_connected():
            try:
                quote = client.get_stock_quote(symbol)
                if quote and (quote.get("cur_price") or quote.get("price")):
                    current_price = float(quote.get("cur_price") or quote.get("price"))
            except Exception as q_err:
                logger.warning("Could not fetch real-time quote for %s during exit: %s", symbol, q_err)

        client_order_id = f"EXIT-{uuid.uuid4().hex[:8]}"
        order_data = {
            "client_order_id": client_order_id,
            "symbol": symbol,
            "quantity": sell_qty,
            "entry_price": current_price,
            "stop_loss_price": round(current_price * 0.95, 2),
            "order_side": "SELL",
            "time_in_force": "DAY",
            "trading_mode": mode
        }
        order_obj = OrderRequest(**order_data)

        # Cancel pending open orders for this symbol first
        try:
            with self._get_connection() as conn:
                open_orders = conn.execute("""
                    SELECT order_id, client_order_id FROM paper_orders
                    WHERE symbol = ? AND status IN ('SUBMITTED', 'PENDING')
                """, (symbol,)).fetchall()
                for o in open_orders:
                    self.cancel_paper_order(o["order_id"] or o["client_order_id"])
        except Exception as c_err:
            logger.warning("Error cancelling pending orders for %s: %s", symbol, c_err)

        order_id = f"ORD-{client_order_id[:8]}"
        opend_status = client.get_connection_status() if hasattr(client, "get_connection_status") else "CONNECTED"
        if client and hasattr(client, "is_connected") and client.is_connected():
            gateway_resp = client.submit_order(order_data)
            order_id = gateway_resp.get("order_id") or order_id
            status_str = gateway_resp.get("status", "FILLED")
        else:
            status_str = "FILLED"

        # Register order processed for idempotency
        self.hard_rules_engine.register_order_processed(order_obj)

        # Detect round-trip & update Rule 3 PDT
        self.hard_rules_engine.register_order_and_record_day_trade_if_roundtrip(trade_date, order_obj)

        # Persist SELL order in paper_orders
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO paper_orders (
                    client_order_id, order_id, cycle_id, symbol, order_side,
                    quantity, entry_price, stop_loss_price, take_profit_price,
                    status, opend_status, message, time_in_force, trading_mode, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                client_order_id,
                order_id,
                f"EXIT-{now_utc.strftime('%Y%m%d')}",
                symbol,
                "SELL",
                sell_qty,
                current_price,
                round(current_price * 0.95, 2),
                round(current_price * 1.10, 2),
                status_str,
                opend_status,
                f"Position Exit [{reason}]: Sold {sell_qty} shares at ${current_price:.2f}",
                "DAY",
                mode,
                reason,
                now_utc.isoformat()
            ))
            conn.commit()

        return {
            "success": True,
            "order_id": order_id,
            "client_order_id": client_order_id,
            "symbol": symbol,
            "quantity": sell_qty,
            "exit_price": current_price,
            "reason": reason,
            "status": status_str,
            "message": f"Successfully executed {reason} exit for {sell_qty} shares of {symbol} at ${current_price:.2f}."
        }

    def evaluate_exit_sentinel(
        self,
        mock_market_prices: Optional[Dict[str, float]] = None,
        atrs: Optional[Dict[str, float]] = None
    ) -> List[Dict[str, Any]]:
        """
        L4 Deterministic Exit Sentinel (Sole Execution Owner).
        Monitors active positions against Stop Loss, Take Profit (TP1 50%), and Chandelier Trailing Stop.
        Executes automated SELL orders to OpenD when thresholds are reached.
        """
        client = self.moomoo_client or get_moomoo_client()
        positions = client.query_positions() if (client and hasattr(client, "is_connected") and client.is_connected()) else []
        exits_executed = []

        if not positions:
            # Also check local filled positions without sells
            with self._get_connection() as conn:
                unclosed = conn.execute("""
                    SELECT DISTINCT p1.symbol, p1.quantity, p1.entry_price, p1.stop_loss_price, p1.take_profit_price
                    FROM paper_orders p1
                    WHERE p1.order_side = 'BUY' AND p1.status = 'FILLED'
                    AND NOT EXISTS (
                        SELECT 1 FROM paper_orders p2
                        WHERE p2.symbol = p1.symbol AND p2.order_side = 'SELL' AND p2.status = 'FILLED'
                        GROUP BY p2.symbol HAVING SUM(p2.quantity) >= p1.quantity
                    )
                """).fetchall()
                for row in unclosed:
                    positions.append({
                        "code": row["symbol"],
                        "qty": row["quantity"],
                        "cost_price": row["entry_price"]
                    })

        for pos in positions:
            symbol = str(pos.get("code", "")).strip()
            qty = int(pos.get("qty", 0))
            cost_price = float(pos.get("cost_price", 0.0))
            if qty <= 0 or not symbol:
                continue

            current_price = cost_price
            if mock_market_prices and symbol in mock_market_prices:
                current_price = float(mock_market_prices[symbol])
            elif client and hasattr(client, "is_connected") and client.is_connected():
                try:
                    q = client.get_stock_quote(symbol)
                    if q and (q.get("cur_price") or q.get("price")):
                        current_price = float(q.get("cur_price") or q.get("price"))
                except Exception:
                    pass

            # Fetch structural SL & TP from paper_orders
            with self._get_connection() as conn:
                buy_row = conn.execute("""
                    SELECT stop_loss_price, take_profit_price, entry_price
                    FROM paper_orders
                    WHERE symbol = ? AND order_side = 'BUY'
                    ORDER BY id DESC LIMIT 1
                """, (symbol,)).fetchone()

                tp1_row = conn.execute("""
                    SELECT id FROM paper_orders
                    WHERE symbol = ? AND order_side = 'SELL' AND (source = 'EXIT_SENTINEL_TP1' OR message LIKE '%TP1%')
                    LIMIT 1
                """, (symbol,)).fetchone()

            atr = (atrs and atrs.get(symbol)) or max(0.10, round(cost_price * 0.03, 2))
            if buy_row and buy_row["stop_loss_price"] and float(buy_row["stop_loss_price"]) > 0:
                sl_price = float(buy_row["stop_loss_price"])
            else:
                sl_price = round(max(0.01, cost_price - (1.5 * atr)), 2)

            if buy_row and buy_row["take_profit_price"] and float(buy_row["take_profit_price"]) > 0:
                tp1_price = float(buy_row["take_profit_price"])
            else:
                tp1_price = round(cost_price + (1.5 * max(0.05, cost_price - sl_price)), 2)

            tp1_hit = (tp1_row is not None)

            # 1. Chandelier Trailing Exit / Break-Even Defense (Post-TP1)
            if tp1_hit:
                trailing_stop = max(cost_price, round(current_price - (2.0 * atr), 2))
                if current_price <= cost_price or current_price <= trailing_stop:
                    logger.warning("EXIT SENTINEL TRIGGERED: %s price $%.2f <= Trailing/Break-Even Stop $%.2f. Executing trailing SELL.", symbol, current_price, trailing_stop)
                    res = self.execute_position_exit(
                        symbol=symbol,
                        quantity=qty,
                        reason="EXIT_SENTINEL_CHANDELIER_TRAILING",
                        exit_price=current_price
                    )
                    exits_executed.append(res)

            # 2. Stop Loss Hit (Pre-TP1) -> 100% full exit
            elif current_price <= sl_price:
                logger.warning("EXIT SENTINEL TRIGGERED: %s price $%.2f <= Stop Loss $%.2f. Executing full SELL.", symbol, current_price, sl_price)
                res = self.execute_position_exit(
                    symbol=symbol,
                    quantity=qty,
                    reason="EXIT_SENTINEL_STOP_LOSS",
                    exit_price=current_price
                )
                exits_executed.append(res)

            # 3. Take Profit TP1 Hit -> 50% partial exit, raise SL to Break-Even
            elif current_price >= tp1_price:
                sell_qty = max(1, qty // 2)
                logger.info("EXIT SENTINEL TRIGGERED: %s price $%.2f >= TP1 $%.2f. Executing 50%% TP SELL.", symbol, current_price, tp1_price)
                res = self.execute_position_exit(
                    symbol=symbol,
                    quantity=sell_qty,
                    reason="EXIT_SENTINEL_TP1",
                    exit_price=current_price
                )
                # Update SL to Break-Even in latest buy order
                with self._get_connection() as conn:
                    conn.execute("""
                        UPDATE paper_orders SET stop_loss_price = entry_price
                        WHERE symbol = ? AND order_side = 'BUY'
                    """, (symbol,))
                    conn.commit()
                exits_executed.append(res)

        return exits_executed

    def evaluate_portfolio_positions(
        self,
        mock_market_prices: Optional[Dict[str, float]] = None,
        atrs: Optional[Dict[str, float]] = None
    ) -> List[Dict[str, Any]]:
        """
        Alias for evaluate_exit_sentinel providing explicit backward and API compatibility (HOM-386 / HOM-384).
        Monitors active positions against Stop Loss, Take Profit (TP1 50%), and Chandelier Trailing Stop.
        """
        return self.evaluate_exit_sentinel(mock_market_prices=mock_market_prices, atrs=atrs)

    # =========================================================================
    # Query & Broker Synchronization Helpers
    # =========================================================================
    def sync_broker_orders(self) -> Dict[str, Any]:
        """
        Two-way reconciliation between OpenD broker paper trading orders and local SQLite DB.
        Queries active orders from OpenD (TrdEnv.SIMULATE) and updates paper_orders records.
        Imports unmatched broker orders as BROKER_IMPORT.
        """
        client = self.moomoo_client or get_moomoo_client()
        mode = getattr(self, "trading_mode", BridgeConfig.TRADING_MODE).upper()
        if not client.is_connected():
            return {"synced": False, "reason": "OpenD is not connected", "updated_count": 0, "imported_count": 0}

        try:
            broker_orders = client.query_orders()
            if not broker_orders:
                return {"synced": True, "updated_count": 0, "imported_count": 0}

            updated_count = 0
            imported_count = 0
            with self._get_connection() as conn:
                for b_ord in broker_orders:
                    b_id = str(b_ord.get("order_id", "")).strip()
                    b_status_raw = str(b_ord.get("order_status", "")).strip().upper()
                    if not b_id:
                        continue

                    # Map broker status to local status
                    mapped_status = "PENDING"
                    if "FILLED" in b_status_raw:
                        mapped_status = "FILLED"
                    elif "CANCEL" in b_status_raw:
                        mapped_status = "CANCELLED"
                    elif "FAIL" in b_status_raw or "REJECT" in b_status_raw or "DISABLE" in b_status_raw:
                        mapped_status = "REJECTED"
                    elif "SUBMIT" in b_status_raw:
                        mapped_status = "SUBMITTED"

                    existing = conn.execute(
                        "SELECT id, status FROM paper_orders WHERE order_id = ?",
                        (b_id,)
                    ).fetchone()

                    if existing:
                        if existing["status"] != mapped_status:
                            conn.execute(
                                "UPDATE paper_orders SET status = ?, opend_status = 'CONNECTED' WHERE id = ?",
                                (mapped_status, existing["id"])
                            )
                            updated_count += 1
                    else:
                        # Import unmatched external / broker order into paper_orders
                        b_code = str(b_ord.get("code", "")).strip()
                        b_side = str(b_ord.get("trd_side", "BUY")).strip().upper()
                        b_qty = int(b_ord.get("qty", 0))
                        b_price = float(b_ord.get("price", 0.0))
                        b_time = str(b_ord.get("create_time", "")) or datetime.now(timezone.utc).isoformat()
                        
                        # Anti-Stop-Hunt: Use 1.5x ATR buffer instead of fixed 5% fallback
                        b_atr = max(0.10, round(b_price * 0.03, 2))
                        b_sl = round(max(0.01, b_price - (1.5 * b_atr)), 2)
                        conn.execute("""
                            INSERT INTO paper_orders (
                                client_order_id, order_id, cycle_id, symbol, order_side,
                                quantity, entry_price, stop_loss_price, take_profit_price,
                                status, opend_status, message, time_in_force, trading_mode, source, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            f"BROKER-{b_id}",
                            b_id,
                            "EXTERNAL_BROKER",
                            b_code,
                            b_side,
                            b_qty,
                            b_price,
                            b_sl,
                            round(b_price * 1.15, 2),
                            mapped_status,
                            "CONNECTED",
                            f"Imported from OpenD broker order {b_id}",
                            "DAY",
                            mode,
                            "BROKER_IMPORT",
                            b_time
                        ))
                        imported_count += 1

                conn.commit()

            return {"synced": True, "updated_count": updated_count, "imported_count": imported_count}
        except Exception as e:
            logger.error("Error during sync_broker_orders: %s", e)
            return {"synced": False, "error": str(e), "updated_count": 0, "imported_count": 0}

    def reconcile_positions_with_orders(self) -> Dict[str, Any]:
        """
        Two-way position reconciliation:
        Queries active positions from OpenD broker. If any open position (qty > 0)
        lacks an existing transaction record in paper_orders, auto-creates an audit
        record with source='POSITION_RECONCILED'.
        Anti-Stop-Hunt: Uses 1.5x ATR volatility buffer for Stop Loss instead of fixed 5%.
        """
        client = self.moomoo_client or get_moomoo_client()
        mode = getattr(self, "trading_mode", BridgeConfig.TRADING_MODE).upper()
        if not client.is_connected():
            return {"synced": False, "reason": "OpenD is not connected", "reconciled_count": 0}

        try:
            positions = client.query_positions()
            if not positions:
                return {"synced": True, "reconciled_count": 0}

            reconciled_count = 0
            with self._get_connection() as conn:
                for pos in positions:
                    raw_code = str(pos.get("code", "")).strip()
                    pos_id = str(pos.get("position_id", "")).strip()
                    qty = int(pos.get("qty", 0))
                    cost_price = float(pos.get("cost_price", 0.0))
                    # Skip closed positions (qty == 0) and missing symbols
                    if qty == 0 or not raw_code:
                        continue

                    order_side = "SELL" if qty < 0 else "BUY"
                    abs_qty = abs(qty)

                    clean_sym = raw_code.split(".")[-1] if "." in raw_code else raw_code

                    # Check if any order exists in paper_orders for this symbol
                    existing = conn.execute("""
                        SELECT id, source FROM paper_orders
                        WHERE symbol = ? OR symbol = ?
                        ORDER BY id DESC LIMIT 1
                    """, (raw_code, clean_sym)).fetchone()

                    if not existing:
                        now_str = datetime.now(timezone.utc).isoformat()
                        client_order_id = f"RECON-{clean_sym}-{int(datetime.now(timezone.utc).timestamp())}"
                        order_id = f"POS-{pos_id or clean_sym}"
                        
                        # Anti-Stop-Hunt: Use 1.5x ATR buffer instead of fixed 5% fallback
                        pos_atr = max(0.10, round(cost_price * 0.03, 2))
                        if order_side == "SELL":
                            pos_sl = round(cost_price + (1.5 * pos_atr), 2)
                            pos_tp = round(max(0.01, cost_price * 0.85), 2)
                        else:
                            pos_sl = round(max(0.01, cost_price - (1.5 * pos_atr)), 2)
                            pos_tp = round(cost_price * 1.15, 2)
                        conn.execute("""
                            INSERT INTO paper_orders (
                                client_order_id, order_id, cycle_id, symbol, order_side,
                                quantity, entry_price, stop_loss_price, take_profit_price,
                                status, opend_status, message, time_in_force, trading_mode, source, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            client_order_id,
                            order_id,
                            "RECONCILIATION",
                            raw_code,
                            order_side,
                            abs_qty,
                            cost_price,
                            pos_sl,
                            pos_tp,
                            "FILLED",
                            "CONNECTED",
                            f"Auto-reconciled position baseline audit for {raw_code} ({order_side})",
                            "DAY",
                            mode,
                            "POSITION_RECONCILED",
                            now_str
                        ))
                        reconciled_count += 1
                conn.commit()

            return {"synced": True, "reconciled_count": reconciled_count}
        except Exception as e:
            logger.error("Error during reconcile_positions_with_orders: %s", e)
            return {"synced": False, "error": str(e), "reconciled_count": 0}

    def get_recent_activity(self, limit: int = 10) -> Dict[str, Any]:
        """Returns recent cycles, latest deliberation cards, and order records with broker sync."""
        try:
            self.sync_broker_orders()
            self.reconcile_positions_with_orders()
        except Exception as sync_err:
            logger.warning("Broker order/position sync error in get_recent_activity: %s", sync_err)

        with self._get_connection() as conn:
            cycles_cursor = conn.execute("""
                SELECT cycle_id, created_at, status, total_candidates,
                       passed_l1, passed_l2, passed_l3, orders_placed
                FROM simulation_cycles
                ORDER BY id DESC LIMIT ?
            """, (limit,))
            cycles = [dict(r) for r in cycles_cursor.fetchall()]

            latest_cycle_id = cycles[0]["cycle_id"] if cycles else None
            deliberations = []
            if latest_cycle_id:
                delib_cursor = conn.execute("""
                    SELECT id, cycle_id, symbol, timestamp, stage_reached, final_decision,
                           tariq_analysis, nawwar_analysis, haziq_synthesis, danial_audit,
                           order_id, client_order_id
                    FROM agent_deliberations
                    WHERE cycle_id = ?
                    ORDER BY id ASC
                """, (latest_cycle_id,))
                for row in delib_cursor.fetchall():
                    item = dict(row)
                    item["tariq"] = json.loads(item.pop("tariq_analysis"))
                    item["nawwar"] = json.loads(item.pop("nawwar_analysis"))
                    item["haziq"] = json.loads(item.pop("haziq_synthesis"))
                    item["danial"] = json.loads(item.pop("danial_audit"))
                    deliberations.append(item)

            orders_cursor = conn.execute("""
                SELECT id, client_order_id, order_id, cycle_id, symbol, order_side,
                       quantity, entry_price, stop_loss_price, take_profit_price,
                       status, opend_status, message, time_in_force, trading_mode, source, created_at
                FROM paper_orders
                ORDER BY id DESC LIMIT 50
            """)
            orders = [dict(r) for r in orders_cursor.fetchall()]

            # Aggregate stats
            stats_cursor = conn.execute("""
                SELECT COUNT(*) as total_cycles,
                       SUM(orders_placed) as total_orders
                FROM simulation_cycles
            """)
            st = dict(stats_cursor.fetchone() or {})

            return {
                "status": "OK",
                "cycles": cycles,
                "latest_cycle_id": latest_cycle_id,
                "deliberations": deliberations,
                "orders": orders,
                "stats": {
                    "total_cycles": st.get("total_cycles") or 0,
                    "total_orders": st.get("total_orders") or 0,
                    "latest_candidates": len(deliberations)
                }
            }

    def get_paper_orders(self, limit: int = 50, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        try:
            self.sync_broker_orders()
            self.reconcile_positions_with_orders()
        except Exception as sync_err:
            logger.warning("Broker order/position sync error in get_paper_orders: %s", sync_err)

        query = """
            SELECT id, client_order_id, order_id, cycle_id, symbol, order_side,
                   quantity, entry_price, stop_loss_price, take_profit_price,
                   status, opend_status, message, time_in_force, trading_mode, source, created_at
            FROM paper_orders
        """
        params: List[Any] = []
        if symbol and symbol.strip():
            clean_sym = symbol.strip().upper()
            bare_sym = clean_sym.split('.')[-1]
            prefixed_sym = f"US.{bare_sym}"
            query += " WHERE (UPPER(symbol) = ? OR UPPER(symbol) = ? OR UPPER(symbol) = ?)"
            params.extend([clean_sym, bare_sym, prefixed_sym])

        query += " ORDER BY id DESC LIMIT ?"
        safe_limit = max(0, int(limit))
        params.append(safe_limit)

        with self._get_connection() as conn:
            cursor = conn.execute(query, tuple(params))
            rows = [dict(r) for r in cursor.fetchall()]

        mapped_rows = []
        for r in rows:
            entry = dict(r)
            entry["side"] = entry.get("order_side")
            entry["price"] = entry.get("entry_price")
            entry["executed_price"] = entry.get("entry_price")
            entry["timestamp"] = entry.get("created_at")
            mapped_rows.append(entry)

        return mapped_rows

    def cancel_paper_order(self, order_id_or_client_id: str) -> Dict[str, Any]:
        """
        Cancels an active paper trading order (SUBMITTED/PENDING) and updates status in SQLite DB.
        """
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT id, order_id, client_order_id, symbol, status FROM paper_orders WHERE order_id = ? OR client_order_id = ?",
                (order_id_or_client_id, order_id_or_client_id)
            ).fetchone()

            if not row:
                return {
                    "success": False,
                    "message": f"Pesanan {order_id_or_client_id} tidak dijumpai."
                }

            current_status = row["status"]
            if current_status in ("CANCELLED", "FILLED", "REJECTED"):
                return {
                    "success": False,
                    "message": f"Pesanan tidak boleh dibatalkan kerana sudah berstatus {current_status}."
                }

            order_id = row["order_id"]
            client = get_moomoo_client()
            broker_msg = ""
            if client and hasattr(client, "cancel_order") and client.is_connected():
                try:
                    broker_res = client.cancel_order(order_id)
                    broker_msg = broker_res.get("message") or broker_res.get("error") or ""
                except Exception as e:
                    logger.warning("Broker cancel error for %s: %s", order_id, e)
                    broker_msg = str(e)

            cancel_msg = f"Dibatalkan oleh pengguna melalui dashboard ({broker_msg})" if broker_msg else "Dibatalkan oleh pengguna melalui dashboard"
            conn.execute(
                "UPDATE paper_orders SET status = 'CANCELLED', message = ? WHERE id = ?",
                (cancel_msg, row["id"])
            )
            conn.commit()

            return {
                "success": True,
                "order_id": order_id,
                "client_order_id": row["client_order_id"],
                "symbol": row["symbol"],
                "status": "CANCELLED",
                "message": f"Pesanan {order_id} ({row['symbol']}) berjaya dibatalkan."
            }

    def close(self) -> None:
        """Closes any underlying OpenD context cleanly."""
        if self.moomoo_client is not None and hasattr(self.moomoo_client, "close"):
            try:
                self.moomoo_client.close()
            except Exception:
                pass


# Module-level singleton
_agent_pipeline_instance: Optional[AgentPipeline] = None


def get_agent_pipeline() -> AgentPipeline:
    global _agent_pipeline_instance
    if _agent_pipeline_instance is None:
        _agent_pipeline_instance = AgentPipeline()
    return _agent_pipeline_instance
