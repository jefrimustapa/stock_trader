"""
Paperclip Agent Dispatcher Module (HOM-317 / HOM-392)
Orchestrates wake chain across Paperclip-registered AI agents:
- L1 Tariq (Technical) & L1 Nawwar (Sentiment) triggered in parallel on-demand.
- Dispatcher aggregates L1 scores (S_tech & S_sent) and wakes L2 Haziq (Trader) once per batch.
- L2 Haziq finalizes position sizing & Stop Loss/Take Profit, then wakes L3 Danial (Risk Gatekeeper).
- L3 Danial executes audit of 10 Hard Rules and relays order to Moomoo OpenD Paper Trading.

Pure On-Demand:
- No artificial cooldown timer.
- In-flight concurrency lock to safely reject overlapping duplicate triggers.
"""

import json
import logging
import os
import threading
import urllib.request
import urllib.error
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)

# Registered Paperclip agent IDs (HOM-317)
TARIQ_AGENT_ID = "9c686b86-0a97-46ae-9705-edb8840a5440"   # L1 Technical (gemini-4-hydrogen-medium)
NAWWAR_AGENT_ID = "82e5a99e-368c-4f5f-b18d-b5ecaafbc40f"  # L1 Sentiment (gemini-3.8-flash-medium)
HAZIQ_AGENT_ID = "612c7171-d5f1-405b-9be3-aca66e24b7db"   # L2 Trader / Portfolio Lead (gemini-4-hydrogen-medium)
DANIAL_AGENT_ID = "bcbd0bd4-b10b-4000-b0a7-c21fc6147336"  # L3 Risk Gatekeeper (gemini-3.8-flash-medium)


