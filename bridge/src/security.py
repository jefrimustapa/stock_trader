import hmac
import logging
from typing import Optional
from fastapi import Request, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from .config import BridgeConfig

logger = logging.getLogger(__name__)

security_bearer = HTTPBearer(auto_error=False)


def authenticate_request(request: Request) -> str:
    """
    Dual-path constant-time authentication middleware.
    Path 1: Paperclip agents on loopback/host via `Authorization: Bearer <PAPERCLIP_BRIDGE_SECRET>`
    Path 2: Internal services (Dashboard) via `X-Service-Token: Bearer <BRIDGE_SERVICE_TOKEN>`
    Enforces constant-time comparison via hmac.compare_digest against timing attacks.
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
            configured_secret = BridgeConfig.PAPERCLIP_BRIDGE_SECRET
            if configured_secret and hmac.compare_digest(token, configured_secret):
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
        configured_token = BridgeConfig.BRIDGE_SERVICE_TOKEN
        if configured_token and hmac.compare_digest(token, configured_token):
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
    Enforces fail-closed cryptographic verification against Cloudflare Access JWKS.
    Tokens without valid cryptographic signature or failed JWKS fetch are rejected immediately.
    """
    if not token or not token.strip():
        return False
    try:
        import jwt
        target_aud = expected_aud or BridgeConfig.CF_ACCESS_AUD
        certs_url = BridgeConfig.CF_ACCESS_CERTS_URL

        if not target_aud or not certs_url:
            logger.warning("CF JWT verification failed: CF_ACCESS_AUD or CF_ACCESS_CERTS_URL not configured")
            return False

        # Verify header structure: require RS256 and kid
        headers = jwt.get_unverified_header(token)
        if not headers or headers.get("alg") != "RS256" or "kid" not in headers:
            logger.warning("CF JWT verification rejected: invalid header or non-RS256 algorithm")
            return False

        # Fail-closed JWKS cryptographic validation
        jwks_client = jwt.PyJWKClient(certs_url, timeout=3.0)
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        decoded = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=target_aud,
            options={"verify_exp": True, "verify_aud": True}
        )
        return bool(decoded)
    except Exception as e:
        logger.warning("CF JWT verification failed (fail-closed): %s", e)
        return False
