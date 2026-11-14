import os
from pathlib import Path


class ScreenerConfig:
    """Configuration settings for L0 Screener Daemon."""
    OPEND_HOST: str = os.getenv("MOOMOO_OPEND_HOST", "moomoo-opend")
    OPEND_PORT: int = int(os.getenv("MOOMOO_OPEND_PORT", "11111"))
    SHARED_DATA_DIR: Path = Path(os.getenv("SHARED_DATA_DIR", "/app/shared_data"))
    WATCHLIST_PATH: Path = SHARED_DATA_DIR / "watchlist.json"
    QUOTA_DB_PATH: Path = SHARED_DATA_DIR / "quota_tracker.sqlite"
    SCAN_INTERVAL_SECONDS: int = int(os.getenv("SCAN_INTERVAL_SECONDS", "300"))
    MAX_KLINE_30D_SYMBOLS: int = int(os.getenv("MAX_KLINE_30D_SYMBOLS", "100"))
    MAX_REALTIME_SUBSCRIPTIONS: int = int(os.getenv("MAX_REALTIME_SUBSCRIPTIONS", "15"))

    @classmethod
    def ensure_data_dir(cls) -> None:
        cls.SHARED_DATA_DIR.mkdir(parents=True, exist_ok=True)
