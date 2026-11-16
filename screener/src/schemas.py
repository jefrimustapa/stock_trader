from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class LaneEnum(str, Enum):
    MOMENTUM = "MOMENTUM"
    SETUP = "SETUP"


class SetupMetrics(BaseModel):
    dist_to_52w_high_pct: float = Field(..., description="Percentage distance to 52-week high (e.g. 1.80 for 1.8% below high)")
    bb_width: Optional[float] = Field(default=None, description="Bollinger Band Width (Upper - Lower) / Middle")
    atr_14_pct: Optional[float] = Field(default=None, description="ATR(14) as ratio of price")
    dry_volume_ratio: float = Field(..., description="Relative volume ratio showing volume dry-up")


class WatchlistStock(BaseModel):
    """Schema for individual stock candidate in watchlist."""
    symbol: str = Field(..., description="Moomoo formatted ticker symbol e.g. US.NVDA")
    name: str = Field(..., description="Company name")
    price: float = Field(..., ge=1.0, description="Current market price (must be >= $1.00)")
    change_pct: float = Field(..., description="Daily price change percentage")
    adv_20: float = Field(..., ge=50_000, description="20-day Average Daily Volume")
    rs_spy: float = Field(..., description="Relative strength compared to SPY index")
    rvol_15m: float = Field(..., ge=0.0, description="15-minute Relative Volume (dry volume allowed for SETUP)")
    lane: str = Field(..., description="Screening lane: MOMENTUM or SETUP")
    lane_score: float = Field(..., ge=0.0, le=100.0, description="Normalized composite lane score (0-100)")
    setup_metrics: Optional[SetupMetrics] = Field(default=None, description="Metrics specific to SETUP lane")
    status: str = Field(default="READY_FOR_ANALYSIS", description="Readiness flag for downstream LLM analysis")
    exchange: Optional[str] = Field(default=None, description="Listing exchange code e.g. US_NYSE, US_NASDAQ, US_AMEX")


class QuotaStatus(BaseModel):
    """Schema for OpenAPI quota tracking metrics."""
    kline_30d_used: int = Field(..., ge=0, description="Number of unique symbols queried in 30-day window")
    kline_30d_remaining: int = Field(..., ge=0, description="Remaining unique symbols out of 100 limit")
    realtime_subscribed: int = Field(default=0, ge=0, description="Current real-time quote/kline quota used")
    realtime_remaining: int = Field(default=15, ge=0, description="Remaining real-time subscription slots")


class DroppedReason(BaseModel):
    symbol: str = Field(..., description="Ticker symbol")
    stage: str = Field(..., description="Stage where dropped")
    reason: str = Field(..., description="Reason for dropping")
    actual_value: Optional[float] = Field(default=None, description="Actual metric value")
    threshold: Optional[float] = Field(default=None, description="Target threshold")


class FunnelStageMetrics(BaseModel):
    cloud_raw_returned: int = Field(default=0, ge=0, description="Total raw stocks returned from cloud screen")
    cloud_skipped_incomplete: int = Field(default=0, ge=0, description="Stocks skipped due to missing fields in cloud response")
    otc_filtered_count: int = Field(default=0, ge=0, description="Total OTC stocks filtered out before/during screening")
    stage0_quality_passed: int = Field(default=0, ge=0, description="Stocks passing Stage 0 baseline quality gates")
    lane_momentum_candidates: int = Field(default=0, ge=0, description="Stocks qualifying for Momentum lane")
    lane_setup_candidates: int = Field(default=0, ge=0, description="Stocks qualifying for Setup lane")
    kline_analyzed_count: int = Field(default=0, ge=0, description="Count of candidates enriched via K-line")
    final_watchlist_count: int = Field(default=0, ge=0, description="Final candidate count in watchlist")
    dropped_reasons: List[Dict[str, Any]] = Field(default_factory=list, description="Audit log of reasons stocks were dropped")


class WatchlistOutput(BaseModel):
    """Standardized schema for shared watchlist.json artifact."""
    generated_at: str = Field(..., description="ISO 8601 formatted timestamp with timezone")
    market_status: str = Field(default="OPEN", description="Market session status: OPEN, PRE_POST, or CLOSED")
    is_live: bool = Field(default=True, description="Whether data represents an active open market session")
    data_as_of: str = Field(..., description="Effective data as-of timestamp")
    source: str = Field(default="REAL", description="Data source indicator: REAL or OPEND_UNAVAILABLE")
    warning: Optional[str] = Field(default=None, description="Warning message when OpenD is unavailable or unauthenticated")
    funnel: FunnelStageMetrics = Field(default_factory=FunnelStageMetrics, description="5-stage funnel metrics")
    watchlist: List[WatchlistStock] = Field(default_factory=list, description="Final vetted candidates")
    quota_status: QuotaStatus = Field(..., description="Moomoo OpenAPI quota consumption status")

    # Optional backward compatibility fields
    total_screened_cloud: Optional[int] = Field(default=None, description="Legacy alias for funnel.cloud_raw_returned")
    stage1_passed: Optional[int] = Field(default=None, description="Legacy alias for funnel.stage0_quality_passed")
    stage2_passed: Optional[int] = Field(default=None, description="Legacy alias for passed lane candidates")
