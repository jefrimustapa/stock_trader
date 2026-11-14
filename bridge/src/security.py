import logging
from typing import Optional
from fastapi import Request, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .config import BridgeConfig

logger = logging.getLogger(__name__)

security_bearer = HTTPBearer(auto_error=False)


def authenticate_request(request: Request) -> str:
    """
    Dual-path authentication middleware.
    Path 1: Paperclip agents on loopback/host via `Authorization: Bearer <PAPERCLIP_BRIDGE_SECRET>`
    Path 2: Internal services (Dashboard) via `X-Service-Token: Bearer <BRIDGE_SERVICE_TOKEN>`
    """
    auth_header = request.headers.get("Authorization")
    service_header = request.headers.get("X-Service-Token")

    if not auth_header and not service_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials. Provide Authorization or X-Service-Token header."
        )

    # Check Path 1: Authorization Header
    if auth_header:
        parts = auth_header.split(" ")
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
            if token == BridgeConfig.PAPERCLIP_BRIDGE_SECRET:
                return "paperclip_agent"
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Invalid Paperclip bridge authorization token."
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Malformed Authorization header. Format: Bearer <token>"
            )

    # Check Path 2: Service Token Header
    if service_header:
        token = service_header.replace("Bearer ", "").strip()
        if token == BridgeConfig.BRIDGE_SERVICE_TOKEN:
            return "internal_service"
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid service token."
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized request."
    )


def verify_cf_access_jwt(token: str, expected_aud: Optional[str] = None) -> bool:
    """
    Verifies Cloudflare Access JWT assertion token.
    For Phase 1 validation, verifies structure and audience claim.
    """
    if not token:
        return False
    try:
        import jwt
        target_aud = expected_aud or BridgeConfig.CF_ACCESS_AUD
        # Read header and unverified claims for initial origin validation
        unverified = jwt.decode(token, options={"verify_signature": False})
        if target_aud and unverified.get("aud") != target_aud:
            return False
        return True
    except Exception as e:
        logger.warning("CF JWT verification failed: %s", e)
        return False
