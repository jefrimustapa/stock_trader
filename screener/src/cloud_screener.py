import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional

from .schemas import WatchlistOutput, WatchlistStock, QuotaStatus
from .quota_tracker import QuotaTracker, QuotaExceededError

logger = logging.getLogger(__name__)


class CloudScreener:
    """
    Executes multi-stage L0 market screening.
    Stage 1: Server-side cloud filter (Price >= $5.00, Cap >= $500M, ADV20 >= 1M, Change 2-12%).
    Stage 2: Relative Strength vs SPY (RS > 0).
    Stage 3: Dynamic Volume Breakout (RVOL >= 1.5) with strict K-line quota check.
    """

    def __init__(self, quota_tracker: QuotaTracker, output_file: Path):
        self.quota_tracker = quota_tracker
        self.output_file = output_file

    def filter_stage1(self, raw_stocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Stage 1: Apply baseline quantitative filters."""
        passed = []
        for s in raw_stocks:
            price = float(s.get("price", 0.0))
            cap = float(s.get("market_cap", 0.0))
            adv20 = float(s.get("adv_20", 0.0))
            change_pct = float(s.get("change_pct", 0.0))

            # Rules: Price >= 5.00, Cap >= 500M, ADV20 >= 1,000,000, Change between +2% and +12%
            if price >= 5.0 and cap >= 500_000_000 and adv20 >= 1_000_000 and 2.0 <= change_pct <= 12.0:
                passed.append(s)
        return passed

    def filter_stage2(self, stage1_stocks: List[Dict[str, Any]], spy_change_pct: float) -> List[Dict[str, Any]]:
        """Stage 2: Relative Strength vs SPY (RS = Stock Change % - SPY Change % > 0)."""
        passed = []
        for s in stage1_stocks:
            stock_change = float(s.get("change_pct", 0.0))
            rs = round(stock_change - spy_change_pct, 2)
            if rs > 0.0:
                item = dict(s)
                item["rs_spy"] = rs
                passed.append(item)
        return passed

    def filter_stage3(self, stage2_stocks: List[Dict[str, Any]], max_candidates: int = 15) -> List[WatchlistStock]:
        """
        Stage 3: Volume breakout confirmation.
        Ensures K-line quota safety via QuotaTracker before advancing candidate.
        """
        # Sort primarily by Relative Strength descending
        sorted_candidates = sorted(stage2_stocks, key=lambda x: x.get("rs_spy", 0.0), reverse=True)
        final_list: List[WatchlistStock] = []

        for item in sorted_candidates:
            if len(final_list) >= max_candidates:
                break

            symbol = item["symbol"]
            rvol_15m = float(item.get("rvol_15m", 1.0))

            if rvol_15m < 1.5:
                continue

            # Verify and record quota usage for K-line check
            if not self.quota_tracker.can_request_symbol(symbol):
                logger.warning("Quota full. Skipping K-line enrichment for %s", symbol)
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
                    status="READY_FOR_ANALYSIS"
                ))
            except QuotaExceededError:
                logger.warning("Quota exceeded while adding %s to watchlist", symbol)
                break

        return final_list

    def process_and_save(
        self,
        raw_stocks: List[Dict[str, Any]],
        spy_change_pct: float,
        timestamp: Optional[datetime] = None
    ) -> WatchlistOutput:
        """Runs the full pipeline, updates SQLite quota, and writes watchlist.json."""
        ts = timestamp or datetime.now(timezone.utc)
        total_cloud = len(raw_stocks)

        stage1 = self.filter_stage1(raw_stocks)
        stage2 = self.filter_stage2(stage1, spy_change_pct)
        watchlist_stocks = self.filter_stage3(stage2)

        quota_summary = self.quota_tracker.get_quota_summary(ts)
        quota_status = QuotaStatus(**quota_summary)

        output = WatchlistOutput(
            generated_at=ts.isoformat(),
            total_screened_cloud=total_cloud,
            stage1_passed=len(stage1),
            stage2_passed=len(stage2),
            watchlist=watchlist_stocks,
            quota_status=quota_status
        )

        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        temp_file = self.output_file.with_suffix(".tmp")
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(output.model_dump_json(indent=2))
        temp_file.replace(self.output_file)

        return output
