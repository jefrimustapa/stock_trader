import asyncio
import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


class TelnetRelayClient:
    """
    Asynchronous TCP client for Moomoo OpenD Port 22222 Telnet CLI.
    Supports:
    1. 2FA OTP Relay: `input_phone_verify_code -code=XXXXXX`
    2. Graceful Session Sign-out: `logout`
    """

    def __init__(self, host: str, port: int, timeout: float = 5.0):
        self.host = host
        self.port = port
        self.timeout = timeout

    async def _send_command(self, command: str) -> Tuple[bool, str]:
        """Opens TCP connection, sends command, and reads response."""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=self.timeout
            )
            # Read banner
            initial_banner = await asyncio.wait_for(reader.read(1024), timeout=2.0)
            logger.info("OpenD Telnet connected. Banner: %s", initial_banner.decode(errors="ignore").strip())

            # Send command
            cmd_payload = (command.strip() + "\r\n").encode("utf-8")
            writer.write(cmd_payload)
            await writer.drain()

            # Read response
            response = await asyncio.wait_for(reader.read(2048), timeout=self.timeout)
            resp_text = response.decode(errors="ignore").strip()

            writer.close()
            await writer.wait_closed()
            return True, resp_text
        except (asyncio.TimeoutError, ConnectionRefusedError, OSError) as e:
            logger.error("Telnet communication error to %s:%d: %s", self.host, self.port, e)
            return False, str(e)

    async def relay_otp_code(self, otp_code: str) -> Tuple[bool, str]:
        """Relays 2FA SMS/Email verification code to OpenD CLI."""
        if not otp_code or len(otp_code.strip()) == 0:
            return False, "OTP code cannot be empty"

        clean_code = otp_code.strip()
        cmd = f"input_phone_verify_code -code={clean_code}"
        logger.info("Relaying OTP code to OpenD telnet port %d...", self.port)
        return await self._send_command(cmd)

    async def logout_session(self) -> Tuple[bool, str]:
        """Sends controlled session termination command to OpenD CLI."""
        logger.info("Sending logout command to OpenD telnet port %d...", self.port)
        return await self._send_command("logout")
