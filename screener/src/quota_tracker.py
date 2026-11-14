import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Tuple, Dict, Any


class QuotaExceededError(Exception):
    """Raised when the 100 symbols per 30-day rolling window quota is exhausted."""
    pass


class QuotaTracker:
    """
    Manages and enforces Moomoo OpenAPI quota boundaries.
    Hard rule: Maximum 100 unique symbols for historical K-line in a 30-day rolling window.
    Realtime subscription cap: 15 concurrent symbols (30 slots out of 100 max).
    """

    def __init__(self, db_path: Path, max_30d_symbols: int = 100, max_realtime_symbols: int = 15):
        self.db_path = db_path
        self.max_30d_symbols = max_30d_symbols
        self.max_realtime_symbols = max_realtime_symbols
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS kline_quota_history (
                    symbol TEXT PRIMARY KEY,
                    first_requested_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    request_count INTEGER NOT NULL DEFAULT 1
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS realtime_subscriptions (
                    symbol TEXT PRIMARY KEY,
                    subscribed_at TEXT NOT NULL,
                    slots_used INTEGER NOT NULL DEFAULT 2
                )
            """)
            conn.commit()

    def clean_expired(self, current_time: Optional[datetime] = None) -> int:
        """Removes symbols whose 30-day window has expired."""
        now = current_time or datetime.now(timezone.utc)
        now_str = now.isoformat()
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM kline_quota_history WHERE expires_at <= ?",
                (now_str,)
            )
            deleted = cursor.rowcount
            conn.commit()
            return deleted

    def get_active_symbol_count(self, current_time: Optional[datetime] = None) -> int:
        """Returns the number of unique active symbols in the rolling 30-day window."""
        self.clean_expired(current_time)
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) as cnt FROM kline_quota_history")
            row = cursor.fetchone()
            return row["cnt"] if row else 0

    def can_request_symbol(self, symbol: str, current_time: Optional[datetime] = None) -> bool:
        """Checks if a symbol can be requested without exceeding the 100-symbol quota."""
        self.clean_expired(current_time)
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT 1 FROM kline_quota_history WHERE symbol = ?",
                (symbol,)
            )
            if cursor.fetchone():
                return True
            # New symbol: check if current count < max allowed
            count_cursor = conn.execute("SELECT COUNT(*) as cnt FROM kline_quota_history")
            count = count_cursor.fetchone()["cnt"]
            return count < self.max_30d_symbols

    def record_symbol_request(self, symbol: str, current_time: Optional[datetime] = None) -> bool:
        """
        Records a historical K-line request for a symbol.
        Returns True if successful, or raises QuotaExceededError if quota is full.
        """
        now = current_time or datetime.now(timezone.utc)
        self.clean_expired(now)

        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT symbol, request_count FROM kline_quota_history WHERE symbol = ?",
                (symbol,)
            )
            row = cursor.fetchone()
            if row:
                conn.execute(
                    "UPDATE kline_quota_history SET request_count = request_count + 1 WHERE symbol = ?",
                    (symbol,)
                )
                conn.commit()
                return True

            # Check capacity before inserting new symbol
            count_cursor = conn.execute("SELECT COUNT(*) as cnt FROM kline_quota_history")
            count = count_cursor.fetchone()["cnt"]
            if count >= self.max_30d_symbols:
                raise QuotaExceededError(
                    f"Moomoo OpenAPI historical K-line quota exhausted: {count}/{self.max_30d_symbols} symbols used."
                )

            expires_at = now + timedelta(days=30)
            conn.execute(
                "INSERT INTO kline_quota_history (symbol, first_requested_at, expires_at, request_count) VALUES (?, ?, ?, 1)",
                (symbol, now.isoformat(), expires_at.isoformat())
            )
            conn.commit()
            return True

    def get_realtime_subscribed_count(self) -> int:
        """Returns the number of symbols currently subscribed to real-time streams."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) as cnt FROM realtime_subscriptions")
            row = cursor.fetchone()
            return row["cnt"] if row else 0

    def get_quota_summary(self, current_time: Optional[datetime] = None) -> Dict[str, int]:
        """Provides a dictionary summary of quota usage."""
        used_kline = self.get_active_symbol_count(current_time)
        rem_kline = max(0, self.max_30d_symbols - used_kline)
        used_rt_symbols = self.get_realtime_subscribed_count()
        used_rt_slots = used_rt_symbols * 2  # Quote + 15M bar = 2 slots
        rem_rt_slots = max(0, 100 - used_rt_slots)

        return {
            "kline_30d_used": used_kline,
            "kline_30d_remaining": rem_kline,
            "realtime_subscribed": used_rt_slots,
            "realtime_remaining": rem_rt_slots
        }
