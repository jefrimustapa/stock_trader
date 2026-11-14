import asyncio
import logging
import re
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class TelnetRelayClient:
    """
    Asynchronous TCP client for Moomoo OpenD Port 22222 Telnet CLI.
    Supports:
    1. 2FA OTP Relay: `input_phone_verify_code -code=XXXXXX` with deterministic BVA validation.
    2. Status Probe: Checks OpenD login and connection state via CLI.
    3. Graceful Session Sign-out: `logout`
    """

    def __init__(self, host: str, port: int, timeout: float = 5.0):
        self.host = host
        self.port = port
        self.timeout = timeout

    async def _send_command(self, command: str, redact: bool = False) -> Tuple[bool, str]:
        """Opens TCP connection, sends command, and reads response."""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=self.timeout
            )
            # Read banner
            try:
                initial_banner = await asyncio.wait_for(reader.read(1024), timeout=2.0)
                logger.info("OpenD Telnet connected. Banner length: %d bytes", len(initial_banner))
            except asyncio.TimeoutError:
                pass

            # Send command
            cmd_payload = (command.strip() + "\r\n").encode("utf-8")
            writer.write(cmd_payload)
            await writer.drain()

            # Read response
            response = await asyncio.wait_for(reader.read(4096), timeout=self.timeout)
            resp_text = response.decode(errors="ignore").strip()

            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            return True, resp_text
        except (asyncio.TimeoutError, ConnectionRefusedError, OSError) as e:
            logger.error("Telnet communication error to %s:%d: %s", self.host, self.port, e)
            return False, str(e)

    async def relay_otp_code(self, otp_code: str) -> Tuple[bool, str]:
        """
        Relays 2FA SMS/Email verification code to OpenD CLI.
        Deterministic BVA:
        - Must not be empty
        - Must consist strictly of digits
        - Length must be between 4 and 8 digits (inclusive)
        """
        if not otp_code or not otp_code.strip():
            return False, "OTP code cannot be empty"

        clean_code = otp_code.strip()

        # Non-digit validation
        if not clean_code.isdigit():
            return False, "OTP code must contain only numeric digits"

        # BVA Length boundary check: 4 to 8 digits
        if len(clean_code) < 4 or len(clean_code) > 8:
            return False, f"Invalid OTP code length: {len(clean_code)}. Must be between 4 and 8 digits."

        cmd = f"input_phone_verify_code -code={clean_code}"
        logger.info("Relaying %d-digit OTP code to OpenD telnet port %d (sanitized)...", len(clean_code), self.port)
        return await self._send_command(cmd, redact=True)

    async def check_status(self) -> Tuple[bool, str]:
        """Probes OpenD CLI state via telnet."""
        return await self._send_command("status")

    async def logout_session(self) -> Tuple[bool, str]:
        """Sends controlled session termination command to OpenD CLI."""
        logger.info("Sending logout command to OpenD telnet port %d...", self.port)
        return await self._send_command("logout")
