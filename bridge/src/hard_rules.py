import logging
import sqlite3
import uuid
from datetime import datetime, date, time, timedelta, timezone
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

NY_TZ = ZoneInfo("America/New_York")


def get_rolling_business_day_start(current_date_str: str, business_days: int = 5) -> str:
    """
    Computes the start date of a rolling window of N business days (Mon-Fri)
    ending on current_date_str (inclusive).
    """
    cur = datetime.strptime(current_date_str, "%Y-%m-%d").date()
    count = 0
    while count < business_days:
        if cur.weekday() < 5:  # Monday through Friday
            count += 1
            if count == business_days:
                break
        cur -= timedelta(days=1)
    return cur.isoformat()


class OrderRequest(BaseModel):
    model_config = {"extra": "forbid"}
    client_order_id: str = Field(..., description="Unique client order ID (UUIDv4)")
    symbol: str = Field(..., description="Stock symbol (e.g., US.NVDA)")
    quantity: int = Field(..., gt=0, description="Order share quantity")
    entry_price: float = Field(..., gt=0, description="Entry limit price in USD")
    stop_loss_price: float = Field(..., gt=0, description="Hard stop loss price in USD")
    order_side: Literal["BUY", "SELL"] = Field(default="BUY", description="BUY or SELL")
    time_in_force: Literal["DAY", "GTC"] = Field(default="DAY", description="Order time in force: DAY or GTC")
    trading_mode: Literal["DAY", "SWING"] = Field(default="DAY", description="Trading mode: DAY or SWING")
    holding_days: int = Field(default=0, ge=0, description="Holding duration in business days (for SWING PDT exemption)")


class HardRuleViolation(Exception):
    def __init__(self, rule_code: str, message: str, status_code: int = 422):
        super().__init__(f"[{rule_code}] {message}")
        self.rule_code = rule_code
        self.message = message
        self.status_code = status_code


