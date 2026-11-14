from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class WatchlistStock(BaseModel):
    """Schema for individual stock candidate in watchlist."""
    symbol: str = Field(..., description="Moomoo formatted ticker symbol e.g. US.NVDA")
    name: str = Field(..., description="Company name")
    price: float = Field(..., ge=5.0, description="Current market price (must be >= $5.00)")
    change_pct: float = Field(..., description="Daily price change percentage")
    adv_20: float = Field(..., ge=1_000_000, description="20-day Average Daily Volume")
    rs_spy: float = Field(..., description="Relative strength compared to SPY index")
    rvol_15m: float = Field(..., ge=1.0, description="15-minute Relative Volume")
    status: str = Field(default="READY_FOR_ANALYSIS", description="Readiness flag for downstream LLM analysis")


class QuotaStatus(BaseModel):
    """Schema for OpenAPI quota tracking metrics."""
    kline_30d_used: int = Field(..., ge=0, description="Number of unique symbols queried in 30-day window")
    kline_30d_remaining: int = Field(..., ge=0, description="Remaining unique symbols out of 100 limit")
    realtime_subscribed: int = Field(..., ge=0, description="Current real-time quote/kline quota used")
    realtime_remaining: int = Field(..., ge=0, description="Remaining real-time subscription slots")


class WatchlistOutput(BaseModel):
    """Standardized schema for shared watchlist.json artifact."""
    generated_at: str = Field(..., description="ISO 8601 formatted timestamp with timezone")
    total_screened_cloud: int = Field(..., ge=0, description="Total stocks evaluated by cloud screening")
    stage1_passed: int = Field(..., ge=0, description="Count of stocks passing Stage 1 filters")
    stage2_passed: int = Field(..., ge=0, description="Count of stocks passing Stage 2 relative strength")
    watchlist: List[WatchlistStock] = Field(default_factory=list, description="Final vetted candidates")
    quota_status: QuotaStatus = Field(..., description="Moomoo OpenAPI quota consumption status")
    source: str = Field(default="REAL", description="Data source indicator: REAL or OPEND_UNAVAILABLE")
    warning: Optional[str] = Field(default=None, description="Warning message when OpenD is unavailable or unauthenticated")
