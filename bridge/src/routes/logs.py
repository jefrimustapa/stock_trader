"""
Container Logs Management API Route (HOM-408 / Issue #36)
Queries Docker Engine API over Unix socket (/var/run/docker.sock) to fetch runtime logs
for system containers with secret sanitization, log level filtering, and keyword search.
"""

import http.client
import json
import logging
import os
import re
import socket
import struct
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..config import BridgeConfig
from ..opend_manager import UnixSocketHTTPConnection
from ..security import authenticate_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/system", tags=["System & Container Logs"])

# Whitelisted stock trader service mapping
CONTAINER_MAP: Dict[str, str] = {
    "bridge": "stock_mcp_bridge",
    "stock_mcp_bridge": "stock_mcp_bridge",
    "daemon": "stock_screener_daemon",
    "screener": "stock_screener_daemon",
    "stock_screener_daemon": "stock_screener_daemon",
    "dashboard": "stock_trading_dashboard",
    "stock_trading_dashboard": "stock_trading_dashboard",
    "dashboard_beta": "stock_trading_dashboard_beta",
    "stock_trading_dashboard_beta": "stock_trading_dashboard_beta",
    "opend": "stock_moomoo_opend",
    "moomoo_opend": "stock_moomoo_opend",
    "stock_moomoo_opend": "stock_moomoo_opend",
}

AVAILABLE_SERVICES = [
    {
        "id": "bridge",
        "container_name": "stock_mcp_bridge",
        "label": "Bridge",
        "description": "L1-L4 Agent Pipeline & Sentinel",
    },
    {
        "id": "daemon",
        "container_name": "stock_screener_daemon",
        "label": "Screener Daemon",
        "description": "L0 Cloud Screener Daemon",
    },
    {
        "id": "dashboard",
        "container_name": "stock_trading_dashboard",
        "label": "Trading Dashboard",
        "description": "Web & API Proxy",
    },
    {
        "id": "opend",
        "container_name": "stock_moomoo_opend",
        "label": "Moomoo OpenD",
        "description": "Broker Gateway",
    },
]


def sanitize_log_text(text: str) -> str:
    """
    Sanitizes sensitive tokens, passwords, and keys from raw log text.
    Replaces credentials with [REDACTED] markers.
    """
    if not text:
        return ""

    # 1. Direct environment secrets replacement
    env_secrets = [
        BridgeConfig.BRIDGE_SERVICE_TOKEN,
        BridgeConfig.PAPERCLIP_BRIDGE_SECRET,
        BridgeConfig.PAPERCLIP_API_KEY,
        os.getenv("PERSONAL_GITHUB_PAT", ""),
        os.getenv("FORWARD_AUTH_SECRET", ""),
        os.getenv("MOOMOO_LOGIN_PWD_MD5", ""),
        os.getenv("MOOMOO_LOGIN_ACCOUNT", ""),
    ]
    for s in env_secrets:
        if s and len(s) >= 4:
            text = text.replace(s, "[REDACTED_SECRET]")

    # 2. Bearer tokens
    text = re.sub(r"(?i)(Bearer\s+)[A-Za-z0-9_\-\.]{8,}", r"\1[REDACTED_TOKEN]", text)

    # 3. JWT string patterns (eyJ...)
    text = re.sub(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]*", "[REDACTED_JWT]", text)

    # 4. JSON password / secret fields
    text = re.sub(
        r'(?i)("?(?:password|pwd|secret|api_key|token|pat|auth_token)"?\s*[:=]\s*["\'])(?:(?!\1).)+?(["\'])',
        r"\1[REDACTED]\2",
        text,
    )

    # 5. Key-value credentials (e.g. password=XYZ)
    text = re.sub(r"(?i)(password|pwd|token|secret|pat)=[^&\s]+", r"\1=[REDACTED]", text)

    # Strip ANSI escape codes
    ansi_escape = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
    text = ansi_escape.sub("", text)

    return text


