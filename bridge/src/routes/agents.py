"""
Agent Operations & Paper Trading Simulation API Routes (HOM-291)
Endpoints for monitoring Tariq, Nawwar, Haziq, Danial deliberative pipeline
and executing paper trading simulation cycles.
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..security import authenticate_request
from ..agent_pipeline import get_agent_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agents", tags=["Agent Coordination & Simulation"])


class SimulateRunRequest(BaseModel):
    candidates: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional list of candidate stocks to evaluate. If omitted, loads from watchlist.json."
    )
    force_simulation: bool = Field(
        default=True,
        description="Bypasses market time window restriction for automated testing and paper trading simulation."
    )
    mock_market_window: bool = Field(
        default=True,
        description="Simulates valid market hours (09:45 - 15:45 NY) during off-hours simulation testing."
    )


@router.get("/activity")
def get_agent_activity(
    limit: int = 10,
    caller: str = Depends(authenticate_request)
):
    """
    Returns latest simulation cycle, deliberation details for Tariq, Nawwar, Haziq, Danial,
    and history of paper trading orders executed.
    """
    try:
        pipeline = get_agent_pipeline()
        return pipeline.get_recent_activity(limit=limit)
    except Exception as e:
        logger.error("Error retrieving agent activity: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mendapatkan data aktiviti ejen: {str(e)}"
        )


@router.post("/simulate-run")
def trigger_simulate_run(
    payload: Optional[SimulateRunRequest] = None,
    caller: str = Depends(authenticate_request)
):
    """
    Triggers an end-to-end simulation cycle across the agent team:
    L0 Screener -> L1 Tariq & Nawwar -> L2 Haziq -> L3 Danial (8 Hard Rules) -> L4 OpenD Paper Order.
    """
    try:
        pipeline = get_agent_pipeline()
        req = payload or SimulateRunRequest()
        result = pipeline.run_simulation_cycle(
            candidates=req.candidates,
            force_simulation=req.force_simulation,
            mock_market_window=req.mock_market_window
        )
        return result
    except Exception as e:
        logger.error("Error executing agent simulation run: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ralat pelaksanaan simulasi saluran paip ejen: {str(e)}"
        )


@router.get("/orders")
def get_agent_paper_orders(
    limit: int = 50,
    caller: str = Depends(authenticate_request)
):
    """Returns list of paper trading orders created by agent pipeline."""
    try:
        pipeline = get_agent_pipeline()
        orders = pipeline.get_paper_orders(limit=limit)
        return {
            "status": "OK",
            "count": len(orders),
            "orders": orders
        }
    except Exception as e:
        logger.error("Error retrieving agent orders: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gagal mendapatkan senarai pesanan simulasi: {str(e)}"
        )


@router.post("/orders/{order_id}/cancel")
def cancel_agent_paper_order(
    order_id: str,
    caller: str = Depends(authenticate_request)
):
    """Cancels a pending or submitted paper trading order."""
    try:
        pipeline = get_agent_pipeline()
        res = pipeline.cancel_paper_order(order_id)
        if not res.get("success"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=res.get("message", "Gagal membatalkan pesanan.")
            )
        return res
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error cancelling order %s: %s", order_id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ralat membatalkan pesanan: {str(e)}"
        )

