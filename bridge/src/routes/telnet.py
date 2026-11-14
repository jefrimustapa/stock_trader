from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..config import BridgeConfig
from ..security import authenticate_request
from ..telnet_relay import TelnetRelayClient

router = APIRouter(prefix="/api/v1/telnet", tags=["Telnet Management"])

telnet_client = TelnetRelayClient(
    host=BridgeConfig.OPEND_HOST,
    port=BridgeConfig.TELNET_PORT
)


class OTPRequest(BaseModel):
    otp_code: str = Field(..., min_length=4, max_length=8, description="SMS or Email OTP code")


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
    """Triggers controlled session sign-out via OpenD Telnet CLI."""
    success, message = await telnet_client.logout_session()
    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed sending logout to OpenD: {message}"
        )
    return {"status": "SUCCESS", "message": message}