def detect_log_level(line: str) -> str:
    """Detects standard log level from line text."""
    upper = line.upper()
    if any(k in upper for k in ["[ERROR]", "ERROR:", "LEVEL=ERROR", "CRITICAL", "EXCEPTION", "FATAL"]):
        return "ERROR"
    if any(k in upper for k in ["[WARN]", "[WARNING]", "WARN:", "WARNING:", "LEVEL=WARN"]):
        return "WARN"
    if any(k in upper for k in ["[DEBUG]", "DEBUG:", "LEVEL=DEBUG", "TRACE"]):
        return "DEBUG"
    if any(k in upper for k in ["[INFO]", "INFO:", "LEVEL=INFO"]):
        return "INFO"
    return "INFO"


def demux_docker_stream(raw_data: bytes) -> List[Dict[str, Any]]:
    """
    Demultiplexes Docker Engine API multiplexed stdout/stderr stream.
    Each frame has an 8-byte header:
    - Byte 0: stream type (0 = stdin, 1 = stdout, 2 = stderr)
    - Bytes 1-3: zeros
    - Bytes 4-7: 32-bit big-endian payload length
    """
    records: List[Dict[str, Any]] = []
    idx = 0
    total = len(raw_data)

    while idx < total:
        if idx + 8 <= total and raw_data[idx] in (0, 1, 2) and raw_data[idx + 1 : idx + 4] == b"\x00\x00\x00":
            stream_code = raw_data[idx]
            stream_name = "stderr" if stream_code == 2 else "stdout"
            frame_len = struct.unpack(">I", raw_data[idx + 4 : idx + 8])[0]
            idx += 8
            payload = raw_data[idx : idx + frame_len].decode("utf-8", errors="replace")
            idx += frame_len

            # Split payload lines if multiline frame
            for line in payload.splitlines():
                if line.strip():
                    records.append({"stream": stream_name, "raw": line})
        else:
            # Fallback for non-multiplexed raw stream (e.g. TTY enabled containers)
            remaining = raw_data[idx:].decode("utf-8", errors="replace")
            for line in remaining.splitlines():
                if line.strip():
                    records.append({"stream": "stdout", "raw": line})
            break

    return records


def parse_rfc3339_timestamp(line: str) -> tuple[Optional[str], str]:
    """Extracts leading RFC3339 timestamp prepended by Docker when timestamps=true."""
    # Pattern: 2026-11-27T00:22:19.964681288Z <rest of line>
    match = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)$", line)
    if match:
        return match.group(1), match.group(2)
    return None, line


