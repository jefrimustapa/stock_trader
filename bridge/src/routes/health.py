import json
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends

from ..config import BridgeConfig
from ..security import authenticate_request
from ..moomoo_client import get_moomoo_client

router = APIRouter(tags=["Health & Monitoring"])


@router.get("/health")
def get_health():
    """Unauthenticated health probe endpoint for Docker / orchestration."""
    return {
        "status": "healthy",
        "service": "mcp-bridge",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/status")
def get_status(caller: str = Depends(authenticate_request)):
    """
    Status probe reporting circuit breaker, sentinel states, and live OpenD connection & account info.
    """
    moomoo_client = get_moomoo_client()
    # Probe OpenD connection and account info
    moomoo_client.connect()
    account_info = moomoo_client.get_account_info()

    sentinel_info = {}
    if BridgeConfig.SENTINEL_STATUS_PATH.exists():
        try:
            with open(BridgeConfig.SENTINEL_STATUS_PATH, "r", encoding="utf-8") as f:
                sentinel_info = json.load(f)
        except Exception:
            sentinel_info = {"error": "Failed reading sentinel status file"}

    return {
        "service": "mcp-bridge",
        "caller": caller,
        "environment": account_info["env"],
        "opend_target": f"{BridgeConfig.OPEND_HOST}:{BridgeConfig.OPEND_PORT}",
        "opend_status": account_info["status"],
        "account_id": account_info["account_id"],
        "cash_balance": account_info["cash_balance"],
        "total_equity": account_info["total_equity"],
        "account_info": account_info,
        "sentinel": sentinel_info,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/metrics")
def get_metrics(caller: str = Depends(authenticate_request)):
    """Reports metrics for downstream agent observability."""
    return {
        "uptime_ok": True,
        "quota_tracker_attached": True,
        "caller": caller
    }


@router.get("/api/v1/screener/moomoo-quota")
def get_moomoo_quota(caller: str = Depends(authenticate_request)):
    """
    Returns real 30-day K-line quota from Moomoo OpenAPI (OpenQuoteContext).
    Strict fail-closed semantics:
    - If OpenD is disconnected or unauthenticated, returns status UNAVAILABLE and null quotas.
    """
    moomoo_client = get_moomoo_client()
    quota_res = moomoo_client.get_kline_quota()
    quota_res["caller"] = caller
    quota_res["timestamp"] = datetime.now(timezone.utc).isoformat()
    return quota_res

