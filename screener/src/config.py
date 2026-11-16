import os
import sqlite3
import logging
from pathlib import Path
from typing import Tuple

logger = logging.getLogger(__name__)


class ScreenerConfig:
    """Configuration settings for L0 Screener Daemon."""
    OPEND_HOST: str = os.getenv("MOOMOO_OPEND_HOST", "moomoo-opend")
    OPEND_PORT: int = int(os.getenv("MOOMOO_OPEND_PORT", "11111"))
    OPEND_SESSION_DATA_DIR: Path = Path(os.getenv("OPEND_SESSION_DATA_DIR", "/opend_session_data"))
    RSA_KEY_PATH: Path = OPEND_SESSION_DATA_DIR / "rsa_key.pem"
    SHARED_DATA_DIR: Path = Path(os.getenv("SHARED_DATA_DIR", "/app/shared_data"))
    WATCHLIST_PATH: Path = SHARED_DATA_DIR / "watchlist.json"
    QUOTA_DB_PATH: Path = SHARED_DATA_DIR / "quota_tracker.sqlite"
    CONFIG_DB_PATH: Path = SHARED_DATA_DIR / "screener_config.sqlite"
    SCAN_INTERVAL_SECONDS: int = int(os.getenv("SCAN_INTERVAL_SECONDS", "300"))
    MAX_KLINE_30D_SYMBOLS: int = int(os.getenv("MAX_KLINE_30D_SYMBOLS", "100"))
    MAX_REALTIME_SUBSCRIPTIONS: int = int(os.getenv("MAX_REALTIME_SUBSCRIPTIONS", "15"))

    # Exchange Filtering & Cache (HOM-271)
    ALLOWED_EXCHANGES: Tuple[str, ...] = tuple(
        x.strip() for x in os.getenv("ALLOWED_EXCHANGES", "US_NYSE,US_NASDAQ,US_AMEX").split(",") if x.strip()
    )
    EXCHANGE_CACHE_TTL_SECONDS: int = int(os.getenv("EXCHANGE_CACHE_TTL_SECONDS", "3600"))

    # Default configuration values (fallback / env defaults)
    DEFAULT_CLOUD_MIN_PRICE: float = float(os.getenv("CLOUD_MIN_PRICE", "10.0"))
    DEFAULT_CLOUD_MIN_MARKET_CAP: float = float(os.getenv("CLOUD_MIN_MARKET_CAP", "1000000000.0"))  # $1B
    DEFAULT_CLOUD_MIN_ADV20: float = float(os.getenv("CLOUD_MIN_ADV20", "1000000.0"))
    DEFAULT_MOM_MIN_RVOL: float = float(os.getenv("MOM_MIN_RVOL", "1.30"))
    DEFAULT_MOM_MAX_RVOL: float = float(os.getenv("MOM_MAX_RVOL", "20.00"))

    # Stage 0: Coarse Cloud Screening parameters
    CLOUD_MIN_PRICE: float = DEFAULT_CLOUD_MIN_PRICE
    CLOUD_HARD_MIN_PRICE: float = 5.0
    CLOUD_MIN_MARKET_CAP: float = DEFAULT_CLOUD_MIN_MARKET_CAP
    CLOUD_HARD_MIN_MARKET_CAP: float = 500_000_000.0  # $500M
    CLOUD_MIN_ADV20: float = DEFAULT_CLOUD_MIN_ADV20
    CLOUD_MIN_PRICE_TO_52W_HIGH: float = float(os.getenv("CLOUD_MIN_PRICE_TO_52W_HIGH", "-0.25"))

    # Lane 1: MOMENTUM (Breakout / Expansion)
    MOM_MIN_CHANGE_PCT: float = 1.50
    MOM_MAX_CHANGE_PCT: float = 15.00
    MOM_MIN_RVOL: float = DEFAULT_MOM_MIN_RVOL
    MOM_MAX_RVOL: float = DEFAULT_MOM_MAX_RVOL
    MOM_MIN_RS_SPY: float = 0.00

    # Lane 2: SETUP (VCP / Wyckoff Accumulation)
    SETUP_MIN_CHANGE_PCT: float = -1.50
    SETUP_MAX_CHANGE_PCT: float = 1.50
    SETUP_MIN_52W_DIST: float = -0.10  # within 10% of 52W high
    SETUP_MAX_RVOL: float = 1.10
    SETUP_MAX_BBW: float = 0.100  # Bollinger Band Width <= 0.10
    SETUP_MAX_ATR_PCT: float = 0.030  # ATR(14) / Price <= 3.0%

    # K-line Enrichment & Quota Budgeting
    MAX_CANDIDATES_PER_LANE: int = int(os.getenv("MAX_CANDIDATES_PER_LANE", "5"))
    MAX_NEW_SYMBOLS_PER_DAY: int = int(os.getenv("MAX_NEW_SYMBOLS_PER_DAY", "4"))

    @classmethod
    def ensure_data_dir(cls) -> None:
        try:
            cls.SHARED_DATA_DIR.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.debug("Could not create data dir %s: %s", cls.SHARED_DATA_DIR, e)

    @classmethod
    def reset_to_defaults(cls) -> None:
        """Resets active config state to default environment values."""
        cls.CLOUD_MIN_PRICE = cls.DEFAULT_CLOUD_MIN_PRICE
        cls.CLOUD_HARD_MIN_PRICE = 5.0
        cls.CLOUD_MIN_MARKET_CAP = cls.DEFAULT_CLOUD_MIN_MARKET_CAP
        cls.CLOUD_HARD_MIN_MARKET_CAP = 500_000_000.0
        cls.CLOUD_MIN_ADV20 = cls.DEFAULT_CLOUD_MIN_ADV20
        cls.MOM_MIN_RVOL = cls.DEFAULT_MOM_MIN_RVOL
        cls.MOM_MAX_RVOL = cls.DEFAULT_MOM_MAX_RVOL

    @classmethod
    def load_active_config(cls) -> dict:
        """
        Dynamically reads active screening configuration from SQLite database.
        Enforces hard safety floor (min_price >= $1.00).
        If database or row is missing, resets to environment defaults.
        Returns active configuration dictionary.
        """
        cls.ensure_data_dir()

        if not cls.CONFIG_DB_PATH.exists():
            cls.reset_to_defaults()
            return {
                "min_price": cls.CLOUD_MIN_PRICE,
                "min_market_cap": cls.CLOUD_MIN_MARKET_CAP,
                "min_volume": cls.CLOUD_MIN_ADV20,
                "min_rvol": cls.MOM_MIN_RVOL,
                "max_rvol": cls.MOM_MAX_RVOL,
            }

        try:
            conn = sqlite3.connect(str(cls.CONFIG_DB_PATH), timeout=5.0)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT min_price, min_market_cap, min_volume, min_rvol, max_rvol FROM screener_config WHERE id = 1"
            )
            row = cursor.fetchone()
            if row:
                min_p = float(row["min_price"])
                min_cap = float(row["min_market_cap"])
                min_vol = float(row["min_volume"])
                min_rv = float(row["min_rvol"])
                max_rv = float(row["max_rvol"])

                # Enforce safety bounds
                if min_p >= 1.0:
                    cls.CLOUD_MIN_PRICE = min_p
                    cls.CLOUD_HARD_MIN_PRICE = min_p
                if min_cap >= 10_000_000.0:
                    cls.CLOUD_MIN_MARKET_CAP = min_cap
                    cls.CLOUD_HARD_MIN_MARKET_CAP = min_cap
                if min_vol >= 50_000.0:
                    cls.CLOUD_MIN_ADV20 = min_vol
                if min_rv >= 0.0:
                    cls.MOM_MIN_RVOL = min_rv
                if max_rv >= min_rv:
                    cls.MOM_MAX_RVOL = max_rv
            else:
                cls.reset_to_defaults()

            conn.close()
        except Exception as e:
            logger.warning("Could not read dynamic screener config from %s: %s", cls.CONFIG_DB_PATH, e)

        return {
            "min_price": cls.CLOUD_MIN_PRICE,
            "min_market_cap": cls.CLOUD_MIN_MARKET_CAP,
            "min_volume": cls.CLOUD_MIN_ADV20,
            "min_rvol": cls.MOM_MIN_RVOL,
            "max_rvol": cls.MOM_MAX_RVOL,
        }