class PaperclipDispatcher:
    """
    Manages on-demand heartbeat/wake triggers and deliberative pipeline handoffs
    between Paperclip agents Tariq, Nawwar, Haziq, and Danial.
    Pure on-demand execution: triggers immediately without cooldown timer.
    Enforces in-flight concurrency lock to safely reject overlapping duplicate triggers.
    """

    def __init__(self, api_url: Optional[str] = None, api_key: Optional[str] = None):
        if api_url is None:
            try:
                from .config import BridgeConfig
                api_url = getattr(BridgeConfig, "PAPERCLIP_API_URL", None)
            except Exception:
                api_url = None
        if api_key is None:
            try:
                from .config import BridgeConfig
                api_key = getattr(BridgeConfig, "PAPERCLIP_API_KEY", None)
            except Exception:
                api_key = None

        self.api_url = (api_url if api_url is not None and api_url != "" else os.environ.get("PAPERCLIP_API_URL", "https://crew.julietmike.net")).rstrip("/")
        self.api_key = os.environ.get("PAPERCLIP_API_KEY", "") if api_key is None else api_key
        self.run_id = os.environ.get("PAPERCLIP_RUN_ID", "")
        self._in_flight_agents: Set[str] = set()
        self._lock = threading.Lock()
        self._is_running: bool = False

    def is_in_flight(self, agent_id: str) -> bool:
        """Checks if the given agent is currently executing an in-flight heartbeat."""
        with self._lock:
            return agent_id in self._in_flight_agents

    def set_in_flight(self, agent_id: str, in_flight: bool = True) -> None:
        """Manually sets or clears the in-flight status for an agent."""
        with self._lock:
            if in_flight:
                self._in_flight_agents.add(agent_id)
            else:
                self._in_flight_agents.discard(agent_id)

    def reset_in_flight(self) -> None:
        """Clears all in-flight locks."""
        with self._lock:
            self._in_flight_agents.clear()
            self._is_running = False

    def acquire_lock(self, agent_id: str) -> bool:
        """Attempts to acquire the in-flight lock for an agent. Returns True if acquired, False if already in-flight."""
        with self._lock:
            if agent_id in self._in_flight_agents:
                return False
            self._in_flight_agents.add(agent_id)
            return True

    def release_lock(self, agent_id: str) -> None:
        """Releases the in-flight lock for an agent."""
        with self._lock:
            self._in_flight_agents.discard(agent_id)

    @contextmanager
    def in_flight_lock(self, agent_id: str):
        """Context manager to scope an in-flight execution lock for an agent."""
        acquired = self.acquire_lock(agent_id)
        if not acquired:
            raise RuntimeError(f"Agent {agent_id} is already in-flight")
        try:
            yield
        finally:
            self.release_lock(agent_id)

    def invoke_agent_heartbeat(
        self,
        agent_id: str,
        reason: str = "cycle_event",
        check_in_flight: bool = True
    ) -> Dict[str, Any]:
        """
        Calls POST /api/agents/:agentId/heartbeat/invoke to wake up the specified agent.
        Pure on-demand execution: executes immediately without cooldown timer.
        Enforces in-flight concurrency lock to safely reject overlapping duplicate triggers.
        """
        if check_in_flight:
            with self._lock:
                if agent_id in self._in_flight_agents:
                    logger.info("[Dispatcher] Agent %s is already in-flight; skipping duplicate trigger.", agent_id)
                    return {
                        "status": "IN_PROGRESS_SKIPPED",
                        "agent_id": agent_id,
                        "reason": "Agent execution already in progress"
                    }
                self._in_flight_agents.add(agent_id)
            need_release = True
        else:
            need_release = False

        try:
            if not self.api_key:
                logger.warning("PAPERCLIP_API_KEY not configured; skipping remote agent wake for %s", agent_id)
                return {"status": "SKIPPED", "agent_id": agent_id, "reason": "No API key"}

            url = f"{self.api_url}/api/agents/{agent_id}/heartbeat/invoke"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            if self.run_id:
                headers["X-Paperclip-Run-Id"] = self.run_id

            payload = json.dumps({"reason": reason}).encode("utf-8")
            req = urllib.request.Request(url, data=payload, headers=headers, method="POST")

            try:
                with urllib.request.urlopen(req, timeout=10.0) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8")) if resp.length else {}
                    logger.info("Successfully invoked agent heartbeat for %s: %s", agent_id, resp.status)
                    return {"status": "SUCCESS", "agent_id": agent_id, "response": resp_data}
            except urllib.error.HTTPError as e:
                logger.error("HTTP error invoking heartbeat for agent %s: %s %s", agent_id, e.code, e.read().decode("utf-8"))
                return {"status": "ERROR", "agent_id": agent_id, "code": e.code}
            except Exception as e:
                logger.error("Failed to invoke agent heartbeat for %s: %s", agent_id, e)
                return {"status": "ERROR", "agent_id": agent_id, "error": str(e)}
        finally:
            if need_release:
                with self._lock:
                    self._in_flight_agents.discard(agent_id)

    def dispatch_l1_agents(self, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Wakes L1 Tariq and L1 Nawwar in parallel to evaluate screener candidates on-demand.
        """
        logger.info("[Dispatcher] Dispatching on-demand L1 analysis for %d candidates to Tariq & Nawwar...", len(candidates))
        res_tariq = self.invoke_agent_heartbeat(TARIQ_AGENT_ID, reason="l1_technical_analysis")
        res_nawwar = self.invoke_agent_heartbeat(NAWWAR_AGENT_ID, reason="l1_sentiment_analysis")
        return {
            "l1_tariq": res_tariq,
            "l1_nawwar": res_nawwar
        }

    def aggregate_and_wake_haziq(self, l1_evaluations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Called when L1 technical (Tariq) and sentiment (Nawwar) analyses are complete.
        Aggregates candidate evaluations into a single batch and wakes L2 Haziq (Portfolio Lead / Trader).
        """
        logger.info("[Dispatcher] Aggregating %d L1 candidate evaluations and waking L2 Haziq in batch...", len(l1_evaluations))
        res_haziq = self.invoke_agent_heartbeat(HAZIQ_AGENT_ID, reason="l2_portfolio_synthesis")
        return {
            "l2_haziq": res_haziq,
            "candidates_count": len(l1_evaluations)
        }

    def haziq_wake_danial(self, order_proposal: Dict[str, Any]) -> Dict[str, Any]:
        """
        Called by Haziq once trade decision (candidate selection, position sizing, SL/TP)
        is finalized. Hands off order proposal to L3 Danial for risk compliance audit.
        """
        symbol = order_proposal.get("symbol", "UNKNOWN")
        logger.info("[Haziq -> Danial] Handoff order proposal for %s to Danial for 10 Hard Rules audit...", symbol)
        res_danial = self.invoke_agent_heartbeat(DANIAL_AGENT_ID, reason="l3_risk_compliance_audit")
        return {
            "l3_danial": res_danial,
            "symbol": symbol
        }


_dispatcher_instance: Optional[PaperclipDispatcher] = None

def get_dispatcher() -> PaperclipDispatcher:
    global _dispatcher_instance
    if _dispatcher_instance is None:
        _dispatcher_instance = PaperclipDispatcher()
    return _dispatcher_instance
