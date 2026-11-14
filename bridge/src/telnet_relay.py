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

    async def login_interactive(
        self,
        account: str,
        password: str,
        remember: bool = True,
        max_connect_attempts: int = 25,
        connect_retry_delay: float = 0.4,
        timeout: float = 15.0
    ) -> Tuple[str, str]:
        """
        Conducts interactive login over Port 22222 Telnet CLI (Seksyen 3.5.B Blueprint & HOM-173).

        Robust prompt-driven state machine:
        - Detects current prompt (account, password, remember, or verification)
        - Synchronizes state dynamically regardless of initial prompt
        - Returns actual terminal authentication outcome from broker

        Returns: (status, message)
        - ("WAIT_OTP", "SMS verification code required")
        - ("CONNECTED", "Login successful")
        - ("LOGIN_FAILED", "<error_details>")
        - ("ERROR", "<connection_or_communication_error>")
        """
        if not account or not account.strip():
            return "LOGIN_FAILED", "Login account ID cannot be empty"

        if not password or not password.strip():
            return "LOGIN_FAILED", "Login password cannot be empty"

        clean_account = account.strip()
        clean_password = password.strip()

        # Connect with retry (e.g. after container restart)
        reader = None
        writer = None
        for attempt in range(max_connect_attempts):
            try:
                reader, writer = await asyncio.wait_for(
                    asyncio.open_connection(self.host, self.port),
                    timeout=1.5
                )
                break
            except Exception:
                await asyncio.sleep(connect_retry_delay)

        if not reader or not writer:
            logger.error("Failed to connect to OpenD telnet port %s:%d after %d attempts", self.host, self.port, max_connect_attempts)
            return "ERROR", f"Could not connect to OpenD telnet on {self.host}:{self.port}"

        try:
            loop = asyncio.get_event_loop()
            t_end = loop.time() + timeout
            buf = ""
            sent_acc = False
            sent_pwd = False
            sent_rem = False

            # Prompt initial state probe
            writer.write(b"\r\n")
            await writer.drain()

            while loop.time() < t_end:
                try:
                    chunk = await asyncio.wait_for(reader.read(1024), timeout=1.0)
                    if not chunk:
                        break
                    text = chunk.decode(errors="ignore")
                    buf += text

                    # Terminal state 1: 2FA OTP Required
                    if any(k in buf.lower() for k in ["verification code", "verify_code", "sms verification"]):
                        writer.close()
                        await writer.wait_closed()
                        return "WAIT_OTP", "SMS verification code required"

                    # Terminal state 2: Authentication Failed / Credential mismatch
                    if any(k in buf.lower() for k in ["does not match", "login failed", "password error", "format error"]):
                        err_line = ""
                        for line in buf.splitlines():
                            if any(k in line.lower() for k in ["failed", "match", "error"]):
                                err_line = line.strip()
                                break
                        writer.close()
                        await writer.wait_closed()
                        return "LOGIN_FAILED", err_line or "Login failed: Account or password mismatch"

                    # Terminal state 3: Login Success
                    if "login success" in buf.lower():
                        writer.close()
                        await writer.wait_closed()
                        return "CONNECTED", "Login successful"

                    # Interactive prompt: Account
                    if "please enter account" in buf.lower() and not sent_acc:
                        logger.info("OpenD prompt: Please enter account. Supplying account ID...")
                        writer.write((clean_account + "\r\n").encode("utf-8"))
                        await writer.drain()
                        sent_acc = True
                        buf = ""
                        continue

                    # Interactive prompt: Password
                    if "please enter password" in buf.lower() and not sent_pwd:
                        logger.info("OpenD prompt: Please enter password. Supplying password...")
                        writer.write((clean_password + "\r\n").encode("utf-8"))
                        await writer.drain()
                        sent_pwd = True
                        buf = ""
                        continue

                    # Interactive prompt: Remember password
                    if ("remember the password" in buf.lower() or "whether to remember" in buf.lower()) and not sent_rem:
                        logger.info("OpenD prompt: Remember password choice. Supplying Y...")
                        rem_val = b"Y\r\n" if remember else b"N\r\n"
                        writer.write(rem_val)
                        await writer.drain()
                        sent_rem = True
                        buf = ""
                        continue

                except asyncio.TimeoutError:
                    continue

            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

            clean_final = buf.strip()
            if any(k in clean_final.lower() for k in ["verification code", "verify_code", "sms"]):
                return "WAIT_OTP", "SMS verification code required"
            elif any(k in clean_final.lower() for k in ["does not match", "login failed", "password error", "format error"]):
                return "LOGIN_FAILED", clean_final
            elif "success" in clean_final.lower():
                return "CONNECTED", "Login successful"
            else:
                return "WAIT_LOGIN", clean_final or "Timeout waiting for OpenD authentication response"

        except Exception as e:
            logger.error("Error during interactive telnet login: %s", e)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
            return "ERROR", str(e)
