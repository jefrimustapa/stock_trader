from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..config import BridgeConfig
from ..security import authenticate_request
from ..telnet_relay import TelnetRelayClient
from ..opend_manager import OpenDManager
from ..moomoo_client import get_moomoo_client

router = APIRouter(prefix="/api/v1/telnet", tags=["Telnet Management"])

telnet_client = TelnetRelayClient(
    host=BridgeConfig.OPEND_HOST,
    port=BridgeConfig.TELNET_PORT
)

opend_manager = OpenDManager(
    session_dir=BridgeConfig.OPEND_SESSION_DATA_DIR,
    container_name=BridgeConfig.OPEND_CONTAINER_NAME,
    docker_socket=BridgeConfig.DOCKER_SOCKET_PATH
)


class OTPRequest(BaseModel):
    otp_code: str = Field(..., min_length=4, max_length=8, description="SMS or Email OTP code")


class SwitchLoginRequest(BaseModel):
    login_account: str = Field(..., min_length=1, description="Moomoo login account ID")
    login_pwd_md5: Optional[str] = Field(None, description="MD5 hash of login password (optional)")


@router.post("/otp")
async def relay_otp(payload: OTPRequest, caller: str = Depends(authenticate_request)):
    """Relays 2FA verification code to OpenD CLI."""
    success, message = await telnet_client.relay_otp_code(payload.otp_code)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed relaying OTP to OpenD: {message}"
        )
    return {"status": "SUCCESS", "message": message}


@router.post("/sign-out")
async def sign_out_session(caller: str = Depends(authenticate_request)):
    """
    Triggers controlled session sign-out via OpenD Telnet CLI (Seksyen 3.5.B Blueprint):
    1. Sends telnet session termination (logout) to Port 22222.
    2. Disconnects local OpenAPI trade context.
    3. Cleans temporary token files in opend_session_data.
    4. Sets .idle_mode flag so OpenD boots into disconnected idle state.
    5. Restarts OpenD container in idle mode.
    """
    success, telnet_msg = await telnet_client.logout_session()

    # Disconnect client context
    client = get_moomoo_client()
    client.close()

    # Clean session token files and mark idle mode
    tokens_cleaned = opend_manager.clean_session_data()
    opend_manager.set_idle_mode(True)

    # Controlled restart of OpenD container
    restart_ok, restart_msg = opend_manager.restart_opend_container()

    return {
        "status": "SUCCESS",
        "telnet_message": telnet_msg,
        "tokens_cleaned": tokens_cleaned,
        "idle_mode": True,
        "container_restart": restart_msg,
        "message": "OpenD session terminated, temporary tokens cleaned, and container restarted into idle mode."
    }


@router.post("/switch-login")
async def switch_login(payload: SwitchLoginRequest, caller: str = Depends(authenticate_request)):
    """
    Switches to a different Moomoo login account (Seksyen 3.5.B Blueprint):
    1. Signs out existing OpenD session via Telnet.
    2. Disconnects local trade context.
    3. Cleans temporary tokens from opend_session_data.
    4. Updates login configuration file (opend_login.json) and removes .idle_mode.
    5. Restarts OpenD container to load new account credentials.
    """
    await telnet_client.logout_session()

    client = get_moomoo_client()
    client.close()

    opend_manager.clean_session_data()

    config_ok, config_msg = opend_manager.update_login_config(
        login_account=payload.login_account,
        login_pwd_md5=payload.login_pwd_md5
    )
    if not config_ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed updating login configuration: {config_msg}"
        )

    restart_ok, restart_msg = opend_manager.restart_opend_container()

    return {
        "status": "SUCCESS",
        "login_account": payload.login_account,
        "container_restart": restart_msg,
        "message": f"Successfully configured login account {payload.login_account} and restarted OpenD gateway."
    }
