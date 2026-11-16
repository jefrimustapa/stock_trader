import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

from .config import ScreenerConfig
from .schemas import (
    WatchlistOutput,
    WatchlistStock,
    QuotaStatus,
    FunnelStageMetrics,
    SetupMetrics,
    LaneEnum
)
from .quota_tracker import QuotaTracker, QuotaExceededError

logger = logging.getLogger(__name__)


class CloudScreener:
    """
    Executes multi-stage hybrid L0 market screening (Approach C).
    Stage 0: Coarse cloud gate & baseline quality (Price >= $5.00/$10.00, Cap >= $500M/$1B, ADV20 >= 1M, 52W High Prox >= -25%).
    Stage 1: Batch snapshot metric calculation (change_pct, rs_spy, rvol_15m, dist_52w).
    Stage 2: Dual-lane routing & specialized factor scoring (MOMENTUM vs SETUP).
    Stage 3: Top-tier K-line enrichment gate with quota budgeting (Top 3-5 candidates per lane).
    """

    def __init__(self, quota_tracker: QuotaTracker, output_file: Path):
        self.quota_tracker = quota_tracker
        self.output_file = output_file

    def filter_stage0_quality(
        self,
        raw_stocks: List[Dict[str, Any]],
        funnel: Optional[FunnelStageMetrics] = None
    ) -> List[Dict[str, Any]]:
        """Stage 0: Apply baseline institutional quality cutoffs."""
        passed = []
        for s in raw_stocks:
            symbol = str(s.get("symbol", "N/A"))
            price = float(s.get("price", 0.0))
            cap = float(s.get("market_cap", 0.0))
            adv20 = float(s.get("adv_20", 0.0))
            dist_52w = float(s.get("price_to_52w_high", s.get("dist_52w", 0.0)))

            # Hard baseline cutoffs
            if price < ScreenerConfig.CLOUD_HARD_MIN_PRICE:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "STAGE0_QUALITY",
                        "reason": "PRICE_BELOW_MINIMUM",
                        "actual_value": price,
                        "threshold": ScreenerConfig.CLOUD_HARD_MIN_PRICE
                    })
                continue

            if cap < ScreenerConfig.CLOUD_HARD_MIN_MARKET_CAP:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "STAGE0_QUALITY",
                        "reason": "MARKET_CAP_BELOW_MINIMUM",
                        "actual_value": cap,
                        "threshold": ScreenerConfig.CLOUD_HARD_MIN_MARKET_CAP
                    })
                continue

            if adv20 < ScreenerConfig.CLOUD_MIN_ADV20:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "STAGE0_QUALITY",
                        "reason": "ADV20_BELOW_MINIMUM",
                        "actual_value": adv20,
                        "threshold": ScreenerConfig.CLOUD_MIN_ADV20
                    })
                continue

            # 52W High Proximity cutoff (within 25% of 52W High)
            if dist_52w < ScreenerConfig.CLOUD_MIN_PRICE_TO_52W_HIGH:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "STAGE0_QUALITY",
                        "reason": "52W_HIGH_PROXIMITY_EXCEEDED",
                        "actual_value": dist_52w,
                        "threshold": ScreenerConfig.CLOUD_MIN_PRICE_TO_52W_HIGH
                    })
                continue

            item = dict(s)
            item["price"] = price
            item["market_cap"] = cap
            item["adv_20"] = adv20
            item["dist_52w"] = dist_52w
            passed.append(item)

        if funnel:
            funnel.stage0_quality_passed = len(passed)
        return passed

    # Backward compatibility wrapper
    def filter_stage1(self, raw_stocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Legacy Stage 1 compatibility method."""
        passed = []
        for s in raw_stocks:
            price = float(s.get("price", 0.0))
            cap = float(s.get("market_cap", 0.0))
            adv20 = float(s.get("adv_20", 0.0))
            change_pct = float(s.get("change_pct", 0.0))
            if price >= 5.0 and cap >= 500_000_000 and adv20 >= 1_000_000 and 2.0 <= change_pct <= 12.0:
                passed.append(s)
        return passed

    def calculate_snapshot_metrics(
        self,
        stocks: List[Dict[str, Any]],
        spy_change_pct: float
    ) -> List[Dict[str, Any]]:
        """Stage 1: Computes intraday relative strength and distance metrics."""
        enriched = []
        for s in stocks:
            item = dict(s)
            change_pct = float(item.get("change_pct", 0.0))
            rs_spy = round(change_pct - spy_change_pct, 2)
            item["change_pct"] = change_pct
            item["rs_spy"] = rs_spy
            item["rvol_15m"] = float(item.get("rvol_15m", 1.0))
            item["dist_52w"] = float(item.get("dist_52w", item.get("price_to_52w_high", 0.0)))
            enriched.append(item)
        return enriched

    # Backward compatibility wrapper
    def filter_stage2(self, stage1_stocks: List[Dict[str, Any]], spy_change_pct: float) -> List[Dict[str, Any]]:
        """Legacy Stage 2 compatibility method."""
        passed = []
        for s in stage1_stocks:
            stock_change = float(s.get("change_pct", 0.0))
            rs = round(stock_change - spy_change_pct, 2)
            if rs > 0.0:
                item = dict(s)
                item["rs_spy"] = rs
                passed.append(item)
        return passed

    def evaluate_momentum_lane(
        self,
        stocks: List[Dict[str, Any]],
        funnel: Optional[FunnelStageMetrics] = None
    ) -> List[Dict[str, Any]]:
        """
        Stage 2a: Evaluates MOMENTUM / Breakout lane.
        Hard Cutoffs:
        - change_pct >= +1.50% and <= +15.00%
        - rvol_15m >= 1.30
        - rs_spy > 0.0
        Scoring: 40% Norm(RS) + 35% Norm(RVOL) + 25% Norm(52W_Prox)
        """
        qualifying = []
        for s in stocks:
            symbol = str(s.get("symbol", "N/A"))
            change_pct = float(s.get("change_pct", 0.0))
            rvol = float(s.get("rvol_15m", 1.0))
            rs_spy = float(s.get("rs_spy", 0.0))
            dist_52w = float(s.get("dist_52w", 0.0))

            if change_pct < ScreenerConfig.MOM_MIN_CHANGE_PCT:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "LANE_MOMENTUM",
                        "reason": "CHANGE_PCT_BELOW_MOMENTUM_MIN",
                        "actual_value": change_pct,
                        "threshold": ScreenerConfig.MOM_MIN_CHANGE_PCT
                    })
                continue

            if change_pct > ScreenerConfig.MOM_MAX_CHANGE_PCT:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "LANE_MOMENTUM",
                        "reason": "CHANGE_PCT_ABOVE_MAX_CAP",
                        "actual_value": change_pct,
                        "threshold": ScreenerConfig.MOM_MAX_CHANGE_PCT
                    })
                continue

            if rvol < ScreenerConfig.MOM_MIN_RVOL:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "LANE_MOMENTUM",
                        "reason": "RVOL_BELOW_MOMENTUM_MIN",
                        "actual_value": rvol,
                        "threshold": ScreenerConfig.MOM_MIN_RVOL
                    })
                continue

            if rvol > ScreenerConfig.MOM_MAX_RVOL:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "LANE_MOMENTUM",
                        "reason": "RVOL_ABOVE_MOMENTUM_MAX",
                        "actual_value": rvol,
                        "threshold": ScreenerConfig.MOM_MAX_RVOL
                    })
                continue

            if rs_spy <= ScreenerConfig.MOM_MIN_RS_SPY:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "LANE_MOMENTUM",
                        "reason": "RS_SPY_NOT_POSITIVE",
                        "actual_value": rs_spy,
                        "threshold": ScreenerConfig.MOM_MIN_RS_SPY
                    })
                continue

            # Normalized Factor Scoring
            norm_rs = min(100.0, max(0.0, rs_spy * 10.0))
            norm_rvol = min(100.0, max(0.0, (rvol - 1.0) * 33.33))
            norm_52w = min(100.0, max(0.0, (1.0 + dist_52w) * 100.0))

            score = round(0.40 * norm_rs + 0.35 * norm_rvol + 0.25 * norm_52w, 1)

            item = dict(s)
            item["lane"] = LaneEnum.MOMENTUM.value
            item["lane_score"] = min(100.0, max(0.0, score))
            item["setup_metrics"] = None
            qualifying.append(item)

        qualifying.sort(key=lambda x: x["lane_score"], reverse=True)
        if funnel:
            funnel.lane_momentum_candidates = len(qualifying)
        return qualifying

    def evaluate_setup_lane(
        self,
        stocks: List[Dict[str, Any]],
        spy_change_pct: float,
        funnel: Optional[FunnelStageMetrics] = None
    ) -> List[Dict[str, Any]]:
        """
        Stage 2b: Evaluates SETUP / VCP / Wyckoff Accumulation lane.
        Hard Cutoffs:
        - -1.50% <= change_pct <= +1.50%
        - dist_52w >= -0.10 (within 10% of 52W High)
        - rvol_15m <= 1.10 (volume dry-up)
        Scoring: 40% Norm(52W_Prox) + 35% Norm(Tightness) + 25% Norm(RS_trend)
        """
        qualifying = []
        for s in stocks:
            symbol = str(s.get("symbol", "N/A"))
            change_pct = float(s.get("change_pct", 0.0))
            rvol = float(s.get("rvol_15m", 1.0))
            dist_52w = float(s.get("dist_52w", 0.0))

            if change_pct < ScreenerConfig.SETUP_MIN_CHANGE_PCT or change_pct > ScreenerConfig.SETUP_MAX_CHANGE_PCT:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "LANE_SETUP",
                        "reason": "CHANGE_PCT_NOT_CONSOLIDATING",
                        "actual_value": change_pct,
                        "threshold": ScreenerConfig.SETUP_MAX_CHANGE_PCT
                    })
                continue

            if dist_52w < ScreenerConfig.SETUP_MIN_52W_DIST:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "LANE_SETUP",
                        "reason": "52W_DISTANCE_TOO_FAR",
                        "actual_value": dist_52w,
                        "threshold": ScreenerConfig.SETUP_MIN_52W_DIST
                    })
                continue

            if rvol > ScreenerConfig.SETUP_MAX_RVOL:
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "LANE_SETUP",
                        "reason": "RVOL_TOO_HIGH_FOR_DRYUP",
                        "actual_value": rvol,
                        "threshold": ScreenerConfig.SETUP_MAX_RVOL
                    })
                continue

            # Normalized Factor Scoring
            norm_52w = min(100.0, max(0.0, (1.0 - abs(dist_52w) / 0.10) * 100.0))
            norm_tight = min(100.0, max(0.0, (1.0 - rvol / 1.10) * 100.0))
            norm_rs_trend = min(100.0, max(0.0, (change_pct - spy_change_pct + 2.0) * 25.0))

            score = round(0.40 * norm_52w + 0.35 * norm_tight + 0.25 * norm_rs_trend, 1)

            # Baseline setup metrics (enriched further if K-line available)
            setup_metrics = SetupMetrics(
                dist_to_52w_high_pct=round(abs(dist_52w) * 100.0, 2),
                bb_width=float(s.get("bb_width", 0.08)) if s.get("bb_width") is not None else None,
                atr_14_pct=float(s.get("atr_14_pct", 0.022)) if s.get("atr_14_pct") is not None else None,
                dry_volume_ratio=round(rvol, 2)
            )

            item = dict(s)
            item["lane"] = LaneEnum.SETUP.value
            item["lane_score"] = min(100.0, max(0.0, score))
            item["setup_metrics"] = setup_metrics
            qualifying.append(item)

        qualifying.sort(key=lambda x: x["lane_score"], reverse=True)
        if funnel:
            funnel.lane_setup_candidates = len(qualifying)
        return qualifying

    def enrich_kline_gate(
        self,
        momentum_candidates: List[Dict[str, Any]],
        setup_candidates: List[Dict[str, Any]],
        funnel: Optional[FunnelStageMetrics] = None,
        quote_ctx: Any = None
    ) -> List[WatchlistStock]:
        """
        Stage 3: Top-tier K-line enrichment gate with quota budgeting.
        Takes Top 3-5 candidates from each lane.
        Enforces strict quota tracker checks (100 symbols / 30 rolling days).
        """
        max_per_lane = ScreenerConfig.MAX_CANDIDATES_PER_LANE
        top_momentum = momentum_candidates[:max_per_lane]
        top_setup = setup_candidates[:max_per_lane]

        selected_candidates = []
        for c in top_momentum:
            selected_candidates.append(c)
        for c in top_setup:
            selected_candidates.append(c)

        final_stocks: List[WatchlistStock] = []
        kline_count = 0

        for item in selected_candidates:
            symbol = item["symbol"]

            # Quota Check & Record
            if not self.quota_tracker.can_request_symbol(symbol):
                logger.warning("Quota full. Skipping K-line enrichment for %s", symbol)
                if funnel:
                    funnel.dropped_reasons.append({
                        "symbol": symbol,
                        "stage": "KLINE_GATE",
                        "reason": "QUOTA_30D_EXHAUSTED",
                        "actual_value": None,
                        "threshold": 100.0
                    })
                continue

            try:
                self.quota_tracker.record_symbol_request(symbol)
                kline_count += 1
            except QuotaExceededError:
                logger.warning("Quota exceeded while adding %s", symbol)
                break

            # Build WatchlistStock model
            stock_obj = WatchlistStock(
                symbol=symbol,
                name=item.get("name", symbol),
                price=float(item["price"]),
                change_pct=float(item["change_pct"]),
                adv_20=float(item["adv_20"]),
                rs_spy=float(item["rs_spy"]),
                rvol_15m=float(item["rvol_15m"]),
                lane=item["lane"],
                lane_score=float(item["lane_score"]),
                setup_metrics=item.get("setup_metrics"),
                status="READY_FOR_ANALYSIS"
            )
            final_stocks.append(stock_obj)

        if funnel:
            funnel.kline_analyzed_count = kline_count
            funnel.final_watchlist_count = len(final_stocks)

        return final_stocks

    # Backward compatibility wrapper
    def filter_stage3(self, stage2_stocks: List[Dict[str, Any]], max_candidates: int = 15) -> List[WatchlistStock]:
        """Legacy Stage 3 compatibility method."""
        sorted_candidates = sorted(stage2_stocks, key=lambda x: x.get("rs_spy", 0.0), reverse=True)
        final_list: List[WatchlistStock] = []
        for item in sorted_candidates:
            if len(final_list) >= max_candidates:
                break
            symbol = item["symbol"]
            rvol_15m = float(item.get("rvol_15m", 1.0))
            if rvol_15m < 1.5:
                continue
            if not self.quota_tracker.can_request_symbol(symbol):
                continue
            try:
                self.quota_tracker.record_symbol_request(symbol)
                final_list.append(WatchlistStock(
                    symbol=symbol,
                    name=item.get("name", symbol),
                    price=float(item["price"]),
                    change_pct=float(item["change_pct"]),
                    adv_20=float(item["adv_20"]),
                    rs_spy=float(item["rs_spy"]),
                    rvol_15m=rvol_15m,
                    lane=LaneEnum.MOMENTUM.value,
                    lane_score=80.0,
                    setup_metrics=None,
                    status="READY_FOR_ANALYSIS"
                ))
            except QuotaExceededError:
                break
        return final_list

    def process_and_save(
        self,
        raw_stocks: List[Dict[str, Any]],
        spy_change_pct: float,
        timestamp: Optional[datetime] = None,
        market_status: str = "OPEN",
        is_live: bool = True,
        data_as_of: Optional[str] = None,
        source: str = "REAL",
        warning: Optional[str] = None,
        quote_ctx: Any = None,
        cloud_skipped_count: int = 0
    ) -> WatchlistOutput:
        """Runs the full hybrid multi-stage pipeline and writes watchlist.json atomically."""
        ts = timestamp or datetime.now(timezone.utc)
        effective_data_as_of = data_as_of or ts.isoformat()

        funnel = FunnelStageMetrics(
            cloud_raw_returned=len(raw_stocks) + cloud_skipped_count if source != "OPEND_UNAVAILABLE" else 0,
            cloud_skipped_incomplete=cloud_skipped_count if source != "OPEND_UNAVAILABLE" else 0
        )

        if source == "OPEND_UNAVAILABLE":
            watchlist_stocks = []
        else:
            # Stage 0: Coarse Quality Filter
            stage0 = self.filter_stage0_quality(raw_stocks, funnel)

            # Stage 1: Batch Snapshot Enrichment
            enriched = self.calculate_snapshot_metrics(stage0, spy_change_pct)

            # Stage 2: Dual-Lane Routing & Factor Scoring
            momentum_candidates = self.evaluate_momentum_lane(enriched, funnel)
            setup_candidates = self.evaluate_setup_lane(enriched, spy_change_pct, funnel)

            # Stage 3: Top-Tier K-Line Enrichment Gate
            watchlist_stocks = self.enrich_kline_gate(
                momentum_candidates,
                setup_candidates,
                funnel,
                quote_ctx=quote_ctx
            )

        quota_summary = self.quota_tracker.get_quota_summary(ts)
        quota_status = QuotaStatus(**quota_summary)

        output = WatchlistOutput(
            generated_at=ts.isoformat(),
            market_status=market_status,
            is_live=is_live,
            data_as_of=effective_data_as_of,
            source=source,
            warning=warning,
            funnel=funnel,
            watchlist=watchlist_stocks,
            quota_status=quota_status,
            total_screened_cloud=funnel.cloud_raw_returned,
            stage1_passed=funnel.stage0_quality_passed,
            stage2_passed=funnel.lane_momentum_candidates + funnel.lane_setup_candidates
        )

        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        temp_file = self.output_file.with_suffix(f".tmp.{ts.timestamp()}")
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(output.model_dump_json(indent=2))
        temp_file.replace(self.output_file)

        return output
