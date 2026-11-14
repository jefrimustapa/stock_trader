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
    password: Optional[str] = Field(None, min_length=1, description="Login password")
    login_pwd_md5: Optional[str] = Field(None, description="MD5 hash of login password (legacy)")


class SignInRequest(BaseModel):
    login_account: str = Field(..., min_length=1, description="Moomoo login account ID")
    password: Optional[str] = Field(None, min_length=1, description="Login password")
    login_pwd_md5: Optional[str] = Field(None, description="MD5 hash of login password (legacy)")


@router.post("/otp")
async def relay_otp(payload: OTPRequest, caller: str = Depends(authenticate_request)):
    """Relays 2FA verification code to OpenD CLI."""
    success, message = await telnet_client.relay_otp_code(payload.otp_code)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed relaying OTP to OpenD: {message}"
        )

    # Re-check and attempt client connection
    client = get_moomoo_client()
    import asyncio
    await asyncio.sleep(1.0)
    connected = client.connect()
    curr_status = client.get_connection_status()

    return {
        "status": "SUCCESS" if connected or curr_status == "CONNECTED" else "WAIT_CONFIRMATION",
        "message": message,
        "connection_status": curr_status
    }


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
    Switches to a different Moomoo login account (Seksyen 3.5.B Blueprint & HOM-173):
    Redirects to sign_in_session for unified interactive login.
    """
    signin_req = SignInRequest(
        login_account=payload.login_account,
        password=payload.password,
        login_pwd_md5=payload.login_pwd_md5
    )
    return await sign_in_session(payload=signin_req, caller=caller)


@router.post("/sign-in")
async def sign_in_session(payload: SignInRequest, caller: str = Depends(authenticate_request)):
    """
    Signs in to Moomoo account (Seksyen 3.5.B Blueprint & HOM-173):
    1. Terminates old session via Telnet (if active).
    2. Disconnects local trade context.
    3. Cleans stale session tokens and clears .idle_mode.
    4. Updates opend_login.json with 0600 file permissions (account only, no saved password).
    5. Restarts OpenD container in clean state.
    6. Conducts interactive telnet handshake (account, password, remember=Y) to authenticate.
    7. Evaluates true authentication outcome:
       - WAIT_OTP: OpenD prompts for 2FA SMS/Email code.
       - CONNECTED: Logged in and broker connection established.
       - LOGIN_FAILED: Password/account mismatch (HTTP 400).
    """
    try:
        await telnet_client.logout_session()
    except Exception:
        pass

    client = get_moomoo_client()
    client.close()

    opend_manager.clean_session_data()

    config_ok, config_msg = opend_manager.update_login_config(
        login_account=payload.login_account
    )
    if not config_ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed updating login configuration: {config_msg}"
        )

    # Controlled restart of OpenD container
    restart_ok, restart_msg = opend_manager.restart_opend_container()
    if not restart_ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed restarting OpenD container: {restart_msg}"
        )

    pwd = payload.password or ""
    if not pwd:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is required for interactive OpenD login"
        )

    # Conduct interactive telnet handshake
    login_status, login_msg = await telnet_client.login_interactive(
        account=payload.login_account,
        password=pwd
    )

    if login_status == "LOGIN_FAILED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Login failed: {login_msg}"
        )
    elif login_status == "ERROR":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenD communication error: {login_msg}"
        )

    return {
        "status": login_status,
        "login_account": payload.login_account,
        "container_restart": restart_msg,
        "message": login_msg
    }