@router.get("/logs")
def get_container_logs(
    container: str = Query("bridge", description="Container identifier or alias (bridge, daemon, dashboard, opend)"),
    tail: int = Query(100, ge=1, le=1000, description="Number of tail lines to retrieve (1-1000)"),
    level: str = Query("ALL", description="Log level filter: ALL, INFO, WARN, ERROR, DEBUG"),
    search: Optional[str] = Query(None, description="Case-insensitive keyword substring filter"),
    caller: str = Depends(authenticate_request),
):
    """
    Fetches real-time sanitized logs for the requested container from Docker socket.
    """
    norm_container = container.strip().lower()
    target_container_name = CONTAINER_MAP.get(norm_container)

    # Security check: Whitelist check
    if not target_container_name:
        # Check if direct container name matches allowed pattern
        if norm_container in CONTAINER_MAP.values() or norm_container.startswith("hom-408-"):
            target_container_name = norm_container
        else:
            allowed = list(set(CONTAINER_MAP.keys()))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid container '{container}'. Allowed: {', '.join(sorted(allowed))}",
            )

    docker_socket = BridgeConfig.DOCKER_SOCKET_PATH
    if not os.path.exists(docker_socket):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Docker socket '{docker_socket}' is not accessible on host.",
        )

    endpoint = f"/containers/{target_container_name}/logs?stdout=true&stderr=true&tail={tail}&timestamps=true"

    try:
        conn = UnixSocketHTTPConnection(docker_socket)
        conn.request("GET", endpoint)
        res = conn.getresponse()

        if res.status == 404:
            # If dashboard was requested but not found, try dashboard_beta as fallback
            if target_container_name == "stock_trading_dashboard":
                conn.close()
                conn = UnixSocketHTTPConnection(docker_socket)
                target_container_name = "stock_trading_dashboard_beta"
                endpoint = f"/containers/{target_container_name}/logs?stdout=true&stderr=true&tail={tail}&timestamps=true"
                conn.request("GET", endpoint)
                res = conn.getresponse()

        if res.status != 200:
            err_body = res.read().decode("utf-8", errors="replace")
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Docker Engine returned status {res.status} for container '{target_container_name}': {err_body}",
            )

        raw_data = res.read()
        conn.close()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to read logs from Docker API: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to communicate with Docker Engine API: {str(e)}",
        )

    # Demux frames
    stream_records = demux_docker_stream(raw_data)

    parsed_lines = []
    norm_level = level.strip().upper()
    search_keyword = search.strip().lower() if search and search.strip() else None

    for item in stream_records:
        raw_line = item["raw"]
        ts, msg = parse_rfc3339_timestamp(raw_line)
        sanitized_msg = sanitize_log_text(msg)
        detected_level = detect_log_level(sanitized_msg)

        # Log level filter
        if norm_level != "ALL":
            if norm_level == "WARN" and detected_level not in ("WARN", "WARNING"):
                continue
            elif norm_level != "WARN" and detected_level != norm_level:
                continue

        # Keyword search filter
        if search_keyword and search_keyword not in sanitized_msg.lower():
            continue

        parsed_lines.append({
            "timestamp": ts,
            "level": detected_level,
            "stream": item["stream"],
            "message": sanitized_msg,
        })

    return {
        "container": target_container_name,
        "service_id": norm_container,
        "total_lines": len(stream_records),
        "returned_lines": len(parsed_lines),
        "level_filter": norm_level,
        "search_filter": search,
        "logs": parsed_lines,
        "available_services": AVAILABLE_SERVICES,
    }


@router.get("/containers")
def list_available_containers(caller: str = Depends(authenticate_request)):
    """
    Returns available containers and their active runtime status via Docker socket.
    """
    docker_socket = BridgeConfig.DOCKER_SOCKET_PATH
    services_with_status = []

    for svc in AVAILABLE_SERVICES:
        c_name = svc["container_name"]
        container_status = "UNKNOWN"
        try:
            if os.path.exists(docker_socket):
                conn = UnixSocketHTTPConnection(docker_socket)
                conn.request("GET", f"/containers/{c_name}/json")
                res = conn.getresponse()
                if res.status == 200:
                    data = json.loads(res.read().decode("utf-8", errors="replace"))
                    container_status = data.get("State", {}).get("Status", "UNKNOWN").upper()
                elif res.status == 404 and svc["id"] == "dashboard":
                    # Check beta container
                    conn.close()
                    conn = UnixSocketHTTPConnection(docker_socket)
                    conn.request("GET", "/containers/stock_trading_dashboard_beta/json")
                    res2 = conn.getresponse()
                    if res2.status == 200:
                        data = json.loads(res2.read().decode("utf-8", errors="replace"))
                        container_status = data.get("State", {}).get("Status", "UNKNOWN").upper()
                        c_name = "stock_trading_dashboard_beta"
                    else:
                        container_status = "NOT_FOUND"
                else:
                    container_status = "NOT_FOUND"
                conn.close()
        except Exception as e:
            logger.warning("Failed to query status for %s: %s", c_name, e)
            container_status = "ERROR"

        services_with_status.append({
            **svc,
            "container_name": c_name,
            "status": container_status,
        })

    return {"services": services_with_status}