class HardRulesEngine:
    """
    Deterministic implementation of the 8 safety hard rules.
    100% Python-based verification before routing to broker gateway.
    """

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            # Baseline equity recorded at opening 09:30 NY
            conn.execute("""
                CREATE TABLE IF NOT EXISTS daily_baseline (
                    trade_date TEXT PRIMARY KEY,
                    opening_equity REAL NOT NULL,
                    current_equity REAL NOT NULL,
                    circuit_breaker_active INTEGER NOT NULL DEFAULT 0
                )
            """)
            # Processed client order IDs for idempotency (Rule 7)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS processed_orders (
                    client_order_id TEXT PRIMARY KEY,
                    symbol TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    price REAL NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            # Rolling day trade log for PDT guard (Rule 3)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS day_trade_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trade_date TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    quantity INTEGER NOT NULL
                )
            """)
            # Intraday order executions for round-trip tracking (HOM-129)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS intraday_executions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trade_date TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    order_side TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    client_order_id TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            conn.commit()

    def set_opening_baseline(self, trade_date: str, opening_equity: float) -> None:
        """Sets the daily opening baseline equity (Rule 2)."""
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO daily_baseline (trade_date, opening_equity, current_equity, circuit_breaker_active)
                VALUES (?, ?, ?, 0)
                ON CONFLICT(trade_date) DO UPDATE SET opening_equity = excluded.opening_equity
            """, (trade_date, opening_equity, opening_equity))
            conn.commit()

    def update_current_equity(self, trade_date: str, current_equity: float) -> None:
        """Updates current equity and evaluates the 5% drawdown circuit breaker (Rule 2)."""
        with self._get_connection() as conn:
            row = conn.execute("SELECT opening_equity FROM daily_baseline WHERE trade_date = ?", (trade_date,)).fetchone()
            if row:
                opening = row["opening_equity"]
                drawdown_pct = ((opening - current_equity) / opening) * 100.0 if opening > 0 else 0.0
                cb = 1 if drawdown_pct > 5.0 else 0
                conn.execute("""
                    UPDATE daily_baseline 
                    SET current_equity = ?, circuit_breaker_active = ?
                    WHERE trade_date = ?
                """, (current_equity, cb, trade_date))
                conn.commit()

    def get_circuit_breaker_status(self, trade_date: str) -> bool:
        with self._get_connection() as conn:
            row = conn.execute("SELECT circuit_breaker_active FROM daily_baseline WHERE trade_date = ?", (trade_date,)).fetchone()
            return bool(row["circuit_breaker_active"]) if row else False

    def get_verified_equity(self, trade_date: str, fallback: Optional[float] = None) -> Optional[float]:
        """Retrieves official equity from database without accepting spoofed client values. Fail-closed default."""
        with self._get_connection() as conn:
            row = conn.execute("SELECT current_equity, opening_equity FROM daily_baseline WHERE trade_date = ?", (trade_date,)).fetchone()
            if row:
                return float(row["current_equity"]) or float(row["opening_equity"])
        return fallback

    def validate_rule1_max_risk(self, order: OrderRequest, account_equity: float) -> None:
        """
        Rule 1: Risk Amount = Qty * (EntryPrice - StopLossPrice) <= Allowed Risk % Equity.
        DAY: <= 2.0% Equity.
        SWING: <= 1.0% Equity (mitigates overnight gap risk).
        Evaluates risk for long buy orders.
        """
        if order.order_side == "BUY":
            if order.stop_loss_price >= order.entry_price:
                raise HardRuleViolation("RULE_1", "Stop loss price must be below entry price for long buy orders.")

            risk_amount = order.quantity * (order.entry_price - order.stop_loss_price)
            max_risk_pct = 0.01 if order.trading_mode == "SWING" else 0.02
            max_allowed_risk = account_equity * max_risk_pct

            # Round to 4 decimal places to prevent floating point imprecision at exact boundary
            if round(risk_amount, 4) > round(max_allowed_risk, 4):
                risk_pct = (risk_amount / account_equity) * 100.0
                raise HardRuleViolation(
                    "RULE_1",
                    f"Trade risk (${risk_amount:.2f} / {risk_pct:.2f}%) exceeds maximum allowed {max_risk_pct*100:.1f}% equity (${max_allowed_risk:.2f})."
                )

    def validate_rule1_verified_equity(self, order: OrderRequest, trade_date: str, fallback_equity: Optional[float] = None) -> float:
        """Rule 1 using strictly verified baseline equity rather than client query parameters. Fail-closed."""
        verified_equity = self.get_verified_equity(trade_date, fallback=fallback_equity)
        if verified_equity is None or verified_equity <= 0:
            raise HardRuleViolation(
                "RULE_1",
                "Account equity cannot be verified from baseline or broker (Fail-Closed).",
                status_code=503
            )
        self.validate_rule1_max_risk(order, verified_equity)
        return verified_equity

    def validate_rule2_daily_drawdown(self, trade_date: str, current_equity: float) -> None:
        """
        Rule 2: Daily drawdown <= 5.0% of opening baseline equity.
        """
        with self._get_connection() as conn:
            row = conn.execute("SELECT opening_equity, circuit_breaker_active FROM daily_baseline WHERE trade_date = ?", (trade_date,)).fetchone()
            if not row:
                return  # If baseline not set, skip or assume 0 drawdown

            opening = row["opening_equity"]
            cb = row["circuit_breaker_active"]

            if cb:
                raise HardRuleViolation("RULE_2", "Daily Circuit Breaker is ACTIVE. All new buy orders are prohibited.")

            drawdown_pct = ((opening - current_equity) / opening) * 100.0
            if round(drawdown_pct, 4) > 5.0000:
                conn.execute("UPDATE daily_baseline SET circuit_breaker_active = 1 WHERE trade_date = ?", (trade_date,))
                conn.commit()
                raise HardRuleViolation(
                    "RULE_2",
                    f"Daily drawdown ({drawdown_pct:.2f}%) exceeded 5.00% limit. Circuit breaker triggered."
                )

    def validate_rule3_pdt(
        self,
        account_equity: float,
        current_date: str,
        order: Optional[OrderRequest] = None
    ) -> None:
        """
        Rule 3: For margin account with equity < $25,000, max 3 day trades in rolling 5 business days.
        4th day trade is strictly rejected.
        Applies if an order completes a round-trip day trade or if count >= 3 on non-opening orders.
        SWING EXEMPTION: Multi-day swing positions held overnight (holding_days >= 1) are exempt from PDT limit.
        """
        if account_equity >= 25_000.0:
            return  # Unlimited day trades above $25,000

        # Multi-day swing holding overnight does not constitute a day trade
        if order is not None and order.trading_mode == "SWING" and order.holding_days >= 1:
            return

        window_start = get_rolling_business_day_start(current_date, business_days=5)

        with self._get_connection() as conn:
            # Count day trades in rolling 5 business days window
            cursor = conn.execute("""
                SELECT COUNT(*) as cnt FROM day_trade_log
                WHERE trade_date >= ? AND trade_date <= ?
            """, (window_start, current_date))
            count = cursor.fetchone()["cnt"]

            if count >= 3:
                # If an order is provided, check if it actually completes a day trade round-trip
                if order is not None:
                    opposite_side = "SELL" if order.order_side == "BUY" else "BUY"
                    has_opposite = conn.execute("""
                        SELECT 1 FROM intraday_executions
                        WHERE trade_date = ? AND symbol = ? AND order_side = ?
                    """, (current_date, order.symbol, opposite_side)).fetchone()
                    if not has_opposite:
                        # Opening a new position without intraday closure is not a day trade
                        return

                raise HardRuleViolation(
                    "RULE_3",
                    f"PDT violation: Account equity (${account_equity:.2f}) < $25,000 and {count} day trades already recorded in rolling 5-business-day window [{window_start} to {current_date}]."
                )

    def record_day_trade(self, trade_date: str, symbol: str, quantity: int) -> None:
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO day_trade_log (trade_date, symbol, quantity) VALUES (?, ?, ?)",
                (trade_date, symbol, quantity)
            )
            conn.commit()

    def register_order_and_record_day_trade_if_roundtrip(
        self,
        trade_date: str,
        order: OrderRequest
    ) -> bool:
        """
        Records order execution and detects intraday position closures (round-trip).
        A day trade is ONLY recorded in day_trade_log if this execution completes
        a round-trip (e.g. SELL after BUY or BUY after SELL on the same market day).
        Standard opening BUY orders do NOT record day trades.
        """
        opposite_side = "SELL" if order.order_side == "BUY" else "BUY"
        now_iso = datetime.now(timezone.utc).isoformat()
        is_round_trip = False

        with self._get_connection() as conn:
            # Check if there is an existing opposite-side execution for this symbol today
            row = conn.execute("""
                SELECT 1 FROM intraday_executions
                WHERE trade_date = ? AND symbol = ? AND order_side = ?
            """, (trade_date, order.symbol, opposite_side)).fetchone()

            if row:
                is_round_trip = True
                conn.execute(
                    "INSERT INTO day_trade_log (trade_date, symbol, quantity) VALUES (?, ?, ?)",
                    (trade_date, order.symbol, order.quantity)
                )

            # Record this execution in intraday_executions
            conn.execute("""
                INSERT INTO intraday_executions (trade_date, symbol, order_side, quantity, client_order_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (trade_date, order.symbol, order.order_side, order.quantity, order.client_order_id, now_iso))
            conn.commit()

        return is_round_trip

    def validate_rule4_penny_stock(self, order: OrderRequest) -> None:
        """
        Rule 4: Limit entry price must be >= $5.00.
        """
        if round(order.entry_price, 4) < 5.0000:
            raise HardRuleViolation(
                "RULE_4",
                f"Penny stock excluded: Entry price (${order.entry_price:.2f}) is below minimum $5.00."
            )

    def validate_rule5_liquidity_guard(self, order: OrderRequest, adv_20: Optional[float] = None) -> None:
        """
        Rule 5: Order quantity <= 1.0% of ADV20. Requires explicit adv_20 parameter.
        """
        if adv_20 is None or adv_20 <= 0:
            raise HardRuleViolation("RULE_5", "ADV20 must be provided and > 0.")
        max_quantity = adv_20 * 0.01
        if order.quantity > max_quantity:
            raise HardRuleViolation(
                "RULE_5",
                f"Order size ({order.quantity:,} shares) exceeds 1.0% ADV20 limit ({int(max_quantity):,} shares)."
            )

    def validate_rule5_verified_liquidity(
        self,
        order: OrderRequest,
        market_data_cache: Optional[Dict[str, Any]] = None
    ) -> float:
        """
        Rule 5: Resolves verified ADV20 strictly from market data cache / watchlist.
        Rejects orders if market data cannot be verified. Zero unverified fallback.
        """
        if market_data_cache is None or order.symbol not in market_data_cache:
            raise HardRuleViolation(
                "RULE_5",
                f"Market data for {order.symbol} unavailable or unverified. ADV20 cannot be determined."
            )

        stock_data = market_data_cache.get(order.symbol)
        verified_adv20: Optional[float] = None
        if isinstance(stock_data, dict):
            verified_adv20 = stock_data.get("adv_20")
        elif hasattr(stock_data, "adv_20"):
            verified_adv20 = stock_data.adv_20

        if verified_adv20 is None or verified_adv20 <= 0:
            raise HardRuleViolation(
                "RULE_5",
                f"Market data for {order.symbol} contains invalid ADV20 ({verified_adv20}). Order rejected."
            )

        max_quantity = verified_adv20 * 0.01
        if order.quantity > max_quantity:
            raise HardRuleViolation(
                "RULE_5",
                f"Order size ({order.quantity:,} shares) exceeds 1.0% of verified ADV20 ({int(max_quantity):,} shares)."
            )
        return verified_adv20

    def validate_rule6_trading_window(
        self,
        check_time_ny: Optional[datetime] = None,
        trading_mode: str = "DAY",
        order: Optional[OrderRequest] = None
    ) -> None:
        """
        Rule 6: Trading Window Validation.
        - DAY Mode: New entries allowed strictly between 09:45:00 and 15:44:59.999 America/New_York (< 15:45:00).
        - SWING Mode: Allows regular market session entries [09:30:00 - 16:00:00) NY without mandatory 15:45:00 force exit.
        """
        mode = order.trading_mode if order else trading_mode
        now_ny = check_time_ny or datetime.now(NY_TZ)
        current_time = now_ny.time()

        if mode == "SWING":
            start_time = time(9, 30, 0)
            cutoff_time = time(16, 0, 0)
            if not (start_time <= current_time < cutoff_time):
                raise HardRuleViolation(
                    "RULE_6",
                    f"Outside trading window: Current time {current_time.strftime('%H:%M:%S')} NY is outside SWING market session [09:30:00 - 16:00:00)."
                )
        else:
            start_time = time(9, 45, 0)
            cutoff_time = time(15, 45, 0)

            if not (start_time <= current_time < cutoff_time):
                raise HardRuleViolation(
                    "RULE_6",
                    f"Outside trading window: Current time {current_time.strftime('%H:%M:%S')} NY is outside allowed [09:45:00 - 15:45:00)."
                )

    def validate_rule7_idempotency(self, client_order_id: str) -> None:
        """
        Rule 7: Unique client_order_id required. Duplicates return HTTP 409 Conflict.
        """
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT client_order_id FROM processed_orders WHERE client_order_id = ?",
                (client_order_id,)
            )
            if cursor.fetchone():
                raise HardRuleViolation(
                    "RULE_7",
                    f"Duplicate order ID: {client_order_id} has already been processed.",
                    status_code=409
                )

    def register_order_processed(self, order: OrderRequest) -> None:
        """Saves processed order ID to enforce idempotency."""
        now = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            conn.execute("""
                INSERT INTO processed_orders (client_order_id, symbol, quantity, price, status, created_at)
                VALUES (?, ?, ?, ?, 'ACCEPTED', ?)
            """, (order.client_order_id, order.symbol, order.quantity, order.entry_price, now))
            conn.commit()

    def execute_rule8_kill_switch(self, moomoo_client: Optional[Any] = None) -> Dict[str, Any]:
        """
        Rule 8: Manual kill switch cancels all open orders and liquidates positions in < 3.0 seconds.
        Honestly and accurately reports OpenD connection status.
        """
        start_ts = datetime.now()
        opend_connected = False
        if moomoo_client and hasattr(moomoo_client, "is_connected"):
            opend_connected = moomoo_client.is_connected()

        elapsed_seconds = (datetime.now() - start_ts).total_seconds()

        if not opend_connected:
            return {
                "status": "KILL_SWITCH_LOCAL_ONLY",
                "opend_status": "MOCK/DISCONNECTED",
                "warning": "OpenD daemon is not connected. Local orders halted; no remote broker orders cancelled.",
                "cancelled_orders": 0,
                "liquidated_positions": 0,
                "elapsed_seconds": round(elapsed_seconds, 4),
                "latency_compliant": elapsed_seconds < 3.0
            }

        # If connected to live OpenD:
        cancelled_count = 0
        liquidated_count = 0
        if hasattr(moomoo_client, "cancel_all_orders"):
            cancelled_count = moomoo_client.cancel_all_orders()
        if hasattr(moomoo_client, "liquidate_all_positions"):
            liquidated_count = moomoo_client.liquidate_all_positions()

        elapsed_seconds = (datetime.now() - start_ts).total_seconds()
        return {
            "status": "KILL_SWITCH_EXECUTED",
            "opend_status": "CONNECTED",
            "cancelled_orders": cancelled_count,
            "liquidated_positions": liquidated_count,
            "elapsed_seconds": round(elapsed_seconds, 4),
            "latency_compliant": elapsed_seconds < 3.0
        }

    def validate_all(
        self,
        order: OrderRequest,
        account_equity: float,
        trade_date: str,
        current_equity: float,
        check_time_ny: Optional[datetime] = None,
        market_data_cache: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Runs all 8 deterministic hard rule checks sequentially."""
        self.validate_rule7_idempotency(order.client_order_id)
        self.validate_rule4_penny_stock(order)
        self.validate_rule5_verified_liquidity(order, market_data_cache)
        self.validate_rule6_trading_window(check_time_ny, order=order)
        self.validate_rule1_max_risk(order, account_equity)
        self.validate_rule2_daily_drawdown(trade_date, current_equity)
        self.validate_rule3_pdt(account_equity, trade_date, order=order)

        return {"valid": True, "client_order_id": order.client_order_id}
