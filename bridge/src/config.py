import os
from pathlib import Path


class BridgeConfig:
    """Configuration settings for Bridge L4 service."""
    OPEND_HOST: str = os.getenv("MOOMOO_OPEND_HOST", "moomoo-opend")
    OPEND_PORT: int = int(os.getenv("MOOMOO_OPEND_PORT", "11111"))
    TELNET_PORT: int = int(os.getenv("MOOMOO_TELNET_PORT", "22222"))
    MOOMOO_TRD_ENV: str = os.getenv("MOOMOO_TRD_ENV", "SIMULATE")

    # Security Tokens (Zero Default Secrets: must be explicitly provided in environment)
    PAPERCLIP_BRIDGE_SECRET: str = os.getenv("PAPERCLIP_BRIDGE_SECRET", "")
    BRIDGE_SERVICE_TOKEN: str = os.getenv("BRIDGE_SERVICE_TOKEN", "")

    # Cloudflare Access Origin JWT settings
    CF_ACCESS_AUD: str = os.getenv("CF_ACCESS_AUD", "")
    CF_ACCESS_CERTS_URL: str = os.getenv(
        "CF_ACCESS_CERTS_URL",
        "https://julietmike.cloudflareaccess.com/cdn-cgi/access/certs"
    )

    # Persistence Paths
    SHARED_DATA_DIR: Path = Path(os.getenv("SHARED_DATA_DIR", "/app/shared_data"))
    EQUITY_BASELINE_DB: Path = SHARED_DATA_DIR / "equity_baseline.sqlite"
    WATCHLIST_PATH: Path = SHARED_DATA_DIR / "watchlist.json"
    SENTINEL_STATUS_PATH: Path = SHARED_DATA_DIR / "sentinel_status.json"

    @classmethod
    def ensure_data_dir(cls) -> None:
        cls.SHARED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def validate_secrets(cls) -> None:
        """
        Fail-fast check on startup: raises RuntimeError if mandatory secrets are missing.
        Ensures zero default / fallback secrets in production environments.
        """
        missing = []
        if not cls.PAPERCLIP_BRIDGE_SECRET or not cls.PAPERCLIP_BRIDGE_SECRET.strip():
            missing.append("PAPERCLIP_BRIDGE_SECRET")
        if not cls.BRIDGE_SERVICE_TOKEN or not cls.BRIDGE_SERVICE_TOKEN.strip():
            missing.append("BRIDGE_SERVICE_TOKEN")
        if missing:
            raise RuntimeError(
                f"Missing required security credentials: {', '.join(missing)}. "
                "Bridge L4 must fail-fast on startup when secret tokens are not configured."
            )
