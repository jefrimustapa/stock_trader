import http.client
import json
import logging
import os
import re
import shutil
import socket
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class UnixSocketHTTPConnection(http.client.HTTPConnection):
    """HTTP client connection over local UNIX domain socket (Docker Engine API)."""

    def __init__(self, socket_path: str):
        super().__init__("localhost")
        self.socket_path = socket_path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(10.0)
        self.sock.connect(self.socket_path)


class OpenDManager:
    """
    Manages Moomoo OpenD lifecycle, session persistence files, and controlled restarts:
    1. Cleans temporary session token files in opend_session_data upon sign-out.
    2. Controls .idle_mode flag so OpenD starts disconnected without auto-login.
    3. Updates login account configuration when switching Moomoo accounts.
    4. Triggers controlled container restart via Docker UNIX socket API.
    """

    def __init__(
        self,
        session_dir: Optional[Path] = None,
        container_name: str = "stock_moomoo_opend",
        docker_socket: str = "/var/run/docker.sock"
    ):
        self.session_dir = session_dir or Path(os.getenv("OPEND_SESSION_DATA_DIR", "/opend_session_data"))
        self.container_name = container_name
        self.docker_socket = docker_socket

    def ensure_dir(self) -> None:
        if self.session_dir:
            self.session_dir.mkdir(parents=True, exist_ok=True)

    def clean_session_data(self) -> bool:
        """
        Removes temporary token and session files in opend_session_data.
        Preserves only .idle_mode and opend_login.json.
        """
        self.ensure_dir()
        if not self.session_dir.exists():
            return False

        try:
            for item in self.session_dir.iterdir():
                if item.name in [".idle_mode", "opend_login.json", "rsa_key.pem"]:
                    continue
                try:
                    if item.is_file() or item.is_symlink():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
                except Exception as e:
                    logger.warning("Error cleaning session file %s: %s", item, e)
            logger.info("Successfully cleaned session data in %s", self.session_dir)
            return True
        except Exception as err:
            logger.error("Failed to clean session data in %s: %s", self.session_dir, err)
            return False

    def set_idle_mode(self, enabled: bool) -> None:
        """Sets or clears .idle_mode flag file in opend_session_data."""
        self.ensure_dir()
        idle_file = self.session_dir / ".idle_mode"
        if enabled:
            idle_file.touch(exist_ok=True)
            logger.info("OpenD .idle_mode flag set at %s", idle_file)
        else:
            if idle_file.exists():
                idle_file.unlink()
                logger.info("OpenD .idle_mode flag removed from %s", idle_file)

    def is_idle_mode(self) -> bool:
        """Returns True if OpenD is configured to start in disconnected idle mode."""
        return (self.session_dir / ".idle_mode").exists()

    def update_login_config(self, login_account: str, login_pwd_md5: Optional[str] = None) -> Tuple[bool, str]:
        """
        Deterministic BVA validation and config file update for switching login account.
        Disables .idle_mode flag so OpenD boots with new account.
        Enforces strict file permissions (0600) so credential hash cannot be read by others.
        """
        if not login_account or not login_account.strip():
            return False, "Login account ID cannot be empty"

        clean_account = login_account.strip()
        clean_md5 = ""
        if login_pwd_md5 is not None and login_pwd_md5.strip():
            candidate_md5 = login_pwd_md5.strip()
            if len(candidate_md5) != 32 or not re.fullmatch(r"^[a-fA-F0-9]{32}$", candidate_md5):
                return False, "Invalid MD5 format for login_pwd_md5: Must be exactly 32 hexadecimal characters"
            clean_md5 = candidate_md5

        self.ensure_dir()

        config_data = {
            "login_account": clean_account,
            "login_pwd_md5": clean_md5
        }

        config_file = self.session_dir / "opend_login.json"
        try:
            with open(config_file, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=2)

            # Enforce strict 0600 file permissions
            os.chmod(config_file, 0o600)

            # Clear idle mode flag since new login configuration is provided
            self.set_idle_mode(False)
            logger.info("Updated OpenD login config for account %s at %s (permissions: 0600)", clean_account, config_file)
            return True, f"Login configuration updated for account {clean_account}"
        except Exception as e:
            logger.error("Failed writing OpenD login config: %s", e)
            return False, f"Failed updating login config: {str(e)}"

    def is_waiting_otp(self) -> bool:
        """
        Checks whether OpenD gateway is waiting for 2FA phone/device verification code (OTP).
        Inspects recent GTWLog in opend_session_data for NeedPhoneVerifyCode event.
        """
        log_dir = self.session_dir / "Log"
        if not log_dir.exists():
            return False
        try:
            log_files = sorted(
                log_dir.glob("GTWLog_*.log"),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            if not log_files:
                return False
            latest_log = log_files[0]
            with open(latest_log, "r", encoding="latin1") as f:
                file_size = latest_log.stat().st_size
                f.seek(max(0, file_size - 16384))
                content = f.read()
                if any(k in content for k in [
                    "NeedPhoneVerifyCode",
                    "UserLoginRet_NeedPhoneVerifyCode",
                    "GtwEventType_NeedPhoneVerifyCode"
                ]):
                    last_otp_idx = max(
                        content.rfind("NeedPhoneVerifyCode"),
                        content.rfind("UserLoginRet_NeedPhoneVerifyCode")
                    )
                    last_fail_idx = content.rfind("OnPhoneVerifyCodeErr")
                    last_conn_idx = content.rfind("InitConnect")
                    return True
        except Exception as e:
            logger.debug("Error checking OTP state in log: %s", e)
        return False

    def get_opend_state(self, is_connected: bool, socket_reachable: bool) -> str:
        """
        Resolves deterministic gateway state:
        IDLE -> WAIT_LOGIN -> WAIT_OTP -> CONNECTED (or DISCONNECTED)
        """
        if self.is_idle_mode():
            return "IDLE"
        if is_connected:
            return "CONNECTED"
        if not socket_reachable:
            return "DISCONNECTED"
        if self.is_waiting_otp():
            return "WAIT_OTP"
        return "WAIT_LOGIN"

    def restart_opend_container(self) -> Tuple[bool, str]:
        """
        Sends controlled restart request to Docker Engine API over local UNIX domain socket.
        """
        if not os.path.exists(self.docker_socket):
            logger.warning("Docker socket %s not found. Skipping container restart.", self.docker_socket)
            return False, f"Docker socket {self.docker_socket} not accessible"

        try:
            conn = UnixSocketHTTPConnection(self.docker_socket)
            endpoint = f"/containers/{self.container_name}/restart?t=5"
            conn.request("POST", endpoint)
            res = conn.getresponse()
            conn.close()

            if res.status in (204, 200):
                logger.info("Container %s successfully restarted via Docker API.", self.container_name)
                return True, f"Container {self.container_name} restarted successfully"
            else:
                body = res.read().decode(errors="ignore")
                logger.error("Docker API restart failed (status %d): %s", res.status, body)
                return False, f"Docker API returned status {res.status}: {body}"
        except Exception as e:
            logger.error("Error connecting to Docker API over %s: %s", self.docker_socket, e)
            return False, f"Docker API error: {str(e)}"
