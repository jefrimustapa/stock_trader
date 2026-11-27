# Plan: Disentangle Watchlist Buy Candidates from Active Portfolio Monitoring in L1 (Rev 4)

Branch: fix/hom-406-watchlist-candidate-l1-tally
Issue: https://github.com/jefrimustapa/stock_trader/issues/34
Task: HOM-407 (Parent: HOM-406)
Status: waiting for approval (implementation NOT started)

## 1. Goal & Acceptance Criteria
- Goal: Align L1 pipeline and BLUEPRINT.md with pause_buying control so buying candidates are not analyzed when buying is paused, while active portfolio counters are always monitored.
- When pause_buying is active: Pipeline skips buy analysis for watchlist candidates and executes monitoring analysis only for active portfolio counters.
- When pause_buying is inactive: Pipeline analyzes watchlist buy candidates, and allows held counters with attractive screener setups to be considered for scaling in.
- When user opens `/agents`, user sees distinct counts: L0 Screener Buy Candidates (marked PAUSED when buying paused) and Active Portfolio Monitoring (held counters actively monitored).
- Blueprint mandate: Specifications officially committed to BLUEPRINT.md.

## 2. Files to Modify
- `BLUEPRINT.md`: Documented operational separation (Section 3.2.E), updated Rule 6/10 (Section 6.5) and UI spec (Section 6.6).
- `bridge/src/agent_pipeline.py`: Skip watchlist buy deliberation when pause_buying is active; enforce mandatory monitoring for held portfolio counters; allow scaling in when buying is active; remove arbitrary cap.
- `bridge/src/main.py`: Clarify periodic cycle execution for active portfolio monitoring vs buy simulation.
- `bridge/src/routes/agents.py`: Return explicit breakdown: `pause_buying`, `watchlist_candidates_count`, `monitored_positions_count`.
- `dashboard/src/pages/AgentsPage.jsx`: Display clear separate cards/chips for L0 Screener Buy Candidates and Active Portfolio Monitoring with pause indicator.
- `tests/test_watchlist_candidate_disentangle_bva.py`: Unit and BVA tests verifying pause_buying behavior and held position monitoring.

## 3. Technical Approach
1. Pause Buying Branching in `run_simulation_cycle`:
   - Check `is_buying_paused = self.get_pause_buying_status()`.
   - If `is_buying_paused` is True:
     - Do NOT load or deliberate on `watchlist.json` buy candidates.
     - MUST evaluate all active broker positions (`is_held: True`) for Exit Sentinel and threat analysis.
     - Record cycle with `watchlist_candidates=0` (or total vetted watchlist shown as paused) and `monitored_positions=len(active_positions)`.
   - If `is_buying_paused` is False:
     - Load vetted watchlist candidates (without arbitrary 10-cap).
     - If a held counter has an attractive setup in watchlist, allow buy evaluation (scale-in/add-on) according to risk rules.
2. Cycle Metrics Separation:
   - Explicit columns/fields: `watchlist_buy_candidates`, `monitored_positions`, `is_buying_paused`.
3. UI Alignment in `AgentsPage.jsx`:
   - Show L0 Screener card: "L0 SCREENER: Buy Candidates: 9 (PAUSED)" when paused.
   - Show Active Monitoring card: "Active Portfolio Monitoring: 17 Held Positions (ACTIVE)".
   - Eliminates misleading 26 candidate conflation.

## 4. Test Plan
- Boundary Value Analysis (BVA):
  * pause_buying = True: 9 watchlist + 17 held -> 0 buy deliberations, 17 held monitored deliberations.
  * pause_buying = False: 9 watchlist + 17 held -> 9 buy deliberations, 17 held monitored deliberations.
  * Held stock in watchlist when buying active: evaluates scale-in opportunity without duplicate order IDs.
  * Watchlist > 10 candidates: loads full screener output without arbitrary truncation at 10.
- E2E Test:
  * Run cycle with pause_buying=1; verify activity API returns 17 monitored held positions and 0 buy rejections.
  * Verify AgentsPage renders distinct L0 Screener (Paused) and Active Portfolio Watch badges.

## 5. Risks & Non-Goals
- Non-Goals: Modifying Exit Sentinel formula (Stop Loss, TP1 50%, Chandelier Trailing).
- Risk: UI regressions on mobile viewports.
- Mitigation: Responsive flex layout for candidate and monitoring badges.
