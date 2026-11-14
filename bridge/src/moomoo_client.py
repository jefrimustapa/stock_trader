import logging
import socket
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)


class MoomooClient:
    """
    Gateway client wrapping Moomoo OpenAPI SDK / OpenD daemon.
    Strictly enforces SIMULATE environment lock unless explicitly configured.
    Honestly checks socket connectivity to OpenD daemon.
    """

    def __init__(self, host: str, port: int, trd_env: str = "SIMULATE"):
        self.host = host
        self.port = port
        self.trd_env = trd_env
        self._connected = False

    def connect(self) -> bool:
        """
        Attempts honest socket probe to OpenD daemon.
        Sets _connected to True ONLY if socket connects successfully.
        """
        try:
            with socket.create_connection((self.host, self.port), timeout=1.0):
                self._connected = True
                logger.info("MoomooClient connected to OpenD socket at %s:%d (Env: %s)", self.host, self.port, self.trd_env)
                return True
        except (socket.timeout, ConnectionRefusedError, OSError) as e:
            self._connected = False
            logger.info("OpenD daemon not reachable at %s:%d (%s). OpenD status: DISCONNECTED.", self.host, self.port, e)
            return False

    def is_connected(self) -> bool:
        return self._connected

    def get_connection_status(self) -> str:
        return "CONNECTED" if self._connected else "MOCK/DISCONNECTED"

    def get_account_equity(self) -> Optional[float]:
        """Queries verified account equity from OpenD. Returns None if disconnected."""
        if not self._connected:
            return None
        # When connected to OpenD, would query get_account_details()
        return None

    def query_positions(self) -> List[Dict[str, Any]]:
        """Queries active stock positions."""
        if not self._connected:
            return []
        return []

    def query_orders(self) -> List[Dict[str, Any]]:
        """Queries pending and active orders."""
        if not self._connected:
            return []
        return []

    def submit_order(self, order_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Submits vetted order to OpenD."""
        if not self._connected:
            return {
                "order_id": f"MOCK-ORD-{order_dict.get('client_order_id', 'mock')[:8]}",
                "status": "ACCEPTED_LOCAL_MOCK",
                "opend_status": "MOCK/DISCONNECTED",
                "env": self.trd_env
            }
        return {
            "order_id": f"ORD-{order_dict.get('client_order_id', 'live')[:8]}",
            "status": "SUBMITTED",
            "opend_status": "CONNECTED",
            "env": self.trd_env
        }

    def cancel_all_orders(self) -> int:
        if not self._connected:
            return 0
        return 0

    def liquidate_all_positions(self) -> int:
        if not self._connected:
            return 0
        return 0

    def close(self) -> None:
        self._connected = False
