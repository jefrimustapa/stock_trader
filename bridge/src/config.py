import os
from pathlib import Path


class BridgeConfig:
    """Configuration settings for Bridge L4 service."""
    OPEND_HOST: str = os.getenv("MOOMOO_OPEND_HOST", "moomoo-opend")
    OPEND_PORT: int = int(os.getenv("MOOMOO_OPEND_PORT", "11111"))
    TELNET_PORT: int = int(os.getenv("MOOMOO_TELNET_PORT", "22222"))
    MOOMOO_TRD_ENV: str = os.getenv("MOOMOO_TRD_ENV", "SIMULATE")

    # Trading Mode Configuration (HOM-328 / Issue #14 / Blueprint Sec 7)
    TRADING_MODE: str = os.getenv("TRADING_MODE", "DAY").upper().strip()
    if TRADING_MODE not in ("DAY", "SWING"):
        TRADING_MODE = "DAY"

    # Security Tokens (Zero Default Secrets: must be explicitly provided in environment)
    PAPERCLIP_BRIDGE_SECRET: str = os.getenv("PAPERCLIP_BRIDGE_SECRET", "")
    BRIDGE_SERVICE_TOKEN: str = os.getenv("BRIDGE_SERVICE_TOKEN", "")

    # Paperclip Agent Integration (HOM-386 / HOM-384 / Issue #30)
    PAPERCLIP_API_URL: str = os.getenv("PAPERCLIP_API_URL", "https://crew.julietmike.net").rstrip("/")
    PAPERCLIP_API_KEY: str = os.getenv("PAPERCLIP_API_KEY", "")

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
    AGENT_ACTIVITY_DB: Path = SHARED_DATA_DIR / "agent_activity.sqlite"

    # OpenD Session Data & Container Management
    OPEND_SESSION_DATA_DIR: Path = Path(os.getenv("OPEND_SESSION_DATA_DIR", "/opend_session_data"))
    OPEND_CONTAINER_NAME: str = os.getenv("OPEND_CONTAINER_NAME", "stock_moomoo_opend")
    DOCKER_SOCKET_PATH: str = os.getenv("DOCKER_SOCKET_PATH", "/var/run/docker.sock")

    # API Protocol Encryption
    RSA_KEY_PATH: Path = OPEND_SESSION_DATA_DIR / "rsa_key.pem"
    ENABLE_PROTO_ENCRYPT: bool = os.getenv("ENABLE_PROTO_ENCRYPT", "true").lower() in ("true", "1", "yes")

    # Moomoo US Equities Fee Model Configuration (HOM-374 / Issue #12)
    MOOMOO_PLATFORM_FEE: float = float(os.getenv("MOOMOO_PLATFORM_FEE", "0.99"))
    MOOMOO_COMMISSION_RATE: float = float(os.getenv("MOOMOO_COMMISSION_RATE", "0.0003"))  # 0.03%
    MOOMOO_COMMISSION_MIN: float = float(os.getenv("MOOMOO_COMMISSION_MIN", "0.01"))
    MOOMOO_SETTLEMENT_FEE_PER_SHARE: float = float(os.getenv("MOOMOO_SETTLEMENT_FEE_PER_SHARE", "0.003"))
    MOOMOO_SETTLEMENT_FEE_MAX_PCT: float = float(os.getenv("MOOMOO_SETTLEMENT_FEE_MAX_PCT", "0.01"))  # 1%
    MOOMOO_SEC_FEE_RATE: float = float(os.getenv("MOOMOO_SEC_FEE_RATE", "0.0000206"))
    MOOMOO_SEC_FEE_MIN: float = float(os.getenv("MOOMOO_SEC_FEE_MIN", "0.01"))
    MOOMOO_FINRA_TAF_PER_SHARE: float = float(os.getenv("MOOMOO_FINRA_TAF_PER_SHARE", "0.000166"))
    MOOMOO_FINRA_TAF_MIN: float = float(os.getenv("MOOMOO_FINRA_TAF_MIN", "0.01"))
    MOOMOO_FINRA_TAF_MAX: float = float(os.getenv("MOOMOO_FINRA_TAF_MAX", "8.30"))
    MOOMOO_INCLUDE_STAMP_DUTY: bool = os.getenv("MOOMOO_INCLUDE_STAMP_DUTY", "true").lower() in ("true", "1", "yes")
    MOOMOO_USD_MYR_RATE: float = float(os.getenv("MOOMOO_USD_MYR_RATE", "4.45"))

    @classmethod
    def get_trading_mode(cls) -> str:
        """
        Dynamically reads active TRADING_MODE from screener_config.sqlite with fallback to env.
        """
        config_db = cls.SHARED_DATA_DIR / "screener_config.sqlite"
        if config_db.exists():
            try:
                import sqlite3
                conn = sqlite3.connect(str(config_db), timeout=2.0)
                cursor = conn.cursor()
                cursor.execute("SELECT trading_mode FROM screener_config WHERE id = 1")
                row = cursor.fetchone()
                conn.close()
                if row and row[0]:
                    mode = str(row[0]).strip().upper()
                    if mode in ("DAY", "SWING"):
                        return mode
            except Exception:
                pass
        return cls.TRADING_MODE

    @classmethod
    def ensure_rsa_key(cls) -> Path:
        """
        Ensures a 1024-bit PKCS#1 RSA private key exists for OpenD protocol encryption.
        Stored with 0600 permissions inside OPEND_SESSION_DATA_DIR.
        """
        cls.OPEND_SESSION_DATA_DIR.mkdir(parents=True, exist_ok=True)
        key_path = cls.RSA_KEY_PATH
        if not key_path.exists():
            from cryptography.hazmat.primitives.asymmetric import rsa
            from cryptography.hazmat.primitives import serialization
            key = rsa.generate_private_key(public_exponent=65537, key_size=1024)
            pem = key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption()
            )
            key_path.write_bytes(pem)
        try:
            key_path.chmod(0o600)
        except Exception:
            pass
        return key_path

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
