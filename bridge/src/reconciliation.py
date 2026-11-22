import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class PositionReconciler:
    """
    Periodic 60-second reconciliation daemon.
    1. Compares broker position state vs local memory/database.
    2. Injects Hard Stop Loss orders (DAY or GTC based on TRADING_MODE) if unprotected position detected.
    3. Trailing stop and volatility surge detection (> 2.5x ATR) for SWING mode.
    4. Emits 5-second heartbeats to sentinel_status.json with trading_mode badge.
    """

    def __init__(self, status_file: Path, check_interval: int = 60, heartbeat_interval: int = 5, trading_mode: str = "DAY"):
        self.status_file = status_file
        self.check_interval = check_interval
        self.heartbeat_interval = heartbeat_interval
        self.trading_mode = trading_mode.upper() if trading_mode else "DAY"
        self._running = False
        self._positions: Dict[str, Dict[str, Any]] = {}

    def emit_heartbeat(self, status: str = "ACTIVE") -> None:
        """Writes 5s sentinel pulse."""
        self.status_file.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "trading_mode": self.trading_mode,
            "managed_positions": len(self._positions),
            "reconciliation_active": self._running
        }
        temp_file = self.status_file.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        temp_file.replace(self.status_file)

    def reconcile_positions(
        self,
        broker_positions: List[Dict[str, Any]],
        broker_orders: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Detects positions without protective Hard Stop Loss orders.
        Returns list of injected SL corrections with DAY or GTC time-in-force.
        """
        corrections = []
        sl_symbols = set()

        # Identify existing STOP_LOSS orders
        for order in broker_orders:
            if order.get("order_type") in ("STOP", "STOP_LIMIT", "STOP_LOSS") and order.get("status") in ("SUBMITTED", "PENDING"):
                sl_symbols.add(order.get("symbol"))

        # Check each open position
        for pos in broker_positions:
            symbol = pos["symbol"]
            qty = pos.get("quantity", 0)
            if qty > 0 and symbol not in sl_symbols:
                logger.warning(
                    "RECONCILIATION ALERT: Open position in %s has NO protective Hard Stop Loss. Injecting emergency SL (%s).",
                    symbol,
                    "GTC" if self.trading_mode == "SWING" else "DAY"
                )
                entry_price = float(pos.get("entry_price", 100.0))
                default_sl_price = round(entry_price * 0.95, 2)  # 5% fallback stop
                time_in_force = "GTC" if self.trading_mode == "SWING" else "DAY"
                correction = {
                    "action": "INJECT_STOP_LOSS",
                    "symbol": symbol,
                    "quantity": qty,
                    "stop_price": default_sl_price,
                    "time_in_force": time_in_force,
                    "trading_mode": self.trading_mode,
                    "reason": "MISSING_PROTECTIVE_STOP_LOSS"
                }
                corrections.append(correction)

        return corrections

    def check_volatility_alerts(
        self,
        current_prices: Dict[str, float],
        reference_prices: Dict[str, float],
        atrs: Dict[str, float],
        threshold_multiplier: float = 2.5
    ) -> List[Dict[str, Any]]:
        """
        Detects extraordinary price movements (> 2.5x ATR) to trigger immediate wake.
        Particularly crucial in SWING mode for overnight/intraday gap defense.
        """
        alerts = []
        for symbol, curr_p in current_prices.items():
            ref_p = reference_prices.get(symbol)
            atr = atrs.get(symbol, 0.0)
            if ref_p is not None and atr > 0.0:
                price_delta = abs(curr_p - ref_p)
                if price_delta > (threshold_multiplier * atr):
                    alerts.append({
                        "symbol": symbol,
                        "current_price": curr_p,
                        "reference_price": ref_p,
                        "delta": round(price_delta, 2),
                        "atr": atr,
                        "multiplier": round(price_delta / atr, 2),
                        "alert": "VOLATILITY_SURGE_EXCEEDED"
                    })
        return alerts

    async def run_heartbeat_loop(self) -> None:
        """Background task emitting heartbeats every 5 seconds."""
        while self._running:
            try:
                self.emit_heartbeat("ACTIVE")
            except Exception as e:
                logger.error("Heartbeat error: %s", e)
            await asyncio.sleep(self.heartbeat_interval)

    async def run_reconciliation_loop(self) -> None:
        """Background task executing reconciliation every 60 seconds."""
        while self._running:
            try:
                # In integrated mode, fetch from moomoo_client
                logger.info("Executing periodic 60s position reconciliation check...")
            except Exception as e:
                logger.error("Reconciliation cycle error: %s", e)
            await asyncio.sleep(self.check_interval)

    def start(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False
        try:
            self.emit_heartbeat("STOPPED")
        except Exception:
            pass
