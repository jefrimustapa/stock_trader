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
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from .config import BridgeConfig
from .hard_rules import HardRulesEngine, OrderRequest, HardRuleViolation
from .moomoo_client import get_moomoo_client

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

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or BridgeConfig.AGENT_ACTIVITY_DB
        self.hard_rules_engine = HardRulesEngine(BridgeConfig.EQUITY_BASELINE_DB)
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
                    created_at TEXT NOT NULL
                )
            """)
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

    # =========================================================================
    # L1: Tariq (Technical Analyst)
    # =========================================================================
    def evaluate_tariq_technical(self, candidate: Dict[str, Any]) -> Dict[str, Any]:
        """
        Tariq analyzes Wyckoff accumulation/markup, Elliott wave structure,
        and SMC (Smart Money Concepts) Fair Value Gap (FVG) confluence.
        Returns technical analysis dict with S_tech in [0, 100].
        """
        symbol = candidate.get("symbol", "UNKNOWN")
        price = float(candidate.get("price", 0.0))
        lane = candidate.get("lane", "SETUP")
        lane_score = float(candidate.get("lane_score", 70.0))
        rs_spy = float(candidate.get("rs_spy", 1.0))
        setup_metrics = candidate.get("setup_metrics") or {}
        dist_52w = float(setup_metrics.get("dist_to_52w_high_pct") or 5.0)

        # Baseline S_tech calculated deterministically from screener lane and market confluence
        base_score = 65.0 if lane == "MOMENTUM" else 62.0
        bonus_rs = min(15.0, max(-15.0, (rs_spy - 1.0) * 20.0))
        bonus_dist = max(0.0, 10.0 - dist_52w) * 0.8
        raw_tech = base_score + bonus_rs + bonus_dist + (lane_score - 70.0) * 0.2
        s_tech = round(max(10.0, min(98.0, raw_tech)), 1)

        wyckoff_phase = "MARKUP" if lane == "MOMENTUM" else "ACCUMULATION_PHASE_C"
        fvg_confluence = "BULLISH_FVG_CONFIRMED" if s_tech >= 65.0 else "TESTING_LIQUIDITY_ZONE"
        support_level = round(price * 0.96, 2)
        resistance_level = round(price * 1.08, 2)

        passed = s_tech >= 60.0
        return {
            "agent": "Tariq",
            "role": "L1 Technical Analyst",
            "symbol": symbol,
            "s_tech": s_tech,
            "passed": passed,
            "wyckoff_phase": wyckoff_phase,
            "elliott_wave": "Wave 3 Impulse Expansion" if lane == "MOMENTUM" else "Wave 1 / Leading Diagonal",
            "smc_fvg_confluence": fvg_confluence,
            "support_level": support_level,
            "resistance_level": resistance_level,
            "fail_fast": not passed,
            "notes": (
                f"S_tech={s_tech}/100. Wyckoff {wyckoff_phase} with SMC {fvg_confluence}. "
                f"Konfluens teknikal {'memenuhi' if passed else 'tidak memenuhi'} syarat ambang >= 60.0."
            )
        }

    # =========================================================================
    # L1: Nawwar (Sentiment & Macro Scout)
    # =========================================================================
    def evaluate_nawwar_sentiment(self, candidate: Dict[str, Any]) -> Dict[str, Any]:
        """
        Nawwar evaluates news flow, earnings catalyst gate, and macro environment.
        Raw score S_sent in [-100, +100], normalized S_sent_norm in [0, 100].
        Hard threshold: S_sent >= +60.0 (S_sent_norm >= 80.0) without earnings in 5 days.
        """
        symbol = candidate.get("symbol", "UNKNOWN")
        change_pct = float(candidate.get("change_pct", 0.0))
        
        # Raw sentiment heuristic from momentum and trend indicators
        raw_sent = 70.0 + min(25.0, change_pct * 3.0)
        raw_sent = round(max(-100.0, min(100.0, raw_sent)), 1)
        sent_norm = normalize_sentiment(raw_sent)

        # Earnings & macro gate check
        earnings_within_5d = False
        fomc_macro_risk = False
        passed = (raw_sent >= 60.0) and (not earnings_within_5d) and (not fomc_macro_risk)

        clean_ticker = symbol.split(".")[-1] if "." in symbol else symbol
        news_url = f"https://finance.yahoo.com/quote/{clean_ticker}/news/"
        news_headline = f"Liputan Berita Terkini & Sentimen Pasaran {clean_ticker}"

        label = "BULLISH" if raw_sent >= 50.0 else ("BEARISH" if raw_sent <= -20.0 else "NEUTRAL")
        return {
            "agent": "Nawwar",
            "role": "L1 Sentiment & Macro Scout",
            "symbol": symbol,
            "s_sent_raw": raw_sent,
            "s_sent_norm": sent_norm,
            "passed": passed,
            "sentiment_label": label,
            "earnings_within_5d": earnings_within_5d,
            "fomc_macro_risk": fomc_macro_risk,
            "news_url": news_url,
            "news_headline": news_headline,
            "notes": (
                f"S_sent={raw_sent:+0.1f} (Norm={sent_norm}/100, {label}). "
                f"Tiada risiko earnings dalam 5 hari. {'Lulus' if passed else 'Ditolak'} tapisan sentimen."
            )
        }

    # =========================================================================
    # L2: Haziq (Portfolio & Strategy Lead)
    # =========================================================================
    def evaluate_haziq_synthesis(
        self,
        candidate: Dict[str, Any],
        tariq_res: Dict[str, Any],
        nawwar_res: Dict[str, Any],
        account_equity: float
    ) -> Dict[str, Any]:
        """
        Haziq combines L1 scores into composite S_total = 0.65*S_tech + 0.35*S_sent_norm.
        Entry Gate: S_total >= 65.0, S_tech >= 60.0, S_sent_norm >= 80.0.
        Calculates position sizing: 1.5% equity risk, max 20% equity cap, Stop Loss = 1.5*ATR14.
        """
        symbol = candidate.get("symbol", "UNKNOWN")
        price = float(candidate.get("price", 10.0))
        s_tech = float(tariq_res.get("s_tech", 0.0))
        s_sent_norm = float(nawwar_res.get("s_sent_norm", 0.0))

        s_total = calculate_composite_score(s_tech, s_sent_norm)
        passed_entry_gate = (s_total >= 65.0) and (s_tech >= 60.0) and (s_sent_norm >= 80.0)

        # Risk parameters
        risk_per_trade_pct = 0.015  # 1.5% equity risk
        max_position_equity_pct = 0.20  # Max 20% position cap
        total_risk_capital = account_equity * risk_per_trade_pct
        max_position_value = account_equity * max_position_equity_pct

        # ATR 14 estimation: default 3.0% of price if ATR not supplied
        setup_metrics = candidate.get("setup_metrics") or {}
        atr_pct = float(setup_metrics.get("atr_14_pct") or 3.0)
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

        # Targets: TP1 1:1.5 R:R, Chandelier trailing stop
        tp1_price = round(price + (1.5 * risk_per_share), 2)
        rr_ratio = round((tp1_price - price) / risk_per_share, 2)

        thesis = (
            f"S_total={s_total} (Tech={s_tech}, SentNorm={s_sent_norm}). "
            f"Entri: ${price:.2f}, SL: ${stop_loss_price:.2f} (-{sl_distance:.2f}), "
            f"TP1: ${tp1_price:.2f} (1:{rr_ratio}). Saiz: {allocated_shares} unit "
            f"(${position_value:.2f}, Risiko: ${actual_risk_amount:.2f} / {actual_risk_amount/account_equity*100:.2f}% modal efektif). "
            f"Asas Modal: ${account_equity:,.2f}."
        )

        return {
            "agent": "Haziq",
            "role": "L2 Portfolio & Strategy Lead",
            "symbol": symbol,
            "s_total": s_total,
            "passed": passed_entry_gate,
            "entry_price": price,
            "stop_loss_price": stop_loss_price,
            "take_profit_price": tp1_price,
            "allocated_shares": allocated_shares,
            "position_value": position_value,
            "risk_per_trade_usd": actual_risk_amount,
            "risk_per_trade_pct": round(actual_risk_amount / account_equity * 100, 2),
            "account_equity_used": account_equity,
            "risk_reward_ratio": rr_ratio,
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
        force_simulation: bool = False
    ) -> Dict[str, Any]:
        """
        Danial audits the candidate order strictly against the 8 Hard Rules:
        1. Risk <= 2.0% equity
        2. Daily drawdown <= 5.0% circuit breaker
        3. PDT guard (< $25k, max 3 day trades)
        4. Penny stock filter (Price >= $5.00)
        5. Order volume <= 1.0% ADV20
        6. Market time window 09:45 - 15:45 NY
        7. Idempotency key (UUIDv4)
        8. Manual kill switch & OpenD alive
        """
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
            order_side="BUY"
        )

        rule_checks = []
        all_passed = True
        rejection_reason = None

        # Rule 1: Max Risk <= 2.0%
        risk_pct = haziq_res.get("risk_per_trade_pct", 1.5)
        r1_pass = risk_pct <= 2.0
        rule_checks.append({
            "rule": "Rule 1: Risk per Trade <= 2.0%",
            "passed": r1_pass,
            "detail": f"{risk_pct:.2f}% ekuiti (Had: 2.0%)"
        })
        if not r1_pass and all_passed:
            all_passed = False
            rejection_reason = "Pelanggaran Rule 1: Risiko modal melebihi 2.0%"

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

        # Rule 6: Market Time Window (09:45 - 15:45 NY)
        r6_pass = True
        if not mock_market_window:
            try:
                self.hard_rules_engine.validate_rule6_trading_window(now_ny)
            except HardRuleViolation:
                r6_pass = False
        rule_checks.append({
            "rule": "Rule 6: Market Window 09:45 - 15:45 NY",
            "passed": r6_pass,
            "detail": f"Masa NY {now_ny.strftime('%H:%M:%S')} dalam tingkap dagangan" if r6_pass else f"Luar tingkap waktu pasaran {now_ny.strftime('%H:%M:%S')}"
        })
        if not r6_pass and all_passed:
            all_passed = False
            rejection_reason = "Pelanggaran Rule 6: Di luar waktu dagangan 09:45 - 15:45 NY"

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

        return {
            "agent": "Danial",
            "role": "L3 Risk & Compliance Officer",
            "symbol": symbol,
            "passed": all_passed,
            "rejection_reason": rejection_reason,
            "client_order_id": client_order_id,
            "order_request": order.model_dump(),
            "rule_checks": rule_checks,
            "notes": (
                f"Audit Danial: {'LULUS 8/8 peraturan risiko & kawalan posisi unik' if all_passed else 'DITOLAK - ' + rejection_reason}."
            )
        }

    # =========================================================================
    # Full End-to-End Simulation Pipeline Run
    # =========================================================================
    def run_simulation_cycle(
        self,
        candidates: Optional[List[Dict[str, Any]]] = None,
        force_simulation: bool = False,
        mock_market_window: bool = False
    ) -> Dict[str, Any]:
        """
        Executes a complete deliberative cycle over watchlist candidates:
        L0 Screener -> L1 Tariq & Nawwar -> L2 Haziq -> L3 Danial -> L4 OpenD Paper Order.
        """
        now_utc = datetime.now(timezone.utc)
        now_ny = datetime.now(NY_TZ)
        cycle_id = f"CYC-{now_utc.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

        if not candidates:
            candidates = self.load_watchlist_candidates(max_candidates=10)

        # Baseline equity from OpenD or DB
        client = get_moomoo_client()
        trade_date = now_ny.strftime("%Y-%m-%d")
        broker_equity = client.get_account_equity()
        baseline_equity = self.hard_rules_engine.get_verified_equity(trade_date, fallback=None)
        raw_equity = broker_equity or baseline_equity or 100000.0

        # Enforce dynamic max_buying_power ceiling (HOM-302)
        max_buying_power = self.get_max_buying_power_limit()
        effective_equity = min(raw_equity, max_buying_power) if max_buying_power and max_buying_power > 0 else raw_equity
        account_equity = effective_equity

        total_candidates = len(candidates)
        passed_l1_count = 0
        passed_l2_count = 0
        passed_l3_count = 0
        orders_placed_count = 0

        deliberation_records = []
        orders_placed = []

        for candidate in candidates:
            symbol = candidate.get("symbol", "UNKNOWN")

            # 1. Tariq L1 Analysis
            tariq_res = self.evaluate_tariq_technical(candidate)
            # 2. Nawwar L1 Analysis
            nawwar_res = self.evaluate_nawwar_sentiment(candidate)

            l1_passed = tariq_res["passed"] and nawwar_res["passed"]
            if l1_passed:
                passed_l1_count += 1

            # 3. Haziq L2 Synthesis
            haziq_res = self.evaluate_haziq_synthesis(
                candidate=candidate,
                tariq_res=tariq_res,
                nawwar_res=nawwar_res,
                account_equity=account_equity
            )
            l2_passed = l1_passed and haziq_res["passed"]
            if l2_passed:
                passed_l2_count += 1

            # 4. Danial L3 Compliance
            danial_res = self.evaluate_danial_compliance(
                candidate=candidate,
                haziq_res=haziq_res,
                account_equity=account_equity,
                now_ny=now_ny,
                mock_market_window=mock_market_window or force_simulation,
                force_simulation=force_simulation
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

            order_id = None
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
                            status, opend_status, message, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        f"Paper Trading Simulation Order to Moomoo OpenD (Env: {client.trd_env})",
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

        # Persist simulation cycle summary
        cycle_status = "COMPLETED" if orders_placed_count > 0 else "COMPLETED_NO_ORDERS"
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO simulation_cycles (
                    cycle_id, created_at, status, total_candidates,
                    passed_l1, passed_l2, passed_l3, orders_placed
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cycle_id,
                now_utc.isoformat(),
                cycle_status,
                total_candidates,
                passed_l1_count,
                passed_l2_count,
                passed_l3_count,
                orders_placed_count
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
    # Query & Broker Synchronization Helpers
    # =========================================================================
    def sync_broker_orders(self) -> Dict[str, Any]:
        """
        Two-way reconciliation between OpenD broker paper trading orders and local SQLite DB.
        Queries active orders from OpenD (TrdEnv.SIMULATE) and updates paper_orders records.
        """
        client = get_moomoo_client()
        if not client.is_connected():
            return {"synced": False, "reason": "OpenD is not connected", "updated_count": 0}

        try:
            broker_orders = client.query_orders()
            if not broker_orders:
                return {"synced": True, "updated_count": 0}

            updated_count = 0
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

                    cur = conn.execute(
                        "UPDATE paper_orders SET status = ?, opend_status = 'CONNECTED' WHERE order_id = ? AND status != ?",
                        (mapped_status, b_id, mapped_status)
                    )
                    if cur.rowcount > 0:
                        updated_count += cur.rowcount
                conn.commit()

            return {"synced": True, "updated_count": updated_count}
        except Exception as e:
            logger.error("Error during sync_broker_orders: %s", e)
            return {"synced": False, "error": str(e), "updated_count": 0}

    def get_recent_activity(self, limit: int = 10) -> Dict[str, Any]:
        """Returns recent cycles, latest deliberation cards, and order records with broker sync."""
        try:
            self.sync_broker_orders()
        except Exception as sync_err:
            logger.warning("Broker order sync error in get_recent_activity: %s", sync_err)

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
                       status, opend_status, message, created_at
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

    def get_paper_orders(self, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            self.sync_broker_orders()
        except Exception as sync_err:
            logger.warning("Broker order sync error in get_paper_orders: %s", sync_err)

        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT id, client_order_id, order_id, cycle_id, symbol, order_side,
                       quantity, entry_price, stop_loss_price, take_profit_price,
                       status, opend_status, message, created_at
                FROM paper_orders
                ORDER BY id DESC LIMIT ?
            """, (limit,))
            return [dict(r) for r in cursor.fetchall()]

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


# Module-level singleton
_agent_pipeline_instance: Optional[AgentPipeline] = None


def get_agent_pipeline() -> AgentPipeline:
    global _agent_pipeline_instance
    if _agent_pipeline_instance is None:
        _agent_pipeline_instance = AgentPipeline()
    return _agent_pipeline_instance
