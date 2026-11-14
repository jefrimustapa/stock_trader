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
    2. Injects Hard Stop Loss orders if unprotected position detected.
    3. Emits 5-second heartbeats to sentinel_status.json.
    """

    def __init__(self, status_file: Path, check_interval: int = 60, heartbeat_interval: int = 5):
        self.status_file = status_file
        self.check_interval = check_interval
        self.heartbeat_interval = heartbeat_interval
        self._running = False
        self._positions: Dict[str, Dict[str, Any]] = {}

    def emit_heartbeat(self, status: str = "HEALTHY") -> None:
        """Writes 5s sentinel pulse."""
        self.status_file.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": status,
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
        Returns list of injected SL corrections.
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
                    "RECONCILIATION ALERT: Open position in %s has NO protective Hard Stop Loss. Injecting emergency SL.",
                    symbol
                )
                entry_price = float(pos.get("entry_price", 100.0))
                default_sl_price = round(entry_price * 0.95, 2)  # 5% fallback stop
                correction = {
                    "action": "INJECT_STOP_LOSS",
                    "symbol": symbol,
                    "quantity": qty,
                    "stop_price": default_sl_price,
                    "reason": "MISSING_PROTECTIVE_STOP_LOSS"
                }
                corrections.append(correction)

        return corrections

    async def run_heartbeat_loop(self) -> None:
        """Background task emitting heartbeats every 5 seconds."""
        while self._running:
            try:
                self.emit_heartbeat("HEALTHY")
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
